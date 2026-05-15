---
created_at: 2026-05-15
updated_at: 2026-05-15
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# CTO Onboarding - GoLightly04

## 1. Summary

GoLightly04 is a guided meditation creation platform. Users create a meditation from ordered elements: spoken text synthesized by ElevenLabs, uploaded sound files, and silent pauses. The system stores the source content in PostgreSQL, decomposes it into `jobs_queue` rows, has the worker synthesize text and assemble audio with ffmpeg, then exposes the final MP3 through authenticated streaming.

The current architecture supports two creation modes:

1. Script mode, now the default web flow, where users write text with inline tokens for pauses, sound names, and speed blocks.
2. Spreadsheet mode, the original structured element editor, still available from the create-page mode toggle.

Recent commits after the original April onboarding doc added the full script-mode path, shared parser and validation contracts, DB columns for source tracking, normalized sound-name uniqueness, a script editor in the web app, and a fix for restoring database backups with dependent tables.

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
├── worker-node/    - audio worker on port 3002
├── db-models/      - shared Sequelize models
├── shared-types/   - shared request types, validation constants, script parser
├── web/            - Next.js frontend on port 3001
├── docs/           - active project docs and runbooks
├── docs/archived/  - older plans and superseded docs
├── package.json    - npm workspace root
└── tsconfig.base.json
```

Read these first:

1. `shared-types/src/scriptParser.ts` for the script-mode language.
2. `api/src/routes/meditations.ts` for meditation intake and streaming routes.
3. `api/src/services/meditations/createMeditationFromElements.ts` for queue creation shared by both create modes.
4. `worker-node/src/processor/processMeditation.ts` for text job processing.
5. `worker-node/src/services/concatenator.ts` for final MP3 assembly.
6. `db-models/src/models/` for the persisted contract.

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
worker-node, Express :3002
  |
  | ElevenLabs text-to-speech
  | ffmpeg normalization and concatenation
  v
PATH_PROJECT_RESOURCES/
├── meditation_soundfiles/YYYYMMDD/meditation_<id>.mp3
├── eleven_labs_audio_files/YYYYMMDD/el_<meditation>_<job>_<sequence>.mp3
├── prerecorded_audio/<uploaded sound files>
└── backups_db/backup_<timestamp>.zip
```

The web app talks only to the API. The API and worker share PostgreSQL through `@golightly/db-models`. Audio files are still stored on the local filesystem under `PATH_PROJECT_RESOURCES`; there is no object storage, CDN, external queue, or container setup in the repo.

## 5. Meditation Creation Flow

1. The user submits either `POST /meditations/create/script` or `POST /meditations/create`.
2. The API validates ownership, title, visibility, and creation payload.
3. Script mode parses the script through `parseMeditationScript(script, soundLookup)`.
4. Both modes call `createMeditationFromElements()`.
5. The helper creates one `meditations` row and one `jobs_queue` row per element inside a transaction.
6. Text jobs start as `pending`; sound and pause jobs start as `complete`.
7. The API sends `POST /process` to the worker with `mode: "intake"`.
8. The worker claims pending text jobs, calls ElevenLabs, writes per-job MP3 files, and marks jobs complete.
9. When all jobs are complete, the worker normalizes every segment to 44.1 kHz mono MP3 and merges them into the final file.
10. The worker updates `meditations.status` to `complete`, then stores `filename` and `file_path`.
11. The frontend refreshes meditation state and streams completed audio through a short-lived stream token.

The API-to-worker handoff is still an HTTP notification with retries in the API client. It is not a durable queue. Worker boot reconciliation marks interrupted `pending` or `processing` work as `failed` so stuck rows are visible.

## 6. Creation Modes

### Script Mode

Script mode is the current default on the web create page.

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

### Spreadsheet Mode

Spreadsheet mode is the original element editor and remains available behind the create-page mode toggle. It posts to `POST /meditations/create` with a `meditationArray`.

Important current behavior:

1. Spreadsheet-created meditations persist `source_mode = 'spreadsheet'`.
2. `script_source` is `NULL`.
3. Speed and pause values are normalized before reaching `jobs_queue.input_data`.
4. A recent fix ensures numeric speed values are preserved, so non-default ElevenLabs speed settings now affect generated audio.

## 7. Web Frontend

The home page create area now uses `web/src/components/forms/CreateMeditationModeSwitcher.tsx`.

Current behavior:

1. Script mode is the default for authenticated users.
2. The selected mode persists in `localStorage` under `golightly.createMode`.
3. Both editors remain mounted while hidden, so switching modes during a session does not discard local form state.
4. Script editor sound names are loaded from `GET /sounds/sound_files`.
5. Script editor parsing runs client-side with a short debounce.
6. Server-side parse errors replace local diagnostics on submit failure, because the API is the source of truth.

The script editor currently includes syntax highlighting, sound insertion from the catalog, title and description validation, visibility selection, structured parse diagnostics, and meditation list refresh after successful submission.

Note: there are unstaged web UI polish changes in the current worktree. This document is based on committed architecture and current source files, but those unstaged polish edits should be reviewed separately before commit.

## 8. API Surface

Core meditation endpoints:

1. `POST /meditations/create` creates a spreadsheet-mode meditation.
2. `POST /meditations/create/script` creates a script-mode meditation.
3. `GET /meditations/all` returns public meditations plus the authenticated user's private meditations.
4. `GET /meditations/:id` returns one accessible meditation.
5. `GET /meditations/:id/stream-token` issues a stream token.
6. `GET /meditations/:id/stream` supports byte-range MP3 streaming.
7. Update, delete, favorite, and admin routes remain documented under `docs/api-documentation/`.

Sound endpoints:

1. `GET /sounds/sound_files` returns the available sound catalog.
2. `POST /sounds/upload` is admin-only and stores files under `prerecorded_audio`.
3. `DELETE /sounds/sound_file/:id` is admin-only and removes both DB row and file.

Database admin endpoints:

1. Backups export the main tables into CSV files inside a zip.
2. Restore now truncates dependent tables in reverse dependency order and reloads in dependency order.
3. The restore fix was added in commit `ff0ac1d` after dependent-table restore failures.

## 9. Data Model

| Entity | Table | Key fields | Notes |
|---|---|---|---|
| User | `users` | `email`, `password`, `auth_provider`, `is_admin`, `is_email_verified` | Supports local, Google, and combined auth states. |
| SoundFile | `sound_files` | `name`, `description`, `filename` | Display catalog for uploaded audio. Normalized names are intended to be unique. |
| Meditation | `meditations` | `user_id`, `title`, `description`, `meditation_array`, `source_mode`, `script_source`, `status`, `file_path`, `visibility` | Stores both original source and processing state. |
| JobQueue | `jobs_queue` | `meditation_id`, `sequence`, `type`, `input_data`, `status`, `file_path`, `attempt_count`, `last_error` | One row per text, sound, or pause segment. |
| ContractUserMeditation | `contract_user_meditations` | `user_id`, `meditation_id` | Favorites/bookmarks with a unique pair. |

Recent schema additions:

1. `meditations.source_mode VARCHAR(16) NOT NULL DEFAULT 'spreadsheet'`.
2. `meditations.script_source TEXT NULL`.
3. Functional unique index expected on `sound_files (LOWER(BTRIM(name)))`.

The deploy SQL for those changes is documented in `docs/20260514_DEPLOY_RUNBOOK_SCRIPT_MODE.md`.

Important model caveat:

1. The Sequelize model declares `sourceMode` and `scriptSource`.
2. The production database still needs the SQL runbook applied before deploying API code that writes those fields.
3. `docs/db-models/TABLE_REFERENCE.md` may need a follow-up refresh because it does not yet list the latest meditation columns.

## 10. External Integrations

| Service | Purpose | Config |
|---|---|---|
| ElevenLabs | Text-to-speech generation | `worker-node/.env`: `API_KEY_ELEVEN_LABS`, `DEFAULT_ELEVENLABS_VOICE_ID`, `DEFAULT_ELEVENLABS_SPEED` |
| Google OAuth | User login verification | `api/.env`: `GOOGLE_CLIENT_ID`; `web/.env`: `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |
| SMTP Gmail | Email verification and reset flows | `api/.env`: `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD` |
| PostgreSQL | Durable app state and job state | Shared `PG_*` variables across API, worker, and db-models |

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
   cd api && npm run dev
   cd worker-node && npm run dev
   cd web && npm run dev
   ```

Default ports:

1. API: `3000`.
2. Web: `3001`.
3. Worker: `3002`.

Common gotchas:

1. The database must exist before startup.
2. The boot role provisions schema; the app role handles runtime access.
3. `PATH_PROJECT_RESOURCES` must be writable.
4. ElevenLabs configuration is needed only by the worker.
5. ffmpeg is resolved through `@ffmpeg-installer/ffmpeg`, but local ffmpeg knowledge is still useful for debugging audio issues.
6. Sound names referenced in scripts must exist in the uploaded sound catalog.

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

Coverage highlights:

1. `shared-types` now has parser tests covering valid scripts, malformed tokens, sound lookup failures, speed ranges, pause ranges, unicode, multiline input, and element ordering.
2. API tests cover the script creation endpoint, validation failures, parse errors, auth failures, duplicate sound names, and normalized speed values.
3. Worker tests cover process intake, requeue mode, service behavior, and route acceptance.
4. Phase 8 end-to-end verification in `docs/20260514_TODO_SCRIPT_MODE_MEDITATIONS.md` is still unchecked and should be completed against a live stack with a real ElevenLabs key.

## 13. Deployment Notes

There is no Dockerfile, docker-compose setup, or CI/CD pipeline in the repository. Deployment remains manual.

Script-mode deployment order:

1. Run the duplicate sound-name preflight query.
2. Resolve duplicate normalized sound names.
3. Apply the `meditations.source_mode` and `meditations.script_source` SQL.
4. Create the normalized sound-name unique index.
5. Deploy the API and worker.
6. Deploy the web app.
7. Run the Phase 8 verification checklist.

Do not deploy the updated API before applying the SQL columns. New meditation inserts write `source_mode` and `script_source`.

## 14. Recent Commit-Derived Changes

Recent architecture-relevant commits reviewed for this update:

1. `82b4039` added shared validation constants, script-mode request types, and shared-types Jest setup.
2. `c378231` fixed speed and pause normalization for job input data.
3. `a99bd4e` added the strict scanner parser and parser tests.
4. `6eb5759` added script source fields to the meditation model and normalized sound-name uniqueness behavior.
5. `2162ede` added `POST /meditations/create/script` and extracted shared creation logic.
6. `08109f6` added the web API client and script editor.
7. `661e182` added the create-page mode toggle.
8. `618c576` polished the script-mode editor and added `docs/CREATE_MEDITATION_PROMPT.md`.
9. `ff0ac1d` fixed database restore with dependent tables.

## 15. CTO Watch List

1. Durable queueing:
   The worker handoff is still an HTTP notification, not a durable queue. If the worker is unavailable at the wrong moment, the system relies on status visibility and manual recovery rather than automatic retry.

2. Requeue UX:
   Worker requeue mode exists, but the product-facing retry path for failed meditations still needs clear owner workflows.

3. Production migrations:
   The repo uses Sequelize sync plus manual SQL runbooks. Production schema changes should move toward explicit migration tooling.

4. Audio storage:
   Local filesystem storage limits multi-instance deployment, backup strategy, and horizontal scaling.

5. Script source privacy:
   `script_source` stores the full original user script. Confirm retention, export, and privacy expectations before broader launch.

6. Parser and editor contract:
   Client and server share the parser, which is good. The API must remain authoritative because sound catalog state can change between local parse and submit.

7. Sound catalog referential integrity:
   Script parsing converts sound names to filenames, but jobs and stored meditation arrays still reference filenames rather than a stable sound ID.

8. End-to-end verification:
   Phase 8 in the script-mode TODO remains incomplete. Run it before treating script mode as production-ready.

9. Documentation drift:
   `docs/db-models/TABLE_REFERENCE.md` appears to predate the latest `source_mode` and `script_source` fields and should be refreshed.

10. Current dirty worktree:
    There are unstaged web UI changes in the worktree. Decide whether to commit, discard, or document them separately before release.
