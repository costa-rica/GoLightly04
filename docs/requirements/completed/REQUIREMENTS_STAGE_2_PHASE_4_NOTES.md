# Requirements Stage 2 Phase 4 Notes

This document records the implementation notes for Phase 4 of `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md`.

## 1. Internal Audio Module

The useful `AudioFileConcatenator01` logic was absorbed into `worker-node/src/modules/audio/`.

Included internal modules:

1. runtime config
2. CSV parsing
3. file validation
4. FFmpeg-backed audio processing
5. internal workflow orchestration

## 2. Removed Standalone Assumptions

The absorbed code no longer depends on:

1. standalone app entrypoints
2. standalone logger initialization
3. stdout as the output discovery contract

FFmpeg detection is now lazy inside the audio processor so the module can be imported in tests without failing immediately.

## 3. Retained Audio Runtime Contract

Phase 4 retains these audio-processing variables:

1. `PATH_MP3_OUTPUT`
2. `PATH_PROJECT_RESOURCES`
3. `PATH_AUDIO_CSV_FILE`

`PATH_AUDIO_CSV_FILE` remains only for legacy CSV compatibility during stage 2 and should be revisited after the workflow refactor phase.

## 4. Current Integration Boundary

Phase 4 introduces the internal audio workflow but does not yet replace the legacy child-process production path in the main worker orchestrator. That final swap is still deferred to the later workflow-refactor phase.
