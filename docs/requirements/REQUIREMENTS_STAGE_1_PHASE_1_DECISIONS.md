# Requirements Stage 1 Phase 1 Decisions

This document records the shared decisions implemented during Phase 1 of `docs/requirements/REQUIREMENTS_STAGE_1_TODO.md`. The purpose of this phase is to make the repo ready for stage 1 absorption work without starting the actual source migration yet.

## Stage 1 Scope

Stage 1 is limited to these three applications and packages:

1. `db-models`
2. `api`
3. `web`

`worker-node` is intentionally excluded from stage 1 implementation work.

## Workspace Strategy

The monorepo uses npm workspaces for stage 1.

Included workspaces in Phase 1:

1. `db-models`
2. `api`
3. `web`

Notes:

- `worker-node` is not part of the root workspace manifest yet.
- This keeps the root workspace aligned with the actual stage 1 implementation scope.
- `worker-node` can be added to the root workspace manifest in stage 2 when its absorption work begins.

## Final Internal Package Names

The stage 1 workspace package names are:

1. `@golightly/db-models`
2. `@golightly/api`
3. `@golightly/web`

These names should be treated as the target monorepo identities during the later absorption phases.

## Shared TypeScript, Build, and Script Strategy

The root of the monorepo now provides:

1. a root `package.json` with npm workspace definitions
2. root scripts for `build`, `test`, `lint`, `typecheck`, and `clean`
3. a shared `tsconfig.base.json` for common TypeScript defaults

Strategy notes:

- shared defaults should live at the root only when they are useful across more than one workspace
- application-specific TypeScript details should stay in each application package
- root scripts should coordinate workspaces, not replace per-package scripts

## Root-Level Config Versus Per-App Config

Root-level config should be limited to shared repository concerns:

1. workspace definitions
2. shared TypeScript defaults
3. shared repository scripts
4. repo-wide ignore rules

Per-app and per-package config should stay inside the relevant workspace:

1. `package.json`
2. `tsconfig.json`
3. `.env.example`
4. framework-specific config such as Next.js settings
5. test configuration

This separation keeps the monorepo organized and reduces accidental cross-application coupling.

## Environment Variable Strategy

Environment files should be documented per application or package rather than centralized into one root `.env` file.

Rules for stage 1:

1. each workspace should own its own `.env.example`
2. root-level environment files should be avoided unless a variable is truly shared across multiple workspaces
3. runtime env loading should stay local to each application
4. package documentation should list only the variables actually needed by that package

This approach should make the later `api`, `db-models`, and `web` absorption work easier to reason about and easier to test.

## Stage 2 Items That Are Out Of Scope

The following items are intentionally deferred to stage 2:

1. absorbing `worker-node`
2. absorbing `RequesterElevenLabs01`
3. absorbing `AudioFileConcatenator01`
4. redesigning child-process execution into internal module calls
5. replacing stdout parsing with explicit workflow return contracts
6. finalizing stage 2 endpoint and workflow test strategy
