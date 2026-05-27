---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Assessment: Staged Default Meditation in Create Form V02

1. Staging routes can be shadowed by the existing `/:id` route

   - Risk: The plan defines new static routes under `/meditations/staging`, but it does not say they must be registered before the existing parameterized routes. In the current router, `GET /meditations/:id` is registered before several later routes, and Express matches routes in declaration order.
   - Why this materially matters: If `GET /meditations/staging`, `POST /meditations/staging/generate`, or `POST /meditations/staging/save-to-library` are added after `/:id` or `/:id/*`, requests can be interpreted as an ID route with `id = "staging"` instead of reaching the staging handlers. That would make the Create form fail to load its staged/template meditation or make Generate/Save unreachable, which directly threatens successful implementation of the feature.
   - Relevant plan sections: lines 88-92 define the new staging endpoints; lines 98-105 make the frontend depend on those endpoints; line 125 says new staging endpoints should mirror the current create flow but does not call out route ordering relative to `/:id`.
   - Mitigation: Specify that all `/meditations/staging...` routes must be declared before `GET /meditations/:id`, `GET /meditations/:id/stream-token`, `GET /meditations/:id/stream`, `PUT /meditations/:id/script`, and `DELETE /meditations/:id`. Add route tests that call all three staging endpoints and prove they do not hit the numeric-ID handlers.

2. Concurrent generation of an existing staged row is not fully guarded

   - Risk: V02 protects against duplicate staged-row creation, but it does not fully specify how `POST /meditations/staging/generate` serializes updates once a staged row already exists. The plan says `getOrCreateStagedMeditation(userId)` locks or creates the row, then the endpoint overwrites content and runs the pipeline. If that lock is scoped only to the get-or-create helper, two Generate requests against the same existing staged row can still race while replacing job rows, clearing file fields, deleting previous audio, and notifying the worker.
   - Why this materially matters: The existing script regeneration path has a dedicated busy/status guard, row lock, processing-job check, job replacement, file cleanup, and worker notification sequence. Staged generation must support both spreadsheet and script payloads, but V02 only states that it reuses the pipeline. Without a single transaction around staged content replacement and job replacement, double-clicks, retries, or two open tabs can corrupt the staged job queue or leave the Play button pointing at stale or deleted audio.
   - Relevant plan sections: lines 57-58 discuss concurrency only for row creation and seeding; lines 90-92 define `POST /meditations/staging/generate`; line 104 makes Generate a primary user action; line 118 says staged generation does the same work as existing script regeneration.
   - Mitigation: Define a dedicated staged-regeneration service that owns the whole generate operation. It should lock the staged meditation row, reject or serialize requests when status is `pending` or `processing`, check for processing jobs before replacing the queue, update `meditation_array`, `script_source`, `source_mode`, `filename`, `file_path`, `duration_seconds`, and `status` in the same transaction, then delete old audio after commit and notify the worker once. Reuse this service for both spreadsheet and script mode, with tests for double-click or parallel Generate requests on an already-existing staged row.
