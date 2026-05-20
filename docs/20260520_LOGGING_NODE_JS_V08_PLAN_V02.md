---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Plan V02: Apply Node.js Logging V08 to API, Worker, and Scripts

Supersedes [20260519_LOGGING_NODE_JS_V08_PLAN.md](20260519_LOGGING_NODE_JS_V08_PLAN.md).
Incorporates the three findings from
[20260520_LOGGING_NODE_JS_V08_PLAN_ASSESSMENT_CODEX.md](20260520_LOGGING_NODE_JS_V08_PLAN_ASSESSMENT_CODEX.md):

1. `LOG_MAX_SIZE` / `LOG_MAX_FILES` env-shape migration is now an explicit,
   enumerated step with a stated parsing policy and a test-coverage
   requirement.
2. Worker `NODE_ENV` validation is promoted from an implicit "mirror the
   API" to a named sub-step with required test coverage.
3. The "import the API logger from root scripts" option is removed; the
   scripts decision now has only two paths, and the recommended one is the
   explicit carve-out.

## Goal

Bring every Node.js entry point in this repo into compliance with
[LOGGING_NODE_JS_V08.md](LOGGING_NODE_JS_V08.md):

- `api/` — already close to spec; close any remaining audit gaps.
- `worker-node/` — diverges in filenames, transport set, env shape, env
  validation, and startup-failure exit pattern; bring it in line, with
  explicit migration of operator-facing config.
- `scripts/` — root-level Node scripts still use `console.*`; decide
  between a small script-local logger module and an explicit carve-out
  before any code change.
- `web/` is Next.js and is **out of scope** per the V08 preamble.

## Context (gathered before planning)

Carried over from V01, plus the call-site enumeration that V01 lacked.

- Spec: [LOGGING_NODE_JS_V08.md](LOGGING_NODE_JS_V08.md).
- Workspaces: `api`, `worker-node`, `web`, `db-models`, `shared-types`
  ([package.json](../package.json)). `db-models` and `shared-types` are
  libraries (no entry point).
- API logger: [api/src/config/logger.ts](../api/src/config/logger.ts).
  Already implements V08 contract.
- API env helper: [api/src/config/env.ts](../api/src/config/env.ts)
  exports `normalizeNodeEnv` at line 64, which aliases `test → testing`
  and rejects unknown values.
- API entry: [api/src/server.ts](../api/src/server.ts). Matches the
  "Ensuring Logs on Early Exit" pattern.
- Worker logger: [worker-node/src/config/logger.ts](../worker-node/src/config/logger.ts).
  Diverges from V08 (filenames, dual transports, testing console level,
  validation timing).
- Worker env: [worker-node/src/config/env.ts](../worker-node/src/config/env.ts).
  `LOG_MAX_SIZE` and `LOG_MAX_FILES` are strings; `NODE_ENV` is an
  unvalidated plain string.
- **`LOG_MAX_SIZE` / `LOG_MAX_FILES` call sites** (exhaustive):
  - [worker-node/.env.example:5-6](../worker-node/.env.example) —
    `LOG_MAX_SIZE=5m`, `LOG_MAX_FILES=5d`.
  - [worker-node/tests/helpers/setup.ts:11-12](../worker-node/tests/helpers/setup.ts)
    — `"1m"`, `"3d"`.
  - [worker-node/README.md:17-18](../worker-node/README.md) — documents
    the vars in the Environment section.
  - [worker-node/src/config/env.ts:8-9, 40-41](../worker-node/src/config/env.ts)
    — interface and defaults.
  - [worker-node/src/config/logger.ts:35-36, 45-46](../worker-node/src/config/logger.ts)
    — consumers.
  - API side already numeric: [api/.env.example:15-16](../api/.env.example),
    [api/.env:15-16](../api/.env). No API migration work.
- Console usage in TypeScript sources:
  ```
  $ grep -rE "console\.(log|error|warn|info|debug)" --include="*.ts" api worker-node scripts
  scripts/backfill-meditation-durations.ts  (6 occurrences)
  ```
- Child processes: `grep -rn "fork|spawn|child_process|NAME_CHILD_PROCESS"`
  across `api/src`, `worker-node/src`, `scripts` returns nothing. V08's
  child-process section has no implementation target today.

## Non-goals

- Refactoring the worker console output format.
- Replacing Winston, adding structured-log shippers, or changing levels
  beyond what V08 mandates.
- Touching `web/` (Next.js, out of scope).
- Implementing child-process wiring; nothing forks today.
- Building a cross-workspace logging package just to serve `scripts/`.
  If scripts adopt V08, it will be via a small script-local module, not
  a new shared package.

## Phases

### Phase 1 — API gap-close audit (likely zero-diff)

Unchanged from V01.

1. Re-read [api/src/config/logger.ts](../api/src/config/logger.ts)
   against the V08 checklist. Confirm stderr + `exit(1)` validation,
   `maxSize: "{N}m"` from numeric `LOG_MAX_SIZE`, numeric `maxFiles`,
   per-mode transports.
2. Confirm [api/src/server.ts](../api/src/server.ts) matches the early-
   exit pattern.
3. **Deliverable**: audit note in the revision history. No code change
   expected.

### Phase 2 — Worker logger config rewrite

Three sub-phases, in order. Each is independently committable.

#### Phase 2a — Extract `normalizeNodeEnv` to a shared spot

The API and the worker need identical `NODE_ENV` normalization. Options:

- **2a-i (preferred)**: move `normalizeNodeEnv` from `api/src/config/env.ts`
  into `shared-types` (or a new tiny `@golightly/node-env` if shared-types
  feels wrong for a runtime helper). Update API import. Add unit tests for
  `development`, `testing`, `production`, `test → testing`, `""`,
  `undefined`, and a bogus value.
- **2a-ii (fallback)**: duplicate the function into
  `worker-node/src/config/env.ts`. Acceptable only if 2a-i is judged too
  invasive — duplication is a deliberate cost.

Pick 2a-i unless the workspace boundaries push back. Either way, the
worker must end up with a function that has the API's exact semantics.

#### Phase 2b — Worker env shape migration (numeric)

Update [worker-node/src/config/env.ts](../worker-node/src/config/env.ts):

- `LOG_MAX_SIZE: number` (megabytes; default `5`).
- `LOG_MAX_FILES: number` (retention count; default `5`).
- `NODE_ENV: "development" | "testing" | "production"` (use the helper
  from Phase 2a).

**Parsing policy: hard-fail on suffix values.** Pick option (1) from the
assessment: any non-numeric value (`"10m"`, `"14d"`, `"5MB"`, `"abc"`) is
treated as a configuration error. The env loader must:

1. Read the raw string.
2. If the raw value is missing, apply the default (`5` / `5`).
3. Otherwise parse with `Number(raw)`; if `Number.isFinite` is false or
   the result is `<= 0`, write `Missing or invalid env var: <NAME>
   (expected a positive number; got "<raw>")` to stderr and `exit(1)`.
4. Never silently fall back when a raw value is present. The whole point
   of the change is to avoid silent retention shifts.

Rationale for hard-fail vs. legacy parsing: this is a two-workspace,
single-operator deployment with `.env` files we control. The transitional
deprecation path Codex sketched as option (2) buys very little here and
keeps a parser shape we don't want long-term.

**Same-commit fixture updates** (all four must land together with the env
change):

- [worker-node/.env.example](../worker-node/.env.example) — change
  `LOG_MAX_SIZE=5m` → `LOG_MAX_SIZE=5`, `LOG_MAX_FILES=5d` → `LOG_MAX_FILES=5`.
- [worker-node/tests/helpers/setup.ts](../worker-node/tests/helpers/setup.ts)
  — change `"1m"` → `"1"`, `"3d"` → `"3"`.
- [worker-node/README.md](../worker-node/README.md) — under
  "Environment", annotate `LOG_MAX_SIZE` as "megabytes (integer)" and
  `LOG_MAX_FILES` as "retention count (integer)".
- Any operator `.env` files outside the repo are the operator's problem,
  but the migration note in the commit body should call this out so
  whoever deploys the worker knows to update them.

**New tests** in `worker-node/tests/`:

- `LOG_MAX_SIZE` and `LOG_MAX_FILES`:
  - missing → defaults `5` / `5`.
  - `"5"` → `5`.
  - `"10m"` → exits with non-zero code; stderr mentions the var name.
  - `"abc"` → same.
  - `"0"` / `"-1"` → same (positive-only).
- `NODE_ENV`:
  - `development`, `testing`, `production` → accepted.
  - `test` → normalized to `testing`.
  - `staging` → exits with non-zero code.
  - missing → exits with non-zero code.

These tests lock down the policy so the next maintainer can't accidentally
loosen it.

#### Phase 2c — Worker logger module rewrite

Rewrite [worker-node/src/config/logger.ts](../worker-node/src/config/logger.ts)
to match the API's shape:

- Move env validation into the logger module (or a `readLoggerEnv`
  helper inside it) so missing/invalid required vars produce stderr +
  `exit(1)` **before** logger construction. `server.ts` calling
  `loadEnv()` is too late — a missing `NAME_APP` would otherwise produce
  an unlogged stack trace.
- Filename: `${NAME_APP}-%DATE%.log`. Remove the hard-coded `"worker"`
  literal so `NAME_APP` actually drives the filename (required for
  future child-process distinction).
- Single `DailyRotateFile` transport per the spec example; remove the
  separate `*-worker-error.log` file. If oncall tooling depends on that
  filename, raise it as a V08 amendment before deleting (see Risks).
- Per-mode transports:
  - development: console only, level `debug`.
  - testing: console + file, level `info`.
  - production: file only, level `info`.
- `maxSize: \`${LOG_MAX_SIZE}m\``, `maxFiles: LOG_MAX_FILES` (numeric).
- `defaultMeta`: switch key from `service` to `app` to match the API
  logger. **Breaking change for any downstream JSON parser keyed on
  `service`** — flag in the commit body.
- Keep `export default logger` for source compatibility with existing
  `import logger from "./config/logger"` callers.

### Phase 3 — Worker `server.ts` cleanup

Unchanged from V01.
[worker-node/src/server.ts](../worker-node/src/server.ts) is already
close to V08. After Phase 2c, env validation happens at logger import,
so `loadEnv()` inside `start()` becomes the *application* env load only.
Keep the `fatal()` helper and the async IIFE wrapping.

### Phase 4 — Scripts decision

The script in question:
[scripts/backfill-meditation-durations.ts](../scripts/backfill-meditation-durations.ts)
(6 `console.*` calls).

Two options. **Importing the API logger is no longer on the menu** —
it would force scripts to satisfy the API's full env (JWT_SECRET,
URL_BASE_WEBSITE, EMAIL_*, …) at import time and couple maintenance
workflows to API internals.

- **Option A — script-local V08 logger module.** Create
  `scripts/lib/logger.ts` that implements the V08 contract directly
  (read `NAME_APP`, `PATH_TO_LOGS`, `NODE_ENV`, `LOG_MAX_SIZE`,
  `LOG_MAX_FILES`; build a Winston logger with the standard transports).
  Add `winston` and `winston-daily-rotate-file` to the **root**
  `package.json` (they're already in `api` and `worker-node` but not at
  the root). Update `tsconfig.scripts.json` if needed. The migration
  table in V08's "Pre-Implementation" section then applies to the script.
- **Option B (recommended) — explicit carve-out.** Add a short
  paragraph to `AGENTS.md` declaring that one-shot scripts under
  `scripts/` are exempt from V08 and may use `console.*`. Rationale:
  these are short-lived ad-hoc tools whose output is read interactively
  from a terminal, not tailed from disk. The spec preamble says V08
  applies to "standard Node.js applications"; a backfill script isn't
  one.

**Recommendation**: Option B, unless an operator articulates a real need
for persisted backfill logs. The cost of A (extra root deps, extra
config surface, more code to maintain) doesn't pay back for a single
6-call script.

Either way, decide **before** any commit touches `scripts/`.

### Phase 5 — Verification

For each of `api/` and `worker-node/`:

1. **Dev mode**: `NODE_ENV=development NAME_APP=… PATH_TO_LOGS=…/tmp/logs npm run dev`
   — logs in console, no file created.
2. **Testing mode**: `NODE_ENV=testing …` — logs in both console and
   `${NAME_APP}-YYYY-MM-DD.log`.
3. **Production mode**: `NODE_ENV=production …` — logs only in the
   dated file, not console.
4. **`NODE_ENV=test` alias** (worker only): boots in testing mode after
   Phase 2a/2b.
5. **`NODE_ENV=staging`** (worker): exits with non-zero code and a
   clear stderr message.
6. **Missing required var**: unset `NAME_APP`, start — stderr prints
   `Missing required env var: NAME_APP`, exit code `1`, no logger output.
7. **Invalid numeric env**: set `LOG_MAX_SIZE=10m` on the worker — exit
   code `1`, stderr names the var and shows the raw value.
8. **Size rollover**: set `LOG_MAX_SIZE=1`, emit > 1 MB; confirm
   `.log.1` sibling appears.
9. **Retention**: set `LOG_MAX_FILES=2`, backdate a few files, restart;
   confirm only the two newest remain.
10. **Typecheck**: per-workspace `npm run typecheck` for `api` and
    `worker-node`, plus root `npm run typecheck:scripts` if Option A
    landed.
11. **Worker unit tests** (new in Phase 2b): `npm run test -w @golightly/worker-node`.

## Risks and open questions

- **Worker error-file removal** (Phase 2c): deletes the dedicated
  `*-worker-error.log`. **Mitigation**: `grep` `docs/`,
  `worker-node/README.md`, and any deployment-side runbooks for that
  filename before deleting; if found, decide between updating the runbook
  or amending V08 to permit a second error-only transport.
- **`defaultMeta` rename** `service` → `app`: changes the JSON shape of
  every worker log line. Worth a one-line confirmation before merging.
- **Hard-fail parsing** (Phase 2b): any operator `.env` file outside this
  repo that still says `LOG_MAX_SIZE=10m` will now refuse to boot. This
  is the intended behavior, but the commit body must be loud about it.
- **`normalizeNodeEnv` extraction location** (Phase 2a): `shared-types`
  is currently a types-only package; adding a runtime helper might widen
  its scope in a way the maintainers don't want. Confirm before doing 2a-i;
  fall back to 2a-ii if there's any hesitation.
- **No child-process wiring exists today**: V08's child-process section
  remains forward-looking. Acknowledge in the plan, implement when the
  first fork lands.

## Implementation order and rollout

Phases are independent enough to land as separate commits:

1. `docs:` — this plan (no code change).
2. `refactor(api):` — Phase 1 audit notes only (probably empty diff;
   skip if nothing changes).
3. `refactor(shared):` — Phase 2a, only if 2a-i is chosen.
4. `refactor(worker-node):` — Phases 2b, 2c, and 3 together. The env
   shape, fixtures, and logger module are coupled and should not ship
   in pieces.
5. `chore(scripts):` *or* `docs(agents):` — Phase 4, depending on the
   A/B decision.

Each commit should be runnable on its own.

## Revision history

- 2026-05-19 — V01 initial draft (claude opus-4.7).
- 2026-05-20 — V02 (claude opus-4.7). Incorporated Codex 5.5 assessment:
  enumerated `LOG_MAX_*` migration call sites and committed to hard-fail
  parsing; promoted worker `NODE_ENV` validation to a named sub-phase
  with a shared `normalizeNodeEnv`; removed the "import API logger from
  scripts" path and recommended an explicit carve-out instead.
