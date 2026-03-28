# Requirements Stage 1 Todo

This file tracks the stage 1 absorption work for `db-models`, `api`, and `web`. Stage 1 should focus on getting these projects into the monorepo with stable package boundaries, working builds, normalized environment handling, and enough verification to support refactoring safely.

## Phase 1: monorepo setup and shared decisions

- [ ] Confirm stage 1 scope is limited to `db-models`, `api`, and `web`.
- [ ] Decide the workspace strategy for the monorepo and add the root workspace manifest.
- [ ] Define the final internal package names for `db-models`, `api`, and `web`.
- [ ] Decide the shared TypeScript, build, and script strategy for the root of the monorepo.
- [ ] Define how root-level config and per-app config should be separated.
- [ ] Document the environment-variable strategy for root files versus per-app `.env` files.
- [ ] Record the stage 2 items that are intentionally out of scope for this file.

Phase 1 closeout:

1. Run tests for any application touched in this phase if that application already uses tests.
2. If the tests pass, check off all completed Phase 1 tasks in `docs/requirements/REQUIREMENTS_STAGE_1_TODO.md`.
3. Commit only the staged changes using the guidance in `AGENTS.md`.
4. In the commit message, reference `docs/requirements/REQUIREMENTS_STAGE_1_TODO.md` and `Phase 1`.
5. Keep the commit title lowercase, concise, and under 50 characters. Add a short body if the change is not trivially small.

## Phase 2: absorb `db-models`

- [ ] Copy the `GoLightly02Db` source into `db-models/` while preserving the `src/` structure.
- [ ] Create or update `db-models/package.json` for monorepo workspace usage.
- [ ] Create or update `db-models/tsconfig.json` and confirm the package builds in isolation.
- [ ] Replace the old external package identity with the final monorepo package name or alias.
- [ ] Verify that the package still exports the full model surface and initialization entry points needed by consumers.
- [ ] Review `db-models` startup and connection behavior and remove or replace `console.log` usage that should not remain.
- [ ] Add baseline verification for connection, exports, and model initialization.
- [ ] Create or update `db-models/.env.example` if the package requires documented environment variables.

Phase 2 closeout:

1. Run `db-models` tests if `db-models` uses tests by the end of this phase.
2. If the tests pass, check off all completed Phase 2 tasks in `docs/requirements/REQUIREMENTS_STAGE_1_TODO.md`.
3. Commit only the staged changes using the guidance in `AGENTS.md`.
4. In the commit message, reference `docs/requirements/REQUIREMENTS_STAGE_1_TODO.md` and `Phase 2`.
5. Keep the commit title lowercase, concise, and under 50 characters. Add a short body if the change is not trivially small.

## Phase 3: absorb `api`

- [ ] Copy the `GoLightly02API` source into `api/` while preserving the `src/` structure.
- [ ] Create or update `api/package.json` for monorepo workspace usage.
- [ ] Replace the old `file:../GoLightly02Db` dependency with the absorbed `db-models` workspace package.
- [ ] Update import paths and package references so `api` no longer depends on the old standalone repo layout.
- [ ] Create or update `api/tsconfig.json` and confirm the project builds inside the monorepo.
- [ ] Review logging against `docs/requirements/LOGGING_NODE_JS_V07.md` and remove or replace remaining conflicting `console.*` usage.
- [ ] Normalize environment-variable loading and create or update `api/.env.example`.
- [ ] Add Jest and TypeScript test configuration following `docs/requirements/TEST_IMPLEMENTATION_NODE.md`.
- [ ] Add baseline tests for app boot plus critical route contracts.
- [ ] Verify that `api` can boot and use the absorbed `db-models` package correctly.

Phase 3 closeout:

1. Run `api` tests if `api` uses tests by the end of this phase.
2. If the tests pass, check off all completed Phase 3 tasks in `docs/requirements/REQUIREMENTS_STAGE_1_TODO.md`.
3. Commit only the staged changes using the guidance in `AGENTS.md`.
4. In the commit message, reference `docs/requirements/REQUIREMENTS_STAGE_1_TODO.md` and `Phase 3`.
5. Keep the commit title lowercase, concise, and under 50 characters. Add a short body if the change is not trivially small.

## Phase 4: absorb `web`

- [ ] Copy the `GoLightly02NextJs` source into `web/` while preserving the `src/` structure.
- [ ] Create or update `web/package.json` for monorepo workspace usage.
- [ ] Confirm the Next.js app builds correctly inside the monorepo.
- [ ] Normalize public environment variables and create or update `web/.env.example`.
- [ ] Update API base URL configuration so `web` points at the absorbed `api` service.
- [ ] Review the existing browser logging flow and document the stage 1 web logging decision separately from the Node Winston requirement.
- [ ] Add baseline verification for app boot and the most important auth or API-facing flows if a web test framework is introduced in stage 1.
- [ ] Record any web-specific testing work that must be deferred if stage 1 does not introduce a frontend test stack.

Phase 4 closeout:

1. Run `web` tests if `web` uses tests by the end of this phase.
2. If the tests pass, check off all completed Phase 4 tasks in `docs/requirements/REQUIREMENTS_STAGE_1_TODO.md`.
3. Commit only the staged changes using the guidance in `AGENTS.md`.
4. In the commit message, reference `docs/requirements/REQUIREMENTS_STAGE_1_TODO.md` and `Phase 4`.
5. Keep the commit title lowercase, concise, and under 50 characters. Add a short body if the change is not trivially small.

## Phase 5: stage 1 integration and hardening

- [ ] Confirm that `api` uses the absorbed `db-models` package with no dependency on the old standalone repo path.
- [ ] Confirm that `web` uses the absorbed `api` contract and updated environment-variable names.
- [ ] Add or update stage 1 setup and usage documentation for the monorepo and the absorbed apps.
- [ ] Review root and per-app scripts for install, build, and test consistency.
- [ ] Run final build verification for `db-models`, `api`, and `web`.
- [ ] Run final stage 1 test verification for each application that uses tests.
- [ ] Review this file and make sure all completed stage 1 tasks are checked off.
- [ ] Record the remaining stage 2 work that should move into the next TODO file.

Phase 5 closeout:

1. Run tests for each stage 1 application that uses tests.
2. If the tests pass, check off all completed Phase 5 tasks in `docs/requirements/REQUIREMENTS_STAGE_1_TODO.md`.
3. Commit only the staged changes using the guidance in `AGENTS.md`.
4. In the commit message, reference `docs/requirements/REQUIREMENTS_STAGE_1_TODO.md` and `Phase 5`.
5. Keep the commit title lowercase, concise, and under 50 characters. Add a short body if the change is not trivially small.
