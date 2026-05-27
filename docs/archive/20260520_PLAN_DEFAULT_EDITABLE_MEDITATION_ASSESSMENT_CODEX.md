---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Assessment: Staged Default Meditation in Create Form

1. Stage-aware access control is underspecified

   - Risk: The plan only requires `/meditations/all` and owner-list queries to filter to `stage = 'library'`, but staged and template rows can still be reached through existing ID-based routes such as `GET /meditations/:id`, `/meditations/:id/stream-token`, `/meditations/:id/stream`, update, delete, favorite, and script regeneration.
   - Why this materially matters: Existing detail and stream access allow any complete public meditation to be read or streamed by non-owners. The plan also says staged rows carry placeholder title/description/visibility until save, which means a staged row could easily remain `visibility = 'public'` after generation. That would make in-progress user content accessible by ID even though the feature requirement says staged meditations should be held in the DB without becoming part of the user's library. It also leaves template and staged rows open to mutation/favorite/delete paths that were designed for library meditations, creating regression risk around existing behavior.
   - Relevant plan sections: lines 39-49 describe the server filtering and placeholder metadata; lines 55-62 rely on existing stream behavior for both template and staged audio.
   - Mitigation: Define access rules for every ID-based meditation route, not just listing routes. Treat `stage = 'staged'` as owner-only regardless of `visibility`, block favorite/public detail access for non-library rows, and restrict update/delete/regenerate routes to the supported staged endpoints unless explicitly intended. Consider forcing staged rows to `visibility = 'private'` until `save-to-library`, and include route tests proving staged rows are absent from lists and inaccessible to other users by direct ID.

2. Template and staged row cardinality is not protected against races

   - Risk: The data model promises exactly one global template row and at most one staged row per user, but the plan only calls for a new enum column and idempotent application logic. It does not specify database constraints or transactional locking for these cardinality guarantees.
   - Why this materially matters: `POST /meditations/staging/generate` creates a staged row when none exists. Two tabs or retries can both observe no staged row and create duplicates for the same user. Likewise, concurrent seed runs can create multiple template rows if the no-op check is not protected by a unique constraint. Duplicate staged rows make `GET /meditations/staging` ambiguous and can send generation, polling, save-to-library, and subsequent Create form loads to different records. Duplicate template rows make new-user initialization nondeterministic.
   - Relevant plan sections: lines 29-33 define the cardinality guarantees; lines 45-47 describe the create-if-missing staged flow; lines 66-68 describe idempotent template seeding.
   - Mitigation: Add database-level guarantees in the migration, such as partial unique indexes for one `stage = 'template'` row globally and one `stage = 'staged'` row per `user_id`. Implement staged creation inside a transaction that handles unique-conflict retry by reloading the existing staged row. Make the seed script use the same constraint-backed find-or-create behavior, and add concurrency-oriented tests or at least duplicate-row regression tests for staging and seeding.
