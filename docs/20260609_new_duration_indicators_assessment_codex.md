---
created_at: 2026-06-09
updated_at: 2026-06-09
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# New Duration Indicators Assessment

The requested fields are feasible, and the current architecture has a natural place to populate them: the worker build step that already generates text audio, creates pause audio, normalizes sound files, concatenates the final MP3, and writes `meditations.duration_seconds`. The main design decision is whether the fields should represent build-time measured segment durations or pre-build estimates. For a user-facing "Guidance" table column, build-time measured values are more reliable and fit the existing lifecycle.

## Requested metadata fields

1. `duration_seconds_talking`
2. `duration_seconds_pause`
3. `duration_seconds_sound`

## Current state

1. Database model coverage:
   - `db-models/src/models/Meditation.ts` currently stores one aggregate duration field:
     - `durationSeconds` mapped to `meditations.duration_seconds`
   - `db-models/src/models/SoundFile.ts` stores:
     - `durationSeconds` mapped to `sound_files.duration_seconds`
   - `db-models/src/models/JobQueue.ts` stores the build elements as queue rows:
     - `type`: `text`, `sound`, or `pause`
     - `input_data`: serialized element payload
     - `file_path`: generated text audio path or source/output path depending on job type
   - `jobs_queue` does not currently store per-job duration metadata.

2. Existing duration behavior:
   - Sound file duration is probed on upload in `api/src/routes/sounds.ts`.
   - Sound file duration can be backfilled with `scripts/backfill-sound-file-durations.ts`.
   - Final meditation duration is probed after concatenation in `worker-node/src/services/concatenator.ts`.
   - Final meditation duration can be backfilled with `scripts/backfill-meditation-durations.ts`.

3. API payloads:
   - `api/src/routes/meditations.ts` exposes `durationSeconds` in `mapMeditationRecord()`.
   - `api/src/routes/admin.ts` exposes `durationSeconds` in `serializeAdminMeditationRow()`.
   - `shared-types/src/meditation.ts` includes `durationSeconds?: number | null`.

4. Web display:
   - `web/src/components/tables/TableMeditation.tsx` displays total `Length` using `durationSeconds`.
   - `web/src/components/tables/TableAdminMeditations.tsx` displays total `Length` using `durationSeconds`.
   - `web/src/components/forms/CreateMeditationForm.tsx` already estimates build duration by element:
     - text: estimated as `row.text.length / CHARS_PER_SECOND`
     - pause: read directly from `pauseDuration`
     - sound: read from `soundFile.duration_seconds`

## Database changes required

1. Add nullable integer columns to `meditations`:

   ```sql
   ALTER TABLE meditations
     ADD COLUMN IF NOT EXISTS duration_seconds_talking INTEGER NULL,
     ADD COLUMN IF NOT EXISTS duration_seconds_pause INTEGER NULL,
     ADD COLUMN IF NOT EXISTS duration_seconds_sound INTEGER NULL;
   ```

2. Update Sequelize metadata:
   - Add `durationSecondsTalking`, `durationSecondsPause`, and `durationSecondsSound` to `Meditation`.
   - Map them to:
     - `duration_seconds_talking`
     - `duration_seconds_pause`
     - `duration_seconds_sound`

3. Recommended nullability:
   - Keep the fields nullable, matching the existing `duration_seconds` behavior.
   - Use `null` for pending, processing, failed, legacy, or not-yet-backfilled meditations.
   - Use `0` only when the build completed and that category truly has zero duration.

4. Migration and deployment impact:
   - Apply the migration before deploying API or worker code that reads or writes the new fields.
   - Update `docs/db-models/TABLE_REFERENCE.md` after implementation.
   - Add the fields to backup and restore implicitly by updating the Sequelize model. The current backup service exports raw model rows, and restore bulk-creates raw parsed rows.

5. Existing backups:
   - Older backups will not contain these CSV columns. That should restore as `null` as long as the Sequelize fields are nullable.
   - New backups with these columns will not restore cleanly into older code or older schemas that lack the columns.

## Creation flow trace

### Spreadsheet creation

1. User builds rows in `web/src/components/forms/CreateMeditationForm.tsx`.
2. Web posts to `POST /meditations/staging/generate` with:
   - `mode: "spreadsheet"`
   - `elements`
3. API enters `api/src/services/meditations/createOrRegenerateStagedMeditation.ts`.
4. API creates or updates a staged `meditations` row:
   - `stage: "staged"`
   - `sourceMode: "spreadsheet"`
   - `status: "pending"`
   - `durationSeconds: null`
5. API calls `replaceMeditationElements()` in `api/src/services/meditations/createMeditationFromElements.ts`.
6. `replaceMeditationElements()` creates `jobs_queue` rows:
   - text jobs: `status: "pending"`
   - sound jobs: `status: "complete"` with `filePath` set to the prerecorded sound path
   - pause jobs: `status: "complete"`
7. API calls `notifyWorker(meditation.id, "intake")`.
8. Worker receives `POST /process`.
9. Worker `processMeditation()` generates text job MP3 files with ElevenLabs.
10. Worker marks text jobs complete and stores generated `filePath`.
11. Worker calls `concatenateMeditation()`.
12. `concatenateMeditation()` normalizes text, sound, and pause segments into temporary MP3 files, merges them, probes final duration, and updates:
    - `status: "complete"`
    - `filename`
    - `filePath`
    - `durationSeconds`

### Script creation

1. User writes script in `web/src/components/forms/ScriptMeditationEditor.tsx`.
2. Web posts to `POST /meditations/staging/generate` with:
   - `mode: "script"`
   - `script`
3. API parses script with `parseMeditationScript()` from `shared-types/src/scriptParser.ts`.
4. Parsed script becomes the same `MeditationElement[]` shape used by spreadsheet creation.
5. From that point forward, the flow is the same as spreadsheet creation.

### Save staged meditation

1. Web calls `POST /meditations/staging/save-to-library`.
2. API `saveStagedToLibrary()` requires the staged meditation to be `status: "complete"`.
3. API updates only metadata and `stage: "library"`.
4. The duration fields should already have been populated by the worker before save.

### Legacy direct creation endpoints

1. `POST /meditations/create` creates a library meditation from `meditationArray`.
2. `POST /meditations/create/script` creates a library meditation from script.
3. Both paths call `createMeditationFromElements()` and then `notifyWorker()`.
4. These paths should also get the new duration fields from the worker completion step.

### Script regeneration

1. `PUT /meditations/:id/script` parses a new script and calls `regenerateMeditationFromScript()`.
2. Existing audio metadata is reset today:
   - `filename: null`
   - `filePath: null`
   - `durationSeconds: null`
   - `status: "pending"`
3. The new fields should also be reset to `null` here.
4. Worker should repopulate them after the new build completes.

## Population options

### Option 1: worker-time aggregate fields on `meditations`

This option adds the three requested columns to `meditations` and computes them inside `worker-node/src/services/concatenator.ts`.

1. During `concatenateMeditation()`:
   - initialize totals for talking, pause, and sound
   - for each job, create the same normalized temporary segment that is already used for final concatenation
   - measure or calculate the segment duration
   - add it to the matching category
2. At the final `meditation.update()`, write:
   - `durationSeconds`
   - `durationSecondsTalking`
   - `durationSecondsPause`
   - `durationSecondsSound`

Advantages:

- Uses actual build output instead of browser estimates.
- Captures the same audio that goes into the final MP3.
- Keeps web table reads simple.
- Matches the current pattern for `durationSeconds`.
- Requires only one new migration and one set of model/API/type updates.

Tradeoffs:

- Does not preserve per-element duration history.
- Adds a few more ffprobe calls during concatenation if every normalized segment is probed.
- Category totals may not add up exactly to final `durationSeconds` because MP3 encoding and concatenation can add small padding.

### Option 2: API-time estimated fields before build

This option calculates the fields when API creates `jobs_queue` rows.

1. `duration_seconds_pause` can be summed from `pause_duration`.
2. `duration_seconds_sound` can be summed from `sound_files.duration_seconds`.
3. `duration_seconds_talking` would need an estimate from text length and speed.

Advantages:

- Values are available immediately while the build is pending.
- Minimal worker changes.

Tradeoffs:

- Talking duration would be an estimate, not real audio duration.
- Text-to-speech speed, voice, punctuation, and model behavior can make estimates inaccurate.
- Values could disagree with the final `duration_seconds`.
- This is not ideal for durable database metadata.

### Option 3: per-job duration metadata plus meditation aggregates

This option adds a `duration_seconds` field to `jobs_queue` and also stores aggregate totals on `meditations`.

Advantages:

- Best audit trail.
- Easy to debug why a meditation has a given guidance/sound/pause total.
- Future UI could show per-block real durations after build.

Tradeoffs:

- Larger schema change.
- More API and backup/restore surface.
- Not necessary if the immediate goal is one web table column.

### Option 4: derive on read

This option avoids storing aggregate fields and computes them when `/meditations/all` or `/admin/meditations` is called.

Advantages:

- Avoids adding columns.

Tradeoffs:

- Talking duration is not available unless text job audio is probed or per-job durations are stored.
- Probing audio files during list endpoints would be slow and fragile.
- Aggregating from jobs on every table read increases query and processing cost.
- This does not fit the existing simple list endpoint shape.

## Recommended approach

Use option 1 first: store nullable aggregate fields on `meditations` and populate them during worker concatenation.

1. Schema:
   - Add nullable integer columns:
     - `duration_seconds_talking`
     - `duration_seconds_pause`
     - `duration_seconds_sound`

2. Worker calculation:
   - In `concatenateMeditation()`, compute category totals from the actual normalized segment files used in the final merge.
   - For text jobs:
     - normalize the generated ElevenLabs file as today
     - probe the normalized temp file
     - add to talking
   - For sound jobs:
     - normalize the prerecorded sound file as today
     - probe the normalized temp file
     - add to sound
   - For pause jobs:
     - use `pause_duration` from `input_data`, or probe the generated silent temp file for consistency
     - add to pause
   - Round totals consistently with existing `durationSeconds`.

3. Reset behavior:
   - Set the three new fields to `null` when a meditation enters a new pending build.
   - Update these paths:
     - staged create/update in `createOrRegenerateStagedMeditation()`
     - script regeneration in `regenerateMeditationFromScript()`
     - legacy direct create if explicit nulls are added for clarity

4. API and type exposure:
   - Add fields to `shared-types/src/meditation.ts`.
   - Add fields to `mapMeditationRecord()` in `api/src/routes/meditations.ts`.
   - Add fields to `serializeAdminMeditationRow()` in `api/src/routes/admin.ts`.
   - Prefer camelCase API fields to match existing `durationSeconds`:
     - `durationSecondsTalking`
     - `durationSecondsPause`
     - `durationSecondsSound`

5. Web display:
   - Add a `Guidance` column to `web/src/components/tables/TableMeditation.tsx`.
   - Display `durationSecondsTalking` with the existing duration formatter.
   - Show `-` or an equivalent empty state while pending, failed, or legacy rows are null.
   - Consider adding the same field to `TableAdminMeditations.tsx` if admin review should include guidance balance.

6. Backfill:
   - Add a one-shot script for existing complete meditations if historical rows should show values.
   - A practical backfill can:
     - sum pause durations from `jobs_queue.input_data`
     - sum sound durations by probing files or using `sound_files.duration_seconds`
     - sum talking durations by probing existing text job `file_path` values
   - Backfilled talking totals may differ slightly from worker-time normalized segment totals because the existing final normalized temp files are not retained.

## Moderate and severe risks

### Risk 1: "talking" may be semantically fuzzy

Severity: moderate.

The worker can reliably measure text-segment audio duration, but it cannot easily distinguish actual spoken voice from silence inside a generated TTS file. Pauses caused by punctuation, breathing cadence, or ElevenLabs pacing would count as talking duration if they are inside a text job MP3.

Mitigation:

- Treat `duration_seconds_talking` as "guided voice segment duration" rather than pure voice-activity duration.
- Consider naming the UI column `Guidance`, which is directionally accurate and less technically strict than `Talking`.

### Risk 2: category totals may not equal final duration exactly

Severity: moderate.

The final MP3 duration is measured after concatenation. Category totals would be measured or calculated before the final merge. MP3 encoder padding, normalization, and merge behavior can introduce small differences.

Mitigation:

- Probe the normalized temp segments used for the final merge.
- Accept small rounding differences.
- Do not enforce `talking + pause + sound === duration_seconds` at the database level.

### Risk 3: stale metadata after regeneration

Severity: moderate.

If the new fields are not reset when a meditation starts a new build, the web table could show old guidance values while the new audio is pending or failed.

Mitigation:

- Reset all four duration fields to `null` when a new build starts:
  - `durationSeconds`
  - `durationSecondsTalking`
  - `durationSecondsPause`
  - `durationSecondsSound`
- Only populate them when worker concatenation succeeds.

### Risk 4: existing meditations need a backfill decision

Severity: moderate.

Without a backfill, existing complete meditations will show no guidance value until regenerated. That may make the web table look inconsistent.

Mitigation:

- Decide whether null is acceptable for historical rows.
- If not, implement a one-shot backfill that computes best-effort category totals from existing jobs and audio files.

### Risk 5: sound duration metadata can be incomplete or stale

Severity: moderate.

`sound_files.duration_seconds` can be null if probing failed or stale if files were replaced outside the app. Using it directly would make `duration_seconds_sound` less reliable.

Mitigation:

- Prefer worker-time probing of the normalized sound temp file.
- Use `sound_files.duration_seconds` only as a fallback or for pre-build estimates.

### Risk 6: old backup compatibility has limits

Severity: moderate.

Old backups without the new columns should restore into the new schema with null values. New backups with the new columns will not restore into older schemas.

Mitigation:

- Apply migrations before restore on any environment running newer backups.
- Keep restore fields nullable.
- Document the schema version expectation in restore runbooks if this becomes a recurring operator task.

## Unknowns

1. Whether product wants "guidance" to mean:
   - duration of all generated text segments
   - actual detected voice activity inside generated text audio
   - percentage of total meditation duration that contains guidance
2. Whether the web table should show:
   - only guidance duration
   - guidance plus total duration
   - a ratio such as `3 mins guided / 12 mins total`
3. Whether historical meditations must be backfilled before launch.
4. Whether decimal pause durations should be preserved more precisely than integer seconds.

## Suggested implementation sequence if approved later

1. Add a migration for nullable `meditations` columns.
2. Update `Meditation` model fields.
3. Update shared `Meditation` type.
4. Update API serializers for public and admin meditation responses.
5. Reset new fields on all rebuild paths.
6. Compute and write new fields in worker `concatenateMeditation()`.
7. Add focused tests:
   - worker category aggregation
   - API serialization
   - regeneration reset behavior
   - web table rendering for null and non-null guidance values
8. Add optional backfill script for existing complete meditations.
9. Update DB table reference and deployment/runbook docs.

## Final assessment

Adding these fields is feasible and aligns well with the existing architecture. The best implementation point is the worker build process, specifically `concatenateMeditation()`, because that code already handles every segment type and updates final meditation duration. The primary caution is semantic: `duration_seconds_talking` should be understood as generated guidance audio duration, not precise voice-activity duration. With nullable columns, reset-on-regenerate behavior, and a backfill decision for existing meditations, the change should be moderate in scope and low risk to the working creation pipeline.
