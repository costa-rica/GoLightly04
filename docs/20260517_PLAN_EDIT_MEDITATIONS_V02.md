---
created_at: 2026-05-17
updated_at: 2026-05-17
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Plan v02: Show Script + Edit/Regenerate + Pending-Visibility

This revision incorporates the Codex assessment ([20260517_PLAN_EDIT_MEDITATIONS_ASSESSMENT_CODEX.md](20260517_PLAN_EDIT_MEDITATIONS_ASSESSMENT_CODEX.md)) and adds a new phase covering in-flight (pending/processing) meditation visibility.

## Context

Two related problems:

1. **No editable script in the modal.** The details modal only shows title / description / visibility. The DB stores `meditation_array` (JSONB, what the worker consumes) and `script_source` (TEXT, human-readable). `script_source` is only populated for script-mode creations. We want the modal to always show the script and let the owner edit + regenerate.

2. **The list shows non-complete meditations as if they were playable.** After a create (and after the new regenerate flow), the meditation appears in the list immediately with `status=pending`/`processing` and `filePath=null`. Clicking play fails or shows nothing. Same bug will reappear with regenerate.

We're fixing both in one change because regenerate would otherwise ship a fresh regression on the same code path.

**No DB restructuring is needed.** `meditation_array` is canonical for execution; `script_source` is human-readable. We just need (a) a serializer for `meditation_array → script` when `script_source` is null, (b) an edit endpoint that re-runs the create pipeline atomically, and (c) status-aware list rendering.

User-confirmed decisions:
1. **Serialize on the fly** — no migration. `mapMeditationRecord` falls back when `scriptSource` is null.
2. **`sourceMode` flips to `"script"`** after any script-based edit.
3. **Separate "Save & Regenerate" button** in the modal, distinct from "Update" (which keeps handling metadata only).
4. **Owner sees a placeholder card** for in-flight meditations; non-owners don't see them at all until `status="complete"`.
5. **Client-side polling** drives the owner's placeholder → playable transition.

## Implementation

### Phase 1 — Serializer (shared-types)

Extend [scriptParser.ts](../shared-types/src/scriptParser.ts) with:

```
serializeMeditationElementsToScript(
  elements: MeditationElement[],
  soundFilenameToName: (filename: string) => string | null,
): string
```

Rules — must round-trip semantically with `parseMeditationScript`:
- **Text** → emit verbatim. If `speed` is a finite number, wrap as `{speed=X}text{/speed}` per element (don't coalesce adjacent same-speed elements; semantically equivalent and avoids speed-stack reconstruction).
- **Pause** → `<break time="Xs"/>` using numeric `pause_duration`. Skip if invalid/out of range.
- **Sound** → look up `soundFilenameToName(element.sound_file)`. If found, emit `[Name]`. If not, emit `[unknown sound: <filename>]` — round-trip parse will fail clearly so the user knows to fix it.
- Join with `\n\n`.

**JSDoc must document:** `voice_id` has no script representation; spreadsheet meditations that used per-element voices will collapse to the default voice after a script edit.

### Phase 2 — Refactor existing services

**Extract file cleanup** — new file `api/src/services/meditations/meditationFileCleanup.ts`:
- Move `deleteMatchingFiles` out of [deleteMeditationCascade.ts](../api/src/services/meditations/deleteMeditationCascade.ts).
- Export `deleteMeditationAudioFiles(meditationId)` that wipes `el_<id>_*.mp3` from `eleven_labs_audio_files/` and `meditation_<id>.mp3` from `meditation_soundfiles/`.
- Update `deleteMeditationCascade` to call the new helper.

**Extract JobQueue replacement** from [createMeditationFromElements.ts](../api/src/services/meditations/createMeditationFromElements.ts):
- Pull `deriveType` + the per-element `JobQueue.create` loop into an exported helper `replaceMeditationElements({ meditationId, elements }, transaction)` that first destroys existing `JobQueue` rows for `meditationId`, then creates fresh ones (text=pending, sound/pause=complete with prerecorded paths).
- `createMeditationFromElements` now creates the `Meditation` row then calls `replaceMeditationElements`. No behavioral change to the create path.

**Fix worker voice key mismatch** (raised by Codex §3) — the create service currently writes `voice_id` to `JobQueue.inputData` but the worker reads `voiceId` at [processMeditation.ts:126](../worker-node/src/processor/processMeditation.ts). Per-element voices are silently dropped today.
- Lower-risk fix: update the worker to accept both keys: `inputData.voiceId ?? inputData.voice_id`.
- Do this in the same change because `replaceMeditationElements` would otherwise codify the bug.

### Phase 3 — Regenerate service (atomic, race-safe)

New file `api/src/services/meditations/regenerateMeditationFromScript.ts` exporting `regenerateMeditationFromScript({ meditationId, script })`:

1. **Fast-path status check** (outside transaction): load meditation; if `status !== "complete" && status !== "failed"`, throw `AppError(409, "MEDITATION_BUSY")`. (Codex §2: regenerate is allowed only from `complete` or `failed`.)
2. Validate `Buffer.byteLength(script, "utf8") <= SCRIPT_MAX_BYTES`.
3. `SoundFile.findAll()`, build lowercase-name lookup (same pattern as [meditations.ts:118-122](../api/src/routes/meditations.ts)). Call `parseMeditationScript`. On `!ok`, throw `AppError(400, "SCRIPT_PARSE_ERROR", ..., parseResult.errors)`.
4. **Transaction (the critical replace operation is atomic):**
   - Reload meditation `{ transaction, lock: LOCK.UPDATE }`.
   - **Recheck status under the lock** — if `status !== "complete" && status !== "failed"`, throw `MEDITATION_BUSY`. (Codex §1: closes the race where the worker picks up the meditation between the fast-path check and the transaction.)
   - **Also reject if any `JobQueue` row for this meditation has `status="processing"`** (extra guard against a partially-claimed meditation).
   - Update meditation columns: `meditationArray` (re-sequenced), `scriptSource = script`, `sourceMode = "script"`, `filename = null`, `filePath = null`, `status = "pending"`.
   - Call `replaceMeditationElements({ meditationId, elements: parseResult.elements }, transaction)`.
5. **After commit:** `await deleteMeditationAudioFiles(meditationId)` (best-effort; matches `deleteMeditationCascade`).
6. **Only after cleanup completes**, the caller (route) invokes `notifyWorker(id, "intake")`. Service returns the updated meditation; the route owns worker notification. (Codex §"Suggested implementation adjustment" items 3–4.)

### Phase 4 — API: mapper fallback + new route

**Sound lookup helper** (Codex §5): add `buildSoundFilenameToNameLookup(soundFiles)` in `api/src/services/meditations/soundLookup.ts` (or a similar location). Centralizes the `filename → name` Map construction.

**Update `mapMeditationRecord`** in [meditations.ts](../api/src/routes/meditations.ts) — accept an optional `soundFilenameToName` in options:
```
scriptSource: meditation.scriptSource ?? serializeMeditationElementsToScript(
  meditation.meditationArray,
  options.soundFilenameToName ?? (() => null),
)
```

Pass a real lookup only in routes that need it in the response: `GET /all`, `GET /:id`, `PATCH /update/:id`, and the new `PUT /:id/script`. POST creates can skip the lookup — they return a minimal `{ queueId, filePath }` payload, not a mapped meditation. For `GET /all`, fetch SoundFile rows exactly once and reuse the lookup across the loop (no N+1).

**New route `PUT /:id/script`:**
- `requireAuth`; owner-only (admins do NOT bypass — mirror `PATCH /update/:id`).
- Body: `{ script: string }`; validate length.
- `const updated = await regenerateMeditationFromScript({ meditationId, script })`.
- `void notifyWorker(updated.id, "intake")`.
- Respond `{ message, meditation: mapMeditationRecord(updated, { isOwned: true, soundFilenameToName }) }`.

**Shared types** in [meditation.ts](../shared-types/src/meditation.ts):
- `RegenerateMeditationRequest = { script: string }`
- `RegenerateMeditationResponse = { message: string; meditation: Meditation }`

### Phase 5 — In-flight meditation visibility (NEW)

**API — `GET /all` filtering** in [meditations.ts](../api/src/routes/meditations.ts):

Change the `where` clause so non-owners only see `complete` meditations, while the authenticated user sees their own at any status:

```
where = req.user
  ? {
      [Op.or]: [
        { visibility: "public", status: "complete" },
        { userId: req.user.id },
      ],
    }
  : { visibility: "public", status: "complete" };
```

`GET /:id` keeps current behavior — direct fetch of a specific id by a non-owner is allowed but the existing `if (!meditation.filePath)` 409 guard on `/:id/stream` already prevents playback.

**Web — placeholder rendering** in the page that mounts the list (find via `grep -rn "ModalMeditationDetails\|meditation.*list\|MeditationCard" web/src`):
- For owned meditations with `status` in `["pending", "processing"]`:
  - Render a card with the title, a spinner, and the copy: "Your meditation will be ready shortly…"
  - Disable the play button; hide the favorite/share affordances; keep delete (so the user can cancel a stuck job).
  - For `status === "failed"`, show an error state: "Generation failed. Edit or delete to try again." The details modal still opens so the user can edit the script and retry.
- For non-owned meditations, no change — they only ever arrive when `complete` thanks to the API filter.

**Web — polling** in `web/src/store/features/meditationSlice.ts` (or the page that owns the list):
- After mount + after every create/regenerate, derive `hasInFlight = meditations.some(m => m.isOwned && (m.status === "pending" || m.status === "processing"))`.
- If `hasInFlight`, start a `setInterval` (5s) that refetches `GET /all` and re-dispatches the result; clear when `!hasInFlight`.
- Use a `useEffect` cleanup to avoid leaks on route change.
- Cap the loop at a reasonable max (e.g., 5 min) and fall back to manual refresh prompt if it doesn't complete — protects against an indefinitely stuck worker.

**Modal — disable Save & Regenerate while in-flight:**
Already covered in Phase 6 (`isProcessing` includes both pending and processing). No new logic needed here — the visibility phase reuses the same flag.

### Phase 6 — Modal UI

In [ModalMeditationDetails.tsx](../web/src/components/modals/ModalMeditationDetails.tsx):

- New state: `script` (seeded from `meditation.scriptSource ?? ""` in the existing `useEffect`), `isRegenerating`, `regenerateError`. Derived `isScriptDirty` and `isProcessing` (status pending OR processing).
- New `<textarea rows={12}>` below description (monospaced), `disabled={!isEditing || isRegenerating || isProcessing}`.
- Helper text: "Edit and choose 'Save & Regenerate' to rebuild the audio. Regenerating replaces the existing audio and may take a few minutes."
- If `sourceMode === "spreadsheet"` and any element in `meditationArray` has a `voice_id`, show an info note: "This meditation originally used multiple voices. Saving the script will collapse it to the default voice."
- New **"Save & Regenerate"** button, owner-only, shown alongside Update:
  - `disabled={!isScriptDirty || isRegenerating || isUpdating || isDeleting || isProcessing}`
  - Confirms ("This will delete the existing audio and rebuild from your edited script. Continue?") then calls `onRegenerateScript`.
- Existing "Update" button keeps its current scope (title/description/visibility only).

### Phase 7 — Web client wiring

In `web/src/store/features/meditationSlice.ts` (and the page that mounts the modal):
- Add a `regenerateScript(id, script)` thunk that PUTs `/meditations/:id/script` and dispatches an update of the meditation in store.
- Thread `onRegenerateScript: (id, script) => Promise<void>` into `ModalMeditationDetails`.
- Add the polling effect described in Phase 5.

### Phase 8 — Tests

**Serializer unit tests** (shared-types):
- Round-trip via parser: serialize elements → parse → assert equivalent element types, order, text, sounds, pauses, speed values (Codex §4 — don't compare raw text).
- Coverage: plain text, pause, sound (found + missing), speed-wrapped text, mixed-order, `voice_id` dropped.

**API route tests** in [meditations.routes.test.ts](../api/tests/meditations/meditations.routes.test.ts):

1. `GET /:id` — meditation with `scriptSource: null` and mixed `meditationArray` returns a non-null `scriptSource` that round-trips.
2. `GET /all` — non-authenticated user receives only `visibility=public AND status=complete`; authenticated user receives their own at any status plus other users' complete+public.
3. `PUT /:id/script` happy path — `Meditation.update` called with `sourceMode="script"`, `status="pending"`, `filename=null`, `filePath=null`, new `scriptSource`; `JobQueue.destroy` then `JobQueue.create` per element with expected status; `deleteMeditationAudioFiles` called (mock the module); `notifyWorker(id, "intake")` called **after** cleanup.
4. Non-owner → 403, no DB writes.
5. Malformed script → 400 `SCRIPT_PARSE_ERROR` with `errors` array.
6. **Race guards (Codex §1, §2):**
   - Status `processing` → 409 `MEDITATION_BUSY` (fast-path).
   - Status `pending` → 409 `MEDITATION_BUSY` (fast-path).
   - Status `complete` but transaction-time recheck sees `processing` → 409. (Simulate via a `Meditation.findByPk` mock that returns different values on the two calls.)
   - Status `complete` but a `JobQueue` row exists with `status=processing` → 409.
7. Oversize script → 400 `VALIDATION_ERROR`.

**Worker voice-key compatibility test** in worker tests: `inputData.voiceId` and `inputData.voice_id` both reach `generateSpeech`.

## Critical files

- [shared-types/src/scriptParser.ts](../shared-types/src/scriptParser.ts) — add serializer
- [shared-types/src/meditation.ts](../shared-types/src/meditation.ts) — new request/response types
- [api/src/routes/meditations.ts](../api/src/routes/meditations.ts) — mapper fallback, new PUT route, `GET /all` filter
- [api/src/services/meditations/createMeditationFromElements.ts](../api/src/services/meditations/createMeditationFromElements.ts) — extract `replaceMeditationElements`
- [api/src/services/meditations/deleteMeditationCascade.ts](../api/src/services/meditations/deleteMeditationCascade.ts) — use shared cleanup
- `api/src/services/meditations/meditationFileCleanup.ts` (new) — shared FS cleanup
- `api/src/services/meditations/regenerateMeditationFromScript.ts` (new) — regenerate service with locked recheck
- `api/src/services/meditations/soundLookup.ts` (new) — `buildSoundFilenameToNameLookup`
- [worker-node/src/processor/processMeditation.ts](../worker-node/src/processor/processMeditation.ts) — accept `voiceId` and `voice_id`
- [web/src/components/modals/ModalMeditationDetails.tsx](../web/src/components/modals/ModalMeditationDetails.tsx) — script textarea + button
- `web/src/store/features/meditationSlice.ts` — `regenerateScript` thunk + polling
- Web list page (TBD via grep) — placeholder card for in-flight owned meditations
- [api/tests/meditations/meditations.routes.test.ts](../api/tests/meditations/meditations.routes.test.ts) — coverage

## Reuse (don't duplicate)

- `parseMeditationScript`, `SCRIPT_MAX_BYTES` from shared-types
- SoundFile lookup pattern from [meditations.ts:118-122](../api/src/routes/meditations.ts) (now wrapped in `buildSoundFilenameToNameLookup`)
- `normalizeSpeed` / `normalizePauseDuration` from `api/src/services/meditations/normalize.ts`
- `notifyWorker(id, "intake")` from `api/src/services/workerClient.ts`

## Verification

1. Start API, worker, web dev servers.
2. As user A, create a meditation via spreadsheet flow with text + pause + sound elements.
3. Immediately observe the list: meditation appears with a placeholder card "Your meditation will be ready shortly…" and no play button. Open another browser as user B — meditation does NOT appear in user B's list.
4. Wait. Polling refreshes the list; placeholder transitions to a normal playable card once `status=complete`. Verify user B's list now shows it.
5. Open the details modal. Script textarea is populated by the serializer (text on its own line, `<break time="Xs"/>`, `[Sound Name]`).
6. Click Edit, modify text, add `<break time="3s"/>`, click Save & Regenerate, confirm.
7. List immediately shows the placeholder again (regenerate sets status=pending). Polling resumes; non-owner browser stops seeing the meditation until it's complete again.
8. After completion: reopen modal — script reflects the edit; `el_<oldId>_*.mp3` files are gone; new `meditation_<id>.mp3` exists.
9. As user B, attempt `PUT /:id/script` via curl on user A's meditation → 403.
10. `curl PUT /:id/script` with malformed script → 400 + `SCRIPT_PARSE_ERROR`.
11. While a regenerate is mid-flight (`status=processing`), attempt another PUT → 409 `MEDITATION_BUSY`.
12. Per-element voice test: create a meditation via spreadsheet with a custom `voice_id` set on one element. After the worker fix, verify the generated audio uses that voice (listen / inspect ElevenLabs request logs).
13. Run `npm test` in `api/`, `worker-node/`, and `shared-types/` — all new tests pass.

## Known limitations to communicate

- **`voice_id` is dropped on save** — script syntax has no voice token. Modal shows a yellow note when this would matter.
- **Sound rename/delete breaks the script.** Serializer emits `[unknown sound: <filename>]`; user must fix before regenerate succeeds.
- **Speed grouping isn't preserved** — round-trips as per-element wrappers (semantically identical, textually noisier).
- **Best-effort FS cleanup** — matches existing `deleteMeditationCascade`; failures are swallowed.
- **Polling cap** — if a meditation stays in flight beyond the polling window (e.g., worker stuck), the placeholder remains until manual refresh. The card's status display surfaces `failed` once the worker marks it.
