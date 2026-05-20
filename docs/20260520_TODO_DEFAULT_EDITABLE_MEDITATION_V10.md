---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: codex (gpt-5)
---

# TODO Default Editable Meditation V10

Source plan: `docs/20260520_PLAN_DEFAULT_EDITABLE_MEDITATION_V10.md`

## Phase 1 — Data model and shared response contract

- [x] Add `stage` enum support to `meditations` with values `template`, `staged`, and `library`.
- [x] Default and backfill existing rows to `stage = 'library'`.
- [x] Add a partial unique index for exactly one global `template` meditation.
- [x] Add a partial unique index for at most one `staged` meditation per user.
- [x] Update the shared `Meditation` type to include `stage`.
- [x] Update meditation record mapping so every meditation API response includes `stage`, defaulting legacy/null values to `library`.
- [ ] Verify the migration runs cleanly and the shared type/build checks pass.

## Phase 2 — Shared backend helpers

- [x] Create `validateMeditationMetadata` for normalized title, description, and visibility validation.
- [x] Use `validateMeditationMetadata` in existing create routes for spreadsheet and script modes.
- [x] Extend `createMeditationFromElements` with optional `stage?: MeditationStage`, defaulting to `library`.
- [x] Extract `getOrCreateBenevolentUser` from the admin router into a reusable user service.
- [x] Update the admin router to use the extracted benevolent-user helper.
- [x] Verify existing create flows still create `library` rows and preserve current behavior.

## Phase 3 — Template seed and admin protections

- [x] Implement or update `scripts/seedDefaultMeditation.ts` to seed the exact starter script from the plan.
- [x] Resolve `Tibetan Singing Bowl` through a lowercase trimmed `SoundFile` lookup and fail before row creation if missing.
- [x] Parse the starter script and persist the parser output directly with `stage: "template"`, `sourceMode: "script"`, and byte-for-byte `scriptSource`.
- [x] Notify the worker once and poll until the template reaches `complete` or `failed`.
- [x] Make repeat seed runs idempotent: reload the existing template and exit 0 only when it is already complete.
- [x] Add the `DELETE /admin/users/:id` protected-user guard for users who own a template row.
- [ ] Verify fresh seed, repeat seed, template owner, script source, persisted elements, and missing-sound failure cases.

## Phase 4 — Staging endpoints and generate service

- [x] Declare `/meditations/staging*` routes before any `/:id` meditation routes.
- [x] Add `GET /meditations/staging` to return the caller's staged row or the global template without creating rows.
- [x] Create `createOrRegenerateStagedMeditation` for script and spreadsheet staging payloads.
- [x] Implement first-time staged create with placeholder metadata, private visibility, pending status, and persisted JobQueue rows.
- [x] Implement staged regenerate with row locking, complete/failed status requirement, active-job conflict checks, in-place updates, and previous-audio cleanup after commit.
- [x] Handle first-create unique-index races with one retry and correct `409 MEDITATION_BUSY` behavior.
- [x] Add `POST /meditations/staging/generate` to call the unified staged generate service and return `stage: "staged"`.
- [ ] Verify first generate, repeated generate, worker notification, old audio cleanup, and generate concurrency cases.

## Phase 5 — Save to Library service and library filtering

- [x] Create `saveStagedToLibrary` with metadata validation, staged-row lock, stage/status re-checks, and active-job checks.
- [x] Add `POST /meditations/staging/save-to-library` to promote a complete staged row to `library`.
- [x] Ensure save returns 404 when no staged row exists and `409 MEDITATION_BUSY` when generation work is active.
- [x] Filter all user-facing library/listing/search/favorites surfaces to `stage = 'library'` where applicable.
- [x] Preserve `/admin/meditations` and `/admin/queuer` visibility across all stages.
- [ ] Verify anonymous, authenticated, and admin library listing behavior before and after saving a staged row.

## Phase 6 — Access control and mutation guards

- [x] Create `assertMeditationAccess(meditation, requester, intent)` for user-facing ID routes.
- [x] Apply access rules to detail, stream token, stream, update, script update, delete, and favorite routes.
- [x] Ensure staged rows are owner-only for read/stream and rejected through normal library mutation routes.
- [x] Ensure template rows are readable/streamable but rejected for API update, delete, favorite, and other mutations.
- [x] Create `assertAdminMeditationMutable(meditation, intent)` for admin mutation routes.
- [x] Protect template delete, queue delete, and requeue with `409 PROTECTED_TEMPLATE`.
- [x] Allow staged admin delete and staged admin requeue as recovery paths.
- [ ] Verify owner, other-user, anonymous, and admin access-control cases.

## Phase 7 — Frontend staging lifecycle

- [x] Move or centralize staging lifecycle state above both create editors in `CreateMeditationModeSwitcher`, or provide a shared hook/context with one source of truth.
- [x] Load `GET /meditations/staging` once and pass shared staging state and callbacks into spreadsheet and script editors.
- [x] Track shared stage, status, meditation id, initial rows, initial script, current drafts, dirty state, polling state, generate, refresh, reset, and save callbacks.
- [x] Wire Generate in both modes to `POST /meditations/staging/generate` through the shared callback.
- [x] Refresh shared state after Generate so both editors receive the same staged row.
- [x] Wire Save to Library in both modes to `POST /meditations/staging/save-to-library` through the shared callback.
- [x] Reload staging after Save so both editors reset to the shared template state.
- [x] Show Generate only for the active dirty mode, disable Generate while pending/processing, and show `Generation in progress - please wait` on `409 MEDITATION_BUSY`.
- [x] Show Save to Library only when `stage === "staged"`, `status === "complete"`, and the active mode is clean.
- [x] Hide Save to Library for template responses.
- [ ] Verify template play-before-edit, staged play-after-generate, mode switching after generate, mode switching after save, and stale hidden-editor prevention.

## Phase 8 — End-to-end verification and commit

- [x] Run the project's tests after all phases that touch code.
- [x] Run the project's type-check or build step after TypeScript changes.
- [ ] Confirm the full seed verification list from the plan.
- [ ] Confirm the full API response contract verification list from the plan.
- [ ] Confirm metadata validation, library listing, staging flow, concurrency, access control, and frontend verification lists from the plan.
- [ ] Check off completed tasks only after applicable tests/builds pass.
- [ ] Commit completed work by phase, with commit messages referencing this TODO file and the phase completed.
