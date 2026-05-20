---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Assessment: Logging Node.js V08 Plan

1. Worker logging env parsing can silently misconfigure existing deployments

- Relevant plan sections:
  - Phase 2 - Worker logger config rewrite
  - Phase 5 - Verification

- Risk:
  - The plan changes `LOG_MAX_SIZE` and `LOG_MAX_FILES` from Winston-style strings (`"10m"` and `"14d"`) to plain numbers, but it does not require a compatibility path or a hard failure for old values. Current worker test setup still uses `LOG_MAX_SIZE="1m"` and `LOG_MAX_FILES="3d"`, and existing `.env` files may reasonably contain the current documented/runtime shape.

- Why this materially matters:
  - If implementation uses `Number()` plus a fallback, old values like `"10m"` and `"14d"` become `NaN` and may silently fall back to `5`, changing production retention and rollover behavior without an obvious failure. If implementation uses strict numeric parsing without updating all fixtures and operator config, the worker may fail to start after deployment. Either outcome threatens rollout safety for a logging change.

- Mitigation:
  - Make the plan require explicit migration handling. Either:
    1. accept only plain numeric values, fail fast with stderr and exit code `1` when a suffix value is provided, and update worker tests, README, and deployment `.env` examples in the same change; or
    2. temporarily parse legacy `"10m"` / `"14d"` values with a deprecation warning, normalize them into numeric megabytes/counts internally, and remove compatibility in a later cleanup.
  - Add a worker logger/env test that covers numeric values and invalid suffix values so the intended behavior is locked down.

2. `NODE_ENV` validation is underspecified for the worker rewrite

- Relevant plan sections:
  - Phase 2 - Worker logger config rewrite
  - Phase 5 - Verification

- Risk:
  - The plan says to validate missing required variables in the logger module, but it does not explicitly require validating that `NODE_ENV` is one of `development`, `testing`, or `production`. The current worker `loadEnv()` also types `NODE_ENV` as a plain string and does not validate allowed values.

- Why this materially matters:
  - The transport selection logic depends entirely on exact mode names. A typo or common `NODE_ENV=test` value could skip the intended testing behavior and fall into the production/file-only path, hiding logs from test output or changing local behavior. Because the logger is initialized at import time, this would be hard to diagnose and could affect every worker entry point.

- Mitigation:
  - Mirror the API logger's `normalizeNodeEnv` behavior in the worker plan:
    1. normalize `test` to `testing` if that alias is intentionally supported; and
    2. fail fast for any other value outside `development`, `testing`, and `production`.
  - Add worker logger tests for development, testing, production, `test`, and an invalid value.

3. Importing the API logger from root scripts is a brittle implementation path

- Relevant plan sections:
  - Phase 4 - Scripts
  - Implementation order and rollout

- Risk:
  - Option A proposes importing `../api/src/config/logger` directly from a root-level script. That makes an operational script depend on the API package's internal singleton logger, import-time environment validation, and transitive Winston dependencies.

- Why this materially matters:
  - Root scripts are owned by the root package and currently run with their own `tsconfig.scripts.json` and root dependencies. Importing the API logger would couple script execution to API internals and cause the script to exit during import when API logging env vars are missing. This can break one-shot maintenance workflows and make future API logger changes risky for scripts that are not part of the API service.

- Mitigation:
  - Remove direct API logger import as a recommended path. If scripts need V08 logging, create a small script-local logger module or extract a shared logging helper into a package intended for cross-workspace use. Otherwise, choose the explicit scripts carve-out and document it as the plan already suggests.
