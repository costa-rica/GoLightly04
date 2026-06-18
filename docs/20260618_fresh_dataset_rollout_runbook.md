---
created_at: 2026-06-18
updated_at: 2026-06-18
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---

# Fresh Dataset Rollout Runbook for PRD1 Usernames + PRD2 Meditation Tables

This runbook covers validating commit `ad66d69` on branch `dev_09_med_table_mod` with a clean database before production data is uploaded/restored.

## Decision

Test with a fresh dev database before deploying or restoring production data.

Rationale:

- A clean boot validates new-user creation, admin bootstrap username allocation, and table UI behavior without legacy data noise.
- The username migration has already been fixture-tested against existing-user shapes, but a real clean database validates the startup/provision path.
- The production-data restore/import should happen only after the updated schema and username-aware API are deployed.

## Safety Rules

- Do not run these commands against production.
- Confirm `PG_HOST`, `PG_DATABASE`, and service names before dropping anything.
- On this dev host the current app env points at `PG_DATABASE=golightly04_prod`; despite the name, verify it is the intended dev/local database before proceeding.
- Take a backup before destructive reset even on dev.
- Keep DB credentials out of notes, commits, and chat.

## Steps

### 1. Operator: verify target host and branch

```bash
cd /home/limited_user/applications/GoLightly04
git status --short --branch
git log --oneline -3
hostname
```

Expected:

- Branch is `dev_09_med_table_mod`.
- Latest implementation commit includes `ad66d69 feat: add usernames and meditation tables`.
- Host is the intended dev server, not production.

### 2. Operator: inspect DB target without printing secrets

`api/.env` contains an unquoted `EMAIL_FROM=GoLightly <...>` value, so do not rely on plain `source api/.env`. Use `dotenv` parsing through Node:

```bash
cd /home/limited_user/applications/GoLightly04
node - <<'NODE'
const dotenv = require('dotenv');
const parsed = dotenv.config({ path: 'api/.env' }).parsed || {};
for (const key of ['PG_HOST', 'PG_PORT', 'PG_DATABASE', 'PG_SCHEMA', 'PG_USER', 'PG_APP_ROLE']) {
  console.log(`${key}=${parsed[key] || ''}`);
}
NODE
```

Stop if the target is not the intended local/dev database.

### 3. Server agent: stop application writers

```bash
sudo systemctl stop golightly04-worker-node.service
sudo systemctl stop golightly04-api.service
sudo systemctl stop golightly04-web.service
sudo systemctl status golightly04-worker-node.service --no-pager
sudo systemctl status golightly04-api.service --no-pager
sudo systemctl status golightly04-web.service --no-pager
```

If `sudo` is not available to the agent, the operator must run this section.

### 4. Operator: backup the current dev database

Create a timestamped backup before resetting:

```bash
cd /home/limited_user/applications/GoLightly04
mkdir -p /home/limited_user/applications/GoLightly04/tmp/db-reset-backups
node - <<'NODE' > /tmp/golightly04_db_env.sh
const dotenv = require('dotenv');
const parsed = dotenv.config({ path: 'api/.env' }).parsed || {};
for (const key of ['PGHOST:PG_HOST', 'PGPORT:PG_PORT', 'PGDATABASE:PG_DATABASE', 'PGUSER:PG_USER', 'PGPASSWORD:PG_PASSWORD']) {
  const [outKey, inKey] = key.split(':');
  const value = parsed[inKey];
  if (value) console.log(`export ${outKey}=${JSON.stringify(value)}`);
}
NODE
source /tmp/golightly04_db_env.sh
backup="/home/limited_user/applications/GoLightly04/tmp/db-reset-backups/${PGDATABASE}_before_prd1_prd2_reset_$(date +%Y%m%d_%H%M%S).dump"
pg_dump -Fc -f "$backup"
ls -lh "$backup"
rm -f /tmp/golightly04_db_env.sh
```

### 5. Operator: reset the dev database

Preferred approach is database-level reset. This requires a DB owner/superuser or a role with `CREATEDB` and permissions to terminate sessions.

```bash
cd /home/limited_user/applications/GoLightly04
node - <<'NODE' > /tmp/golightly04_db_env.sh
const dotenv = require('dotenv');
const parsed = dotenv.config({ path: 'api/.env' }).parsed || {};
for (const key of ['PGHOST:PG_HOST', 'PGPORT:PG_PORT', 'PGDATABASE:PG_DATABASE', 'PGUSER:PG_USER', 'PGPASSWORD:PG_PASSWORD']) {
  const [outKey, inKey] = key.split(':');
  const value = parsed[inKey];
  if (value) console.log(`export ${outKey}=${JSON.stringify(value)}`);
}
NODE
source /tmp/golightly04_db_env.sh

printf 'About to reset database: host=%s db=%s user=%s\n' "$PGHOST" "$PGDATABASE" "$PGUSER"
read -r -p 'Type RESET DEV DB to continue: ' confirm
[ "$confirm" = 'RESET DEV DB' ] || { echo 'Aborted'; exit 1; }

psql -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${PGDATABASE}' AND pid <> pg_backend_pid();"
dropdb --if-exists "$PGDATABASE"
createdb "$PGDATABASE"
rm -f /tmp/golightly04_db_env.sh
```

If role permissions block database-level reset, use schema-level reset instead:

```bash
cd /home/limited_user/applications/GoLightly04
node - <<'NODE' > /tmp/golightly04_db_env.sh
const dotenv = require('dotenv');
const parsed = dotenv.config({ path: 'api/.env' }).parsed || {};
for (const key of ['PGHOST:PG_HOST', 'PGPORT:PG_PORT', 'PGDATABASE:PG_DATABASE', 'PGUSER:PG_USER', 'PGPASSWORD:PG_PASSWORD']) {
  const [outKey, inKey] = key.split(':');
  const value = parsed[inKey];
  if (value) console.log(`export ${outKey}=${JSON.stringify(value)}`);
}
NODE
source /tmp/golightly04_db_env.sh
psql -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;
SQL
rm -f /tmp/golightly04_db_env.sh
```

### 6. Server agent: rebuild and boot updated services

```bash
cd /home/limited_user/applications/GoLightly04
npm run build:shared
npm run build -w @golightly/api
npm run build -w @golightly/web
npm run build -w @golightly/worker-node

sudo systemctl start golightly04-api.service
sudo systemctl start golightly04-web.service
sudo systemctl start golightly04-worker-node.service
sudo systemctl status golightly04-api.service --no-pager
sudo systemctl status golightly04-web.service --no-pager
sudo systemctl status golightly04-worker-node.service --no-pager
```

`api/src/startup/onStartUp.ts` calls `provisionDatabase(...)` and bootstraps admin users with usernames on startup.

### 7. Server agent: apply username lower-case unique index on fresh DB if needed

Fresh `sequelize.sync()` creates the `users.username` column, but it may not create the `lower(username)` unique index because that index is defined by the raw SQL migration.

After the API has provisioned tables, run the migration file once against the fresh database:

```bash
cd /home/limited_user/applications/GoLightly04
node - <<'NODE' > /tmp/golightly04_db_env.sh
const dotenv = require('dotenv');
const parsed = dotenv.config({ path: 'api/.env' }).parsed || {};
for (const key of ['PGHOST:PG_HOST', 'PGPORT:PG_PORT', 'PGDATABASE:PG_DATABASE', 'PGUSER:PG_USER', 'PGPASSWORD:PG_PASSWORD']) {
  const [outKey, inKey] = key.split(':');
  const value = parsed[inKey];
  if (value) console.log(`export ${outKey}=${JSON.stringify(value)}`);
}
NODE
source /tmp/golightly04_db_env.sh
psql -v ON_ERROR_STOP=1 -f db-models/migrations/20260616_add_user_username.sql
psql -v ON_ERROR_STOP=1 -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'users' AND indexname = 'users_username_lower_idx';"
rm -f /tmp/golightly04_db_env.sh
```

### 8. Server agent: run validation on the fresh DB boot

```bash
cd /home/limited_user/applications/GoLightly04
npm run typecheck:shared
npm run build:shared
npm run typecheck -w @golightly/api
npm test -w @golightly/api
npm run build -w @golightly/api
npm run typecheck -w @golightly/web
npm run build -w @golightly/web
npm run lint -w @golightly/web
npm run typecheck -w @golightly/worker-node
npm test -w @golightly/worker-node
npm run build -w @golightly/worker-node
npm run typecheck:scripts
git diff --check
```

Existing unrelated web lint warnings may still appear in:

- `CreateMeditationForm.tsx`
- `ScriptMeditationEditor.tsx`
- `ModalMeditationDetails.tsx`

### 9. Operator/server agent: smoke-test app behavior

Minimum smoke tests:

1. Log in as bootstrapped admin.
2. Confirm profile page shows username.
3. Edit username to a valid unused value.
4. Try invalid username and confirm client/API rejection.
5. Try duplicate/case-insensitive duplicate username and confirm conflict handling.
6. Create or import a small meditation.
7. Confirm home meditation table shows columns:
   - Title
   - Created By
   - Length
   - Actions/status controls as expected
8. Confirm home search filters by title only.
9. Confirm sorting and pagination work on desktop.
10. Confirm mobile cards match the filtered/sorted/paginated rows.
11. Confirm admin meditation table columns are unchanged.

### 10. Operator: deploy updated code before production-data upload/restore

For production rollout, use a write-pause/maintenance boundary:

1. Pause user-creation writes or stop old API/worker.
2. Deploy username-aware API/web/worker build from `ad66d69` or later.
3. Run `db-models/migrations/20260616_add_user_username.sql` against the restored/imported production database.
4. Start updated services.
5. Smoke-test registration, Google auth new-user creation, profile username edit, and meditation table display.

### 11. Operator: upload/restore production data

After updated code and migration path are ready:

- Restore/import production data into the target database using the existing backup/restore process.
- Run the username migration against the restored data before opening writes.
- Verify:

```sql
SELECT COUNT(*) FROM users WHERE username IS NULL;
SELECT lower(username), COUNT(*) FROM users GROUP BY lower(username) HAVING COUNT(*) > 1;
SELECT COUNT(*) FROM users WHERE username !~ '^[a-z0-9._-]{3,30}$';
```

All three checks should return zero problematic rows.

## Rollback Notes

- If the fresh dev reset fails, restore the backup created in Step 4.
- If production migration fails, keep writes paused, restore from the pre-migration backup, and redeploy the previous API/web/worker build.
- Do not reopen writes with old API code after a schema state that requires `users.username NOT NULL` unless the old API is known to create usernames, which it is not.
