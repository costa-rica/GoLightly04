---
created_at: 2026-05-17
updated_at: 2026-05-17
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Plan v03: Show Script + Edit/Regenerate + Pending-Visibility

This revision incorporates the v02 Codex assessment ([20260517_PLAN_EDIT_MEDITATIONS_V02_ASSESSMENT_CODEX.md](20260517_PLAN_EDIT_MEDITATIONS_V02_ASSESSMENT_CODEX.md)) — applying the in-flight visibility rule consistently at single-meditation endpoints, not only at `GET /all`. Previous diffs from v01 are preserved.

## Context

Two related problems:

1. **No editable script in the modal.** The details modal only shows title / description / visibility. The DB stores `meditation_array` (JSONB, what the worker consumes) and `script_source` (TEXT, human-readable). `script_source` is only populated for script-mode creations. We want the modal to always show the script and let the owner edit + regenerate.

2. **The list shows non-complete meditations as if they were playable.** After a create (and after the new regenerate flow), the meditation appears in the list immediately with `status=pending`/`processing` and `filePath=null`. Clicking play fails or shows nothing. Same bug will reappear with regenerate. Also, a non-owner with a direct id can today fetch the in-flight meditation's metadata (title, description, `meditationArray`, serialized script).

We're fixing both in one change because regenerate would otherwise ship a fresh regression on the same code path.

**No DB restructuring is needed.** `meditation_array` is canonical for execution; `script_source` is human-readable. We just need (a) a serializer for `meditation_array → script` when `script_source` is null, (b) an edit endpoint that re-runs the create pipeline atomically, and (c) status-aware list **and detail** rendering.

User-confirmed decisions:
1. **Serialize on the fly** — no migration. `mapMeditationRecord` falls back when `scriptSource` is null.
2. **`sourceMode` flips to `"script"`** after any script-based edit.
3. **Separate "Save & Regenerate" button** in the modal, distinct from "Update" (which keeps handling metadata only).
4. **Owner sees a placeholder card** for in-flight meditations; non-owners don't see them at all until `status="complete"`.
5. **Client-side polling** drives the owner's placeholder → playable transition.
6. **Admins retain operational visibility into in-flight meditations** (matches existing `canAccessMeditation` admin bypass). Non-admin non-owners are blocked at every endpoint.

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
- **Text** → emit verbatim. If `speed` is a finite number, wrap as `{speed=X}text{/speed}` per element.
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

**Fix worker voice key mismatch** — the create service writes `voice_id` to `JobQueue.inputData` but the worker reads `voiceId` at [processMeditation.ts:126](../worker-node/src/processor/processMeditation.ts). Per-element voices are silently dropped today.
- Lower-risk fix: update the worker to accept both keys: `inputData.voiceId ?? inputData.voice_id`.

### Phase 3 — Regenerate service (atomic, race-safe)

New file `api/src/services/meditations/regenerateMeditationFromScript.ts` exporting `regenerateMeditationFromScript({ meditationId, script })`:

1. **Fast-path status check** (outside transaction): load meditation; if `status !== "complete" && status !== "failed"`, throw `AppError(409, "MEDITATION_BUSY")`.
2. Validate `Buffer.byteLength(script, "utf8") <= SCRIPT_MAX_BYTES`.
3. `SoundFile.findAll()`, build lowercase-name lookup. Call `parseMeditationScript`. On `!ok`, throw `AppError(400, "SCRIPT_PARSE_ERROR", ..., parseResult.errors)`.
4. **Transaction (atomic):**
   - Reload meditation `{ transaction, lock: LOCK.UPDATE }`.
   - **Recheck status under the lock** — if `status !== "complete" && status !== "failed"`, throw `MEDITATION_BUSY`.
   - **Also reject if any `JobQueue` row for this meditation has `status="processing"`**.
   - Update meditation columns: `meditationArray` (re-sequenced), `scriptSource = script`, `sourceMode = "script"`, `filename = null`, `filePath = null`, `status = "pending"`.
   - Call `replaceMeditationElements({ meditationId, elements: parseResult.elements }, transaction)`.
5. **After commit:** `await deleteMeditationAudioFiles(meditationId)` (best-effort).
6. **Only after cleanup completes**, the caller (route) invokes `notifyWorker(id, "intake")`. Service returns the updated meditation.

### Phase 4 — API: mapper fallback + new route + access helpers

**Sound lookup helper**: add `buildSoundFilenameToNameLookup(soundFiles)` in `api/src/services/meditations/soundLookup.ts`. Centralizes the `filename → name` Map construction.

**Update `mapMeditationRecord`** in [meditations.ts](../api/src/routes/meditations.ts) — accept an optional `soundFilenameToName` in options:
```
scriptSource: meditation.scriptSource ?? serializeMeditationElementsToScript(
  meditation.meditationArray,
  options.soundFilenameToName ?? (() => null),
)
```

Pass a real lookup only in routes that need it in the response. For `GET /all`, fetch SoundFile rows exactly once and reuse the lookup across the loop (no N+1). POST creates skip it — they return a minimal `{ queueId, filePath }` payload.

**Status-aware access helpers (NEW — Codex §v02-1)** in [api/src/lib/meditationAccess.ts](../api/src/lib/meditationAccess.ts):

The existing `canAccessMeditation` returns `true` for any public meditation regardless of status. Keep it for the stream byte-serving (the existing `if (!meditation.filePath)` 409 already prevents a leak there), but add a stricter helper for metadata and pre-stream endpoints:

```
canAccessMeditationDetails(meditation, req): boolean
  // owners and admins: any status
  // stream-token holders for this meditation: any status (already authed-as-owner)
  // anyone else: visibility="public" AND status="complete"
```

Apply this helper to:
- `GET /:id` — returns 403 if helper says no.
- `GET /:id/stream-token` — issuing a token for an in-flight meditation leaks existence; gate it here too.
- `GET /:id/stream` — replace the current `canAccessMeditation` call with `canAccessMeditationDetails`. The existing `!meditation.filePath` 409 stays as a defense-in-depth check.

(Rationale: even if the byte stream is unreachable without `filePath`, the current shape lets non-owners discover that an in-flight public meditation exists via 409 vs. 403 timing. Unifying access rules removes the side channel.)

**New route `PUT /:id/script`:**
- `requireAuth`; owner-only (admins do NOT bypass — mirror `PATCH /update/:id`).
- Body: `{ script: string }`; validate length.
- `const updated = await regenerateMeditationFromScript({ meditationId, script })`.
- `void notifyWorker(updated.id, "intake")`.
- Respond `{ message, meditation: mapMeditationRecord(updated, { isOwned: true, soundFilenameToName }) }`.

**Shared types** in [meditation.ts](../shared-types/src/meditation.ts):
- `RegenerateMeditationRequest = { script: string }`
- `RegenerateMeditationResponse = { message: string; meditation: Meditation }`

### Phase 5 — In-flight meditation visibility

**API — `GET /all` filtering** in [meditations.ts](../api/src/routes/meditations.ts):

Change the `where` clause so non-owners only see `complete` meditations, while the authenticated user sees their own at any status. Admins see all (consistent with `canAccessMeditation` admin bypass):

```
const baseClause = req.user?.isAdmin
  ? {} // admins see everything
  : req.user
    ? {
        [Op.or]: [
          { visibility: "public", status: "complete" },
          { userId: req.user.id },
        ],
      }
    : { visibility: "public", status: "complete" };
```

**Web — placeholder rendering** in the page that mounts the list (find via `grep -rn "ModalMeditationDetails\|meditation.*list\|MeditationCard" web/src`):
- For owned meditations with `status` in `["pending", "processing"]`:
  - Render a card with the title, a spinner, and the copy: "Your meditation will be ready shortly…"
  - Disable the play button; hide the favorite/share affordances; keep delete (user can cancel a stuck job).
  - For `status === "failed"`, show an error state: "Generation failed. Edit or delete to try again." The details modal still opens so the user can edit the script and retry.
- For non-owned meditations, no change — they only ever arrive when `complete` thanks to the API filter.

**Web — polling** in `web/src/store/features/meditationSlice.ts` (or the page that owns the list):
- After mount + after every create/regenerate, derive `hasInFlight = meditations.some(m => m.isOwned && (m.status === "pending" || m.status === "processing"))`.
- If `hasInFlight`, start a `setInterval` (5s) that refetches `GET /all` and re-dispatches the result; clear when `!hasInFlight`.
- `useEffect` cleanup to avoid leaks.
- Cap at ~5 min and fall back to manual refresh prompt if it doesn't complete — protects against an indefinitely stuck worker.

### Phase 6 — Modal UI

In [ModalMeditationDetails.tsx](../web/src/components/modals/ModalMeditationDetails.tsx):

- New state: `script` (seeded from `meditation.scriptSource ?? ""`), `isRegenerating`, `regenerateError`. Derived `isScriptDirty` and `isProcessing` (status pending OR processing).
- New `<textarea rows={12}>` below description (monospaced), `disabled={!isEditing || isRegenerating || isProcessing}`.
- Helper text: "Edit and choose 'Save & Regenerate' to rebuild the audio. Regenerating replaces the existing audio and may take a few minutes."
- If `sourceMode === "spreadsheet"` and any element in `meditationArray` has a `voice_id`, show an info note: "This meditation originally used multiple voices. Saving the script will collapse it to the default voice."
- New **"Save & Regenerate"** button, owner-only, alongside Update:
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
- Round-trip via parser: serialize elements → parse → assert equivalent element types, order, text, sounds, pauses, speed values.
- Coverage: plain text, pause, sound (found + missing), speed-wrapped text, mixed-order, `voice_id` dropped.

**API route tests** in [meditations.routes.test.ts](../api/tests/meditations/meditations.routes.test.ts):

1. `GET /:id` (script serialization) — meditation with `scriptSource: null` and mixed `meditationArray` returns a non-null `scriptSource` that round-trips.
2. `GET /all` — non-authenticated user receives only `visibility=public AND status=complete`; authenticated user receives their own at any status plus other users' complete+public; admin sees all.
3. **`GET /:id` access (NEW — Codex §v02-1):**
   - non-owner, public, complete → 200
   - non-owner, public, pending → 403
   - non-owner, public, processing → 403
   - owner, public, pending → 200
   - admin, public, pending → 200
   - anonymous, public, pending → 403
4. **`GET /:id/stream-token` access (NEW):** same matrix as above — issuing the token requires the same details-level access.
5. **`GET /:id/stream` access (NEW):** non-owner on public pending → 403 (not 409), confirming the access helper is consulted before `filePath` check.
6. `PUT /:id/script` happy path — `Meditation.update` called with `sourceMode="script"`, `status="pending"`, `filename=null`, `filePath=null`, new `scriptSource`; `JobQueue.destroy` then `JobQueue.create` per element with expected status; `deleteMeditationAudioFiles` called (mock the module); `notifyWorker(id, "intake")` called **after** cleanup.
7. PUT /:id/script — non-owner → 403, no DB writes.
8. PUT /:id/script — malformed script → 400 `SCRIPT_PARSE_ERROR` with `errors` array.
9. **Race guards:**
   - Status `processing` → 409 `MEDITATION_BUSY` (fast-path).
   - Status `pending` → 409 `MEDITATION_BUSY` (fast-path).
   - Status `complete` but transaction-time recheck sees `processing` → 409. (Simulate via a `Meditation.findByPk` mock that returns different values on the two calls.)
   - Status `complete` but a `JobQueue` row exists with `status=processing` → 409.
10. Oversize script → 400 `VALIDATION_ERROR`.

**Worker voice-key compatibility test**: `inputData.voiceId` and `inputData.voice_id` both reach `generateSpeech`.

## Critical files

- [shared-types/src/scriptParser.ts](../shared-types/src/scriptParser.ts) — add serializer
- [shared-types/src/meditation.ts](../shared-types/src/meditation.ts) — new request/response types
- [api/src/routes/meditations.ts](../api/src/routes/meditations.ts) — mapper fallback, new PUT route, `GET /all` filter, swap access helpers on `GET /:id` / stream-token / stream
- [api/src/lib/meditationAccess.ts](../api/src/lib/meditationAccess.ts) — add `canAccessMeditationDetails`
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
- Existing `canAccessMeditation` (still used for the byte stream's permissive public access; new helper layered on top for metadata-level routes)
- `normalizeSpeed` / `normalizePauseDuration` from `api/src/services/meditations/normalize.ts`
- `notifyWorker(id, "intake")` from `api/src/services/workerClient.ts`

## Verification

1. Start API, worker, web dev servers.
2. As user A, create a meditation via spreadsheet flow with text + pause + sound elements.
3. Immediately observe the list: meditation appears with a placeholder card "Your meditation will be ready shortly…" and no play button. Open another browser as user B — meditation does NOT appear in user B's list.
4. While the meditation is still in flight, user B `curl GET /meditations/<id>` → 403 (NEW behavior; was 200 before V03).
5. While the meditation is still in flight, user B `curl GET /meditations/<id>/stream-token` → 403 (NEW).
6. Wait. Polling refreshes the list; placeholder transitions to a playable card once `status=complete`. Verify user B's list now shows it and the direct GET returns 200.
7. Open the details modal. Script textarea is populated by the serializer.
8. Click Edit, modify text, add `<break time="3s"/>`, Save & Regenerate, confirm.
9. List immediately shows the placeholder again. Non-owner browser stops seeing the meditation until complete again.
10. After completion: reopen modal — script reflects the edit; `el_<oldId>_*.mp3` files are gone; new `meditation_<id>.mp3` exists.
11. As user B, attempt `PUT /:id/script` via curl on user A's meditation → 403.
12. `curl PUT /:id/script` with malformed script → 400 + `SCRIPT_PARSE_ERROR`.
13. While a regenerate is mid-flight, attempt another PUT → 409 `MEDITATION_BUSY`.
14. Per-element voice test: create a meditation via spreadsheet with a custom `voice_id` on one element. After the worker fix, verify the generated audio uses that voice.
15. Admin user: confirm `GET /all` returns in-flight meditations from any user, and `GET /:id` works on any in-flight meditation.
16. Run `npm test` in `api/`, `worker-node/`, and `shared-types/` — all new tests pass.

## Known limitations to communicate

- **`voice_id` is dropped on save** — script syntax has no voice token. Modal shows a yellow note when this would matter.
- **Sound rename/delete breaks the script.** Serializer emits `[unknown sound: <filename>]`; user must fix before regenerate succeeds.
- **Speed grouping isn't preserved** — round-trips as per-element wrappers (semantically identical, textually noisier).
- **Best-effort FS cleanup** — matches existing `deleteMeditationCascade`; failures are swallowed.
- **Polling cap** — if a meditation stays in flight beyond the polling window, the placeholder remains until manual refresh.
- **Admin visibility** — admins can see and fetch in-flight meditations from any user. Documented and tested. If product later wants admins blocked, the helper is one boolean change.
