# Requirements Stage 2 Phase 2 Notes

This document records the implementation notes for Phase 2 of `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md`.

## 1. Base Application Absorption

The `GoLightly02Queuer` base application was absorbed into `worker-node/` with its `src/` structure preserved.

The initial Phase 2 absorption intentionally keeps the current route surface and most of the current workflow internals intact so stage 2 can continue in controlled phases.

## 2. Package Strategy

The absorbed application now lives as its own local monorepo project:

1. `worker-node/package.json`
2. `worker-node/tsconfig.json`
3. `worker-node/jest.config.cjs`
4. `worker-node/.env.example`

The old `golightly02db` dependency was replaced with the absorbed local package reference:

1. `@golightly/db-models`

## 3. Startup And Env Changes

Phase 2 removes the old sibling-repo path variables from the required startup contract.

Removed from required startup validation:

1. `PATH_TO_ELEVENLABS_SERVICE`
2. `PATH_TO_AUDIO_FILE_CONCATENATOR`

These variables are still referenced by the legacy child-process workflow modules during the temporary compatibility period, but they are no longer treated as required for base application boot.

## 4. Route Surface

The primary production route shape was preserved:

1. `POST /meditations/new`

The Phase 2 absorption adds an app builder so `worker-node` can be tested without booting the full startup flow, but it does not change the production route surface yet.

## 5. Phase 2 Follow-On Work

The main remaining internalization work is deferred to later stage 2 phases:

1. absorb ElevenLabs logic into internal modules
2. absorb audio concatenation logic into internal modules
3. remove child-process execution
4. replace stdout parsing with TypeScript return contracts
