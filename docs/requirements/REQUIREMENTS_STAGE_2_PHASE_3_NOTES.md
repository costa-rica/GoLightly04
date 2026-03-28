# Requirements Stage 2 Phase 3 Notes

This document records the implementation notes for Phase 3 of `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md`.

## 1. Internal ElevenLabs Module

The useful `RequesterElevenLabs01` logic was absorbed into `worker-node/src/modules/elevenlabs/`.

Included internal modules:

1. service client
2. voice and speed validation
3. CSV parsing
4. file naming and save logic
5. internal batch workflow

## 2. Removed Standalone Assumptions

The absorbed code no longer depends on:

1. standalone CLI parsing
2. standalone app entrypoints
3. standalone logger initialization
4. stdout as the success contract

Instead, the internal workflow returns structured batch results that `worker-node` can consume directly in a later phase.

## 3. Retained ElevenLabs Runtime Contract

Phase 3 retains these ElevenLabs-specific runtime variables:

1. `API_KEY_ELEVEN_LABS`
2. `PATH_SAVED_ELEVENLABS_AUDIO_MP3_OUTPUT`
3. `PATH_USER_ELEVENLABS_CSV_FILES`
4. `DEFAULT_ELEVENLABS_VOICE_ID`
5. `DEFAULT_ELEVENLABS_SPEED`

`PATH_USER_ELEVENLABS_CSV_FILES` remains for legacy CSV compatibility during stage 2. It can be revisited once the workflow no longer needs file-based compatibility inputs.

## 4. Current Integration Boundary

Phase 3 introduces the internal ElevenLabs workflow but does not yet replace the legacy child-process production path in the main worker orchestrator. That swap is still deferred to the later workflow-refactor phase.
