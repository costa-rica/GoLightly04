# DB Models — TODO

**Project:** `db-models/` (shared Sequelize package)
**Date:** 2026-04-21
**Authoritative source:** `docs/requirements/20260421_GOLIGHTLY04_PLAN_ASSESSMENT_V02.md`

This package is the single source of truth for the database schema, consumed by both `api/` and `worker-node/` via a local workspace dependency (e.g., `@golightly/db-models`).

---

## Phase 1 — Package scaffolding

- [ ] Initialize `db-models/` as a TypeScript npm package with `src/` directory
- [ ] Add `package.json` with name `@golightly/db-models`, `main: dist/index.js`, `types: dist/index.d.ts`
- [ ] Add `tsconfig.json` extending `tsconfig.base.json`; set `outDir: dist`, `rootDir: src`
- [ ] Install dependencies: `sequelize`, `pg`, `pg-hstore`
- [ ] Install devDependencies: `typescript`, `@types/node`, `@types/pg`
- [ ] Add `build` and `typecheck` npm scripts
- [ ] Add `.gitignore` (ignore `dist/`, `node_modules/`)

## Phase 2 — Sequelize connection factory

- [ ] Create `src/config/env.ts` that reads and validates Postgres env vars: `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_SCHEMA`, `PG_APP_ROLE`, optional `PG_POOL_MAX`, optional `PG_PASSWORD`
- [ ] Create `src/config/sequelize.ts` exporting `createSequelize({ role: 'boot' | 'app' })` factory that returns a configured `Sequelize` instance
- [ ] Export a default singleton instance for convenience (lazy-initialized)
- [ ] Support the "no password" case (plan: `PostgreSQL password — no password to access database`)

## Phase 3 — Models

Create one file per model under `src/models/`. Each model must define timestamps (`created_at`, `updated_at`) and tableName in `snake_case`.

- [ ] `src/models/User.ts` — fields: `id`, `email` (unique), `password` (nullable), `authProvider` (ENUM `'local' | 'google' | 'both'`, default `'local'`), `isEmailVerified` (default false), `emailVerifiedAt` (nullable), `isAdmin` (default false), timestamps
- [ ] `src/models/SoundFile.ts` — fields: `id`, `name`, `description` (nullable), `filename`, timestamps
- [ ] `src/models/Meditation.ts` — fields: `id`, `userId` (FK), `title`, `description` (nullable), `meditationArray` (JSONB), `filename` (nullable), `filePath` (nullable), `visibility` (ENUM `'public' | 'private'`, default `'public'`), `status` (ENUM `'pending' | 'processing' | 'complete' | 'failed'`), `listenCount` (default 0), timestamps
- [ ] `src/models/JobQueue.ts` — fields: `id`, `meditationId` (FK), `sequence`, `type` (ENUM `'text' | 'sound' | 'pause'`), `inputData` (TEXT, JSON string), `status` (ENUM `'pending' | 'processing' | 'complete' | 'failed'`), `filePath` (nullable), timestamps. Table name `jobs_queue`.
- [ ] `src/models/ContractUserMeditation.ts` — fields: `id`, `userId` (FK), `meditationId` (FK), `createdAt`. Table name `contract_user_meditations`. Composite unique index on `(user_id, meditation_id)`.

## Phase 4 — Associations & exports

- [ ] Create `src/models/associations.ts` defining relationships:
  - `User.hasMany(Meditation, { foreignKey: 'userId' })`
  - `Meditation.belongsTo(User)`
  - `Meditation.hasMany(JobQueue, { foreignKey: 'meditationId', onDelete: 'CASCADE' })`
  - `JobQueue.belongsTo(Meditation)`
  - `Meditation.hasMany(ContractUserMeditation, { foreignKey: 'meditationId', onDelete: 'CASCADE' })`
  - `User.hasMany(ContractUserMeditation, { foreignKey: 'userId', onDelete: 'CASCADE' })`
- [ ] `src/index.ts` — re-export all models, the sequelize factory, and a `syncAll()` helper
- [ ] Provide typed helpers: `InferAttributes<T>`, `InferCreationAttributes<T>` re-exports from sequelize

## Phase 5 — Migrations / sync

- [ ] Decide between Sequelize `sync({ alter: true })` vs `umzug` migrations — the plan's `onStartUp.ts` provisions the DB if it does not exist, so `sync()` is sufficient for the initial build. Document this in `db-models/README.md`
- [ ] Expose `provisionDatabase(sequelize)` function that calls `sequelize.sync()` and returns a summary of created tables
- [ ] Ensure all ENUMs are created idempotently

## Phase 6 — Typecheck & integration smoke

- [ ] Run `npm run typecheck` — must pass
- [ ] Run `npm run build` — must produce `dist/`
- [ ] Write a minimal smoke script in `db-models/scripts/smoke.ts` that connects to a local Postgres, runs `provisionDatabase`, and inserts+reads a test row for each model (gated behind `SMOKE=1` env var to avoid accidental runs)
- [ ] Document in `README.md` how `api/` and `worker-node/` consume this package (via workspace dependency)

## Phase 7 — Wire as workspace dependency

- [ ] Configure root `package.json` as an npm workspace containing `db-models`, `api`, `worker-node`, `web`
- [ ] Verify `api/` and `worker-node/` can `import { User, Meditation, createSequelize } from '@golightly/db-models'`
- [ ] Commit

---

## Definition of done

- TypeScript builds cleanly
- All 5 models compile with full types and associations
- A local smoke run can provision all 5 tables against a running Postgres
- Package is importable from `api/` and `worker-node/` as `@golightly/db-models`
