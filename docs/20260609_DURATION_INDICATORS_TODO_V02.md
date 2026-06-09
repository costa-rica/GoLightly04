---
created_at: 2026-06-09
updated_at: 2026-06-09
created_by: claude (sonnet)
modified_by: codex (gpt-5)
---

# TODO: Duration Indicators

Execution checklist for the design in [20260609_DURATION_INDICATORS_PLAN_V02.md](20260609_DURATION_INDICATORS_PLAN_V02.md). The plan is the source of truth for **why** and **exactly what** to change. This file is the execution scaffold — open V02 alongside it.

## How to use this file

- Work one phase at a time, top to bottom. Phases are ordered so each builds on the previous.
- For every item, the V02 plan section named in parentheses has the full detail (file paths, function signatures, exact object literals).
- **Per-phase gate** (run before checking anything off):
  1. Run **type checks** for the package(s) touched (`npm run typecheck -w @golightly/<pkg>`).
  2. Run **tests** for packages that have them (`npm test -w @golightly/<pkg>`).
  3. **Attempt to build** packages that require it.
  4. If any check fails, go back and fix the code before checking items off.
  5. **Only after all checks pass**, mark completed items and **commit all changes for that phase**.
- One phase = one commit. Do not bundle phases.
- Commit message format per [AGENTS.md](../AGENTS.md): lowercase title ≤ 50 chars, body summarizing scope, `co-authored-by:` trailer; reference this file and the phase (e.g., `feat: phase 2 — db-models and shared-types (docs/20260609_DURATION_INDICATORS_TODO_V02.md)`).

---

## Phase 1 — Database Migration

> **HARD GATE.** No code that reads or writes `duration_seconds_talking`, `duration_seconds_pause`, or `duration_seconds_sound` may be deployed to any environment until the migration has been applied to that environment. The migration file may be committed to the repo before environments are updated; the deployment gate applies at deploy time, not at commit time.

Plan §Database.

- [x] Create `db-models/migrations/20260609_add_duration_seconds_segments.sql` following the pattern of `20260518_add_duration_seconds.sql`:
  ```sql
  ALTER TABLE meditations
    ADD COLUMN IF NOT EXISTS duration_seconds_talking INTEGER NULL,
    ADD COLUMN IF NOT EXISTS duration_seconds_pause   INTEGER NULL,
    ADD COLUMN IF NOT EXISTS duration_seconds_sound   INTEGER NULL;
  ```
- [x] Apply the migration to the **development** environment: `psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d $PG_DATABASE -f db-models/migrations/20260609_add_duration_seconds_segments.sql`
- [x] Verify all three columns exist in the `meditations` table in development (e.g., `\d meditations` in psql).
- [x] Apply the migration to the **production** environment using the same command against the production connection.
- [x] Verify all three columns exist in production.

**Per-phase gate:**
- [x] Migration file created at the correct path
- [x] Columns confirmed present in development environment
- [x] Columns confirmed present in production environment
- [x] Commit the migration file (and only the migration file) referencing this file + Phase 1

---

## Phase 2 — db-models and shared-types

> Foundation for all subsequent code phases. Complete before starting Phases 3–6.

Plan §Model and §Shared types.

- [x] Update `db-models/src/models/Meditation.ts`: add three fields following the `durationSeconds` pattern at line 100. Each field: `DataTypes.INTEGER`, `allowNull: true`, with a `field:` entry mapping to its snake_case column name:
  - `durationSecondsTalking` → `duration_seconds_talking`
  - `durationSecondsPause` → `duration_seconds_pause`
  - `durationSecondsSound` → `duration_seconds_sound`
- [x] Update `shared-types/src/meditation.ts`: add three optional nullable number fields to the `Meditation` type:
  ```typescript
  durationSecondsTalking?: number | null;
  durationSecondsPause?: number | null;
  durationSecondsSound?: number | null;
  ```
  No changes to `web/src/store/features/meditationSlice.ts` are needed — it re-exports `Meditation` directly from `@golightly/shared-types`.

**Per-phase gate:**
- [x] `npm run typecheck -w @golightly/db-models` passes
- [x] `npm run typecheck -w @golightly/shared-types` passes
- [x] (Equivalently: `npm run typecheck:shared` at repo root passes)
- [x] Check off completed items above
- [x] Commit referencing this file + Phase 2

---

## Phase 3 — API: Serializers and Rebuild-Reset Paths

Plan §API: serializers and §API: reset on rebuild.

**Serializers:**
- [x] Update `mapMeditationRecord()` in `api/src/routes/meditations.ts` (line 31): add the three new fields mirroring the `durationSeconds: meditation.durationSeconds ?? null` pattern:
  ```typescript
  durationSecondsTalking: meditation.durationSecondsTalking ?? null,
  durationSecondsPause:   meditation.durationSecondsPause   ?? null,
  durationSecondsSound:   meditation.durationSecondsSound   ?? null,
  ```
- [x] Update `serializeAdminMeditationRow()` in `api/src/routes/admin.ts` (line 24): same three fields, same pattern.

**Rebuild-reset paths:**
- [x] Update `api/src/services/meditations/createOrRegenerateStagedMeditation.ts`: locate both `update()` blocks that already set `durationSeconds: null`; add `durationSecondsTalking: null`, `durationSecondsPause: null`, `durationSecondsSound: null` to each block.
- [x] Update `api/src/services/meditations/regenerateMeditationFromScript.ts`: in the `lockedMeditation.update()` call inside the transaction that sets `durationSeconds: null` and `status: "pending"`, add the same three new fields.

**Tests (required per V02 §Automated verification):**
- [x] Add a test asserting that `mapMeditationRecord()` includes `durationSecondsTalking`, `durationSecondsPause`, and `durationSecondsSound` in its output with the correct camelCase field names.
- [x] Add a test asserting that `serializeAdminMeditationRow()` includes the same three fields.
- [x] Add a test asserting that the `createOrRegenerateStagedMeditation` rebuild-reset path writes `null` for all three new fields (not just `durationSeconds`) when a pending rebuild is triggered.
- [x] Add a test asserting that the `regenerateMeditationFromScript` rebuild-reset path writes `null` for all three new fields.

**Per-phase gate:**
- [x] `npm run typecheck -w @golightly/api` passes
- [x] `npm test -w @golightly/api` passes (all new tests green, no regressions)
- [x] Check off completed items above
- [x] Commit referencing this file + Phase 3

---

## Phase 4 — Worker: Concatenator Extension

Plan §Worker: population and §Automated verification → worker-node.

- [x] Extend `concatenateMeditation()` in `worker-node/src/services/concatenator.ts`:
  - Declare three accumulators before the job loop: `talkingTotal`, `pauseTotal`, `soundTotal` (all start at 0).
  - In the loop (alongside existing `normalizedFiles` accumulation), for each job by type:
    - **Text jobs:** call `probeDurationSeconds()` on the normalized temp file at `target`; add the result to `talkingTotal`.
    - **Sound jobs:** call `probeDurationSeconds()` on the normalized temp file; add the result to `soundTotal`.
    - **Pause jobs:** add `Math.round(Number(inputData.pause_duration ?? 0))` to `pauseTotal` — no probe call; silence duration equals the requested value by construction.
  - Pass all three totals into the existing `meditation.update()` call alongside the already-present `status`, `filename`, `filePath`, and `durationSeconds` fields:
    ```typescript
    durationSecondsTalking: talkingTotal,
    durationSecondsPause:   pauseTotal,
    durationSecondsSound:   soundTotal,
    ```
  - If concatenation throws before reaching `meditation.update()`, the three fields are not written; this is correct behavior.
- [x] Add a unit test for the accumulation logic: construct a synthetic job list with known text, pause, and sound entries; stub or inject `probeDurationSeconds` rather than invoking real ffprobe; assert that the three totals written to `meditation.update()` match the expected values.

**Per-phase gate:**
- [x] `npm run typecheck -w @golightly/worker-node` passes
- [x] `npm test -w @golightly/worker-node` passes (accumulation unit test green, no regressions)
- [x] Check off completed items above
- [x] Commit referencing this file + Phase 4

---

## Phase 5 — Backfill Script

Plan §Backfill script and §Implementation sequence step 7.

**Pre-check (run before writing the script):**
- [ ] Count complete meditations with zero matching `jobs_queue` rows:
  ```sql
  SELECT COUNT(*)
  FROM meditations m
  WHERE m.status = 'complete'
    AND NOT EXISTS (
      SELECT 1 FROM jobs_queue j WHERE j.meditation_id = m.id
    );
  ```
  If this count is unexpectedly high, stop and revisit the V02 §Assumptions and §Risks sections before proceeding. A high count means the backfill will leave many rows unpopulated and the Guidance indicator will show gray for them.

**Implementation:**
- [ ] Write `scripts/backfill-segment-durations.ts` following the structure of `scripts/backfill-meditation-durations.ts`:
  - Supports `--apply`, `--force`, `--limit`, and `--help` flags.
  - `--help` must print usage information and exit successfully **before** any database initialization; no DB connection is opened when `--help` is passed. This is required so that `npm run backfill:segment-durations -- --help` can be used as a smoke test that does not depend on the DB being reachable.
  - For each `complete` meditation (respecting `--limit`):
    1. Fetch all `jobs_queue` rows for that meditation ordered by `sequence`.
    2. Compute `durationSecondsPause` by summing `Math.round(Number(inputData.pause_duration ?? 0))` across pause jobs.
    3. Compute `durationSecondsSound` by probing the prerecorded sound file path constructed from `inputData.sound_file` against the known prerecorded audio root.
    4. Compute `durationSecondsTalking` by probing the ElevenLabs source file at `job.filePath` for text jobs (raw synthesis outputs, not normalized temp files).
    5. Write all three fields in a single `update()` per meditation.
  - If a source file is missing or unreadable: log a warning, increment a per-category `skippedMissingFile` counter, and still write valid values for categories where all files were found (leave null for categories with missing files).
  - Skip meditations where `--force` is not set and all three fields are already non-null.
  - Print a JSON summary including total processed, total skipped (already populated), and per-category `skippedMissingFile` counts.
  - Call `sequelize.close()` in a `finally` block.
  - Uses `console.*` per the one-shot script exemption in AGENTS.md.
- [ ] Add the `backfill:segment-durations` entry to the root `package.json` scripts, following the pattern of `backfill:durations` and `backfill:sound-durations`:
  ```json
  "backfill:segment-durations": "TS_NODE_PROJECT=tsconfig.scripts.json ts-node --transpile-only scripts/backfill-segment-durations.ts"
  ```
  The script file and the `package.json` change must be committed together.
- [ ] Run `npm run backfill:segment-durations -- --help` and confirm it prints usage and exits successfully without TypeScript or runtime errors and without opening a DB connection.
- [ ] Run `npm run typecheck:scripts` and confirm it passes.

**Per-phase gate:**
- [ ] `jobs_queue` pre-check above was run and the result was acceptable
- [ ] `npm run backfill:segment-durations -- --help` prints usage and exits successfully
- [ ] `npm run typecheck:scripts` passes
- [ ] Check off completed items above
- [ ] Commit `scripts/backfill-segment-durations.ts` and root `package.json` together, referencing this file + Phase 5

---

## Phase 6 — Dry-run and Threshold Calibration

> **DATA GATE.** This phase is a hard prerequisite for Phase 7. `MID_THRESHOLD` and `HIGH_THRESHOLD` in `TableMeditation.tsx` must be set to values derived from real data produced in this phase. They must not be assigned arbitrary placeholder values that are left unchanged at merge.

Plan §Implementation sequence steps 8.

- [ ] Run a dry-run against a populated environment (development or production — production preferred for representative data): `npm run backfill:segment-durations -- --limit 10`
  - No `--apply` flag; this is a read-only dry-run.
- [ ] Review the JSON output:
  - Examine the distribution of `durationSecondsTalking` values across the sample.
  - Note any `skippedMissingFile` warnings and whether they are expected.
  - Assess overall plausibility of all three fields.
- [ ] If the 10-row sample shows poor spread (e.g., all values cluster in one color bucket), increase `--limit` to 50 or higher and re-run until the distribution is representative enough to calibrate thresholds.
- [ ] Determine `MID_THRESHOLD` and `HIGH_THRESHOLD` values from the distribution:
  - Values below `MID_THRESHOLD` → gray (low guidance)
  - Values from `MID_THRESHOLD` to below `HIGH_THRESHOLD` → light-blue (medium guidance)
  - Values at or above `HIGH_THRESHOLD` → yellow (high guidance)
- [ ] Record the chosen threshold values and sample size used below, so the rationale is traceable:

  > **Calibration record:**
  > Sample size: ___
  > `MID_THRESHOLD`: ___
  > `HIGH_THRESHOLD`: ___
  > Distribution summary: ___

**Per-phase gate:**
- [ ] Dry-run completed against real data
- [ ] `MID_THRESHOLD` and `HIGH_THRESHOLD` values confirmed and recorded above
- [ ] Do not begin Phase 7 until both values are filled in above

---

## Phase 7 — Web: Guidance Column

> **Prerequisite:** Threshold values from Phase 6 must be confirmed and recorded before any task in this phase is committed.

Plan §Web: Guidance column and §Automated verification → web.

- [ ] Add a `formatGuidanceDuration` helper in `web/src/components/tables/TableMeditation.tsx` (or a co-located formatter file):
  - `null` or `undefined` → `"-"` (or `""`, consistent with other empty-state labels in the table)
  - Values under 60 s → `"<N>s"` (e.g., `"45s"`)
  - Values at or above 60 s → minute-and-second form (e.g., `"1m 30s"`)
  - **Do not reuse `formatDurationOrDash`** for this tooltip — it rounds to whole minutes and produces `"0 mins"` for sub-60s values, which is uninformative.
- [ ] Define `MID_THRESHOLD` and `HIGH_THRESHOLD` constants at the top of the component, set to the values confirmed in Phase 6.
- [ ] Add `guidanceColor(seconds: number | null | undefined): string` function returning the appropriate gray / light-blue / yellow Tailwind class based on `MID_THRESHOLD` and `HIGH_THRESHOLD`.
- [ ] Add the `Guidance` column header to the desktop table in `web/src/components/tables/TableMeditation.tsx`.
- [ ] In each desktop table row, render a small circle or pill element in the Guidance cell:
  - `className={guidanceColor(meditation.durationSecondsTalking)}`
  - `title={formatGuidanceDuration(meditation.durationSecondsTalking)}`
  - No text inside the cell element; no ratio display.
- [ ] Increment the desktop table's empty-state `colSpan` by 1 for the new column.
- [ ] Add the Guidance indicator inline with existing length metadata in the mobile card view.
- [ ] Confirm `TableAdminMeditations.tsx` is **not** modified — it is out of scope.

**Per-phase gate:**
- [ ] `npm run typecheck -w @golightly/web` passes
- [ ] `npm run build -w @golightly/web` passes
- [ ] Manual browser check:
  - [ ] Guidance cell renders with correct color for a meditation with a known `durationSecondsTalking` value
  - [ ] Hovering the indicator shows the `formatGuidanceDuration` label (e.g., `"45s"` or `"1m 30s"`)
  - [ ] A meditation with null `durationSecondsTalking` shows gray with `"-"` tooltip
  - [ ] Desktop empty-state row spans the correct number of columns
  - [ ] Mobile card shows the Guidance indicator
- [ ] Check off completed items above
- [ ] Commit referencing this file + Phase 7

---

## Phase 8 — Worker Deployment and Verification

> **DEPLOYMENT GATE.** This phase is a hard prerequisite for Phase 9. The `--apply` backfill run must not be executed until the worker path is verified here. This confirms that the values the worker writes are correct before any backfill writes the same fields to historical rows.

Plan §Implementation sequence step 10.

- [ ] Deploy the worker change from Phase 4 to a non-production environment.
- [ ] Create a new test meditation in that environment. While the meditation is `pending`, query the database and confirm all three fields (`duration_seconds_talking`, `duration_seconds_pause`, `duration_seconds_sound`) are null.
- [ ] After the worker completes, query the meditation again and confirm:
  - All three fields are non-null.
  - Values are plausible given the meditation's element list. For example, a meditation with only a short text segment should have a non-zero `duration_seconds_talking` and **zero** for both `duration_seconds_pause` and `duration_seconds_sound` — not null. After a successful worker build, absent categories are written as `0` (the accumulator initial value); `null` is reserved for unpopulated, failed, or backfill-missing data only.
- [ ] Trigger a script regeneration on the same meditation. Confirm:
  - All four duration fields (`duration_seconds`, `duration_seconds_talking`, `duration_seconds_pause`, `duration_seconds_sound`) reset to null when the rebuild starts.
  - All four fields repopulate with non-null values after the worker completes the rebuild.
- [ ] Record the test meditation ID and field values for traceability:

  > **Verification record:**
  > Test meditation ID: ___
  > Post-build `durationSecondsTalking`: ___, `durationSecondsPause`: ___, `durationSecondsSound`: ___
  > Post-regeneration reset confirmed: yes/no
  > Post-regeneration repopulation confirmed: yes/no

**Per-phase gate:**
- [ ] Worker verified on create path: null while pending → non-null after build
- [ ] Worker verified on regenerate path: all four fields null on reset → repopulated after rebuild
- [ ] Verification record filled in above
- [ ] Do not begin Phase 9 until both verifications pass

---

## Phase 9 — Apply Backfill

> **Prerequisite:** Phase 8 worker verification must be complete and both gates cleared before running `--apply`.

Plan §Implementation sequence step 11.

- [ ] Run the backfill with `--apply` against the target environment: `npm run backfill:segment-durations -- --apply`
- [ ] Review the output summary:
  - Confirm total processed count is in the expected range.
  - Check per-category `skippedMissingFile` counts are within expected ranges given known gaps in historical file availability.
  - Note any unexpected errors.
- [ ] Spot-check 3–5 meditations with known element lists: query `duration_seconds_talking`, `duration_seconds_pause`, and `duration_seconds_sound` directly in the database and verify the values are plausible.

**Per-phase gate:**
- [ ] Backfill completed without unexpected errors
- [ ] Spot-check passed (3–5 meditations verified)
- [ ] No code commit needed for this phase (data-only operation)

---

## Phase 10 — Documentation

Plan §Implementation sequence step 12.

- [ ] Update `docs/db-models/TABLE_REFERENCE.md`: add entries for all three new columns on the `meditations` table, following the pattern of the existing `duration_seconds` entry:
  - `duration_seconds_talking` — nullable integer; total duration in seconds of all text-job audio segments for this meditation, as measured from the generated audio files by the worker build process.
  - `duration_seconds_pause` — nullable integer; total requested pause duration in whole seconds across all pause elements in this meditation.
  - `duration_seconds_sound` — nullable integer; total duration in seconds of all prerecorded sound-job audio segments for this meditation.
  - Note that all three fields are reset to null when a pending rebuild starts, and repopulated by the worker when the build completes.

**Per-phase gate:**
- [ ] `docs/db-models/TABLE_REFERENCE.md` updated with accurate descriptions
- [ ] Check off completed items above
- [ ] Commit referencing this file + Phase 10

---

## Pre-merge CI checklist

Before the branch is eligible to merge, all five package typechecks and all tests must pass:

- [ ] `npm run typecheck -w @golightly/db-models` passes
- [ ] `npm run typecheck -w @golightly/shared-types` passes
- [ ] `npm run typecheck -w @golightly/api` passes
- [ ] `npm test -w @golightly/api` passes
- [ ] `npm run typecheck -w @golightly/worker-node` passes
- [ ] `npm test -w @golightly/worker-node` passes
- [ ] `npm run typecheck -w @golightly/web` passes
- [ ] `npm run build -w @golightly/web` passes

---

## Reminders

- **Never check off an item until its type checks and tests pass.**
- **Never bundle phases into one commit.**
- Phase 1 (migration) is a deployment gate — applied to each environment before code using the new fields is deployed there.
- Phase 6 (dry-run) is a data gate — `MID_THRESHOLD` and `HIGH_THRESHOLD` must be informed by real data before Phase 7 is committed.
- Phase 8 (worker verification) is a deployment gate — the worker path must be confirmed correct before Phase 9 writes to historical rows.
- Commit message format per [AGENTS.md](../AGENTS.md): lowercase title, max 50 chars, body summarizing scope, `co-authored-by: claude (sonnet)` trailer.
