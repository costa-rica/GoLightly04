---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Staged Default Meditation in Create Form (V03)

## Changes from V02

V03 addresses two concerns raised in `20260520_PLAN_DEFAULT_EDITABLE_MEDITATION_V02_ASSESSMENT_CODEX.md`. Both were validated against current code before incorporating:

1. **Express route ordering risk.** The current router in `api/src/routes/meditations.ts` registers `GET /:id` at line 213, with `/:id/stream-token`, `/:id/stream`, `/:id/script`, and `DELETE /:id` after it. Any `/staging*` route appended to the bottom of this router would be shadowed by `/:id` (matching with `id="staging"`). V02 did not call this out. V03 fixes the route-registration order explicitly.
2. **Staged regeneration concurrency.** V02's transactional safety covered only the get-or-create-staged-row path. Once a staged row exists, V02 said only "reuse the pipeline" — without binding the staged generate handler to the same row-lock + busy-job-probe + atomic-replace + post-commit-file-cleanup sequence that the existing `regenerateMeditationFromScript` service already implements ([api/src/services/meditations/regenerateMeditationFromScript.ts:43-86](api/src/services/meditations/regenerateMeditationFromScript.ts)). Double-clicks, retries, or two open tabs could corrupt the staged job queue or leave the Play button pointing at deleted audio. V03 names a dedicated service for staged regeneration that mirrors this exact pattern and accepts both spreadsheet and script payloads.

Everything else (data model, cardinality indexes, access-control helper, frontend flow, seeding, mode parity) carries forward from V02 unchanged.

## Context

The current Create Meditation form (`web/src/components/forms/CreateMeditationForm.tsx` + `ScriptMeditationEditor.tsx`) starts empty. Users hitting the page for the first time don't realize they need to type their own meditation text, and have no way to hear what a meditation sounds like before committing.

The goal is to give users a working starter meditation they can immediately play, edit, regenerate, and only commit to their library when they're ready. The design must:

1. Pre-populate the form with a shared default meditation (same content for every user).
2. Add a Play button that plays the current meditation audio (default or user-edited).
3. Show a Generate button only after the user has actually edited the content.
4. Hold the user's in-progress ("staged") meditation in the DB without polluting the library listing, until they explicitly save it.

Both spreadsheet mode and script mode must support this flow against the same backing content.

## Design summary

### Data model: one new column on Meditation

Add a `stage` enum column to the `meditations` table:

| Value | Meaning | Cardinality |
| --- | --- | --- |
| `template` | The global shared default meditation. Audio is seeded once. | Exactly one row globally. |
| `staged` | A user's in-progress meditation in the Create form. | At most one per user. |
| `library` | A normal meditation that appears in listings. | Many per user. Default for all existing rows. |

All existing meditations get backfilled to `stage = 'library'`, so no listing behavior changes for the corpus that exists today.

### Cardinality enforcement (carried from V02)

The migration creates two partial unique indexes alongside the column:

- `CREATE UNIQUE INDEX meditations_one_template ON meditations ((stage)) WHERE stage = 'template';`
- `CREATE UNIQUE INDEX meditations_one_staged_per_user ON meditations (user_id) WHERE stage = 'staged';`

`getOrCreateStagedMeditation(userId)` runs in a transaction with `SELECT … FOR UPDATE` on the user's staged row if one exists; otherwise inserts. On `unique_violation` it catches, reloads, and returns the winner.

### Stage-aware access control (carried from V02)

A single helper `assertMeditationAccess(meditation, requester, intent)` gates every ID-based meditation route. Summary:

- `GET /meditations/:id`, `GET /meditations/:id/stream`, `GET /meditations/:id/stream-token`: staged rows are owner-only (404 otherwise); template rows are readable by any caller; library rows keep today's visibility-based rule.
- `PATCH /meditations/update/:id`, `PUT /meditations/:id/script`, `DELETE /meditations/:id`, `POST /meditations/favorite/:id/:bool`: reject anything other than `stage='library'`.
- Staged rows are force-set to `visibility='private'` on creation; visibility is only client-controlled at `save-to-library` time.

### Route registration order (new in V03)

In `api/src/routes/meditations.ts`, the new staging routes **must be declared above** all existing `/:id`-parameterized routes. Concretely, the new ordering of the relevant section is:

1. `POST /meditations/create` *(existing)*
2. `POST /meditations/create/script` *(existing)*
3. `GET /meditations/all` *(existing)*
4. **`GET /meditations/staging`** *(new)*
5. **`POST /meditations/staging/generate`** *(new)*
6. **`POST /meditations/staging/save-to-library`** *(new)*
7. `GET /meditations/:id` *(existing, line 213)*
8. `GET /meditations/:id/stream-token` *(existing)*
9. `GET /meditations/:id/stream` *(existing)*
10. `POST /meditations/favorite/:meditationId/:trueOrFalse` *(existing)*
11. `PATCH /meditations/update/:id` *(existing)*
12. `PUT /meditations/:id/script` *(existing)*
13. `DELETE /meditations/:id` *(existing)*

Rule: every `/staging*` literal route must appear before any `/:id` or `/:id/*` route in the router file. Route tests assert that `GET /meditations/staging`, `POST /meditations/staging/generate`, and `POST /meditations/staging/save-to-library` reach their dedicated handlers and never hit the `:id` handler with `id="staging"`.

### Staged regeneration service (new in V03, was glossed over in V02)

Introduce `regenerateStagedMeditation(opts)` in `api/src/services/meditations/regenerateStagedMeditation.ts`. This is the single service that backs `POST /meditations/staging/generate` once a staged row exists. It mirrors the lock-and-replace pattern of [regenerateMeditationFromScript.ts:43-86](api/src/services/meditations/regenerateMeditationFromScript.ts), generalized to accept both payload shapes:

Input:

```
{ meditationId: number;
  payload: { mode: "script"; script: string }
         | { mode: "spreadsheet"; elements: MeditationElement[] };
}
```

Algorithm:

1. Outside the transaction: parse / validate the payload (script size check, parser run, or elements schema check). Bail with `400` on validation failure before touching the DB.
2. Open a transaction:
   - `Meditation.findByPk(meditationId, { transaction, lock: LOCK.UPDATE })` — reject 404 if missing.
   - Assert `stage === 'staged'`. Reject 409 if not (this service is staged-only; the library path stays on `regenerateMeditationFromScript`).
   - Assert `status` is one of `complete` / `failed`. Reject `409 MEDITATION_BUSY` otherwise — identical guard to the existing service ([regenerateMeditationFromScript.ts:7-13](api/src/services/meditations/regenerateMeditationFromScript.ts)).
   - `JobQueue.findOne({ where: { meditationId, status: 'processing' }, transaction, lock: LOCK.UPDATE })`. If any processing job exists, reject `409 MEDITATION_BUSY`. This is the second guard from the existing service and is what actually serializes parallel Generate clicks.
   - Inside the same transaction, atomically update the staged row: `meditationArray` (computed from payload), `scriptSource` (the script text if `mode === 'script'`, else null), `sourceMode`, `filename = null`, `filePath = null`, `durationSeconds = null`, `status = 'pending'`. Visibility remains `'private'` — never overwrite.
   - Call `replaceMeditationElements({ meditationId, elements }, transaction)` to rewrite the JobQueue rows inside the same transaction.
3. After the transaction commits:
   - `await deleteMeditationAudioFiles(meditationId)` — same post-commit file cleanup the existing service does ([regenerateMeditationFromScript.ts:86](api/src/services/meditations/regenerateMeditationFromScript.ts)).
   - `void notifyWorker(meditationId, "intake")` — exactly once, after commit.

`POST /meditations/staging/generate` becomes a thin wrapper:

1. Resolve / lazily create the staged row via `getOrCreateStagedMeditation(userId)` (V02's transactional helper). This either returns an existing staged row or copies the template into a new `stage='staged'` row for this user.
2. Call `regenerateStagedMeditation({ meditationId: stagedRow.id, payload })`.
3. Return the updated row.

The two operations are intentionally separate. Get-or-create handles cardinality races (two tabs of a new user); `regenerateStagedMeditation` handles content-replacement races (two tabs of a returning user). Each problem gets its own lock and its own conflict-resolution rule.

The frontend handles `409 MEDITATION_BUSY` by surfacing a "Generation already in progress — please wait" message and refusing to re-fire until the poller sees `complete` or `failed`. This already matches existing behavior in `ModalMeditationDetails.tsx`.

### New owner-only endpoints (unchanged from V02 except for ordering)

- `GET /meditations/staging` — returns the caller's `staged` row if it exists, else returns the global `template` row.
- `POST /meditations/staging/generate` — see the wrapper algorithm above.
- `POST /meditations/staging/save-to-library` — validates the caller owns a staged row with `status='complete'`, then atomically flips `stage` to `library` and sets title/description/visibility. After this, the user has no staged row again.

### Frontend flow (unchanged from V02)

On mount of the Create page:

1. Call `GET /meditations/staging`. Whatever rows/script it returns becomes the form's **initial** state.
2. Capture that initial state separately so we can dirty-check against it.
3. **Play button** streams that meditation's audio via the existing `/meditations/:id/stream` flow.
4. As the user edits, compute `isDirty` per mode (deep-compare rows or string-compare script).
5. **Generate button** is only rendered when `isDirty === true`. On click, hit `POST /meditations/staging/generate`. Disable the button until the poller reports `complete` or `failed`. On `409 MEDITATION_BUSY`, surface the busy message and keep the button disabled — the poller is already in charge of refresh.
6. **Save to Library button** is only rendered when `isDirty === false` AND `status === 'complete'` AND `stage === 'staged'`. On click, open `ModalConfirmCreateMeditation` and submit to `POST /meditations/staging/save-to-library`.

### Seeding the template (unchanged from V02)

`scripts/seedDefaultMeditation.ts` creates the single `stage='template'` row using the constraint-backed find-or-create pattern, runs `createMeditationFromElements` to generate the audio, exits when `status='complete'`. Idempotent and safe under parallel invocation.

## Critical files

Read-only references (existing patterns to reuse):

- `db-models/src/models/Meditation.ts` — schema definition; add `stage` column here.
- `api/src/routes/meditations.ts` — current routes; new staging endpoints inserted between line 211 (end of `/all` handler) and line 213 (start of `/:id` handler).
- `api/src/services/meditations/regenerateMeditationFromScript.ts` — exact pattern to mirror for `regenerateStagedMeditation`. Lines 7–13 (busy guard), 43–84 (transactional lock + replace), 86 (post-commit cleanup).
- `api/src/services/meditations/createMeditationFromElements.ts` — `replaceMeditationElements` is the in-transaction job-replacement helper to reuse.
- `worker-node/src/processor/processMeditation.ts` — no changes; staged rows process identically.
- `web/src/components/forms/CreateMeditationForm.tsx` — spreadsheet mode; add staging load + dirty check + Play/Generate/Save buttons.
- `web/src/components/forms/ScriptMeditationEditor.tsx` — script mode; same treatment.
- `web/src/components/modals/ModalMeditationDetails.tsx` lines 39, 114–135 — dirty-check + 409 handling pattern to mirror.
- `web/src/components/tables/TableMeditation.tsx` lines 91–111 — polling pattern to mirror.

Files that will need new code:

- New migration under `db-models/src/migrations/` for the `stage` column, backfill, and two partial unique indexes.
- New helper `api/src/services/meditations/assertMeditationAccess.ts`.
- New service `api/src/services/meditations/getOrCreateStagedMeditation.ts` — transactional, unique-conflict tolerant.
- **New service `api/src/services/meditations/regenerateStagedMeditation.ts`** — mirror of `regenerateMeditationFromScript` accepting both payload shapes.
- New service `api/src/services/meditations/saveStagedToLibrary.ts`.
- New script `scripts/seedDefaultMeditation.ts`.

## Verification

Functional (carried from V02):

1. Run the seed script in a fresh environment. Confirm exactly one `stage='template'` row with `status='complete'` and a real audio file. Run again — no duplicate.
2. Anonymous visitor: `/meditations/all` — template row absent.
3. Fresh authenticated user: Create form pre-populates from the template. Play works.
4. Edit a row → Generate appears → click → poll → audio updates.
5. Re-open the form in a new tab — user's staged content persists.
6. Switch between spreadsheet and script mid-edit — content stays consistent.
7. Save to Library → modal collects title/description/visibility → row appears in library, no longer in staging.
8. Open Create form again — back to the template.
9. As another user, step-7's saved meditation does not appear in *their* staging area.

Access control (carried from V02):

10. As user B, `GET /meditations/:id` on user A's staged row — 404.
11. As user B, `GET /meditations/:id/stream` on user A's staged row, with or without a stolen token — 404.
12. As the owner, attempt `PATCH /update/:id`, `PUT /:id/script`, `DELETE /:id`, `POST /favorite/:id/true` against own staged row — all 409/404.
13. Any caller (including admin), attempt to delete or update the template row — 409/404.
14. Inspect a freshly generated staged row — `visibility = 'private'`.

Concurrency (carried from V02):

15. Two tabs as the same fresh user click Generate simultaneously — exactly one staged row exists afterward; the loser returns a normal success against the same row, not a duplicate.
16. Hand-insert a second `stage='template'` row — DB rejects.
17. Hand-insert a second `stage='staged'` row for the same user — DB rejects.

Route ordering (new in V03):

18. `GET /meditations/staging` reaches the staging handler. Assert via a route test that mocks the `:id` handler with a sentinel and confirms it was *not* called.
19. `POST /meditations/staging/generate` and `POST /meditations/staging/save-to-library` reach their handlers (same sentinel approach).
20. `GET /meditations/staging/anything-trailing` still 404s rather than being captured by `:id` — confirms the literal prefix is correctly bounded.

Staged regeneration concurrency (new in V03):

21. Double-click Generate on an existing staged row that is `complete`: first request flips to `pending` and starts processing; second request returns `409 MEDITATION_BUSY`. Final DB state shows one set of JobQueue rows, one new audio file, no orphaned old audio.
22. Trigger `POST /meditations/staging/generate` from two parallel HTTP requests against the same already-existing staged row. Exactly one wins; the other returns 409. The job queue is not duplicated; `replaceMeditationElements` ran exactly once.
23. While a staged regeneration is `processing` (a job exists with `status='processing'`), an additional Generate request returns 409 immediately without modifying the row or its jobs.
24. After a regeneration completes successfully, the previously associated audio file from before the regeneration no longer exists on disk (`deleteMeditationAudioFiles` ran post-commit).
