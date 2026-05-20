---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Staged Default Meditation in Create Form (V02)

## Changes from V01

V02 addresses two concerns raised in `20260520_PLAN_DEFAULT_EDITABLE_MEDITATION_ASSESSMENT_CODEX.md`:

1. **Access control on ID-based routes was underspecified.** V01 only filtered listing routes by stage. Staged and template rows could still be read, streamed, favorited, updated, or deleted via existing ID-based routes — and since V01 left visibility as a placeholder, a staged row could be `visibility='public'` and streamable by anyone with the ID. V02 adds a stage-aware access policy that covers every ID-based meditation route and forces staged rows to `private`.
2. **Cardinality guarantees were enforced only in application logic.** V01 promised "exactly one template" and "at most one staged per user" but relied on idempotent service code. Two tabs or retries could race to create duplicates. V02 promotes these guarantees to database-level partial unique indexes and specifies transactional conflict handling.

The rest of the design (data model, frontend flow, pipeline reuse, seeding) carries forward from V01 unchanged.

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

Why an enum and not a boolean: the three states are mutually exclusive and the listing/filtering logic is clearer when expressed as "where stage = 'library'" than "where is_default = false and is_staged = false".

All existing meditations get backfilled to `stage = 'library'`, so no listing behavior changes for the corpus that exists today.

### Cardinality enforcement (new in V02)

The migration creates two partial unique indexes alongside the column:

- `CREATE UNIQUE INDEX meditations_one_template ON meditations ((stage)) WHERE stage = 'template';` — globally enforces a single template row.
- `CREATE UNIQUE INDEX meditations_one_staged_per_user ON meditations (user_id) WHERE stage = 'staged';` — enforces at most one staged row per user.

Service-layer behavior on top of these constraints:

- `getOrCreateStagedMeditation(userId)` runs inside a transaction with `SELECT … FOR UPDATE` on the user's staged row (if any). If none exists, it inserts. On `unique_violation` (a concurrent tab won the race), it catches the error, reloads the existing staged row, and returns that. This guarantees `POST /meditations/staging/generate` is safe under concurrent requests.
- The seed script uses the same find-or-create pattern, catching `unique_violation` and reloading. Two parallel seed runs converge to the same row.

### Stage-aware access control (new in V02)

V01's "filter the list endpoint" rule is insufficient. ID-based routes must also respect stage. Define a single helper, `assertMeditationAccess(meditation, requester, intent)`, used by every meditation route:

| Stage | Read intent | Owner | Other authenticated user | Anonymous |
| --- | --- | --- | --- | --- |
| `library` | unchanged from today (visibility-based) | unchanged | unchanged | unchanged |
| `staged` | owner only | 200 | 404 | 404 |
| `template` | any authenticated caller (allows the Play button for new users) | 200 | 200 | 200 (read-only stream) |

| Stage | Mutate intent (update / delete / favorite / regenerate via `/meditations/:id/*`) | Owner | Other | Anonymous |
| --- | --- | --- | --- | --- |
| `library` | unchanged from today | unchanged | unchanged | unchanged |
| `staged` | **rejected** — staged rows are only mutated via `/meditations/staging/*` endpoints | 409 / 404 | 404 | 404 |
| `template` | **rejected** for all callers — template is read-only from API; only the seed script writes it | 409 / 404 | 404 | 404 |

Concrete route-by-route impact:

- `GET /meditations/:id` — return 404 for staged rows unless caller is owner; allow template for any caller.
- `GET /meditations/:id/stream` and `GET /meditations/:id/stream-token` — same access rules as `GET /meditations/:id`. Staged streams require an owner-issued token.
- `PATCH /meditations/update/:id` — reject if `stage !== 'library'`.
- `PUT /meditations/:id/script` — reject if `stage !== 'library'`. (Staged regeneration goes through `POST /meditations/staging/generate`.)
- `DELETE /meditations/:id` — reject if `stage !== 'library'`. (Staged deletion is implicit when a new template is loaded; template is never user-deletable.)
- `POST /meditations/favorite/:id/:bool` — reject if `stage !== 'library'`.
- `GET /meditations/all` and any owner-list query — filter `stage = 'library'` (carried from V01).

Additionally, **staged rows are force-set to `visibility = 'private'`** on creation. V01 left visibility as a "placeholder"; V02 makes it explicit and enforced by the staged-create service. Visibility is only assigned a user-chosen value at `save-to-library` time.

### New owner-only endpoints (unchanged from V01)

- `GET /meditations/staging` — returns the caller's `staged` row if it exists, else returns the global `template` row. Frontend uses this to populate the Create form on mount.
- `POST /meditations/staging/generate` — body is `{ meditationArray | script, sourceMode }`. Calls `getOrCreateStagedMeditation` (transactional, unique-conflict safe), overwrites its content with the submitted payload, and runs the pipeline.
- `POST /meditations/staging/save-to-library` — body is `{ title, description, visibility }`. Validates the caller owns a staged row with `status = 'complete'`, then flips `stage` to `library` and sets title/description/visibility. After this call, the user has no staged row again.

### Frontend flow (unchanged from V01)

On mount of the Create page:

1. Call `GET /meditations/staging`. Whatever rows/script it returns becomes the form's **initial** state.
2. Capture that initial state separately so we can dirty-check against it.
3. **Play button** streams that meditation's audio via the existing `/meditations/:id/stream` flow.
4. As the user edits, compute `isDirty` per mode:
   - Spreadsheet mode: deep-compare current rows to initial `meditationArray`.
   - Script mode: string-compare current text to initial `scriptSource`.
5. **Generate button** is only rendered when `isDirty === true`. On click, hit `POST /meditations/staging/generate` with the current payload. Poll status (reuse the existing polling logic in `TableMeditation.tsx` lines 91–111). Once complete, the Play button plays the new audio.
6. **Save to Library button** is only rendered when `isDirty === false` AND the current staged row's `status === 'complete'` AND the row's `stage === 'staged'`. On click, open the existing `ModalConfirmCreateMeditation` for title/description/visibility, then submit to `POST /meditations/staging/save-to-library`.

Mode parity: the canonical content lives in the meditation's `meditation_array` (and `script_source` for script-mode users). The same staged row backs both modes; switching modes mid-edit uses the existing mode-switch UX without losing work.

### Seeding the template

Add `scripts/seedDefaultMeditation.ts` — a one-shot maintenance script (exempt from the V08 logging spec per `AGENTS.md`). It uses the constraint-backed find-or-create pattern (catch `unique_violation`, reload existing row), creates the single `stage='template'` row with a curated `meditation_array`, calls the existing `createMeditationFromElements` service path to run TTS + concatenation, and exits when the row reaches `status='complete'`. Idempotent and safe under parallel invocation.

## Why this beats the alternatives

- **No per-user pre-generation.** The only pre-generated audio is the single shared template, generated once at seed time. We don't burn TTS quota generating per-user defaults nobody asked for.
- **No separate drafts table.** Adding one column keeps the JobQueue/concatenator pipeline untouched — staged rows go through the exact same processing path as library rows. The behavior differences are confined to the listing filter and the access-control helper.
- **Reuses existing dirty-check pattern.** `ModalMeditationDetails.tsx` line 39 already does the same kind of `isScriptDirty` check; we lift that pattern into the create form.
- **Reuses existing regeneration pipeline.** `POST /meditations/staging/generate` for an existing staged row does the same work as the current `PUT /meditations/:id/script`, just under a stage-aware service.

## Critical files

Read-only references (existing patterns to reuse):

- `db-models/src/models/Meditation.ts` — schema definition; add `stage` column here.
- `api/src/routes/meditations.ts` lines 78–116 — current create flow; new staging endpoints mirror this shape. Every other route in this file needs an `assertMeditationAccess` call inserted.
- `api/src/services/meditations/createMeditationFromElements.ts` — pipeline entry; new staging endpoint reuses it.
- `worker-node/src/processor/processMeditation.ts` — no changes needed; staged rows process identically.
- `web/src/components/forms/CreateMeditationForm.tsx` — spreadsheet mode; add staging load + dirty check + Play/Generate/Save buttons.
- `web/src/components/forms/ScriptMeditationEditor.tsx` — script mode; same treatment.
- `web/src/components/modals/ModalMeditationDetails.tsx` lines 39, 114–135 — dirty-check pattern to mirror.
- `web/src/components/tables/TableMeditation.tsx` lines 91–111 — polling pattern to mirror for in-flight staged regenerations.

Files that will need new code (when implementation begins):

- New migration under `db-models/src/migrations/` for the `stage` column, backfill, and two partial unique indexes.
- New helper `api/src/services/meditations/assertMeditationAccess.ts` — single chokepoint for stage-aware route gating.
- New service `api/src/services/meditations/getOrCreateStagedMeditation.ts` — transactional, unique-conflict tolerant.
- New service `api/src/services/meditations/saveStagedToLibrary.ts`.
- New script `scripts/seedDefaultMeditation.ts`.

## Verification

Functional:

1. Run the seed script in a fresh environment. Confirm exactly one `stage='template'` row exists with `status='complete'` and a real audio file. Run it again — no duplicate row.
2. As an anonymous visitor, hit `/meditations/all` — template row absent.
3. As a fresh authenticated user, open Create form. Confirm form pre-populates from the template. Play button works.
4. Edit a row → Generate button appears. Click it. Poll until complete. Play the new audio.
5. Re-open the Create form in a new tab — user's staged content persists (not the template).
6. Switch between spreadsheet and script mode mid-edit — content stays consistent, dirty check still works.
7. Click Save to Library → confirm modal collects title/description/visibility → row appears in user's library, no longer in staging.
8. Open Create form again — back to the template.
9. As another user, confirm step 7's saved meditation doesn't appear in *their* staging area (their staging shows the template).

Access control (new in V02):

10. As user B, attempt `GET /meditations/:id` on user A's staged row ID — expect 404.
11. As user B, attempt `GET /meditations/:id/stream` on user A's staged row — expect 404, even with a stolen stream token (token issuance should also 404).
12. As user A (the owner), attempt `PATCH /meditations/update/:id`, `PUT /meditations/:id/script`, `DELETE /meditations/:id`, and `POST /meditations/favorite/:id/true` against their own staged row — each expects 409/404 (staged is off-limits to library-mutation routes).
13. As any user (including admin), attempt to delete or update the template row by ID — expect 409/404.
14. Inspect a freshly generated staged row in the DB — `visibility = 'private'` regardless of any client-submitted value.

Concurrency (new in V02):

15. From two browser tabs as the same fresh user, click Generate simultaneously. Confirm a single staged row exists in the DB afterward. The losing request should either return the same row or a normal success on the now-existing staged row, not a duplicate.
16. Attempt to insert a second `stage='template'` row by hand — DB rejects with unique-constraint error.
17. Attempt to insert a second `stage='staged'` row for the same user by hand — DB rejects with unique-constraint error.
