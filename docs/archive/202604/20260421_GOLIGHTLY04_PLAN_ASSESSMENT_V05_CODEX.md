# GoLightly04 — Plan Assessment V05 (Codex)

Date: April 21, 2026

This review finds that the revised plan is much stronger than the prior version, and most of the earlier concerns have been addressed well. However, there is still one important execution flaw in the worker recovery design that should be corrected before implementation starts.

## Summary

1. The new plan is close to implementation-ready.
2. The web rebuild, shared-types package, stream-token approach, and admin requeue flow are all meaningful improvements.
3. One recovery flaw remains: requeue and boot-time reconciliation do not fully restore failed or interrupted jobs into a processable state.

## Remaining Fatal Issue

### Worker recovery still leaves some meditations permanently stuck

The revised docs add two good recovery tools:

- `POST /admin/meditations/:id/requeue`
- worker boot-time reconciliation for meditations in `pending` or `processing`

But the surrounding TODO logic still has a gap:

1. `processMeditation()` only fetches `jobs_queue` rows where `status = 'pending'`
2. the new requeue endpoint says that if `meditations.status = failed`, it resets the meditation to `pending`
3. it does not say that failed `jobs_queue` rows are also reset from `failed` back to `pending`
4. the worker reconciliation step also does not say that `processing` jobs left behind by a crash are reset back to `pending`

That creates two stuck-state cases:

1. ElevenLabs failure case
   - a text job is marked `failed`
   - the meditation is marked `failed`
   - admin clicks requeue
   - the meditation may become `pending`, but the failed job is still `failed`
   - `processMeditation()` only selects `pending` jobs, so that failed job is never retried

2. Worker crash / restart case
   - a meditation is set to `processing`
   - one or more jobs are left at `processing`
   - worker restarts and reconciliation finds the meditation
   - `processMeditation()` still only selects `pending` jobs
   - any stranded `processing` jobs remain unclaimable forever

This means the new recovery design can still fail to recover the exact cases it was added to solve.

## Required Modification

Add one explicit reset rule before requeue/reconciliation hands a meditation back to `processMeditation()`.

Recommended rule:

1. admin requeue flow:
   - set `meditations.status = 'pending'`
   - reset all `jobs_queue` rows for that meditation where `status IN ('failed', 'processing')` back to `pending`
   - clear any transient error metadata if such fields are later added
   - then notify the worker

2. worker boot-time reconciliation flow:
   - for any meditation selected for reconciliation, first normalize stale job states
   - convert stranded `processing` jobs back to `pending`
   - optionally leave `complete` rows untouched
   - then run the normal processor

3. document one guardrail:
   - only reset `processing` rows during boot-time reconciliation if they are stale from a previous process lifecycle, not from an actively running worker instance

## TODO Changes Needed

### `docs/requirements/20260421_TODO_API.md`

- Update `POST /admin/meditations/:id/requeue` so it also resets `jobs_queue.status` from `failed` and `processing` to `pending` before sending the worker notification.

### `docs/requirements/20260421_TODO_WORKER_NODE.md`

- Update boot-time reconciliation to normalize stranded `processing` jobs back to `pending` before reprocessing.
- Clarify whether reconciliation may also reset `failed` jobs, or whether that path is admin-only via requeue.

## Final Recommendation

Once the job-status reset behavior is added, the revised plan looks strong and executable. Without that change, the project still has a real risk of meditations becoming unrecoverably stuck after worker failure, API-to-worker handoff failure followed by retry, or mid-process worker crashes.
