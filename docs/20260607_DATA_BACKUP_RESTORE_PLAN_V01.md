---
created_at: 2026-06-07
updated_at: 2026-06-07
created_by: claude (sonnet-4.6)
modified_by: claude (sonnet-4.6)
---

# GoLightly04 Data Backup & Restore — Plan V01

Source PRD: [[20260607_DATA_BACKUP_RESTORE_PRD]]

---

## Architecture Summary

GoLightly04 is a TypeScript monorepo with five packages:

| Package | Role |
|---|---|
| `api` | Express HTTP server, all client-facing and admin routes |
| `worker-node` | Express HTTP server, background processing |
| `web` | Next.js 15 frontend, Redux state |
| `shared-types` | Shared TypeScript types; compiled to `dist/` before use |
| `db-models` | Sequelize models + PostgreSQL connection; imported by both `api` and `worker-node` |

**Key constraints that shape this plan:**

- Both `api` and `worker-node` access `PATH_PROJECT_RESOURCES` on the same
  filesystem (confirmed by `.env.example` files on both sides).
- `api` → `worker-node` communication is plain HTTP; no auth token is required
  (established by `api/src/services/workerClient.ts`).
- The `/database` router in `api/src/routes/database.ts` already applies
  `router.use(requireAdmin)` at line 97. All new endpoints added to that router
  inherit admin-only protection automatically. No auth changes are needed.
- `shared-types/dist/` must be rebuilt (`npm run build` inside `shared-types/`)
  after any type change before downstream packages see the update.

---

## Files to Create

| Path | Purpose |
|---|---|
| `worker-node/src/services/backupService.ts` | Async backup orchestration |
| `worker-node/src/lib/csv.ts` | `toCsv` helper (copy from `api/src/lib/csv.ts`; `parseCsv` not needed in worker) |
| `web/src/components/modals/ModalConfirmRestore.tsx` | Destructive restore confirmation modal |

---

## Files to Modify

| File | Change summary |
|---|---|
| `api/src/lib/projectPaths.ts` | Add `getFullBackupsPath()` |
| `worker-node/src/lib/projectPaths.ts` | Add `getFullBackupsPath()` |
| `api/src/routes/database.ts` | See API Endpoints section |
| `api/src/middleware/upload.ts` | Add `uploadLarge` (disk storage, 500 MB cap) |
| `api/src/services/workerClient.ts` | Add `requestWorkerBackup()` |
| `worker-node/src/app.ts` | Add `POST /backup` route |
| `worker-node/package.json` | Add `archiver` + `@types/archiver` |
| `shared-types/src/database.ts` | New and updated types (see below) |
| `web/src/lib/api/database.ts` | Update `createBackup` to pass `includeResources` |
| `web/src/app/admin/page.tsx` | Checkbox, updated handlers, restore modal wiring |

---

## Path Helper Changes

### `api/src/lib/projectPaths.ts`

Add alongside the existing `getBackupsPath`:

```typescript
export function getFullBackupsPath(...segments: string[]): string {
  return getProjectResourcePath("backups_db_and_data", ...segments);
}
```

`getBackupsPath` (pointing to `backups_db/`) is **not removed** — it may still be
called by legacy code or tests. The new listing/download/delete endpoints switch
to `getFullBackupsPath`.

### `worker-node/src/lib/projectPaths.ts`

Add alongside existing helpers:

```typescript
export function getFullBackupsPath(...segments: string[]): string {
  return path.join(getRoot(), "backups_db_and_data", ...segments);
}
```

---

## API Endpoint Changes (`api/src/routes/database.ts`)

### `POST /database/create-backup` — becomes async

Current behavior: synchronously exports CSVs, zips them, returns filename.

New behavior:
1. Parse `includeResources: boolean` from request body (default `true` if
   omitted).
2. Call `requestWorkerBackup({ includeResources })` from `workerClient.ts`.
3. Return HTTP 202 immediately: `{ message: "Backup job queued", queuedAt:
   string }`.

The heavy lifting (CSV export, file copy, zip) moves entirely to the
worker-node.

### `GET /database/backups-list` — updated path only

Replace `getBackupsPath()` with `getFullBackupsPath()`. No signature change.

### `GET /database/download-backup/:filename` — updated path only

Replace `getBackupsPath(filename)` with `getFullBackupsPath(filename)`.

### `DELETE /database/delete-backup/:filename` — updated path only

Replace `getBackupsPath(filename)` with `getFullBackupsPath(filename)`.

### `POST /database/replenish-database` — extended

Changes:
1. Switch from `upload.single("file")` to `uploadLarge.single("file")` (disk
   storage multer, see below).
2. Access `req.file.path` instead of `req.file.buffer` (disk storage gives a
   file path, not an in-memory buffer).
3. After extracting the zip to `tempDir`:
   a. Check for `tempDir/manifest.json`.
   b. If present and `package_type === "db_and_resources"`: run resource
      restore (copy `tempDir/resources/**` to `PATH_PROJECT_RESOURCES`,
      overwriting conflicts).
4. DB restore logic (TRUNCATE + bulk-insert + sequence reset) is unchanged.
5. Clean up both `req.file.path` and `tempDir` in `finally`.
6. Return extended response: add `resourcesRestored: boolean` and
   `resourceFilesRestored: number`.

### `GET /database/backup-size-estimate` — new (optional V1)

Walks `PATH_PROJECT_RESOURCES` recursively, summing `stat.size` for all files,
skipping `backups_db/` and `backups_db_and_data/`. Returns:

```typescript
{ totalBytes: number, totalBytesFormatted: string }
```

Include in V1 only if the recursive-walk implementation stays under ~30 lines.
Gate implementation behind a judgment call; if complexity is high, skip and mark
as future enhancement.

---

## New Multer Export (`api/src/middleware/upload.ts`)

Add alongside the existing `upload` export:

```typescript
import os from "os";

export const uploadLarge = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) =>
      cb(null, `golightly04_upload_${Date.now()}_${file.originalname}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});
```

The existing `upload` (memory, 20 MB) is not modified.

---

## New Worker Client Function (`api/src/services/workerClient.ts`)

Add alongside `notifyWorker`:

```typescript
export async function requestWorkerBackup(payload: {
  includeResources: boolean;
}): Promise<void> {
  const env = readApiEnv();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${env.URL_WORKER_NODE}/backup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Worker returned ${response.status}`);
      return;
    } catch (error) {
      logger.warn("Worker backup notification failed", { attempt, error });
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 200));
      }
    }
  }
  // Log failure but do not throw — worker may be temporarily down
  logger.error("Worker backup notification failed after 3 attempts");
}
```

Mirror of `notifyWorker`; logs but does not re-throw after retries to avoid
blocking the API response.

---

## New Worker-Node Endpoint (`worker-node/src/app.ts`)

Add alongside the existing `/process` route:

```typescript
app.post("/backup", async (req, res, next) => {
  try {
    const includeResources = req.body?.includeResources !== false; // default true

    if (isBackupRunning()) {
      res.status(409).json({ error: "A backup job is already running" });
      return;
    }

    res.status(202).json({ accepted: true });

    void createBackup({ includeResources }).catch((error) => {
      logger.error(
        `Background backup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    });
  } catch (error) {
    next(error);
  }
});
```

`isBackupRunning` and `createBackup` come from `backupService.ts`. The 409
guard prevents concurrent backup jobs from racing on the filesystem.

---

## Worker-Node Backup Service (`worker-node/src/services/backupService.ts`)

New file. Key responsibilities:

```
createBackup({ includeResources })
  1. Set isRunning flag.
  2. Generate timestamp: YYYYMMDD_HHmmss.
  3. filename = includeResources
       ? `backup_w_sound_files_${timestamp}.zip`
       : `backup_${timestamp}.zip`
  4. mkdtemp → tempDir
  5. Export all 5 DB tables to CSV using getDb() + toCsv()
       TABLE_ORDER = ["users","sound_files","meditations","jobs_queue","contract_user_meditations"]
  6. Write manifest.json to tempDir root.
  7. If includeResources:
       Walk PATH_PROJECT_RESOURCES, skip backups_db/ and backups_db_and_data/
       Copy each file to tempDir/resources/<relative-path>
  8. mkdir -p getFullBackupsPath()
  9. zipDirectory(tempDir, getFullBackupsPath(filename))
       Uses archiver — same helper as api/src/routes/database.ts:82-93; duplicate inline.
 10. finally: rm -rf tempDir, clear isRunning flag.
```

`TABLE_ORDER` and model references match those in `api/src/routes/database.ts`
exactly. The Sequelize models are available via `getDb()` in worker-node.

The `zipDirectory` helper (15 lines using `archiver`) is duplicated from
`api/src/routes/database.ts:82-93` into this service rather than creating a
shared utility.

---

## Zip Structure

### Combined backup
```
backup_w_sound_files_20260607_143022.zip
├── manifest.json
├── users.csv
├── sound_files.csv
├── meditations.csv
├── jobs_queue.csv
├── contract_user_meditations.csv
└── resources/
    ├── prerecorded_audio/
    ├── eleven_labs_audio_files/
    └── meditation_soundfiles/
```

### DB-only backup (new format)
```
backup_20260607_143022.zip
├── manifest.json
├── users.csv
├── sound_files.csv
├── meditations.csv
├── jobs_queue.csv
└── contract_user_meditations.csv
```

### Legacy backup (no manifest — backward compat)
```
backup_20260515_180755.zip
├── users.csv
...
```

CSVs are at the zip root in all three cases, so the existing DB restore path
(`path.join(tempDir, `${tableName}.csv`)`) continues to work without changes.

---

## Shared-Types Changes (`shared-types/src/database.ts`)

Add new types; update existing ones.

```typescript
// New — request body for create-backup
export type CreateBackupRequest = {
  includeResources: boolean;
};

// Updated — response is now async (HTTP 202)
export type CreateBackupResponse = {
  message: string;
  queuedAt: string;
};

// New — manifest structure inside backup zips
export type ManifestFile = {
  created_at: string;
  app: string;
  environment: string;
  package_type: "db_only" | "db_and_resources";
  database_tables: string[];
  resources_root: string;
  excluded_dirs: string[];
};

// Updated — restore response now reports resource details
export type RestoreDatabaseResponse = {
  message: string;
  tablesImported: number;
  rowsImported: Record<string, number>;
  totalRows: number;
  resourcesRestored: boolean;
  resourceFilesRestored: number;
};

// New — optional size estimate
export type BackupSizeEstimateResponse = {
  totalBytes: number;
  totalBytesFormatted: string;
};
```

`BackupFile`, `GetBackupsResponse`, and `DeleteBackupResponse` are unchanged.

After editing, run `cd shared-types && npm run build` to regenerate `dist/`.

---

## Web UI Changes

### `web/src/lib/api/database.ts`

Update `createBackup` to POST JSON with the include flag:

```typescript
export const createBackup = async (
  includeResources: boolean = true,
): Promise<CreateBackupResponse> => {
  const response = await apiClient.post<CreateBackupResponse>(
    "/database/create-backup",
    { includeResources },
  );
  return response.data;
};
```

Add `getBackupSizeEstimate` if size-estimate endpoint is implemented:

```typescript
export const getBackupSizeEstimate =
  async (): Promise<BackupSizeEstimateResponse> => {
    const response = await apiClient.get<BackupSizeEstimateResponse>(
      "/database/backup-size-estimate",
    );
    return response.data;
  };
```

### `web/src/app/admin/page.tsx`

Changes to the Database section:

1. Add state: `const [includeResources, setIncludeResources] = useState(true)`.
2. Add **Include sound & resource files** checkbox next to the Create Backup
   button, wired to `includeResources` state.
3. Update `handleCreateBackup` to call `createBackup(includeResources)`.
4. Update toast after backup trigger: `"Backup job queued — refresh when the
   job completes to see the file."`.
5. Remove `await fetchBackups()` from `handleCreateBackup` (the file is not
   ready yet when the 202 returns).
6. Change "Restore Database" button to set `isRestoreConfirmOpen(true)` instead
   of directly calling `handleRestoreDatabase`.
7. Add `isRestoreConfirmOpen` state and wire `ModalConfirmRestore` to it.
8. The actual restore logic in `handleRestoreDatabase` is unchanged.

### `web/src/components/modals/ModalConfirmRestore.tsx` (new)

Follows the pattern of `ModalConfirmDelete.tsx`. Props:

```typescript
type Props = {
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};
```

Displays:
- Title: "Restore Database"
- Body: "This will permanently overwrite the current database" (and resource
  files if a combined package is detected — the warning can be generic since
  auto-detection happens after upload).
- Cancel + "Yes, restore" buttons.

---

## Feasibility Notes

| Concern | Assessment |
|---|---|
| Admin auth | Already enforced. `router.use(requireAdmin)` at `database.ts:97` covers all new endpoints. No changes needed. |
| CSV helper duplication | Low risk. `toCsv` is 35 lines of pure string logic with no deps. Copying it avoids a new shared package. |
| `archiver` in worker-node | Must be added to `worker-node/package.json`. Well-maintained; already used by the API. |
| Disk multer for restore | Small change to `upload.ts`; shifts from `req.file.buffer` to `req.file.path` in restore handler. Temp file must be deleted in `finally`. |
| Zip file size | Combined packages may be hundreds of MB. Worker-node runs async; no timeout issues. Admin is informed via toast to check back later. |
| Worker backup concurrency | Simple `isRunning` boolean flag prevents concurrent backup jobs. No persistent state needed. |
| Old `backups_db/` files | Will not appear in the new listing. No migration needed; files remain on disk. |
| Backward compat restore | Old zips (no manifest) continue to restore DB only. Detection is `if (manifestExists && package_type === "db_and_resources")`. |
| `parseCsv` not needed in worker | Worker only creates backups (writes CSVs). Restore (reads CSVs) remains in the API. Only `toCsv` is duplicated. |

---

## Open Assumptions

1. `PATH_PROJECT_RESOURCES` in the API and worker-node `.env` files points to
   the same filesystem path. Both `.env.example` files confirm identical patterns.
2. Worker-node's `POST /backup` has no auth token — consistent with how
   `POST /process` is called today.
3. Size estimate endpoint is V1 only if a recursive `fs.stat` walk can be
   written in ~30 lines. If complexity is high, skip and mark future.
4. Old `backup_*.zip` files in `backups_db/` are not migrated to
   `backups_db_and_data/`. The admin will see only files in the new directory.
5. Resource restore is overwrite-only; no files under `PATH_PROJECT_RESOURCES`
   are deleted during restore.
6. The worker-node `POST /backup` endpoint does not return job progress.
   Admin refreshes the page later and sees the completed file.
