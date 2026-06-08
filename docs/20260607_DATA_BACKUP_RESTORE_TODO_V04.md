---
created_at: 2026-06-07
updated_at: 2026-06-07
created_by: claude (sonnet-4.6)
modified_by: claude (sonnet-4.6)
---

# GoLightly04 Data Backup & Restore — TODO V04

Source plan: [[20260607_DATA_BACKUP_RESTORE_PLAN_V04]]
Source PRD: [[20260607_DATA_BACKUP_RESTORE_PRD]]
Supersedes: [[20260607_DATA_BACKUP_RESTORE_TODO_V03]]
Codex assessments incorporated:
  [[20260607_DATA_BACKUP_RESTORE_PLAN_V02_ASSESSMENT_CODEX]]
  [[20260607_DATA_BACKUP_RESTORE_TODO_V02_ASSESSMENT_CODEX]]
  [[20260607_DATA_BACKUP_RESTORE_PLAN_V03_ASSESSMENT_CODEX]]
  [[20260607_DATA_BACKUP_RESTORE_TODO_V03_ASSESSMENT_CODEX]]

---

## Changes from V03

| V03 defect | Phase | V04 correction |
|---|---|---|
| `safeExtractZip` logger import resolves to a non-existent path `./logger` | 5c | Import logger as `../config/logger` — the API logger is at `api/src/config/logger.ts`; a file under `api/src/lib/` must use one level up |

All V03 fixes are preserved: safeExtractZip streaming helper (5c), traversal
safety tests (5f), worker acceptance propagation (5b, 5c), lstat backup walk
(3c), manifest validation (5c), safeRestoreResources (5c), disk-upload multer
(5a), restore confirmation modal (6b), and all test tasks.

---

## How to use this TODO

Work through each phase in order. At the end of every phase, run the validation
commands listed under that phase. If type-check, tests, or build fails, fix
before moving on. After validation passes, commit all changes for that phase
following commit-message guidance in AGENTS.md.

---

## Phase 1 — Path Helpers

Foundational path changes. All later phases depend on these.

- [ ] In `api/src/lib/projectPaths.ts`: add `getFullBackupsPath(...segments:
      string[]): string` returning
      `getProjectResourcePath("backups_db_and_data", ...segments)`.
- [ ] In `worker-node/src/lib/projectPaths.ts`: add `getFullBackupsPath(...
      segments: string[]): string` returning
      `path.join(getRoot(), "backups_db_and_data", ...segments)`.
- [ ] Do **not** remove or modify `getBackupsPath` in either file.

**Validate:**
```bash
cd api && npm run typecheck
cd worker-node && npm run typecheck
```

**Commit after phase:** `feat: add getFullBackupsPath helper to api and worker-node`

---

## Phase 2 — Shared-Types

- [ ] In `shared-types/src/database.ts`:
  - Add `CreateBackupRequest = { includeResources: boolean }`.
  - Replace `CreateBackupResponse` with `{ message: string; queuedAt: string }`.
  - Add `ManifestFile` type (fields: `created_at`, `app`, `environment`,
    `package_type: "db_only" | "db_and_resources"`, `database_tables`,
    `resources_root`, `excluded_dirs`).
  - Add `resourcesRestored: boolean` and `resourceFilesRestored: number` to
    `RestoreDatabaseResponse`.
  - Add `BackupSizeEstimateResponse = { totalBytes: number; totalBytesFormatted:
    string }` (needed for optional Phase 7).
- [ ] Export all new types from `shared-types/src/index.ts` (check existing
  export pattern and follow it).
- [ ] Rebuild shared-types: `cd shared-types && npm run build`.

**Validate:**
```bash
cd shared-types && npm run typecheck && npm run build
cd api && npm run typecheck
cd worker-node && npm run typecheck
cd web && npm run typecheck
```

**Commit after phase:** `feat: update shared-types for backup/restore feature`

---

## Phase 3 — Worker-Node: Dependencies + CSV Helper + Backup Service

### 3a — Add dependencies

- [ ] In `worker-node/package.json`, add to `dependencies`: `"archiver":
      "^7.0.1"`.
- [ ] In `worker-node/package.json`, add to `devDependencies`:
      `"@types/archiver": "^7.0.0"`.
- [ ] Run `npm install` from the repo root (or inside `worker-node/`) to update
      `package-lock.json`.

### 3b — CSV helper

- [ ] Create `worker-node/src/lib/csv.ts`. Copy `toCsv` from
      `api/src/lib/csv.ts` (lines 1-24, the `escapeCell` helper and `toCsv`
      export). Do **not** copy `parseCsv` (not needed in worker).

### 3c — Backup service

- [ ] Create `worker-node/src/services/backupService.ts` with:
  - Module-level `let _isBackupRunning = false` flag.
  - `isBackupRunning(): boolean` export.
  - `zipDirectory(sourceDir, destinationZip)` — copy the 15-line helper from
    `api/src/routes/database.ts:82-93` verbatim; import `archiver`.
  - `walkResourcesForBackup(srcDir, destDir, baseDir)` — **lstat-based walk
    (V02 requirement, kept in V03):**
    - Call `fsPromises.lstat` on every entry — never `stat`.
    - If `isSymbolicLink()`: log a warning and skip (do not copy, do not
      recurse into it).
    - If `isDirectory()`: recurse.
    - If `isFile()`: copy to `path.join(destDir, path.relative(baseDir, src))`,
      creating parent directories as needed.
    - Anything else (device, FIFO, socket): log a warning and skip.
  - `createBackup({ includeResources: boolean }): Promise<void>` — full logic:
    1. Set `_isBackupRunning = true` in a try/finally that clears it.
    2. Build timestamp string: replace `-` and `:` from ISO string, drop
       milliseconds, replace `T` with `_`.
    3. Filename: `backup_w_sound_files_${ts}.zip` if `includeResources`, else
       `backup_${ts}.zip`.
    4. `mkdtemp(path.join(os.tmpdir(), "golightly04_backup_"))` → `tempDir`.
    5. Import `getDb` and `TABLE_ORDER = ["users","sound_files","meditations",
       "jobs_queue","contract_user_meditations"]`. For each table call
       `model.findAll({ raw: true, order: [["id","ASC"]] })` and write
       `toCsv(rows)` to `path.join(tempDir, `${tableName}.csv`)`.
    6. Build manifest object and write as `manifest.json` to `tempDir`.
       Use `loadEnv().NODE_ENV` for `environment` and
       `loadEnv().PATH_PROJECT_RESOURCES` for `resources_root`.
    7. If `includeResources`:
       - Read top-level entries of `PATH_PROJECT_RESOURCES` with `lstat`.
       - Skip `backups_db` and `backups_db_and_data` entries.
       - For each remaining directory entry: call `walkResourcesForBackup`
         into `path.join(tempDir, "resources")`.
       - For each remaining regular-file top-level entry: copy directly into
         `path.join(tempDir, "resources")`.
       - Skip symlinks and non-regular top-level entries with a warning log.
    8. `await fsPromises.mkdir(getFullBackupsPath(), { recursive: true })`.
    9. `await zipDirectory(tempDir, getFullBackupsPath(filename))`.
    10. Cleanup in `finally`: `await fsPromises.rm(tempDir, { recursive: true,
        force: true })`.
  - Log start, completion (with file path), and any errors using `logger`.

### 3d — Tests for backup service

- [ ] Create or update `worker-node/tests/backupService.test.ts` (or equivalent
      test file following the project's existing test pattern) with tests for:
  - **DB-only backup:** When `includeResources: false`, the output zip contains
    `manifest.json` with `package_type: "db_only"` and one CSV per table, and
    no `resources/` directory.
  - **Combined backup:** When `includeResources: true`, the output zip contains
    `manifest.json` with `package_type: "db_and_resources"`, CSVs, and a
    `resources/` directory containing the copied files.
  - **Manifest contents:** `manifest.json` has the correct fields (`created_at`,
    `app`, `environment`, `package_type`, `database_tables`, `resources_root`,
    `excluded_dirs`).
  - **Backup-directory exclusion:** Entries under `backups_db/` and
    `backups_db_and_data/` are not included in the zip `resources/` tree.
  - **Symlink skipping:** If a symlink exists in the resource tree, it is not
    copied and a warning is logged; the backup completes successfully.
  - **Non-regular entry skipping:** Non-regular filesystem entries are skipped
    with a warning; the backup completes successfully.
  - **Temp cleanup on success:** The temp directory is deleted after the zip
    is written.
  - **Temp cleanup on failure:** The temp directory is deleted even if an error
    is thrown mid-backup (finally block).
  - **Concurrency guard:** A second call to `createBackup` while one is already
    running returns early or throws a concurrency error (tested indirectly via
    `isBackupRunning()`).

**Validate:**
```bash
cd worker-node && npm run typecheck
cd worker-node && npm test
cd worker-node && npm run build
```

**Commit after phase:** `feat: add worker-node backup service and csv helper`

---

## Phase 4 — Worker-Node: POST /backup Endpoint

- [ ] In `worker-node/src/app.ts`, add the `POST /backup` route after the
      existing `/process` route:
  - Parse `includeResources` from `req.body` (default `true`).
  - If `isBackupRunning()`, return 409 `{ error: "A backup job is already
    running" }` and stop.
  - Return 202 `{ accepted: true }` immediately.
  - Call `void createBackup({ includeResources }).catch(...)` to run async.
- [ ] Import `isBackupRunning` and `createBackup` from `./services/backupService`.

### 4b — Tests for POST /backup endpoint

- [ ] Create or update `worker-node/tests/app.test.ts` (or follow project
      test-file convention) with tests for:
  - **Acceptance:** `POST /backup` with `{ includeResources: true }` when no
    backup is running returns HTTP 202 `{ accepted: true }`.
  - **Concurrent 409:** A second `POST /backup` request while `isBackupRunning()`
    is `true` returns HTTP 409 with `{ error: "A backup job is already running" }`.
  - **Default includeResources:** `POST /backup` with an empty body defaults
    `includeResources` to `true`.

**Validate:**
```bash
cd worker-node && npm run typecheck
cd worker-node && npm test
cd worker-node && npm run build
```

**Commit after phase:** `feat: add POST /backup endpoint to worker-node`

---

## Phase 5 — API: Endpoint Changes

### 5a — Multer disk upload

- [ ] In `api/src/middleware/upload.ts`, add `import os from "os"` (if not
      present).
- [ ] Export `uploadLarge = multer({ storage: multer.diskStorage({ destination:
      os.tmpdir(), filename: (_req, file, cb) => cb(null,
      `golightly04_upload_${Date.now()}_${file.originalname}`) }), limits: {
      fileSize: 500 * 1024 * 1024 } })`.

### 5b — Worker client backup function (V02 — propagates errors, kept in V03)

**Requirement:** `requestWorkerBackup` throws rather than swallowing failures.
The API only returns 202 when the worker actually accepts the job.

- [ ] In `api/src/services/workerClient.ts`, export a `WorkerConflictError`
      class (extends `Error`, sets `this.name = "WorkerConflictError"`).
- [ ] Add `requestWorkerBackup({ includeResources: boolean }): Promise<void>`:
  - POST to `${URL_WORKER_NODE}/backup` with up to 3 retry attempts and
    exponential-ish back-off (200 ms, 400 ms).
  - If the worker returns HTTP 202: return (success).
  - If the worker returns HTTP 409: immediately throw `WorkerConflictError`
    (do not retry — the worker is not unavailable, it has a running job).
  - If the worker returns any other non-2xx, or a network/fetch error occurs:
    record the error, log a warning, and retry.
  - After all retries fail: throw a generic `Error` describing the failure.
  - **Never** log-and-swallow. **Never** return void on failure.

### 5c — Safe zip extraction helper (V03 — new, V04 — logger import corrected)

**V03 requirement:** Replace whole-archive extraction with entry-by-entry
validation. No write may occur for any archive member before its name is
validated. This is the primary change from V02.

**V04 correction:** The logger import must use `../config/logger`, not
`./logger`. There is no `api/src/lib/logger.ts`; the API logger lives at
`api/src/config/logger.ts`. A file under `api/src/lib/` imports it as
`../config/logger`.

- [ ] Create `api/src/lib/safeExtractZip.ts`. Use the following import at the
      top of the file — **do not use `"./logger"`**:
  ```typescript
  import { logger } from "../config/logger";
  ```
- [ ] Implement `safeExtractZip(zipPath, destDir): Promise<SafeExtractResult>`
      and helpers `isEntryNameSafe` and `isEntryAllowed` exactly as specified
      in the plan:

  **`isEntryNameSafe(name: string): boolean`**
  - Returns `false` if name is empty.
  - Returns `false` if `path.isAbsolute(name)` (leading `/`).
  - Returns `false` if name matches `/^[A-Za-z]:/` (Windows drive prefix).
  - Returns `false` if any segment of `name.split("/")` equals `".."`.
  - Otherwise returns `true`.

  **`isEntryAllowed(normalized: string): boolean`**
  - `manifest.json` (exact match at root) → `true`.
  - Root-level `*.csv` (no `/` in name, ends with `.csv`) → `true`.
  - `resources/**` (starts with `"resources/"` and has more path after it) → `true`.
  - Everything else → `false`.

  **`safeExtractZip` body:**
  1. Open `fs.createReadStream(zipPath).pipe(unzipper.Parse({ forceStream: true }))`.
  2. For each entry in `for await (const entry of zipStream)`:
     a. Normalize: `const normalized = (entry.path as string).replace(/\\/g, "/")`.
     b. `if (!isEntryNameSafe(normalized))` → warn + `entry.autodrain()` + push
        to `skippedEntries` + `continue`.
     c. `if (!isEntryAllowed(normalized))` → warn + `entry.autodrain()` + push
        to `skippedEntries` + `continue`.
     d. `if (entry.type !== "File")` → `entry.autodrain()` + push to
        `skippedEntries` + `continue`.
     e. Resolve final write path: `path.resolve(destDir, normalized)`.
     f. Re-check containment: resolved path must start with
        `path.resolve(destDir) + path.sep`. If not → warn + `entry.autodrain()`
        + `continue`.
     g. `await fsPromises.mkdir(path.dirname(destPath), { recursive: true })`.
     h. `await pipeline(entry, fs.createWriteStream(destPath))`.
     i. Update `result` counters (`hasManifest`, `csvFiles`, `resourceCount`).
  3. Return `result`.

- [ ] Verify `unzipper` is already in `api/package.json`. If not, add it and
      run `npm install`.
- [ ] Verify `pipeline` is imported from `"stream/promises"` (Node.js 15+).

### 5d — database.ts endpoint updates (V03 — replace Extract call)

- [ ] **`POST /database/create-backup`**: Replace synchronous body with:
  - Parse `includeResources` from `req.body` (default `true`).
  - `try { await requestWorkerBackup({ includeResources }); }` → return HTTP 202:
    `{ message: "Backup job queued", queuedAt: new Date().toISOString() }`.
  - `catch (error)`: if `WorkerConflictError` → HTTP 409
    `{ error: "A backup job is already running" }`.
  - Otherwise → HTTP 503 `{ error: "Worker unavailable; backup could not be started" }`.
  - Remove the `toCsv`, `zipDirectory`, and CSV export imports from this handler
    (they move to worker-node). Keep `zipDirectory` only if still used elsewhere.

- [ ] **`GET /database/backups-list`**: Replace `getBackupsPath()` with
      `getFullBackupsPath()` in all three occurrences (mkdir, readdir, stat).

- [ ] **`GET /database/download-backup/:filename`**: Replace
      `getBackupsPath(filename)` with `getFullBackupsPath(filename)`.

- [ ] **`DELETE /database/delete-backup/:filename`**: Replace
      `getBackupsPath(filename)` with `getFullBackupsPath(filename)`.

- [ ] **`POST /database/replenish-database`** (V03 — safe extraction required):
  - Switch `upload.single("file")` to `uploadLarge.single("file")`.
  - Change `const zipPath = path.join(tempDir, "restore.zip"); await
    fsPromises.writeFile(zipPath, req.file.buffer)` to
    `const zipPath = req.file.path` (disk storage provides a file path).
  - **Replace `await unzipper.Extract(...)` (or equivalent) with
    `await safeExtractZip(zipPath, tempDir)`**. This is the V03 fix. No write
    to `tempDir` occurs before entry-level validation.
  - After extraction:
    - Attempt to read and JSON-parse `path.join(tempDir, "manifest.json")`.
    - Validate manifest shape with `isValidManifest`. On failure, log a warning
      and continue with DB-only restore.
    - If manifest is valid and `package_type === "db_and_resources"`:
      - Call `safeRestoreResources(tempDir, env.PATH_PROJECT_RESOURCES)`.
      - Set `resourcesRestored = true` and `resourceFilesRestored = <count>`.
  - In `finally`:
    - `await fsPromises.rm(req.file.path, { force: true })`.
    - `await fsPromises.rm(tempDir, { recursive: true, force: true })`.
  - Update response to include `resourcesRestored` and `resourceFilesRestored`.
- [ ] Import `safeExtractZip` from `../lib/safeExtractZip`.
- [ ] Import `getFullBackupsPath`, `requestWorkerBackup`, `WorkerConflictError`,
      `uploadLarge` where needed.

### 5e — Optional: size estimate endpoint

- [ ] If feasible (~30 lines), add `GET /database/backup-size-estimate`:
  - Recursively walk `PATH_PROJECT_RESOURCES` skipping `backups_db` and
    `backups_db_and_data`.
  - Sum `stat.size` for each file.
  - Return `{ totalBytes, totalBytesFormatted }`.
- [ ] If complex, skip and mark as future enhancement.

### 5f — Tests for API endpoint changes (V03 — expanded from V02)

- [ ] In `api/tests/database/database.routes.test.ts` (or equivalent), add or
      update tests for all V02 cases (backup directory change, worker acceptance
      and error propagation, disk-upload restore, temp cleanup, legacy DB-only
      restore, combined manifest/resource restore) **plus the following new
      V03 traversal-safety tests**.

  **V03 — `safeExtractZip` unit tests** (create `api/tests/lib/safeExtractZip.test.ts`):

  For each test, build a crafted zip in memory using `archiver` (or write raw
  zip bytes). Call `safeExtractZip(zipPath, tempDir)` and assert:

  - **Clean zip:** A zip with `manifest.json`, `users.csv`, and
    `resources/audio/file.mp3` writes exactly those three files under `tempDir`.
    `result.hasManifest` is `true`, `result.csvFiles` has one entry,
    `result.resourceCount` is `1`, `result.skippedEntries` is empty.

  - **Path-traversal entry:** A zip containing an entry named
    `../../etc/passwd` (or `resources/../../etc/passwd`) results in zero writes
    outside `tempDir`. The entry appears in `result.skippedEntries`. The file
    `<tempDir>/../../etc/passwd` does not exist after extraction.

  - **Absolute path entry:** A zip containing an entry named `/etc/passwd`
    results in zero writes. The entry appears in `result.skippedEntries`.

  - **Drive-prefixed entry:** A zip containing an entry named
    `C:\Windows\system32\evil.dll` results in zero writes. The entry appears
    in `result.skippedEntries`.

  - **Double-dot in middle:** A zip containing `resources/audio/../../../etc/hosts`
    results in zero writes outside `tempDir`. Skipped.

  - **Unexpected top-level directory:** A zip containing `secretdir/evil.txt`
    (not a CSV, not `manifest.json`, not `resources/`) results in zero writes
    to that entry. It appears in `result.skippedEntries`.

  - **Bare `resources/` directory entry:** A zip entry of type `Directory` named
    `resources/` is skipped (autodrained); only `File` type entries under
    `resources/` are written.

  - **Legacy zip (no manifest, CSVs only):** A zip containing only root-level
    CSVs writes those CSVs and returns `hasManifest: false`, `resourceCount: 0`.

  **V02 traversal tests kept in integration test** (`database.routes.test.ts`):

  - **End-to-end path containment:** Upload a crafted zip with
    `resources/../../etc/passwd` to `POST /database/replenish-database`. Assert
    the response is successful (or at least that no error is thrown for this
    specific entry) and that the file does **not** exist at the traversal target
    path. This confirms `safeExtractZip` protects the route.

  - **End-to-end backup-dir entry:** Upload a zip with a `resources/backups_db/`
    entry. Assert the entry is not restored to `PATH_PROJECT_RESOURCES/backups_db/`
    (rejected by either `safeExtractZip` — it would pass the `resources/**`
    check — or by `safeRestoreResources` which rejects top-level `backups_db`).
    Both layers of defense must reject it; the restore completes without error.

  - **Symlink / non-regular file skipping:** If practical in the test environment,
    place a symlink under `tempDir/resources` after extraction and call
    `safeRestoreResources` directly. Assert the symlink is skipped and the count
    does not include it.

**Validate:**
```bash
cd api && npm run typecheck
cd api && npm test
cd api && npm run build
```

**Commit after phase:** `feat: update api database endpoints for async backup and extended restore`

---

## Phase 6 — Web UI Changes

### 6a — API client update

- [ ] In `web/src/lib/api/database.ts`:
  - Update `createBackup` to accept `includeResources: boolean = true` and POST
    it as a JSON body: `apiClient.post("/database/create-backup", {
    includeResources })`.
  - Update the return type to `CreateBackupResponse` (now `{ message, queuedAt }`).
  - Optionally add `getBackupSizeEstimate` if Phase 5e was implemented.

### 6b — Restore confirmation modal

- [ ] Create `web/src/components/modals/ModalConfirmRestore.tsx` following the
      existing pattern of `ModalConfirmDelete.tsx`. Props: `{ isOpen: boolean;
      isLoading: boolean; onClose: () => void; onConfirm: () => void }`.
  - Title: "Restore Database"
  - Body text: "This will permanently overwrite the current database and, if
    the backup package includes resource files, overwrite those files as well.
    This action cannot be undone."
  - Buttons: Cancel + "Yes, restore".

### 6c — Admin page

- [ ] In `web/src/app/admin/page.tsx`:
  - Add `const [includeResources, setIncludeResources] = useState(true)` state.
  - Add `const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] =
      useState(false)` state.
  - In the Database section header, add the **Include sound & resource files**
    checkbox (before or alongside the Create Backup button), wired to
    `includeResources` / `setIncludeResources`. Ensure it renders **checked by
    default** (initial state `true`).
  - Update `handleCreateBackup` to call `createBackup(includeResources)`.
  - Update the success toast in `handleCreateBackup` to `"Backup job queued —
    refresh this page when the job completes."`.
  - Add distinct error toasts for API 409 ("A backup job is already running")
    and API 503 / other errors ("Worker unavailable — backup could not be
    started. Try again shortly.").
  - Remove `await fetchBackups()` from `handleCreateBackup` (file won't be
    ready yet).
  - Change the "Restore Database" button `onClick` from calling
    `handleRestoreDatabase` directly to calling
    `setIsRestoreConfirmOpen(true)`.
  - Add `<ModalConfirmRestore isOpen={isRestoreConfirmOpen} isLoading=
    {databaseLoading} onClose={() => setIsRestoreConfirmOpen(false)}
    onConfirm={() => { setIsRestoreConfirmOpen(false); handleRestoreDatabase(); }}
    />` in the modal section at the bottom of the page.
  - Import `ModalConfirmRestore`.
  - Keep `handleRestoreDatabase` body unchanged.

### 6d — Web validation (V02 requirement, kept in V03)

Explicitly verify the following before marking Phase 6 complete.

- [ ] **Include-resources checkbox default:** On page load the "Include sound &
      resource files" checkbox is checked. Confirm by rendering the page in the
      dev browser and inspecting the checkbox state, or with a component test
      that asserts `defaultChecked` or that the controlled state initializes
      to `true`.
- [ ] **Checkbox toggles correctly:** Unchecking the checkbox causes
      `handleCreateBackup` to call `createBackup(false)`; re-checking causes it
      to call `createBackup(true)`.
- [ ] **Restore confirmation gate:** Clicking "Restore Database" opens
      `ModalConfirmRestore` without uploading or calling `handleRestoreDatabase`.
      Clicking Cancel closes the modal without triggering restore. Clicking
      "Yes, restore" closes the modal and triggers `handleRestoreDatabase`.
- [ ] **409 / 503 error toasts:** When the API returns 409 or 503 on backup
      trigger, the correct distinct error toast appears (not the success toast).

**Validate:**
```bash
cd web && npm run typecheck
cd web && npm run build
```

**Commit after phase:** `feat: add resource-backup checkbox and restore confirm modal to admin page`

---

## Phase 7 (Optional) — Size Estimate (V1 if simple)

Skip this phase if Phase 5e was skipped.

- [ ] In `web/src/lib/api/database.ts`, add `getBackupSizeEstimate` call (if
      not already added in Phase 6a).
- [ ] In `web/src/app/admin/page.tsx`:
  - Add `const [sizeEstimate, setSizeEstimate] = useState<BackupSizeEstimateResponse | null>(null)` state.
  - Fetch the estimate when the Database section expands (or on page load).
  - Display the estimate near the Create Backup button: "Estimated uncompressed
    size: X MB".
  - Optionally use it in a confirmation modal before backup starts.

**Validate:**
```bash
cd web && npm run typecheck && npm run build
```

**Commit after phase:** `feat: add uncompressed size estimate to admin database section`

---

## Full Final Validation

After all phases are complete:

```bash
# Type-check all packages
cd shared-types && npm run typecheck
cd api && npm run typecheck
cd worker-node && npm run typecheck
cd web && npm run typecheck

# Run all tests
cd shared-types && npm test
cd api && npm test
cd worker-node && npm test

# Build all compilable packages
cd shared-types && npm run build
cd api && npm run build
cd worker-node && npm run build
cd web && npm run build
```

Verify manually on the running app:

1. Open `/admin`, expand Database section.
2. Confirm **Include sound & resource files** checkbox is checked by default.
3. Uncheck the checkbox; click **Create Backup** — expect 202 acknowledgement
   toast, not an error toast; no new file in list yet.
4. Wait for worker-node to finish; refresh page — confirm
   `backup_<timestamp>.zip` (DB-only) appears in the listing.
5. Re-check the checkbox; click **Create Backup** — expect the same 202 toast.
6. Wait; refresh — confirm `backup_w_sound_files_<timestamp>.zip` appears.
7. Download the combined zip; verify it contains `manifest.json`, CSV files,
   and a `resources/` directory with no `backups_db` or `backups_db_and_data`
   subtrees.
8. Click **Create Backup** a second time while the first is still running —
   confirm the API returns 409 and a distinct error toast is shown.
9. Click **Restore Database**, confirm modal appears; click Cancel — confirm
   nothing changes and no restore request is sent.
10. Confirm modal; upload the combined zip — verify success toast includes
    resource file count and `resourcesRestored: true`.
11. Upload a legacy DB-only zip (no manifest) — verify restore succeeds,
    `resourcesRestored: false`.
12. Attempt to upload a crafted zip with a `../../etc/passwd` entry — verify
    the restore succeeds (or fails gracefully) and the traversal target file
    was not created.
