---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Assessment: Staged Default Meditation in Create Form V07

1. Staging responses do not explicitly expose `stage` to the frontend

   - Risk: The plan adds a `MeditationStage` type alias and stores `stage` in the database, but it does not explicitly add `stage` to the shared `Meditation` response type or to `mapMeditationRecord` in the meditations router. The current response mapper omits `stage`.
   - Why this materially matters: The frontend flow depends on `stage === 'staged'` to decide whether Save to Library can appear. If `GET /meditations/staging` returns template or staged rows without the `stage` field, the client cannot reliably distinguish "shared template, do not save" from "user-owned staged meditation, can save when complete." That can block the save path after generation or accidentally show save controls for the template, depending on fallback logic.
   - Relevant plan sections: lines 58-69 add stage only as a type alias/service option; lines 75-77 define the staging read endpoint; line 142 makes the frontend Save-to-Library condition depend on `stage`; lines 146-153 list code changes but do not mention updating the API mapper or shared `Meditation` object.
   - Mitigation: Add `stage?: MeditationStage` or `stage: MeditationStage` to `shared-types/src/meditation.ts`'s `Meditation` type and include `stage: meditation.stage ?? "library"` in `mapMeditationRecord`. Verify `GET /meditations/staging`, `POST /meditations/staging/generate`, and `POST /meditations/staging/save-to-library` all return records with the correct stage, and add frontend/API tests for template-vs-staged button gating.
