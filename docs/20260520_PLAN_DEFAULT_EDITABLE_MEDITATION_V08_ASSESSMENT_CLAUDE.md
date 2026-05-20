---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Assessment: Staged Default Meditation in Create Form V08

1. Staged-create branch omits `title` and `description`, which the model requires

   - Risk: V08's unified staged service spec (lines 206-210) lists `stage`, `visibility`, `status`, `filename`, `filePath`, and `durationSeconds` for the first-time create branch, but does not specify values for `title` or `description`. The `meditations.title` column is `allowNull: false` in `db-models/src/models/Meditation.ts:44-47`, so any insert without a title will raise a database error.
   - Why this materially matters: This is the very first DB write of the staged flow. If the implementer copies the V08 list literally, `Meditation.create` either throws on the NOT NULL violation or silently inserts an empty string that surfaces in the user's library after Save to Library, depending on the implementer's guess. Either outcome breaks the core "first Generate" path — the same path V06 was explicitly written to fix. Title is also user-visible in the library list later (after save), so an unspecified placeholder will leak into real product surfaces.
   - Relevant plan sections: lines 185-223 define the unified staged service algorithm; lines 206-210 enumerate the create-branch field values; line 209 mentions `filename`, `filePath`, `durationSeconds` but not `title` or `description`.
   - Mitigation: Specify the create branch's `title` and `description` values explicitly. Recommended: `title: "Untitled staged meditation"` (matches V06's prior wording), `description: null`. These are placeholders the user can overwrite in the Save to Library modal. Add an explicit step in the algorithm and a verification assertion that a freshly-created staged row has the placeholder title and `description = null`.

2. `SELECT ... FOR UPDATE` on a possibly-missing staged row is ambiguous

   - Risk: V08 step 4 (line 205) reads "Lock the user's existing `stage='staged'` row with `SELECT ... FOR UPDATE`." This is stated unconditionally, before the branch in step 5 that handles the no-row case. You cannot acquire `FOR UPDATE` on a row that does not exist, so an implementer following the step order literally will write code whose lock semantics fail on the cardinality-race path that step 7 was specifically designed to cover.
   - Why this materially matters: The concurrency safety V06/V07 worked to establish depends on the partial unique index catching duplicate inserts during simultaneous first-Generate attempts. V08's step 4 implies a different locking discipline (row-level pessimistic lock) than what the no-row branch actually needs (unique-conflict retry). An implementer trying to satisfy both step 4 and step 7 in one transaction could write code that holds an irrelevant lock, deadlocks on a related read, or misses the conflict-retry path entirely. The result is either silent duplicate-row creation in one of the two-tab race outcomes or a hung Generate request.
   - Relevant plan sections: lines 204-219 describe the algorithm; step 4 (line 205) is the unconditional lock statement; step 7 (line 219) is the unique-conflict retry.
   - Mitigation: Reorder/rephrase step 4 to make the lock conditional on row existence. Concrete restatement: "4. Inside the transaction, attempt to load the caller's `stage='staged'` row with `findOne({ where: { userId, stage: 'staged' }, lock: LOCK.UPDATE })`. The lock applies only if a row is returned. If the row is null, take the create branch; if non-null, take the regenerate branch." This matches the existing `regenerateMeditationFromScript` pattern and makes the relationship between the row-lock (regenerate branch) and the unique-index conflict (create branch) explicit.

3. `save-to-library` defers title/description/visibility validation to "existing rules" that do not exist as a shared helper

   - Risk: V08 lines 180-181 and line 137 say the save service "Validates title, description, and visibility using existing rules." The current validation lives inline in the route handlers at `api/src/routes/meditations.ts:82-98` (spreadsheet create) and `api/src/routes/meditations.ts:122-137` (script create). There is no extracted validator function — the rules are duplicated between the two existing endpoints already.
   - Why this materially matters: An implementer reading the plan will see "use existing rules" and either (a) copy the inline validation a third time, creating three drift points for any future change to title/description/visibility rules; (b) call into one of the two existing route handlers' internals; or (c) skip validation entirely because no shared helper exists to call. None of these are good. Option (a) is the most likely outcome and is the worst for maintainability — the next contributor to change a validation rule will fix two call sites and forget the third.
   - Relevant plan sections: line 137 (save service requirements) and lines 180-181 (`POST /meditations/staging/save-to-library` requirements).
   - Mitigation: Specify either (i) extract the inline validation into a shared helper as a prerequisite for the save service (e.g. `validateMeditationMetadata({ title, description, visibility })` in `api/src/services/meditations/validateMeditationMetadata.ts`), used by both the two existing creates and the new save endpoint; or (ii) name explicitly which subset of fields the save endpoint validates and what each rule is, so the implementer doesn't have to infer them from two slightly-different route handlers. Option (i) is strongly preferable — it removes the existing duplication as a side effect.
