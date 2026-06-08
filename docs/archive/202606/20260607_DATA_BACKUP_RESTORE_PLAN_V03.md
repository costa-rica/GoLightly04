---
created_at: 2026-06-07
updated_at: 2026-06-07
created_by: claude (sonnet-4.6)
modified_by: claude (sonnet-4.6)
---

# GoLightly04 Data Backup & Restore — Plan V03

Source PRD: [[20260607_DATA_BACKUP_RESTORE_PRD]]
Supersedes: [[20260607_DATA_BACKUP_RESTORE_PLAN_V02]]
Codex assessments incorporated:
  [[20260607_DATA_BACKUP_RESTORE_PLAN_V02_ASSESSMENT_CODEX]]
  [[20260607_DATA_BACKUP_RESTORE_TODO_V02_ASSESSMENT_CODEX]]

---

## Changes from V02

One correctness issue identified in the Codex V02 assessment is resolved here.
All V02 fixes (worker acceptance error propagation, lstat backup walk, manifest
validation, safeRestoreResources helper, disk-upload multer, confirmation modal,
tests) are carried forward unchanged.

| Concern | V02 behavior | V03 correction |
|---|---|---|
| Archive extraction writes unsafe entries before safety checks run | `unzipper.Extract({ path: tempDir })` writes all archive members to disk first; manifest validation and `safeRestoreResources` run only afterward | Replace whole-archive extraction with `safeExtractZip`, a streaming helper that validates each entry name before writing anything |

---

## Architecture Summary

*(Unchanged from V02 — reproduced for completeness.)*

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
| `api/src/lib/safeExtractZip.ts` | Safe streaming zip-extraction helper (V03 — new) |

---

## Files to Modify

| File | Change summary |
|---|---|
| `api/src/lib/projectPaths.ts` | Add `getFullBackupsPath()` |
| `worker-node/src/lib/projectPaths.ts` | Add `getFullBackupsPath()` |
| `api/src/routes/database.ts` | See API Endpoints section |
| `api/src/middleware/upload.ts` | Add `uploadLarge` (disk storage, 500 MB cap) |
| `api/src/services/workerClient.ts` | Add `requestWorkerBackup()` with propagating error semantics |
| `worker-node/src/app.ts` | Add `POST /backup` route |
| `worker-node/package.json` | Add `archiver` + `@types/archiver` |
| `shared-types/src/database.ts` | New and updated types (see below) |
| `web/src/lib/api/database.ts` | Update `createBackup` to pass `includeResources` |
| `web/src/app/admin/page.tsx` | Checkbox, updated handlers, restore modal wiring |

---

## Path Helper Changes

*(Unchanged from V02.)*

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

### `POST /database/create-backup` — unchanged from V02

*(Worker-propagating error semantics from V02 are kept.)*

### `GET /database/backups-list`, `GET /database/download-backup/:filename`, `DELETE /database/delete-backup/:filename` — unchanged from V02

### `POST /database/replenish-database` — V03 archive-safety update

The V02 restore flow used `unzipper.Extract({ path: tempDir })` followed by
manifest validation and `safeRestoreResources`. The Codex V02 assessment
identified that extraction itself is the first filesystem write — so unsafe
entries in a crafted archive could land on disk before any validation runs.

**V03 correction:** Replace `unzipper.Extract({ path: tempDir })` with
`await safeExtractZip(zipPath, tempDir)`. The remainder of the restore flow
(manifest check, `safeRestoreResources`, temp cleanup) is unchanged.

Updated restore flow:

1. Receive uploaded zip via `uploadLarge.single("file")` (disk storage, 500 MB).
2. `const zipPath = req.file.path` (path to temp file on disk).
3. Create `tempDir` via `mkdtemp`.
4. **Call `await safeExtractZip(zipPath, tempDir)`** — validates and writes only
   allowed entries (see `safeExtractZip` section below). Unsafe entries are
   skipped; no write occurs outside `tempDir` during extraction.
5. Attempt to read and JSON-parse `path.join(tempDir, "manifest.json")`.
6. Validate manifest shape with `isValidManifest` (V02 helper — unchanged).
   On failure, log a warning and continue with DB-only restore.
7. If manifest is valid and `package_type === "db_and_resources"`:
   call `safeRestoreResources(tempDir, env.PATH_PROJECT_RESOURCES)` (V02 helper —
   unchanged; provides defense-in-depth for the resource-copy step).
8. DB restore (TRUNCATE + bulk-insert + sequence reset) — unchanged.
9. `finally`: delete `req.file.path` and `tempDir`.
10. Return response including `resourcesRestored` and `resourceFilesRestored`.

### `GET /database/backup-size-estimate` — unchanged from V02 (optional V1)

---

## New Helper: `safeExtractZip` (V03 — `api/src/lib/safeExtractZip.ts`)

**Purpose:** Replace `unzipper.Extract({ path: tempDir })` with an entry-by-entry
streaming extractor that validates every archive member before writing it to disk.

**Why a separate file:** This is a security-sensitive utility used by the restore
route. Isolating it makes it independently testable with crafted archives.

```typescript
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import { pipeline } from "stream/promises";
import * as unzipper from "unzipper";
import { logger } from "./logger";

// Entry names that are permitted at the zip root.
const ALLOWED_ROOT_ENTRIES = new Set(["manifest.json"]);

// Returns true if a POSIX-normalized entry name is safe to extract.
function isEntryNameSafe(name: string): boolean {
  if (!name) return false;                                // empty
  if (path.isAbsolute(name)) return false;               // absolute (leading /)
  if (/^[A-Za-z]:/.test(name)) return false;             // drive-prefixed (C:\…)
  const segments = name.split("/");
  if (segments.some((s) => s === "..")) return false;    // traversal
  return true;
}

// Returns true if the normalized entry name is in the allowed extraction set.
function isEntryAllowed(normalized: string): boolean {
  // manifest.json or root-level CSV
  if (!normalized.includes("/")) {
    if (normalized === "manifest.json") return true;
    if (normalized.endsWith(".csv")) return true;
    return false;
  }
  // resources/** — must start with "resources/" and have at least one more segment
  if (normalized.startsWith("resources/") && normalized.length > "resources/".length) {
    return true;
  }
  return false;
}

export interface SafeExtractResult {
  csvFiles: string[];
  hasManifest: boolean;
  resourceCount: number;
  skippedEntries: string[];
}

/**
 * Streams a zip file and writes only validated entries to destDir.
 *
 * Safety rules applied to every entry before writing:
 *  1. Normalize name to POSIX (replace backslashes with forward slashes).
 *  2. Reject: empty, absolute, drive-prefixed, or containing ".." segments.
 *  3. Reject: not a root-level CSV, "manifest.json", or "resources/**" path.
 *  4. Skip non-"File" entry types (directories, symlinks).
 *
 * safeRestoreResources is still called after extraction for the resource-copy
 * step, providing defense-in-depth, but this helper ensures nothing unsafe
 * is written to tempDir during extraction itself.
 */
export async function safeExtractZip(
  zipPath: string,
  destDir: string,
): Promise<SafeExtractResult> {
  const result: SafeExtractResult = {
    csvFiles: [],
    hasManifest: false,
    resourceCount: 0,
    skippedEntries: [],
  };

  const zipStream = fs.createReadStream(zipPath).pipe(
    unzipper.Parse({ forceStream: true }),
  );

  for await (const entry of zipStream) {
    const rawName: string = entry.path as string;
    // Normalize: convert any backslashes (Windows-style zip entries) to POSIX.
    const normalized = rawName.replace(/\\/g, "/");

    // Rule 1-2: safety checks on the normalized name.
    if (!isEntryNameSafe(normalized)) {
      logger.warn(`safeExtractZip: rejecting unsafe entry name "${rawName}"`);
      result.skippedEntries.push(rawName);
      entry.autodrain();
      continue;
    }

    // Rule 3: allowlist check.
    if (!isEntryAllowed(normalized)) {
      logger.warn(`safeExtractZip: rejecting unexpected entry "${normalized}"`);
      result.skippedEntries.push(rawName);
      entry.autodrain();
      continue;
    }

    // Rule 4: only extract regular-file entries (type "File").
    if (entry.type !== "File") {
      result.skippedEntries.push(rawName);
      entry.autodrain();
      continue;
    }

    // Double-check that the resolved write destination is within destDir.
    const destPath = path.resolve(destDir, normalized);
    const resolvedDestDir = path.resolve(destDir);
    if (!destPath.startsWith(resolvedDestDir + path.sep) && destPath !== resolvedDestDir) {
      logger.warn(`safeExtractZip: resolved path escapes destDir — skipping "${normalized}"`);
      result.skippedEntries.push(rawName);
      entry.autodrain();
      continue;
    }

    // Write the entry.
    await fsPromises.mkdir(path.dirname(destPath), { recursive: true });
    await pipeline(entry, fs.createWriteStream(destPath));

    // Track results.
    if (normalized === "manifest.json") {
      result.hasManifest = true;
    } else if (normalized.endsWith(".csv")) {
      result.csvFiles.push(normalized);
    } else {
      result.resourceCount++;
    }
  }

  return result;
}
```

**Safety contract summary:**
- Streams zip with `unzipper.Parse({ forceStream: true })` — no archive-level
  `Extract` call; every entry is inspected before writing.
- Normalizes entry names to POSIX (backslash → forward slash) before validation.
- Rejects empty, absolute, drive-prefixed, and `..`-containing names.
- Permits only: root-level `*.csv` files, `manifest.json`, and `resources/**`.
- Skips non-`File` type entries (directories, symlinks) without writing.
- Resolves the final write path and re-checks containment before opening the
  write stream.
- Returns a typed result for testing; the caller uses it to decide next steps.

**Defense-in-depth:** `safeRestoreResources` (V02) still runs after extraction
for the resource-copy step from `tempDir/resources` → `PATH_PROJECT_RESOURCES`.
Two independent containment checks protect the full restore pipeline.

---

## New Multer Export (`api/src/middleware/upload.ts`)

*(Unchanged from V02.)*

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

---

## New Worker Client Function (`api/src/services/workerClient.ts`)

*(Unchanged from V02 — error-propagating semantics.)*

```typescript
export class WorkerConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerConflictError";
  }
}

export async function requestWorkerBackup(payload: {
  includeResources: boolean;
}): Promise<void> {
  const env = readApiEnv();
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${env.URL_WORKER_NODE}/backup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 409) {
        throw new WorkerConflictError("A backup job is already running on the worker");
      }

      if (response.ok) {
        return;
      }

      throw new Error(`Worker returned unexpected status ${response.status}`);
    } catch (error) {
      if (error instanceof WorkerConflictError) throw error;
      lastError = error;
      logger.warn("Worker backup request failed", { attempt, error });
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 200));
      }
    }
  }

  throw new Error(
    `Worker unreachable after 3 attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}
```

---

## New Worker-Node Endpoint (`worker-node/src/app.ts`)

*(Unchanged from V02.)*

```typescript
app.post("/backup", async (req, res, next) => {
  try {
    const includeResources = req.body?.includeResources !== false;

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

---

## Worker-Node Backup Service (`worker-node/src/services/backupService.ts`)

*(Unchanged from V02 — lstat-based walk, manifest write, temp cleanup.)*

```
createBackup({ includeResources })
  1. Set isRunning flag (try/finally clears it).
  2. Generate timestamp: YYYYMMDD_HHmmss.
  3. filename = includeResources
       ? `backup_w_sound_files_${timestamp}.zip`
       : `backup_${timestamp}.zip`
  4. mkdtemp → tempDir
  5. Export all 5 DB tables to CSV using getDb() + toCsv()
       TABLE_ORDER = ["users","sound_files","meditations","jobs_queue","contract_user_meditations"]
  6. Write manifest.json to tempDir root.
  7. If includeResources:
       walkResourcesForBackup(PATH_PROJECT_RESOURCES, tempDir/resources)
         — lstat on every entry; skip symlinks and non-regular entries with warning
  8. mkdir -p getFullBackupsPath()
  9. zipDirectory(tempDir, getFullBackupsPath(filename))
 10. finally: rm -rf tempDir, clear isRunning flag.
```

---

## Manifest Validation (from V02 — unchanged)

```typescript
function isValidManifest(obj: unknown): obj is ManifestFile {
  if (typeof obj !== "object" || obj === null) return false;
  const m = obj as Record<string, unknown>;
  return (
    typeof m.created_at === "string" &&
    typeof m.app === "string" &&
    (m.package_type === "db_only" || m.package_type === "db_and_resources") &&
    Array.isArray(m.database_tables)
  );
}
```

On parse or validation failure: log a warning, proceed with DB-only restore.

---

## Safe Resource Restore Helper (from V02 — unchanged)

`safeRestoreResources(tempDir, resourcesRoot)` still runs after `safeExtractZip`.
It provides defense-in-depth for the copy from `tempDir/resources` →
`PATH_PROJECT_RESOURCES`. See V02 plan for full implementation.

---

## Zip Structure

*(Unchanged from V02.)*

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
├── ...
```

### Legacy backup (no manifest — backward compat)
```
backup_20260515_180755.zip
├── users.csv
...
```

`safeExtractZip` handles all three; legacy zips simply result in `hasManifest:
false` and the caller falls through to DB-only restore.

---

## Shared-Types Changes

*(Unchanged from V02.)*

```typescript
export type CreateBackupRequest = { includeResources: boolean };
export type CreateBackupResponse = { message: string; queuedAt: string };
export type ManifestFile = {
  created_at: string;
  app: string;
  environment: string;
  package_type: "db_only" | "db_and_resources";
  database_tables: string[];
  resources_root: string;
  excluded_dirs: string[];
};
export type RestoreDatabaseResponse = {
  message: string;
  tablesImported: number;
  rowsImported: Record<string, number>;
  totalRows: number;
  resourcesRestored: boolean;
  resourceFilesRestored: number;
};
export type BackupSizeEstimateResponse = { totalBytes: number; totalBytesFormatted: string };
```

---

## Web UI Changes

*(Unchanged from V02 — checkbox, error toasts, restore confirmation modal.)*

---

## Feasibility Notes

| Concern | Assessment |
|---|---|
| Admin auth | Already enforced. No changes needed. |
| Worker client error propagation | Unchanged from V02. |
| `safeExtractZip` implementation | ~80 lines using `unzipper.Parse({ forceStream: true })` with `for await`. No new dependencies beyond `unzipper` (already in `api/`). Moderate complexity; high correctness value. |
| Archive safety — defense-in-depth | Both `safeExtractZip` and `safeRestoreResources` run: the former prevents unsafe extraction-time writes; the latter prevents unsafe copies from tempDir to live resources. |
| Testing crafted archives | `archiver` (already a dependency) or a raw `Buffer` with known zip bytes can produce crafted zips in tests. No new test infrastructure required. |
| Legacy DB-only restore | `safeExtractZip` still writes root-level CSVs. `hasManifest: false` triggers DB-only path. No behavior change. |
| Disk multer for restore | Unchanged from V02. |
| Backup lstat walk | Unchanged from V02. |
| `archiver` in worker-node | Must be added to `worker-node/package.json`. |

---

## Open Assumptions

*(All V02 assumptions carry forward.)*

1. `PATH_PROJECT_RESOURCES` in the API and worker-node `.env` files points to
   the same filesystem path.
2. Worker-node's `POST /backup` has no auth token — consistent with `POST /process`.
3. Size estimate endpoint is V1 only if a recursive `fs.stat` walk can be
   written in ~30 lines.
4. Old `backup_*.zip` files in `backups_db/` are not migrated.
5. Resource restore is overwrite-only; no files are deleted during restore.
6. The worker-node `POST /backup` endpoint does not return job progress.
7. `WorkerConflictError` is defined in `api/src/services/workerClient.ts`; it
   does not need to be in `shared-types`.
8. `safeExtractZip` imports `unzipper` which is already a dependency of `api/`.
   If not present, add it to `api/package.json`.
