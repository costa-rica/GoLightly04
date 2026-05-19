# DB Models — TODO

**Project:** `db-models/` (shared Sequelize package)
**Date:** 2026-04-21
**Authoritative source:** `docs/requirements/20260421_GOLIGHTLY04_PLAN_ASSESSMENT_V02.md`

This package is the single source of truth for the database schema, consumed by both `api/` and `worker-node/` via a local workspace dependency (e.g., `@golightly/db-models`).

---

## Phase 1 — Package scaffolding

- [x] Initialize `db-models/` as a TypeScript npm package with `src/` directory
- [x] Add `package.json` with name `@golightly/db-models`, `main: dist/index.js`, `types: dist/index.d.ts`
- [x] Add `tsconfig.json` extending `tsconfig.base.json`; set `outDir: dist`, `rootDir: src`
- [x] Install dependencies: `sequelize`, `pg`, `pg-hstore`
- [x] Install devDependencies: `typescript`, `@types/node`, `@types/pg`
- [x] Add `build` and `typecheck` npm scripts
- [x] Add `.gitignore` (ignore `dist/`, `node_modules/`)

## Phase 2 — Sequelize connection factory

- [x] Create `src/config/env.ts` that reads and validates Postgres env vars: `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_SCHEMA`, `PG_APP_ROLE`, optional `PG_POOL_MAX`, optional `PG_PASSWORD`
- [x] Create `src/config/sequelize.ts` exporting `createSequelize({ role: 'boot' | 'app' })` factory that returns a configured `Sequelize` instance
- [ ] Export a default singleton instance for convenience (lazy-initialized)
- [x] Support the "no password" case (plan: `PostgreSQL password — no password to access database`)

## Phase 3 — Models

Create one file per model under `src/models/`. Each model must define timestamps (`created_at`, `updated_at`) and tableName in `snake_case`.

- [x] `src/models/User.ts` — fields: `id`, `email` (unique), `password` (nullable), `authProvider` (ENUM `'local' | 'google' | 'both'`, default `'local'`), `isEmailVerified` (default false), `emailVerifiedAt` (nullable), `isAdmin` (default false), timestamps
- [x] `src/models/SoundFile.ts` — fields: `id`, `name`, `description` (nullable), `filename`, timestamps
- [x] `src/models/Meditation.ts` — fields: `id`, `userId` (FK), `title`, `description` (nullable), `meditationArray` (JSONB), `filename` (nullable), `filePath` (nullable), `visibility` (ENUM `'public' | 'private'`, default `'public'`), `status` (ENUM `'pending' | 'processing' | 'complete' | 'failed'`), `listenCount` (default 0), timestamps
- [x] `src/models/JobQueue.ts` — fields: `id`, `meditationId` (FK), `sequence`, `type` (ENUM `'text' | 'sound' | 'pause'`), `inputData` (TEXT, JSON string), `status` (ENUM `'pending' | 'processing' | 'complete' | 'failed'`), `filePath` (nullable), `attemptCount` (INT, default `0`), `lastError` (TEXT, nullable), `lastAttemptedAt` (TIMESTAMP, nullable), timestamps. Table name `jobs_queue`.
- [x] `src/models/ContractUserMeditation.ts` — fields: `id`, `userId` (FK), `meditationId` (FK), `createdAt`. Table name `contract_user_meditations`. Composite unique index on `(user_id, meditation_id)`.

## Phase 4 — Associations & exports

- [x] Create `src/models/associations.ts` defining relationships:
  - `User.hasMany(Meditation, { foreignKey: 'userId' })`
  - `Meditation.belongsTo(User)`
  - `Meditation.hasMany(JobQueue, { foreignKey: 'meditationId', onDelete: 'CASCADE' })`
  - `JobQueue.belongsTo(Meditation)`
  - `Meditation.hasMany(ContractUserMeditation, { foreignKey: 'meditationId', onDelete: 'CASCADE' })`
  - `User.hasMany(ContractUserMeditation, { foreignKey: 'userId', onDelete: 'CASCADE' })`
- [x] `src/index.ts` — re-export all models, the sequelize factory, and a `syncAll()` helper
- [x] Provide typed helpers: `InferAttributes<T>`, `InferCreationAttributes<T>` re-exports from sequelize

## Phase 5 — Migrations / sync

- [x] Use Sequelize `sync()` for v1 provisioning. **This is an intentional v1 choice** — it keeps bootstrap simple for a single-instance deployment. A follow-up task to migrate to `umzug` or Sequelize CLI migrations is noted but not part of this TODO; do it before the first multi-instance deployment or the first production schema change.
- [x] Expose `provisionDatabase(sequelize)` function that calls `sequelize.sync()` and returns a summary of created tables
- [ ] Ensure all ENUMs are created idempotently
- [x] Document the v1-sync decision and the follow-up migration task in `db-models/README.md`

## Phase 6 — Typecheck & integration smoke

- [x] Run `npm run typecheck` — must pass
- [x] Run `npm run build` — must produce `dist/`
- [x] Write a minimal smoke script in `db-models/scripts/smoke.ts` that connects to a local Postgres, runs `provisionDatabase`, and inserts+reads a test row for each model (gated behind `SMOKE=1` env var to avoid accidental runs)
- [x] Document in `README.md` how `api/` and `worker-node/` consume this package (via workspace dependency)

## Phase 7 — Wire as workspace dependency

- [x] Configure root `package.json` as an npm workspace containing `db-models`, `shared-types`, `api`, `worker-node`, `web`
- [ ] Verify `api/` and `worker-node/` can `import { User, Meditation, createSequelize } from '@golightly/db-models'`
- [ ] Commit

## Phase 8 — `shared-types/` sibling package

This package is tiny but high-leverage: one source of truth for API request/response DTOs shared between `api/` and `web/`. Prevents drift like the meditation-element shape mismatch Codex flagged.

- [x] Initialize `shared-types/` as a TypeScript package with `src/` directory
- [x] `package.json` name `@golightly/shared-types`, same build setup as `db-models/`
- [x] `src/meditation.ts` — export the canonical meditation element DTO (per V04):

  ```ts
  export type MeditationElement = {
    id: number;
    text?: string;
    voice_id?: string;
    speed?: string;
    pause_duration?: string;
    sound_file?: string;
  };
  ```

  Type is derived from which optional field is populated: `text` → text, `pause_duration` → pause, `sound_file` → sound.

- [x] `src/meditation.ts` — also export `Meditation`, `CreateMeditationRequest`, `CreateMeditationResponse`, `GetAllMeditationsResponse` types used by the existing frontend contract
- [x] `src/user.ts` — export `User` (with `authProvider: 'local' | 'google' | 'both'`), `LoginResponse`, `RegisterResponse`, etc.
- [x] `src/admin.ts` — export `AdminUser`, `QueueRecord` (new jobs_queue shape: `id`, `meditationId`, `sequence`, `type`, `status`, `filePath`, `attemptCount`, `lastError`, `lastAttemptedAt`, timestamps)
- [x] `src/sounds.ts`, `src/database.ts` — re-export existing response shapes from the old `web_obe/src/lib/api/*.ts` files, verified against the V02 DB schema
- [x] `src/error.ts` — `ApiError` envelope `{ error: { code, message, status, details? } }` per `API_REFERENCE.md`
- [x] `src/index.ts` — barrel re-export
- [ ] Verify `api/` and `web/` both consume these types (import checks in their respective TODOs)
- [ ] Commit

---

## Definition of done

- TypeScript builds cleanly
- All 5 models compile with full types and associations
- A local smoke run can provision all 5 tables against a running Postgres
- `@golightly/db-models` importable from `api/` and `worker-node/`
- `@golightly/shared-types` importable from `api/` and `web/`
