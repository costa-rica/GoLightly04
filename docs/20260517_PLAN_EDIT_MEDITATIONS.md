---
created_at: 2026-05-17
updated_at: 2026-05-17
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Plan: Show Script + Edit/Regenerate Meditation

## Context

Today the meditation details modal (`web/src/components/modals/ModalMeditationDetails.tsx`) only shows title / description / visibility. The DB stores both `meditation_array` (JSONB — what the worker consumes) and `script_source` (TEXT, the human-readable form), but `script_source` is only populated when the meditation was created via script mode. Spreadsheet-mode meditations have no readable script anywhere.

We want the modal to **always** show the script in a textarea (regardless of how the meditation was originally created) and let the owner edit it. Saving an edited script should delete the old generated audio + job rows and re-run the create-meditation pipeline.

**No DB restructuring is needed.** `meditation_array` is the canonical execution form; `script_source` is human-readable. Both are useful. We just need (a) a serializer that converts `meditation_array → script` for display when `script_source` is null, and (b) an edit endpoint that re-runs the existing create pipeline.

User-confirmed decisions:
1. **Serialize on the fly** — no migration / backfill. `mapMeditationRecord` falls back to a serializer when `scriptSource` is null.
2. **`sourceMode` flips to `"script"`** after any script-based edit.
3. **Separate "Save & Regenerate" button** in the modal, distinct from the existing "Update" (which keeps handling metadata only).

## Implementation

### Phase 1 — Serializer (shared-types)

Extend [scriptParser.ts](../shared-types/src/scriptParser.ts) with:

```
serializeMeditationElementsToScript(
  elements: MeditationElement[],
  soundFilenameToName: (filename: string) => string | null,
): string
```

Rules — must round-trip with `parseMeditationScript`:
- **Text** → emit verbatim. If `speed` is a finite number, wrap as `{speed=X}text{/speed}` per element (don't try to coalesce adjacent same-speed elements; semantically equivalent and avoids speed-stack reconstruction).
- **Pause** → `<break time="Xs"/>` using numeric `pause_duration`. If invalid/out of range, skip the element.
- **Sound** → look up `soundFilenameToName(element.sound_file)`. If found, emit `[Name]`. If not, emit `[unknown sound: <filename>]` so the user sees the breakage and the round-trip parse fails clearly.
- Join with `\n\n`.

**Known information loss (call out in JSDoc and surface in the UI):** `voice_id` has no script representation. Spreadsheet meditations that used per-element voices will collapse to the default voice the moment the user saves the script.

### Phase 2 — Refactor existing services

**Extract file cleanup** — new file `api/src/services/meditations/meditationFileCleanup.ts`:
- Move `deleteMatchingFiles` out of [deleteMeditationCascade.ts](../api/src/services/meditations/deleteMeditationCascade.ts).
- Export `deleteMeditationAudioFiles(meditationId)` that wipes `el_<id>_*.mp3` from `eleven_labs_audio_files/` and `meditation_<id>.mp3` from `meditation_soundfiles/`.
- Update `deleteMeditationCascade` to call the new helper.

**Extract JobQueue replacement** from [createMeditationFromElements.ts](../api/src/services/meditations/createMeditationFromElements.ts):
- Pull the `deriveType` + per-element `JobQueue.create` loop into an exported helper `replaceMeditationElements({ meditationId, elements }, transaction)` that first destroys existing `JobQueue` rows for `meditationId`, then creates fresh ones using the same status/filePath/inputData rules (text=pending, sound/pause=complete with prerecorded paths).
- `createMeditationFromElements` now creates the `Meditation` row then calls `replaceMeditationElements`. No behavioral change to the create path.

### Phase 3 — Regenerate service

New file `api/src/services/meditations/regenerateMeditationFromScript.ts` exporting `regenerateMeditationFromScript({ meditationId, script })`:

1. Load meditation (404 if missing).
2. Reject with `AppError(409, "MEDITATION_BUSY")` if `status === "processing"` — avoids racing the worker.
3. Validate `Buffer.byteLength(script, "utf8") <= SCRIPT_MAX_BYTES`.
4. `SoundFile.findAll()`, build lowercase-name lookup (same pattern as [meditations.ts:118-122](../api/src/routes/meditations.ts)). Call `parseMeditationScript`. On `!ok`, throw `AppError(400, "SCRIPT_PARSE_ERROR", ..., parseResult.errors)`.
5. In a transaction:
   - Reload meditation with row lock.
   - Update columns: `meditationArray` (re-sequenced like the create service does), `scriptSource = script`, `sourceMode = "script"`, `filename = null`, `filePath = null`, `status = "pending"`.
   - Call `replaceMeditationElements({ meditationId, elements: parseResult.elements }, transaction)`.
6. After commit: `await deleteMeditationAudioFiles(meditationId)` (best-effort, matches `deleteMeditationCascade`'s pattern).
7. Return the updated meditation.

### Phase 4 — API route + mapper fallback

In [meditations.ts](../api/src/routes/meditations.ts):

**Update `mapMeditationRecord`** — accept an optional `soundFilenameToName` in options and compute:
```
scriptSource: meditation.scriptSource ?? serializeMeditationElementsToScript(
  meditation.meditationArray,
  options.soundFilenameToName ?? (() => null),
)
```

In every route that calls `mapMeditationRecord` (`GET /all`, `GET /:id`, `PATCH /update/:id`, both POST creates, and the new PUT below), fetch `SoundFile.findAll()` once at the top of the handler and build a `filename → name` Map. For `GET /all`, reuse the single lookup across all meditations being mapped — no N+1.

**New route** `PUT /:id/script`:
- `requireAuth`; owner-only (mirror `PATCH /update/:id`'s check at [meditations.ts:301](../api/src/routes/meditations.ts) — admins do NOT bypass).
- Body: `{ script: string }`; validate length.
- Call `regenerateMeditationFromScript({ meditationId, script })`.
- `void notifyWorker(updated.id, "intake")` (same fire-and-forget pattern as the create routes).
- Respond `{ message, meditation: mapMeditationRecord(updated, { isOwned: true, soundFilenameToName }) }`.

Add shared types in [meditation.ts](../shared-types/src/meditation.ts): `RegenerateMeditationRequest = { script: string }`, `RegenerateMeditationResponse = { message: string; meditation: Meditation }`.

### Phase 5 — Web client

Find the page that mounts `ModalMeditationDetails` (`grep -rn ModalMeditationDetails web/src`) and the slice at `web/src/store/features/meditationSlice.ts`. Add a `regenerateScript(id, script)` thunk/fetch that PUTs `/meditations/:id/script` and updates the meditation in store. Thread an `onRegenerateScript: (id, script) => Promise<void>` prop into the modal.

### Phase 6 — Modal UI

In [ModalMeditationDetails.tsx](../web/src/components/modals/ModalMeditationDetails.tsx):

- New state: `script` (seeded from `meditation.scriptSource ?? ""` in the existing `useEffect`), `isRegenerating`, `regenerateError`. Derived `isScriptDirty` and `isProcessing` (status pending/processing).
- New `<textarea rows={12}>` below description (monospaced), `disabled={!isEditing || isRegenerating || isProcessing}`.
- Helper text: "Edit and choose 'Save & Regenerate' to rebuild the audio. Regenerating replaces the existing audio and may take a few minutes."
- If `sourceMode === "spreadsheet"` and any element in `meditationArray` has a `voice_id`, show an info note: "This meditation originally used multiple voices. Saving the script will collapse it to the default voice."
- New **"Save & Regenerate"** button, owner-only, shown alongside Update:
  - `disabled={!isScriptDirty || isRegenerating || isUpdating || isDeleting || isProcessing}`
  - Confirms ("This will delete the existing audio and rebuild from your edited script. Continue?") then calls `onRegenerateScript`.
- Existing "Update" button keeps its current scope (title/description/visibility only — does NOT touch script).

### Phase 7 — Tests

Extend [meditations.routes.test.ts](../api/tests/meditations/meditations.routes.test.ts):

1. **GET serializes script when null** — record with `scriptSource: null` + mixed `meditationArray` returns a non-null `scriptSource` that round-trips through `parseMeditationScript`.
2. **PUT /:id/script happy path** — `Meditation.update` called with `sourceMode="script"`, `status="pending"`, `filename=null`, `filePath=null`, new `scriptSource`; `JobQueue.destroy` then `JobQueue.create` per element with expected status; `notifyWorker(id, "intake")` called; `deleteMeditationAudioFiles` called (mock the module).
3. **Non-owner → 403**, no DB writes.
4. **Malformed script → 400 `SCRIPT_PARSE_ERROR`** with `errors` array.
5. **Status processing → 409 `MEDITATION_BUSY`**.
6. **Oversize script → 400 `VALIDATION_ERROR`**.

Add unit tests for `serializeMeditationElementsToScript` covering text, pause, sound (found + missing), speed wrap, mixed-order round-trip, and `voice_id` drop.

## Critical files

- [shared-types/src/scriptParser.ts](../shared-types/src/scriptParser.ts) — add serializer
- [shared-types/src/meditation.ts](../shared-types/src/meditation.ts) — new request/response types
- [api/src/routes/meditations.ts](../api/src/routes/meditations.ts) — mapper fallback + new PUT route
- [api/src/services/meditations/createMeditationFromElements.ts](../api/src/services/meditations/createMeditationFromElements.ts) — extract `replaceMeditationElements`
- [api/src/services/meditations/deleteMeditationCascade.ts](../api/src/services/meditations/deleteMeditationCascade.ts) — use shared cleanup
- `api/src/services/meditations/meditationFileCleanup.ts` (new) — shared FS cleanup
- `api/src/services/meditations/regenerateMeditationFromScript.ts` (new) — regenerate service
- [web/src/components/modals/ModalMeditationDetails.tsx](../web/src/components/modals/ModalMeditationDetails.tsx) — script textarea + button
- `web/src/store/features/meditationSlice.ts` — `regenerateScript` thunk
- [api/tests/meditations/meditations.routes.test.ts](../api/tests/meditations/meditations.routes.test.ts) — coverage

## Reuse (don't duplicate)

- `parseMeditationScript` and `SCRIPT_MAX_BYTES` from shared-types
- SoundFile lookup pattern from [meditations.ts:118-122](../api/src/routes/meditations.ts)
- `normalizeSpeed` / `normalizePauseDuration` from `api/src/services/meditations/normalize.ts` (already used in `createMeditationFromElements`)
- `notifyWorker(id, "intake")` from `api/src/services/workerClient.ts`
- `deleteMatchingFiles` glob pattern from current `deleteMeditationCascade.ts`

## Verification

1. Start API, worker, web dev servers.
2. As user A, create a meditation via the spreadsheet flow with text + pause + sound elements. Wait for `status=complete`.
3. Open the details modal. Confirm the new Script textarea shows a serialized script (text on its own line, `<break time="Xs"/>`, `[Sound Name]`).
4. Click Edit, modify some text, add `<break time="3s"/>`, click Save & Regenerate, confirm.
5. Confirm the meditation card shows a regenerating state (status→pending); worker logs show jobs processing.
6. After completion: reopen modal — script reflects the edit; `el_<oldId>_*.mp3` files are gone; new `meditation_<id>.mp3` exists.
7. As user B (non-owner) open the same public meditation: no Edit button.
8. `curl PUT /:id/script` with malformed script → 400 + `SCRIPT_PARSE_ERROR`.
9. While a regenerate is mid-flight (`status=processing`), attempt a second PUT → 409 `MEDITATION_BUSY`.
10. Run `npm test` in `api/` and `shared-types/` — all new tests pass.

## Known limitations to communicate

- **`voice_id` is dropped on save** (script syntax has no voice token). Modal shows a yellow note when this would happen.
- **Sound rename/delete breaks the script.** If a SoundFile referenced by an element has been deleted, the serializer emits `[unknown sound: <filename>]`; the user must replace it before save will succeed.
- **Speed grouping isn't preserved** — `{speed=0.9}foo bar baz{/speed}` round-trips as three per-element speed wrappers (semantically identical, textually noisier).
- **Best-effort FS cleanup** — matches current `deleteMeditationCascade` behavior; failures are swallowed and any orphan shards get swept by the next regenerate/delete.
