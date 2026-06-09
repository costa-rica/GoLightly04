---
created_at: 2026-05-14
updated_at: 2026-06-09
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Local Database Setup - Mac

This guide targets a macOS workstation running PostgreSQL through Homebrew.

## Why two roles

GoLightly04 uses two PostgreSQL roles:

- `golightly04_boot` — login role used by the API on startup to run `provisionDatabase()`, which creates all tables via Sequelize sync. Needs broad DDL privileges.
- `golightly04_app` — runtime login role used for all normal API and worker-node queries after startup. Only needs DML access (SELECT, INSERT, UPDATE, DELETE) plus sequence usage for generated primary keys.

The separation means that if `golightly04_app` credentials are ever exposed, an attacker cannot alter the schema.

## First Build

### 1. Install the database engine

```bash
brew install postgresql@16
brew services start postgresql@16
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
psql -V
```

### 2. Create roles and databases

```bash
psql postgres
```

```sql
CREATE ROLE golightly04_boot WITH LOGIN CREATEDB;
CREATE ROLE golightly04_app WITH LOGIN;

CREATE DATABASE golightly04_dev OWNER golightly04_boot;
CREATE DATABASE golightly04_test OWNER golightly04_boot;
CREATE DATABASE golightly_test OWNER golightly04_boot;
```

- `golightly04_dev` is the local development database from the project runbooks.
- `golightly04_test` is the API test default from `api/tests/helpers/setup.ts`.
- `golightly_test` is the worker test database name from `worker-node/tests/helpers/setup.ts`.

### 3. Grant schema privileges

Two notes on the grants below:

- **`GRANT CREATE ON SCHEMA public`** is required because PostgreSQL 15+ no longer grants `CREATE` on `public` to all roles automatically. Without it, the boot role cannot create ENUM types or tables during `provisionDatabase()`.
- **`ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot`** — the `FOR ROLE` clause is required. Without it the default privileges only cover objects created by your current superuser, not by the boot role.

Run this block for each project database:

```sql
\c golightly04_dev
GRANT CREATE ON SCHEMA public TO golightly04_boot;
GRANT CONNECT ON DATABASE golightly04_dev TO golightly04_app;
GRANT USAGE ON SCHEMA public TO golightly04_app;
ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO golightly04_app;
ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO golightly04_app;

\c golightly04_test
GRANT CREATE ON SCHEMA public TO golightly04_boot;
GRANT CONNECT ON DATABASE golightly04_test TO golightly04_app;
GRANT USAGE ON SCHEMA public TO golightly04_app;
ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO golightly04_app;
ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO golightly04_app;

\c golightly_test
GRANT CREATE ON SCHEMA public TO golightly04_boot;
GRANT CONNECT ON DATABASE golightly_test TO golightly04_app;
GRANT USAGE ON SCHEMA public TO golightly04_app;
ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO golightly04_app;
ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO golightly04_app;
```

### 4. Configure password-less local access (pg_hba.conf)

The `.env` files do not set `PG_PASSWORD`, so PostgreSQL must allow these roles to connect from localhost without a password.

Find the active `pg_hba.conf`:

```bash
psql postgres -c "SHOW hba_file;"
```

Typical Homebrew location: `/opt/homebrew/var/postgresql@16/pg_hba.conf`.

In most Homebrew installs the default file already grants trust to all local connections, in which case no edits are needed. Example default:

```
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
```

If your `pg_hba.conf` is more restrictive, add project-specific trust rules near the top of the connection rules (before any `reject` lines):

```
# GoLightly04 local development roles
local   golightly04_dev   golightly04_boot   trust
local   golightly04_dev   golightly04_app    trust
host    golightly04_dev   golightly04_boot   127.0.0.1/32   trust
host    golightly04_dev   golightly04_app    127.0.0.1/32   trust
```

Reload PostgreSQL after any edit:

```bash
brew services restart postgresql@16
```

### 5. Seed the dev database

The project does not include a standalone database-manager CLI. The source implements backup and restore as admin-only API routes:

- Create backup: `POST /database/create-backup`
- Restore backup: `POST /database/replenish-database` with multipart field `file`
- Backup location: `{PATH_PROJECT_RESOURCES}/backups_db`

For an empty local schema, start the API once and let `onStartUp()` run `provisionDatabase()`:

```bash
npm run build:shared
cd api
npm run dev
```

To restore from a backup zip after the API is running and an admin JWT is available:

```bash
curl -X POST http://localhost:3000/database/replenish-database \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -F "file=@/path/to/backup_YYYYMMDD_HHMMSS.zip"
```

### 6. Wire up each package's .env

`api/.env` uses the boot role for startup provisioning and the app role for runtime access:

```dotenv
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=golightly04_dev
PG_USER=golightly04_boot
PG_SCHEMA=public
PG_APP_ROLE=golightly04_app
# PG_POOL_MAX=3
```

`worker-node/.env` uses the app role through `getDefaultSequelize()`:

```dotenv
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=golightly04_dev
PG_USER=golightly04_boot
PG_SCHEMA=public
PG_APP_ROLE=golightly04_app
# PG_POOL_MAX=3
```

`web/.env` does not include PostgreSQL settings. It calls the API:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
PORT=3001
```

#### Environment variables reference

| Variable      | Value              | Notes                                    |
| ------------- | ------------------ | ---------------------------------------- |
| `PG_HOST`     | `localhost`        |                                          |
| `PG_PORT`     | `5432`             |                                          |
| `PG_DATABASE` | `golightly04_dev`  |                                          |
| `PG_USER`     | `golightly04_boot` | Used on startup for schema provisioning  |
| `PG_APP_ROLE` | `golightly04_app`  | Used for all runtime queries             |
| `PG_SCHEMA`   | `public`           |                                          |
| `PG_PASSWORD` | (not set)          | Omit entirely; trust auth is used        |
| `PG_POOL_MAX` | (optional)         | Defaults to Sequelize's built-in default |

### 7. Sanity checks

```bash
pg_isready -h localhost -p 5432
psql -U golightly04_boot -d golightly04_dev -c "SELECT current_user, current_database();"
psql -U golightly04_app -d golightly04_dev -c "SELECT current_user, current_database();"
npm run build:shared
npm run typecheck -w @golightly/db-models
```

## Restore

### 1. Verify the engine is running

```bash
pg_isready -h localhost -p 5432
brew services start postgresql@16
```

### 2. Confirm database, roles, and ownership

```bash
psql postgres -c "\\l golightly04_dev"
psql postgres -c "SELECT rolname FROM pg_roles WHERE rolname LIKE 'golightly04%';"
psql postgres -c "SELECT datname, pg_catalog.pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = 'golightly04_dev';"
```

### 3. Stop local services

Stop any running terminal processes for:

- `api`: `npm run dev -w @golightly/api`, port `3000`
- `web`: `npm run dev -w @golightly/web`, port `3001`
- `worker-node`: `npm run dev -w @golightly/worker-node`, port `3002`

Check ports:

```bash
lsof -i :3000
lsof -i :3001
lsof -i :3002
```

### 4. Confirm no active connections

```bash
psql postgres -c "SELECT pid, usename, application_name, state FROM pg_stat_activity WHERE datname = 'golightly04_dev';"
psql postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'golightly04_dev' AND pid <> pg_backend_pid();"
```

### 5. Optional backup before dropping

The backup route writes a zip file to `{PATH_PROJECT_RESOURCES}/backups_db`:

```bash
curl -X POST http://localhost:3000/database/create-backup \
  -H "Authorization: Bearer $ADMIN_JWT"
```

Follow API logs from the path configured by `PATH_TO_LOGS` in `api/.env`.

### 6. Drop the database

```bash
dropdb -U "$(whoami)" golightly04_dev
psql postgres -c "\\l golightly04_dev"
```

### 7. Recreate the empty database and reapply privileges

```bash
createdb -U "$(whoami)" -O golightly04_boot golightly04_dev
psql golightly04_dev
```

```sql
GRANT CREATE ON SCHEMA public TO golightly04_boot;
GRANT CONNECT ON DATABASE golightly04_dev TO golightly04_app;
GRANT USAGE ON SCHEMA public TO golightly04_app;
ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO golightly04_app;
ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO golightly04_app;

SELECT
  has_schema_privilege('golightly04_boot', 'public', 'CREATE') AS boot_can_create,
  has_schema_privilege('golightly04_app', 'public', 'USAGE') AS app_can_use_schema,
  has_database_privilege('golightly04_app', 'golightly04_dev', 'CONNECT') AS app_can_connect;

SELECT
  defaclrole::regrole AS role,
  defaclnamespace::regnamespace AS schema,
  CASE defaclobjtype
    WHEN 'r' THEN 'tables'
    WHEN 'S' THEN 'sequences'
    ELSE defaclobjtype::text
  END AS object_type,
  defaclacl AS default_privileges
FROM pg_default_acl
WHERE defaclrole = 'golightly04_boot'::regrole
  AND defaclnamespace = 'public'::regnamespace
ORDER BY defaclobjtype;
```

### 8. Restore from a backup

Start the API so it can provision tables, then use the exact multipart field name `file`:

```bash
cd api
npm run dev
```

```bash
curl -X POST http://localhost:3000/database/replenish-database \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -F "file=@/path/to/backup_YYYYMMDD_HHMMSS.zip"
```

Follow API logs from the path configured by `PATH_TO_LOGS` in `api/.env`.

### 9. Verify the restored database

```bash
psql -U golightly04_app -d golightly04_dev -c "SELECT COUNT(*) FROM users;"
psql -U golightly04_app -d golightly04_dev -c "SELECT COUNT(*) FROM meditations;"
npm run build -w @golightly/api
npm run build -w @golightly/worker-node
```

### 10. Restart local services

```bash
npm run build:shared
npm run dev -w @golightly/api
npm run dev -w @golightly/worker-node
npm run dev -w @golightly/web
```

## Full Teardown

To wipe the database AND drop the roles (start completely over):

```bash
psql postgres
```

```sql
DROP DATABASE IF EXISTS golightly04_dev;
DROP DATABASE IF EXISTS golightly04_test;
DROP DATABASE IF EXISTS golightly_test;
DROP ROLE IF EXISTS golightly04_boot;
DROP ROLE IF EXISTS golightly04_app;
```

Then repeat the **First Build** steps from the top.

## Quick Reference

| Item | Value |
|---|---|
| Engine install method | Homebrew `postgresql@16` |
| Host | `localhost` |
| Port | `5432` |
| Dev database name | `golightly04_dev` |
| Owner role | `golightly04_boot` |
| Runtime role | `golightly04_app` |
| Schema name | `public` |
| Backup path | `{PATH_PROJECT_RESOURCES}/backups_db` |
| Log path | `PATH_TO_LOGS` from `api/.env` |
