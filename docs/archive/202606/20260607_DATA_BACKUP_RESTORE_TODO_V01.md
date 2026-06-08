---
created_at: 2026-06-07
updated_at: 2026-06-07
created_by: claude (sonnet-4.6)
modified_by: claude (sonnet-4.6)
---

# GoLightly04 Data Backup & Restore — TODO V01

Source plan: [[20260607_DATA_BACKUP_RESTORE_PLAN_V01]]
Source PRD: [[20260607_DATA_BACKUP_RESTORE_PRD]]

---

## How to use this TODO

Work through each phase in order. At the end of every phase, run the validation
commands listed under that phase. If type-check, tests, or build fails, fix
before moving on. After validation passes, commit all changes for that phase
following commit-message guidance.

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
    7. If `includeResources`: recursively walk `loadEnv().PATH_PROJECT_RESOURCES`
       skipping `backups_db` and `backups_db_and_data` top-level dirs; for each
       file, compute relative path and copy to `path.join(tempDir, "resources",
       relPath)` creating parent dirs as needed.
    8. `await fsPromises.mkdir(getFullBackupsPath(), { recursive: true })`.
    9. `await zipDirectory(tempDir, getFullBackupsPath(filename))`.
    10. Cleanup in `finally`: `await fsPromises.rm(tempDir, { recursive: true,
        force: true })`.
  - Log start, completion, and any errors using `logger`.

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
    running" }`.
  - Return 202 `{ accepted: true }` immediately.
  - Call `void createBackup({ includeResources }).catch(...)` to run async.
- [ ] Import `isBackupRunning` and `createBackup` from `./services/backupService`.

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

### 5b — Worker client backup function

- [ ] In `api/src/services/workerClient.ts`, add `requestWorkerBackup({
      includeResources: boolean }): Promise<void>` following the `notifyWorker`
      pattern — 3 retry attempts, logs on failure, does **not** re-throw after
      all retries fail.

### 5c — database.ts endpoint updates

- [ ] **`POST /database/create-backup`**: Replace the full synchronous body
      with: parse `includeResources` from `req.body` (default `true`), call
      `await requestWorkerBackup({ includeResources })`, return 201 →
      **change to 202** with `{ message: "Backup job queued", queuedAt:
      new Date().toISOString() }`. Remove the `toCsv`, `zipDirectory`, and CSV
      export imports from this handler (they move to worker-node).
  - Keep `zipDirectory` in the file only if it is still used elsewhere;
    otherwise remove it.
- [ ] **`GET /database/backups-list`**: Replace `getBackupsPath()` with
      `getFullBackupsPath()` in all three occurrences (mkdir, readdir, stat).
- [ ] **`GET /database/download-backup/:filename`**: Replace
      `getBackupsPath(filename)` with `getFullBackupsPath(filename)`.
- [ ] **`DELETE /database/delete-backup/:filename`**: Replace
      `getBackupsPath(filename)` with `getFullBackupsPath(filename)`.
- [ ] **`POST /database/replenish-database`**: 
  - Switch `upload.single("file")` to `uploadLarge.single("file")`.
  - Replace `const zipPath = path.join(tempDir, "restore.zip"); await
    fsPromises.writeFile(zipPath, req.file.buffer)` with
    `const zipPath = req.file.path` (disk storage provides a path directly).
  - After extracting: read `path.join(tempDir, "manifest.json")` if it exists;
    parse JSON; if `package_type === "db_and_resources"`, restore resources from
    `path.join(tempDir, "resources")` to `env.PATH_PROJECT_RESOURCES` —
    recursive copy overwriting existing files; count restored files.
  - In `finally`, add `await fsPromises.rm(req.file.path, { force: true })` to
    delete the uploaded file from disk.
  - Update the response to include `resourcesRestored` and
    `resourceFilesRestored`.
- [ ] Import `getFullBackupsPath` and `requestWorkerBackup` where needed.
- [ ] Import `uploadLarge` from `../middleware/upload`.
- [ ] Import `readApiEnv` (needed for `PATH_PROJECT_RESOURCES` in resource
      restore).

### 5d — Optional: size estimate endpoint

- [ ] If feasible (~30 lines), add `GET /database/backup-size-estimate`:
  - Recursively walk `PATH_PROJECT_RESOURCES` skipping `backups_db` and
    `backups_db_and_data`.
  - Sum `stat.size` for each file.
  - Return `{ totalBytes, totalBytesFormatted }`.
- [ ] If complex, skip and mark as future enhancement.

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
  - Body text: warn the operation is destructive and permanent; if a combined
    package is uploaded, resource files are also overwritten.
  - Buttons: Cancel + "Yes, restore".

### 6c — Admin page

- [ ] In `web/src/app/admin/page.tsx`:
  - Add `const [includeResources, setIncludeResources] = useState(true)` state.
  - Add `const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] =
      useState(false)` state.
  - In the Database section header, add the **Include sound & resource files**
    checkbox (before or alongside the Create Backup button), wired to
    `includeResources` / `setIncludeResources`.
  - Update `handleCreateBackup` to call `createBackup(includeResources)`.
  - Update the success toast in `handleCreateBackup` to `"Backup job queued —
    refresh this page when the job completes."`.
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

**Validate:**
```bash
cd web && npm run typecheck
```
Build the web app to catch any component issues:
```bash
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
3. Click **Create Backup** — expect 202 acknowledgement toast, no new file in
   list yet.
4. Wait for worker-node to finish; refresh page — confirm `backup_w_sound_files_
   <timestamp>.zip` appears in the listing.
5. Download the zip; verify it contains `manifest.json`, CSV files, and a
   `resources/` directory.
6. Click **Restore Database**, confirm modal appears; cancel — confirm nothing
   changes.
7. Confirm modal and upload the downloaded zip — verify success toast includes
   resource file count.
