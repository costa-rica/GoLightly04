---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---

# Local Default Editable Meditation

Use this when the local app shows `Default meditation template not found` on the Create/home page.

## What the error means

The exact error comes from `GET /meditations/staging`.

That route looks for:

1. a current-user meditation with `stage = 'staged'`, then
2. any global meditation with `stage = 'template'`.

If neither row exists, the API returns:

```text
Default meditation template not found
```

A missing mp3 file does not directly cause that exact error. Missing audio can cause seed generation, worker, playback, or streaming failures, but `Default meditation template not found` means the database the local API is using does not have a usable staged/template meditation row.

## Required local state

The local API, worker, and seed script must point at the same database and resource folder.

Required data/resources:

- `meditations.stage` migration applied.
- one `sound_files` row named exactly or case-insensitively like `Tibetan Singing Bowl`.
- the corresponding prerecorded audio file exists under:
  - `$PATH_PROJECT_RESOURCES/prerecorded_audio/<sound_files.filename>`
- one `meditations` row with `stage = 'template'`.
- the worker is running so the seed can generate the template audio.

## Check the connected local database

Because `source api/.env` may fail in zsh if the file contains non-shell-safe values, export only the Postgres vars or copy them manually from `api/.env`.

```bash
export PG_HOST="localhost"
export PG_PORT="5432"
export PG_DATABASE="your_local_db"
export PG_USER="your_local_boot_or_app_user"
```

Then check schema and template state:

```bash
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'meditations' AND column_name IN ('duration_seconds', 'stage');"

psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -c "SELECT id, stage, status, filename, file_path FROM meditations WHERE stage IN ('template', 'staged') ORDER BY stage, updated_at DESC;"

psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -c "SELECT id, name, filename FROM sound_files WHERE lower(trim(name)) = 'tibetan singing bowl';"
```

If the template query returns zero rows, run the seed.

## Apply the local migrations if needed

```bash
psql -v ON_ERROR_STOP=1 -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -f db-models/migrations/20260518_add_duration_seconds.sql
psql -v ON_ERROR_STOP=1 -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -f db-models/migrations/20260520_add_meditation_stage.sql
```

## Verify the required sound file

The seed script uses this starter script:

```text
Welcome. Close your eyes.
<break time="2s" />
[Tibetan Singing Bowl]
```

So local data must contain a `sound_files` row named `Tibetan Singing Bowl`. If that row is missing, add/upload that sound through the app or restore/import local seed data that includes it.

If the row exists, confirm the referenced audio file is present:

```bash
printf '%s\n' "$PATH_PROJECT_RESOURCES"
ls "$PATH_PROJECT_RESOURCES/prerecorded_audio"
```

## Run the seed locally

Start the local API and worker first. Then, from the repo root, run:

```bash
TS_NODE_PROJECT=tsconfig.scripts.json npx ts-node --transpile-only scripts/seedDefaultMeditation.ts
```

Expected result:

```text
Template meditation seeded: <id>
```

Or, if it already exists and is complete:

```text
Template meditation already complete: <id>
```

Then reload the local web app.

## If the seed fails

Common failures:

- `Required SoundFile not found: Tibetan Singing Bowl`
  - Add or restore the `sound_files` row and prerecorded audio file.
- `Template meditation already exists but is failed`
  - Inspect the template row and worker logs. Delete/requeue only if you are sure this is local throwaway data.
- timeout waiting for template meditation
  - The worker is not running, is pointed at a different database, or cannot process audio.
- ffprobe permission error on Linux
  - run `chmod g+x node_modules/@ffprobe-installer/linux-x64/ffprobe`.
  - This is usually not the Mac fix, but it matters on the Linux dev/prod hosts.

## If you want the same exact default meditation as dev

Running the seed creates the local template row and generates a local mp3, but the id/filename may differ from dev.

If you need the exact dev record/audio instead of just a valid local template, restore/copy both:

- the template `meditations` row and related `jobs_queue`/elements data from dev, and
- the generated mp3 file referenced by that row's `filename`/`file_path`.

For normal local development, running the seed is the safer path.
