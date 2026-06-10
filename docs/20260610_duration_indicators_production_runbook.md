---
created_at: 2026-06-10
updated_at: 2026-06-10
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---

# Duration Indicators Production Runbook

This runbook deploys the duration-indicators feature to production, applies the database migration, verifies the live worker path, and backfills existing complete meditations.

## Scope

Feature branch: `dev_10_dur_indicators`

Main code changes:

- Adds nullable `meditations` columns:
  - `duration_seconds_talking`
  - `duration_seconds_pause`
  - `duration_seconds_sound`
- Updates shared/API/worker code to read, reset, and write segment durations.
- Adds the home-page `Guidance` indicator derived from `durationSecondsTalking`.
- Adds `npm run backfill:segment-durations` for historical rows.

## Preconditions

- The feature has been merged to `main` and pushed.
- Production app services can be stopped/started with the production server's documented systemd workflow.
- Production PostgreSQL connection variables are available through the production app environment. Do not print secrets into logs or shell history.
- The production `PATH_PROJECT_RESOURCES` points at the directory containing `prerecorded_audio/`, because the backfill probes prerecorded sound files.
- A recent production database backup exists before applying the migration or backfill.

## 1. Fetch and check out the release code

On the production server, from the GoLightly04 repo:

```bash
git fetch origin --prune
git checkout main
git pull --ff-only origin main
git status --short --branch
```

Confirm the checked-out `main` contains the duration-indicators merge commit before continuing.

## 2. Install dependencies and build

```bash
npm install
npm run build:shared
npm run build -w @golightly/api
npm run build -w @golightly/worker-node
npm run build -w @golightly/web
```

If `npm install` changes `node_modules/@ffprobe-installer/linux-x64/ffprobe` permissions and the worker later reports `EACCES`, repair the helper binary execute bit before requeueing affected work:

```bash
chmod g+x node_modules/@ffprobe-installer/linux-x64/ffprobe
```

## 3. Apply the database migration

Run the migration with the production PostgreSQL environment. Use the production env-loading method already used by the app; do not paste credentials into the command line.

```bash
psql -v ON_ERROR_STOP=1 -f db-models/migrations/20260609_add_duration_seconds_segments.sql
```

Verify the schema:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'meditations'
  AND column_name IN (
    'duration_seconds_talking',
    'duration_seconds_pause',
    'duration_seconds_sound'
  )
ORDER BY column_name;
```

Expected result: all three columns exist as nullable `integer` columns.

## 4. Restart services

Restart backend/worker before frontend, using the exact production systemd unit names and allowed commands.

Preferred order:

1. API
2. Worker
3. Web

If `restart` is not permitted, use the approved `stop` then `start` pair for each unit.

Verify each service is active and review recent logs for startup errors:

```bash
systemctl is-active <api-unit>
systemctl is-active <worker-unit>
systemctl is-active <web-unit>
journalctl -u <worker-unit> -n 80 --no-pager
```

Also verify the web app and API respond through the production URLs.

## 5. Verify the live worker path before backfill

Do not run `--apply` backfill until this live path is verified.

1. Create a new production test meditation, or regenerate an existing safe test meditation.
2. While it is pending, query the row and confirm:
   - `duration_seconds_talking IS NULL`
   - `duration_seconds_pause IS NULL`
   - `duration_seconds_sound IS NULL`
3. After the worker completes, query the same row and confirm all three segment fields are non-null.
4. If regenerating an existing meditation, confirm all four duration fields reset to null when rebuild starts and repopulate when the worker completes:
   - `duration_seconds`
   - `duration_seconds_talking`
   - `duration_seconds_pause`
   - `duration_seconds_sound`
5. Hard-refresh the production web app and confirm the home-page `Guidance` indicator appears and populates for the verified meditation.

## 6. Run the historical backfill

First run a small dry-run if production data shape looks different from dev:

```bash
npm run backfill:segment-durations -- --limit 10
```

Then apply the backfill:

```bash
npm run backfill:segment-durations -- --apply
```

Review the JSON summary:

- `updated` should match the number of complete historical rows that lacked segment values.
- `skippedAlreadySet` should account for rows already handled by the new worker.
- `skippedMissingFile` and `skippedProbeFailed` should be zero or otherwise explainable from known historical file gaps.

## 7. Post-backfill verification

Aggregate check:

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'complete') AS complete_total,
  COUNT(*) FILTER (
    WHERE status = 'complete'
      AND duration_seconds_talking IS NOT NULL
      AND duration_seconds_pause IS NOT NULL
      AND duration_seconds_sound IS NOT NULL
  ) AS complete_with_segments,
  COUNT(*) FILTER (
    WHERE status = 'complete'
      AND (
        duration_seconds_talking IS NULL
        OR duration_seconds_pause IS NULL
        OR duration_seconds_sound IS NULL
      )
  ) AS complete_missing_segments
FROM meditations;
```

Spot-check 3–5 complete meditations with known element lists:

```sql
SELECT id, title, status, duration_seconds,
       duration_seconds_talking,
       duration_seconds_pause,
       duration_seconds_sound
FROM meditations
WHERE status = 'complete'
ORDER BY updated_at DESC
LIMIT 5;
```

Confirm values are plausible:

- text-only meditations should have talking seconds and zero pause/sound when those categories are absent;
- pause-heavy meditations should have pause seconds matching requested pauses;
- sound-bearing meditations should have sound seconds matching prerecorded sound use.

## 8. Rollback notes

Code rollback:

```bash
git checkout main
git reset --hard <previous-production-commit>
# rebuild and restart services using the normal production workflow
```

Schema rollback is normally not required because the new columns are nullable and ignored by old code. If a rollback migration is explicitly required, take a fresh backup first and only then consider dropping the three new columns.

Backfill rollback is data-destructive and should not be attempted casually. If needed, restore from the pre-deploy backup or set the three segment columns back to null only for the affected rows after explicit approval.
