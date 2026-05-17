---
created_at: 2026-05-17
updated_at: 2026-05-17
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# TODO v02: Edit Meditations + Pending Visibility

Execution checklist for the design in [20260517_PLAN_EDIT_MEDITATIONS_V03.md](20260517_PLAN_EDIT_MEDITATIONS_V03.md). The plan is the source of truth for **why** and **exactly what** to change. This file is the execution scaffold — open V3 alongside it.

v02 incorporates the Codex review of v01 ([20260517_TODO_EDIT_MEDITATIONS_ASSESSMENT_CODEX.md](20260517_TODO_EDIT_MEDITATIONS_ASSESSMENT_CODEX.md)):
- Fixed web workspace name (`@golightly/web`, not `@golightly-web`).
- Phase 7 wording matches actual web codebase pattern (no thunks; API helpers in `web/src/lib/api/meditations.ts`, component-driven dispatch).
- `GET /:id/stream-token` test matrix: anonymous → 401 (route is `requireAuth`), not 403.
- Clarified that the stream-token-holder branch of `canAccessMeditationDetails` only matters at `GET /:id/stream`; issuance follows owner/admin/public-complete rules.
- Polling cap rewording reuses the existing Refresh affordance instead of inventing new UI.

## How to use this file

- Work one phase at a time, top to bottom. Phases are deliberately ordered so each builds on the previous.
- For every item, the V3 plan section in parentheses has the full detail (file paths, function signatures, copy strings).
- **Per-phase gate** (run before checking anything off):
  1. Run **tests** for the package(s) touched (`npm test -w @golightly/<pkg>` or root-level if listed).
  2. Run the **typecheck/build** for the package(s) touched (`npm run typecheck -w @golightly/<pkg>` or `npm run build:shared`).
  3. **Only after both pass**, edit this file and check off the completed items in the phase.
  4. **Commit** with a message that references this file and the phase number (e.g. `feat: phase 1 — script serializer (docs/20260517_TODO_EDIT_MEDITATIONS_V02.md)`). Commit message format per [AGENTS.md](../AGENTS.md).
- If a phase's tests or typecheck fail, **do not check off items and do not commit** — fix the issue first.
- Do not bundle phases into one commit. One phase = one commit (or a tight stack if a phase naturally splits).

---

## Phase 1 — Serializer (shared-types)

Plan §Phase 1.

- [x] Add `serializeMeditationElementsToScript(elements, soundFilenameToName)` to [shared-types/src/scriptParser.ts](../shared-types/src/scriptParser.ts).
- [x] JSDoc must document `voice_id` information loss.
- [x] Add unit tests (round-trip via parser): plain text, pause, sound (found + missing), speed-wrapped text, mixed-order, `voice_id` dropped. (Plan §Phase 8 → Serializer unit tests.)

**Per-phase gate:**
- [x] `npm test -w @golightly/shared-types` passes
- [x] `npm run typecheck -w @golightly/shared-types` passes
- [x] Check off completed items above
- [x] Commit referencing this file + Phase 1

---

## Phase 2 — Service refactors + worker voice-key fix

Plan §Phase 2.

- [x] Create `api/src/services/meditations/meditationFileCleanup.ts` exporting `deleteMeditationAudioFiles(meditationId)`. Move `deleteMatchingFiles` out of [deleteMeditationCascade.ts](../api/src/services/meditations/deleteMeditationCascade.ts).
- [x] Update [deleteMeditationCascade.ts](../api/src/services/meditations/deleteMeditationCascade.ts) to call the new helper. Behavior unchanged.
- [x] Extract `replaceMeditationElements({ meditationId, elements }, transaction)` from [createMeditationFromElements.ts](../api/src/services/meditations/createMeditationFromElements.ts). Export it. `createMeditationFromElements` now calls it after creating the Meditation row.
- [x] Update [worker-node/src/processor/processMeditation.ts](../worker-node/src/processor/processMeditation.ts) to accept both `inputData.voiceId` and `inputData.voice_id`.
- [x] Add a worker test asserting both keys reach `generateSpeech`. (Plan §Phase 8 → Worker voice-key compatibility.)

**Per-phase gate:**
- [x] `npm test -w @golightly/api` passes (no regressions in existing create/delete tests)
- [x] `npm test -w @golightly/worker-node` passes
- [x] `npm run typecheck -w @golightly/api` and `npm run typecheck -w @golightly/worker-node` pass
- [x] Check off completed items above
- [x] Commit referencing this file + Phase 2

---

## Phase 3 — Regenerate service

Plan §Phase 3. Race-safety is critical here — re-read the phase before coding.

- [x] Create `api/src/services/meditations/regenerateMeditationFromScript.ts`.
- [x] Implement fast-path status check (reject if not `complete` or `failed`).
- [x] Implement transaction with row lock, status recheck under lock, AND rejection if any `JobQueue` row has `status="processing"`.
- [x] Update meditation columns inside the transaction (re-sequence `meditationArray`, set `scriptSource`, `sourceMode="script"`, `filename=null`, `filePath=null`, `status="pending"`).
- [x] Call `replaceMeditationElements` inside the same transaction.
- [x] After commit, call `deleteMeditationAudioFiles(meditationId)` (best-effort).
- [x] Service does NOT call `notifyWorker` — that's the route's job.

**Per-phase gate:**
- [x] `npm test -w @golightly/api` passes
- [x] `npm run typecheck -w @golightly/api` passes
- [x] Check off completed items above
- [x] Commit referencing this file + Phase 3

---

## Phase 4 — API: mapper fallback, access helpers, new route

Plan §Phase 4.

- [x] Create `api/src/services/meditations/soundLookup.ts` exporting `buildSoundFilenameToNameLookup(soundFiles)`.
- [x] Update `mapMeditationRecord` in [api/src/routes/meditations.ts](../api/src/routes/meditations.ts) to accept optional `soundFilenameToName` and fall back to serializer when `scriptSource` is null.
- [x] Add `canAccessMeditationDetails(meditation, req)` to [api/src/lib/meditationAccess.ts](../api/src/lib/meditationAccess.ts). **Behavior:**
  - Owner → allowed at any status.
  - Admin → allowed at any status.
  - Public + complete → allowed for anyone (including anonymous, where applicable).
  - Stream-token holder for this meditation → allowed at any status. **This branch only matters at `GET /:id/stream`** (the token-issuance route receives no token); other callers can skip it.
  - Otherwise → denied.
- [x] Swap `canAccessMeditation` → `canAccessMeditationDetails` in `GET /:id`, `GET /:id/stream-token`, and `GET /:id/stream` handlers. Keep the existing `if (!meditation.filePath)` 409 in `/stream` as defense-in-depth, but the access helper runs first.
- [x] Add `PUT /:id/script` route: `requireAuth`, owner-only, validates length, calls `regenerateMeditationFromScript`, then `void notifyWorker(updated.id, "intake")`, then responds with mapped meditation.
- [x] Build SoundFile lookup once per request in `GET /all`, `GET /:id`, `PATCH /update/:id`, and `PUT /:id/script` handlers.
- [x] Add `RegenerateMeditationRequest` and `RegenerateMeditationResponse` to [shared-types/src/meditation.ts](../shared-types/src/meditation.ts) (and re-export via `index.ts`).

**Per-phase gate:**
- [x] `npm test -w @golightly/api` passes (existing tests still green)
- [x] `npm run typecheck -w @golightly/api` and `npm run typecheck -w @golightly/shared-types` pass
- [x] Check off completed items above
- [x] Commit referencing this file + Phase 4

---

## Phase 5 — In-flight visibility (API filter)

Plan §Phase 5 (API portion only — web portion is in Phase 7).

- [x] Update `GET /all` `where` clause in [api/src/routes/meditations.ts](../api/src/routes/meditations.ts): admin sees all; authenticated non-admin sees `(public AND complete) OR own`; anonymous sees `public AND complete`.

**Per-phase gate:**
- [x] `npm test -w @golightly/api` passes
- [x] `npm run typecheck -w @golightly/api` passes
- [x] Check off completed items above
- [x] Commit referencing this file + Phase 5

---

## Phase 6 — API tests (all routes)

Plan §Phase 8 (API route tests).

Add to [api/tests/meditations/meditations.routes.test.ts](../api/tests/meditations/meditations.routes.test.ts) (or split into a new file if it gets long):

- [x] `GET /:id` returns serialized script when `scriptSource` is null and round-trips through `parseMeditationScript`.
- [x] `GET /all` filter: anonymous, authenticated non-owner, owner, admin scenarios.
- [x] `GET /:id` access matrix:
  - non-owner public complete → 200
  - non-owner public pending → 403
  - non-owner public processing → 403
  - owner public pending → 200
  - admin public pending → 200
  - anonymous public pending → 403
- [x] `GET /:id/stream-token` access matrix (route is `requireAuth`, so anonymous returns **401**, not 403):
  - authenticated non-owner public complete → 200 (token issued)
  - authenticated non-owner public pending → 403
  - owner public pending → 200
  - admin public pending → 200
  - anonymous public pending → **401**
- [x] `GET /:id/stream` access: non-owner public pending → 403 (not 409), confirming the access helper runs before the `filePath` check.
- [x] `PUT /:id/script` happy path: updates fields, destroys + recreates JobQueue rows, calls `deleteMeditationAudioFiles` mock, calls `notifyWorker` **after** cleanup.
- [x] `PUT /:id/script` non-owner → 403, no DB writes.
- [x] `PUT /:id/script` malformed script → 400 `SCRIPT_PARSE_ERROR` with errors.
- [x] Race guards: status `processing` → 409; status `pending` → 409; in-transaction recheck `processing` → 409; existing `JobQueue.processing` row → 409.
- [x] Oversize script → 400 `VALIDATION_ERROR`.

**Per-phase gate:**
- [x] `npm test -w @golightly/api` passes with all new tests green
- [x] `npm run typecheck -w @golightly/api` passes
- [x] Check off completed items above
- [x] Commit referencing this file + Phase 6

---

## Phase 7 — Web: API helper, list placeholder, polling

Plan §Phase 5 (web portion) + §Phase 7.

**Important:** The web codebase does **not** use Redux thunks. The slice [`web/src/store/features/meditationSlice.ts`](../web/src/store/features/meditationSlice.ts) is plain reducers (`updateMeditation`, `setMeditations`, etc.). API calls live in [`web/src/lib/api/meditations.ts`](../web/src/lib/api/meditations.ts) (see existing `updateMeditationObj`, `deleteMeditationObj`, `getAllMeditations`) and are invoked from components which then dispatch the matching reducer. Match this pattern — do not introduce thunks.

- [x] Add `regenerateMeditationScript(id, script)` helper to [`web/src/lib/api/meditations.ts`](../web/src/lib/api/meditations.ts). PUTs `/meditations/:id/script` and returns `{ meditation }`. Type the response using the new `RegenerateMeditationResponse` from shared-types.
- [x] Locate the list page / table (`grep -rn "ModalMeditationDetails\|MeditationCard\|TableMeditation" web/src`; `web/src/components/tables/TableMeditation.tsx` is the known table).
- [x] In the list/table, add a placeholder card render path for owned meditations where `status` is `pending` or `processing`: spinner, copy "Your meditation will be ready shortly…", no play button, hide favorite/share, keep delete.
- [x] Add a `failed` state render: "Generation failed. Edit or delete to try again." Details modal still opens.
- [x] Add polling in the list/table (`useEffect`): when any owned meditation is in-flight, `setInterval` every 5s to refetch `GET /all` and dispatch `setMeditations` (or whatever the slice uses); clear when none remain. Clean up on unmount.
- [x] **Polling cap (kept small):** stop polling after 5 minutes. Do not add a new UI element. The existing Refresh affordance on the list stays available so the user can re-trigger a fetch manually.

**Per-phase gate:**
- [x] `npm run typecheck -w @golightly/web` passes
- [x] `npm run build -w @golightly/web` passes
- [ ] Manually verify in browser: create a meditation, see placeholder, polling refreshes to playable card when worker completes.
- [x] Check off completed items above
- [x] Commit referencing this file + Phase 7

---

## Phase 8 — Web: modal script textarea + Save & Regenerate

Plan §Phase 6.

- [x] In [web/src/components/modals/ModalMeditationDetails.tsx](../web/src/components/modals/ModalMeditationDetails.tsx), add `script`, `isRegenerating`, `regenerateError` state. Seed `script` from `meditation.scriptSource ?? ""`.
- [x] Add `<textarea rows={12}>` below description (monospaced); disable when not editing, while regenerating, or while `isProcessing` (status pending/processing).
- [x] Add helper text under the textarea per plan §Phase 6.
- [x] Add the multi-voice warning note when `sourceMode === "spreadsheet"` and any element has a `voice_id`.
- [x] Add `onRegenerateScript: (id, script) => Promise<void>` prop and thread it from the list/table (caller invokes the new `regenerateMeditationScript` API helper, then dispatches `updateMeditation(response.meditation)`).
- [x] Add "Save & Regenerate" button (owner-only) with the disabled rules from the plan; confirm dialog with the wording from the plan; call `onRegenerateScript` on confirm.
- [x] "Update" button keeps its existing scope (title/description/visibility only).

**Per-phase gate:**
- [x] `npm run typecheck -w @golightly/web` passes
- [x] `npm run build -w @golightly/web` passes
- [ ] Manually verify in browser: open spreadsheet-created meditation → script populated; edit + Save & Regenerate → placeholder appears, polling completes, modal shows updated script.
- [x] Check off completed items above
- [x] Commit referencing this file + Phase 8

---

## Phase 9 — Full end-to-end verification

Plan §Verification.

Run through the 16-step manual checklist in V3 §Verification. Fix any regression before checking this phase off.

- [ ] All 16 verification steps pass (record any deviations as follow-up issues).
- [ ] `npm run typecheck:shared` (root) passes
- [ ] `npm test -w @golightly/shared-types && npm test -w @golightly/api && npm test -w @golightly/worker-node` all pass
- [ ] No commit needed for this phase unless verification turned up a fix.

---

## Reminders

- **Never check off an item until its tests + typecheck pass.**
- **Never bundle phases into one commit.**
- If a phase reveals a missing plan detail, update V3 (don't silently drift) and reference the V3 update in the commit body.
- Commit message format per [AGENTS.md](../AGENTS.md): lowercase title, max 50 chars, body summarizing scope, `co-authored-by: <agent name> (<model>)` trailer.
