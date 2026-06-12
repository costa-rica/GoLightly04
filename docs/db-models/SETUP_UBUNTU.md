---
created_at: 2026-05-14
updated_at: 2026-06-12
created_by: codex (gpt-5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---

# Production Database Setup - Ubuntu

This guide targets an Ubuntu production host running apt-managed PostgreSQL behind the project's normal process manager or reverse proxy.

## Why two roles

GoLightly04 uses two PostgreSQL roles:

- `golightly04_boot` — login role used by the API on startup to run `provisionDatabase()`, which creates all tables via Sequelize sync. Needs broad DDL privileges.
- `golightly04_app` — runtime login role used for all normal API and worker-node queries after startup. Only needs DML access (SELECT, INSERT, UPDATE, DELETE) plus sequence usage for generated primary keys.

The separation means that if `golightly04_app` credentials are ever exposed, an attacker cannot alter the schema.

## First Build

### 1. Verify the engine is running

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
pg_isready -h 127.0.0.1 -p 5432
sudo systemctl status postgresql
```

### 2. Allow local connections without a password

Find the active `pg_hba.conf`:

```bash
sudo -u postgres psql -c "SHOW hba_file;"
```

Edit the file and add project-specific trust rules near the top:

```bash
sudo nano /etc/postgresql/16/main/pg_hba.conf
```

```text
# GoLightly04 production roles
local   golightly04_prod   golightly04_boot   trust
local   golightly04_prod   golightly04_app    trust
host    golightly04_prod   golightly04_boot   127.0.0.1/32   trust
host    golightly04_prod   golightly04_app    127.0.0.1/32   trust
```

Reload PostgreSQL and confirm the database port is not open publicly:

```bash
sudo systemctl reload postgresql
sudo ufw status
ss -ltnp | grep 5432
```

### 3. Create roles

```bash
sudo -u postgres psql -c "CREATE ROLE golightly04_boot WITH LOGIN CREATEDB;"
sudo -u postgres psql -c "CREATE ROLE golightly04_app WITH LOGIN;"
```

### 4. Create the production database

```bash
sudo -u postgres createdb -O golightly04_boot golightly04_prod
sudo -u postgres psql -d golightly04_prod -c "GRANT CONNECT ON DATABASE golightly04_prod TO golightly04_app;"
```

### 5. Grant schema privileges

Two notes on the grants below:

- **`GRANT CREATE ON SCHEMA public`** is required because PostgreSQL 15+ no longer grants `CREATE` on `public` to all roles automatically. Without it, the boot role cannot create ENUM types or tables during `provisionDatabase()`.
- **`ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot`** — the `FOR ROLE` clause is required. Without it the default privileges only cover objects created by your current superuser, not by the boot role.

```bash
sudo -u postgres psql -d golightly04_prod
```

```sql
GRANT CREATE ON SCHEMA public TO golightly04_boot;
GRANT USAGE ON SCHEMA public TO golightly04_app;
ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO golightly04_app;
ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO golightly04_app;
```

- Exit the PostgreSQL terminal with `\q` after the grants finish.

### 6. Configure each package's .env

`api/.env`:

```dotenv
PG_HOST=127.0.0.1
PG_PORT=5432
PG_DATABASE=golightly04_prod
PG_USER=golightly04_boot
PG_SCHEMA=public
PG_APP_ROLE=golightly04_app
PG_PASSWORD=
# PG_POOL_MAX=3
```

`worker-node/.env`:

```dotenv
PG_HOST=127.0.0.1
PG_PORT=5432
PG_DATABASE=golightly04_prod
PG_USER=golightly04_boot
PG_SCHEMA=public
PG_APP_ROLE=golightly04_app
PG_PASSWORD=
# PG_POOL_MAX=3
```

`web/.env` does not connect to PostgreSQL:

```dotenv
NEXT_PUBLIC_API_BASE_URL=https://go-lightly.love
```

- The API uses `PG_USER` through `createSequelize({ role: "boot" })` during startup provisioning.
- The API and worker use `PG_APP_ROLE` through the default runtime connection.
- `PG_PASSWORD` is blank because the project runbook configures localhost trust rules.

### 7. Load data with the database manager

The project database manager is implemented as admin-only API routes, not a standalone CLI:

- Create backup: `POST /database/create-backup`
- Restore backup: `POST /database/replenish-database` with multipart field `file`
- List backups: `GET /database/backups-list`
- Delete backup: `DELETE /database/delete-backup/:filename`

There is no dry-run variant in `api/src/routes/database.ts`.

After the API has started and provisioned the empty schema:

```bash
curl -X POST http://127.0.0.1:3000/database/replenish-database \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -F "file=@/path/to/backup_YYYYMMDD_HHMMSS.zip"
```

### 8. Verify the connection

On Ubuntu, the default for local connections is peer auth, so pass `-h 127.0.0.1` to force a TCP connection that matches the `host` trust rules added in step 2. Without `-h`, `psql -U golightly04_app …` will fail with a peer-auth error because there is no Unix user named `golightly04_app`.

```bash
psql -h 127.0.0.1 -U golightly04_boot -d golightly04_prod -c "SELECT current_user, current_database();"
psql -h 127.0.0.1 -U golightly04_app  -d golightly04_prod -c "SELECT COUNT(*) FROM users;"
```

### 9. Environment variables reference

| Variable      | Value              | Notes                                    |
| ------------- | ------------------ | ---------------------------------------- |
| `PG_HOST`     | `127.0.0.1`        | Use loopback to match `host` trust rule  |
| `PG_PORT`     | `5432`             |                                          |
| `PG_DATABASE` | `golightly04_prod` |                                          |
| `PG_USER`     | `golightly04_boot` | Used on startup for schema provisioning  |
| `PG_APP_ROLE` | `golightly04_app`  | Used for all runtime queries             |
| `PG_SCHEMA`   | `public`           |                                          |
| `PG_PASSWORD` | (not set)          | Omit entirely; trust auth is used        |
| `PG_POOL_MAX` | (optional)         | Defaults to Sequelize's built-in default |

## Restore

### 1. Stop all services

Service unit names are not declared in the repository. Stop the deployment's units for the three running packages:

- API package: `@golightly/api`, default port `3000`
- worker package: `@golightly/worker-node`, default port `3002`
- web package: `@golightly/web`, default port `3001`

Example pattern:

```bash
sudo systemctl stop <api-service>
sudo systemctl stop <worker-node-service>
sudo systemctl stop <web-service>
sudo systemctl status <api-service> <worker-node-service> <web-service>
```

### 2. Confirm no active connections

```bash
sudo -u postgres psql -c "SELECT pid, usename, application_name, state FROM pg_stat_activity WHERE datname = 'golightly04_prod';"
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'golightly04_prod' AND pid <> pg_backend_pid();"
```

### 3. Drop the database

```bash
sudo -u postgres dropdb golightly04_prod
sudo -u postgres psql -l | grep golightly04_prod
```

### 4. Recreate the empty database and reapply privileges

PostgreSQL 15+ revokes `CREATE` on `public` by default. Reapply the grants after recreating the database or Sequelize provisioning can fail.

```bash
sudo -u postgres createdb -O golightly04_boot golightly04_prod
sudo -u postgres psql -d golightly04_prod
```

```sql
GRANT CONNECT ON DATABASE golightly04_prod TO golightly04_app;
GRANT CREATE ON SCHEMA public TO golightly04_boot;
GRANT USAGE ON SCHEMA public TO golightly04_app;
ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO golightly04_app;
ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO golightly04_app;
```

### 5. Stage the backup file

`worker-node/.env.example` shows production resources under `/home/limited_user/project_resources/golightly04/`. If the restore is run through a restricted account such as `limited_user`, stage the backup where that account can read it:

```bash
sudo cp /home/$USER/backup_YYYYMMDD_HHMMSS.zip /home/limited_user/backup_YYYYMMDD_HHMMSS.zip
sudo chown limited_user:limited_user /home/limited_user/backup_YYYYMMDD_HHMMSS.zip
```

### 6. Restore from the backup zip

Start the API so it provisions the empty schema, then upload the zip to the restore route:

```bash
sudo systemctl start <api-service>
```

```bash
nohup curl -X POST http://127.0.0.1:3000/database/replenish-database \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -F "file=@/home/limited_user/backup_YYYYMMDD_HHMMSS.zip" \
  > restore_database.log 2>&1 &

tail -f restore_database.log
```

Follow the API log at the path configured by `PATH_TO_LOGS` in `api/.env`.

### 7. Restart services

```bash
sudo systemctl start <worker-node-service>
sudo systemctl start <web-service>
sudo systemctl status <api-service> <worker-node-service> <web-service>
```

## Full Teardown

To wipe the production database AND drop the roles (destructive — confirm before running):

```bash
sudo -u postgres psql
```

```sql
DROP DATABASE IF EXISTS golightly04_prod;
DROP ROLE IF EXISTS golightly04_boot;
DROP ROLE IF EXISTS golightly04_app;
```

Then repeat the **First Build** steps from the top.

## Quick Reference

| Item | Value |
|---|---|
| Prod database name | `golightly04_prod` |
| Owner role | `golightly04_boot` |
| App role | `golightly04_app` |
| Port | `5432` |
| Host | `127.0.0.1` |
| Schema | `public` |
| Backup paths | `{PATH_PROJECT_RESOURCES}/db_backups`, `{PATH_PROJECT_RESOURCES}/db_backups_and_data`, `{PATH_PROJECT_RESOURCES}/db_replenish` |
| Log file path | `PATH_TO_LOGS` from `api/.env` |
