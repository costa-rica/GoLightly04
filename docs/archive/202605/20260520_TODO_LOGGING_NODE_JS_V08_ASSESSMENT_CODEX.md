---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Assessment: TODO Logging Node.js V08

1. `shared-types` extraction can fail without a build step

- Relevant TODO sections:
  - Phase 2a - Extract `normalizeNodeEnv`

- Risk:
  - Phase 2a allows moving `normalizeNodeEnv` into `shared-types`, then tells the implementer to run `npm run typecheck:shared` and API checks. `@golightly/shared-types` exposes `dist/index.js` and `dist/index.d.ts` to consumers, but typecheck does not emit updated `dist` files.

- Why this materially matters:
  - An AI coding agent could correctly update `shared-types/src`, export the helper, and pass `shared-types` typecheck while API or worker imports still resolve against stale built artifacts. This can produce confusing module/type failures during implementation or leave runtime code depending on an export that has not been built.

- Mitigation:
  - Add `npm run build -w @golightly/shared-types` to Phase 2a before API or worker verification. If new tests are added under `shared-types/tests`, also require `npm run test -w @golightly/shared-types`.

2. Logging env validation ownership is ambiguous

- Relevant TODO sections:
  - Phase 2b - Worker env shape migration
  - Phase 2c - Worker logger module rewrite

- Risk:
  - Phase 2b asks `worker-node/src/config/env.ts` to parse and hard-fail logging env values, while Phase 2c asks the logger module to move env validation into the logger before construction. This leaves two plausible owners for `NODE_ENV`, `NAME_APP`, `PATH_TO_LOGS`, `LOG_MAX_SIZE`, and `LOG_MAX_FILES`.

- Why this materially matters:
  - Duplicate parsing paths can drift in accepted values, error messages, defaults, and exit behavior. Because logger initialization happens at import time and application env loading happens later in `server.ts`, inconsistent behavior would make startup failures harder to reason about and could regress the V08 requirement that logger config validates logging env before construction.

- Mitigation:
  - Make a single owner explicit. Prefer a `readLoggerEnv()` helper in `worker-node/src/config/logger.ts` for logging-only variables, and remove `LOG_MAX_SIZE` / `LOG_MAX_FILES` from `WorkerEnv` unless application code actually consumes them. If shared parsing helpers are desired, extract pure helpers for parsing but keep the logger module responsible for the logging-env exit path.

3. Phase 5 uses non-existent root `dev` commands

- Relevant TODO sections:
  - Phase 5 - Verification

- Risk:
  - The verification commands use `npm run dev` generically for API and worker checks, but the root `package.json` has no `dev` script.

- Why this materially matters:
  - An AI coding agent following the TODO literally will hit false verification failures even if the implementation is correct. That can waste time or lead the agent to change unrelated package scripts instead of validating the logging behavior.

- Mitigation:
  - Replace the generic command with workspace-specific commands, such as `npm run dev -w @golightly/api` and `npm run dev -w @golightly/worker-node`, or specify equivalent built `start` commands with the exact environment variables needed for each mode.
