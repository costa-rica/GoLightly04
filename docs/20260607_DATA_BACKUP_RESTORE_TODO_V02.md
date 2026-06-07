---
created_at: 2026-06-07
updated_at: 2026-06-07
created_by: claude (sonnet-4.6)
modified_by: claude (sonnet-4.6)
---

# GoLightly04 Data Backup & Restore — TODO V02

Source plan: [[20260607_DATA_BACKUP_RESTORE_PLAN_V02]]
Source PRD: [[20260607_DATA_BACKUP_RESTORE_PRD]]
Supersedes: [[20260607_DATA_BACKUP_RESTORE_TODO_V01]]
Codex assessments incorporated:
  [[20260607_DATA_BACKUP_RESTORE_PLAN_V01_ASSESSMENT_CODEX]]
  [[20260607_DATA_BACKUP_RESTORE_TODO_V01_ASSESSMENT_CODEX]]

---

## Changes from V01

| V01 defect | Phase | V02 correction |
|---|---|---|
| `requestWorkerBackup` swallows failures; API always returns 202 | 5b, 5c | Function throws on worker 409 (`WorkerConflictError`) or exhausted retries; API maps errors to 409/503 |
| Restore copies files with no path-containment, symlink, or manifest validation | 5c | Explicit `isValidManifest` check; `safeRestoreResources` helper with lstat, containment, regular-files-only, backup-dir exclusion |
| Backup walk has no lstat or symlink behavior | 3c | `walkResourcesForBackup` uses lstat; skips symlinks and non-regular entries with warning logs |
| No test tasks for new behavior | 3, 4, 5, 6 | Explicit test tasks added in every phase that introduces new testable behavior |

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
    (V02 requirement):**
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

### 5b — Worker client backup function (V02 — propagates errors)

**V02 requirement:** Unlike `notifyWorker`, `requestWorkerBackup` must throw
rather than swallowing failures. The API only returns 202 when the worker
actually accepts the job.

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

### 5c — database.ts endpoint updates

- [ ] **`POST /database/create-backup`**: Replace synchronous body with:
  - Parse `includeResources` from `req.body` (default `true`).
  - `try { await requestWorkerBackup({ includeResources }); }` — then return
    HTTP 202: `{ message: "Backup job queued", queuedAt: new Date().toISOString() }`.
  - `catch (error)`: if `error instanceof WorkerConflictError`, return HTTP 409
    `{ error: "A backup job is already running" }`.
  - Otherwise (worker unreachable), return HTTP 503
    `{ error: "Worker unavailable; backup could not be started" }`.
  - Remove the `toCsv`, `zipDirectory`, and CSV export imports from this handler
    (they move to worker-node). Keep `zipDirectory` in the file only if it is
    still used elsewhere; otherwise remove it.

- [ ] **`GET /database/backups-list`**: Replace `getBackupsPath()` with
      `getFullBackupsPath()` in all three occurrences (mkdir, readdir, stat).

- [ ] **`GET /database/download-backup/:filename`**: Replace
      `getBackupsPath(filename)` with `getFullBackupsPath(filename)`.

- [ ] **`DELETE /database/delete-backup/:filename`**: Replace
      `getBackupsPath(filename)` with `getFullBackupsPath(filename)`.

- [ ] **`POST /database/replenish-database`** (V02 — archive safety required):
  - Switch `upload.single("file")` to `uploadLarge.single("file")`.
  - Replace `const zipPath = path.join(tempDir, "restore.zip"); await
    fsPromises.writeFile(zipPath, req.file.buffer)` with
    `const zipPath = req.file.path` (disk storage provides a path directly).
  - After extracting to `tempDir`:
    - Attempt to read and JSON-parse `path.join(tempDir, "manifest.json")`.
    - **Validate manifest shape** with an `isValidManifest` type guard (checks
      that `package_type` is `"db_only"` or `"db_and_resources"`, that
      `database_tables` is an array, and that `created_at` / `app` are strings).
      If parsing or validation fails, log a warning and continue with DB-only
      restore.
    - If manifest is valid and `package_type === "db_and_resources"`:
      - Call `safeRestoreResources(tempDir, env.PATH_PROJECT_RESOURCES)`.
      - `safeRestoreResources` must:
        - Use `lstat` on every entry — never `stat` or follow symlinks.
        - Resolve both the source path and the destination path using
          `path.resolve`.
        - Verify the resolved source path starts with
          `path.resolve(tempDir, "resources") + path.sep` (containment check).
        - Verify the resolved destination path starts with
          `path.resolve(env.PATH_PROJECT_RESOURCES) + path.sep` (containment
          check).
        - Reject any entry whose top-level segment (first component of the
          relative path) is `"backups_db"` or `"backups_db_and_data"`.
        - Skip symlinks and non-regular files with a warning log.
        - Copy only regular files; `overwrite: true`.
        - Return the count of files copied.
      - Set `resourcesRestored = true` and `resourceFilesRestored = <count>`.
  - In `finally`:
    - Delete `req.file.path` (uploaded disk file): `await fsPromises.rm(req.file.path, { force: true })`.
    - Delete `tempDir`: `await fsPromises.rm(tempDir, { recursive: true, force: true })`.
  - Update the response to include `resourcesRestored` and `resourceFilesRestored`.
- [ ] Import `getFullBackupsPath` and `requestWorkerBackup`, `WorkerConflictError`
      where needed.
- [ ] Import `uploadLarge` from `../middleware/upload`.

### 5d — Optional: size estimate endpoint

- [ ] If feasible (~30 lines), add `GET /database/backup-size-estimate`:
  - Recursively walk `PATH_PROJECT_RESOURCES` skipping `backups_db` and
    `backups_db_and_data`.
  - Sum `stat.size` for each file.
  - Return `{ totalBytes, totalBytesFormatted }`.
- [ ] If complex, skip and mark as future enhancement.

### 5e — Tests for API endpoint changes (V02 requirement)

- [ ] In `api/tests/database/database.routes.test.ts` (or equivalent),
      add or update tests for:

  **Backup directory change:**
  - `GET /database/backups-list` reads from `backups_db_and_data/`, not
    `backups_db/`. A file present only in `backups_db_and_data/` appears;
    a file only in `backups_db/` does not.
  - `GET /database/download-backup/:filename` and
    `DELETE /database/delete-backup/:filename` resolve paths under
    `backups_db_and_data/`.

  **Worker acceptance and error propagation (`POST /database/create-backup`):**
  - When the worker mock returns HTTP 202: the API returns HTTP 202 with
    `{ message: "Backup job queued", queuedAt: <iso string> }`.
  - When the worker mock returns HTTP 409: the API returns HTTP 409 with
    `{ error: "A backup job is already running" }`.
  - When the worker mock is unreachable (all retries exhausted): the API
    returns HTTP 503.
  - **Not** HTTP 202 in either failure case.

  **Disk-upload restore and temp cleanup:**
  - A valid uploaded zip is extracted, processed, and the uploaded file is
    deleted from the temp path in `finally` — even when restore fails.
  - The extracted `tempDir` is deleted in `finally`.

  **Legacy DB-only restore (backward compat):**
  - A zip with no `manifest.json` restores only DB tables; `resourcesRestored`
    is `false` and `resourceFilesRestored` is `0`.

  **Combined manifest/resource restore:**
  - A zip with `manifest.json` (`package_type: "db_and_resources"`) and a
    `resources/` directory restores DB tables and resource files;
    `resourcesRestored` is `true` and `resourceFilesRestored` matches the
    number of regular files copied.

  **Path containment / archive safety:**
  - An uploaded archive containing a crafted `resources/` entry with a
    path-traversal component (e.g., `../../etc/passwd`) does not write outside
    `PATH_PROJECT_RESOURCES`. The entry is skipped and restore completes.
  - An uploaded archive containing a `resources/backups_db/` entry does not
    restore those files. The entry is rejected and restore completes.

  **Symlink / non-regular file skipping:**
  - If practical in the test environment: an extracted archive entry that is a
    symlink or non-regular file is skipped; restore completes without error.

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
  - Update the return type to `CreateBackupResponse` (the updated type from
    shared-types — now `{ message, queuedAt }`).
  - Optionally add `getBackupSizeEstimate` if Phase 5d was implemented.

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

### 6d — Web validation (V02 requirement)

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

Skip this phase if Phase 5d was skipped.

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
