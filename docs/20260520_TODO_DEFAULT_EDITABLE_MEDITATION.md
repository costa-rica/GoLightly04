---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# TODO Default Editable Meditation

This TODO implements `docs/20260520_PLAN_DEFAULT_EDITABLE_MEDITATION_V08.md`.

The goal is to add one shared default meditation that always loads in the Create form, let users generate one reusable staged meditation from their edits, keep staged/template rows out of normal library listings, and only promote staged content into the library when the user explicitly saves it.

## Phase 1: schema and shared response contract

- [ ] Add `MeditationStage = "template" | "staged" | "library"` to `shared-types/src/meditation.ts`.
- [ ] Add `stage: MeditationStage` to the shared `Meditation` response type.
- [ ] Add `stage` to `db-models/src/models/Meditation.ts` with Sequelize enum values `template`, `staged`, and `library`.
- [ ] Add TypeScript declaration for `Meditation.stage`.
- [ ] Create a migration under `db-models/migrations/` that:
  - [ ] Adds the `stage` column with default `library`.
  - [ ] Backfills existing rows to `library`.
  - [ ] Adds partial unique index `meditations_one_template` for `stage = 'template'`.
  - [ ] Adds partial unique index `meditations_one_staged_per_user` for `(user_id) WHERE stage = 'staged'`.
- [ ] Update `api/src/routes/meditations.ts` `mapMeditationRecord` to include `stage: meditation.stage ?? "library"`.
- [ ] Add or update tests that verify mapped meditation responses include `stage`.

Verification:

- [ ] Run `npm run typecheck:shared`.
- [ ] Run `npm run test -w @golightly/shared-types`.
- [ ] Run `npm run typecheck -w @golightly/api`.
- [ ] Commit this phase with a message referencing `docs/20260520_TODO_DEFAULT_EDITABLE_MEDITATION.md` and phase 1.

## Phase 2: creation pipeline and template seed script

- [ ] Extend `api/src/services/meditations/createMeditationFromElements.ts` to accept optional `stage?: MeditationStage`.
- [ ] Default omitted `stage` to `library`.
- [ ] Pass `stage` through to `Meditation.create`.
- [ ] Confirm existing `/meditations/create` and `/meditations/create/script` callers remain library rows.
- [ ] Extract `getOrCreateBenevolentUser` from `api/src/routes/admin.ts` into `api/src/services/users/getOrCreateBenevolentUser.ts`.
- [ ] Update the admin router to import the extracted helper.
- [ ] Create `scripts/seedDefaultMeditation.ts`.
- [ ] Seed script must use this exact starter script:

  ```text
  Welcome. Close your eyes.
  <break time="2s" />
  [Tibetan Singing Bowl]
  ```

- [ ] Seed script must parse the starter script with `parseMeditationScript`.
- [ ] Seed script must fail before creating a row if `Tibetan Singing Bowl` is missing.
- [ ] Seed script must call `createMeditationFromElements` with:
  - [ ] `userId` from the benevolent system user.
  - [ ] `elements: parseResult.elements`.
  - [ ] `sourceMode: "script"`.
  - [ ] `scriptSource` equal to the starter script.
  - [ ] `stage: "template"`.
- [ ] Seed script must notify the worker once and poll until the template is `complete` or `failed`.
- [ ] Seed script must catch the template unique-constraint conflict and exit 0 only when the existing template is complete.
- [ ] Add tests or script-level checks for missing sound, idempotent seed behavior, and exact parsed seed shape.

Verification:

- [ ] Run `npm run typecheck:shared`.
- [ ] Run `npm run typecheck -w @golightly/api`.
- [ ] Run `npm run typecheck:scripts`.
- [ ] Run `npm run test -w @golightly/api`.
- [ ] Commit this phase with a message referencing `docs/20260520_TODO_DEFAULT_EDITABLE_MEDITATION.md` and phase 2.

## Phase 3: stage-aware access and library filtering

- [ ] Create `api/src/services/meditations/assertMeditationAccess.ts`.
- [ ] Apply `assertMeditationAccess` to:
  - [ ] `GET /meditations/:id`.
  - [ ] `GET /meditations/:id/stream-token`.
  - [ ] `GET /meditations/:id/stream`.
  - [ ] `PATCH /meditations/update/:id`.
  - [ ] `PUT /meditations/:id/script`.
  - [ ] `DELETE /meditations/:id`.
  - [ ] `POST /meditations/favorite/:id/:bool`.
- [ ] Enforce read behavior:
  - [ ] Library rows keep existing visibility behavior.
  - [ ] Staged rows are owner-only and return 404 for non-owners.
  - [ ] Template rows are readable and streamable by any caller.
- [ ] Enforce mutation behavior:
  - [ ] Library rows keep existing owner/admin mutation behavior.
  - [ ] Staged rows are rejected through library mutation routes.
  - [ ] Template rows are rejected through API mutation routes.
- [ ] Update `/meditations/all` so every auth branch includes `stage = 'library'`.
- [ ] Keep `/admin/meditations` and `/admin/queuer` unfiltered.
- [ ] Create `api/src/services/meditations/assertAdminMeditationMutable.ts`.
- [ ] Apply admin template protection to:
  - [ ] `DELETE /admin/meditations/:id`.
  - [ ] `DELETE /admin/queuer/:id`.
  - [ ] `POST /admin/meditations/:id/requeue`.
- [ ] Add `DELETE /admin/users/:id` guard returning `409 PROTECTED_USER` if the user owns a template row.
- [ ] Add route tests for anonymous, authenticated, other-user, and admin `/meditations/all` responses.
- [ ] Add route tests for staged/template direct access and mutation rejection.
- [ ] Add admin route tests for protected template mutation and protected benevolent user deletion.

Verification:

- [ ] Run `npm run typecheck -w @golightly/api`.
- [ ] Run `npm run test -w @golightly/api`.
- [ ] Commit this phase with a message referencing `docs/20260520_TODO_DEFAULT_EDITABLE_MEDITATION.md` and phase 3.

## Phase 4: staging API and unified Generate service

- [ ] Create `api/src/services/meditations/createOrRegenerateStagedMeditation.ts`.
- [ ] Support payloads:
  - [ ] `{ mode: "script"; script: string }`.
  - [ ] `{ mode: "spreadsheet"; elements: MeditationElement[] }`.
- [ ] Validate and parse payloads before opening the transaction.
- [ ] For script mode, enforce script size and parser errors consistently with existing script creation.
- [ ] For spreadsheet mode, validate element shape consistently with existing spreadsheet creation.
- [ ] In the transaction, lock the caller's existing `stage='staged'` row by `user_id`.
- [ ] First-time create branch:
  - [ ] Create a staged row directly from the submitted payload, not from the template.
  - [ ] Set `visibility='private'`.
  - [ ] Set `status='pending'`.
  - [ ] Set `filename`, `filePath`, and `durationSeconds` to null.
  - [ ] Create JobQueue rows with `replaceMeditationElements`.
- [ ] Regenerate branch:
  - [ ] Require existing staged row status to be `complete` or `failed`.
  - [ ] Reject pending/processing rows with `409 MEDITATION_BUSY`.
  - [ ] Check for processing JobQueue rows and reject busy state.
  - [ ] Update the same staged row in place with submitted content.
  - [ ] Clear `filename`, `filePath`, and `durationSeconds`.
  - [ ] Replace JobQueue rows inside the transaction.
  - [ ] Record previous audio for post-commit cleanup.
- [ ] Handle create-branch unique conflicts from simultaneous first Generate by retrying once.
- [ ] After commit, delete prior staged audio only for existing staged-row regenerations.
- [ ] Notify the worker exactly once after commit.
- [ ] Create `api/src/services/meditations/saveStagedToLibrary.ts`.
- [ ] Save service must validate ownership and `status='complete'`.
- [ ] Save service must validate title, description, and visibility using existing rules.
- [ ] Save service must atomically flip `stage` from `staged` to `library`.
- [ ] Add route handlers before all `/:id` routes:
  - [ ] `GET /meditations/staging`.
  - [ ] `POST /meditations/staging/generate`.
  - [ ] `POST /meditations/staging/save-to-library`.
- [ ] `GET /meditations/staging` must return existing staged row or template and never create a row.
- [ ] All staging endpoint responses must include the mapped meditation with correct `stage`.
- [ ] Add route-order tests proving `/staging*` routes do not hit `/:id`.
- [ ] Add first Generate, subsequent Generate, concurrent Generate, busy Generate, and Save to Library tests.

Verification:

- [ ] Run `npm run typecheck -w @golightly/api`.
- [ ] Run `npm run test -w @golightly/api`.
- [ ] Commit this phase with a message referencing `docs/20260520_TODO_DEFAULT_EDITABLE_MEDITATION.md` and phase 4.

## Phase 5: frontend staging flow

- [ ] Add staging API client functions in `web/src/lib/api/meditations.ts`:
  - [ ] `getStagingMeditation`.
  - [ ] `generateStagingMeditation`.
  - [ ] `saveStagedMeditationToLibrary`.
- [ ] Update frontend types to use `Meditation.stage`.
- [ ] Update `CreateMeditationForm.tsx` spreadsheet mode:
  - [ ] Load `GET /meditations/staging` on mount/open.
  - [ ] Populate rows from returned `meditationArray`.
  - [ ] Store initial rows for dirty checking.
  - [ ] Store returned `stage`, `status`, and meditation id.
  - [ ] Add Play button using existing stream flow.
  - [ ] Show Generate only when dirty.
  - [ ] Disable Generate while pending/processing.
  - [ ] Poll staging status until complete or failed.
  - [ ] Show Save to Library only when `stage === "staged"`, `status === "complete"`, and not dirty.
  - [ ] Save through `POST /meditations/staging/save-to-library`.
  - [ ] Reload library list after save.
  - [ ] Reload staging after save so the form returns to the template.
- [ ] Update `ScriptMeditationEditor.tsx` with the same staged load, dirty check, Generate, Play, polling, and Save behavior for script mode.
- [ ] Ensure mode switching preserves the same backing content.
- [ ] Surface `409 MEDITATION_BUSY` as "Generation in progress - please wait" and keep polling.
- [ ] Hide Save to Library for template responses.
- [ ] Ensure staged generated audio replaces template audio after generation completes.

Verification:

- [ ] Run `npm run typecheck -w @golightly/web`.
- [ ] Run `npm run lint -w @golightly/web`.
- [ ] Run `npm run build -w @golightly/web`.
- [ ] Commit this phase with a message referencing `docs/20260520_TODO_DEFAULT_EDITABLE_MEDITATION.md` and phase 5.

## Phase 6: integration verification and cleanup

- [ ] Run shared/package checks:
  - [ ] `npm run typecheck:shared`.
  - [ ] `npm run test -w @golightly/shared-types`.
- [ ] Run API checks:
  - [ ] `npm run typecheck -w @golightly/api`.
  - [ ] `npm run test -w @golightly/api`.
- [ ] Run worker checks if worker behavior or shared model behavior was touched:
  - [ ] `npm run typecheck -w @golightly/worker-node`.
  - [ ] `npm run test -w @golightly/worker-node`.
- [ ] Run script checks:
  - [ ] `npm run typecheck:scripts`.
- [ ] Run web checks:
  - [ ] `npm run typecheck -w @golightly/web`.
  - [ ] `npm run lint -w @golightly/web`.
  - [ ] `npm run build -w @golightly/web`.
- [ ] Manually verify seed script in a dev environment with `Tibetan Singing Bowl` present.
- [ ] Manually verify the Create flow:
  - [ ] Fresh user receives template and can play it.
  - [ ] Generate creates one staged row from edits.
  - [ ] Further Generate updates the same staged row.
  - [ ] Old staged audio is removed after regeneration setup.
  - [ ] Save to Library promotes the staged row.
  - [ ] Create returns to template after save.
- [ ] Confirm `/meditations/all` excludes template and staged rows for anonymous, authenticated, and admin callers.
- [ ] Confirm `/admin/meditations` still shows all stages.
- [ ] Review `Meditation.findAll` and `Meditation.findOne` call sites for missing library-stage filters outside staging, seed, and admin contexts.
- [ ] Update docs if implementation intentionally differs from `docs/20260520_PLAN_DEFAULT_EDITABLE_MEDITATION_V08.md`.
- [ ] Commit this phase with a message referencing `docs/20260520_TODO_DEFAULT_EDITABLE_MEDITATION.md` and phase 6.
