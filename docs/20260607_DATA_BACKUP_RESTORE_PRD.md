---
created_at: 2026-06-07
updated_at: 2026-06-07
created_by: claude (sonnet-4.6)
modified_by: claude (sonnet-4.6)
---

# GoLightly04 Data Backup & Restore — PRD

## Problem Statement

Replicating the production environment into development currently requires two
separate manual steps: download a database backup via the admin page, then SSH
into the production server to copy `PATH_PROJECT_RESOURCES` sound and asset
files. There is no integrated way to export, download, and later import a
complete environment snapshot from the admin UI.

---

## Goals

1. Admin triggers a single combined backup — database + all project resource
   files — from the `/admin` page with one button click.
2. Archive creation runs asynchronously on the worker-node; the API is not
   blocked.
3. Completed files appear in the admin Database listing for download or deletion
   at any time; no separate job-status list.
4. Admin uploads a backup zip to restore both the database and resource files;
   package type is detected automatically from a manifest included in the zip.
5. Admin-only access for all backup and restore operations, enforced at the API
   level.

---

## Non-Goals

- Automated or scheduled backups.
- Job-status polling or history list (the presence of the file on disk is the
  implicit status).
- Pre-restore safety backup (admin takes responsibility for the destructive
  operation).
- Differentiated defaults per environment.
- Deletion or pruning of files in `PATH_PROJECT_RESOURCES` that are absent from
  a restored package.

---

## Feature 1 — Backup / Export

### Trigger

The admin Database section on `/admin` gains an **Include sound & resource
files** checkbox that defaults to **checked** in all environments. Clicking
**Create Backup** triggers an asynchronous job.

### Async Processing on Worker-Node

1. The API receives `POST /database/create-backup` with `{ includeResources:
   boolean }` in the request body.
2. The API sends `POST /backup` to the worker-node (fire-and-forget, same
   pattern as `notifyWorker`), then immediately returns HTTP 202 to the browser.
3. The worker-node backup service runs asynchronously:
   - Exports all five database tables (users, sound_files, meditations,
     jobs_queue, contract_user_meditations) to CSV files in a temp directory.
   - Writes `manifest.json` to the temp directory root (see Manifest Spec).
   - If `includeResources` is true, copies the full `PATH_PROJECT_RESOURCES`
     subtree (excluding `backups_db/` and `backups_db_and_data/`) into a
     `resources/` subdirectory of the temp directory.
   - Zips the temp directory to `PATH_PROJECT_RESOURCES/backups_db_and_data/
     <filename>.zip`.
   - Cleans up the temp directory in a `finally` block.

### Filename Convention

| Package type | Filename |
|---|---|
| DB + resources | `backup_w_sound_files_<timestamp>.zip` |
| DB only | `backup_<timestamp>.zip` |

Timestamp format: `YYYYMMDD_HHmmss` (e.g., `20260607_143022`), consistent with
the existing convention in `create-backup`.

### Storage Location

All new backup files are written to
`PATH_PROJECT_RESOURCES/backups_db_and_data/`. The existing `backups_db/`
directory is not modified. The admin listing, download, and delete endpoints are
updated to read from `backups_db_and_data/`. Files previously in `backups_db/`
will no longer appear in the admin listing but remain on disk.

### Size Estimate (V1 — include only if implementation is simple)

Before creating a backup, the admin section may show an uncompressed-size
estimate of `PATH_PROJECT_RESOURCES` (excluding backup directories), fetched
from a new `GET /database/backup-size-estimate` endpoint. If this can be
implemented as a simple recursive walk in under ~30 lines, include it in V1 and
display the estimate in the confirm modal. If it requires a subprocess or
significant complexity, defer to a future enhancement.

---

## Feature 2 — Restore / Import

### Upload

The existing **Upload Backup (.zip) / Restore Database** form in the admin
Database section is extended to handle combined packages. No extra UI input is
required; the zip is auto-detected.

The multer configuration for the restore endpoint must switch from in-memory
storage (current 20 MB cap) to disk storage with a higher cap (~500 MB), to
accommodate combined packages that may contain hundreds of MB of audio files.

### Auto-Detection via Manifest

After the uploaded zip is extracted to a temp directory, the restore handler
reads `manifest.json` from the zip root:

- If `manifest.json` is present and `package_type === "db_and_resources"`:
  restore DB CSVs **and** restore resource files.
- Otherwise (no manifest, or `package_type === "db_only"`): restore DB CSVs
  only. This preserves backward compatibility with backup files created before
  this feature.

### DB Restore

Same logic as the existing `replenish-database` endpoint:
1. TRUNCATE all tables in reverse FK order.
2. Bulk-insert rows from CSV files found at the zip root.
3. Reset Postgres ID sequences.

### Resource Restore

If the package contains a `resources/` directory:
1. Walk `resources/` recursively.
2. Copy each file to the corresponding path under `PATH_PROJECT_RESOURCES`,
   creating parent directories as needed.
3. Overwrite any existing file at that path.
4. Do not delete existing files in `PATH_PROJECT_RESOURCES` that are absent from
   the package.

### Destructive Warning Modal

Clicking **Restore Database** opens a new confirmation modal warning that the
operation is destructive and permanent. The admin must click a second
confirmation button ("Yes, restore") before the upload and restore proceed.

---

## Manifest Spec

`manifest.json` is written to the root of every new backup zip:

```json
{
  "created_at": "2026-06-07T14:30:22.000Z",
  "app": "GoLightly04",
  "environment": "production",
  "package_type": "db_and_resources",
  "database_tables": [
    "users",
    "sound_files",
    "meditations",
    "jobs_queue",
    "contract_user_meditations"
  ],
  "resources_root": "/path/to/project_resources/golightly04",
  "excluded_dirs": ["backups_db", "backups_db_and_data"]
}
```

`package_type` is `"db_and_resources"` or `"db_only"`.

---

## Admin UI Changes

| Location | Change |
|---|---|
| Database section header | Add **Include sound & resource files** checkbox (default checked) |
| "Create Backup" button | Passes checkbox value; brief loading state while the 202 API ack returns |
| After backup is triggered | Toast: "Backup job queued — refresh this page when the job completes." |
| "Restore Database" button | Opens new destructive-action confirmation modal before proceeding |
| Backup file listing | Reads from `backups_db_and_data/` instead of `backups_db/` |

---

## Auth & Security

The `/database` router already applies `requireAdmin` as its first middleware
(`router.use(requireAdmin)` at `api/src/routes/database.ts:97`). All new
endpoints added to that router inherit this protection automatically. No changes
to authentication logic are required.

The worker-node `POST /backup` endpoint is called only by the API, consistent
with the existing `POST /process` pattern. No additional auth layer is added at
this stage.

---

## Constraints

- **Memory vs disk for restore uploads**: Multer's current memory storage capped
  at 20 MB will not support large combined packages. The restore endpoint must
  use a separate disk-storage multer instance.
- **CSV helper duplication**: `toCsv` lives in `api/src/lib/csv.ts`. The
  worker-node needs it to generate the DB export. It is small (~35 lines) and
  will be duplicated into `worker-node/src/lib/csv.ts`. No new shared package is
  needed.
- **archiver dependency**: Must be added to `worker-node/package.json`. The API
  already has it.
- **Combined backup size**: Resource files (MP3s, generated audio) may be
  hundreds of MB. The zip process may take minutes. The admin should expect a
  delay before the file appears.
- **Temp directory cleanup**: The worker-node backup service must clean up the
  temp directory on both success and failure using a `try/finally` block.

---

## Open Assumptions

1. `PATH_PROJECT_RESOURCES` in the API and worker-node `.env` files points to
   the same filesystem path. Both `.env.example` files confirm this.
2. Old backup files in `backups_db/` will no longer appear in the admin
   listing. They remain on disk and must be deleted manually from the server if
   no longer needed.
3. Size estimate is V1 only if the implementation is straightforward (simple
   recursive `fs.stat` walk, ~30 lines); otherwise deferred.
4. Worker-node `POST /backup` has no auth token — consistent with how `POST
   /process` works today.
5. Resource restore is additive/overwrite: it does not delete files in
   `PATH_PROJECT_RESOURCES` that are absent from the package.
