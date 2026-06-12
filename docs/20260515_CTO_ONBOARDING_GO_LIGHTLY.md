---
created_at: 2026-05-15
updated_at: 2026-06-12
created_by: codex (gpt-5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---

# CTO Onboarding - GoLightly04

## 1. Summary

GoLightly04 is a guided meditation creation platform. Users create a meditation from ordered elements: spoken text synthesized by ElevenLabs, uploaded sound files, and silent pauses. The system stores the source content in PostgreSQL, decomposes it into `jobs_queue` rows, has the worker synthesize text and assemble audio with ffmpeg, then exposes the final MP3 through authenticated streaming.

The current architecture supports two creation modes and a newer staging lifecycle:

1. Script mode, enabled per user preference, where users write text with inline tokens for pauses, sound names, and speed blocks.
2. Form mode, the original structured element editor, still available from the create-page mode toggle for authenticated users.
3. Staged generation, where the create page generates or regenerates one private `stage = 'staged'` meditation before the user saves it to the library with final metadata.

Recent work after the original April onboarding doc added the full script-mode path, shared parser and validation contracts, DB columns for source tracking, normalized sound-name uniqueness, staged/template/library meditation stages, duration metadata, resource-inclusive backups, and a benevolent default meditation editing flow.

## 2. Current Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.9, Node.js 20+ |
| Frontend | Next.js 16, React 19, Redux Toolkit, redux-persist, TanStack Table, Tailwind CSS |
| API | Express 5, JWT auth, Google OAuth verification, nodemailer |
| Worker | Express 5, ElevenLabs REST API, fluent-ffmpeg, `@ffmpeg-installer/ffmpeg` |
| Shared packages | `@golightly/shared-types`, `@golightly/db-models` |
| ORM | Sequelize 6 |
| Database | PostgreSQL 14+ |
| Logging | winston with daily rotate files |
| Testing | Jest, supertest, ts-jest |

## 3. Repository Layout

```text
GoLightly04/
├── api/            - Express REST API on port 3000
├── worker-node/    - audio worker; .env.example uses port 3002
├── db-models/      - shared Sequelize models
├── shared-types/   - shared request types, validation constants, script parser
├── web/            - Next.js frontend on port 3001
├── docs/           - active project docs and runbooks
├── docs/archive/   - older plans and superseded docs
├── package.json    - npm workspace root
└── tsconfig.base.json
```

Read these first:

1. `shared-types/src/scriptParser.ts` for the script-mode language.
2. `api/src/routes/meditations.ts` for meditation intake and streaming routes.
3. `api/src/services/meditations/createMeditationFromElements.ts` for queue creation shared by both create modes.
4. `worker-node/src/processor/processMeditation.ts` for text job processing.
5. `worker-node/src/services/concatenator.ts` for final MP3 assembly.
6. `api/src/services/meditations/createOrRegenerateStagedMeditation.ts` for staged generation.
7. `api/src/services/meditations/saveStagedToLibrary.ts` for promoting staged audio to the library.
8. `db-models/src/models/` for the persisted contract.

## 4. Service Architecture

```text
Browser, Next.js
  |
  | REST through web/src/lib/api
  v
api, Express :3000
  |
  | POST /process with { meditationId, mode }
  v
worker-node, Express :3002 in local .env.example
  |
  | ElevenLabs text-to-speech
  | ffmpeg normalization and concatenation
  v
PATH_PROJECT_RESOURCES/
├── meditation_soundfiles/YYYYMMDD/meditation_<id>.mp3
├── eleven_labs_audio_files/YYYYMMDD/el_<meditation>_<job>_<sequence>.mp3
├── prerecorded_audio/<uploaded sound files>
├── db_backups/
│   └── backup_<timestamp>.zip
├── db_backups_and_data/
│   ├── backup_<timestamp>.zip
│   └── backup_w_sound_files_<timestamp>.zip
└── db_replenish/
    └── staged restore uploads awaiting worker processing
```

The web app talks only to the API. The API and worker share PostgreSQL through `@golightly/db-models`. Audio files are still stored on the local filesystem under `PATH_PROJECT_RESOURCES`; there is no object storage, CDN, external queue, or container setup in the repo.

## 5. Meditation Creation Flow

1. The user submits either a direct library create request (`POST /meditations/create/script` or `POST /meditations/create`) or a staged generation request (`POST /meditations/staging/generate`).
2. The API validates ownership, title, visibility, and creation payload.
3. Script mode parses the script through `parseMeditationScript(script, soundLookup)`.
4. Direct library creates call `createMeditationFromElements()`; staged creates call `createOrRegenerateStagedMeditation()`, which reuses the queue replacement helper.
5. The helper creates or replaces one `meditations` row and one `jobs_queue` row per element inside a transaction.
6. Text jobs start as `pending`; sound and pause jobs start as `complete`.
7. The API sends `POST /process` to the worker with `mode: "intake"`.
8. The worker claims pending text jobs, calls ElevenLabs, writes per-job MP3 files, and marks jobs complete.
9. When all jobs are complete, the worker normalizes every segment to 44.1 kHz mono MP3 and merges them into the final file.
10. The worker updates `meditations.status` to `complete`, then stores `filename`, `file_path`, and `duration_seconds`.
11. The frontend refreshes meditation state and streams completed audio through a short-lived stream token.
12. For staged meditations, `POST /meditations/staging/save-to-library` promotes the completed row to `stage = 'library'` with title, description, and visibility.

The API-to-worker handoff is still an HTTP notification with retries in the API client. It is not a durable queue. Worker boot reconciliation marks interrupted `pending` or `processing` work as `failed` so stuck rows are visible.

## 6. Creation Modes

### Script Mode

Script mode is available on the web create page when `users.show_script_mode_for_creating_meditations` is true. Without that preference, authenticated users see only the form editor.

Supported script tokens:

1. Plain speech text becomes `text` elements.
2. `<break time="2s" />` becomes a pause element.
3. `[Tibetan Singing Bowl]` resolves against `sound_files.name` and becomes a sound element using the stored filename.
4. `{speed=0.9}slow speech{/speed}` applies a numeric ElevenLabs speed value to text inside the block.

Parser and validation details:

1. The parser lives in `shared-types/src/scriptParser.ts` and is shared by the web client and API.
2. It is a left-to-right scanner with strict handling for reserved token starts.
3. Malformed reserved tokens return indexed `ScriptParseError` entries instead of falling through as spoken text.
4. Speeds must be between `0.7` and `1.3`.
5. Pauses must be greater than `0` and no more than `300` seconds.
6. Scripts are limited to `20_000` bytes.
7. Unknown sound names are rejected.

The API persists script-created meditations with `source_mode = 'script'` and the original script in `script_source`.

### Form/Spreadsheet Mode

Form mode is the original element editor and remains available from the create-page mode toggle. Direct creates post to `POST /meditations/create` with a `meditationArray`; the current web create flow uses staging endpoints for generate/save behavior.

Important current behavior:

1. Spreadsheet-created meditations persist `source_mode = 'spreadsheet'`.
2. `script_source` is `NULL`.
3. Speed and pause values are normalized before reaching `jobs_queue.input_data`.
4. A recent fix ensures numeric speed values are preserved, so non-default ElevenLabs speed settings now affect generated audio.

### Staged and Library Flow

The web create page now loads `GET /meditations/staging` for authenticated users. The API returns the user's current staged meditation or falls back to the single `stage = 'template'` default meditation.

Current behavior:

1. `POST /meditations/staging/generate` creates or regenerates the user's one staged meditation from either script or form elements.
2. Staged meditations are private, use title `Untitled staged meditation`, and are not returned by `GET /meditations/all`.
3. A staged meditation can only be regenerated after it is `complete` or `failed`; active `pending` and `processing` jobs are rejected as busy.
4. `POST /meditations/staging/save-to-library` requires the staged meditation to be `complete` and then updates `stage`, title, description, and visibility.
5. `GET /meditations/all` filters to `stage = 'library'`.

## 7. Web Frontend

The home page create area now uses `web/src/components/forms/CreateMeditationModeSwitcher.tsx`.

Current behavior:

1. Script mode is shown only when the authenticated user's `showScriptModeForCreatingMeditations` preference is true.
2. The selected mode persists in `localStorage` under `golightly.createMode`.
3. The persisted legacy value `spreadsheet` is normalized to `form`.
4. The active editor receives the current staged meditation and a callback to refresh it.
5. Script editor sound names are loaded from `GET /sounds/sound_files`.
6. Script editor parsing runs client-side with a short debounce.
7. Server-side parse errors replace local diagnostics on submit failure, because the API is the source of truth.

The script editor currently includes syntax highlighting, sound insertion from the catalog, structured parse diagnostics, staged generation, staged audio preview, and save-to-library metadata controls. The form editor follows the same staged generation and save-to-library pattern for structured elements.

## 8. API Surface

Core meditation endpoints:

1. `POST /meditations/create` creates a spreadsheet-mode meditation.
2. `POST /meditations/create/script` creates a script-mode meditation.
3. `GET /meditations/staging` returns the user's staged meditation or the global template meditation.
4. `POST /meditations/staging/generate` creates or regenerates a staged meditation from script or form elements.
5. `POST /meditations/staging/save-to-library` promotes a completed staged meditation into the library.
6. `GET /meditations/all` returns library-stage public meditations plus the authenticated user's private library meditations.
7. `GET /meditations/:id` returns one accessible meditation.
8. `GET /meditations/:id/stream-token` issues a stream token.
9. `GET /meditations/:id/stream` supports byte-range MP3 streaming and increments `listen_count` at stream start.
10. `PUT /meditations/:id/script` regenerates a script-sourced meditation from updated script text.
11. Update, delete, favorite, and admin routes remain documented under `docs/api-documentation/`.

Sound endpoints:

1. `GET /sounds/sound_files` returns the available sound catalog.
2. `POST /sounds/upload` is admin-only, stores files under `prerecorded_audio`, and probes `duration_seconds`.
3. `PATCH /sounds/sound_file/:id` updates admin-managed sound metadata, including nullable duration.
4. `DELETE /sounds/sound_file/:id` is admin-only and removes both DB row and file.

Database admin endpoints:

1. `POST /database/create-backup` queues a worker backup job; backups include resources by default unless `includeResources` is explicitly false.
2. DB-only backups are named `backup_<timestamp>.zip`; resource-inclusive backups are named `backup_w_sound_files_<timestamp>.zip`.
3. Backup listing, download, and delete use `PATH_PROJECT_RESOURCES/db_backups_and_data`; DB-only backups use `PATH_PROJECT_RESOURCES/db_backups`, and restore uploads are staged in `PATH_PROJECT_RESOURCES/db_replenish` before the worker processes them.
4. Restore uploads are accepted by the API and then queued to `worker-node` for background replenish processing; the worker truncates dependent tables in reverse dependency order, reloads in dependency order, resets ID sequences, and restores resource files when the manifest package type is `db_and_resources`.
5. `GET /database/backup-size-estimate` estimates resource backup size while excluding backup directories.

## 9. Data Model

| Entity | Table | Key fields | Notes |
|---|---|---|---|
| User | `users` | `email`, `password`, `auth_provider`, `is_admin`, `is_email_verified`, `show_script_mode_for_creating_meditations` | Supports local, Google, combined auth states, admin access, and the script-mode preference gate. |
| SoundFile | `sound_files` | `name`, `description`, `filename`, `duration_seconds` | Display catalog for uploaded audio. Normalized names are intended to be unique. |
| Meditation | `meditations` | `user_id`, `title`, `description`, `meditation_array`, `stage`, `source_mode`, `script_source`, `status`, `file_path`, `visibility`, `duration_seconds` | Stores original source, lifecycle stage, processing state, final file path, and final duration. |
| JobQueue | `jobs_queue` | `meditation_id`, `sequence`, `type`, `input_data`, `status`, `file_path`, `attempt_count`, `last_error`, `last_attempted_at` | One row per text, sound, or pause segment. |
| ContractUserMeditation | `contract_user_meditations` | `user_id`, `meditation_id` | Favorites/bookmarks with a unique pair. |

Current migration-backed schema additions beyond the original baseline:

1. `meditations.source_mode VARCHAR(16) NOT NULL DEFAULT 'spreadsheet'`.
2. `meditations.script_source TEXT NULL`.
3. `meditations.stage meditation_stage NOT NULL DEFAULT 'library'`, with one template row and one staged row per user enforced by partial unique indexes.
4. `meditations.duration_seconds INTEGER NULL`.
5. `sound_files.duration_seconds INTEGER NULL`.
6. `users.show_script_mode_for_creating_meditations BOOLEAN NOT NULL DEFAULT FALSE`.
7. Functional unique index expected on `sound_files (LOWER(BTRIM(name)))`, named `sound_files_name_normalized_idx`.

The current table reference at `docs/db-models/TABLE_REFERENCE.md` reflects the latest model fields as of 2026-06-09. Migration SQL files live under `db-models/migrations/`.

## 10. External Integrations

| Service | Purpose | Config |
|---|---|---|
| ElevenLabs | Text-to-speech generation | `worker-node/.env`: `API_KEY_ELEVEN_LABS`, `DEFAULT_ELEVENLABS_VOICE_ID`, `DEFAULT_ELEVENLABS_SPEED` |
| Google OAuth | User login verification | `api/.env`: `GOOGLE_CLIENT_ID`; `web/.env`: `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |
| SMTP Gmail | Email verification and reset flows | `api/.env`: `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD` |
| PostgreSQL | Durable app state and job state | Shared `PG_*` variables across API, worker, and db-models; local project roles do not require password env vars |

## 11. Running Locally

1. Install prerequisites:

   ```bash
   node --version
   psql --version
   ```

2. Provision PostgreSQL roles and database:

   ```bash
   # macOS guide
   open docs/db-models/SETUP_MAC.md

   # Ubuntu guide
   open docs/db-models/SETUP_UBUNTU.md
   ```

3. Install dependencies and build shared packages:

   ```bash
   npm install
   npm run build:shared
   ```

4. Copy and fill environment files:

   ```bash
   cp api/.env.example api/.env
   cp worker-node/.env.example worker-node/.env
   cp web/.env.example web/.env
   ```

5. Start services in separate terminals:

   ```bash
   npm run dev -w @golightly/api
   npm run dev -w @golightly/worker-node
   npm run dev -w @golightly/web
   ```

Default ports:

1. API: `3000`.
2. Web: `3001`.
3. Worker: `3002` when using `worker-node/.env.example`; the code fallback is `4001` if `PORT` is omitted.

Common gotchas:

1. The database must exist before startup.
2. The boot role provisions schema; the app role handles runtime access.
3. `PATH_PROJECT_RESOURCES` must be writable.
4. ElevenLabs configuration is needed only by the worker.
5. ffmpeg is resolved through `@ffmpeg-installer/ffmpeg`, but local ffmpeg knowledge is still useful for debugging audio issues.
6. ffprobe is resolved through `@ffprobe-installer/ffprobe` for duration probing; production has had a known install-permission pitfall on the Linux ffprobe binary.
7. Sound names referenced in scripts must exist in the uploaded sound catalog.
8. The API startup ensures admin user and key resource directories; the worker startup ensures audio directories and reconciles stuck meditations.

## 12. Testing

Relevant commands:

1. `npm test -w shared-types`.
2. `npm run build -w shared-types`.
3. `npm run build -w db-models`.
4. `npm test -w api`.
5. `npm run build -w api`.
6. `npm test -w worker-node`.
7. `npm run build -w worker-node`.
8. `npm run typecheck -w web`.
9. `npm run build -w web`.
10. `npm run typecheck:scripts`.

Coverage highlights:

1. `shared-types` now has parser tests covering valid scripts, malformed tokens, sound lookup failures, speed ranges, pause ranges, unicode, multiline input, and element ordering.
2. API tests cover script creation, staged meditation generation, metadata validation, parse errors, auth failures, duplicate sound names, backup/restore behavior, safe zip extraction, duration parsing, and normalized speed values.
3. Worker tests cover process intake, requeue mode, backup service behavior, route acceptance, and duration probing through concatenation paths.
4. Root one-shot scripts have a separate typecheck command and may use terminal `console.*` output by repo convention.

## 13. Deployment Notes

There is no Dockerfile, docker-compose setup, or CI/CD pipeline in the repository. Deployment remains manual.

Deployment order for schema-bearing changes:

1. Review `db-models/migrations/` and the relevant dated runbook for the target branch.
2. Run any preflight queries, especially duplicate normalized sound-name checks before adding or relying on the unique index.
3. Apply required schema changes before deploying API code that writes new columns.
4. Deploy API and worker before or with web changes that depend on new endpoints.
5. Run `npm install`, `npm run build:shared`, package builds, and script typecheck.
6. Restart `golightly04-api`, `golightly04-worker-node`, and `golightly04-web` or the environment-specific service names.
7. Verify active services and the expected listening ports for the environment.

Current production-oriented runbooks also call out the ffprobe Linux binary permission check after `npm install`.

## 14. Recent Commit-Derived Changes

Recent architecture-relevant commits and branches reviewed for this update:

1. `82b4039` added shared validation constants, script-mode request types, and shared-types Jest setup.
2. `c378231` fixed speed and pause normalization for job input data.
3. `a99bd4e` added the strict scanner parser and parser tests.
4. `6eb5759` added script source fields to the meditation model and normalized sound-name uniqueness behavior.
5. `2162ede` added `POST /meditations/create/script` and extracted shared creation logic.
6. `08109f6` added the web API client and script editor.
7. `661e182` added the create-page mode toggle.
8. `618c576` polished the script-mode editor and added `docs/CREATE_MEDITATION_PROMPT.md`.
9. `ff0ac1d` fixed database restore with dependent tables.
10. `c9daead` added the backup restore workflow with resource-inclusive backups.
11. `0b73ac0` added benevolent/default meditation editing and staged/template/library lifecycle behavior.
12. `08ef273` refreshed the DB table reference.

## 15. CTO Watch List

1. Durable queueing:
   The worker handoff is still an HTTP notification, not a durable queue. If the worker is unavailable at the wrong moment, the system relies on status visibility and manual recovery rather than automatic retry.

2. Requeue UX:
   Worker requeue mode exists and the admin route can requeue eligible meditations, but owner-facing retry workflows remain limited.

3. Production migrations:
   The repo uses Sequelize provisioning plus manual SQL migrations/runbooks. Production schema changes should move toward an explicit migration runner.

4. Audio storage:
   Local filesystem storage still limits multi-instance deployment and horizontal scaling, even though resource-inclusive backups now exist.

5. Script source privacy:
   `script_source` stores the full original user script. Confirm retention, export, and privacy expectations before broader launch.

6. Parser and editor contract:
   Client and server share the parser, which is good. The API must remain authoritative because sound catalog state can change between local parse and submit.

7. Sound catalog referential integrity:
   Script parsing converts sound names to filenames, but jobs and stored meditation arrays still reference filenames rather than a stable sound ID.

8. End-to-end verification:
   Script and staged generation still need live-stack verification with a real ElevenLabs key whenever the parser, worker, or create UI changes.

9. Backup blast radius:
   Resource-inclusive backups can be large and are queued through the worker. Watch worker availability, disk space, and restore permissions before production restore tests.

10. Stage invariants:
    The system relies on exactly one template meditation and at most one staged meditation per user. Keep admin maintenance scripts narrow and verify partial unique indexes before editing production data.
