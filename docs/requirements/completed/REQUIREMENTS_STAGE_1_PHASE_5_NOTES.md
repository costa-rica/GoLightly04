# Requirements Stage 1 Phase 5 Notes

This document records the final integration and hardening notes for stage 1.

## Integration Checks

The following stage 1 integration points are now in place:

1. `api` imports `@golightly/db-models` instead of referencing the old standalone database repository path
2. `web` continues to use `NEXT_PUBLIC_API_BASE_URL=http://localhost:3000`
3. the root workspace scripts coordinate `db-models`, `api`, and `web`

## Final Stage 1 Verification

The final stage 1 verification flow should be run from the repo root:

1. `npm run build`
2. `npm test`

These commands validate:

1. `db-models` build and tests
2. `api` build and tests
3. `web` build

## Remaining Stage 2 Work

The remaining work moves into `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md`.

Stage 2 work includes:

1. absorbing `worker-node`
2. absorbing `RequesterElevenLabs01`
3. absorbing `AudioFileConcatenator01`
4. replacing child-process execution with internal module or package calls
5. replacing stdout parsing with explicit workflow contracts
6. finalizing the `worker-node` workflow and integration test strategy
