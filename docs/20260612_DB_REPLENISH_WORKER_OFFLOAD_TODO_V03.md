---
created_at: 2026-06-12
updated_at: 2026-06-12
created_by: claude (sonnet)
modified_by: codex (gpt-5.5)
---

# TODO: Database Replenish Worker Offload + `db_` Directory Convention (V03)

> Checklist-style implementation plan derived from
> `docs/20260612_DB_REPLENISH_WORKER_OFFLOAD_PLAN_V02.md` (accepted),
> `docs/20260612_DB_REPLENISH_WORKER_OFFLOAD_PRD.md`, and
> `docs/20260612_DB_REPLENISH_WORKER_OFFLOAD_PLAN_V01_ASSESSMENT_CODEX.md`.
>
> **V02 revises V01 to address all five concerns in**
> `docs/20260612_DB_REPLENISH_WORKER_OFFLOAD_TODO_V01_ASSESSMENT_CODEX.md`:
> (1) safe/idempotent deploy ordering for `db_` cut-over,
> (2) worker `unzipper` dependency package/lockfile handling and commit scope,
> (3) `tempDir` cleanup on worker failure while staged zip is retained only on failure,
> (4) Jest mock updates for new imports in route tests,
> (5) docs frontmatter rules in Phase 8.
>
> **V03 revises V02 to address the one remaining concern in**
> `docs/20260612_DB_REPLENISH_WORKER_OFFLOAD_TODO_V02_ASSESSMENT_CODEX.md`:
> (6) API propagation of worker `/process` 409 during replenish — `notifyWorker` must surface
> `WorkerConflictError` on 409 and every call site must await/propagate or reliably persist
> retry state; no fire-and-forget loss of meditation work during the maintenance window.
>
> Do not implement code without reviewing the V02 plan first.

---

## Phase 0 — Pre-flight Verification

Tasks in this phase carry no code changes. Complete them before writing a single line of implementation.

- [x] Read `docs/20260612_DB_REPLENISH_WORKER_OFFLOAD_PLAN_V02.md` in full.
- [x] **Codex concern #2 — `unzipper` dependency:** Check whether `unzipper` is listed in `worker-node/package.json` dependencies.
  - If absent: run the workspace add command to add it to `worker-node` (e.g. `npm install unzipper --workspace=worker-node` or equivalent for the repo's package manager). Stage `worker-node/package.json` and the root `package-lock.json` (or `yarn.lock` / `pnpm-lock.yaml`). This is a build-blocker and must be resolved before Phase 2 begins; the package/lockfile changes are committed at the end of Phase 2 together with the source changes.
  - If already present: note "unzipper already present" and proceed.
- [x] Grep `api/src/` for all imports of `safeExtractZip` — confirm only `database.ts` imports it.
- [x] Grep `api/src/` for all imports of `safeRestoreResources` — confirm only `database.ts` imports it.
- [x] Grep `api/src/` for all imports of `parseCsv` from `lib/csv` — confirm only `database.ts` imports it. If other consumers exist, plan to duplicate rather than move.
- [x] Confirm the project's Node.js version is ≥ 14.17 (required for `crypto.randomUUID`).
- [x] Note the current line numbers for `EXCLUDED_BACKUP_DIRS` (plan references line 22) and manifest `excluded_dirs` (plan references line 133) in `worker-node/src/services/backupService.ts` — verify they match before editing.
- [x] Note the current line numbers for the `mkdirSync` loop in `api/src/startup/onStartUp.ts` (plan references lines 16–23) — verify before editing.
- [x] Note the current line range for the synchronous replenish handler in `api/src/routes/database.ts` (plan references lines 221–320) — verify before replacing.
- [x] Note the location of the `walk` skip condition in `api/src/routes/database.ts` `getBackupSizeEstimate` (plan references line 119) — verify before editing.
- [x] **V03 concern #6 — notifyWorker call site audit:** Run `rg "notifyWorker\(" api/src` and record every file and line. The known call sites are:
  - `api/src/services/meditations/createOrRegenerateStagedMeditation.ts`
  - `api/src/routes/admin.ts`
  - `api/src/routes/meditations.ts`
  - `api/src/services/meditations/createScriptMeditation.ts` (include if present in output)
  - Any additional call sites found by the grep must also be listed and addressed in Phase 4H.
  - Audit result: `api/src/services/meditations/createOrRegenerateStagedMeditation.ts:170`; `api/src/routes/admin.ts:407`; `api/src/routes/meditations.ts:130,156,257,533`; no `createScriptMeditation.ts` call site present in the grep output.
  - Dependency note: `unzipper` was absent from `worker-node/package.json`. `npm install unzipper --workspace=worker-node` was attempted, but registry DNS failed with `EAI_AGAIN`; because `unzipper` is already resolved in the root lockfile for the API workspace, the worker dependency declaration and worker package-lock workspace metadata will be updated manually in Phase 2.

**Gate:** All grep/version checks pass, the `unzipper` question is resolved, and the `notifyWorker` call site list is complete. Document any discrepancies as inline notes on the relevant Phase task before proceeding.

---

## Phase 1 — Shared Types

**Package:** `shared-types`
**Build output required before:** Phase 2 (worker imports), Phase 4 (API imports).

- [x] Open `shared-types/src/database.ts`.
- [x] Add `ReplenishRequest` type: `{ filename: string }`.
- [x] Add `ReplenishDatabaseResponse` type: `{ message: string; queuedAt: string }`. Shape mirrors `CreateBackupResponse`.
- [x] Verify `RestoreDatabaseResponse` is still present and unmodified (it becomes the worker's internal logging payload type).
- [x] Build `shared-types` (`npm run build` or equivalent) — TypeScript must compile with zero errors before any downstream package is touched.

**Commit after Phase 1:**
Stage only `shared-types/src/database.ts` (and any generated `.d.ts` / dist output if committed).
Suggested title: `feat: add ReplenishRequest and ReplenishDatabaseResponse shared types`

---

## Phase 2 — Worker-Node: Foundation

**Package:** `worker-node`
Complete all tasks in this phase before Phase 3. Ordering within this phase is top-down.

### 2A — Dependency: `unzipper`

- [x] **Codex concern #2 — commit scope:** If `unzipper` was absent and added in Phase 0, confirm `worker-node/package.json` now lists it and the root lockfile reflects the addition. These files must be staged for the Phase 2 commit — they are not optional.
- [x] If `unzipper` was already present, confirm `worker-node/package.json` is otherwise unchanged and skip this task.

### 2B — Path Helper

- [x] Open `worker-node/src/lib/projectPaths.ts`.
- [x] Inside `getBackupsPath`: change the directory string from `"backups_db"` to `"db_backups"`.
- [x] Inside `getFullBackupsPath`: change the directory string from `"backups_db_and_data"` to `"db_backups_and_data"`.
- [x] Add `getDbReplenishPath(...segments: string[])` returning `path.join(getRoot(), "db_replenish", ...segments)`. Follow the same structure as `getBackupsPath` and `getFullBackupsPath`.

### 2C — Backup Service Directory Constants

- [x] Open `worker-node/src/services/backupService.ts`.
- [x] Update `EXCLUDED_BACKUP_DIRS`: replace `"backups_db"` with `"db_backups"`, replace `"backups_db_and_data"` with `"db_backups_and_data"`, and add `"db_replenish"`.
- [x] Update the manifest `excluded_dirs` array literal inside `createBackup` to match: `["db_backups", "db_backups_and_data", "db_replenish"]`.

### 2D — Active-Meditation Helper

- [x] Open `worker-node/src/processor/processMeditation.ts`.
- [x] Locate the module-level `activeMeditations: Set<number>`.
- [x] Add and export `isAnyMeditationActive(): boolean { return activeMeditations.size > 0; }` adjacent to the existing `isMeditationActive` export. No new state is introduced.

### 2E — Migrate Restore Helpers from API

Perform steps in this order to avoid broken imports mid-migration.

- [x] Copy `api/src/lib/safeExtractZip.ts` to `worker-node/src/lib/safeExtractZip.ts`. Adjust any import paths as needed for the worker directory layout.
- [x] Copy `api/src/lib/safeRestoreResources.ts` to `worker-node/src/lib/safeRestoreResources.ts`. Adjust import paths.
- [x] In the worker copy of `safeRestoreResources.ts`, update `EXCLUDED_RESTORE_DIRS` to `["db_backups", "db_backups_and_data", "db_replenish"]`.
- [x] Open `worker-node/src/lib/csv.ts`. Add `parseCsv` alongside the existing `toCsv`. Port the implementation from `api/src/lib/csv.ts`.
- [x] Do **not** remove the API copies yet — that happens in Phase 4 after the API route is rewritten and confirmed to have no remaining imports.

### 2F — Startup Directory Guarantee

- [x] Open `worker-node/src/startup/onStartUp.ts` (or equivalent startup hook file).
- [x] Add `fs.mkdirSync(getDbReplenishPath(), { recursive: true })` alongside any existing directory-creation calls. Import `getDbReplenishPath` from `../lib/projectPaths`.

### 2G — Phase 2 Compile Check

- [x] Run TypeScript compilation for `worker-node` — zero errors required before Phase 3.

**Commit after Phase 2:**
Stage all changed/added files in `worker-node/src/` from this phase **plus** `worker-node/package.json` and the root lockfile if `unzipper` was added in Phase 0.
Suggested title: `refactor: worker-node path renames, backup exclusions, and migrate restore helpers`
Body bullets: path helper renames to `db_` prefix; backup service exclusion updates; `isAnyMeditationActive` helper; `safeExtractZip`/`safeRestoreResources`/`parseCsv` ported to worker; `unzipper` added to worker deps if it was absent.

---

## Phase 3 — Worker-Node: Replenish Service and Route

**Package:** `worker-node`
Requires Phase 2 complete.

### 3A — Replenish Service

- [x] Create `worker-node/src/services/replenishService.ts`.
- [x] Add module-level `let _isReplenishRunning = false`.
- [x] Export `isReplenishRunning(): boolean { return _isReplenishRunning; }`.
- [x] Export `replenishDatabase(filename: string): Promise<void>` implementing the restore pipeline in this exact order:
  1. Set `_isReplenishRunning = true`.
  2. Declare `let tempDir: string | undefined` in the outer scope (needed for `finally` cleanup — see step 9).
  3. Resolve full zip path: `const zipPath = getDbReplenishPath(filename)`.
  4. Create a temp directory and assign it: `tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "golightly04_restore_"))`.
  5. Call `safeExtractZip(zipPath, tempDir)`.
  6. Read and validate `manifest.json`; if `package_type === "db_and_resources"`, call `safeRestoreResources(tempDir, loadEnv().PATH_PROJECT_RESOURCES)`.
  7. Open a single Sequelize transaction via `getDb().sequelize.transaction(...)`:
     - a. `TRUNCATE` all tables in reverse `TABLE_ORDER` with `CASCADE`.
     - b. For each table in `TABLE_ORDER`: read `<tableName>.csv`, call `parseCsv`, apply `normalizeRestoreRow`, then `Model.bulkCreate` with `{ validate: false }`.
     - c. Call `resetTableIdSequence` for each table inside the same transaction.
  8. **Success path only** (after transaction commits, before success log): delete the staged zip — `await fsPromises.rm(zipPath, { force: true })`. Do **not** delete it in `finally` or in the failure path. *(Codex concern #3: the zip is intentionally retained on failure to allow manual retry.)*
  9. Log structured success entry per `docs/LOGGING_NODE_JS_V08.md`.
  10. **`finally` block** *(Codex concern #3)*: always execute both of the following, in order:
      - `if (tempDir) await fsPromises.rm(tempDir, { recursive: true, force: true })` — prevents `/tmp` leaks on both success and failure paths.
      - `_isReplenishRunning = false`.
- [x] Inline helpers `TABLE_ORDER`, `DATE_FIELDS`, `JSON_FIELDS`, `normalizeRestoreRow`, `resetTableIdSequence`, `isValidManifest`, and `getTableModelMap` live in this file (ported from `api/src/routes/database.ts`). Do not place them in a shared location.
- [x] Imports: `getDb` from `../lib/db`, `loadEnv` from `../config/env`, `getDbReplenishPath` from `../lib/projectPaths`, `safeExtractZip`, `safeRestoreResources`, `parseCsv`, `os`, `path`, `fsPromises` from `fs/promises`.
- [x] Logging calls must fire at: job start (before extract), job success (after zip cleanup), job failure (in catch). Include filename and timing at minimum.

### 3B — Worker App: `POST /replenish` (new route)

- [x] Open `worker-node/src/app.ts`.
- [x] Register `POST /replenish` adjacent to `POST /backup`.
- [x] Implement checks in this exact order — **order matters**:
  1. `409` if `isReplenishRunning()` — message: `"A replenish job is already running"`.
  2. `409` if `isBackupRunning()` — message: `"A backup job is running; replenish cannot start"`.
  3. `409` if `isAnyMeditationActive()` — message: `"Active meditation processing; replenish cannot start"`.
  4. `400` if `filename` is missing, not a string, contains `"/"` or `".."`, or does not end in `".zip"`.
  5. `400`/`404` if `getDbReplenishPath(filename)` does not exist on disk (use `fs.existsSync`). The resolved path must start with the `db_replenish` root prefix (path-traversal guard).
  6. `202 { accepted: true }` + `void replenishDatabase(filename).catch((e) => logger.error(...))`.
- [x] Add imports: `isReplenishRunning`, `replenishDatabase` from `./services/replenishService`; `isAnyMeditationActive` from `./processor/processMeditation`.

### 3C — Worker App: `POST /backup` (modified)

- [x] Open the existing `POST /backup` handler in `worker-node/src/app.ts`.
- [x] Add as the **first** check (before the existing `isBackupRunning()` check):
  `409` if `isReplenishRunning()` — message: `"A replenish job is running; backup cannot start"`.
- [x] Add import: `isReplenishRunning` from `./services/replenishService` (if not already imported for 3B).
- [x] All existing backup handler logic is unchanged after the new guard.

### 3D — Worker App: `POST /process` (modified)

- [x] Open the existing `POST /process` handler in `worker-node/src/app.ts`.
- [x] Add as the **first** check (before any existing validation):
  `409` if `isReplenishRunning()` — message: `"A replenish job is running; processing cannot start"`.
- [x] All existing process handler logic (meditationId validation, dedup check, status eligibility) follows unchanged after the new guard.

### 3E — Phase 3 Compile Check

- [x] Run TypeScript compilation for `worker-node` — zero errors required before Phase 4.

**Commit after Phase 3:**
Stage all new/changed files in `worker-node/src/` from this phase.
Suggested title: `feat: add worker replenishService and POST /replenish route with maintenance lock`
Body bullets: new `replenishService` (flag, restore pipeline, structured logging); `tempDir` always cleaned in `finally`, staged zip deleted on success only; `POST /replenish` with concurrency guards; backup and process routes block during replenish.

---

## Phase 4 — API Changes

**Package:** `api`
Requires Phase 1 (shared types built) and Phase 3 (worker endpoint live or deployed) complete.

### 4A — Path Helper

- [x] Open `api/src/lib/projectPaths.ts`.
- [x] Inside `getBackupsPath`: change directory string from `"backups_db"` to `"db_backups"`.
- [x] Inside `getFullBackupsPath`: change directory string from `"backups_db_and_data"` to `"db_backups_and_data"`.
- [x] Add `getDbReplenishPath(...segments: string[])` returning `getProjectResourcePath("db_replenish", ...segments)`. Follow the existing `getBackupsPath` pattern.

### 4B — Startup Directory List

- [x] Open `api/src/startup/onStartUp.ts`.
- [x] In the `mkdirSync` loop (lines 16–23 per plan), replace `"backups_db"` with `"db_backups"`. Ensure `"db_backups_and_data"` is also present (add if missing). Add `"db_replenish"`.

### 4C — Worker Client: `requestWorkerReplenish` and `notifyWorker` 409 Propagation

**File:** `api/src/services/workerClient.ts`

#### requestWorkerReplenish (new function)

- [x] Add `requestWorkerReplenish({ filename: string }): Promise<void>` mirroring `requestWorkerBackup`:
  - `POST ${env.URL_WORKER_NODE}/replenish` with JSON body `{ filename }`.
  - Retry loop: 3 attempts, 200 ms / 400 ms backoff.
  - `409` response → throw `WorkerConflictError` immediately (no retry).
  - Non-OK, non-409 after 3 failures → throw unreachable error.

#### notifyWorker /process 409 propagation (V03 concern #6)

The worker `POST /process` now returns `409` while a replenish job is running. The existing
`notifyWorker` function must not treat this as a swallowed retry-only failure. A 409 from
`/process` means the worker is deliberately refusing — retrying will not help until replenish
finishes, and the caller must know.

- [x] Locate `notifyWorker` (or the function responsible for `POST /process` calls) in `api/src/services/workerClient.ts`.
- [x] Update it so that a `409` response from the worker `/process` endpoint throws `WorkerConflictError` (or an equivalent named error, e.g. `WorkerBusyError`) immediately, with no retry. The error class must be importable by call sites.
  - If `WorkerConflictError` is already defined for Phase 4C's `requestWorkerReplenish`, reuse it here. Do not create a second class for the same semantic.
  - The thrown error must carry enough context for call sites to distinguish a replenish-window 409 from other failures (e.g., include the HTTP status and the worker's response body message).
- [x] Ensure the existing retry behavior (non-409 transient failures) is **not** changed — only the 409 branch is new.
- [x] Do **not** change the function signature visible to callers — the change is internal to the retry loop.

### 4D — Route Rewrite: `POST /replenish-database`

- [x] Open `api/src/routes/database.ts`.
- [x] Keep `uploadLarge.single("file")` multer middleware — the file arrives as multipart.
- [x] Replace the handler body with the following steps **in order**:
  1. Generate collision-resistant staged filename:
     `const ts = new Date().toISOString().replace(/[-:.]/g, "").replace("T", "_").replace("Z", "");`
     `const stagedFilename = \`replenish_${ts}_${randomUUID()}.zip\`;`
  2. Resolve staged path: `const stagedPath = getDbReplenishPath(stagedFilename)`.
  3. Move multer temp file: `await fsPromises.rename(req.file.path, stagedPath)`. If cross-volume, use `copyFile` + `rm` instead.
  4. Call `await requestWorkerReplenish({ filename: stagedFilename })`.
  5. On success: `res.status(202).json({ message: "Replenish queued", queuedAt: new Date().toISOString() })`. Leave staged file — worker owns it.
  6. On `WorkerConflictError` (catch): delete staged file (`await fsPromises.rm(stagedPath, { force: true })`), then `res.status(409).json({ error: "A replenish job is already running" })`.
  7. On worker-unreachable error (catch): delete staged file, then `res.status(503).json({ error: "Worker unavailable; replenish could not be started" })`.
  8. In `finally`: `await fsPromises.rm(req.file.path, { force: true })` (no-op if rename succeeded).
- [x] Add imports: `randomUUID` from `"crypto"`, `getDbReplenishPath` from `../lib/projectPaths`, `requestWorkerReplenish` from `../services/workerClient`.

### 4E — Remove Dead Imports from `database.ts`

Only remove after confirming no other handler in the file uses the symbol.

- [x] Remove `os` import if unused after the route rewrite.
- [x] Remove `Transaction` type import if unused.
- [x] Remove `getDb` import if the replenish block was its only use in this route file.
- [x] Remove `parseCsv` import.
- [x] Remove `safeExtractZip` import.
- [x] Remove `safeRestoreResources` import.
- [x] Remove inline definitions: `TABLE_ORDER`, `DATE_FIELDS`, `JSON_FIELDS`, `normalizeRestoreRow`, `resetTableIdSequence`, `isValidManifest`, `getTableModelMap`.

### 4F — Remove API Lib Files (after confirming zero consumers remain)

- [x] Grep `api/src/` for any remaining import of `safeExtractZip` — if zero, delete `api/src/lib/safeExtractZip.ts`.
- [x] Grep `api/src/` for any remaining import of `safeRestoreResources` — if zero, delete `api/src/lib/safeRestoreResources.ts`.
- [x] Grep `api/src/` for any remaining import of `parseCsv` from `lib/csv` — if zero, decide whether to remove `parseCsv` from `api/src/lib/csv.ts` or leave the file intact (if `toCsv` is still needed there).

### 4G — Backup Size Estimate Skip List

- [x] Open `api/src/routes/database.ts`, `getBackupSizeEstimate` / `walk` function (plan references line 119).
- [x] Update the directory skip condition to exclude `"db_backups"`, `"db_backups_and_data"`, and `"db_replenish"`. Remove old names `"backups_db"` and `"backups_db_and_data"`.

### 4H — notifyWorker Call Site Audit and Update (V03 concern #6)

**Context:** `notifyWorker` now throws `WorkerConflictError` on worker `409`. Every call site that
was previously fire-and-forget must be updated. Two valid strategies exist — choose the one
appropriate for each call site:

- **Strategy A — Await and propagate:** `await notifyWorker(...)` inside a try/catch; on
  `WorkerConflictError`, return HTTP `409` to the browser with a message indicating the meditation
  was saved but processing is temporarily unavailable due to maintenance. The client can display a
  retry prompt or retry automatically.
- **Strategy B — Persist retry state:** Before calling `notifyWorker`, persist a durable marker
  (e.g. set `meditation.status = "pending_processing"`) so a background sweep or next request can
  trigger processing. Only use this strategy if a reliable sweep already exists or will be added as
  part of this feature. Do not introduce new infrastructure for Strategy B unless the call site
  genuinely cannot surface a 409 to the user.

For each call site below, the task is to (a) determine which strategy applies, (b) update the call
accordingly, and (c) document the chosen strategy as a brief inline comment if the choice is not
obvious from context.

#### 4H-1 — `api/src/services/meditations/createOrRegenerateStagedMeditation.ts`

- [x] Locate every `notifyWorker(...)` call (including `void notifyWorker(...)` variants).
- [x] Determine whether this function returns a value used by an HTTP route handler. If yes, Strategy A is preferred — await the call and let `WorkerConflictError` propagate up to the route handler, which adds a catch block returning `409`.
- [x] If the function is a service used by multiple routes, add a `WorkerConflictError` re-throw at the service boundary so each route caller can handle it consistently.
- [x] Update the route handler(s) that call this service to catch `WorkerConflictError` and return `409` with a user-facing message (e.g. `"Meditation saved but processing is temporarily unavailable. Please retry shortly."`).
- [x] Confirm no `void` keyword silently discards the awaited promise.

#### 4H-2 — `api/src/routes/admin.ts`

- [x] Locate every `notifyWorker(...)` call (including `void notifyWorker(...)` variants).
- [x] Admin requeue flows typically run in a request context with an authenticated admin user. Strategy A is appropriate unless the requeue is a background batch — determine which applies.
- [x] For request-context calls: await and catch `WorkerConflictError`; return `409` to the admin caller with a message indicating the requeue was skipped due to an active replenish job.
- [x] For any background batch calls: apply Strategy B if a reliable retry mechanism exists; otherwise convert to Strategy A by awaiting and logging the conflict without returning a misleading success.
- [x] Confirm no `void` keyword silently discards the awaited promise.

#### 4H-3 — `api/src/routes/meditations.ts`

- [x] Locate every `notifyWorker(...)` call (including `void notifyWorker(...)` variants).
- [x] This is a user-facing route file. Strategy A is required unless the call is in a clearly background context — await and propagate.
- [x] Add a catch block for `WorkerConflictError` at the route handler level; return `409` with a user-facing message (e.g. `"Request accepted but processing is temporarily unavailable. Please retry shortly."`).
- [x] Confirm no `void` keyword silently discards the awaited promise.

#### 4H-4 — `api/src/services/meditations/createScriptMeditation.ts` (if present)

- [x] Run `ls api/src/services/meditations/createScriptMeditation.ts` to confirm the file exists. If absent, mark this task N/A and skip.
- [x] If present: locate every `notifyWorker(...)` call (including `void notifyWorker(...)` variants).
- [x] Apply the same analysis as 4H-1: if the service result flows to an HTTP route, use Strategy A; re-throw `WorkerConflictError` at the service boundary and handle it in the calling route handler.
- [x] Confirm no `void` keyword silently discards the awaited promise.

#### 4H-5 — Additional call sites found in Phase 0 audit

- [x] For each additional call site identified by `rg "notifyWorker\(" api/src` in Phase 0 that is not covered by 4H-1 through 4H-4: apply the same audit (fire-and-forget check, strategy selection, propagation or retry-state persistence).
- [x] Document each additional site and the chosen strategy as a sub-bullet here before implementation begins.

### 4I — Phase 4 Compile Check

- [x] Run TypeScript compilation for `api` — zero errors required before Phase 5.

**Commit after Phase 4:**
Stage all changed/added/deleted files in `api/src/` from this phase.
Suggested title: `feat: offload replenish to worker, propagate 409 from notifyWorker to callers`
Body bullets: route rewrite (stage zip, call worker, 202/409/503 with cleanup); path helpers renamed to `db_` prefix; startup mkdir list updated; workerClient gains `requestWorkerReplenish` and surfaces `WorkerConflictError` on `/process` 409; `notifyWorker` call sites in admin, meditations, and service layers await and propagate conflict; dead restore logic and imports removed.

---

## Phase 5 — Web App Changes

**Package:** `web`
Requires Phase 4 complete (API response shape changed).

### 5A — API Client Return Type

- [x] Open `web/src/lib/api/database.ts`.
- [x] Change the return type of `replenishDatabase` from `Promise<RestoreDatabaseResponse>` to `Promise<ReplenishDatabaseResponse>`.
- [x] Update imports: add `ReplenishDatabaseResponse` from shared-types; remove `RestoreDatabaseResponse` if no longer used in this file.

### 5B — Admin Page Success Toast

- [x] Open `web/src/app/admin/page.tsx`.
- [x] In `handleRestoreDatabase`, replace the success toast logic that reads `response.tablesImported`, `response.totalRows`, and `response.resourceFilesRestored` with a simple acknowledgement message, e.g.: `"Restore queued. The database will be updated in the background."`.
- [x] Remove `resourceText` and table-count composition logic.
- [x] The `showLoading("Restoring database...")` dispatch may remain or be updated to `"Queuing restore..."` — either is correct.

### 5C — Restore Modal Label (optional but recommended)

- [x] Open `web/src/components/modals/ModalConfirmRestore.tsx`.
- [x] Review the `"Restoring..."` button label used during the loading state.
- [x] Consider changing it to `"Queuing..."` to reflect the asynchronous nature. No functional change required; defer if low priority.

### 5D — Phase 5 Compile Check

- [x] Run TypeScript compilation for `web` — zero errors required before Phase 6.

**Commit after Phase 5:**
Stage all changed files in `web/src/` from this phase.
Suggested title: `feat: update web app for async replenish 202 response`
Body bullets: API client return type updated to `ReplenishDatabaseResponse`; admin page success toast simplified to async acknowledgement.

---

## Phase 6 — Tests

Complete each sub-section in order. All new tests should follow patterns in the matching sibling test file noted below.

Codex status note:
- Implemented test updates for moved worker zip/resource helpers, `db_` directory names, worker route mock factories, `/replenish` route coverage, `replenishService` lifecycle coverage, API `/replenish-database` delegation/cleanup coverage, and `notifyWorker` 409 propagation coverage for workerClient/admin/meditation routes.
- Full API and worker route suites could not complete in this sandbox because Supertest attempts to bind `0.0.0.0` and fails with `listen EPERM: operation not permitted`. Non-route focused tests for `worker-node/tests/services/replenishService.test.ts` and `api/tests/services/workerClient.test.ts` pass.

### 6A — Move Existing API Lib Tests to Worker

- [x] Move `api/tests/lib/safeExtractZip.test.ts` → `worker-node/tests/lib/safeExtractZip.test.ts`. Adjust import paths.
- [x] Move `api/tests/lib/safeRestoreResources.test.ts` → `worker-node/tests/lib/safeRestoreResources.test.ts`. Adjust import paths.
- [x] Confirm the old locations are deleted and not referenced by any test runner config.

### 6B — Update Fixture and Directory-Name References

- [x] Grep all test files in `api/tests/` and `worker-node/tests/` for `"backups_db"` and `"backups_db_and_data"`. Update every occurrence to `"db_backups"` and `"db_backups_and_data"` respectively.
- [x] Grep for any test setup that creates `backups_db` or `backups_db_and_data` directories — update to new names.

### 6C — Worker: `isAnyMeditationActive` Unit Tests

File: `worker-node/tests/processor/processMeditation.test.ts` (or create if absent).

- [x] Test: `isAnyMeditationActive()` returns `false` when `activeMeditations` is empty.
- [x] Test: `isAnyMeditationActive()` returns `true` when at least one meditation ID is in `activeMeditations`.

### 6D — Worker Route: `POST /replenish` (new test file)

File: `worker-node/tests/routes/replenish.routes.test.ts`
Mirror pattern from `worker-node/tests/routes/backup.routes.test.ts`.

- [x] **Codex concern #4 — mock factories:** The new test file imports the same `app` module as backup and process tests. Add Jest module mocks for all modules that `app.ts` now imports due to this feature:
  - Mock `../../src/services/replenishService` with `isReplenishRunning` returning `false` and `replenishDatabase` as a no-op by default.
  - Mock `../../src/processor/processMeditation` including **both** `isMeditationActive` and the new `isAnyMeditationActive` export (returning `false` by default).
  - Mock `../../src/services/backupService` with `isBackupRunning` returning `false` by default.
- [x] `202` when filename is valid and file exists in `db_replenish/`.
- [x] `409` when `isReplenishRunning()` returns `true`.
- [x] `409` when `isBackupRunning()` returns `true` (V02 requirement).
- [x] `409` when `isAnyMeditationActive()` returns `true` (V02 requirement).
- [x] `400` when `filename` is missing from the request body.
- [x] `400` when `filename` is not a string.
- [x] `400` when `filename` contains `"/"`.
- [x] `400` when `filename` contains `".."`.
- [x] `400` when `filename` does not end in `".zip"`.
- [x] `400`/`404` when the file does not exist inside `db_replenish/`.

### 6E — Worker Route: `POST /backup` (update existing tests)

File: `worker-node/tests/routes/backup.routes.test.ts`

- [x] **Codex concern #4 — mock factories:** `app.ts` now imports `isReplenishRunning` from `replenishService` for the `/backup` guard. Update the existing mock factory (or `beforeEach`/`jest.mock` block) in this test file to also mock `../../src/services/replenishService` with `isReplenishRunning` returning `false` by default. Without this, the test file will fail to load `app.ts` after Phase 3 lands.
- [x] **Codex concern #4 — mock factories:** `app.ts` now also imports `isAnyMeditationActive` from `processMeditation`. Update the existing `processMeditation` mock to include `isAnyMeditationActive` returning `false` by default alongside the existing exports.
- [x] Add test: `409` when `isReplenishRunning()` returns `true` (V02 requirement).
- [x] Confirm all existing tests still pass without modification.

### 6F — Worker Route: `POST /process` (update existing tests)

File: `worker-node/tests/routes/process.routes.test.ts`

- [x] **Codex concern #4 — mock factories:** Same requirement as 6E. Update the existing mock factory to mock `../../src/services/replenishService` with `isReplenishRunning` returning `false` by default.
- [x] **Codex concern #4 — mock factories:** Update the existing `processMeditation` mock to include `isAnyMeditationActive` returning `false` by default.
- [x] Add test: `409` when `isReplenishRunning()` returns `true` (V02 requirement).
- [x] Confirm all existing tests still pass without modification.

### 6G — Worker Service: `replenishService` Tests

File: `worker-node/tests/services/replenishService.test.ts`
Mirror pattern from `worker-node/tests/services/backupService.test.ts`.

- [x] Place a fixture `.zip` (with known CSV rows and a `manifest.json`) into a test `db_replenish/` directory.
- [x] Test: `replenishDatabase(filename)` against a test database — assert all five tables truncated then repopulated with fixture data.
- [x] Test: sequences reset to the correct max id after replenish.
- [x] Test: for a `db_and_resources` package, resource files are written to the correct destination.
- [x] Test: staged zip is **deleted** on success.
- [x] Test: staged zip is **retained** (not deleted) on failure — confirming the intentional failure-path behavior from the V02 plan.
- [x] Test: `tempDir` under `os.tmpdir()` is **always removed** on both success and failure paths (confirming the `finally`-block cleanup from Phase 3A, step 10).
- [x] Test: `isReplenishRunning()` returns `false` after both success and failure paths.

### 6H — API Route: `POST /replenish-database` Tests

File: `api/tests/database/database.routes.test.ts`

- [x] **Codex concern #4 — mock factories:** The rewritten handler imports `requestWorkerReplenish` from `workerClient`. Update the existing `../../src/services/workerClient` mock factory to add `requestWorkerReplenish` as a Jest mock function (resolving by default). Without this addition, the rewritten route will import an unmocked symbol and tests may throw or behave unexpectedly.
- [x] Test: staged filename matches `replenish_<timestamp>_<uuid>.zip` format (not `Date.now()` alone) — V02 requirement.
- [x] Test: two concurrent calls to the handler produce different staged filenames — V02 requirement.
- [x] Test: the uploaded file is written to `db_replenish/` and `requestWorkerReplenish` is called with the correct basename.
- [x] Test: `202` response with `{ message, queuedAt }` shape.
- [x] Test: **no database rows are inserted or truncated** — the API must not touch the DB.
- [x] Test: when worker client returns `WorkerConflictError` (`409`) — assert response is `409` and the staged file is **deleted** — V02 requirement.
- [x] Test: when worker client throws unreachable error (`503`) — assert response is `503` and the staged file is **deleted** — V02 requirement.

### 6I — API: `notifyWorker` WorkerConflictError Propagation Tests (V03 concern #6)

**Context:** These tests verify the contract added in Phase 4C and Phase 4H: a worker `409` during
replenish is never silently swallowed and always surfaces as a user-visible error or durable retry
state. Place tests in the appropriate existing route/service test files for each call site.

#### 6I-1 — workerClient unit test: `notifyWorker` throws on 409

File: `api/tests/services/workerClient.test.ts` (or create if absent; mirror pattern of existing workerClient tests).

- [x] Mock the worker HTTP endpoint to return `409` on `POST /process`.
- [x] Test: `notifyWorker(...)` throws `WorkerConflictError` (or the equivalent named error defined in Phase 4C) when the worker responds with `409`. The thrown error must not be swallowed by the retry loop.
- [x] Test: `notifyWorker(...)` does **not** retry after a `409` — confirm the endpoint is called exactly once.
- [x] Test: `notifyWorker(...)` continues to retry on non-409 transient failures (e.g. 503) — confirm existing retry behavior is unbroken.

#### 6I-2 — createOrRegenerateStagedMeditation call site

File: `api/tests/services/meditations/createOrRegenerateStagedMeditation.test.ts` (or the nearest existing test for this service).

- [x] Update the `workerClient` mock factory to include `notifyWorker` as a Jest mock function that resolves by default. Without this, the test file will import an unmocked `notifyWorker` after Phase 4C.
- [x] Test: when `notifyWorker` rejects with `WorkerConflictError`, the service (or the route calling it) returns a `409`-equivalent response to the caller — not a success response.
- [x] Test: when `notifyWorker` resolves normally, the meditation is created/regenerated and the caller receives a success response — existing behavior is unbroken.

#### 6I-3 — admin.ts call site

File: `api/tests/routes/admin.routes.test.ts` (or the nearest existing admin route test file).

- [x] Update the `workerClient` mock factory to include `notifyWorker` resolving by default.
- [x] Test: when `notifyWorker` rejects with `WorkerConflictError` during an admin requeue (or the relevant admin action that calls `notifyWorker`), the route returns `409` with a message indicating the worker is busy — not a `200`/`2xx` success.
- [x] Test: when `notifyWorker` resolves normally, the admin action succeeds as before.

#### 6I-4 — meditations.ts call site

File: `api/tests/routes/meditations.routes.test.ts` (or the nearest existing meditation route test file).

- [x] Update the `workerClient` mock factory to include `notifyWorker` resolving by default.
- [x] Test: when `notifyWorker` rejects with `WorkerConflictError` during a user-facing meditation action (e.g. create or regenerate), the route returns `409` to the browser. The response body must include a message indicating the item was saved but processing is temporarily unavailable (not a generic error).
- [x] Test: when `notifyWorker` resolves normally, the route returns its normal success response.

#### 6I-5 — createScriptMeditation.ts call site (if present)

- [x] If `api/src/services/meditations/createScriptMeditation.ts` was confirmed present in Phase 4H-4: add the same mock factory update and `WorkerConflictError` propagation test to the relevant test file.
- [x] If the file was marked N/A in Phase 4H-4: mark this task N/A.

#### 6I-6 — Additional call sites found in Phase 0 audit

- [x] For each additional call site identified in Phase 4H-5: add a test asserting that `WorkerConflictError` from `notifyWorker` is not swallowed and reaches the user as a `409` or is persisted as durable retry state (whichever strategy was selected for that call site).

### 6J — Full Test Suite Run

- [x] Run the full test suite for `worker-node` — all tests pass (`npm test -w @golightly/worker-node -- --runInBand`).
- [x] Run the full test suite for `api` — all tests pass (`npm test -w @golightly/api -- --runInBand`).
- [x] Run the full test suite for `web` — N/A: no `test` script is defined for `@golightly/web`; `npm run typecheck -w @golightly/web` and `npm run build -w @golightly/web` pass.

**Commit after Phase 6:**
Stage all new/changed/moved test files from this phase.
Suggested title: `test: replenish service, route, and notifyWorker 409 propagation tests`
Body bullets: new `replenish.routes.test`; `replenishService` integration test with fixture zip; backup and process route tests cover `isReplenishRunning` guard; mock factories in backup/process/admin/meditations tests updated for new imports; `notifyWorker` unit test asserts 409 throws and no retry; per-call-site tests assert user-facing 409 on WorkerConflictError; API `/replenish-database` tests assert staged-file cleanup on 409/503; moved `safeExtractZip`/`safeRestoreResources` tests to worker.

---

## Phase 7 — Operations Deploy

These steps run on the server, not in the codebase. They must be coordinated with the code deploy.

**Codex concern #1 — safe/idempotent deploy ordering:** Both the worker and API path helpers change from `backups_db`/`backups_db_and_data` to `db_backups`/`db_backups_and_data`. The accepted plan requires no dual-read fallback: the directory rename must be complete before any service using the new names is restarted. The ordering below enforces this. Do not restart either service before Step 2 is verified complete.

### Pre-Deploy Preflight

- [ ] Verify that the currently running services are the **old** versions (expect `backups_db` and `backups_db_and_data` to exist on disk). Document current state.
- [ ] Confirm no backup or restore is in progress before beginning the maintenance window.

### Deploy Steps (must be followed in order)

- [ ] **Step 1 — Stop services:** Gracefully stop the running `worker-node` and `api` services so no in-flight requests are reading or writing the old directory names.

- [ ] **Step 2 — Directory rename (idempotent):** Run the following under `PATH_PROJECT_RESOURCES`. The guarded form is safe to re-run if a previous attempt was interrupted:
  ```bash
  cd "$PATH_PROJECT_RESOURCES"
  [ -d backups_db ]          && mv backups_db          db_backups
  [ -d backups_db_and_data ] && mv backups_db_and_data db_backups_and_data
  mkdir -p db_replenish
  ```
  The `[ -d ... ] &&` guards prevent errors if a directory was already renamed in a prior attempt. If neither source directory exists but the targets do, the rename was already applied — proceed.

- [ ] **Step 3 — Verify new directories:** Confirm all three directories exist before proceeding:
  ```bash
  ls -ld "$PATH_PROJECT_RESOURCES/db_backups" \
         "$PATH_PROJECT_RESOURCES/db_backups_and_data" \
         "$PATH_PROJECT_RESOURCES/db_replenish"
  ```
  Do not proceed to Step 4 until this check passes. Confirm existing `.zip` backup archives are present inside `db_backups/` and `db_backups_and_data/` with no data loss.

- [ ] **Step 4 — Deploy and start `worker-node`** with the new `POST /replenish` endpoint. Verify it responds `400` (not a connection error) to a basic test request before proceeding.

- [ ] **Step 5 — Deploy and start `api`** with the new route delegation logic.

- [ ] **Step 6 — Deploy and start `web`** with the updated toast and type.

### Post-Deploy Smoke Checks

- [ ] Trigger a backup from the admin UI — confirm `202` response and backup completes in worker logs.
- [ ] Upload a `.zip` backup via the admin restore UI — confirm browser receives `202` toast ("Restore queued") immediately.
- [ ] Confirm worker log shows start, success, and final row counts for the replenish job.
- [ ] Confirm database reflects the restored data after the worker finishes.
- [ ] Confirm `db_replenish/` is empty after a successful restore.
- [ ] Trigger a second upload while a restore is in progress — confirm the UI receives a `409`.
- [ ] Start a backup, then immediately attempt a replenish — confirm replenish returns `409`.
- [ ] Start a meditation processing job, then attempt a replenish — confirm replenish returns `409`.
- [ ] Simulate a worker-unavailable scenario — confirm the staged file is not left in `db_replenish/` after the API returns `503`.
- [ ] **V03 smoke check — notifyWorker 409 propagation:** While a replenish job is running on the worker, attempt to create or submit a meditation via the browser UI — confirm the browser receives a `409` response with a user-facing message indicating temporary unavailability, not a misleading success response.

---

## Phase 8 — Documentation Follow-up

Complete after the code is merged and stable on the target environment.

**Codex concern #5 — frontmatter rules:** Every docs file modified in this phase is governed by the repository's AGENTS.md frontmatter rules. For each file edited below, before saving:
- Preserve `created_at` exactly as found — **never modify it**.
- Preserve `created_by` exactly as found — **never modify it**.
- Set `updated_at` to `2026-06-12` (or to the actual date of the edit if later).
- Set `modified_by` to the agent and model performing the edit, e.g. `claude (sonnet)`. One line only, no email addresses, no angle brackets, lowercase.

- [x] Update `docs/20260515_CTO_ONBOARDING_GO_LIGHTLY.md` — architecture diagram and any backup-path notes (`backups_db` → `db_backups`). Apply frontmatter rules above.
- [x] Update `docs/db-models/SETUP_MAC.md` — replace references to `{PATH_PROJECT_RESOURCES}/backups_db` with `db_backups`. Apply frontmatter rules above.
- [x] Update `docs/db-models/SETUP_UBUNTU.md` — same as above. Apply frontmatter rules above.
- [x] Review worker and API READMEs for any enumerated subdirectory names and update to `db_` convention. Apply frontmatter rules to any README that carries YAML frontmatter.

**Commit after Phase 8:**
Stage only docs files.
Suggested title: `docs: update directory names to db_ convention across onboarding and setup guides`
