# Postgres Database Provisioning (Production — Ubuntu)

This document covers the one-time setup required on an Ubuntu production server before any
GoLightly04 app can connect to Postgres. It is separate from the runtime provisioning that the
API performs automatically on startup (creating tables, seeding the admin user, ensuring resource
directories exist).

---

## 1. Overview

GoLightly04 uses two Postgres roles:

- `golightly04_boot` — the login role used by the API on startup to run `provisionDatabase()`, which
  creates all tables via Sequelize sync. This role needs broad DDL privileges.

- `golightly04_app` — the runtime login role used for all normal API and worker-node queries after
  startup. This role only needs DML access (SELECT, INSERT, UPDATE, DELETE) plus the ability to use
  sequences for generated primary keys.

The separation means that if `golightly04_app` credentials are ever exposed, an attacker cannot
alter the schema.

---

## 2. Prerequisites

- Ubuntu server (22.04 LTS or later recommended).
- Postgres 14 or later installed and running. If not yet installed:

  ```bash
  sudo apt update
  sudo apt install -y postgresql postgresql-contrib
  sudo systemctl enable --now postgresql
  ```

- `psql` available on your PATH.
- Verify installation:

  ```bash
  psql -V
  sudo systemctl status postgresql
  ```

On Ubuntu, the default Postgres superuser is `postgres` and is accessed via the matching Unix
account (peer authentication).

---

## 3. Connect as a Superuser

From your Ubuntu terminal, switch to the `postgres` system user and open `psql`:

```bash
sudo -u postgres psql
```

All commands in sections 4 through 7 are run inside this `psql` session unless noted otherwise.

---

## 4. Create the Roles

```sql
CREATE ROLE golightly04_boot WITH LOGIN;
CREATE ROLE golightly04_app WITH LOGIN;
```

These roles have no password. Access is controlled via `pg_hba.conf` (see section 8).

---

## 5. Create the Database

```sql
CREATE DATABASE golightly04_prod OWNER golightly04_boot;
```

The `boot` role owns the database so that `provisionDatabase()` can create and alter tables on
first startup without needing superuser rights.

---

## 6. Grant Privileges

Connect to the new database:

```sql
\c golightly04_prod
```

### 6.1 Boot role — schema create

In PostgreSQL 15+, the `public` schema no longer grants `CREATE` to all roles automatically. The
boot role needs it to create ENUM types and tables during `provisionDatabase()`:

```sql
GRANT CREATE ON SCHEMA public TO golightly04_boot;
```

### 6.2 App role — connect and schema usage

Grant connect access:

```sql
GRANT CONNECT ON DATABASE golightly04_prod TO golightly04_app;
```

Grant schema usage:

```sql
GRANT USAGE ON SCHEMA public TO golightly04_app;
```

Set default privileges so the app role automatically gets DML access to every table and sequence
the boot role creates. The `FOR ROLE golightly04_boot` clause is required — without it the grant
only covers objects created by your current superuser, not by the boot role:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO golightly04_app;

ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO golightly04_app;
```

---

## 7. Verify the Roles and Database Exist

Run these queries while still connected as the superuser:

```sql
-- Should return both roles
SELECT rolname FROM pg_roles WHERE rolname LIKE 'golightly04%';

-- Should return golightly04_prod
SELECT datname, pg_catalog.pg_get_userbyid(datdba) AS owner
FROM pg_database
WHERE datname = 'golightly04_prod';
```

Exit psql:

```sql
\q
```

---

## 8. Configure Password-less Local Access (pg_hba.conf)

The `.env` files do not set `PG_PASSWORD`, so Postgres must be configured to allow these roles to
connect from localhost without a password.

### 8.1 Find pg_hba.conf

```bash
sudo -u postgres psql -c "SHOW hba_file;"
```

Typical location on Ubuntu:

- `/etc/postgresql/16/main/pg_hba.conf` (adjust the version number to match your install)

### 8.2 Add Trust Entries

Open the file with sudo in a text editor:

```bash
sudo nano /etc/postgresql/16/main/pg_hba.conf
```

Add these lines near the top of the connection rules (before any `reject` lines). On Ubuntu the
API and workers typically run on the same host as Postgres, so `local` (Unix socket) and
`127.0.0.1` entries are sufficient:

```
# GoLightly04 production roles
local   golightly04_prod   golightly04_boot   trust
local   golightly04_prod   golightly04_app    trust
host    golightly04_prod   golightly04_boot   127.0.0.1/32   trust
host    golightly04_prod   golightly04_app    127.0.0.1/32   trust
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X` in nano).

> Security note: `trust` only grants password-less access to the two app roles on this specific
> database from localhost. Do not broaden these rules to `all` or to non-loopback addresses.

### 8.3 Reload Postgres

```bash
sudo systemctl reload postgresql
```

If the reload fails, check status and logs:

```bash
sudo systemctl status postgresql
sudo journalctl -u postgresql -n 50
```

---

## 9. Smoke-test the Connections

Verify both roles can connect before starting the apps. On Ubuntu, peer auth is the default for
local connections, so pass `-h 127.0.0.1` to force a TCP connection that matches the `host` trust
rules added above:

```bash
psql -h 127.0.0.1 -U golightly04_boot -d golightly04_prod -c "SELECT current_user, current_database();"
psql -h 127.0.0.1 -U golightly04_app  -d golightly04_prod -c "SELECT current_user, current_database();"
```

Both commands should return a row with the role name and `golightly04_prod` with no password prompt.

---

## 10. Start the API

Once the connections succeed, the API's `onStartUp()` routine handles everything else automatically:

- runs `provisionDatabase()` as the `boot` role to create all 5 tables via Sequelize sync
- ensures the project resource directories exist under `PATH_PROJECT_RESOURCES`
- creates the admin user from `ADMIN_EMAIL` and `ADMIN_PASSWORD` if not already present

For production, run under a process manager such as `pm2` or `systemd` rather than `npm run dev`:

```bash
cd api
npm ci --omit=dev
npm run start        # or: pm2 start npm --name golightly04-api -- run start
```

Watch the log output. A successful startup looks like:

```
Database provisioned
Project resource directories ensured
Admin user created        ← only on first run
Server listening on port 3000
```

---

## 11. Environment Variables Reference

These are the Postgres-related keys the apps read. They live in the `.env` file for each app on
the production server. The values below match the production defaults.

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

---

## 12. Teardown and Reset

To wipe the production database and start over (destructive — confirm before running):

```bash
sudo -u postgres psql
```

```sql
DROP DATABASE IF EXISTS golightly04_prod;
DROP ROLE IF EXISTS golightly04_boot;
DROP ROLE IF EXISTS golightly04_app;
```

Then repeat sections 4 through 9.
