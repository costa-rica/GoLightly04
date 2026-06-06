---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---

# Instructions Editable Meditation

Use these steps to absorb the default editable meditation changes into production.

## 1. Update the working tree

```bash
cd /home/limited_user/applications/GoLightly04
git fetch origin
git checkout dev_06_default_meditation
git pull --ff-only origin dev_06_default_meditation
```

## 2. Install dependencies and build

Run this after pulling because `npm install` can change workspace links and the ffprobe binary permissions.

```bash
npm install
chmod g+x node_modules/@ffprobe-installer/linux-x64/ffprobe
npm run build -w @golightly/shared-types
npm run build -w @golightly/db-models
npm run build -w @golightly/api
npm run build -w @golightly/worker-node
npm run build -w @golightly/web
npm run typecheck:scripts
```

Optional pre-restart verification:

```bash
npm run typecheck -w @golightly/api
npm test -w @golightly/api -- --runInBand
npm run typecheck -w @golightly/worker-node
npm test -w @golightly/worker-node -- --runInBand
npm run typecheck -w @golightly/web
```

## 3. Apply database migrations

Back up production first. Then apply any migration that has not already been applied. The SQL files are idempotent for existing columns/indexes.

Load the production Postgres environment for the migration shell only:

```bash
set -a
. api/.env
set +a
```

Run the migrations with the boot/DDL role from `PG_USER` using the local Postgres connection:

```bash
psql -v ON_ERROR_STOP=1 -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -f db-models/migrations/20260518_add_duration_seconds.sql
psql -v ON_ERROR_STOP=1 -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -f db-models/migrations/20260520_add_meditation_stage.sql
```

Verify the new schema:

```bash
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'meditations' AND column_name IN ('duration_seconds', 'stage');"
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -c "SELECT indexname FROM pg_indexes WHERE tablename = 'meditations' AND indexname IN ('meditations_one_template', 'meditations_one_staged_per_user');"
```

Expected results:

- `meditations.duration_seconds` exists.
- `meditations.stage` exists and defaults to `library`.
- `meditations_one_template` exists.
- `meditations_one_staged_per_user` exists.

## 4. Seed the default editable meditation

Run the seed after the migration and builds are complete, in the same shell where `api/.env` was loaded.

```bash
TS_NODE_PROJECT=tsconfig.scripts.json npx ts-node --transpile-only scripts/seedDefaultMeditation.ts
```

The seed is intended to create or reuse the single `stage = 'template'` meditation and enqueue/generate its audio. If the worker reports an ffprobe permission error, re-run:

```bash
chmod g+x node_modules/@ffprobe-installer/linux-x64/ffprobe
```

Then requeue or rerun the seed as needed.

## 5. Restart services

Use stop/start rather than restart where sudoers only permits stop and start.

```bash
sudo systemctl stop golightly04-worker-node.service
sudo systemctl stop golightly04-web.service
sudo systemctl stop golightly04-api.service
sudo systemctl start golightly04-api.service
sudo systemctl start golightly04-web.service
sudo systemctl start golightly04-worker-node.service
```

## 6. Verify production

```bash
systemctl status golightly04-api.service --no-pager
systemctl status golightly04-web.service --no-pager
systemctl status golightly04-worker-node.service --no-pager
ss -ltnp | grep -E ':8001|:8002|:8003'
```

Verify the template meditation exists and is complete:

```bash
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -c "SELECT id, stage, status, filename FROM meditations WHERE stage = 'template';"
```

Expected production state:

- API service active on port `8001`.
- Web service active on port `8002`.
- Worker service active on port `8003`.
- Exactly one template meditation exists.
- The template meditation reaches `status = 'complete'` and has a generated `filename`.
