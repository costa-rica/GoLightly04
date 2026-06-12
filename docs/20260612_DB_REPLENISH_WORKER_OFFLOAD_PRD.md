---
created_at: 2026-06-12
updated_at: 2026-06-12
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# PRD: Database Replenish Worker Offload + `db_` Directory Convention

## 1. Overview / Problem Statement

The database **replenish** operation (restore the database and resource files from an
uploaded `.zip`) is the **only heavy database operation still executed synchronously inside
an API request**. Today the API receives the multipart upload, writes it to the OS temp
directory, extracts the archive, truncates five tables, bulk-inserts the CSV rows, restores
resource files, and resets the Postgres sequences — **all before sending the HTTP response**
(`api/src/routes/database.ts:221-320`).

Backups have already been offloaded: `POST /database/create-backup` simply asks the
worker-node service to do the work and returns `202 Accepted`
(`api/src/services/workerClient.ts` → worker `POST /backup`). Replenish is the last piece
that has not been moved.

As datasets grow, doing restore work inside the user-facing API request is a liability:

- Long-running restores risk HTTP/proxy timeouts and tie up the API event loop.
- Extract + bulk-insert holds significant memory in the user-facing service.
- There is no path for **large, out-of-band uploads** — files that are too big to push
  through the browser/API at all.

This feature moves the replenish heavy lifting into **worker-node**, mirroring the existing
backup pattern, and standardizes the DB-related `project_resources` subdirectory names under
a consistent `db_` prefix. It also establishes the trigger mechanism for a future workflow
where a large `.zip` is placed directly on the server and the worker is told to ingest it.

## 2. Goals / Non-Goals

### Goals

- Move the replenish heavy lifting (extract, truncate, bulk-insert, resource restore,
  sequence reset) **out of the API and into worker-node**.
- Make the API a thin **save-the-zip-and-delegate** layer that returns `202 Accepted`
  immediately.
- Add a worker-node endpoint (`POST /replenish`) that both the web-app flow and a future
  separate upload process can trigger.
- Standardize DB-related `project_resources` subdirectories on a `db_` prefix:
  `db_backups`, `db_backups_and_data`, `db_replenish`.

### Non-Goals

- **Authentication on the worker** — the new endpoint follows the existing network-trust
  convention used by `/process` and `/backup`. (Deferred; see Future Work.)
- **Progress polling UI / status endpoint** — replenish is fire-and-forget for now.
- **The separate large-file upload tool itself** — this PRD only specifies the worker
  trigger endpoint that such a tool will call.
- **Dual-read directory migration** — the rename is a clean cut-over plus a one-time ops
  step, not a backward-compatible dual-read.

## 3. Decisions (locked with product owner)

1. **API fully delegates.** API saves the uploaded `.zip` into `db_replenish/`, calls the
   new worker endpoint, and returns `202`. The synchronous truncate/bulk-insert block is
   **removed from the API entirely** and reimplemented in worker-node.
2. **Worker auth: keep network-trust (no auth).** Consistent with the current worker
   endpoints. Both services are expected to run on a private/protected network.
3. **Directory rename: cut-over + ops rename step.** Code switches to the `db_` names; a
   one-time operations step renames the on-disk directories. No dual-read code.
4. **Replenish status: fire-and-forget only.** Worker returns `202`, returns `409` when a
   replenish is already running (in-memory `isReplenishRunning()` flag). No progress
   polling. Rationale: the `jobs_queue` table is truncated mid-replenish, so it cannot be
   used to track the replenish job's own status.

## 4. Directory Naming Convention

All DB-related `project_resources` subdirectories adopt a `db_` prefix.

| Current name          | New name              | Purpose                                   |
| --------------------- | --------------------- | ----------------------------------------- |
| `backups_db`          | `db_backups`          | DB-only backups                           |
| `backups_db_and_data` | `db_backups_and_data` | DB + resource-file backups (primary)      |
| _(new)_               | `db_replenish`        | Inbound `.zip` files staged for restore   |

Non-DB resource directories are unchanged: `meditation_soundfiles`,
`eleven_labs_audio_files`, `prerecorded_audio`.

## 5. Current State (reference)

- **API synchronous replenish:** `api/src/routes/database.ts:221-320`
  (`POST /database/replenish-database`). Uses `uploadLarge` multer middleware (500 MB,
  writes to `os.tmpdir()`), then `safeExtractZip`, manifest validation
  (`isValidManifest`), `safeRestoreResources`, a single transaction that `TRUNCATE`s tables
  in reverse `TABLE_ORDER`, `bulkCreate`s parsed CSV rows, and `resetTableIdSequence` per
  table. Cleans up temp files in a `finally` block.
- **Backup pattern to mirror:**
  - Worker service: `worker-node/src/services/backupService.ts` (`createBackup`,
    `isBackupRunning`, `EXCLUDED_BACKUP_DIRS` at line 22, manifest `excluded_dirs` at line
    133).
  - Worker route: `worker-node/src/app.ts` `POST /backup` — checks `isBackupRunning()`,
    returns `409` if busy, else `202` and fires `void createBackup(...)` without awaiting.
  - API caller: `api/src/services/workerClient.ts` `requestWorkerBackup()` — `fetch` to
    `${URL_WORKER_NODE}/backup`, retry/backoff, `WorkerConflictError` on `409`.
- **Path helpers:** `api/src/lib/projectPaths.ts` and `worker-node/src/lib/projectPaths.ts`
  both define `getBackupsPath()` (`backups_db`) and `getFullBackupsPath()`
  (`backups_db_and_data`).
- **Startup directory creation:** `api/src/startup/onStartUp.ts:16-23` mkdir loop
  (`meditation_soundfiles`, `eleven_labs_audio_files`, `prerecorded_audio`, `backups_db`).
- **Reusable restore helpers** currently in `api/src/lib`: `safeExtractZip`,
  `safeRestoreResources`, `parseCsv`, and the manifest validation logic. These move (or are
  shared) into worker-node.
- **Worker conventions:** Express app factory `createApp()` in `worker-node/src/app.ts`;
  fire-and-forget async via `void fn().catch(logger.error)`; Winston logger per
  `docs/LOGGING_NODE_JS_V08.md`; DB access via `getDb()` in `worker-node/src/lib/db.ts`;
  CSV util `worker-node/src/lib/csv.ts`; env validation in `worker-node/src/config/env.ts`.

## 6. Proposed Architecture

### 6.1 Web-app flow (phase 1 — available now)

```
Web admin upload (.zip, multipart)
  → API  POST /database/replenish-database
       → API streams the file to PATH_PROJECT_RESOURCES/db_replenish/<timestamped>.zip
       → API calls requestWorkerReplenish({ filename })
       → Worker responds 202 (or 409 if busy)
       → API responds 202 to the web app  ("Replenish queued")
  → Worker (background): extract → restore resources → truncate tables
       → bulk-insert CSV rows → reset sequences → cleanup
```

The API no longer touches the database for replenish. It only persists the upload to the
staging directory and delegates.

### 6.2 Large-file flow (phase 2 — enabled by this endpoint, tool out of scope)

```
External process places <file>.zip into PATH_PROJECT_RESOURCES/db_replenish/
  → caller issues POST /replenish { filename } directly to worker-node
  → Worker (background): same restore work as above
```

Because the worker reads from the shared `db_replenish/` directory by filename, an
out-of-band uploader can drop a large archive on the server (scp/rsync/etc.) and then fire a
single HTTP call to trigger ingestion — no large payload ever flows through the API.

### 6.3 Worker endpoint: `POST /replenish`

- **Request body:** `{ "filename": "<name>.zip" }` — the basename of a file already present
  in `db_replenish/`.
- **Validation:**
  - `400` if `filename` is missing, not a string, contains path separators / `..`
    (path-traversal guard), or does not resolve to an existing file inside `db_replenish/`.
  - `409` if `isReplenishRunning()` is `true`.
- **Success:** `202 { accepted: true }`, then fire-and-forget
  `void replenishDatabase(filename).catch((e) => logger.error(...))`.

### 6.4 Worker service: `replenishService.ts`

New `worker-node/src/services/replenishService.ts`, exporting:

- `isReplenishRunning(): boolean` — backed by a module-level `let _isReplenishRunning`.
- `replenishDatabase(filename: string): Promise<void>` — sets the running flag, resolves the
  full path via the new `db_replenish` path helper, then performs the restore logic ported
  from the API route:
  1. Extract the zip to a worker temp directory (`safeExtractZip`).
  2. Read + validate `manifest.json`; if `package_type === "db_and_resources"`, restore
     resource files (`safeRestoreResources`).
  3. In a single transaction: `TRUNCATE` tables in reverse `TABLE_ORDER` `CASCADE`, parse
     each `<table>.csv` (`parseCsv` + row normalization), `bulkCreate`, then reset each
     table's id sequence.
  4. Clean up the temp directory; resolve the staged zip (see §10 on retention).
  5. Reset the running flag in a `finally` block; log start / success / failure per the
     logging spec.

  Uses `getDb()` (`worker-node/src/lib/db.ts`) for models + Sequelize, and the worker CSV
  util (`worker-node/src/lib/csv.ts`).

## 7. Detailed Changes (specification — implemented in a follow-up task)

### 7.1 Directory convention

- **Path helpers** (`api/src/lib/projectPaths.ts`, `worker-node/src/lib/projectPaths.ts`):
  point `getBackupsPath()` → `db_backups`, `getFullBackupsPath()` → `db_backups_and_data`.
  Add a `getReplenishPath(...segments)` (or `getDbReplenishPath`) helper returning
  `db_replenish` in both packages.
- **Backup exclusions** (`worker-node/src/services/backupService.ts:22,133`): update
  `EXCLUDED_BACKUP_DIRS` and the manifest `excluded_dirs` array to the new names, and add
  `db_replenish` so staged inbound archives are never swept into a backup.
- **Size-estimate skip** (`api/src/routes/database.ts:119`): update the root-dir skip check
  to the new names and include `db_replenish`.
- **Startup mkdir** (`api/src/startup/onStartUp.ts:16-23`): replace `backups_db` with
  `db_backups` and add `db_replenish`. Ensure the worker also guarantees `db_replenish`
  exists at startup (worker `onStartUp`).

### 7.2 API route rewrite — `POST /database/replenish-database`

- Keep the `uploadLarge` multer upload, but stage the file into
  `getReplenishPath('<timestamped>.zip')` instead of `os.tmpdir()`.
- Call `requestWorkerReplenish({ filename })`, return `202` with a "Replenish queued"
  message. On `WorkerConflictError` return `409`; on worker-unreachable return `503` (mirror
  the `create-backup` handler).
- **Delete** the synchronous extract / manifest / resource-restore / transaction / sequence
  logic and the now-unused imports (`os`, `safeExtractZip`, `safeRestoreResources`,
  `parseCsv`, `getDb` use within this route, `TABLE_ORDER` if unused elsewhere, etc.).

### 7.3 API worker client

- Add `requestWorkerReplenish({ filename })` to `api/src/services/workerClient.ts`,
  mirroring `requestWorkerBackup` (POST `${URL_WORKER_NODE}/replenish`, retry/backoff,
  `WorkerConflictError` on `409`, error on unreachable).

### 7.4 Worker

- Register `POST /replenish` in `worker-node/src/app.ts` next to `/backup`.
- Add `worker-node/src/services/replenishService.ts` (§6.4).
- Make the restore helpers (`safeExtractZip`, `safeRestoreResources`, manifest validation)
  available to worker-node — either move them from `api/src/lib` into a shared location or
  port equivalents into `worker-node/src/lib`. (Recommendation: since the API will no longer
  use them, move them to worker-node; if a shared package already hosts similar utilities,
  prefer that.)

### 7.5 Shared types

- If the API→worker payload/response is typed in `@golightly/shared-types`, add the
  replenish request (`{ filename }`) and response types alongside the existing backup types.

## 8. Web App Impact

- `web/src/lib/api/database.ts` `replenishDatabase()` still POSTs the multipart file to the
  same API path — no client contract change.
- The success UX changes from a synchronous "Database restored. X tables, Y rows." result to
  an **asynchronous acknowledgement** ("Replenish queued"), since the work now happens in the
  background. Update the admin restore success toast and the `ModalConfirmRestore` copy in
  `web/src/app/admin/page.tsx` accordingly (the warning that all current data will be
  replaced still applies).

## 9. Migration / Operations Runbook

One-time step on each server, under `PATH_PROJECT_RESOURCES` (e.g.
`/home/limited_user/project_resources/GoLightly/`):

```bash
cd "$PATH_PROJECT_RESOURCES"
mv backups_db          db_backups
mv backups_db_and_data db_backups_and_data
mkdir -p db_replenish
```

- Existing on-disk `.zip` backups move with their directories — no data loss.
- **Deploy order:** ship worker-node with (or before) the API so that when the API begins
  delegating, the worker `POST /replenish` endpoint already exists.
- The directory rename is a clean cut-over; there is no dual-read fallback, so the `mv` step
  must run as part of the same deploy.

## 10. Risks & Mitigations

- **Destructive operation with no auth.** Mitigation: same network-trust posture as the
  existing worker endpoints; `db_replenish` is server-local; the `409` running-guard
  prevents concurrent/overlapping replenish runs. Auth can be layered on later across all
  worker endpoints uniformly (Future Work).
- **Lower failure visibility (fire-and-forget).** Mitigation: structured start/success/
  failure logging per `docs/LOGGING_NODE_JS_V08.md`; restored state remains verifiable via
  the existing `backups-list` / data views. (A status endpoint can be added later if
  operations need it.)
- **Staged zip lifecycle.** After a run the archive remains in `db_replenish/`.
  Recommendation: on success, **delete** the staged zip (or move it to a
  `db_replenish/processed/` subfolder for audit). Decide during implementation; default to
  delete-on-success to bound disk growth.
- **Partial restore on mid-transaction failure.** The truncate + bulk-insert run in a single
  transaction (as today), so a failure rolls back to the pre-replenish state — preserved by
  keeping the transactional restore intact when porting it to the worker.

## 11. Open Questions / Future Work

- **Separate large-file upload tool** — the process that places archives into
  `db_replenish/` and calls the worker (out of scope here).
- **Authentication** — optional shared-secret/token across worker endpoints if the trust
  boundary changes.
- **Status / progress endpoint** — optional `GET /replenish/status` if operations later need
  visibility into in-flight runs.

## 12. Documentation Consistency (follow-up when code lands)

Update remaining references to the old directory names when the implementation merges:

- `docs/20260515_CTO_ONBOARDING_GO_LIGHTLY.md` (architecture diagram + backup-path notes).
- `docs/db-models/SETUP_MAC.md`, `docs/db-models/SETUP_UBUNTU.md` (references to
  `{PATH_PROJECT_RESOURCES}/backups_db`).
- Worker / API READMEs if they enumerate subdirectory names.

## 13. Testing Strategy

- **Worker route** (`worker-node/tests/routes/`, mirroring `backup.routes.test.ts`):
  `202` accept; `409` when `isReplenishRunning()` is true; `400` on missing/invalid filename
  or path-traversal; `400`/`404` when the file is not present in `db_replenish/`.
- **Worker service** (`worker-node/tests/services/`, mirroring `backupService.test.ts`):
  `replenishDatabase` against a test DB — extract a fixture zip, verify tables truncated +
  rows inserted + sequences reset, and resources restored for a `db_and_resources` package.
- **API route** (`api/tests/database/database.routes.test.ts`): assert
  `/replenish-database` stages the upload into `db_replenish/` and calls the worker client,
  and that **no database mutation happens in the API** anymore.
- **Fixture/dir-name updates:** update API and worker test fixtures to the new `db_` names.
