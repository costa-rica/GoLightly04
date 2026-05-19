# Postgres Database Provisioning

This document covers the one-time setup required before any GoLightly04 app can connect to Postgres.
It is separate from the runtime provisioning that the API performs automatically on startup
(creating tables, seeding the admin user, ensuring resource directories exist).

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

- Postgres 14 or later installed and running locally.
- Access to a Postgres superuser account. On a default macOS Homebrew install this is typically
  your system username. On a default Linux install it is `postgres`.
- `psql` available on your PATH.
- try `psql -V` or `postgres -V` to verify installation

---

## 3. Connect as a Superuser

Open a terminal and connect to the default Postgres instance:

```bash
psql postgres
```

If your superuser account is `postgres`:

```bash
psql -U postgres
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
CREATE DATABASE golightly04_dev OWNER golightly04_boot;
```

The `boot` role owns the database so that `provisionDatabase()` can create and alter tables on
first startup without needing superuser rights.

---

## 6. Grant Privileges

Connect to the new database:

```sql
\c golightly04_dev
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
GRANT CONNECT ON DATABASE golightly04_dev TO golightly04_app;
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

-- Should return golightly04_dev
SELECT datname, pg_catalog.pg_get_userbyid(datdba) AS owner
FROM pg_database
WHERE datname = 'golightly04_dev';
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
psql postgres -c "SHOW hba_file;"
```

Typical locations:

- macOS Homebrew: `/opt/homebrew/var/postgresql@16/pg_hba.conf`
- Linux: `/etc/postgresql/16/main/pg_hba.conf`

### 8.2 Add Trust Entries

Open the file in a text editor and add these two lines near the top of the connection rules
(before any `reject` lines):

```
# GoLightly04 local development roles
local   golightly04_dev   golightly04_boot   trust
local   golightly04_dev   golightly04_app    trust
host    golightly04_dev   golightly04_boot   127.0.0.1/32   trust
host    golightly04_dev   golightly04_app    127.0.0.1/32   trust
```

#### 8.2.1 MacAir Example

In cases like below you don't have to changes anything.
Here is an example of a /opt/homebrew/var/postgresql@16/pg_hba.conf file which very open / accessible:

```
# TYPE  DATABASE        USER            ADDRESS                 METHOD

# "local" is for Unix domain socket connections only
local   all             all                                     trust
# IPv4 local connections:
host    all             all             127.0.0.1/32            trust
```

### 8.3 Reload Postgres

```bash
# macOS Homebrew (adjust version as needed)
brew services restart postgresql@16

# Linux systemd
sudo systemctl reload postgresql
```

---

## 9. Smoke-test the Connections

Verify both roles can connect before starting the apps:

```bash
psql -U golightly04_boot -d golightly04_dev -c "SELECT current_user, current_database();"
psql -U golightly04_app  -d golightly04_dev -c "SELECT current_user, current_database();"
```

Both commands should return a row with the role name and `golightly04_dev` with no password prompt.

---

## 10. Start the API

Once the connections succeed, the API's `onStartUp()` routine handles everything else automatically:

- runs `provisionDatabase()` as the `boot` role to create all 5 tables via Sequelize sync
- ensures the project resource directories exist under `PATH_PROJECT_RESOURCES`
- creates the admin user from `ADMIN_EMAIL` and `ADMIN_PASSWORD` if not already present

```bash
cd api
npm run dev
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

These are the Postgres-related keys the apps read. They live in the `.env` file for each app.
The values below match the local development defaults.

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

---

## 12. Teardown and Reset

To wipe the database and start over during development:

```bash
psql postgres
```

```sql
DROP DATABASE IF EXISTS golightly04_dev;
DROP ROLE IF EXISTS golightly04_boot;
DROP ROLE IF EXISTS golightly04_app;
```

Then repeat sections 4 through 9.
