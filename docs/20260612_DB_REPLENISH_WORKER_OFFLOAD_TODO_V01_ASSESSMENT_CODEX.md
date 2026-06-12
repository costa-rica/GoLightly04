---
created_at: 2026-06-12
updated_at: 2026-06-12
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# Assessment: DB Replenish Worker Offload TODO V01

The TODO mostly tracks the accepted V02 plan, but it has several qualifying concerns that should be revised before implementation. These are concrete sequencing and implementation-detail gaps likely to cause breakage or incomplete commits.

## Required Revisions

### 1. Fix deploy ordering around the `db_` directory cut-over

Phase 7 currently says to deploy `worker-node` first, then run the directory rename, then deploy `api` and `web`.

That ordering is unsafe for this plan because both worker and API path helpers are changing from `backups_db` / `backups_db_and_data` to `db_backups` / `db_backups_and_data`. The accepted plan states that the `mv` step must complete before or simultaneously with the service restart, because there is no dual-read fallback.

Revise Phase 7 so the directory rename is performed before restarting any deployed service version that expects the new names, or explicitly as part of the same maintenance window before the new worker/API are made available. Include verification that `db_backups/`, `db_backups_and_data/`, and `db_replenish/` exist before the new services are considered live.

Also make the runbook commands idempotent enough for operators to use safely in environments where a directory may already have been renamed, for example with guarded `mv` checks or explicit preflight verification.

### 2. Add package-file handling for the worker `unzipper` dependency

Phase 0 correctly notes that `unzipper` is required by the migrated `safeExtractZip`, but the current repo shows `unzipper` in `api/package.json` and not in `worker-node/package.json`.

The TODO says to add it if absent, but no phase or commit scope includes `worker-node/package.json` or `package-lock.json`. Phase 2's commit instructions only mention `worker-node/src/`, which would omit the dependency change and leave the worker build/runtime broken.

Revise Phase 2 or Phase 0 to explicitly run the workspace install/add step for `@golightly/worker-node`, stage `worker-node/package.json` and the root lockfile if changed, and include those files in the Phase 2 commit scope.

### 3. Require failure-path temp directory cleanup in `replenishService`

The accepted plan's risk section intentionally retains the staged zip on worker restore failure for manual retry, but it does not require retaining the extracted temp directory. The TODO currently says to delete `tempDir` and the staged zip only "after transaction commits", then only mentions resetting `_isReplenishRunning` in `finally`.

Revise Phase 3A to require a `finally` cleanup that always removes `tempDir` when it was created, while deleting the staged zip only after a successful restore. Otherwise failed worker restores can leak extracted archives in `/tmp`.

Suggested wording:

- Track `tempDir` in an outer variable.
- In `finally`, set `_isReplenishRunning = false` and `rm(tempDir, { recursive: true, force: true })` if present.
- Delete the staged zip only on the success path after the transaction commits and before the success log.

### 4. Update test mock instructions for new app-level imports

The TODO asks to add route tests for replenish conflicts, but it does not call out required updates to existing Jest mocks. This repo's existing route tests mock whole modules:

- `worker-node/tests/routes/backup.routes.test.ts` mocks `../../src/processor/processMeditation` without `isAnyMeditationActive`.
- `worker-node/tests/routes/process.routes.test.ts` mocks `../../src/processor/processMeditation` without `isAnyMeditationActive`.
- Both files will also need a mock for the new `../../src/services/replenishService` import once `app.ts` imports `isReplenishRunning`.
- `api/tests/database/database.routes.test.ts` mocks `../../src/services/workerClient` without `requestWorkerReplenish`, which the rewritten API route will import.

Revise Phase 6D, 6E, 6F, and 6H to explicitly update these existing mock factories so baseline tests continue to load the app module before the new assertions are added.

### 5. Add AGENTS.md frontmatter instructions to docs follow-up

Phase 8 modifies existing markdown files under `docs/`, but it does not remind the implementer to follow the repository's markdown frontmatter rules.

Revise Phase 8 to require preserving `created_at` and `created_by`, updating `updated_at` to `2026-06-12`, and setting `modified_by: codex (gpt-5.5)` or the actual implementing agent/model for every modified docs file. This is required by the repo instructions and is easy to miss in a documentation-only follow-up phase.
