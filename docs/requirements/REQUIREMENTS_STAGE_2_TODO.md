# Requirements Stage 2 Todo

This file tracks the stage 2 implementation work for `worker-node` and the absorption of the existing ElevenLabs and audio-concatenation services into the monorepo. Stage 2 should be treated as a partial redesign, not just a folder move. The goal is to make `worker-node` a true monorepo application with internal workflow boundaries, explicit TypeScript contracts, and testable integrations without relying on npm workspace-based package management.

## Phase 1: stage 2 scope and architecture decisions

- [ ] Confirm stage 2 scope is limited to `worker-node`, the absorbed ElevenLabs logic, and the absorbed audio-concatenation logic.
- [ ] Decide whether the absorbed service logic should live inside `worker-node` as internal modules or as separate internal local packages.
- [ ] Define the final package and import strategy for all stage 2 code.
- [ ] Define the replacement design for the current child-process workflow.
- [ ] Define the explicit TypeScript contracts for generated audio files, workflow inputs, workflow results, and error handling.
- [ ] Decide which existing CLI-only behaviors should remain internal utilities versus which should be removed during absorption.
- [ ] Define the environment-variable strategy for `worker-node` and any new internal packages or modules created in stage 2.
- [ ] Inventory the current stage 2 environment variables and classify them as keep, rename, or remove.
- [ ] Mark `PATH_TO_ELEVENLABS_SERVICE` and `PATH_TO_AUDIO_FILE_CONCATENATOR` for removal once the absorbed logic no longer shells out to external repos.
- [ ] Review whether child-process-era variables such as `NAME_CHILD_PROCESS_ELEVENLABS`, `NAME_CHILD_PROCESS_AUDIO_FILE_CONCATENATOR`, `PATH_USER_ELEVENLABS_CSV_FILES`, `PATH_AUDIO_CSV_FILE`, and `PATH_SAVED_ELEVENLABS_AUDIO_MP3_OUTPUT` should remain, be renamed, or be removed.
- [ ] Record the production endpoint strategy, including the one primary route surface and any optional test-only endpoints.

Phase 1 closeout:

1. Run tests for any application or package touched in this phase if that application or package already uses tests.
2. If the tests pass, check off all completed Phase 1 tasks in `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md`.
3. Commit only the staged changes using the guidance in `AGENTS.md`.
4. In the commit message, reference `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md` and `Phase 1`.
5. Keep the commit title lowercase, concise, and under 50 characters. Add a short body if the change is not trivially small.

## Phase 2: absorb `worker-node` base application

- [ ] Copy the `GoLightly02Queuer` source into `worker-node/` while preserving the `src/` structure.
- [ ] Create or update `worker-node/package.json` for local monorepo usage.
- [ ] Replace the old `file:../GoLightly02Db` dependency with the absorbed `db-models` local package reference.
- [ ] Create or update `worker-node/tsconfig.json` and confirm the project builds inside the monorepo.
- [ ] Review startup, logging, and env handling against `docs/requirements/LOGGING_NODE_JS_V07.md`.
- [ ] Remove or replace logging patterns that should not remain after absorption.
- [ ] Normalize `worker-node` environment-variable loading and create or update `worker-node/.env.example`.
- [ ] Reduce `worker-node/.env.example` to the retained stage 2 runtime contract and remove variables that only existed for external microservice paths.
- [ ] Preserve the existing primary route shape while documenting the changes needed for internalized workflows.
- [ ] Verify that the absorbed `worker-node` can boot inside the monorepo with the absorbed `db-models` package.

Phase 2 closeout:

1. Run `worker-node` tests if `worker-node` uses tests by the end of this phase.
2. If the tests pass, check off all completed Phase 2 tasks in `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md`.
3. Commit only the staged changes using the guidance in `AGENTS.md`.
4. In the commit message, reference `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md` and `Phase 2`.
5. Keep the commit title lowercase, concise, and under 50 characters. Add a short body if the change is not trivially small.

## Phase 3: absorb ElevenLabs logic as internal code

- [ ] Copy the `RequesterElevenLabs01` source into the chosen stage 2 location while preserving the useful `src/` structure.
- [ ] Remove direct dependence on standalone repo layout and CLI-only entry assumptions where they are no longer needed.
- [ ] Convert the useful request, validation, parsing, and file-save logic into internal module or local package exports.
- [ ] Define explicit function contracts for text-to-speech requests, batch processing, generated file metadata, and error results.
- [ ] Review logging and env handling for the absorbed ElevenLabs logic and align it with the monorepo strategy.
- [ ] Create or update `.env.example` documentation for any retained ElevenLabs-specific variables.
- [ ] Replace stdout-dependent success reporting with returned structured values that `worker-node` can consume directly.
- [ ] Add baseline tests for the absorbed ElevenLabs module or local package.

Phase 3 closeout:

1. Run tests for the absorbed ElevenLabs code and for `worker-node` if `worker-node` is touched in this phase.
2. If the tests pass, check off all completed Phase 3 tasks in `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md`.
3. Commit only the staged changes using the guidance in `AGENTS.md`.
4. In the commit message, reference `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md` and `Phase 3`.
5. Keep the commit title lowercase, concise, and under 50 characters. Add a short body if the change is not trivially small.

## Phase 4: absorb audio-concatenation logic as internal code

- [ ] Copy the `AudioFileConcatenator01` source into the chosen stage 2 location while preserving the useful `src/` structure.
- [ ] Remove direct dependence on standalone repo layout and standalone entrypoint assumptions where they are no longer needed.
- [ ] Convert the useful CSV, validation, FFmpeg, and output-generation logic into internal module or local package exports.
- [ ] Define explicit function contracts for audio-sequence input, generated output metadata, and workflow errors.
- [ ] Review logging and env handling for the absorbed audio logic and align it with the monorepo strategy.
- [ ] Create or update `.env.example` documentation for any retained audio-processing variables.
- [ ] Replace stdout-dependent output discovery with returned structured values that `worker-node` can consume directly.
- [ ] Add baseline tests for the absorbed audio module or local package.

Phase 4 closeout:

1. Run tests for the absorbed audio code and for `worker-node` if `worker-node` is touched in this phase.
2. If the tests pass, check off all completed Phase 4 tasks in `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md`.
3. Commit only the staged changes using the guidance in `AGENTS.md`.
4. In the commit message, reference `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md` and `Phase 4`.
5. Keep the commit title lowercase, concise, and under 50 characters. Add a short body if the change is not trivially small.

## Phase 5: refactor `worker-node` orchestration and endpoints

- [ ] Replace child-process execution in `worker-node` with direct internal module or local package calls.
- [ ] Remove dependence on `PATH_TO_ELEVENLABS_SERVICE` and `PATH_TO_AUDIO_FILE_CONCATENATOR` for production workflow execution.
- [ ] Remove or rename remaining environment variables that only existed to support child-process orchestration once the internal workflow contract is in place.
- [ ] Remove stdout parsing as a workflow contract.
- [ ] Update the workflow orchestrator to use explicit returned values from the absorbed ElevenLabs and audio modules.
- [ ] Update queue and status transitions so they still reflect the real workflow stages clearly.
- [ ] Preserve one primary production endpoint surface for meditation generation.
- [ ] Keep or add independent verification endpoints only if they materially help testing and do not complicate the production interface.
- [ ] Review validation, file handling, and database writes after the workflow refactor.
- [ ] Verify that `worker-node` creates the final meditation output using only monorepo-internal code paths.

Phase 5 closeout:

1. Run `worker-node` tests and any absorbed-module tests used by the new workflow.
2. If the tests pass, check off all completed Phase 5 tasks in `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md`.
3. Commit only the staged changes using the guidance in `AGENTS.md`.
4. In the commit message, reference `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md` and `Phase 5`.
5. Keep the commit title lowercase, concise, and under 50 characters. Add a short body if the change is not trivially small.

## Phase 6: stage 2 testing, documentation, and hardening

- [ ] Replace the placeholder `worker-node` test plan with real implemented tests.
- [ ] Add endpoint-level tests for the primary `worker-node` route contract.
- [ ] Add workflow integration tests that cover queue creation, internal ElevenLabs processing, internal audio concatenation, and final output handling.
- [ ] Add failure-path tests for validation errors, upstream API failures, file problems, and workflow cleanup behavior.
- [ ] Review all stage 2 logging behavior in development, testing, and production modes.
- [ ] Review all retained environment variables and remove no-longer-needed child-process path variables from docs and config.
- [ ] Confirm that `PATH_TO_ELEVENLABS_SERVICE` and `PATH_TO_AUDIO_FILE_CONCATENATOR` are no longer present anywhere in the final stage 2 runtime docs or config.
- [ ] Add or update stage 2 setup and usage documentation for `worker-node` and any new internal packages or modules.
- [ ] Run final build verification for `worker-node` and any new stage 2 internal packages.
- [ ] Run final stage 2 test verification for each touched application or package that uses tests.
- [ ] Review this file and make sure all completed stage 2 tasks are checked off.

Phase 6 closeout:

1. Run tests for each stage 2 application or package that uses tests.
2. If the tests pass, check off all completed Phase 6 tasks in `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md`.
3. Commit only the staged changes using the guidance in `AGENTS.md`.
4. In the commit message, reference `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md` and `Phase 6`.
5. Keep the commit title lowercase, concise, and under 50 characters. Add a short body if the change is not trivially small.
