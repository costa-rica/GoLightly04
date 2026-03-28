# worker-node tests

This directory contains the implemented stage 2 test coverage for `worker-node`.

## Current coverage

1. smoke tests for app construction and the health route
2. route tests for `POST /meditations/new`
3. internal ElevenLabs module tests
4. internal audio module tests
5. workflow-orchestrator tests for successful and failed internal processing

## Purpose of the current tests

1. verify the primary route contract without booting the full startup flow
2. verify the internal ElevenLabs and audio modules through direct function calls
3. verify the stage 2 production workflow path without relying on child processes
4. keep the suite runnable in local development and CI without requiring real external API calls

## Remaining gaps

1. real FFmpeg-backed end-to-end coverage
2. fuller filesystem integration coverage
3. broader startup and environment validation coverage
