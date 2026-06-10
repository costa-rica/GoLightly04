---
created_at: 2026-06-09
updated_at: 2026-06-09
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# Duration Indicators Plan V01

This document describes the architecture, implementation flow, and risks for adding three measured-duration fields to meditations and surfacing them as a color-coded Guidance indicator in the web table. It is informed by `20260609_new_duration_indicators_assessment_codex_v02.md` and the answered questions in `NickVault/20260609-GoLightly-answers.md`. It supersedes the manual-recreation approach described in V02 in favor of a backfill script, and removes direct duration text from the UI.

## Settled requirements

Three nullable integer columns are added to `meditations`: `duration_seconds_talking`, `duration_seconds_pause`, `duration_seconds_sound`. They are populated by the worker build process from actual audio measurements, not by the browser or API before the build. Talking means the measured duration of all generated text-segment audio, not voice-activity detection inside those files. Pause values are whole-second integers. All four duration fields on a meditation (including the existing `duration_seconds`) are reset to null whenever a pending rebuild starts. The fields are exposed in camelCase as `durationSecondsTalking`, `durationSecondsPause`, and `durationSecondsSound` in API responses and shared types. The web meditation table gains one `Guidance` column that shows a color-coded indicator; the cell contains no text, no ratio. Hovering the indicator shows the actual guidance duration using the app's standard formatter or a seconds-based label. Color thresholds (gray / light-blue / yellow) are determined during implementation. Existing meditations are handled by a one-time backfill script in `scripts/` that calculates the three fields from existing job records and source files without regenerating audio. If meditations are ever manually recreated, they replace the existing record rather than creating a duplicate.

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

`MID_THRESHOLD` and `HIGH_THRESHOLD` are constants defined at the top of the component and filled in during implementation based on the distribution of real guidance durations (see Validation, step 3). The Guidance indicator has a `title` attribute set to the formatted guidance duration, which produces a native browser tooltip. The app's standard formatter is `formatDurationOrDash` from `web/src/lib/utils/formatters.ts`, which rounds to whole minutes. Because guidance durations for typical meditations may fall well under two minutes, a short-form seconds label (e.g. `"45s"`) is likely more informative than `"1 mins"`. Whether to use the standard formatter or a dedicated seconds formatter is a judgment call at implementation time; either satisfies the requirement.

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

## Implementation sequence

1. Apply the SQL migration to all environments before any code that uses the new fields.
2. Update the Sequelize model in `db-models`.
3. Update `shared-types/src/meditation.ts`.
4. Update both API serializers.
5. Update both API rebuild-reset paths.
6. Extend `concatenateMeditation()` in the worker to probe normalized segments and write the three new fields.
7. Add the `Guidance` column to `TableMeditation.tsx`; decide threshold values (see Validation).
8. Write `scripts/backfill-segment-durations.ts`, run in dry-run mode to inspect output, then apply.
9. Update `docs/db-models/TABLE_REFERENCE.md` for the three new columns.

Steps 1 and 2 are a gate for all subsequent steps. Steps 3 through 6 can be developed in parallel after the model is updated. Step 7 depends on step 3 completing so the shared type is available. Step 8 should run after step 6 is deployed and verified, so the same worker path that produces new build measurements is confirmed correct before the backfill values are committed.

## Risks

**Talking duration approximation in backfill.** The backfill probes raw ElevenLabs source files; the worker probes normalized versions. Normalization changes sample rate and channel count, which can shift measured duration by a fraction of a second. For a color-coded indicator this difference is acceptable, but the values produced by the backfill and by a new build for the same meditation will not be identical.

**Missing historical text job files.** Some meditations may have had their generated audio files cleaned up or moved. The backfill handles this gracefully but leaves `duration_seconds_talking` null for those rows. The Guidance indicator will display gray, which is an honest representation of missing data.

**Category totals vs. final duration.** MP3 encoding and concatenation introduce small padding differences, so `talking + pause + sound` will not always equal `duration_seconds` exactly. No enforcement constraint is added at the database level.

**Formatter fit for short guidance values.** `formatDurationOrDash` rounds to whole minutes. A guidance value under 60 seconds will display as `"0 mins"` in the hover tooltip, which is uninformative. A seconds-aware label is preferable and should be decided before merging the web change.

**Threshold calibration.** If color thresholds are chosen before inspecting the actual distribution of guidance durations, the indicator may cluster everything in one color. Running the backfill in dry-run mode first and observing the distribution avoids this.

**jobs_queue retention assumption.** The backfill depends on `jobs_queue` rows still existing for historical meditations. If any cleanup or archival policy has pruned them, those meditations cannot be backfilled from job records. A pre-run check for how many complete meditations have zero matching jobs_queue rows is a useful first step.

## Assumptions

- `inputData.pause_duration` in existing `jobs_queue` rows is always a number or numeric string; integer rounding is safe.
- `jobs_queue` rows are retained indefinitely and are available at backfill time.
- The prerecorded audio root accessible to the backfill script at runtime is the same path used by the worker.
- `TableAdminMeditations.tsx` does not need the Guidance indicator in this iteration.
- The three new fields integrate cleanly into the existing backup and restore path via Sequelize model inclusion; no explicit changes to the backup service are required.

## Validation approach

After the migration and code changes are deployed to a non-production environment:

1. Create a new spreadsheet-mode meditation. Confirm all three new fields are null while pending, then populated with non-null values after the worker completes. Verify the values are plausible given the element list.
2. Trigger a script regeneration on a complete meditation. Confirm all four duration fields reset to null, then repopulate after the worker finishes.
3. Run `backfill-segment-durations.ts` with `--limit 10` (no `--apply`) and review the dry-run output. Check for unexpected nulls, anomalous totals, and missing-file warnings. Use this output to decide threshold values for the web indicator.
4. Apply the backfill with `--apply` and spot-check three to five meditations against expected durations from known element lists.
5. Verify the Guidance column renders the correct color for null, mid, and high guidance values in the browser.
6. Verify the hover tooltip displays the formatted guidance duration, not a placeholder or empty string.

## TODO recommendation

A formal TODO tracking document is not needed for this change. The implementation sequence above is ordered, each step has a clear file-level scope, and the work fits within a single branch. The only open decision before implementation begins is the color threshold values, which should be resolved after step 3 of the validation approach (dry-run backfill distribution review) rather than guessed upfront.
