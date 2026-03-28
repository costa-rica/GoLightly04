# Requirements Stage 2 Phase 1 Decisions

This document records the shared decisions implemented during Phase 1 of `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md`. The purpose of this phase is to lock the stage 2 architecture and runtime contract before source absorption begins.

## 1. Stage 2 Scope

Stage 2 is limited to these code areas:

1. `worker-node`
2. the absorbed ElevenLabs request and file-save logic
3. the absorbed audio concatenation and FFmpeg workflow logic

Out of scope for stage 2 Phase 1:

- redesigning the public `api` service
- redesigning the `web` app
- introducing npm workspace-based package management

## 2. Placement Strategy

The absorbed stage 2 service logic should live inside `worker-node` as internal modules during the first implementation pass.

Reasons:

1. the repo is intentionally using a lightweight multi-project structure
2. `worker-node` is the only production consumer of this workflow
3. internal modules avoid premature package extraction work
4. moving from child processes to direct imports is simpler if the code lands under one application first

Planned internal structure:

1. `worker-node/src/modules/elevenlabs/`
2. `worker-node/src/modules/audio/`
3. `worker-node/src/modules/workflows/`
4. `worker-node/src/types/`

If a later phase shows a clear reuse need, the absorbed modules can be split into their own local package folders then.

## 3. Package And Import Strategy

Stage 2 should keep the current lightweight monorepo strategy.

Rules:

1. `worker-node` remains an application with its own `package.json`
2. `worker-node` should depend on the absorbed `db-models` package through the existing local monorepo package reference pattern
3. absorbed ElevenLabs and audio logic should be imported through internal TypeScript modules, not spawned through `npm start`
4. root scripts may later include `worker-node`, but stage 2 should not depend on npm workspace features

## 4. Workflow Replacement Design

The current child-process workflow should be replaced with an in-process service pipeline.

Target flow:

1. parse and validate the meditation request
2. normalize the meditation sequence into one internal workflow input shape
3. generate ElevenLabs audio for text rows through direct function calls
4. build the final audio sequence in memory or through temporary working files managed by `worker-node`
5. concatenate the sequence through direct audio-module calls
6. persist the final meditation and related file records
7. return a structured workflow result

Rules for the replacement design:

1. `worker-node` should no longer shell out to sibling repositories
2. `worker-node` should no longer parse child-process stdout for success state
3. workflow stages should communicate through returned values and typed errors
4. any temporary files should remain an implementation detail, not a cross-service contract

## 5. TypeScript Contract Strategy

Stage 2 should replace CSV and stdout contracts with explicit TypeScript contracts inside `worker-node`.

Required contract groups:

1. workflow request input
2. normalized meditation step input
3. generated ElevenLabs file metadata
4. audio concatenation step input
5. final generated meditation output metadata
6. workflow success and workflow failure results

Contract rules:

1. route handlers should pass one validated request shape into the orchestrator
2. the orchestrator should return one discriminated success or failure result
3. absorbed ElevenLabs logic should return structured generated-file records
4. absorbed audio logic should return structured output metadata for the final MP3
5. thrown errors should be reserved for exceptional failures, not normal result signaling

## 6. CLI Behavior Decisions

Some standalone CLI behavior should be kept only as internal helper logic, while the standalone service entry assumptions should be removed.

Keep as internal utilities:

1. CSV parsing logic where it still helps convert legacy file inputs
2. file-save logic for generated MP3 assets
3. validation helpers
4. FFmpeg invocation helpers

Remove or absorb:

1. standalone `npm start` entry assumptions
2. CLI argument parsing as a production workflow boundary
3. stdout messages used as machine-readable workflow contracts
4. sibling-repo path assumptions

Decision on CSV:

1. `worker-node` may keep CSV support as a legacy input translation layer
2. internal stage-to-stage workflow boundaries should use TypeScript objects, not generated CSV files, unless a file is truly required by a lower-level tool

## 7. Environment Variable Strategy

Environment variables should be reduced to the runtime values that `worker-node` truly needs after absorption.

Keep environment files local to `worker-node`:

1. `worker-node/.env`
2. `worker-node/.env.example`

Rules:

1. keep env vars for secrets, persistent base directories, and app/runtime behavior
2. remove env vars that only exist to locate absorbed sibling repositories
3. prefer naming variables after the remaining runtime concern, not the removed microservice
4. document only the retained runtime contract in `worker-node/.env.example`

## 8. Environment Variable Inventory

Keep:

1. `PATH_MP3_SOUND_FILES`
2. `PATH_QUEUER`
3. `ADMIN_EMAIL`
4. logging variables that remain required after the logging review
5. ElevenLabs credential variables such as `API_KEY_ELEVEN_LABS`

Rename or review closely:

1. `PATH_USER_ELEVENLABS_CSV_FILES`
   - keep only if legacy CSV ingestion remains supported
   - rename later if the path becomes a more general worker input directory
2. `PATH_AUDIO_CSV_FILE`
   - remove if audio sequencing becomes fully object-driven
   - keep only as a temporary compatibility variable if a file-backed adapter remains during migration
3. `PATH_SAVED_ELEVENLABS_AUDIO_MP3_OUTPUT`
   - keep only if generated speech files still need their own persistent output base path
   - rename later if a more general generated-audio directory is clearer
4. `NAME_CHILD_PROCESS_ELEVENLABS`
   - remove unless some diagnostic naming use survives for logs only
5. `NAME_CHILD_PROCESS_AUDIO_FILE_CONCATENATOR`
   - remove unless some diagnostic naming use survives for logs only

Remove:

1. `PATH_TO_ELEVENLABS_SERVICE`
2. `PATH_TO_AUDIO_FILE_CONCATENATOR`

Rationale:

1. both path variables exist only because `worker-node` currently shells out to external repositories
2. once the absorbed code runs in-process, those path lookups should disappear from runtime config and startup validation

## 9. Filesystem And Binary Constraints

Stage 2 should keep filesystem and binary dependencies explicit.

Known runtime constraints:

1. ElevenLabs output still writes MP3 assets to disk
2. final meditation output still writes MP3 assets to disk
3. the audio pipeline depends on an available FFmpeg binary
4. temporary working files may still be required for FFmpeg operations

Rules:

1. FFmpeg availability should be treated as a real runtime dependency and verified in stage 2 implementation
2. temporary working files should stay inside `worker-node` controlled paths
3. CSV files, if retained, should be treated as external input compatibility files, not internal service contracts

## 10. Endpoint Strategy

`worker-node` should keep one primary production route surface for meditation generation.

Route strategy:

1. preserve the main meditation-generation route shape during absorption
2. keep the orchestrator behind that route as the main production workflow entry
3. add or keep narrow verification endpoints only if they materially improve testing or diagnosis
4. avoid creating separate production routes just to mirror the old standalone microservices

## 11. Phase 1 Outcome

Phase 1 should be considered complete when stage 2 implementation follows these decisions:

1. `worker-node` is absorbed as the stage 2 host application
2. ElevenLabs and audio concatenation code are absorbed as internal modules first
3. child-process execution is treated as legacy behavior to remove
4. `PATH_TO_ELEVENLABS_SERVICE` and `PATH_TO_AUDIO_FILE_CONCATENATOR` are treated as removal targets
5. TypeScript contracts become the internal workflow boundary
