---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# TODO: Node.js Logging V08 Rollout

Implements [20260520_LOGGING_NODE_JS_V08_PLAN_V02.md](20260520_LOGGING_NODE_JS_V08_PLAN_V02.md)
against the spec in [LOGGING_NODE_JS_V08.md](LOGGING_NODE_JS_V08.md).

Per-phase workflow (per [TODO_LIST_GUIDANCE.md](TODO_LIST_GUIDANCE.md)):
after each phase, run the project's tests and typecheck for the
workspaces touched in that phase, then check off the phase's tasks and
commit referencing this file and the phase number.

## Phase 1 — API gap-close audit

Likely zero-diff. Confirms `api/` already satisfies V08.

- [ ] Re-read [api/src/config/logger.ts](../api/src/config/logger.ts) against the V08 checklist; confirm stderr + `exit(1)` validation, `maxSize: "{N}m"` from numeric `LOG_MAX_SIZE`, numeric `maxFiles`, per-mode transports.
- [ ] Re-read [api/src/server.ts](../api/src/server.ts); confirm async IIFE, `logger.error`, stderr write, 100 ms flush, `exit(1)`.
- [ ] Run `npm run typecheck -w @golightly/api`.
- [ ] Run `npm run test -w @golightly/api`.
- [ ] Record the audit result in this file's revision history at the bottom. Skip the commit if there is no code change.

## Phase 2a — Extract `normalizeNodeEnv`

Decide first whether `shared-types` will host a runtime helper or whether to duplicate into the worker. Default to extraction.

- [ ] Decide 2a-i (extract to `shared-types`) vs. 2a-ii (duplicate into `worker-node/src/config/env.ts`). Note the choice in this file.
- [ ] If 2a-i: move `normalizeNodeEnv` out of [api/src/config/env.ts:64](../api/src/config/env.ts) into the chosen package; update the API import; export from the package index.
- [ ] If 2a-ii: copy the function into `worker-node/src/config/env.ts` with a comment pointing at the API copy as the source of truth.
- [ ] Add unit tests covering `development`, `testing`, `production`, `test → testing`, `""`, `undefined`, and a bogus value (e.g. `"staging"`).
- [ ] Run `npm run typecheck:shared` and `npm run typecheck -w @golightly/api`.
- [ ] Run `npm run test -w @golightly/api`.
- [ ] Commit referencing `20260520_TODO_LOGGING_NODE_JS_V08.md` Phase 2a.

## Phase 2b — Worker env shape migration (numeric, hard-fail)

All fixture updates must land in the same commit as the env-shape change.

- [ ] Update [worker-node/src/config/env.ts](../worker-node/src/config/env.ts): `LOG_MAX_SIZE: number` (default `5`), `LOG_MAX_FILES: number` (default `5`), `NODE_ENV: "development" | "testing" | "production"` using the helper from Phase 2a.
- [ ] Implement hard-fail parsing: when a raw `LOG_MAX_*` value is present, parse with `Number()`; if `!Number.isFinite(parsed) || parsed <= 0`, write `Missing or invalid env var: <NAME> (expected a positive number; got "<raw>")` to stderr and `process.exit(1)`. Never silently fall back when a raw value is present.
- [ ] Update [worker-node/.env.example](../worker-node/.env.example): `LOG_MAX_SIZE=5m` → `LOG_MAX_SIZE=5`, `LOG_MAX_FILES=5d` → `LOG_MAX_FILES=5`.
- [ ] Update [worker-node/tests/helpers/setup.ts:11-12](../worker-node/tests/helpers/setup.ts): `"1m"` → `"1"`, `"3d"` → `"3"`.
- [ ] Update [worker-node/README.md:17-18](../worker-node/README.md) Environment section: annotate `LOG_MAX_SIZE` as "megabytes (integer)" and `LOG_MAX_FILES` as "retention count (integer)".
- [ ] Add worker tests for `LOG_MAX_SIZE`/`LOG_MAX_FILES`: missing → default `5`; `"5"` → `5`; `"10m"` → exits non-zero with stderr naming the var; `"abc"` → same; `"0"` and `"-1"` → same.
- [ ] Add worker tests for `NODE_ENV`: `development`/`testing`/`production` accepted; `test` normalized to `testing`; `staging` and missing exit non-zero.
- [ ] Run `npm run typecheck -w @golightly/worker-node`.
- [ ] Run `npm run test -w @golightly/worker-node`.
- [ ] Commit (bundled with Phase 2c and Phase 3 — see "Commit grouping" below).

## Phase 2c — Worker logger module rewrite

Rewrite [worker-node/src/config/logger.ts](../worker-node/src/config/logger.ts) to match the API's V08 shape.

- [ ] Before deleting the dual error-file transport, `grep -rn "worker-error" docs worker-node` and check any deployment runbooks for tail targets keyed on `*-worker-error.log`. If any are found, decide between updating the runbook or amending V08; do not silently delete.
- [ ] Move env validation into the logger module so missing/invalid required vars produce stderr + `exit(1)` **before** logger construction (i.e. before `server.ts` runs).
- [ ] Change filename pattern to `${NAME_APP}-%DATE%.log`; remove the hard-coded `"worker"` literal.
- [ ] Collapse to a single `DailyRotateFile` transport; remove the `*-worker-error.log` transport.
- [ ] Implement per-mode transports: development → console only at `debug`; testing → console + file at `info`; production → file only at `info`.
- [ ] Pass `maxSize: \`${LOG_MAX_SIZE}m\`` and `maxFiles: LOG_MAX_FILES` (numeric) to the transport.
- [ ] Rename `defaultMeta` key from `service` to `app` for consistency with the API logger. Flag this in the commit body as a JSON-shape break for any downstream parser keyed on `service`.
- [ ] Keep `export default logger` so existing `import logger from "./config/logger"` callers still work.
- [ ] Run `npm run typecheck -w @golightly/worker-node`.
- [ ] Run `npm run test -w @golightly/worker-node`.

## Phase 3 — Worker `server.ts` cleanup

- [ ] Confirm [worker-node/src/server.ts](../worker-node/src/server.ts) still matches the early-exit pattern after Phase 2c: async IIFE (or equivalent), `fatal()` helper with `logger.error` + 100 ms flush + `exit(1)`.
- [ ] Confirm `loadEnv()` inside `start()` is now only the application env load; logger env validation has already run at import.
- [ ] Run `npm run typecheck -w @golightly/worker-node`.
- [ ] Run `npm run test -w @golightly/worker-node`.
- [ ] Commit Phases 2b + 2c + 3 together referencing `20260520_TODO_LOGGING_NODE_JS_V08.md` (see "Commit grouping").

## Phase 4 — Scripts decision

Decide between a script-local logger module and an explicit carve-out **before** writing any code.

- [ ] Confirm with the user: Option A (script-local V08 logger module under `scripts/lib/logger.ts`) vs. Option B (explicit carve-out in `AGENTS.md`). Recommendation is B.
- [ ] If Option A:
  - [ ] Create `scripts/lib/logger.ts` implementing the V08 contract (reads `NAME_APP`, `PATH_TO_LOGS`, `NODE_ENV`, `LOG_MAX_SIZE`, `LOG_MAX_FILES`).
  - [ ] Add `winston` and `winston-daily-rotate-file` to root [package.json](../package.json).
  - [ ] Update [tsconfig.scripts.json](../tsconfig.scripts.json) if needed for the new module.
  - [ ] Migrate the 6 `console.*` calls in [scripts/backfill-meditation-durations.ts](../scripts/backfill-meditation-durations.ts) per the V08 mapping table.
  - [ ] Run `npm run typecheck:scripts`.
- [ ] If Option B:
  - [ ] Add a short paragraph to [AGENTS.md](../AGENTS.md) declaring that one-shot scripts under `scripts/` are exempt from V08 and may use `console.*`. Reference the spec preamble's "standard Node.js applications" wording.
- [ ] Commit referencing `20260520_TODO_LOGGING_NODE_JS_V08.md` Phase 4 (either `chore(scripts):` or `docs(agents):` depending on the choice).

## Phase 5 — Verification

Run against both `api/` and `worker-node/` unless a step is marked worker-only.

- [ ] **Dev mode**: `NODE_ENV=development NAME_APP=… PATH_TO_LOGS=…/tmp/logs npm run dev` → logs in console only, no file created.
- [ ] **Testing mode**: `NODE_ENV=testing …` → logs in both console and `${NAME_APP}-YYYY-MM-DD.log`.
- [ ] **Production mode**: `NODE_ENV=production …` → logs only in the dated file, not console.
- [ ] **`NODE_ENV=test` alias** (worker only): boots in testing mode.
- [ ] **`NODE_ENV=staging`** (worker): exits non-zero with a clear stderr message.
- [ ] **Missing `NAME_APP`**: stderr prints `Missing required env var: NAME_APP`, exit code `1`, no logger output.
- [ ] **Invalid `LOG_MAX_SIZE=10m`** (worker): exits non-zero, stderr names the var and shows the raw value.
- [ ] **Size rollover**: set `LOG_MAX_SIZE=1`, emit > 1 MB; confirm `.log.1` sibling appears with same date.
- [ ] **Retention**: set `LOG_MAX_FILES=2`, backdate a few files, restart; confirm only the two newest remain.
- [ ] **Typecheck**: `npm run typecheck -w @golightly/api` and `npm run typecheck -w @golightly/worker-node`; plus `npm run typecheck:scripts` if Phase 4 Option A landed.
- [ ] **Worker unit tests**: `npm run test -w @golightly/worker-node` includes the new Phase 2b cases.
- [ ] **API unit tests**: `npm run test -w @golightly/api` still green.
- [ ] Commit any final verification notes if applicable, referencing `20260520_TODO_LOGGING_NODE_JS_V08.md` Phase 5.

## Commit grouping

Per the plan's rollout section:

1. `docs:` — plan + this TODO (no code).
2. `refactor(api):` — Phase 1 audit notes only; skip if zero-diff.
3. `refactor(shared):` — Phase 2a, only if option 2a-i is chosen.
4. `refactor(worker-node):` — Phases 2b + 2c + 3 in a single commit; the env shape, fixtures, and logger module are coupled and must not ship in pieces.
5. `chore(scripts):` or `docs(agents):` — Phase 4, depending on A/B.
6. `docs:` — Phase 5 verification notes (optional, only if anything surprising surfaced).

## Revision history

- 2026-05-20 — initial draft (claude opus-4.7).
