# db-models

Shared Sequelize models for GoLightly04.

## v1 schema strategy

This package intentionally uses `sequelize.sync()` for the first build so the monorepo can bootstrap quickly in a single-instance environment. Before the first multi-instance deployment or the first production schema change, migrate this package to a real migration workflow such as `umzug`.

## Package consumers

- `@golightly/api`
- `@golightly/worker-node`

Both consumers should import models and helpers from `@golightly/db-models` instead of defining their own Sequelize schema copies.
