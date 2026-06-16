---
created_at: 2026-06-12
updated_at: 2026-06-12
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# Assessment: DB Replenish Worker Offload Plan V01

The plan needs revision before implementation. The concerns below are qualifying because they risk existing functionality or likely implementation failure.

## Required Revisions

### 1. Add a worker-wide maintenance concurrency design

The plan only guards concurrent replenish jobs with `isReplenishRunning()` (`docs/20260612_DB_REPLENISH_WORKER_OFFLOAD_PLAN_V01.md:121-156`). That is not enough for the current worker architecture.

Existing worker endpoints can still run while replenish is truncating and repopulating the same tables:

- `/backup` only checks `isBackupRunning()` (`worker-node/src/app.ts:64-75`), so backup and replenish can overlap. A backup taken during restore can capture partially restored database rows or resource files.
- `/process` can continue processing active meditations while replenish truncates and repopulates `meditations` and `jobs_queue`. Active processing is tracked in `worker-node/src/processor/processMeditation.ts`, but only per meditation via `isMeditationActive(meditationId)`, and the plan does not block new or existing processing during restore.

Revise the plan to define a single worker-wide maintenance lock or equivalent coordination rule:

- `POST /replenish` must reject with `409` if a backup is running or any meditation processing is active.
- `POST /backup` and `POST /process` must reject with `409` while replenish is running.
- The implementation must expose whatever active-processing check is needed, such as an `isAnyMeditationActive()` helper, rather than checking only a single meditation id.
- Add tests for replenish-vs-backup and replenish-vs-process conflicts.

### 2. Make staged replenish filenames collision-resistant

The API route plan uses `replenish_${Date.now()}.zip` (`docs/20260612_DB_REPLENISH_WORKER_OFFLOAD_PLAN_V01.md:195-198`). That can collide if two admins or retries stage uploads in the same millisecond. A collision can overwrite or race the file that the worker is about to restore.

Revise the plan to require a collision-resistant basename, for example:

```ts
const filename = `replenish_${new Date().toISOString().replace(/[-:.]/g, "").replace("T", "_").replace("Z", "")}_${randomUUID()}.zip`;
```

The worker route should continue to validate that the final value is a basename and ends in `.zip`.

### 3. Specify staged-file cleanup when delegation is not accepted

The plan stages the upload before calling the worker and then intentionally leaves the staged copy in `db_replenish/` for the worker (`docs/20260612_DB_REPLENISH_WORKER_OFFLOAD_PLAN_V01.md:195-202`). It does not specify what happens when `requestWorkerReplenish()` returns `409` or fails after retries with `503`.

In those cases, no worker job owns the staged file. Leaving it indefinitely creates orphaned large archives and can inflate disk usage; the UI response also does not expose the staged filename for manual retry.

Revise the plan to require explicit cleanup semantics:

- If the worker accepts the job (`202`), leave the staged file for the worker.
- If the worker returns `409` or the API returns `503`, delete the newly staged file before responding, or return/store enough retry metadata to make retention intentional.
- Add API route tests for both failure paths to assert the staged file is not orphaned unintentionally.
