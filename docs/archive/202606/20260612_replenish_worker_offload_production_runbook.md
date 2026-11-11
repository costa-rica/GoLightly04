---
created_at: 2026-06-12
updated_at: 2026-06-12
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---

# Replenish Worker Offload Production Runbook

This runbook covers the non-reset production rollout path for branch `dev_14_proj_resources_db`.

It intentionally does **not** include the database/resource reset sequence. Do not drop the database, reset schemas, delete `project_resources`, or run a replenish job from this runbook unless the operator separately authorizes that destructive action.

## Scope

This rollout introduces:

- Worker-owned `POST /replenish` handling for database/resource replenish jobs.
- API replenish requests that stage uploaded zip files under `db_replenish` and delegate work to the worker.
- Project-resource directory naming changes from `backups_db` / `backups_db_and_data` to `db_backups` / `db_backups_and_data`, plus new `db_replenish` staging.
- Worker-side restore helper ownership (`safeExtractZip`, `safeRestoreResources`, CSV parsing, restore transaction, sequence reset).
- Maintenance guards that block backup and meditation processing while a replenish job is running.
- A new worker dependency on `unzipper`.

## Preconditions

- The operator has approved deploying branch `dev_14_proj_resources_db` to production.
- The target server has a clean GoLightly04 checkout or the server agent has recorded any local changes before proceeding.
- The server agent can run the normal service-management commands for `golightly04-api.service`, `golightly04-worker-node.service`, and `golightly04-web.service`.
- The server agent has database-owner access through the production app environment so it can grant `TRUNCATE` on tables and `UPDATE` on sequences to the runtime app role.
- No backup, replenish, or meditation-generation job is intentionally running during the deployment window.

## Steps

### 1. Operator: approve non-reset production scope

Confirm this is a code rollout only. This runbook does not perform a production database replenish and does not reset production data or resource files.

If the operator also wants to run an actual production replenish after deployment, stop here and create/use a separate destructive-operation runbook with explicit backup, approval, service-quiesce, and rollback steps.

### 2. Server Agent: inspect current checkout and fetch the deployment branch

From the GoLightly04 repository root:

```bash
git status --short --branch
git fetch origin --prune
git checkout dev_14_proj_resources_db
git pull --ff-only origin dev_14_proj_resources_db
git status --short --branch
git rev-parse HEAD
```

Expected result: the working tree is clean and the local branch is aligned with `origin/dev_14_proj_resources_db`.

### 3. Server Agent: install workspace dependencies

Run the root workspace install so the worker receives the new `unzipper` dependency:

```bash
npm install
```

After install, verify the worker dependency is present:

```bash
node -e "const p=require('./worker-node/package.json'); if(!p.dependencies?.unzipper) throw new Error('worker-node missing unzipper dependency'); console.log('worker unzipper dependency present')"
```

If `npm install` changes package metadata unexpectedly beyond the committed lockfile/workspace updates, stop and inspect before continuing.

### 4. Server Agent: repair packaged binary execute permission if needed

`npm install` can leave the packaged ffprobe binary without group execute permission on this host family. Before starting the worker, repair and verify the mode:

```bash
if test -e node_modules/@ffprobe-installer/linux-x64/ffprobe; then
  chmod g+x node_modules/@ffprobe-installer/linux-x64/ffprobe
  test -x node_modules/@ffprobe-installer/linux-x64/ffprobe
fi
```

This is not a code change and should not be committed.

### 5. Server Agent: build and test before touching services

Run the validation gates that cover the changed shared types, API, web, and worker packages:

```bash
npm run typecheck:shared
npm run typecheck:scripts
npm run build:shared
npm run typecheck -w api
npm test -w api -- --runInBand
npm run build -w api
npm run typecheck -w web
npm run build -w web
npm run typecheck -w worker-node
npm test -w worker-node -- --runInBand
npm run build -w worker-node
```

If a command is unavailable in the target checkout, record the exact missing script and run the nearest package-specific check before proceeding.

### 6. Server Agent: apply database privileges required by worker replenish

The worker restore transaction truncates tables and resets ID sequences as the runtime app role. Production must grant that role `TRUNCATE` on app tables and `UPDATE` on app sequences before any future replenish job runs.

Do not blindly `source` `.env`. Use a parser to load only the needed PostgreSQL values, then run the grants as the database owner role configured by `PG_USER`:

```bash
python3 - <<'PY' >/tmp/golightly04_pg_env.sh
from pathlib import Path
import shlex

env_path = Path('.env')
values = {}
for line in env_path.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith('#') or '=' not in line:
        continue
    key, value = line.split('=', 1)
    key = key.strip()
    if key in {'PG_HOST', 'PG_PORT', 'PG_DATABASE', 'PG_USER', 'PG_SCHEMA', 'PG_APP_ROLE', 'PG_PASSWORD'}:
        value = value.strip().strip('"').strip("'")
        values[key] = value
for key in ['PG_HOST', 'PG_PORT', 'PG_DATABASE', 'PG_USER', 'PG_SCHEMA', 'PG_APP_ROLE']:
    if key not in values:
        raise SystemExit(f'missing {key}')
for key, value in values.items():
    print(f'export {key}={shlex.quote(value)}')
PY
. /tmp/golightly04_pg_env.sh

PGPASSWORD="${PG_PASSWORD:-}" PGHOST="$PG_HOST" PGPORT="$PG_PORT" PGDATABASE="$PG_DATABASE" PGUSER="$PG_USER" psql -v ON_ERROR_STOP=1 -v schema="$PG_SCHEMA" -v app_role="$PG_APP_ROLE" <<'SQL'
GRANT TRUNCATE ON ALL TABLES IN SCHEMA :"schema" TO :"app_role";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA :"schema" TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA :"schema" GRANT TRUNCATE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA :"schema" GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"app_role";
SQL
```

Do not print database passwords or the generated env file in deployment notes.

### 7. Server Agent: verify the runtime app role has the needed privileges

Verify with the runtime app role from `PG_APP_ROLE`, not only the owner role:

```bash
. /tmp/golightly04_pg_env.sh

PGPASSWORD="${PG_PASSWORD:-}" PGHOST="$PG_HOST" PGPORT="$PG_PORT" PGDATABASE="$PG_DATABASE" PGUSER="$PG_APP_ROLE" psql -v ON_ERROR_STOP=1 -Atc "select 'truncate_users=' || has_table_privilege(current_user, '${PG_SCHEMA}.users', 'TRUNCATE'), 'sequence_update_users=' || has_sequence_privilege(current_user, '${PG_SCHEMA}.users_id_seq', 'UPDATE');"
```

Expected result includes:

```text
truncate_users=true|sequence_update_users=true
```

If this check fails, stop. A future replenish job can fail after services are deployed if the app role lacks these privileges.

### 8. Server Agent: ensure project-resource directories exist and are writable

The new naming convention uses `db_backups`, `db_backups_and_data`, and `db_replenish`. Let app startup create them when possible, but verify ownership/writability before smoke testing:

```bash
. /tmp/golightly04_pg_env.sh >/dev/null 2>&1 || true
PROJECT_ROOT=$(python3 - <<'PY'
from pathlib import Path
for line in Path('.env').read_text().splitlines():
    if line.strip().startswith('PATH_PROJECT_RESOURCES='):
        print(line.split('=', 1)[1].strip().strip('"').strip("'"))
        break
PY
)

for dir in db_backups db_backups_and_data db_replenish; do
  mkdir -p "$PROJECT_ROOT/$dir"
  test -w "$PROJECT_ROOT/$dir"
  printf 'writable: %s
' "$PROJECT_ROOT/$dir"
done
```

If the service user cannot write these directories, fix filesystem ownership/permissions before starting the services. Do not move or delete old production backup directories during this rollout.

### 9. Server Agent: restart services in dependency order

Use the exact service names approved for production. If `restart` is not permitted but `stop` and `start` are, use stop/start:

```bash
sudo -n /usr/bin/systemctl stop golightly04-web.service
sudo -n /usr/bin/systemctl stop golightly04-worker-node.service
sudo -n /usr/bin/systemctl stop golightly04-api.service

sudo -n /usr/bin/systemctl start golightly04-api.service
sudo -n /usr/bin/systemctl start golightly04-worker-node.service
sudo -n /usr/bin/systemctl start golightly04-web.service
```

Start API before worker/web so API startup can perform its normal provisioning, then start the worker that now owns replenish work, then web.

### 10. Server Agent: verify services, ports, and startup logs

```bash
systemctl is-active golightly04-api.service golightly04-worker-node.service golightly04-web.service
systemctl status golightly04-api.service --lines=40 --no-pager
systemctl status golightly04-worker-node.service --lines=60 --no-pager
systemctl status golightly04-web.service --lines=40 --no-pager
ss -ltnp | grep -E ':(8001|8002|8003)' || true
```

Expected result: API, worker, and web are active; API listens on `8001`, web on `8002`, and the worker control service listens on `8003` where configured.

### 11. Server Agent: smoke-test non-destructive replenish surfaces

Do not submit a real production replenish zip unless separately approved. Use low-impact checks only:

```bash
curl -sS -i http://127.0.0.1:8001/database/backups | sed -n '1,80p'
curl -sS -i -X POST http://127.0.0.1:8003/replenish   -H 'Content-Type: application/json'   -d '{"filename":"__missing_smoke_test__.zip"}' | sed -n '1,80p'
```

Expected result: the API responds normally, and the worker rejects the fake replenish filename with a client error rather than crashing. Do not leave a fake zip in `db_replenish`.

### 12. Operator: verify browser backup/replenish UI behavior without running replenish

Open the admin/database UI and confirm the page renders with the updated backup/replenish controls. Do not click a destructive restore/replenish confirmation unless the operator has explicitly approved a live data replacement.

### 13. Server Agent: capture final deployment evidence

Record branch, commit, service state, and privilege status in the deployment notes:

```bash
git status --short --branch
git rev-parse HEAD
systemctl is-active golightly04-api.service golightly04-worker-node.service golightly04-web.service
. /tmp/golightly04_pg_env.sh
PGPASSWORD="${PG_PASSWORD:-}" PGHOST="$PG_HOST" PGPORT="$PG_PORT" PGDATABASE="$PG_DATABASE" PGUSER="$PG_APP_ROLE" psql -v ON_ERROR_STOP=1 -Atc "select 'truncate_users=' || has_table_privilege(current_user, '${PG_SCHEMA}.users', 'TRUNCATE'), 'sequence_update_users=' || has_sequence_privilege(current_user, '${PG_SCHEMA}.users_id_seq', 'UPDATE');"
```

Expected result: clean working tree, deployed commit matches the intended branch head, all three services are active, and runtime app role privileges are true.

## Rollback notes

If service startup fails after deployment:

1. Stop web, worker, and API.
2. Check out the previous production commit or branch.
3. Run `npm install`, rebuild affected packages, and repair the ffprobe execute bit if `npm install` touched `node_modules`.
4. Start API, worker, and web in the normal order.
5. Verify services and local ports.

The database privilege grants are safe to leave in place after rollback; they only allow the configured runtime app role to perform operations that the replenish workflow requires.
