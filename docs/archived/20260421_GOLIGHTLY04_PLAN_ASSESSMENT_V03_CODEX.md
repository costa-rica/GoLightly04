# GoLightly04 — Plan Assessment V03 (Codex)

Date: April 21, 2026

This review concludes that the plan is close, but it is not yet robust enough to execute without avoidable rework. The main architecture is workable, but several gaps remain between the written plan, the TODO breakdown, and the current `web/` codebase. The largest risk is that a meditation can be persisted successfully while the worker handoff fails, leaving the record stuck with no documented recovery path. There are also contract mismatches between the plan and the existing frontend data shape that will cause integration churn unless they are resolved before implementation starts.

## Overall Assessment

1. The high-level architecture is executable.
2. The current plan is not yet robust enough to be treated as implementation-ready.
3. The plan should be updated before work begins in order to prevent stuck jobs, API/frontend contract drift, and under-scoped web work.

## Fatal Flaws And High-Risk Gaps

### 1. Worker handoff failure can strand meditations with no recovery path

- The plan persists the meditation and `jobs_queue` rows in the API, then notifies `worker-node` with an HTTP POST.
- The API TODO explicitly says the worker client should retry three times, then log failure and still let the API request succeed.
- The same TODO says the worker can be "kicked manually by admin if needed", but no admin endpoint, CLI flow, reconciliation job, or retry-state design is actually defined.
- Result: a meditation can remain permanently `pending` even though the create request succeeded.

This is the biggest execution flaw in the current plan because it creates a silent failure mode in the core product path.

Recommended modification:

1. Add one explicit recovery mechanism before implementation starts.
2. Prefer one of these:
   - `POST /admin/meditations/:id/requeue`
   - `POST /admin/jobs/requeue-stuck`
   - worker polling for `pending` meditations/jobs in addition to API push
3. Add a documented stale-job rule, such as "any meditation left in `pending` for more than N minutes is eligible for requeue".
4. Add TODO tasks for the endpoint, authorization, tests, and admin UI action.

### 2. The meditation payload contract is not aligned with the current frontend

- The V02 assessment examples describe `meditation_array` items like:
  - `sequence`
  - `type`
  - `voiceId`
  - `pauseDuration`
  - `soundFile`
- The current frontend uses a different shape in [web/src/store/features/meditationSlice.ts](/Users/nick/Documents/GoLightly04/web/src/store/features/meditationSlice.ts:3) and [web/src/components/forms/CreateMeditationForm.tsx](/Users/nick/Documents/GoLightly04/web/src/components/forms/CreateMeditationForm.tsx:232):
  - `id`
  - `voice_id`
  - `pause_duration`
  - `sound_file`
  - no persisted `type` field on `MeditationElement`

This is not just a style difference. It affects:

1. `POST /meditations/create`
2. `GET /meditations/all`
3. the JSONB snapshot stored in `meditations.meditation_array`
4. any future meditation detail/edit flow

Recommended modification:

1. Declare one canonical DTO for meditation elements before implementation begins.
2. Decide whether the canonical API shape is:
   - camelCase with explicit `type`
   - or the existing snake_case shape already used by the frontend
3. Add mapping rules at the API boundary if the DB snapshot uses a different internal representation.
4. Update the plan and TODOs to name the canonical contract explicitly.

### 3. The web scope is materially under-planned

- The TODO set includes `api`, `db-models`, and `worker-node`, but no standalone `web` TODO file.
- V02 says frontend work can be folded into the API TODO, but the required frontend work is broader than the Jobs Queue table.
- The plan includes initial-build support for:
  - Google OAuth
  - email verification
  - password reset
  - updated queue/admin flows
  - possible single meditation detail usage

The current web app already has auth and meditation client code, which means this is not greenfield work. It needs explicit reconciliation work, not just a few API-adjacent notes.

Recommended modification:

1. Create `docs/requirements/20260421_TODO_WEB.md`.
2. Include at minimum:
   - Google auth integration validation against the final backend contract
   - verify/reset-password screen contract validation
   - meditation element DTO alignment
   - admin Jobs Queue rename and destructive-action copy updates
   - auth token and stream behavior verification
3. Treat `web` as a first-class implementation track, not a footnote in the API TODO.

## Important Improvements That Will Greatly Improve Robustness

### 4. Database provisioning via `sequelize.sync()` is acceptable for a spike, but weak for a durable build

- The `db-models` TODO currently leans toward `sequelize.sync()` as sufficient for the initial build.
- The API startup plan also provisions the database automatically on boot.
- This is executable, but it is the least robust part of the infrastructure plan, especially once ENUMs or schema changes start evolving.

Risks:

1. startup-time schema mutation in app runtime
2. multi-instance boot races
3. weak change tracking for future schema revisions
4. harder rollback behavior

Recommended modification:

1. Keep startup validation and directory creation in `onStartUp.ts`.
2. Move schema creation/evolution to a dedicated migration path, even if the first version is lightweight.
3. If you intentionally keep `sync()` for v1, mark it as a temporary bootstrap choice and add a follow-up migration task to the plan now.

### 5. The authenticated audio flow conflicts with the stated streaming strategy

- V02 chooses `GET /meditations/:id/stream` with Range support and `listen_count` auto-increment.
- The current authenticated player in [web/src/components/AudioPlayer.tsx](/Users/nick/Documents/GoLightly04/web/src/components/AudioPlayer.tsx:49) fetches the whole file as a blob and then plays the object URL.
- That means logged-in users may bypass real streaming behavior and Range semantics entirely.

This is not fatal, but it is a meaningful product/implementation mismatch.

Recommended modification:

1. Decide whether authenticated playback should be true streaming or blob download.
2. If true streaming is the goal, update the frontend plan so authenticated playback uses the stream endpoint directly.
3. If blob download is acceptable, update the backend expectations and `listen_count` semantics accordingly.

### 6. Queue deletion semantics are dangerous enough that the UI and plan should over-communicate them

- V02 correctly changes queue-row deletion into full meditation cascade deletion.
- The current admin UI still frames this action as deleting only the queue record in [web/src/app/admin/page.tsx](/Users/nick/Documents/GoLightly04/web/src/app/admin/page.tsx:923).
- The API TODO mentions the new confirm copy inside the table rewrite, but the broader page copy and success-state behavior are still easy to miss.

Recommended modification:

1. Add explicit TODO items to update:
   - modal title
   - modal body
   - confirm label
   - toast/success text
   - admin section description
2. Use "Delete meditation from queue" or similar wording that makes the cascade behavior unmistakable.

## Recommended Plan Changes Before Implementation

1. Add a recovery path for meditations whose worker notification fails.
2. Freeze one canonical meditation element DTO and update both plan and TODO docs to match it.
3. Split out a dedicated `web` TODO file.
4. Tighten the database migration/provisioning strategy.
5. Reconcile authenticated playback behavior with the intended streaming model.
6. Clarify destructive queue-delete behavior across the admin UI and docs.
7. Normalize TODO filenames and cross-references.

## Final Recommendation

The plan is directionally good and the architecture is sensible, but it should not be treated as final implementation guidance until the items above are resolved. If these changes are incorporated, the project will be much more executable and much less likely to incur integration churn during build-out.
