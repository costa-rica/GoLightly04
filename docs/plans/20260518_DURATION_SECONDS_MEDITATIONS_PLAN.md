---
created_at: 2026-05-18
updated_at: 2026-05-18
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Plan: Add Meditation Duration (Seconds in DB, Minutes on Web)

## Goal

Add a `duration_seconds` column to `meditations` so each completed meditation
knows how long its final MP3 is. Populate it from ffprobe metadata at the end of
worker concatenation. Display it on the public meditations table in `M:SS`
format. Backfill existing rows with a one-shot script.

## Revision history

- 2026-05-18 — initial draft (claude opus-4.7).
- 2026-05-18 — revision after Codex 5.5 NEEDS REVISION review. Addressed:
  (1) made root backfill script dependencies explicit, (2) replaced
  `DATABASE_URL` with the repo's `PG_*` variables and boot role,
  (3) tightened dirty `package-lock.json` handling, (4) added
  `tsconfig.scripts.json` and root runtime guidance, plus made admin
  serialization verification explicit and added a re-review checklist.

## Context (gathered before planning)

- Workspaces: `db-models`, `shared-types`, `api`, `worker-node`, `web` (see
  `package.json:1`).
- DB model: [db-models/src/models/Meditation.ts](../../db-models/src/models/Meditation.ts).
  Uses Sequelize with `underscored: true` and explicit `field` overrides for camelCase
  attributes. `db-models/src/index.ts:18` calls `sequelize.sync()` from
  `syncAll` / `provisionDatabase`, so the live DB picks up additive columns on
  next boot, but production needs an explicit, idempotent migration step.
- Shared type: [shared-types/src/meditation.ts:14](../../shared-types/src/meditation.ts).
- API public serializer: `mapMeditationRecord` in
  [api/src/routes/meditations.ts:26](../../api/src/routes/meditations.ts). All
  `/api/meditations/*` responses go through this.
- Admin serializer: [api/src/routes/admin.ts](../../api/src/routes/admin.ts)
  does its own serialization for `/admin/users`, but admin **meditations** are
  returned via raw Sequelize JSON (not through `mapMeditationRecord`). Once the
  model attribute exists, `toJSON()` exposes `durationSeconds` automatically,
  so the admin endpoint picks the field up without code changes — but this is
  load-bearing and must be verified in Phase 5 (see "Admin serialization
  verification").
- Postgres env: this repo uses `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`
  (boot role, used for schema provisioning), `PG_APP_ROLE` (runtime role),
  `PG_SCHEMA`, optional `PG_PASSWORD`. See
  [db-models/src/config/env.ts:1](../../db-models/src/config/env.ts) and
  [db-models/src/config/sequelize.ts:8](../../db-models/src/config/sequelize.ts).
  **There is no `DATABASE_URL` in this project.** Schema changes use the boot
  role (`PG_USER`); runtime queries use `PG_APP_ROLE`.
- Existing psql invocation pattern (see
  [docs/db-models/SETUP_UBUNTU.md:161](../../docs/db-models/SETUP_UBUNTU.md)):
  ```
  psql -h 127.0.0.1 -U golightly04_boot -d golightly04_prod -c "..."
  ```
  The Ubuntu setup forces `-h 127.0.0.1` to bypass peer auth; trust auth means
  `PG_PASSWORD` is typically blank.
- Worker concat flow:
  [worker-node/src/services/concatenator.ts](../../worker-node/src/services/concatenator.ts).
  After `concatFiles(...)` writes the destination MP3 and before
  `meditation.update({ status: "complete", filename, filePath })`, the worker
  has the final MP3 on disk and can probe it.
- ffmpeg already wired via `@ffmpeg-installer/ffmpeg` + `fluent-ffmpeg`.
  `fluent-ffmpeg.ffprobe(path, cb)` is available but needs an ffprobe binary
  on PATH. The `@ffmpeg-installer/ffmpeg` package does NOT ship ffprobe.
  Host has `/usr/bin/ffprobe`, but production may not — we add
  `@ffprobe-installer/ffprobe` rather than relying on host PATH (see Phase 4).
- Regenerate flow:
  [api/src/services/meditations/regenerateMeditationFromScript.ts](../../api/src/services/meditations/regenerateMeditationFromScript.ts)
  already nulls `filename` and `filePath` and re-enqueues. We must also null
  `duration_seconds` there so a stale duration never shows next to a freshly
  enqueued meditation.
- Web table:
  [web/src/components/tables/TableMeditation.tsx](../../web/src/components/tables/TableMeditation.tsx).
  Existing columns: Title, Play, Favorite (auth only), Listens.
- Admin table:
  [web/src/components/tables/TableAdminMeditations.tsx](../../web/src/components/tables/TableAdminMeditations.tsx).
  Pure column config — adding a column is one line.
- Web has a helper `formatDuration(seconds)` in
  [web/src/lib/utils/formatters.ts:30](../../web/src/lib/utils/formatters.ts)
  that already returns `M:SS`. We will reuse it and add a null-safe wrapper.
- No migration framework. `db-models/scripts/smoke.ts` is the only existing
  ops script. There is no root `scripts/` directory yet.
- No root `tsconfig.json` exists; only `tsconfig.base.json` plus per-workspace
  `tsconfig.json`. The root has no devDependencies block. `ts-node` resolves
  today only as a transitive dep of `ts-node-dev` (declared in
  `worker-node` and `api`); relying on this at the repo root is fragile.

### Working-tree state (must preserve and reconcile)

`package-lock.json` and `worker-node/src/app.ts` already have uncommitted
edits unrelated to this task.

The current `package-lock.json` diff is **not a trivial single hunk** — it
removes `"peer": true` markers across many packages. "Confirm only new
ffprobe hunks" is therefore not sufficient on its own. Phase 0 captures a
baseline diff before any `npm install`, and Phases 4 and 7 reconcile the
post-install diff against that baseline so only intentional new hunks are
staged.

The implementer MUST stage explicit files only — no `git add -A`, no
`git add .`. Each phase below lists the files to stage.

## Recommendations summary

1. **DB column** — `duration_seconds INTEGER NULL`. Nullable because legacy
   rows have no duration, and even after backfill some old files may be
   missing on disk.
2. **TS shape** — `durationSeconds: number | null` everywhere. Whole
   integer seconds; round at the worker before writing.
3. **Worker behavior when ffprobe fails** — leave `durationSeconds` null,
   still mark `status="complete"`. Rationale: the audio file exists and is
   playable; lack of duration metadata should not block a user from
   listening. Log a `warn` so we can spot probing regressions. The backfill
   script can fill it in later.
4. **Web display** — `M:SS` via existing `formatDuration`. Render `—` for
   null. Rationale: minutes-only loses too much resolution (a 30-second and
   a 90-second meditation both round to "1 min"), and the existing helper
   already does the work. Header column label: "Length".
5. **Root `scripts/` directory** — **Yes, create it.** Justification:
   `db-models/scripts/` is package-local (build/smoke against db-models
   only). This backfill needs `db-models` + `worker-node` (for ffprobe) +
   `shared-types` together. A root `scripts/` makes the cross-package intent
   explicit, mirrors common monorepo conventions, and gives us a home for
   future one-shot ops scripts without forcing them into a workspace they
   don't naturally belong to. First entry: `scripts/backfill-meditation-durations.ts`.
6. **Root-owned runtime/dev dependencies for `scripts/`** — declare
   explicitly in the **root** `package.json` rather than relying on
   workspace/transitive resolution:
   - `devDependencies`: `ts-node`, `typescript`, `@types/node`.
   - `dependencies` (root-owned at root, because the script imports them
     directly): `dotenv`, `fluent-ffmpeg`, `@ffprobe-installer/ffprobe`,
     plus the workspace packages it needs via `"@golightly/db-models": "*"`
     and `"@golightly/shared-types": "*"` (workspace-protocol references).
   Rationale: a deploy-time ops script must not depend on accidental hoisting
   from `worker-node`. Anyone running `npm install --omit=dev` in production
   could lose the runtime path.
7. **Root `tsconfig.scripts.json`** — create a dedicated tsconfig for the
   root `scripts/` directory so `ts-node` has explicit, reviewable settings
   instead of falling back to defaults. Invoke ts-node with
   `TS_NODE_PROJECT=tsconfig.scripts.json`.
8. **ffprobe binary sourcing** — add `@ffprobe-installer/ffprobe` to
   `worker-node` (Phase 4 uses it from `concatenator.ts`) **and** to the
   root (Phase 7 uses it from the backfill script). Both declarations are
   intentional; npm dedupes the install. Avoids host-PATH coupling.

## Implementation phases

### Phase 0 — Pre-flight (no code changes)

1. From repo root, capture the current dirty state as the baseline. Without
   this, you cannot tell intentional dependency hunks from the existing
   unrelated lockfile churn:
   ```
   git status
   git diff --stat
   git diff package-lock.json > /tmp/lockfile-baseline.diff
   git diff worker-node/src/app.ts > /tmp/app-ts-baseline.diff
   ```
   Expect `git status` to show only `package-lock.json` and
   `worker-node/src/app.ts` modified. Stop and ask if anything else is dirty.
2. Inspect `/tmp/lockfile-baseline.diff` once to understand what the
   existing churn looks like (current state: bulk removal of
   `"peer": true` markers — not a single hunk).
3. **Decide how to handle the dirty lockfile before doing dependency work.**
   Pick one of:
   - **(Preferred) Commit or revert the unrelated lockfile churn first**,
     so `package-lock.json` is clean at the start of dependency work and
     every later diff is unambiguously this task's. Surface this choice to
     the human before proceeding — do not silently revert their work.
   - **Isolate the diff via `git stash --keep-index` of just
     `package-lock.json`**, do this task's dependency work, then unstash
     and reconcile manually.
   - **Last resort: keep churn in place and use the baseline diff.** After
     every `npm install`, run
     `diff <(git diff package-lock.json) /tmp/lockfile-baseline.diff` and
     ensure the only *new* hunks are the intended ones. This is fragile —
     do not pick it without acknowledging the risk.
4. Skim this plan top-to-bottom and confirm files to touch.

### Phase 1 — DB model (`db-models`)

**Files to inspect**
- `db-models/src/models/Meditation.ts`

**Changes**
- Add to the `Meditation` class:
  ```
  declare durationSeconds: CreationOptional<number | null>;
  ```
  alongside the other `declare` lines (after `listenCount`).
- Add to `Meditation.init({...})` after `listenCount`:
  ```
  durationSeconds: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: "duration_seconds",
  },
  ```

**Build / typecheck**
```
npm run typecheck -w @golightly/db-models
npm run build    -w @golightly/db-models
```

**Stage**
- `db-models/src/models/Meditation.ts`

### Phase 2 — Shared type (`shared-types`)

**Files to inspect**
- `shared-types/src/meditation.ts`

**Changes**
- In the `Meditation` type, add:
  ```
  durationSeconds?: number | null;
  ```
  next to `listenCount`. Keep optional so existing JSON consumers that
  don't yet receive the field don't break.

**Build / typecheck**
```
npm run typecheck -w @golightly/shared-types
npm run build    -w @golightly/shared-types
```

**Stage**
- `shared-types/src/meditation.ts`

### Phase 3 — DB migration (explicit, idempotent)

`sequelize.sync()` is good enough for dev, but the production DB needs an
explicit, reviewable migration. There is no migrations framework; we
introduce a thin SQL convention. Apply with the **boot role** (`PG_USER`),
because `PG_APP_ROLE` does not have `ALTER TABLE` privileges in this repo's
provisioning model.

**Create**
- `db-models/migrations/` directory (new).
- `db-models/migrations/20260518_add_duration_seconds.sql`:
  ```sql
  ALTER TABLE meditations
    ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NULL;
  ```
  Use `IF NOT EXISTS` so re-runs are safe and so `sequelize.sync()` in dev
  doesn't conflict.

**Update**
- `db-models/README.md` — add a short "Migrations" section pointing at the
  new folder and showing the apply pattern this repo actually uses (PG_*
  vars, boot role, explicit host). Example block to include verbatim:
  ```bash
  # Schema changes must run as PG_USER (boot role).
  # PG_PASSWORD is typically unset because this repo uses trust auth.
  PGPASSWORD="${PG_PASSWORD:-}" \
  psql \
    -h "$PG_HOST" \
    -p "$PG_PORT" \
    -U "$PG_USER" \
    -d "$PG_DATABASE" \
    -v ON_ERROR_STOP=1 \
    -f db-models/migrations/20260518_add_duration_seconds.sql
  ```
  Notes for the README copy:
  - `-v ON_ERROR_STOP=1` makes a partial failure exit non-zero.
  - If `PG_SCHEMA` is anything other than `public`, prepend
    `--set=schema="$PG_SCHEMA"` and reference the schema in the SQL file
    (the SQL above is schema-implicit; adjust if your deploy uses a
    non-default schema).
  - Do not use `DATABASE_URL`; this project does not define it.

**Verify locally** (run from repo root with the env loaded the same way the
API/worker load it, or by sourcing `worker-node/.env`):
```bash
PGPASSWORD="${PG_PASSWORD:-}" \
psql \
  -h "$PG_HOST" \
  -p "$PG_PORT" \
  -U "$PG_USER" \
  -d "$PG_DATABASE" \
  -c "\d+ meditations"
```
Confirm `duration_seconds | integer | nullable`. Then sanity-check that
the `app` role can read it:
```bash
PGPASSWORD="${PG_PASSWORD:-}" \
psql \
  -h "$PG_HOST" \
  -p "$PG_PORT" \
  -U "$PG_APP_ROLE" \
  -d "$PG_DATABASE" \
  -c "SELECT id, duration_seconds FROM meditations LIMIT 1;"
```

**Stage**
- `db-models/migrations/20260518_add_duration_seconds.sql`
- `db-models/README.md`

### Phase 4 — Worker: probe duration after concat (`worker-node`)

**Files to inspect**
- `worker-node/package.json`
- `worker-node/src/services/concatenator.ts`
- `worker-node/src/types/fluent-ffmpeg.d.ts`

**Changes**
1. Add `@ffprobe-installer/ffprobe` to `worker-node/package.json`
   `dependencies`. Run `npm install` from repo root so the lockfile is
   regenerated correctly across workspaces.
2. In `concatenator.ts`, after the existing
   `ffmpeg.setFfmpegPath(ffmpegInstaller.path);` line, add:
   ```
   import ffprobeInstaller from "@ffprobe-installer/ffprobe";
   ffmpeg.setFfprobePath(ffprobeInstaller.path);
   ```
3. Add a helper at module scope:
   ```
   function probeDurationSeconds(filePath: string): Promise<number | null> {
     return new Promise((resolve) => {
       ffmpeg.ffprobe(filePath, (err, data) => {
         if (err) return resolve(null);
         const raw = data?.format?.duration;
         const num = typeof raw === "number" ? raw : Number(raw);
         if (!Number.isFinite(num) || num <= 0) return resolve(null);
         resolve(Math.round(num));
       });
     });
   }
   ```
4. In `concatenateMeditation`, between `await concatFiles(...)` and the
   `meditation.update({...})` call, insert:
   ```
   const durationSeconds = await probeDurationSeconds(destination);
   if (durationSeconds === null) {
     logger.warn(`ffprobe failed for meditation ${meditationId} at ${destination}; storing null duration`);
   }
   ```
   Then include `durationSeconds` in the update payload:
   ```
   await meditation.update({
     status: "complete",
     filename,
     filePath: destination,
     durationSeconds,
   });
   ```
5. Update the ambient declaration
   `worker-node/src/types/fluent-ffmpeg.d.ts` if TypeScript complains about
   missing `ffprobe` / `setFfprobePath` overloads. Existing content is just
   `declare module "fluent-ffmpeg";` so it should accept anything — verify
   typecheck passes; only widen if needed.
6. Confirm the same module also doesn't conflict with the already-modified
   `worker-node/src/app.ts` (do NOT touch `app.ts` as part of this work).

**Decision recorded: ffprobe failure ⇒ leave null, do not fail meditation.**
Justification: the playable MP3 already exists. Marking the meditation
`failed` purely because we couldn't read its length would be a regression
on the listening experience. The null surfaces as `—` on the UI; the
backfill script can re-attempt.

**Typecheck / test**
```
npm run typecheck -w @golightly/worker-node
npm test          -w @golightly/worker-node
```

The existing worker tests mock `concatenateMeditation` wholesale
(`worker-node/tests/services/processMeditation.test.ts:35`), so they
should continue to pass. If you add a focused unit test for
`probeDurationSeconds`, keep it close to the existing test style — mock
`fluent-ffmpeg` rather than calling real ffprobe.

**Lockfile reconciliation (mandatory, dirty-lockfile-aware)**

After `npm install`, do this — **do not skip**:
```
git diff package-lock.json > /tmp/lockfile-after-phase4.diff
diff /tmp/lockfile-baseline.diff /tmp/lockfile-after-phase4.diff
```
Confirm the only *new* hunks (present in `after`, absent in baseline) are
for `@ffprobe-installer/*` packages. If any other unexpected hunks appear,
stop and reconcile before staging. If you chose the Phase 0 "commit/revert
baseline first" path, the baseline diff is empty and the post-install diff
should be exactly the ffprobe hunks.

**Stage**
- `worker-node/package.json`
- `worker-node/src/services/concatenator.ts`
- `worker-node/src/types/fluent-ffmpeg.d.ts` (only if changed)
- `package-lock.json` — stage only after the diff above is verified clean
  against the baseline.

### Phase 5 — API: serialize the new field (`api`)

**Files to inspect**
- `api/src/routes/meditations.ts` (`mapMeditationRecord` at line 26)
- `api/src/routes/admin.ts` (admin meditations endpoint — confirm it relies on raw model JSON)
- `api/src/services/meditations/regenerateMeditationFromScript.ts`

**Changes**
1. In `mapMeditationRecord`, add:
   ```
   durationSeconds: meditation.durationSeconds ?? null,
   ```
   next to `listenCount`. This propagates the new field to every
   public endpoint that returns a meditation (list, single, update,
   regenerate).
2. In `regenerateMeditationFromScript.ts`, inside the
   `lockedMeditation.update({...})` call, add `durationSeconds: null,`
   to the update payload. Reason: regenerate produces a fresh MP3, so
   the old duration is stale until the worker re-probes.
3. **Do not** add an admin-specific serializer. The admin meditations
   endpoint serializes via raw Sequelize `toJSON()`, so once the model
   attribute from Phase 1 exists, `durationSeconds` appears in admin
   responses automatically. Verify rather than re-implement (see below).

**Admin serialization verification (explicit — not optional)**

Because `admin.ts` does not route through `mapMeditationRecord`, we must
confirm the admin path actually returns the new field. Verify all three:

1. Read `api/src/routes/admin.ts` and confirm the meditations response
   uses `meditation.toJSON()` (or equivalent raw model serialization) and
   does NOT explicitly pick fields. If it explicitly picks fields, this
   plan is wrong about admin and the admin path needs an edit.
2. After Phase 1+3 are deployed locally, hit the admin meditations
   endpoint with an admin JWT and confirm `durationSeconds` appears in
   the JSON payload (either as a number or null) for at least one row.
   Sample request to mirror in the test plan:
   ```bash
   AUTH_HEADER='Authorization: <admin JWT bearer token>'
   curl -s -H "$AUTH_HEADER" \
     http://localhost:3000/admin/meditations | jq '.meditations[0] | keys'
   curl -s -H "$AUTH_HEADER" \
     http://localhost:3000/admin/meditations | jq '.meditations[0].durationSeconds'
   ```
3. Confirm in the admin web UI (Phase 6) that the new column renders
   with values (not all `—`) once Phase 4 has produced at least one
   freshly probed row.

**Typecheck / test**
```
npm run typecheck -w @golightly/api
npm test          -w @golightly/api
```

**Stage**
- `api/src/routes/meditations.ts`
- `api/src/services/meditations/regenerateMeditationFromScript.ts`
- (No staged change for `api/src/routes/admin.ts` unless verification
  finds an explicit field pick, in which case stop and revise the plan.)

### Phase 6 — Web: display duration (`web`)

**Files to inspect**
- `web/src/lib/utils/formatters.ts`
- `web/src/components/tables/TableMeditation.tsx`
- `web/src/components/tables/TableAdminMeditations.tsx`

**Changes**
1. Add a null-safe wrapper to `formatters.ts`:
   ```
   export const formatDurationOrDash = (seconds: number | null | undefined): string => {
     if (seconds === null || seconds === undefined) return "—";
     return formatDuration(seconds);
   };
   ```
   Keeps the existing `formatDuration` signature intact for any other
   callers.
2. In `TableMeditation.tsx`:
   - Desktop table: add a new `<th>` titled `Length` between `Play` and
     `Favorite` (or before `Listens` — pick whichever reads better; the
     audio-pattern norm is `Title | Play | Length | … | Listens`).
   - Desktop body: add a `<td>` rendering
     `formatDurationOrDash(meditation.durationSeconds)`.
   - Mobile card: add length next to the listen count, e.g.
     `<span>{formatDurationOrDash(meditation.durationSeconds)}</span>`,
     visually separated by a middot.
   - Update the empty-state `colSpan` to reflect the new column count.
3. In `TableAdminMeditations.tsx`, add a column entry:
   ```
   {
     accessorKey: "durationSeconds",
     header: "Length",
     cell: ({ row }) => formatDurationOrDash(row.original.durationSeconds),
   },
   ```
   placed between `listenCount` and `createdAt`.

**Manual verification (mandatory — typecheck does not test UI)**
```
npm run dev -w web
```
- Confirm Length column renders on `/meditations`.
- Confirm `—` shows for legacy null rows.
- Confirm complete meditations created after Phase 4 show `M:SS`.
- Confirm in-flight (pending/processing) rows still render the
  "Your meditation will be ready shortly…" treatment (the new column
  should show `—` there since duration is null until concat finishes).
- Confirm mobile breakpoint renders without overlap.
- Confirm the admin meditations table renders the Length column with
  real values, validating Phase 5's admin serialization assumption.

**Typecheck**
```
npm run typecheck -w web
```

**Stage**
- `web/src/lib/utils/formatters.ts`
- `web/src/components/tables/TableMeditation.tsx`
- `web/src/components/tables/TableAdminMeditations.tsx`

### Phase 7 — Backfill script (`scripts/` root, new)

This phase is the largest behavioral change to the plan from the Codex
review. Root-owned dependencies and tsconfig are declared explicitly so
the script is a reliable, reviewable ops command — not something that
"works on this machine today" by accidental hoisting.

#### 7a. Root tsconfig and dependency declarations

**Create** — `tsconfig.scripts.json` at the repo root:
```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["scripts/**/*.ts"]
}
```
Rationale: matches the workspace tsconfigs (CommonJS via `tsconfig.base.json`),
scopes typechecking to `scripts/` only, and gives `ts-node` an explicit
project so it does not fall back to undocumented defaults.

**Edit** — root `package.json`. Add a `devDependencies` block (none exists
today) and a `dependencies` block, plus the new script entry. The root is
private and already declares `workspaces`, so workspace-protocol references
resolve to local packages.

Resulting structure (only the relevant parts shown):
```json
{
  "name": "golightly04",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["db-models", "shared-types", "api", "worker-node", "web"],
  "scripts": {
    "build:shared": "...existing...",
    "typecheck:shared": "...existing...",
    "typecheck:scripts": "tsc -p tsconfig.scripts.json --noEmit",
    "backfill:durations": "TS_NODE_PROJECT=tsconfig.scripts.json ts-node --transpile-only scripts/backfill-meditation-durations.ts"
  },
  "dependencies": {
    "@ffprobe-installer/ffprobe": "^2.1.2",
    "@golightly/db-models": "*",
    "@golightly/shared-types": "*",
    "dotenv": "^17.4.2",
    "fluent-ffmpeg": "^2.1.3"
  },
  "devDependencies": {
    "@types/fluent-ffmpeg": "^2.1.27",
    "@types/node": "^24.12.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.9.3"
  },
  "overrides": {
    "postcss": "^8.5.10"
  }
}
```
Notes:
- Pin versions to match what `worker-node` already resolves to (check
  `worker-node/package.json` and the installed `node_modules` tree for the
  exact versions and align — the values above are illustrative).
- Workspace-protocol via `"*"` is the npm-workspaces convention; do not
  use `file:` or relative paths.
- `ts-node` is declared explicitly at the root rather than relying on
  the transitive copy under `ts-node-dev` in `worker-node`.
- `@types/fluent-ffmpeg` is added because the script imports the typed
  surface directly from the root (the worker uses an ambient `.d.ts`
  shim that does not extend across packages).

**Install and reconcile lockfile** (mandatory after editing root
`package.json`):
```
npm install
git diff package-lock.json > /tmp/lockfile-after-phase7.diff
diff /tmp/lockfile-after-phase4.diff /tmp/lockfile-after-phase7.diff
```
Confirm the only *new* hunks (vs the Phase 4 state) are for the root's
new dependencies (`ts-node`, `dotenv`, `fluent-ffmpeg`,
`@ffprobe-installer/ffprobe`, `@types/*`). If any other unexpected hunks
appear, stop and reconcile before staging.

**Typecheck the scripts project before writing the script body**:
```
npm run typecheck:scripts
```
At this point the script file does not exist yet, so `tsc` will succeed
on an empty include. After 7b/7c are in place, re-run.

#### 7b. Create root directory and script

- `scripts/` (new top-level directory).
- `scripts/README.md` — one-paragraph explanation of what `scripts/` is for
  (cross-package ops one-shots), the runtime expectations (Node + env
  loaded from `worker-node/.env` or process env), and how to add a new
  script. Explicitly note: the root owns the runtime — `ts-node`,
  `dotenv`, `fluent-ffmpeg`, and `@ffprobe-installer/ffprobe` are declared
  at the root, not inherited from a workspace.
- `scripts/backfill-meditation-durations.ts`.

#### 7c. Script behavior

The script:
1. Loads `dotenv` from the repo root. Mirror the convention used by
   `worker-node` / `api` (`require("dotenv").config()` early). If no
   root `.env` exists, the script must rely on the ambient process env;
   document this in `scripts/README.md`.
2. Imports `@golightly/db-models` to get `Meditation`, `createSequelize`,
   and `initializeModels`. Create an app-role Sequelize instance with
   `createSequelize({ role: "app" })`, then immediately call
   `initializeModels(sequelize)` before querying/updating `Meditation`.
   Do **not** call `syncAll()` or `provisionDatabase()` from the backfill
   script; schema changes already happened in Phase 3 under the boot role,
   and the app role should not run DDL.
3. Imports `fluent-ffmpeg` and `@ffprobe-installer/ffprobe` and wires the
   path the same way Phase 4 does.
4. Parses CLI args (no library needed — `process.argv` is fine):
   - `--apply` (default false): write to DB. Without it, do a dry run.
   - `--force` (default false): re-probe and overwrite rows that already
     have a non-null `durationSeconds`.
   - `--limit N` (optional): cap the number of rows processed (smoke test).
5. Selects candidates:
   - Default: `status = 'complete' AND duration_seconds IS NULL AND file_path IS NOT NULL`.
   - With `--force`: drop the `IS NULL` predicate.
6. For each row:
   - Check file exists on disk via `fs.promises.stat(filePath)`. If not,
     log `warn` and skip.
   - Run `probeDurationSeconds(filePath)`. On failure, log `warn` and
     skip.
   - In dry-run mode: print `meditation <id>: would set <N> seconds (was <prev>)`.
   - In apply mode: `await meditation.update({ durationSeconds })`.
7. At the end print a summary: `{ scanned, updated, skippedMissingFile,
   skippedProbeFailed, skippedAlreadySet }`.

**Safety rules baked in**
- **Dry-run by default.** Apply requires `--apply`.
- **Never overwrites non-null** unless `--force` is passed.
- **Single-threaded, sequential** — avoids saturating ffprobe / DB.
- **Read-only on filesystem** — only updates the DB column, never
  re-reads or re-writes audio.

**Test plan**

After migration applied (Phase 3) and at least one new meditation
generated through the worker (Phase 4 verified):

1. Typecheck:
   ```
   npm run typecheck:scripts
   ```
2. Dry run:
   ```
   npm run backfill:durations
   ```
   Expect: lists candidate rows, makes no DB writes.
3. Limited apply on dev:
   ```
   npm run backfill:durations -- --apply --limit 1
   ```
   Verify with:
   ```bash
   PGPASSWORD="${PG_PASSWORD:-}" \
   psql \
     -h "$PG_HOST" \
     -p "$PG_PORT" \
     -U "$PG_APP_ROLE" \
     -d "$PG_DATABASE" \
     -c "SELECT id, duration_seconds FROM meditations ORDER BY id DESC LIMIT 5;"
   ```
4. Full apply on dev:
   ```
   npm run backfill:durations -- --apply
   ```
   Confirm summary counts match expectations.
5. Force re-run (sanity check that `--force` does what it says):
   ```
   npm run backfill:durations -- --apply --force --limit 1
   ```

**Stage**
- `tsconfig.scripts.json` (new at root)
- `scripts/README.md`
- `scripts/backfill-meditation-durations.ts`
- `package.json` (root — `scripts`, `dependencies`, `devDependencies`
  edits only; do not touch the existing `workspaces` or `overrides`
  blocks)
- `package-lock.json` — stage only after the Phase 7 diff is verified
  clean against the Phase 4 baseline.

### Phase 8 — Deployment / verification

1. **Apply migration in each environment, as `PG_USER` (boot role), before
   deploying code:**
   ```bash
   PGPASSWORD="${PG_PASSWORD:-}" \
   psql \
     -h "$PG_HOST" \
     -p "$PG_PORT" \
     -U "$PG_USER" \
     -d "$PG_DATABASE" \
     -v ON_ERROR_STOP=1 \
     -f db-models/migrations/20260518_add_duration_seconds.sql
   ```
   Then verify with the boot role:
   ```bash
   PGPASSWORD="${PG_PASSWORD:-}" \
   psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" \
     -c "\d+ meditations"
   ```
   And that the app role can read it:
   ```bash
   PGPASSWORD="${PG_PASSWORD:-}" \
   psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_APP_ROLE" -d "$PG_DATABASE" \
     -c "SELECT COUNT(*) FROM meditations WHERE duration_seconds IS NULL;"
   ```
2. Deploy `api`, `worker-node`, and `web` together. Order does not matter
   strictly (column is additive, field is optional in `shared-types`), but
   deploying worker first ensures the first newly-completed meditations
   get duration set.
3. Generate one fresh meditation end-to-end. Confirm `duration_seconds`
   is non-null in DB and `M:SS` shows on the web table. Also confirm the
   admin meditations endpoint returns `durationSeconds` in JSON (Phase 5
   admin verification).
4. Run the backfill in dry-run mode on prod:
   ```
   npm run backfill:durations
   ```
   Review counts.
5. Run the backfill in apply mode on prod:
   ```
   npm run backfill:durations -- --apply
   ```
6. Spot-check a handful of rows on the web table and on the admin
   meditations table.

## Concern checklist

- [x] **Migration safety** — `ADD COLUMN IF NOT EXISTS … INTEGER NULL` is
      additive, no default rewrite, no lock escalation on a small table.
      Safe to run online.
- [x] **Migration role** — applied as `PG_USER` (boot role); `PG_APP_ROLE`
      lacks DDL privileges in this repo's provisioning model.
- [x] **Existing rows** — remain null until backfill. UI renders `—`.
- [x] **Regenerate path** — `regenerateMeditationFromScript` nulls
      `duration_seconds` so the column is honest about which MP3 it
      describes. Worker repopulates on the next concat.
- [x] **Missing files** — backfill stats the file before probing and
      skips with a warn. Worker can't hit this path because it just wrote
      the file moments earlier.
- [x] **ffprobe failure** — worker logs warn, leaves null, still marks
      complete. Backfill skips with warn.
- [x] **Public API serialization** — single `mapMeditationRecord` covers all
      `/api/meditations/*` endpoints.
- [x] **Admin API serialization** — admin meditations endpoint uses raw
      Sequelize JSON, so the new model attribute surfaces automatically;
      Phase 5 verifies this with a curl + jq + UI check rather than
      assuming it.
- [x] **CORS / public API surface** — adding an optional response field is
      backward compatible; older clients ignore unknown keys.
- [x] **Working-tree hygiene** — `package-lock.json` and
      `worker-node/src/app.ts` are pre-existing dirty files. Phase 0
      captures a baseline diff; Phases 4 and 7 reconcile against it.
      Stage explicitly named files only.
- [x] **Lockfile diff discipline** — baseline captured in Phase 0,
      compared after each `npm install` against the previous baseline,
      only intentional new hunks staged.
- [x] **Root-owned ops deps** — `ts-node`, `dotenv`, `fluent-ffmpeg`,
      `@ffprobe-installer/ffprobe`, `@golightly/db-models`,
      `@golightly/shared-types` declared at the root for the backfill
      script; not inherited from a workspace.
- [x] **Root tsconfig** — `tsconfig.scripts.json` created and invoked via
      `TS_NODE_PROJECT=tsconfig.scripts.json`; `ts-node` does not fall
      back to undocumented defaults.
- [x] **Postgres connection variables** — every `psql` invocation uses
      `PG_HOST` / `PG_PORT` / `PG_DATABASE` / `PG_USER` (or
      `PG_APP_ROLE` for read-only verifies) / `PGPASSWORD`. No
      `DATABASE_URL`.
- [x] **Test mocks** — existing worker tests mock `concatenateMeditation`,
      so adding ffprobe to that function does not break them.

## Codex 5.5 re-review checklist

This plan was revised after a Codex 5.5 NEEDS REVISION review. Re-reviewers
should confirm each of the original blockers and the additional asks is
resolved:

1. **Root backfill script deps are explicit at the root.** Confirm Phase 7a
   declares `ts-node`, `typescript`, `@types/node`, `@types/fluent-ffmpeg`
   in root `devDependencies` and `dotenv`, `fluent-ffmpeg`,
   `@ffprobe-installer/ffprobe`, `@golightly/db-models`,
   `@golightly/shared-types` in root `dependencies`. Confirm no remaining
   reliance on transitive `ts-node` from `ts-node-dev` under
   `worker-node`.
2. **Migration / verify / backfill commands use `PG_*` and the correct
   role.** Confirm every `psql` invocation in Phases 3, 7, and 8 uses
   `-h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER"` (or `PG_APP_ROLE` for
   read-only verifies) `-d "$PG_DATABASE"` with `PGPASSWORD` shimmed from
   env. Confirm schema changes use `PG_USER` (boot role) and runtime
   verifies/backfill use `PG_APP_ROLE`. Confirm no `DATABASE_URL`
   references remain.
3. **Dirty lockfile strategy is concrete and enforced.** Confirm Phase 0
   captures `/tmp/lockfile-baseline.diff`, surfaces a choice to the human
   (commit/revert vs. stash vs. baseline-diff), and that Phases 4 and 7
   require comparing post-install diffs against the prior baseline before
   staging.
4. **Root tsconfig for scripts is created and used.** Confirm Phase 7a
   creates `tsconfig.scripts.json` extending `tsconfig.base.json`, and the
   `backfill:durations` npm script invokes `ts-node` with
   `TS_NODE_PROJECT=tsconfig.scripts.json`. Confirm a `typecheck:scripts`
   entry exists.
5. **Admin serialization is explicitly verified, not assumed.** Confirm
   Phase 5 includes both a code-read check of `api/src/routes/admin.ts`
   and a runtime curl + jq check that `durationSeconds` is present in the
   admin payload, plus a UI confirmation in Phase 6.
6. **Frontmatter is valid.** Confirm `created_at`/`created_by` are
   unchanged, `updated_at` is today's date, and `modified_by` is
   `claude (opus-4.7)`.

If any of the six items is not satisfied, return NEEDS REVISION with the
specific item(s) called out.
