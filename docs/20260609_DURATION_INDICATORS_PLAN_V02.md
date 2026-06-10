---
created_at: 2026-06-09
updated_at: 2026-06-09
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# Duration Indicators Plan V02

This document supersedes `20260609_DURATION_INDICATORS_PLAN_V01.md`. It preserves all settled requirements from that plan and from `NickVault/20260609-GoLightly-answers.md`, and incorporates four structural corrections raised in `20260609_DURATION_INDICATORS_PLAN_V01_ASSESSMENT_CODEX.md`: a required formal TODO after plan acceptance; explicit root `package.json` npm command wiring for the backfill script; a corrected implementation sequence that gates web threshold finalization on dry-run distribution review; a required seconds-aware tooltip formatter in place of the deferred judgment call; and specified automated verification expectations per package. No settled requirement changes.

## Settled requirements

Three nullable integer columns are added to `meditations`: `duration_seconds_talking`, `duration_seconds_pause`, `duration_seconds_sound`. They are populated by the worker build process from actual audio measurements, not by the browser or API before the build. Talking means the measured duration of all generated text-segment audio, not voice-activity detection inside those files. Pause values are whole-second integers. All four duration fields on a meditation (including the existing `duration_seconds`) are reset to null whenever a pending rebuild starts. The fields are exposed in camelCase as `durationSecondsTalking`, `durationSecondsPause`, and `durationSecondsSound` in API responses and shared types. The web meditation table gains one `Guidance` column that shows a color-coded indicator; the cell contains no text, no ratio. Hovering the indicator shows the actual guidance duration using a seconds-aware label. Color thresholds (gray / light-blue / yellow) are determined from the dry-run backfill distribution before the web component is finalized. Existing meditations are handled by a one-time backfill script in `scripts/` that calculates the three fields from existing job records and source files without regenerating audio. If meditations are ever manually recreated, they replace the existing record rather than creating a duplicate.

## Database

A new migration file at `db-models/migrations/20260609_add_duration_seconds_segments.sql` follows the pattern of `20260518_add_duration_seconds.sql`:

```sql
ALTER TABLE meditations
  ADD COLUMN IF NOT EXISTS duration_seconds_talking INTEGER NULL,
  ADD COLUMN IF NOT EXISTS duration_seconds_pause   INTEGER NULL,
  ADD COLUMN IF NOT EXISTS duration_seconds_sound   INTEGER NULL;
```

This migration must be applied before any API or worker code that reads or writes the new fields is deployed to that environment. Older backups lacking these columns will restore with null values because all three fields are nullable. Backups taken after the migration will not restore cleanly into schemas that predate it; restore runbooks should note this dependency.

## Model

`db-models/src/models/Meditation.ts` adds three new declared fields following the pattern of `durationSeconds` at line 100: `DataTypes.INTEGER`, `allowNull: true`, with `field:` entries mapping to the snake_case column names. No other model files are affected.

## Shared types

`shared-types/src/meditation.ts` adds three optional nullable number fields to the `Meditation` type:

```typescript
durationSecondsTalking?: number | null;
durationSecondsPause?: number | null;
durationSecondsSound?: number | null;
```

`web/src/store/features/meditationSlice.ts` re-exports the `Meditation` type directly from `@golightly/shared-types`, so no changes to the Redux slice are needed.

## Worker: population

`worker-node/src/services/concatenator.ts` is the single point where all three fields are written. The existing `concatenateMeditation()` function already iterates every job and writes a normalized temp file before the final merge. The implementation extends this loop to accumulate per-category totals alongside the existing `normalizedFiles` array.

For **text jobs**, `probeDurationSeconds()` is called on the normalized temp file at `target` and the result is added to a talking total. For **sound jobs**, the same probe is applied to the normalized temp file. For **pause jobs**, the duration is read directly from `Math.round(Number(inputData.pause_duration ?? 0))` rather than probing the generated silent file, because silence duration equals the requested value by construction and a probe call would be redundant. This also directly satisfies the whole-second requirement.

All three totals are passed into the existing `meditation.update()` call alongside the already-present `status`, `filename`, `filePath`, and `durationSeconds` fields. If concatenation throws before reaching the final update, the three new fields are not written and the meditation enters `failed` status; all duration fields remain at their pre-build values, which will be null after the reset described next.

## API: reset on rebuild

Two services must be updated to null the three new fields when a pending rebuild starts.

`api/src/services/meditations/createOrRegenerateStagedMeditation.ts` contains two update blocks that currently set `durationSeconds: null`. Both need `durationSecondsTalking: null`, `durationSecondsPause: null`, and `durationSecondsSound: null` added.

`api/src/services/meditations/regenerateMeditationFromScript.ts` has a `lockedMeditation.update()` call inside the transaction that already sets `durationSeconds: null` and `status: "pending"`. The three new fields are added to the same object literal.

## API: serializers

Both serializer functions expose the three new camelCase fields mirroring the pattern of `durationSeconds: meditation.durationSeconds ?? null`.

- `mapMeditationRecord()` in `api/src/routes/meditations.ts` (line 31)
- `serializeAdminMeditationRow()` in `api/src/routes/admin.ts` (line 24)

## Web: Guidance column

`web/src/components/tables/TableMeditation.tsx` receives a new `Guidance` column header. Each row renders a small colored element (a circle or pill) whose color is driven by `durationSecondsTalking`:

```typescript
function guidanceColor(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return /* gray tailwind class */;
  if (seconds >= HIGH_THRESHOLD) return /* yellow tailwind class */;
  if (seconds >= MID_THRESHOLD)  return /* light-blue tailwind class */;
  return /* gray tailwind class */;
}
```

`MID_THRESHOLD` and `HIGH_THRESHOLD` are constants defined at the top of the component and set to values derived from the dry-run backfill distribution review (see Implementation sequence, step 8). They must not be assigned arbitrary placeholder values that are left unchanged at merge; the distribution review in step 8 is a hard prerequisite to finalizing these constants and merging the web change.

The Guidance indicator has a `title` attribute set to a seconds-aware label for `durationSecondsTalking`. Nick's answers specify "the actual guidance duration in seconds" as the primary display form. Because `formatDurationOrDash` rounds to whole minutes and produces `"0 mins"` for guidance durations under 60 seconds — which is not an informative hover label — that formatter must not be used for the Guidance tooltip. Instead, a dedicated `formatGuidanceDuration` helper (or equivalent inline logic) is required. It formats values under 60 seconds as `"<N>s"` (e.g. `"45s"`) and values at or above 60 seconds in a minute-and-second form (e.g. `"1m 30s"`). A null or undefined value renders as a dash or empty string consistent with other empty-state labels in the table. This formatter is new; it does not replace `formatDurationOrDash` elsewhere.

The desktop table's empty-state `colSpan` value is incremented by one for the new column. The mobile card view adds the indicator element inline with the existing length metadata. `TableAdminMeditations.tsx` is out of scope per the "one web table" requirement.

## Backfill script

`scripts/backfill-segment-durations.ts` is a one-time standalone utility. It follows the structure of `backfill-meditation-durations.ts`: supports `--apply`, `--force`, and `--limit` flags; prints a JSON summary; calls `sequelize.close()` in a `finally` block; uses `console.*` per the one-shot script exemption in AGENTS.md.

For each complete meditation the script:

1. Fetches all `jobs_queue` rows for that meditation ordered by `sequence`.
2. Computes `durationSecondsPause` by summing `Math.round(Number(inputData.pause_duration ?? 0))` across pause jobs.
3. Computes `durationSecondsSound` by probing the prerecorded sound file path constructed from `inputData.sound_file` against the known prerecorded audio root.
4. Computes `durationSecondsTalking` by probing the ElevenLabs source files at `job.filePath` for text jobs. These are the original synthesis outputs rather than normalized temp files (which no longer exist). The duration difference between raw and normalized is negligibly small for an indicator display.
5. Writes all three fields in a single update per meditation.

If a source file is missing or unreadable, the script logs a warning and increments a `skippedMissingFile` counter but still writes the values for categories where all files were found. A meditation with missing text job files will receive null for `durationSecondsTalking` and valid values for the other two categories. The summary includes per-category skip counts.

Meditations where `--force` is not set and all three fields are already non-null are skipped.

A root `package.json` npm command is required alongside the script file. Following the pattern of `backfill:durations` and `backfill:sound-durations`, the new entry is:

```json
"backfill:segment-durations": "TS_NODE_PROJECT=tsconfig.scripts.json ts-node --transpile-only scripts/backfill-segment-durations.ts"
```

This is an implementation step, not documentation polish. Validation (dry-run and apply) must use this npm command rather than invoking the TypeScript file directly, so the command is the only tested invocation path.

## Implementation sequence

Steps 1 and 2 are a hard gate for all subsequent steps. Steps 3 through 7 can be developed in parallel once the model change is in place. Step 8 requires the backfill script from step 7 and a populated environment, but does not require the worker change (step 6) to be deployed — the dry-run reads from existing data. Step 9 requires the distribution output from step 8. Steps 10 through 12 require the worker to be deployed and verified.

**Step 1.** Apply the SQL migration to all environments. No code that reads or writes the three new fields can be deployed until the schema is updated.

**Step 2.** Update the Sequelize model in `db-models`. This change is the shared foundation for steps 3 through 7.

**Step 3.** Update `shared-types/src/meditation.ts` with the three optional nullable fields.

**Step 4.** Update both API serializers (`mapMeditationRecord` and `serializeAdminMeditationRow`) to expose the three new camelCase fields.

**Step 5.** Update both API rebuild-reset paths (`createOrRegenerateStagedMeditation.ts` and `regenerateMeditationFromScript.ts`) to null the three new fields alongside `durationSeconds`.

**Step 6.** Extend `concatenateMeditation()` in `worker-node/src/services/concatenator.ts` to accumulate per-category totals and write the three new fields in the final update call.

**Step 7.** Write `scripts/backfill-segment-durations.ts` and add the `backfill:segment-durations` npm command to the root `package.json`. Both must be committed together. Before proceeding to step 8, confirm that `npm run backfill:segment-durations -- --help` resolves correctly.

**Step 8.** Run `npm run backfill:segment-durations -- --limit 10` (dry-run, no `--apply`) against a populated environment. Review the JSON output for the distribution of `durationSecondsTalking` values across that sample, any missing-file warnings, and overall plausibility. Use this output to determine `MID_THRESHOLD` and `HIGH_THRESHOLD`. If 10 rows are insufficient to see meaningful spread, increase `--limit` accordingly. This step is a hard prerequisite for step 9.

**Step 9.** Add the `Guidance` column to `TableMeditation.tsx` using the threshold values from step 8 and the required `formatGuidanceDuration` seconds-aware tooltip formatter. This is the first point at which threshold values are written into code; they are informed by real data, not guessed.

**Step 10.** Deploy the worker change from step 6 to a non-production environment. Create a new meditation and confirm all three fields are null while pending and non-null after the worker completes. Verify that values are plausible given the element list. Trigger a script regeneration and confirm all four duration fields reset to null, then repopulate. This step validates the worker path before any backfill writes to historical rows.

**Step 11.** Run `npm run backfill:segment-durations -- --apply` after the worker path is confirmed correct. Spot-check three to five meditations against expected durations from known element lists. Confirm per-category skip counts are within expected ranges given known gaps in historical file availability.

**Step 12.** Update `docs/db-models/TABLE_REFERENCE.md` for the three new columns.

## Automated verification

Manual staging checks are necessary but not sufficient for a change of this scope. The following automated checks are required before merge and are in addition to the browser validation in step 10.

**`db-models` and `shared-types`.** TypeScript typecheck must pass for both packages after the model and type additions. No new tests are required for these packages; the type system is the verification.

**`api`.** TypeScript typecheck must pass. In addition, targeted tests are required for two behaviors: (a) that `mapMeditationRecord` and `serializeAdminMeditationRow` include `durationSecondsTalking`, `durationSecondsPause`, and `durationSecondsSound` in their output with correct field names; and (b) that the rebuild-reset paths write null for all three fields when a pending rebuild is triggered, not just for `durationSeconds`. These are the two behaviors most likely to produce silent regressions from field-name drift or incomplete object literals.

**`worker-node`.** TypeScript typecheck must pass. A unit test for the category accumulation logic in the extended `concatenateMeditation()` is required: given a synthetic job list with known talking, pause, and sound entries, assert that the three totals written to the update call match expected values. This test does not need to invoke actual ffprobe; the probe calls can be injected or stubbed.

**`web`.** TypeScript typecheck and build must pass. There is no existing unit test suite for `web`, so a full browser check (covered in step 10) is the acceptance gate for rendering correctness. The typecheck and build confirm that the new column's type usage against `Meditation` is correct and that the `formatGuidanceDuration` function signature is sound.

All five package typechecks must pass in CI before the branch is eligible to merge.

## Risks

**Talking duration approximation in backfill.** The backfill probes raw ElevenLabs source files; the worker probes normalized versions. Normalization changes sample rate and channel count, which can shift measured duration by a fraction of a second. For a color-coded indicator this difference is acceptable, but the values produced by the backfill and by a new build for the same meditation will not be identical.

**Missing historical text job files.** Some meditations may have had their generated audio files cleaned up or moved. The backfill handles this gracefully but leaves `duration_seconds_talking` null for those rows. The Guidance indicator will display gray, which is an honest representation of missing data.

**Category totals vs. final duration.** MP3 encoding and concatenation introduce small padding differences, so `talking + pause + sound` will not always equal `duration_seconds` exactly. No enforcement constraint is added at the database level.

**jobs_queue retention assumption.** The backfill depends on `jobs_queue` rows still existing for historical meditations. If any cleanup or archival policy has pruned them, those meditations cannot be backfilled from job records. A useful first step before step 7 is a count of complete meditations with zero matching `jobs_queue` rows; if this count is unexpectedly high, the assumption in the Assumptions section should be revisited before proceeding.

**Threshold calibration skew from a small dry-run sample.** If the `--limit 10` sample in step 8 does not represent the full distribution, the thresholds chosen may cause most production rows to cluster in one color. A larger sample (`--limit 50` or higher) reduces this risk and costs only read time. The dry-run step should increase the sample size if the initial output shows poor spread.

## Assumptions

- `inputData.pause_duration` in existing `jobs_queue` rows is always a number or numeric string; integer rounding is safe.
- `jobs_queue` rows are retained indefinitely and are available at backfill time.
- The prerecorded audio root accessible to the backfill script at runtime is the same path used by the worker.
- `TableAdminMeditations.tsx` does not need the Guidance indicator in this iteration.
- The three new fields integrate cleanly into the existing backup and restore path via Sequelize model inclusion; no explicit changes to the backup service are required.

## TODO recommendation

A formal TODO document is required for this change. The Codex assessment correctly identifies that the implementation involves at least nine distinct file-level scopes across five packages, two deployment gates (migration before code, worker verification before backfill apply), and one data-gated decision (threshold calibration after dry-run). Without a tracked TODO, the most likely failure modes are: the root npm command is omitted from the commit; the dry-run step is skipped and thresholds are guessed; or the `backfill:segment-durations -- --apply` run is delayed indefinitely after the code ships and historical rows remain unpopulated.

The TODO should be created after this plan is accepted and before implementation begins. At minimum it should track: migration applied to each environment; each package change completed and typechecked; worker change deployed and verified on a test meditation; dry-run output reviewed and thresholds confirmed; web change merged with confirmed thresholds; apply-backfill completed and spot-checked; TABLE_REFERENCE.md updated. The deployment gate (migration before code rollout) and the apply-backfill gate (worker verified before apply) should be called out explicitly in the TODO as blocking dependencies, not just checklist items.
