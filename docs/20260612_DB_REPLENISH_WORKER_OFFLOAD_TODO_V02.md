---
created_at: 2026-06-12
updated_at: 2026-06-12
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# TODO: Database Replenish Worker Offload + `db_` Directory Convention (V02)

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
> Do not implement code without reviewing the V02 plan first.

---

## Phase 0 — Pre-flight Verification

Tasks in this phase carry no code changes. Complete them before writing a single line of implementation.

- [ ] Read `docs/20260612_DB_REPLENISH_WORKER_OFFLOAD_PLAN_V02.md` in full.
- [ ] **Codex concern #2 — `unzipper` dependency:** Check whether `unzipper` is listed in `worker-node/package.json` dependencies.
  - If absent: run the workspace add command to add it to `worker-node` (e.g. `npm install unzipper --workspace=worker-node` or equivalent for the repo's package manager). Stage `worker-node/package.json` and the root `package-lock.json` (or `yarn.lock` / `pnpm-lock.yaml`). This is a build-blocker and must be resolved before Phase 2 begins; the package/lockfile changes are committed at the end of Phase 2 together with the source changes.
  - If already present: note "unzipper already present" and proceed.
- [ ] Grep `api/src/` for all imports of `safeExtractZip` — confirm only `database.ts` imports it.
- [ ] Grep `api/src/` for all imports of `safeRestoreResources` — confirm only `database.ts` imports it.
- [ ] Grep `api/src/` for all imports of `parseCsv` from `lib/csv` — confirm only `database.ts` imports it. If other consumers exist, plan to duplicate rather than move.
- [ ] Confirm the project's Node.js version is ≥ 14.17 (required for `crypto.randomUUID`).
- [ ] Note the current line numbers for `EXCLUDED_BACKUP_DIRS` (plan references line 22) and manifest `excluded_dirs` (plan references line 133) in `worker-node/src/services/backupService.ts` — verify they match before editing.
- [ ] Note the current line numbers for the `mkdirSync` loop in `api/src/startup/onStartUp.ts` (plan references lines 16–23) — verify before editing.
- [ ] Note the current line range for the synchronous replenish handler in `api/src/routes/database.ts` (plan references lines 221–320) — verify before replacing.
- [ ] Note the location of the `walk` skip condition in `api/src/routes/database.ts` `getBackupSizeEstimate` (plan references line 119) — verify before editing.

**Gate:** All grep/version checks pass and the `unzipper` question is resolved. Document any discrepancies as inline notes on the relevant Phase task before proceeding.

---

## Phase 1 — Shared Types

**Package:** `shared-types`  
**Build output required before:** Phase 2 (worker imports), Phase 4 (API imports).

- [ ] Open `shared-types/src/database.ts`.
- [ ] Add `ReplenishRequest` type: `{ filename: string }`.
- [ ] Add `ReplenishDatabaseResponse` type: `{ message: string; queuedAt: string }`. Shape mirrors `CreateBackupResponse`.
- [ ] Verify `RestoreDatabaseResponse` is still present and unmodified (it becomes the worker's internal logging payload type).
- [ ] Build `shared-types` (`npm run build` or equivalent) — TypeScript must compile with zero errors before any downstream package is touched.

**Commit after Phase 1:**  
Stage only `shared-types/src/database.ts` (and any generated `.d.ts` / dist output if committed).  
Suggested title: `feat: add ReplenishRequest and ReplenishDatabaseResponse shared types`

---

## Phase 2 — Worker-Node: Foundation

**Package:** `worker-node`  
Complete all tasks in this phase before Phase 3. Ordering within this phase is top-down.

### 2A — Dependency: `unzipper`

- [ ] **Codex concern #2 — commit scope:** If `unzipper` was absent and added in Phase 0, confirm `worker-node/package.json` now lists it and the root lockfile reflects the addition. These files must be staged for the Phase 2 commit — they are not optional.
- [ ] If `unzipper` was already present, confirm `worker-node/package.json` is otherwise unchanged and skip this task.

### 2B — Path Helper

- [ ] Open `worker-node/src/lib/projectPaths.ts`.
- [ ] Inside `getBackupsPath`: change the directory string from `"backups_db"` to `"db_backups"`.
- [ ] Inside `getFullBackupsPath`: change the directory string from `"backups_db_and_data"` to `"db_backups_and_data"`.
- [ ] Add `getDbReplenishPath(...segments: string[])` returning `path.join(getRoot(), "db_replenish", ...segments)`. Follow the same structure as `getBackupsPath` and `getFullBackupsPath`.

### 2C — Backup Service Directory Constants

- [ ] Open `worker-node/src/services/backupService.ts`.
- [ ] Update `EXCLUDED_BACKUP_DIRS`: replace `"backups_db"` with `"db_backups"`, replace `"backups_db_and_data"` with `"db_backups_and_data"`, and add `"db_replenish"`.
- [ ] Update the manifest `excluded_dirs` array literal inside `createBackup` to match: `["db_backups", "db_backups_and_data", "db_replenish"]`.

### 2D — Active-Meditation Helper

- [ ] Open `worker-node/src/processor/processMeditation.ts`.
- [ ] Locate the module-level `activeMeditations: Set<number>`.
- [ ] Add and export `isAnyMeditationActive(): boolean { return activeMeditations.size > 0; }` adjacent to the existing `isMeditationActive` export. No new state is introduced.

### 2E — Migrate Restore Helpers from API

Perform steps in this order to avoid broken imports mid-migration.

- [ ] Copy `api/src/lib/safeExtractZip.ts` to `worker-node/src/lib/safeExtractZip.ts`. Adjust any import paths as needed for the worker directory layout.
- [ ] Copy `api/src/lib/safeRestoreResources.ts` to `worker-node/src/lib/safeRestoreResources.ts`. Adjust import paths.
- [ ] In the worker copy of `safeRestoreResources.ts`, update `EXCLUDED_RESTORE_DIRS` to `["db_backups", "db_backups_and_data", "db_replenish"]`.
- [ ] Open `worker-node/src/lib/csv.ts`. Add `parseCsv` alongside the existing `toCsv`. Port the implementation from `api/src/lib/csv.ts`.
- [ ] Do **not** remove the API copies yet — that happens in Phase 4 after the API route is rewritten and confirmed to have no remaining imports.

### 2F — Startup Directory Guarantee

- [ ] Open `worker-node/src/startup/onStartUp.ts` (or equivalent startup hook file).
- [ ] Add `fs.mkdirSync(getDbReplenishPath(), { recursive: true })` alongside any existing directory-creation calls. Import `getDbReplenishPath` from `../lib/projectPaths`.

### 2G — Phase 2 Compile Check

- [ ] Run TypeScript compilation for `worker-node` — zero errors required before Phase 3.

**Commit after Phase 2:**  
Stage all changed/added files in `worker-node/src/` from this phase **plus** `worker-node/package.json` and the root lockfile if `unzipper` was added in Phase 0.  
Suggested title: `refactor: worker-node path renames, backup exclusions, and migrate restore helpers`  
Body bullets: path helper renames to `db_` prefix; backup service exclusion updates; `isAnyMeditationActive` helper; `safeExtractZip`/`safeRestoreResources`/`parseCsv` ported to worker; `unzipper` added to worker deps if it was absent.

---

## Phase 3 — Worker-Node: Replenish Service and Route

**Package:** `worker-node`  
Requires Phase 2 complete.

### 3A — Replenish Service

- [ ] Create `worker-node/src/services/replenishService.ts`.
- [ ] Add module-level `let _isReplenishRunning = false`.
- [ ] Export `isReplenishRunning(): boolean { return _isReplenishRunning; }`.
- [ ] Export `replenishDatabase(filename: string): Promise<void>` implementing the restore pipeline in this exact order:
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
- [ ] Inline helpers `TABLE_ORDER`, `DATE_FIELDS`, `JSON_FIELDS`, `normalizeRestoreRow`, `resetTableIdSequence`, `isValidManifest`, and `getTableModelMap` live in this file (ported from `api/src/routes/database.ts`). Do not place them in a shared location.
- [ ] Imports: `getDb` from `../lib/db`, `loadEnv` from `../config/env`, `getDbReplenishPath` from `../lib/projectPaths`, `safeExtractZip`, `safeRestoreResources`, `parseCsv`, `os`, `path`, `fsPromises` from `fs/promises`.
- [ ] Logging calls must fire at: job start (before extract), job success (after zip cleanup), job failure (in catch). Include filename and timing at minimum.

### 3B — Worker App: `POST /replenish` (new route)

- [ ] Open `worker-node/src/app.ts`.
- [ ] Register `POST /replenish` adjacent to `POST /backup`.
- [ ] Implement checks in this exact order — **order matters**:
  1. `409` if `isReplenishRunning()` — message: `"A replenish job is already running"`.
  2. `409` if `isBackupRunning()` — message: `"A backup job is running; replenish cannot start"`.
  3. `409` if `isAnyMeditationActive()` — message: `"Active meditation processing; replenish cannot start"`.
  4. `400` if `filename` is missing, not a string, contains `"/"` or `".."`, or does not end in `".zip"`.
  5. `400`/`404` if `getDbReplenishPath(filename)` does not exist on disk (use `fs.existsSync`). The resolved path must start with the `db_replenish` root prefix (path-traversal guard).
  6. `202 { accepted: true }` + `void replenishDatabase(filename).catch((e) => logger.error(...))`.
- [ ] Add imports: `isReplenishRunning`, `replenishDatabase` from `./services/replenishService`; `isAnyMeditationActive` from `./processor/processMeditation`.

### 3C — Worker App: `POST /backup` (modified)

- [ ] Open the existing `POST /backup` handler in `worker-node/src/app.ts`.
- [ ] Add as the **first** check (before the existing `isBackupRunning()` check):  
  `409` if `isReplenishRunning()` — message: `"A replenish job is running; backup cannot start"`.
- [ ] Add import: `isReplenishRunning` from `./services/replenishService` (if not already imported for 3B).
- [ ] All existing backup handler logic is unchanged after the new guard.

### 3D — Worker App: `POST /process` (modified)

- [ ] Open the existing `POST /process` handler in `worker-node/src/app.ts`.
- [ ] Add as the **first** check (before any existing validation):  
  `409` if `isReplenishRunning()` — message: `"A replenish job is running; processing cannot start"`.
- [ ] All existing process handler logic (meditationId validation, dedup check, status eligibility) follows unchanged after the new guard.

### 3E — Phase 3 Compile Check

- [ ] Run TypeScript compilation for `worker-node` — zero errors required before Phase 4.

**Commit after Phase 3:**  
Stage all new/changed files in `worker-node/src/` from this phase.  
Suggested title: `feat: add worker replenishService and POST /replenish route with maintenance lock`  
Body bullets: new `replenishService` (flag, restore pipeline, structured logging); `tempDir` always cleaned in `finally`, staged zip deleted on success only; `POST /replenish` with concurrency guards; backup and process routes block during replenish.

---

## Phase 4 — API Changes

**Package:** `api`  
Requires Phase 1 (shared types built) and Phase 3 (worker endpoint live or deployed) complete.

### 4A — Path Helper

- [ ] Open `api/src/lib/projectPaths.ts`.
- [ ] Inside `getBackupsPath`: change directory string from `"backups_db"` to `"db_backups"`.
- [ ] Inside `getFullBackupsPath`: change directory string from `"backups_db_and_data"` to `"db_backups_and_data"`.
- [ ] Add `getDbReplenishPath(...segments: string[])` returning `getProjectResourcePath("db_replenish", ...segments)`. Follow the existing `getBackupsPath` pattern.

### 4B — Startup Directory List

- [ ] Open `api/src/startup/onStartUp.ts`.
- [ ] In the `mkdirSync` loop (lines 16–23 per plan), replace `"backups_db"` with `"db_backups"`. Ensure `"db_backups_and_data"` is also present (add if missing). Add `"db_replenish"`.

### 4C — Worker Client

- [ ] Open `api/src/services/workerClient.ts`.
- [ ] Add `requestWorkerReplenish({ filename: string }): Promise<void>` mirroring `requestWorkerBackup`:
  - `POST ${env.URL_WORKER_NODE}/replenish` with JSON body `{ filename }`.
  - Retry loop: 3 attempts, 200 ms / 400 ms backoff.
  - `409` response → throw `WorkerConflictError` immediately (no retry).
  - Non-OK, non-409 after 3 failures → throw unreachable error.

### 4D — Route Rewrite: `POST /replenish-database`

- [ ] Open `api/src/routes/database.ts`.
- [ ] Keep `uploadLarge.single("file")` multer middleware — the file arrives as multipart.
- [ ] Replace the handler body with the following steps **in order**:
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
- [ ] Add imports: `randomUUID` from `"crypto"`, `getDbReplenishPath` from `../lib/projectPaths`, `requestWorkerReplenish` from `../services/workerClient`.

### 4E — Remove Dead Imports from `database.ts`

Only remove after confirming no other handler in the file uses the symbol.

- [ ] Remove `os` import if unused after the route rewrite.
- [ ] Remove `Transaction` type import if unused.
- [ ] Remove `getDb` import if the replenish block was its only use in this route file.
- [ ] Remove `parseCsv` import.
- [ ] Remove `safeExtractZip` import.
- [ ] Remove `safeRestoreResources` import.
- [ ] Remove inline definitions: `TABLE_ORDER`, `DATE_FIELDS`, `JSON_FIELDS`, `normalizeRestoreRow`, `resetTableIdSequence`, `isValidManifest`, `getTableModelMap`.

### 4F — Remove API Lib Files (after confirming zero consumers remain)

- [ ] Grep `api/src/` for any remaining import of `safeExtractZip` — if zero, delete `api/src/lib/safeExtractZip.ts`.
- [ ] Grep `api/src/` for any remaining import of `safeRestoreResources` — if zero, delete `api/src/lib/safeRestoreResources.ts`.
- [ ] Grep `api/src/` for any remaining import of `parseCsv` from `lib/csv` — if zero, decide whether to remove `parseCsv` from `api/src/lib/csv.ts` or leave the file intact (if `toCsv` is still needed there).

### 4G — Backup Size Estimate Skip List

- [ ] Open `api/src/routes/database.ts`, `getBackupSizeEstimate` / `walk` function (plan references line 119).
- [ ] Update the directory skip condition to exclude `"db_backups"`, `"db_backups_and_data"`, and `"db_replenish"`. Remove old names `"backups_db"` and `"backups_db_and_data"`.

### 4H — Phase 4 Compile Check

- [ ] Run TypeScript compilation for `api` — zero errors required before Phase 5.

**Commit after Phase 4:**  
Stage all changed/added/deleted files in `api/src/` from this phase.  
Suggested title: `feat: offload replenish to worker, update API to delegate and return 202`  
Body bullets: route rewrite (stage zip, call worker, 202/409/503 with cleanup); path helpers renamed to `db_` prefix; startup mkdir list updated; workerClient gains `requestWorkerReplenish`; dead restore logic and imports removed.

---

## Phase 5 — Web App Changes

**Package:** `web`  
Requires Phase 4 complete (API response shape changed).

### 5A — API Client Return Type

- [ ] Open `web/src/lib/api/database.ts`.
- [ ] Change the return type of `replenishDatabase` from `Promise<RestoreDatabaseResponse>` to `Promise<ReplenishDatabaseResponse>`.
- [ ] Update imports: add `ReplenishDatabaseResponse` from shared-types; remove `RestoreDatabaseResponse` if no longer used in this file.

### 5B — Admin Page Success Toast

- [ ] Open `web/src/app/admin/page.tsx`.
- [ ] In `handleRestoreDatabase`, replace the success toast logic that reads `response.tablesImported`, `response.totalRows`, and `response.resourceFilesRestored` with a simple acknowledgement message, e.g.: `"Restore queued. The database will be updated in the background."`.
- [ ] Remove `resourceText` and table-count composition logic.
- [ ] The `showLoading("Restoring database...")` dispatch may remain or be updated to `"Queuing restore..."` — either is correct.

### 5C — Restore Modal Label (optional but recommended)

- [ ] Open `web/src/components/modals/ModalConfirmRestore.tsx`.
- [ ] Review the `"Restoring..."` button label used during the loading state.
- [ ] Consider changing it to `"Queuing..."` to reflect the asynchronous nature. No functional change required; defer if low priority.

### 5D — Phase 5 Compile Check

- [ ] Run TypeScript compilation for `web` — zero errors required before Phase 6.

**Commit after Phase 5:**  
Stage all changed files in `web/src/` from this phase.  
Suggested title: `feat: update web app for async replenish 202 response`  
Body bullets: API client return type updated to `ReplenishDatabaseResponse`; admin page success toast simplified to async acknowledgement.

---

## Phase 6 — Tests

Complete each sub-section in order. All new tests should follow patterns in the matching sibling test file noted below.

### 6A — Move Existing API Lib Tests to Worker

- [ ] Move `api/tests/lib/safeExtractZip.test.ts` → `worker-node/tests/lib/safeExtractZip.test.ts`. Adjust import paths.
- [ ] Move `api/tests/lib/safeRestoreResources.test.ts` → `worker-node/tests/lib/safeRestoreResources.test.ts`. Adjust import paths.
- [ ] Confirm the old locations are deleted and not referenced by any test runner config.

### 6B — Update Fixture and Directory-Name References

- [ ] Grep all test files in `api/tests/` and `worker-node/tests/` for `"backups_db"` and `"backups_db_and_data"`. Update every occurrence to `"db_backups"` and `"db_backups_and_data"` respectively.
- [ ] Grep for any test setup that creates `backups_db` or `backups_db_and_data` directories — update to new names.

### 6C — Worker: `isAnyMeditationActive` Unit Tests

File: `worker-node/tests/processor/processMeditation.test.ts` (or create if absent).

- [ ] Test: `isAnyMeditationActive()` returns `false` when `activeMeditations` is empty.
- [ ] Test: `isAnyMeditationActive()` returns `true` when at least one meditation ID is in `activeMeditations`.

### 6D — Worker Route: `POST /replenish` (new test file)

File: `worker-node/tests/routes/replenish.routes.test.ts`  
Mirror pattern from `worker-node/tests/routes/backup.routes.test.ts`.

- [ ] **Codex concern #4 — mock factories:** The new test file imports the same `app` module as backup and process tests. Add Jest module mocks for all modules that `app.ts` now imports due to this feature:
  - Mock `../../src/services/replenishService` with `isReplenishRunning` returning `false` and `replenishDatabase` as a no-op by default.
  - Mock `../../src/processor/processMeditation` including **both** `isMeditationActive` and the new `isAnyMeditationActive` export (returning `false` by default).
  - Mock `../../src/services/backupService` with `isBackupRunning` returning `false` by default.
- [ ] `202` when filename is valid and file exists in `db_replenish/`.
- [ ] `409` when `isReplenishRunning()` returns `true`.
- [ ] `409` when `isBackupRunning()` returns `true` (V02 requirement).
- [ ] `409` when `isAnyMeditationActive()` returns `true` (V02 requirement).
- [ ] `400` when `filename` is missing from the request body.
- [ ] `400` when `filename` is not a string.
- [ ] `400` when `filename` contains `"/"`.
- [ ] `400` when `filename` contains `".."`.
- [ ] `400` when `filename` does not end in `".zip"`.
- [ ] `400`/`404` when the file does not exist inside `db_replenish/`.

### 6E — Worker Route: `POST /backup` (update existing tests)

File: `worker-node/tests/routes/backup.routes.test.ts`

- [ ] **Codex concern #4 — mock factories:** `app.ts` now imports `isReplenishRunning` from `replenishService` for the `/backup` guard. Update the existing mock factory (or `beforeEach`/`jest.mock` block) in this test file to also mock `../../src/services/replenishService` with `isReplenishRunning` returning `false` by default. Without this, the test file will fail to load `app.ts` after Phase 3 lands.
- [ ] **Codex concern #4 — mock factories:** `app.ts` now also imports `isAnyMeditationActive` from `processMeditation`. Update the existing `processMeditation` mock to include `isAnyMeditationActive` returning `false` by default alongside the existing exports.
- [ ] Add test: `409` when `isReplenishRunning()` returns `true` (V02 requirement).
- [ ] Confirm all existing tests still pass without modification.

### 6F — Worker Route: `POST /process` (update existing tests)

File: `worker-node/tests/routes/process.routes.test.ts`

- [ ] **Codex concern #4 — mock factories:** Same requirement as 6E. Update the existing mock factory to mock `../../src/services/replenishService` with `isReplenishRunning` returning `false` by default.
- [ ] **Codex concern #4 — mock factories:** Update the existing `processMeditation` mock to include `isAnyMeditationActive` returning `false` by default.
- [ ] Add test: `409` when `isReplenishRunning()` returns `true` (V02 requirement).
- [ ] Confirm all existing tests still pass without modification.

### 6G — Worker Service: `replenishService` Tests

File: `worker-node/tests/services/replenishService.test.ts`  
Mirror pattern from `worker-node/tests/services/backupService.test.ts`.

- [ ] Place a fixture `.zip` (with known CSV rows and a `manifest.json`) into a test `db_replenish/` directory.
- [ ] Test: `replenishDatabase(filename)` against a test database — assert all five tables truncated then repopulated with fixture data.
- [ ] Test: sequences reset to the correct max id after replenish.
- [ ] Test: for a `db_and_resources` package, resource files are written to the correct destination.
- [ ] Test: staged zip is **deleted** on success.
- [ ] Test: staged zip is **retained** (not deleted) on failure — confirming the intentional failure-path behavior from the V02 plan.
- [ ] Test: `tempDir` under `os.tmpdir()` is **always removed** on both success and failure paths (confirming the `finally`-block cleanup from Phase 3A, step 10).
- [ ] Test: `isReplenishRunning()` returns `false` after both success and failure paths.

### 6H — API Route: `POST /replenish-database` Tests

File: `api/tests/database/database.routes.test.ts`

- [ ] **Codex concern #4 — mock factories:** The rewritten handler imports `requestWorkerReplenish` from `workerClient`. Update the existing `../../src/services/workerClient` mock factory to add `requestWorkerReplenish` as a Jest mock function (resolving by default). Without this addition, the rewritten route will import an unmocked symbol and tests may throw or behave unexpectedly.
- [ ] Test: staged filename matches `replenish_<timestamp>_<uuid>.zip` format (not `Date.now()` alone) — V02 requirement.
- [ ] Test: two concurrent calls to the handler produce different staged filenames — V02 requirement.
- [ ] Test: the uploaded file is written to `db_replenish/` and `requestWorkerReplenish` is called with the correct basename.
- [ ] Test: `202` response with `{ message, queuedAt }` shape.
- [ ] Test: **no database rows are inserted or truncated** — the API must not touch the DB.
- [ ] Test: when worker client returns `WorkerConflictError` (`409`) — assert response is `409` and the staged file is **deleted** — V02 requirement.
- [ ] Test: when worker client throws unreachable error (`503`) — assert response is `503` and the staged file is **deleted** — V02 requirement.

### 6I — Full Test Suite Run

- [ ] Run the full test suite for `worker-node` — all tests pass.
- [ ] Run the full test suite for `api` — all tests pass.
- [ ] Run the full test suite for `web` — all tests pass.

**Commit after Phase 6:**  
Stage all new/changed/moved test files from this phase.  
Suggested title: `test: replenish service and route tests, V02 concurrency and cleanup assertions`  
Body bullets: new `replenish.routes.test`; `replenishService` integration test with fixture zip; backup and process route tests cover `isReplenishRunning` guard; mock factories in backup/process tests updated for new imports; API route tests assert staged-file cleanup on 409/503; moved `safeExtractZip`/`safeRestoreResources` tests to worker.

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

---

## Phase 8 — Documentation Follow-up

Complete after the code is merged and stable on the target environment.

**Codex concern #5 — frontmatter rules:** Every docs file modified in this phase is governed by the repository's AGENTS.md frontmatter rules. For each file edited below, before saving:
- Preserve `created_at` exactly as found — **never modify it**.
- Preserve `created_by` exactly as found — **never modify it**.
- Set `updated_at` to `2026-06-12` (or to the actual date of the edit if later).
- Set `modified_by` to the agent and model performing the edit, e.g. `claude (sonnet)`. One line only, no email addresses, no angle brackets, lowercase.

- [ ] Update `docs/20260515_CTO_ONBOARDING_GO_LIGHTLY.md` — architecture diagram and any backup-path notes (`backups_db` → `db_backups`). Apply frontmatter rules above.
- [ ] Update `docs/db-models/SETUP_MAC.md` — replace references to `{PATH_PROJECT_RESOURCES}/backups_db` with `db_backups`. Apply frontmatter rules above.
- [ ] Update `docs/db-models/SETUP_UBUNTU.md` — same as above. Apply frontmatter rules above.
- [ ] Review worker and API READMEs for any enumerated subdirectory names and update to `db_` convention. Apply frontmatter rules to any README that carries YAML frontmatter.

**Commit after Phase 8:**  
Stage only docs files.  
Suggested title: `docs: update directory names to db_ convention across onboarding and setup guides`
