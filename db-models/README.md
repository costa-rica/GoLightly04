# db-models

Shared Sequelize models for GoLightly04.

## v1 schema strategy

This package intentionally uses `sequelize.sync()` for the first build so the monorepo can bootstrap quickly in a single-instance environment. Before the first multi-instance deployment or the first production schema change, migrate this package to a real migration workflow such as `umzug`.

## Package consumers

- `@golightly/api`
- `@golightly/worker-node`

Both consumers should import models and helpers from `@golightly/db-models` instead of defining their own Sequelize schema copies.

## Migrations

Explicit SQL migrations live in `db-models/migrations/` and should be applied from the repository root with the boot role (`PG_USER`). Do not use `DATABASE_URL`; this project uses `PG_*` variables.

```bash
# Schema changes must run as PG_USER (boot role).
# PG_PASSWORD is typically unset because this repo uses trust auth.
PGPASSWORD="${PG_PASSWORD:-}" \
psql \
  -h "$PG_HOST" \
  -p "$PG_PORT" \
  -U "$PG_USER" \
  -d "$PG_DATABASE" \
  -v ON_ERROR_STOP=1 \
  -f db-models/migrations/20260518_add_duration_seconds.sql
```

`-v ON_ERROR_STOP=1` makes a partial failure exit non-zero. If `PG_SCHEMA` is anything other than `public`, prepend `--set=schema="$PG_SCHEMA"` and reference the schema in the SQL file before applying.
