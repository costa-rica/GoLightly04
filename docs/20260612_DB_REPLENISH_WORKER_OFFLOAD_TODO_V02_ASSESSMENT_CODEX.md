---
created_at: 2026-06-12
updated_at: 2026-06-12
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# Assessment: DB Replenish Worker Offload TODO V02

TODO V02 addresses the five TODO V01 assessment concerns, but one qualifying concern remains against the accepted V02 plan.

## Required Revision

### 1. Add API propagation for `/process` worker 409s during replenish

The accepted plan adds a worker-wide maintenance guard so `POST /process` returns `409` while replenish is running. Its risk section states that meditations submitted during the replenish window are turned away and that "the calling API must propagate this as a retriable error to the browser."

TODO V02 updates the worker `/process` route, but it does not update the API worker notification path. The current API uses `void notifyWorker(...)` in multiple user-facing flows and `notifyWorker` logs/retries failures without throwing to the route caller. If the worker returns `409` during replenish, the API can still return success after creating or updating a meditation, leaving the meditation unprocessed with no user-visible retry signal.

Revise TODO V02 to add a phase or sub-phase that explicitly handles this contract:

- Update `api/src/services/workerClient.ts` so the `/process` notification path treats worker `409` as a conflict, not as a swallowed retry-only failure.
- Update user-facing API routes and services that call `notifyWorker(...)` to either await and propagate this conflict as a retriable `409`, or deliberately persist enough state for reliable later retry. Fire-and-forget calls must not silently lose work during a replenish maintenance window.
- Cover the affected call sites found by `rg "notifyWorker\\(" api/src`, including meditation create/regenerate/import flows and admin requeue.
- Add tests asserting that a worker `409` from `/process` during replenish is surfaced to the API caller instead of returning a misleading success response.
