---
created_at: 2026-05-19
updated_at: 2026-05-19
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Plan: Apply Node.js Logging V08 to API, Worker, and Scripts

## Goal

Bring every Node.js entry point in this repo into compliance with
[docs/LOGGING_NODE_JS_V08.md](../LOGGING_NODE_JS_V08.md):

- `api/` — already close to spec; close the remaining gaps.
- `worker-node/` — diverges in filenames, transport set, env shape, and
  startup-failure exit pattern; bring it in line.
- `scripts/` — root-level Node scripts still use `console.*`; either give them
  a logger or accept them as an explicit exception.
- `web/` is Next.js and is **out of scope** per the V08 preamble.

## Context (gathered before planning)

- Spec: [docs/LOGGING_NODE_JS_V08.md](../LOGGING_NODE_JS_V08.md).
- Workspaces: `api`, `worker-node`, `web`, `db-models`, `shared-types`
  ([package.json](../../package.json)). `db-models` and `shared-types` are
  libraries (no entry point, no logger of their own).
- API logger: [api/src/config/logger.ts](../../api/src/config/logger.ts).
  Already implements: `readLoggerEnv` validation with stderr + `exit(1)` on
  missing required vars, `${NAME_APP}-%DATE%.log` filename, `maxSize` in MB,
  per-mode transports (dev = console, testing = console + file, prod = file),
  level `debug` in dev / `info` elsewhere, singleton export.
- API entry: [api/src/server.ts](../../api/src/server.ts). Wrapped in async
  IIFE with `logger.error` + stderr + 100ms flush + `exit(1)` on failure —
  matches the "Ensuring Logs on Early Exit" pattern.
- Worker logger: [worker-node/src/config/logger.ts](../../worker-node/src/config/logger.ts).
  Diverges from V08:
  - filename is `%DATE%-worker.log` (hard-coded "worker"); spec requires
    `${NAME_APP}-%DATE%.log`.
  - two file transports (one general, one error-only); spec defines a single
    daily-rotated transport.
  - testing-mode console level is `"error"`; spec says testing emits
    `info`+ to both console and file.
  - production has no console transport (correct), but env validation throws
    a plain `Error` instead of writing to stderr and calling `process.exit(1)`
    from the logger config.
- Worker env: [worker-node/src/config/env.ts](../../worker-node/src/config/env.ts).
  `LOG_MAX_SIZE` is a string (`"10m"`), `LOG_MAX_FILES` is a string
  (`"14d"`). Spec requires `LOG_MAX_SIZE` as megabytes (number; logger
  converts to bytes/`"5m"` internally) and `LOG_MAX_FILES` as a retention
  count (default `5`).
- Worker entry: [worker-node/src/server.ts](../../worker-node/src/server.ts).
  Has the 100ms-flush + `exit(1)` `fatal()` helper, but it lives in
  `server.ts`. Env validation happens inside `start()` — if `loadEnv()`
  throws before the logger is constructed, the early-exit log will not be
  written. V08 wants validation in the logger config itself with stderr +
  `exit(1)` before logger init.
- Console usage in TypeScript sources:

  ```
  $ grep -rE "console\.(log|error|warn|info|debug)" --include="*.ts" api worker-node scripts
  scripts/backfill-meditation-durations.ts  (6 occurrences)
  ```

  `api/src` and `worker-node/src` are already console-free. The only
  remaining migration target is
  [scripts/backfill-meditation-durations.ts](../../scripts/backfill-meditation-durations.ts).
- Child processes: `grep -rn "fork|spawn|child_process|NAME_CHILD_PROCESS"`
  across `api/src`, `worker-node/src`, `scripts` returns nothing. The
  V08 child-process section currently has no implementation target in this
  repo; it should be acknowledged but not built speculatively.

## Non-goals

- Refactoring the worker's logging output format (timestamped printf in
  console). Spec doesn't constrain format, only routing/retention/naming.
- Replacing Winston, adding structured-log shippers, or changing levels
  beyond what the spec mandates.
- Touching `web/` (Next.js, out of scope).
- Implementing child-process wiring; nothing forks today.

## Phases

### Phase 1 — API gap-close (small)

Spec compliance audit only. The API already matches V08; no behavioral
changes expected. Confirm and stop.

1. Re-read [api/src/config/logger.ts](../../api/src/config/logger.ts)
   against the V08 checklist. Confirm:
   - required-var validation runs before `createLogger` and uses stderr +
     `exit(1)` (it does, at lines 25–33).
   - `maxSize` is `"{N}m"` from `LOG_MAX_SIZE` (number) (it is, line 63).
   - `maxFiles` is the numeric retention count from `LOG_MAX_FILES` (it is,
     line 64). **Note** the spec example uses `${LOG_MAX_FILES}d` (day-based
     retention); the current code uses a numeric count. Both are valid per
     spec ("or numeric count"). Keep numeric count.
2. Confirm [api/src/server.ts](../../api/src/server.ts) matches the
   "Ensuring Logs on Early Exit" pattern (async IIFE, `logger.error`, stderr
   write, 100ms flush, `exit(1)`). It does.
3. **Deliverable**: no code change unless the audit surfaces something. Note
   the audit result in the plan revision history.

### Phase 2 — Worker logger config rewrite

Rewrite [worker-node/src/config/logger.ts](../../worker-node/src/config/logger.ts)
and the parts of [worker-node/src/config/env.ts](../../worker-node/src/config/env.ts)
that feed it, to match V08.

1. **Env shape change** in `worker-node/src/config/env.ts`:
   - `LOG_MAX_SIZE: number` (megabytes; default `5`).
   - `LOG_MAX_FILES: number` (retention count; default `5`).
   - Drop the `"10m"` / `"14d"` string defaults. Update the `WorkerEnv`
     interface and the `Number()` parsing accordingly.
   - Audit call sites: this env is consumed by the logger only — confirm
     with `grep -rn "LOG_MAX_SIZE\|LOG_MAX_FILES" worker-node` before
     changing.
2. **Logger config rewrite**, mirroring the API shape:
   - Move env validation into the logger module (or a `readLoggerEnv`
     helper inside it) so that missing required vars produce stderr + `exit(1)`
     *before* logger construction, per V08 §Initialization Requirements.
     Don't rely on the worker's `loadEnv` throwing — that defers the failure
     until `server.ts` runs and means a missing `NAME_APP` produces an
     unlogged stack trace.
   - Filename: `${NAME_APP}-%DATE%.log` (delete the hard-coded `"worker"`
     literal so that `NAME_APP` actually drives the filename, as the spec
     requires for child-process distinction).
   - Single `DailyRotateFile` transport per the spec example; remove the
     separate `*-worker-error.log` file. If we decide error-only separation
     has operational value, raise it as a spec amendment first rather than
     keeping a silent local deviation.
   - Per-mode transports:
     - development: console only, level `debug`.
     - testing: console + file, level `info`.
     - production: file only, level `info`.
   - `maxSize: \`${LOG_MAX_SIZE}m\``, `maxFiles: LOG_MAX_FILES` (numeric).
   - Keep `defaultMeta` (current key is `service`; switch to `app` to match
     the API logger for consistency).
3. **Export shape**: keep `export default logger` for source compatibility
   with existing imports (`import logger from "./config/logger"` in
   `worker-node/src/server.ts` and elsewhere).

### Phase 3 — Worker `server.ts` cleanup

[worker-node/src/server.ts](../../worker-node/src/server.ts) is functionally
close to V08 already; the only change is that env validation now happens
inside the logger import (Phase 2), so `loadEnv()` inside `start()` becomes
the *application* env load, not the logger env load. Keep the `fatal()`
helper and the async IIFE wrapping. No interface change.

### Phase 4 — Scripts

[scripts/backfill-meditation-durations.ts](../../scripts/backfill-meditation-durations.ts)
is the only remaining `console.*` user. Two viable options — pick one with
the user before implementing:

- **Option A (preferred for spec conformance)**: add a thin script logger
  that reuses the V08 contract. Cheapest version: import the API logger
  (`import { logger } from "../api/src/config/logger"`). Requires
  `NAME_APP`, `PATH_TO_LOGS`, `NODE_ENV` in the env when running the
  script.
- **Option B (explicit carve-out)**: declare scripts in `scripts/` exempt
  from V08 (they are short-lived ad-hoc tools, not services). Document the
  carve-out in `AGENTS.md` and leave `console.*` in place.

The spec's preamble says it applies to "standard Node.js applications";
one-shot scripts arguably aren't applications. Recommend Option B unless
operators need persisted backfill logs.

### Phase 5 — Verification

For each of `api/` and `worker-node/`:

1. **Dev mode**: `NODE_ENV=development NAME_APP=… PATH_TO_LOGS=…/tmp/logs npm run dev`
   — confirm logs appear in console, no file created.
2. **Testing mode**: `NODE_ENV=testing …` — confirm logs appear in both
   console and `${NAME_APP}-YYYY-MM-DD.log` under `PATH_TO_LOGS`.
3. **Production mode**: `NODE_ENV=production …` — confirm logs only appear
   in the dated file, not console.
4. **Missing required var**: unset `NAME_APP` and start — confirm stderr
   prints "Missing required env var: NAME_APP" and process exits with code
   `1` *before* any logger output.
5. **Size rollover**: temporarily set `LOG_MAX_SIZE=1` (1 MB) and emit
   enough output to exceed it; confirm a `.log.1` sibling appears with the
   same date.
6. **Retention**: set `LOG_MAX_FILES=2`, backfill a few past-dated files
   manually, restart; confirm only the two newest are kept.
7. **Typecheck**: `npm run typecheck:shared` and the per-workspace
   `npm run typecheck -w @golightly/api` / `-w @golightly/worker-node`.

## Risks and open questions

- **Worker error-file removal**: Phase 2 deletes the dedicated
  `*-worker-error.log`. If any oncall runbook tails that filename, we will
  break it. **Mitigation**: grep `docs/` and `worker-node/README.md` for
  references before deleting; if found, decide between updating the runbook
  or amending V08.
- **`defaultMeta` rename `service` → `app`**: changes the JSON shape of
  every worker log line. Any downstream parser keyed on `service` will see
  the field disappear. Worth a one-line confirmation before merging.
- **Scripts policy**: Option A vs Option B is a real choice — wait for the
  user before changing `scripts/`.
- **No child-process wiring exists today**: the V08 §Child Process Handling
  section is a forward-looking requirement. Acknowledge in the plan,
  implement when the first fork lands.

## Implementation order and rollout

Phases are independent enough to land as three separate commits:

1. `docs:` — this plan (no code change).
2. `refactor(api):` — Phase 1 audit notes only (probably empty diff; skip
   if nothing changes).
3. `refactor(worker-node):` — Phases 2–3 together (logger + env are coupled).
4. `chore(scripts):` — Phase 4, only after the Option A/B decision.

Each commit should be runnable on its own; do not stack worker changes on
top of a pending scripts decision.

## Revision history

- 2026-05-19 — initial draft (claude opus-4.7).
