---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---


# TODO V02: Node.js Logging V08 Rollout

Supersedes [20260520_TODO_LOGGING_NODE_JS_V08.md](20260520_TODO_LOGGING_NODE_JS_V08.md).
Implements [20260520_LOGGING_NODE_JS_V08_PLAN_V02.md](20260520_LOGGING_NODE_JS_V08_PLAN_V02.md)
against the spec in [LOGGING_NODE_JS_V08.md](LOGGING_NODE_JS_V08.md).

Incorporates the three findings from
[20260520_TODO_LOGGING_NODE_JS_V08_ASSESSMENT_CODEX.md](20260520_TODO_LOGGING_NODE_JS_V08_ASSESSMENT_CODEX.md):

1. Phase 2a now requires `npm run build -w @golightly/shared-types` (via
   the root `build:shared` script) so downstream imports resolve to the
   freshly emitted `dist/`.
2. Validation ownership is now explicit: a new `readLoggerEnv()` helper
   inside `worker-node/src/config/logger.ts` owns logging-only vars and
   the hard-fail exit path; `worker-node/src/config/env.ts` keeps only
   application vars. The two files have non-overlapping responsibilities.
3. Phase 5 uses workspace-scoped npm commands (`-w @golightly/api`,
   `-w @golightly/worker-node`) instead of the non-existent root
   `npm run dev`.

Per-phase workflow (per [TODO_LIST_GUIDANCE.md](TODO_LIST_GUIDANCE.md)):
after each phase, run the project's tests and typecheck for the
workspaces touched, then check off the phase's tasks and commit
referencing this file and the phase number.

## Phase 1 — API gap-close audit

Likely zero-diff. Confirms `api/` already satisfies V08.

- [ ] Re-read [api/src/config/logger.ts](../api/src/config/logger.ts) against the V08 checklist; confirm stderr + `exit(1)` validation, `maxSize: "{N}m"` from numeric `LOG_MAX_SIZE`, numeric `maxFiles`, per-mode transports.
- [ ] Re-read [api/src/server.ts](../api/src/server.ts); confirm async IIFE, `logger.error`, stderr write, 100 ms flush, `exit(1)`.
- [ ] Run `npm run typecheck -w @golightly/api`.
- [ ] Run `npm run test -w @golightly/api`.
- [ ] Record the audit result in this file's revision history. Skip the commit if there is no code change.

## Phase 2a — Extract `normalizeNodeEnv`

Decide first whether `shared-types` will host a runtime helper or whether to duplicate into the worker.

- [ ] Decide 2a-i (extract to `shared-types`) vs. 2a-ii (duplicate into `worker-node/src/config/env.ts`). Note the choice in this file's revision history.
- [ ] **If 2a-i (extract):**
  - [ ] Move `normalizeNodeEnv` out of [api/src/config/env.ts:64](../api/src/config/env.ts) into `shared-types/src/`; add the export to `shared-types/src/index.ts`.
  - [ ] Update the API import to consume from `@golightly/shared-types`.
  - [ ] Add unit tests under `shared-types/tests/` covering `development`, `testing`, `production`, `test → testing`, `""`, `undefined`, and a bogus value (e.g. `"staging"`).
  - [ ] **Build the shared package so downstream `dist/` is fresh:** `npm run build -w @golightly/shared-types` (or the root `npm run build:shared`). This is required — `typecheck:shared` does not emit, and `api`/`worker-node` resolve `@golightly/shared-types` through `dist/index.js` and `dist/index.d.ts`.
  - [ ] Run `npm run typecheck:shared`.
  - [ ] Run `npm run test -w @golightly/shared-types`.
  - [ ] Run `npm run typecheck -w @golightly/api` (verifies the new dist resolves cleanly).
  - [ ] Run `npm run test -w @golightly/api`.
- [ ] **If 2a-ii (duplicate):**
  - [ ] Copy the function into `worker-node/src/config/env.ts` with a comment pointing at [api/src/config/env.ts:64](../api/src/config/env.ts) as the source of truth and a note to keep the two in sync.
  - [ ] Add equivalent unit tests under `worker-node/tests/` covering the same value matrix.
  - [ ] Run `npm run typecheck -w @golightly/worker-node`.
  - [ ] Run `npm run test -w @golightly/worker-node`.
  - [ ] No `shared-types` build step required.
- [ ] Commit referencing `20260520_TODO_LOGGING_NODE_JS_V08_V02.md` Phase 2a.

## Phase 2b — Worker application env shape

Owns only **application** env vars. Logging vars move to Phase 2c.

- [ ] In [worker-node/src/config/env.ts](../worker-node/src/config/env.ts), set `NODE_ENV: "development" | "testing" | "production"` using the helper from Phase 2a.
- [ ] **Remove `LOG_MAX_SIZE` and `LOG_MAX_FILES` from `WorkerEnv` and from `loadEnv()`.** They are not consumed anywhere outside the logger (verified by `grep -rn "LOG_MAX_SIZE\|LOG_MAX_FILES" worker-node/src`). Ownership moves to the logger module's `readLoggerEnv()` in Phase 2c.
- [ ] Keep validation of `NAME_APP` and `PATH_TO_LOGS` in `loadEnv()` for now if other parts of the app read them; otherwise also move them. After Phase 2c lands, the logger module is the authoritative validator for those two vars at import time, so duplicate validation in `loadEnv()` is acceptable belt-and-suspenders but the error path must be consistent (stderr + `exit(1)`, not thrown `Error`).
- [ ] Run `npm run typecheck -w @golightly/worker-node`.
- [ ] Run `npm run test -w @golightly/worker-node`. Tests will likely still pass; fixture updates land with Phase 2c.

## Phase 2c — Worker logger module rewrite

Owns logging env validation and Winston construction. All operator-facing fixture updates land here together with the env-shape change so the rollout doesn't leave `.env` and code out of step.

- [ ] Before deleting the dual error-file transport, `grep -rn "worker-error" docs worker-node` and check any deployment runbooks for tail targets keyed on `*-worker-error.log`. If any are found, decide between updating the runbook or amending V08; do not silently delete.
- [ ] In [worker-node/src/config/logger.ts](../worker-node/src/config/logger.ts), add a `readLoggerEnv()` helper that owns all logging env parsing and validation:
  - [ ] Required vars: `NODE_ENV`, `NAME_APP`, `PATH_TO_LOGS`. Missing → stderr `Missing required env var: <NAME>` + `process.exit(1)`.
  - [ ] `NODE_ENV` is normalized via the Phase 2a helper; invalid values exit non-zero with a clear stderr message.
  - [ ] `LOG_MAX_SIZE`: read raw string; if absent, default `5`; if present, parse with `Number()`; if `!Number.isFinite(parsed) || parsed <= 0`, stderr `Missing or invalid env var: LOG_MAX_SIZE (expected a positive number; got "<raw>")` + `exit(1)`. Never silently fall back when a raw value is present.
  - [ ] `LOG_MAX_FILES`: same policy as `LOG_MAX_SIZE`, default `5`.
- [ ] Run `readLoggerEnv()` and `fs.mkdirSync(PATH_TO_LOGS, { recursive: true })` at module top level **before** the Winston logger is constructed. Logger init must not run if validation fails.
- [ ] Change filename pattern to `${NAME_APP}-%DATE%.log`; remove the hard-coded `"worker"` literal.
- [ ] Collapse to a single `DailyRotateFile` transport; remove the `*-worker-error.log` transport.
- [ ] Implement per-mode transports: development → console only at `debug`; testing → console + file at `info`; production → file only at `info`.
- [ ] Pass `maxSize: \`${LOG_MAX_SIZE}m\`` and `maxFiles: LOG_MAX_FILES` (numeric) to the transport.
- [ ] Rename `defaultMeta` key from `service` to `app` for consistency with the API logger. Flag in the commit body as a JSON-shape break for any downstream parser keyed on `service`.
- [ ] Keep `export default logger` so existing `import logger from "./config/logger"` callers still work.
- [ ] Update [worker-node/.env.example](../worker-node/.env.example): `LOG_MAX_SIZE=5m` → `LOG_MAX_SIZE=5`, `LOG_MAX_FILES=5d` → `LOG_MAX_FILES=5`.
- [ ] Update [worker-node/tests/helpers/setup.ts:11-12](../worker-node/tests/helpers/setup.ts): `"1m"` → `"1"`, `"3d"` → `"3"`.
- [ ] Update [worker-node/README.md:17-18](../worker-node/README.md) Environment section: annotate `LOG_MAX_SIZE` as "megabytes (integer)" and `LOG_MAX_FILES` as "retention count (integer)".
- [ ] Add worker tests for `LOG_MAX_SIZE`/`LOG_MAX_FILES`: missing → default `5`; `"5"` → `5`; `"10m"` → exits non-zero with stderr naming the var; `"abc"` → same; `"0"` and `"-1"` → same. Tests must target `readLoggerEnv()` so the ownership boundary is enforced.
- [ ] Add worker tests for `NODE_ENV` (via `readLoggerEnv()`): `development`/`testing`/`production` accepted; `test` normalized to `testing`; `staging` and missing exit non-zero.
- [ ] Run `npm run typecheck -w @golightly/worker-node`.
- [ ] Run `npm run test -w @golightly/worker-node`.

## Phase 3 — Worker `server.ts` cleanup

- [ ] Confirm [worker-node/src/server.ts](../worker-node/src/server.ts) still matches the early-exit pattern after Phase 2c: async IIFE (or equivalent), `fatal()` helper with `logger.error` + 100 ms flush + `exit(1)`.
- [ ] Confirm `loadEnv()` inside `start()` is now only the application env load; logger env validation has already run at logger import.
- [ ] Run `npm run typecheck -w @golightly/worker-node`.
- [ ] Run `npm run test -w @golightly/worker-node`.
- [ ] Commit Phases 2b + 2c + 3 together referencing `20260520_TODO_LOGGING_NODE_JS_V08_V02.md` (see "Commit grouping").

## Phase 4 — Scripts decision

Decide **before** writing any code.

- [ ] Confirm with the user: Option A (script-local V08 logger module under `scripts/lib/logger.ts`) vs. Option B (explicit carve-out in `AGENTS.md`). Recommendation is B.
- [ ] **If Option A:**
  - [ ] Create `scripts/lib/logger.ts` implementing the V08 contract (reads `NAME_APP`, `PATH_TO_LOGS`, `NODE_ENV`, `LOG_MAX_SIZE`, `LOG_MAX_FILES`) with the same `readLoggerEnv()` shape as the worker.
  - [ ] Add `winston` and `winston-daily-rotate-file` to root [package.json](../package.json).
  - [ ] Update [tsconfig.scripts.json](../tsconfig.scripts.json) if needed for the new module.
  - [ ] Migrate the 6 `console.*` calls in [scripts/backfill-meditation-durations.ts](../scripts/backfill-meditation-durations.ts) per the V08 mapping table.
  - [ ] Run `npm run typecheck:scripts` from the repo root.
- [ ] **If Option B:**
  - [ ] Add a short paragraph to [AGENTS.md](../AGENTS.md) declaring that one-shot scripts under `scripts/` are exempt from V08 and may use `console.*`. Reference the spec preamble's "standard Node.js applications" wording.
- [ ] Commit referencing `20260520_TODO_LOGGING_NODE_JS_V08_V02.md` Phase 4 (either `chore(scripts):` or `docs(agents):` depending on the choice).

## Phase 5 — Verification

All commands are workspace-scoped — the repo root has no generic `dev` / `start` script. Use `-w @golightly/api` or `-w @golightly/worker-node` for runtime checks; if you prefer to verify the built output instead, run `npm run build -w <pkg>` first and then `npm run start -w <pkg>`.

- [ ] **Dev mode (api)**: `NODE_ENV=development NAME_APP=GoLightly04API PATH_TO_LOGS=/tmp/golightly-logs npm run dev -w @golightly/api` → logs in console only, no file created.
- [ ] **Dev mode (worker)**: `NODE_ENV=development NAME_APP=GoLightly04WorkerNode PATH_TO_LOGS=/tmp/golightly-logs npm run dev -w @golightly/worker-node` → logs in console only, no file created.
- [ ] **Testing mode (api)**: `NODE_ENV=testing … npm run dev -w @golightly/api` → logs in both console and `${NAME_APP}-YYYY-MM-DD.log`.
- [ ] **Testing mode (worker)**: `NODE_ENV=testing … npm run dev -w @golightly/worker-node` → same.
- [ ] **Production mode (api)**: `NODE_ENV=production … npm run dev -w @golightly/api` → logs only in the dated file, not console.
- [ ] **Production mode (worker)**: `NODE_ENV=production … npm run dev -w @golightly/worker-node` → same.
- [ ] **`NODE_ENV=test` alias (worker)**: `NODE_ENV=test … npm run dev -w @golightly/worker-node` → boots in testing mode.
- [ ] **`NODE_ENV=staging` (worker)**: `NODE_ENV=staging … npm run dev -w @golightly/worker-node` → exits non-zero with a clear stderr message.
- [ ] **Missing `NAME_APP`**: unset `NAME_APP`, start either service via its workspace `dev` script → stderr `Missing required env var: NAME_APP`, exit code `1`, no logger output.
- [ ] **Invalid `LOG_MAX_SIZE=10m` (worker)**: `LOG_MAX_SIZE=10m … npm run dev -w @golightly/worker-node` → exits non-zero, stderr names the var and shows the raw value.
- [ ] **Size rollover**: set `LOG_MAX_SIZE=1`, emit > 1 MB; confirm `.log.1` sibling appears with same date.
- [ ] **Retention**: set `LOG_MAX_FILES=2`, backdate a few files, restart; confirm only the two newest remain.
- [ ] **Typecheck**: `npm run typecheck -w @golightly/api` and `npm run typecheck -w @golightly/worker-node`; plus `npm run typecheck:scripts` from root if Phase 4 Option A landed.
- [ ] **Unit tests**: `npm run test -w @golightly/api` and `npm run test -w @golightly/worker-node` (the worker run includes the new Phase 2c cases).
- [ ] **Shared-types tests** (if 2a-i landed): `npm run test -w @golightly/shared-types`.
- [ ] Commit any final verification notes if applicable, referencing `20260520_TODO_LOGGING_NODE_JS_V08_V02.md` Phase 5.

## Commit grouping

Per the plan's rollout section:

1. `docs:` — plan V02 + this TODO V02 (no code).
2. `refactor(api):` — Phase 1 audit notes only; skip if zero-diff.
3. `refactor(shared):` — Phase 2a, only if option 2a-i is chosen. **Do not commit `dist/`** — it is ignored by [.gitignore](../.gitignore) (`dist/` on line 29) and forcing it in with `git add -f` would fight the repo's convention. Run `npm run build -w @golightly/shared-types` locally for verification, and add a line to the commit body telling consumers to run `npm run build:shared` after pulling so their `api`/`worker-node` typechecks resolve against the updated artifacts.
4. `refactor(worker-node):` — Phases 2b + 2c + 3 in a single commit; the env shape, logger module, fixtures, and `server.ts` are coupled and must not ship in pieces.
5. `chore(scripts):` or `docs(agents):` — Phase 4, depending on A/B.
6. `docs:` — Phase 5 verification notes (optional, only if anything surprising surfaced).

## Revision history

- 2026-05-20 — V01 initial draft (claude opus-4.7).
- 2026-05-20 — V02 (claude opus-4.7). Incorporated Codex 5.5 assessment of the TODO:
  added `npm run build -w @golightly/shared-types` to Phase 2a;
  made validation ownership explicit by moving `LOG_MAX_*` out of
  `WorkerEnv` and into a dedicated `readLoggerEnv()` helper inside the
  logger module; replaced bare `npm run dev` commands in Phase 5 with
  workspace-scoped equivalents.
- 2026-05-20 — V02 follow-up (claude opus-4.7). Tightened the
  Phase 2a / commit-grouping policy on `dist/`: it is `.gitignore`d
  in this repo, so do not commit built artifacts — run the build
  locally and tell consumers to run `build:shared` after pulling.
