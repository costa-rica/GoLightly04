---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Assessment: Staged Default Meditation in Create Form V05

1. First Generate can create a staged row that the regeneration service immediately rejects

   - Risk: The plan says `getOrCreateStagedMeditation` creates a new staged row by calling `createMeditationFromElements` with `stage: "staged"` and template elements, then `POST /meditations/staging/generate` calls `regenerateStagedMeditation`. The create service initializes new rows with `status = "pending"`, while the staged regeneration service rejects any row whose status is not `complete` or `failed`.
   - Why this materially matters: For a fresh user with no staged row, the first edit + Generate request can create a pending staged row copied from the template, then fail with `409 MEDITATION_BUSY` before applying the user's edited payload. That would block the core feature path and could strand the user with a staged row containing template content instead of their edits.
   - Relevant plan sections: lines 59-76 define the extended create service used by staged creation; lines 157-159 describe the generate wrapper and the staged create path; lines 163-169 define Generate as the primary frontend path.
   - Mitigation: Do not create the first staged row by running the normal creation pipeline on template elements and then immediately regenerating it. Instead, make the generate endpoint use a single create-or-regenerate staged service: if no staged row exists, insert the staged row directly from the submitted payload with `stage = "staged"`, `visibility = "private"`, `status = "pending"`, null file fields, and JobQueue rows in one transaction, then notify the worker. If a staged row already exists, use the locked regeneration path. Alternatively, if `getOrCreateStagedMeditation` must remain separate, it should create an inert row in a regeneratable state and avoid enqueueing template jobs, but the single service is cleaner and avoids wasted work.
