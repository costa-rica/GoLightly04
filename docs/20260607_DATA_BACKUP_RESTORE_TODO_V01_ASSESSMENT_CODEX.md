---
created_at: 2026-06-07
updated_at: 2026-06-07
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Assessment: Data Backup Restore TODO V01

## Qualifying Concerns

### 1. Phase 5 tells implementers to swallow worker acceptance failures

Phase 5b says `requestWorkerBackup` should follow `notifyWorker` and "does
not re-throw after all retries fail"; Phase 5c then says
`POST /database/create-backup` should await that call and return HTTP 202
`"Backup job queued"`.

That sequencing can produce a false success in the admin UI. If the worker is
down or returns `409` for an already-running backup, the API would still return
202. Because the requirements intentionally avoid a job-history/status table,
there is no later UI state that can reveal the request was never accepted.

Recommended TODO correction:

- Change Phase 5b so `requestWorkerBackup` returns success only when the worker
  accepts the job.
- Propagate worker `409` as an API conflict.
- Return an API error when the worker cannot be reached after retries.
- Add validation tests for worker-unavailable and worker-conflict behavior.

### 2. Resource restore steps omit path and symlink safety checks

Phase 5c tells implementers to restore resources from
`path.join(tempDir, "resources")` to `env.PATH_PROJECT_RESOURCES` with a
recursive overwrite copy. The TODO does not require checks that copied files are
regular files, remain under the extracted `resources/` root, and resolve to
destinations under `PATH_PROJECT_RESOURCES`.

This is an implementation-success risk because the restore endpoint accepts an
uploaded archive and then writes filesystem contents. The checklist should
spell out the safety contract so implementation and tests converge on the same
behavior.

Recommended TODO correction:

- Add explicit tasks to validate manifest shape before resource restore.
- Add a safe recursive copy helper that uses `lstat`, copies only regular files,
  does not follow symlinks, and verifies resolved source/destination path
  containment.
- Reject or skip uploaded `resources/backups_db` and
  `resources/backups_db_and_data` entries.
- Add API tests for a combined restore with resources, path traversal attempts,
  and symlink/non-regular entries if practical in the test environment.

### 3. Validation checklist does not require tests for the new behavior

The TODO runs typecheck/test/build commands, but it does not instruct
implementers to update or add tests for the new contract. Existing
`api/tests/database/database.routes.test.ts` covers synchronous backup creation,
backup deletion from `backups_db`, and DB-only restore. The planned changes move
backup creation to worker-node, switch the listing path to
`backups_db_and_data`, add manifest/resource restore, add disk upload cleanup,
and add a new worker endpoint/service.

Without explicit test tasks, the listed validations can pass while the feature
still fails the requirements, especially around async worker acceptance and
combined package restore.

Recommended TODO correction:

- In the worker-node phases, add tests for `POST /backup` acceptance,
  concurrent `409`, DB-only backup output, combined backup output, manifest
  contents, backup-directory exclusion, and temp cleanup on failure.
- In the API phase, update database route tests for the new backups directory,
  worker acceptance/error propagation, disk-upload restore cleanup, legacy
  DB-only restore, and combined manifest/resource restore.
- In the web phase, add or document the selected validation method for the
  default-checked include-resources control and the destructive restore
  confirmation flow.
