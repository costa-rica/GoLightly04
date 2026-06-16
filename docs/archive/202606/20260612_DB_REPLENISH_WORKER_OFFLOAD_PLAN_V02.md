---
created_at: 2026-06-12
updated_at: 2026-06-12
created_by: claude (sonnet-4.6)
modified_by: claude (sonnet-4.6)
---

# Plan: Database Replenish Worker Offload + `db_` Directory Convention (V02)

> Revision of V01 addressing three Codex assessment concerns:
> (1) worker-wide maintenance concurrency across replenish / backup / process,
> (2) collision-resistant staged filenames, and
> (3) staged-file cleanup when the worker does not accept the job.

---

## 1. Problem and Scope

`POST /database/replenish-database` is the last heavy database operation that runs synchronously inside a user-facing API request. The route receives a multipart upload, extracts the archive, truncates five tables, bulk-inserts CSV rows, restores resource files, and resets Postgres sequences — all before responding. This ties up the API event loop for the full restore duration and cannot handle files too large to stream through the browser.

This plan describes how to:

1. Move the entire restore workload into `worker-node`, mirroring the existing backup offload pattern.
2. Standardize all DB-related `project_resources` subdirectories under a `db_` prefix.
3. *(New in V02)* Add a worker-wide maintenance lock so replenish, backup, and active meditation processing cannot overlap.
4. *(New in V02)* Use collision-resistant staged filenames.
5. *(New in V02)* Clean up orphaned staged files when the worker does not accept a job.

The API's public endpoint path (`/database/replenish-database`) and the web app's multipart upload call are unchanged. The contract change is the response: `200` with detailed results becomes `202` with an asynchronous acknowledgement.

---

## 2. Architecture

### 2.1 Current state

```
Browser  →  POST /database/replenish-database (multipart)
              └─ API: extract zip → validate manifest → restore resources
                    → TRUNCATE tables → bulkCreate rows → reset sequences
                    → respond 200 { tablesImported, rowsImported, totalRows, ... }
```

Everything runs in the request/response cycle. The API is both the uploader and the restore engine.

### 2.2 Target state

```
Phase 1 — web-app flow (this implementation):

Browser  →  POST /database/replenish-database (multipart)
              └─ API: write zip to db_replenish/<collision-resistant name>.zip
                    → POST /replenish { filename } to worker-node
                    → on 202: respond 202 { message: "Replenish queued" }
                    → on 409 or 503: delete staged file, propagate error

Worker (background):
  extract zip → validate manifest → restore resources
  → TRUNCATE tables → bulkCreate rows → reset sequences
  → delete staged zip → log result

Phase 2 — large-file flow (enabled, tool out of scope):

External process places <file>.zip in db_replenish/
  → caller issues POST /replenish { filename } directly to worker-node
  → same background restore
```

The API becomes a thin save-and-delegate layer. The worker holds all restore logic.

### 2.3 Worker-wide maintenance concurrency lock

**V01 gap:** V01 only guarded against concurrent replenish jobs via `isReplenishRunning()`. This is insufficient: `/backup` only checks `isBackupRunning()`, so a backup and replenish can overlap. `/process` checks only whether a specific meditation ID is already active, so new meditation jobs can start while the database is being truncated.

**V02 design:** Introduce a cross-endpoint maintenance check on every state-changing route:

| When this endpoint is called … | … it is blocked by: |
|-------------------------------|---------------------|
| `POST /replenish` | `isReplenishRunning()` OR `isBackupRunning()` OR `isAnyMeditationActive()` |
| `POST /backup` | `isReplenishRunning()` (existing `isBackupRunning()` guard unchanged) |
| `POST /process` | `isReplenishRunning()` (existing dedup guard unchanged, checked afterwards) |

All conflict responses return `409` with a descriptive `error` string indicating which operation is blocking.

#### 2.3.1 New helper: `isAnyMeditationActive()`

`processMeditation.ts` maintains a module-level `activeMeditations: Set<number>`. The existing exported `isMeditationActive(meditationId)` checks membership for a single ID. Add a second export:

```ts
export function isAnyMeditationActive(): boolean {
  return activeMeditations.size > 0;
}
```

This requires no new state — it reads the same `Set`. Both functions are exported from `processMeditation.ts` and imported in `app.ts`.

#### 2.3.2 Updated `app.ts` route guards (conceptual pseudocode)

```
POST /replenish:
  if isReplenishRunning()       → 409 "A replenish job is already running"
  if isBackupRunning()          → 409 "A backup job is running; replenish cannot start"
  if isAnyMeditationActive()    → 409 "Active meditation processing; replenish cannot start"
  validate filename → 400 if invalid
  202 + fire-and-forget replenishDatabase(filename)

POST /backup (modified):
  if isReplenishRunning()       → 409 "A replenish job is running; backup cannot start"
  if isBackupRunning()          → 409 "A backup job is already running"  (existing)
  202 + fire-and-forget createBackup(...)

POST /process (modified):
  if isReplenishRunning()       → 409 "A replenish job is running; processing cannot start"
  … existing meditationId validation and dedup checks …
  202 + fire-and-forget processMeditation(...)
```

The order matters: replenish check comes first on `/backup` and `/process` so that a maintenance window is enforced at the earliest possible point.

---

## 3. Directory Convention

All DB-related `project_resources` subdirectories adopt a `db_` prefix. Non-DB resource directories are unchanged.

| Current name          | New name              | Purpose                                      |
|-----------------------|-----------------------|----------------------------------------------|
| `backups_db`          | `db_backups`          | DB-only backups (zip, no resources)          |
| `backups_db_and_data` | `db_backups_and_data` | DB + resource-file backups (primary)         |
| _(new)_               | `db_replenish`        | Inbound `.zip` files staged for restore      |

This rename is a clean cut-over with no dual-read fallback. An ops `mv` step must accompany the deploy (see §9).

---

## 4. Shared-Types (`shared-types/src/database.ts`)

Two types are added:

- **`ReplenishRequest`** — the worker endpoint's request body: `{ filename: string }`. Filename is a basename only; the worker resolves it within `db_replenish/`.
- **`ReplenishDatabaseResponse`** — the API's `202` response body to the browser: `{ message: string; queuedAt: string }`. Mirrors the shape of `CreateBackupResponse`.

`RestoreDatabaseResponse` remains in the file; it represents the terminal state the worker logs but no longer sends to the browser. It can serve as the internal logging payload type in `replenishService.ts`.

---

## 5. Worker-Node Changes

### 5.1 Path helper — `worker-node/src/lib/projectPaths.ts`

- Rename the directory strings inside `getBackupsPath` and `getFullBackupsPath` to `db_backups` and `db_backups_and_data` respectively.
- Add `getDbReplenishPath(...segments: string[])` returning `path.join(getRoot(), "db_replenish", ...segments)`. The naming mirrors `getBackupsPath` and `getFullBackupsPath`.

### 5.2 Restore helpers migrated from API

The API currently owns three helpers that the worker will need:

| API source file                       | Migration action                                           |
|---------------------------------------|------------------------------------------------------------|
| `api/src/lib/safeExtractZip.ts`       | Move to `worker-node/src/lib/safeExtractZip.ts`           |
| `api/src/lib/safeRestoreResources.ts` | Move to `worker-node/src/lib/safeRestoreResources.ts`     |
| `api/src/lib/csv.ts` (`parseCsv`)     | Add `parseCsv` to `worker-node/src/lib/csv.ts`            |

"Move" means deleting from `api/src/lib` once the API no longer imports them. `parseCsv` is added to the worker's existing `csv.ts` alongside `toCsv`; the two functions are complementary.

`safeRestoreResources.ts` contains a module-level `EXCLUDED_RESTORE_DIRS` constant. After migration, this list must be updated to the new names plus the new staging directory: `["db_backups", "db_backups_and_data", "db_replenish"]`. Excluding `db_replenish` from resource restoration prevents staged inbound archives from being written back during a restore.

The inline helpers from `api/src/routes/database.ts` that support restore — `TABLE_ORDER`, `DATE_FIELDS`, `JSON_FIELDS`, `normalizeRestoreRow`, `resetTableIdSequence`, `isValidManifest`, `getTableModelMap` — are moved into `replenishService.ts` in the worker, not into a shared location, because they are now only used there.

### 5.3 Backup service — `worker-node/src/services/backupService.ts`

Two constants reference the old directory names and must be updated:

- **`EXCLUDED_BACKUP_DIRS`** (line 22): `new Set(["backups_db", "backups_db_and_data"])` → `new Set(["db_backups", "db_backups_and_data", "db_replenish"])`. Adding `db_replenish` prevents staged inbound archives from being swept into a backup.
- **Manifest `excluded_dirs`** (line 133): the array literal inside `createBackup` that writes the manifest must change to match: `["db_backups", "db_backups_and_data", "db_replenish"]`.

### 5.4 Active-meditation helper — `worker-node/src/processor/processMeditation.ts`

Add a second export alongside the existing `isMeditationActive`:

```ts
export function isAnyMeditationActive(): boolean {
  return activeMeditations.size > 0;
}
```

No new state is introduced. Both helpers read the existing module-level `activeMeditations: Set<number>`.

### 5.5 New service — `worker-node/src/services/replenishService.ts`

Exports:

- **`isReplenishRunning(): boolean`** — reads the module-level `_isReplenishRunning` flag. Follows the identical pattern as `isBackupRunning()` in `backupService.ts`.
- **`replenishDatabase(filename: string): Promise<void>`** — the restore pipeline:
  1. Set `_isReplenishRunning = true`.
  2. Resolve full path: `getDbReplenishPath(filename)`.
  3. Create a temp directory: `fsPromises.mkdtemp(path.join(os.tmpdir(), "golightly04_restore_"))`.
  4. `safeExtractZip(zipPath, tempDir)`.
  5. Read and validate `manifest.json`; if `package_type === "db_and_resources"`, call `safeRestoreResources(tempDir, loadEnv().PATH_PROJECT_RESOURCES)`.
  6. Open a single Sequelize transaction via `getDb().sequelize.transaction(...)`:
     a. `TRUNCATE` all tables in reverse `TABLE_ORDER` with `CASCADE`.
     b. For each table in `TABLE_ORDER`, read `<tableName>.csv`, `parseCsv`, apply `normalizeRestoreRow`, then `bulkCreate` with `{ validate: false }`.
     c. Call `resetTableIdSequence` for each table inside the same transaction.
  7. Clean up `tempDir` and delete the staged zip (delete-on-success; see §8 Risks).
  8. Log a structured success entry (start, success, or failure) per `docs/LOGGING_NODE_JS_V08.md`.
  9. In a `finally` block, set `_isReplenishRunning = false`.

  Uses `getDb()` from `worker-node/src/lib/db.ts`, `loadEnv()` from `worker-node/src/config/env.ts`, and the migrated helpers above.

### 5.6 App route — `worker-node/src/app.ts`

#### `POST /replenish` (new)

Register adjacent to `POST /backup`. Check order:

```
POST /replenish
  body: { filename: string }
  → 409 if isReplenishRunning()       ("A replenish job is already running")
  → 409 if isBackupRunning()          ("A backup job is running; replenish cannot start")
  → 409 if isAnyMeditationActive()    ("Active meditation processing; replenish cannot start")
  → 400 if filename missing, not a string, contains "/" or ".." (path-traversal guard),
         does not end in ".zip", or the resolved path does not exist inside db_replenish/
  → 202 { accepted: true }
      void replenishDatabase(filename).catch((e) => logger.error(...))
```

The path-traversal guard resolves `getDbReplenishPath(filename)` and verifies that the resolved path starts with the `db_replenish` root prefix and that the file exists (`fs.existsSync`).

Import additions: `isReplenishRunning`, `replenishDatabase` from `./services/replenishService`; `isAnyMeditationActive` from `./processor/processMeditation`.

#### `POST /backup` (modified)

Add a replenish check at the top of the existing handler, before the `isBackupRunning()` check:

```
→ 409 if isReplenishRunning()   ("A replenish job is running; backup cannot start")
→ 409 if isBackupRunning()      (existing guard, unchanged)
→ 202 + fire-and-forget         (unchanged)
```

Import addition: `isReplenishRunning` from `./services/replenishService`.

#### `POST /process` (modified)

Add a replenish check at the top of the existing handler, before any other checks:

```
→ 409 if isReplenishRunning()   ("A replenish job is running; processing cannot start")
… existing meditationId validation, isMeditationActive dedup, status eligibility checks …
→ 202 + fire-and-forget         (unchanged)
```

Import addition: `isReplenishRunning` from `./services/replenishService`.

### 5.7 Worker startup directory guarantee

The worker must ensure `db_replenish` exists before it begins serving requests. Add `fs.mkdirSync(getDbReplenishPath(), { recursive: true })` in the worker's `onStartUp.ts` (or equivalent startup hook) alongside any existing directory creation.

---

## 6. API Changes

### 6.1 Path helper — `api/src/lib/projectPaths.ts`

- `getBackupsPath()` → directory string changes to `db_backups`.
- `getFullBackupsPath()` → directory string changes to `db_backups_and_data`.
- Add `getDbReplenishPath(...segments: string[])` returning `getProjectResourcePath("db_replenish", ...segments)`. Follows the existing pattern.

### 6.2 Startup — `api/src/startup/onStartUp.ts`

The `for...of` loop that `mkdirSync`s resource directories (lines 16–23) currently lists `"backups_db"`. Change to:

```
"db_backups", "db_backups_and_data", "db_replenish"
```

`db_backups_and_data` was already expected on disk (used by the backup route) but was not in the startup list; this is the opportunity to add it. `db_replenish` is new.

### 6.3 Worker client — `api/src/services/workerClient.ts`

Add `requestWorkerReplenish({ filename: string }): Promise<void>` mirroring `requestWorkerBackup`:

- `POST ${env.URL_WORKER_NODE}/replenish` with `Content-Type: application/json` body `{ filename }`.
- Retry loop: 3 attempts, 200 ms / 400 ms backoff.
- `409` → throw `WorkerConflictError` immediately (no retry).
- Non-OK non-409 → retry; after 3 failures, throw unreachable error.

### 6.4 Route — `api/src/routes/database.ts`, `POST /replenish-database`

Replace the existing handler body entirely:

1. Keep `uploadLarge.single("file")` multer middleware — the file still arrives as a multipart upload.

2. **Generate a collision-resistant staged filename** *(V02 change)*:

   ```ts
   import { randomUUID } from "crypto";
   // …
   const ts = new Date().toISOString().replace(/[-:.]/g, "").replace("T", "_").replace("Z", "");
   const stagedFilename = `replenish_${ts}_${randomUUID()}.zip`;
   ```

   Using `Date.now()` alone (as in V01) can collide when two uploads arrive within the same millisecond or when a retry re-stages a file. The UUID suffix makes every staged filename globally unique.

3. Move the uploaded temp file from `req.file.path` to `getDbReplenishPath(stagedFilename)` using `fsPromises.rename` (same-volume move) or `fsPromises.copyFile` + `rm` if volumes differ.

4. Call `requestWorkerReplenish({ filename: stagedFilename })`.

5. **Staged-file cleanup on delegation failure** *(V02 change)*:
   - On success (`202` from worker): `res.status(202).json({ message: "Replenish queued", queuedAt: new Date().toISOString() })`. Leave the staged file; the worker owns it and will delete it on success.
   - On `WorkerConflictError` (`409`): **delete the staged file** (`fsPromises.rm(stagedPath, { force: true })`), then respond `res.status(409).json({ error: "A replenish job is already running" })`.
   - On worker unreachable (`503`): **delete the staged file**, then respond `res.status(503).json({ error: "Worker unavailable; replenish could not be started" })`.

   Cleanup must occur in the catch branch for each failure case. The staged file is intentionally left only when the worker returns `202` and owns the restore job.

6. In a `finally` block: `rm(req.file.path, { force: true })` to clean up any remaining multer temp file (this is a no-op if the `rename` succeeded).

**Imports to remove from the route file** (after confirming no other consumers in the file): `os`, `Transaction` type, `getDb` (if the replenish block was its only use in this route — verify), `parseCsv`, `safeExtractZip`, `safeRestoreResources`. Also remove `TABLE_ORDER`, `DATE_FIELDS`, `JSON_FIELDS`, `normalizeRestoreRow`, `resetTableIdSequence`, `isValidManifest`, `getTableModelMap` which were defined inline.

**Imports to add**: `randomUUID` from `"crypto"`, `getDbReplenishPath` from `../lib/projectPaths`, `requestWorkerReplenish` from `../services/workerClient`.

### 6.5 Backup size estimate — `api/src/routes/database.ts`, `getBackupSizeEstimate`

The `walk` function (line 119) hard-codes the directory names to skip. Update the skip condition to `"db_backups"`, `"db_backups_and_data"`, and add `"db_replenish"` so staged archives do not inflate the estimate.

---

## 7. Web App Changes

### 7.1 API client — `web/src/lib/api/database.ts`

`replenishDatabase` currently returns `Promise<RestoreDatabaseResponse>`. Change the return type to `Promise<ReplenishDatabaseResponse>` (the new shared type), which has shape `{ message: string; queuedAt: string }`.

### 7.2 Admin page — `web/src/app/admin/page.tsx`

`handleRestoreDatabase` currently reads `response.tablesImported`, `response.totalRows`, and `response.resourceFilesRestored` to compose the success toast. Replace with a simpler acknowledgement message (e.g., "Restore queued. The database will be updated in the background."). The `resourceText` and table-count logic are removed.

The `showLoading("Restoring database...")` dispatch label may remain or be updated to "Queuing restore..." — either is correct. The loading spinner resolves as soon as the API returns `202`, not when the restore completes.

### 7.3 Modal — `web/src/components/modals/ModalConfirmRestore.tsx`

The button label `"Restoring..."` during the loading state is technically still accurate (the upload is in progress). No functional change is required, but consider updating the label to `"Queuing..."` to reflect the new asynchronous nature.

---

## 8. Risks and Mitigations

**Destructive operation with network trust.** The new `POST /replenish` endpoint performs a full database truncation/restore without authentication, consistent with the existing worker endpoints. Mitigation: both services run on a private network; `db_replenish/` is server-local and its files are created by the API, not exposed publicly. A path-traversal guard prevents arbitrary file access. Worker auth can be layered on uniformly across all endpoints as a future step.

**Lower failure visibility (fire-and-forget).** The API returns `202` before the worker begins the restore; a failure in the worker is invisible to the browser. Mitigation: structured start/success/failure logging in `replenishService.ts` per `docs/LOGGING_NODE_JS_V08.md`; the pre-restore state is recoverable by re-uploading. A status endpoint can be added later if operations need visibility into in-flight runs.

**Staged zip lifecycle.** After a successful restore the archive is deleted by the worker (inside `replenishDatabase`, after the transaction commits, before the `finally` block). On failure the zip is retained in `db_replenish/` to allow manual retry. Orphaned files from rejected-at-API scenarios (409 / 503) are deleted by the API route handler before responding (see §6.4). This bounds disk growth under normal operation while preserving the artifact only when a restore fails inside the worker.

**Staged filename collision.** Using `Date.now()` alone risks a collision if two uploads arrive within the same millisecond. V02 uses `<iso-timestamp>_<UUID>.zip` which is globally unique. The worker validates the basename and rejects filenames containing path separators, `..`, or not ending in `.zip`.

**Partial restore on mid-transaction failure.** The truncate + bulk-insert run in a single Sequelize transaction, so a failure rolls back to the pre-replenish state. This behavior is preserved exactly when porting the transaction block to the worker; no changes to the transaction structure are planned.

**Active meditation interrupted by replenish.** Because `/process` now rejects with `409` while replenish is running, any meditation submitted during the replenish window will be turned away. The calling API must propagate this as a retriable error to the browser. Meditations that were already active before replenish started are waited on (replenish itself will not be accepted while any meditation is active), so no in-flight job is disrupted.

**Deploy ordering.** The worker's `POST /replenish` endpoint must be live before the API begins delegating to it. Deploy worker-node first (or simultaneously), then API. Rolling back only the API to the synchronous version is safe — the worker endpoint is additive. The directory rename `mv` must run as part of the same deploy window.

---

## 9. Operations Runbook Impact

A one-time step must run under `PATH_PROJECT_RESOURCES` on each server during the deploy:

```bash
cd "$PATH_PROJECT_RESOURCES"
mv backups_db          db_backups
mv backups_db_and_data db_backups_and_data
mkdir -p db_replenish
```

Existing `.zip` backup archives move with their parent directories — no data loss. The directory rename is a cut-over with no dual-read fallback; if the `mv` step runs after the code deploy, the API and worker will fail to locate backup files until the rename completes. The `mv` must complete before or simultaneously with the service restart.

---

## 10. Assumptions

- The worker and API share access to the same `PATH_PROJECT_RESOURCES` filesystem path (they run on the same host or a shared volume). This is already assumed by the existing backup flow.
- The `unzipper` npm package (used by `safeExtractZip`) is available or can be added to `worker-node`'s `package.json` if it is not already a dependency there.
- The worker's startup file (`worker-node/src/startup/onStartUp.ts`) is an appropriate place to add directory creation for `db_replenish`.
- `parseCsv` in `api/src/lib/csv.ts` is not consumed by any other API module besides `database.ts`. If other consumers exist, `parseCsv` should be duplicated in the worker rather than removed from the API.
- `safeExtractZip` and `safeRestoreResources` in `api/src/lib` are not consumed outside of `database.ts`. If other consumers exist, they should be duplicated rather than moved.
- The multer temp file and the staged `db_replenish/` file may reside on the same filesystem, making `fsPromises.rename` a safe atomic move. If not (e.g., different volumes), use `copyFile` + `rm`.
- The `crypto` module's `randomUUID` is available in the Node.js version in use (available since Node 14.17).

---

## 11. Validation Strategy

### Unit and integration tests

**Worker processor** (`worker-node/src/processor/processMeditation.ts`):
- `isAnyMeditationActive()` returns `false` when no meditations are in flight.
- `isAnyMeditationActive()` returns `true` when at least one meditation ID is in `activeMeditations`.

**Worker route — `POST /replenish`** (`worker-node/tests/routes/replenish.routes.test.ts`, mirroring `backup.routes.test.ts`):
- `202` when filename is valid and file exists in `db_replenish/`.
- `409` when `isReplenishRunning()` returns `true`.
- `409` when `isBackupRunning()` returns `true` *(new in V02)*.
- `409` when `isAnyMeditationActive()` returns `true` *(new in V02)*.
- `400` when `filename` is missing, not a string, contains path separators or `..`, or does not end in `.zip`.
- `400` / `404` when the file does not exist in `db_replenish/`.

**Worker route — `POST /backup`** (update `worker-node/tests/routes/backup.routes.test.ts`):
- `409` when `isReplenishRunning()` returns `true` *(new in V02)*.
- Existing tests unchanged.

**Worker route — `POST /process`** (update `worker-node/tests/routes/process.routes.test.ts`):
- `409` when `isReplenishRunning()` returns `true` *(new in V02)*.
- Existing tests unchanged.

**Worker service** (`worker-node/tests/services/replenishService.test.ts`, mirroring `backupService.test.ts`):
- Place a fixture `.zip` (with known CSV rows and a manifest) into a test `db_replenish/` directory.
- Call `replenishDatabase(filename)` against a test database.
- Assert that all five tables are truncated then repopulated with fixture data.
- Assert sequences reset to the correct max id.
- For a `db_and_resources` package, assert resource files are written to the correct destination.
- Assert the staged zip is deleted on success and retained on failure.
- Assert `isReplenishRunning()` is `false` after both success and failure paths.

**API route** (`api/tests/database/database.routes.test.ts`):
- `POST /replenish-database` with a multipart upload:
  - Assert the staged file has the `replenish_<timestamp>_<uuid>.zip` shape (not `Date.now()` alone) *(new in V02)*.
  - Assert no two concurrent calls produce the same staged filename *(new in V02)*.
  - Assert the file is written to `db_replenish/` and `requestWorkerReplenish` is called with the correct filename.
  - Assert `202` response with `{ message, queuedAt }`.
  - Assert **no database rows are inserted or truncated** (the API must not touch the DB).
- When worker client returns `WorkerConflictError` (`409`): assert `409` and assert the staged file is **deleted** *(new in V02)*.
- When worker client throws unreachable error (`503`): assert `503` and assert the staged file is **deleted** *(new in V02)*.

**Fixture and directory-name updates**:
- Any test that references `backups_db` or `backups_db_and_data` (in setup helpers, fixture paths, or assertions) must be updated to `db_backups` and `db_backups_and_data`.
- The existing `api/tests/lib/safeExtractZip.test.ts` and `api/tests/lib/safeRestoreResources.test.ts` move to `worker-node/tests/lib/` after the helpers migrate.

### Manual validation

- Upload a `.zip` backup through the admin UI; confirm the browser receives the `202` toast immediately.
- Confirm the worker log shows start, success, and final row counts.
- Confirm the database reflects the restored data.
- Confirm `db_replenish/` is empty after a successful restore.
- Trigger a second upload while a restore is in progress; confirm the UI receives a `409`.
- Start a backup, then attempt a replenish; confirm the replenish returns `409`.
- Start a meditation processing job, then attempt a replenish; confirm the replenish returns `409`.
- Simulate a worker-unavailable scenario; confirm the staged file is not left in `db_replenish/`.

### Documentation updates (follow-up after code lands)

- `docs/20260515_CTO_ONBOARDING_GO_LIGHTLY.md` — architecture diagram and backup-path notes.
- `docs/db-models/SETUP_MAC.md`, `docs/db-models/SETUP_UBUNTU.md` — references to `{PATH_PROJECT_RESOURCES}/backups_db`.
- Worker and API READMEs if they enumerate subdirectory names.
