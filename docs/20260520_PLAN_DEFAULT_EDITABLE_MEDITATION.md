---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Staged Default Meditation in Create Form

## Context

The current Create Meditation form (`web/src/components/forms/CreateMeditationForm.tsx` + `ScriptMeditationEditor.tsx`) starts empty. Users hitting the page for the first time don't realize they need to type their own meditation text, and have no way to hear what a meditation sounds like before committing.

The goal is to give users a working starter meditation they can immediately play, edit, regenerate, and only commit to their library when they're ready. The design must:

1. Pre-populate the form with a shared default meditation (same content for every user).
2. Add a Play button that plays the current meditation audio (default or user-edited).
3. Show a Generate button only after the user has actually edited the content.
4. Hold the user's in-progress ("staged") meditation in the DB without polluting the library listing, until they explicitly save it.

Both spreadsheet mode and script mode must support this flow against the same backing content.

## Design summary

### Data model: one new column on Meditation

Add a `stage` enum column to the `meditations` table:

| Value | Meaning | Cardinality |
| --- | --- | --- |
| `template` | The global shared default meditation. Audio is seeded once. | Exactly one row globally. |
| `staged` | A user's in-progress meditation in the Create form. | At most one per user. |
| `library` | A normal meditation that appears in listings. | Many per user. Default for all existing rows. |

Why an enum and not a boolean: the three states are mutually exclusive and the listing/filtering logic is clearer when expressed as "where stage = 'library'" than "where is_default = false and is_staged = false".

All existing meditations get backfilled to `stage = 'library'`, so no listing behavior changes for the corpus that exists today.

### Server-side filtering

The single rule: `/meditations/all` and any owner-list query filter to `stage = 'library'`. Template and staged rows never appear there.

New owner-only endpoints:

- `GET /meditations/staging` — returns the caller's `staged` row if it exists, else returns the global `template` row. Frontend uses this to populate the Create form on mount.
- `POST /meditations/staging/generate` — body is `{ meditationArray | script, sourceMode }`. If the caller has no `staged` row, copy the global template into a new row with `stage='staged'` for that user, then overwrite its content with the submitted payload and run the pipeline. If the caller already has a `staged` row, update its content in place and re-run the pipeline (same path as existing `PUT /meditations/:id/script`).
- `POST /meditations/staging/save-to-library` — body is `{ title, description, visibility }`. Validates the staged row's status is `complete`, then flips `stage` to `library`, sets title/description/visibility. After this call, the user has no staged row again.

Title/description/visibility are not collected until the save-to-library step. While staged, the row carries placeholder values (e.g. title = "Untitled staged meditation").

### Frontend flow

On mount of the Create page:

1. Call `GET /meditations/staging`. Whatever rows/script it returns becomes the form's **initial** state.
2. Capture that initial state separately so we can dirty-check against it.
3. **Play button** streams that meditation's audio via the existing `/meditations/:id/stream` flow.
4. As the user edits, compute `isDirty` per mode:
   - Spreadsheet mode: deep-compare current rows to initial `meditationArray`.
   - Script mode: string-compare current text to initial `scriptSource`.
5. **Generate button** is only rendered when `isDirty === true`. On click, hit `POST /meditations/staging/generate` with the current payload. Poll status (reuse the existing polling logic in `TableMeditation.tsx` lines 91–111). Once complete, the Play button plays the new audio.
6. **Save to Library button** is only rendered when `isDirty === false` AND the current staged row's `status === 'complete'` AND the row's `stage === 'staged'` (so it doesn't appear when only the shared template is loaded — there's nothing to save). On click, open the existing `ModalConfirmCreateMeditation` for title/description/visibility, then submit to `POST /meditations/staging/save-to-library`.

Mode parity: the canonical content lives in the meditation's `meditation_array` (and `script_source` for script-mode users). The same staged row backs both modes; switching modes mid-edit uses the existing mode-switch UX without losing work.

### Seeding the template

Add `scripts/seedDefaultMeditation.ts` — a one-shot maintenance script (exempt from the V08 logging spec per `AGENTS.md`). It creates the single `stage='template'` row with a curated `meditation_array`, calls the existing `createMeditationFromElements` service path to run TTS + concatenation, and exits when the row reaches `status='complete'`. Idempotent: if a template row already exists, the script no-ops.

## Why this beats the alternatives

- **No per-user pre-generation.** The only pre-generated audio is the single shared template, generated once at seed time. We don't burn TTS quota generating per-user defaults nobody asked for.
- **No separate drafts table.** Adding one column keeps the JobQueue/concatenator pipeline untouched — staged rows go through the exact same processing path as library rows. The only behavior difference is the listing filter.
- **Reuses existing dirty-check pattern.** `ModalMeditationDetails.tsx` line 39 already does the same kind of `isScriptDirty` check; we lift that pattern into the create form.
- **Reuses existing regeneration pipeline.** `POST /meditations/staging/generate` for an existing staged row does the same work as the current `PUT /meditations/:id/script`.

## Critical files

Read-only references (existing patterns to reuse):

- `db-models/src/models/Meditation.ts` — schema definition; add `stage` column here.
- `api/src/routes/meditations.ts` lines 78–116 — current create flow; new staging endpoints mirror this shape.
- `api/src/services/meditations/createMeditationFromElements.ts` — pipeline entry; new staging endpoint reuses it.
- `worker-node/src/processor/processMeditation.ts` — no changes needed; staged rows process identically.
- `web/src/components/forms/CreateMeditationForm.tsx` — spreadsheet mode; add staging load + dirty check + Play/Generate/Save buttons.
- `web/src/components/forms/ScriptMeditationEditor.tsx` — script mode; same treatment.
- `web/src/components/modals/ModalMeditationDetails.tsx` lines 39, 114–135 — dirty-check pattern to mirror.
- `web/src/components/tables/TableMeditation.tsx` lines 91–111 — polling pattern to mirror for in-flight staged regenerations.

Files that will need new code (when implementation begins):

- New migration under `db-models/src/migrations/` for the `stage` column + backfill.
- New service `api/src/services/meditations/getOrCreateStagedMeditation.ts`.
- New service `api/src/services/meditations/saveStagedToLibrary.ts`.
- New script `scripts/seedDefaultMeditation.ts`.

## Verification

1. Run the seed script in a fresh environment. Confirm exactly one `stage='template'` row exists with `status='complete'` and a real audio file.
2. As an anonymous visitor, hit `/meditations/all` — template row absent.
3. As a fresh authenticated user, open Create form. Confirm form pre-populates from the template. Play button works.
4. Edit a row → Generate button appears. Click it. Poll until complete. Play the new audio.
5. Re-open the Create form in a new tab — user's staged content persists (not the template).
6. Switch between spreadsheet and script mode mid-edit — content stays consistent, dirty check still works.
7. Click Save to Library → confirm modal collects title/description/visibility → row appears in user's library, no longer in staging.
8. Open Create form again — back to the template.
9. As another user, confirm step 7's saved meditation doesn't appear in *their* staging area (their staging shows the template).
