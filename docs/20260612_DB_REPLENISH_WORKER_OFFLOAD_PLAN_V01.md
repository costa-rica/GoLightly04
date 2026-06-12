---
created_at: 2026-06-12
updated_at: 2026-06-12
created_by: claude (sonnet-4.6)
modified_by: claude (sonnet-4.6)
---

# Plan: Database Replenish Worker Offload + `db_` Directory Convention

## 1. Problem and Scope

`POST /database/replenish-database` is the last heavy database operation that runs synchronously inside a user-facing API request. The route receives a multipart upload, extracts the archive, truncates five tables, bulk-inserts CSV rows, restores resource files, and resets Postgres sequences — all before responding. This ties up the API event loop for the full restore duration and cannot handle files too large to stream through the browser.

This plan describes how to:

1. Move the entire restore workload into `worker-node`, mirroring the existing backup offload pattern.
2. Standardize all DB-related `project_resources` subdirectories under a `db_` prefix.

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
              └─ API: write zip to db_replenish/<timestamp>.zip
                    → POST /replenish { filename } to worker-node
                    → respond 202 { message: "Replenish queued" }

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

### 2.3 Worker concurrency guard

A module-level `_isReplenishRunning` boolean in `replenishService.ts` prevents concurrent restores. The worker returns `409` when it is already running. The API propagates this as its own `409`. The rational for an in-memory flag (rather than the `jobs_queue` table) is that the table itself is truncated mid-replenish and therefore cannot track the replenish job's own status.

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

| API source file                      | Migration action                                          |
|--------------------------------------|-----------------------------------------------------------|
| `api/src/lib/safeExtractZip.ts`      | Move to `worker-node/src/lib/safeExtractZip.ts`          |
| `api/src/lib/safeRestoreResources.ts`| Move to `worker-node/src/lib/safeRestoreResources.ts`    |
| `api/src/lib/csv.ts` (`parseCsv`)    | Add `parseCsv` to `worker-node/src/lib/csv.ts`           |

"Move" means deleting from `api/src/lib` once the API no longer imports them. `parseCsv` is added to the worker's existing `csv.ts` alongside `toCsv`; the two functions are complementary.

`safeRestoreResources.ts` contains a module-level `EXCLUDED_RESTORE_DIRS` constant. After migration, this list must be updated to the new names plus the new staging directory: `["db_backups", "db_backups_and_data", "db_replenish"]`. Excluding `db_replenish` from resource restoration prevents staged inbound archives from being written back during a restore.

The inline helpers from `api/src/routes/database.ts` that support restore — `TABLE_ORDER`, `DATE_FIELDS`, `JSON_FIELDS`, `normalizeRestoreRow`, `resetTableIdSequence`, `isValidManifest`, `getTableModelMap` — are moved into `replenishService.ts` in the worker, not into a shared location, because they are now only used there.

### 5.3 Backup service — `worker-node/src/services/backupService.ts`

Two constants reference the old directory names and must be updated:

- **`EXCLUDED_BACKUP_DIRS`** (line 22): `new Set(["backups_db", "backups_db_and_data"])` → `new Set(["db_backups", "db_backups_and_data", "db_replenish"])`. Adding `db_replenish` prevents staged inbound archives from being swept into a backup.
- **Manifest `excluded_dirs`** (line 133): the array literal inside `createBackup` that writes the manifest must change to match: `["db_backups", "db_backups_and_data", "db_replenish"]`.

### 5.4 New service — `worker-node/src/services/replenishService.ts`

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

### 5.5 App route — `worker-node/src/app.ts`

Register `POST /replenish` adjacent to `POST /backup`, following the identical structure:

```
POST /replenish
  body: { filename: string }
  → 400 if filename missing, not a string, contains "/" or ".." (path-traversal guard),
         or the resolved path does not exist inside db_replenish/
  → 409 if isReplenishRunning()
  → 202 { accepted: true }
      void replenishDatabase(filename).catch((e) => logger.error(...))
```

The path-traversal guard resolves `getDbReplenishPath(filename)` and verifies that the resolved path starts with the `db_replenish` root prefix and that the file exists (`fs.existsSync`). This is a slightly stronger guard than the backup route because the filename comes from a caller (API or external tool) rather than being generated internally.

### 5.6 Worker startup directory guarantee

The worker must ensure `db_replenish` exists before it begins serving requests. Identify where the worker bootstraps (its `index.ts` or `server.ts` entry point) and add an `fs.mkdirSync(getDbReplenishPath(), { recursive: true })` call there, alongside any existing directory creation. If no such startup block exists, create one.

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
2. Generate a timestamped filename: `replenish_${Date.now()}.zip`.
3. Move (or copy) the uploaded temp file from `req.file.path` to `getDbReplenishPath(timestampedFilename)` using `fsPromises.rename` (same-volume move) or `fsPromises.copyFile` + `rm` if volumes differ.
4. Call `requestWorkerReplenish({ filename: timestampedFilename })`.
5. On success: `res.status(202).json({ message: "Replenish queued", queuedAt: new Date().toISOString() })`.
6. On `WorkerConflictError`: `res.status(409).json({ error: "A replenish job is already running" })`.
7. On worker unreachable: `res.status(503).json({ error: "Worker unavailable; replenish could not be started" })`.
8. In a `finally` block: `rm(req.file.path, { force: true })` to clean up any remaining multer temp file (the staged copy in `db_replenish/` is intentionally retained for the worker).

**Imports to remove from the route file** (after confirming no other consumers in the file): `os`, `Transaction` type, `getDb` (if the replenish block was its only use in this route — verify), `parseCsv`, `safeExtractZip`, `safeRestoreResources`. Also remove `TABLE_ORDER`, `DATE_FIELDS`, `JSON_FIELDS`, `normalizeRestoreRow`, `resetTableIdSequence`, `isValidManifest`, `getTableModelMap` which were defined inline.

**Import to add**: `getDbReplenishPath` from `../lib/projectPaths`, `requestWorkerReplenish` from `../services/workerClient`.

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

**Staged zip lifecycle.** After a successful restore the archive remains in `db_replenish/` until cleaned up. Strategy: delete the staged zip on success inside `replenishService.ts` (in the happy-path branch, after the transaction commits). On failure, retain the zip to allow a manual retry. This bounds disk growth under normal operation while preserving the artifact when a restore fails.

**Partial restore on mid-transaction failure.** The truncate + bulk-insert run in a single Sequelize transaction, so a failure rolls back to the pre-replenish state. This behavior is preserved exactly when porting the transaction block to the worker; no changes to the transaction structure are planned.

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
- The worker's entry point (index or server file) is an appropriate place to add startup directory creation; if the worker has no existing startup hook, a small one must be created.
- `parseCsv` in `api/src/lib/csv.ts` is not consumed by any other API module besides `database.ts`. If other consumers exist, `parseCsv` should be duplicated in the worker rather than removed from the API.
- `safeExtractZip` and `safeRestoreResources` in `api/src/lib` are not consumed outside of `database.ts`. If other consumers exist, they should be duplicated rather than moved.
- The multer temp file and the staged `db_replenish/` file may reside on the same filesystem, making `fsPromises.rename` a safe atomic move. If not (e.g., different volumes), use `copyFile` + `rm`.

---

## 11. Validation Strategy

### Unit and integration tests

**Worker route** (`worker-node/tests/routes/replenish.routes.test.ts`, mirroring `backup.routes.test.ts`):
- `202` when filename is valid and file exists in `db_replenish/`.
- `409` when `isReplenishRunning()` returns `true`.
- `400` when `filename` is missing, not a string, or contains path separators or `..`.
- `400` / `404` when the file does not exist in `db_replenish/`.

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
  - Assert the file is written to `db_replenish/` with a timestamped name.
  - Assert `requestWorkerReplenish` is called with the correct filename.
  - Assert `202` response with `{ message, queuedAt }`.
  - Assert **no database rows are inserted or truncated** (the API must not touch the DB).
- When worker client returns `WorkerConflictError`: assert `409`.
- When worker client throws unreachable error: assert `503`.

**Fixture and directory-name updates**:
- Any test that references `backups_db` or `backups_db_and_data` (in setup helpers, fixture paths, or assertions) must be updated to `db_backups` and `db_backups_and_data`.
- The existing `api/tests/lib/safeExtractZip.test.ts` and `api/tests/lib/safeRestoreResources.test.ts` move to `worker-node/tests/lib/` after the helpers migrate.

### Manual validation

- Upload a `.zip` backup through the admin UI; confirm the browser receives the `202` toast immediately.
- Confirm the worker log shows start, success, and final row counts.
- Confirm the database reflects the restored data.
- Confirm `db_replenish/` is empty after a successful restore.
- Trigger a second upload while a restore is in progress; confirm the UI receives a `409`.

### Documentation updates (follow-up after code lands)

- `docs/20260515_CTO_ONBOARDING_GO_LIGHTLY.md` — architecture diagram and backup-path notes.
- `docs/db-models/SETUP_MAC.md`, `docs/db-models/SETUP_UBUNTU.md` — references to `{PATH_PROJECT_RESOURCES}/backups_db`.
- Worker and API READMEs if they enumerate subdirectory names.
