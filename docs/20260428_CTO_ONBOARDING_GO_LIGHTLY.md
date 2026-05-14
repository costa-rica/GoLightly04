# CTO Onboarding — GoLightly04

---

## 1. One-paragraph summary

GoLightly04 is a guided meditation creation platform. Users compose a meditation as an ordered sequence of three element types — spoken text (synthesized via ElevenLabs), pre-recorded sound files (e.g., Tibetan bowls), and silent pauses — and the system produces a downloadable/streamable MP3. It is a TypeScript monorepo with three running services: a Next.js frontend, an Express REST API, and a dedicated audio worker that owns all ElevenLabs calls and ffmpeg audio concatenation. All pipeline state lives in PostgreSQL. This version replaces a prior CSV-based handoff design (GoLightly03) with a proper database-driven pipeline.

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.9, Node.js 20+ |
| Frontend | Next.js 16, React 19, Redux Toolkit, redux-persist, TanStack Table |
| API / Worker | Express 5 |
| ORM | Sequelize (`@golightly/db-models` shared package) |
| Database | PostgreSQL 14+ |
| Audio processing | fluent-ffmpeg + `@ffmpeg-installer/ffmpeg`, ElevenLabs REST API |
| Auth | JWT (local), Google OAuth (`google-auth-library`, `@react-oauth/google`) |
| Email | nodemailer (SMTP, configured for Gmail) |
| Logging | winston + winston-daily-rotate-file (all three services) |
| Testing | Jest + supertest |

---

## 3. Repository layout

```
GoLightly04/
├── api/            ← Express REST API (port 3000) — intake, auth, streaming
├── worker-node/    ← Audio worker (port 3002) — ElevenLabs calls + ffmpeg concat
├── db-models/      ← Shared Sequelize models (@golightly/db-models)
├── shared-types/   ← Shared TypeScript interfaces (@golightly/shared-types)
├── web/            ← Next.js frontend (port 3001)
├── docs/           ← Provisioning guides, requirements, plan docs
├── package.json    ← npm workspace root
└── tsconfig.base.json
```

**Read first:** `db-models/src/models/` (data model), `api/src/routes/meditations.ts` (core flow), `worker-node/src/processor/processMeditation.ts` (job processor), `worker-node/src/services/concatenator.ts` (audio assembly).

---

## 4. Architecture

```
Browser (Next.js)
      │  REST (axios)
      ▼
  api (Express :3000)
      │  POST /process (fetch, 3 retries)
      ▼
worker-node (Express :3002)
      │  ElevenLabs REST API
      │  fluent-ffmpeg
      ▼
  Filesystem (PATH_PROJECT_RESOURCES)
      │
      └── meditation_soundfiles/YYYYMMDD/meditation_<id>.mp3
      └── eleven_labs_audio_files/           (per-job TTS output)
      └── prerecorded_audio/                 (admin-uploaded sound files)
```

Both `api` and `worker-node` connect to the same PostgreSQL database using the shared `@golightly/db-models` package. The web frontend never talks directly to the worker.

**Request flow for meditation creation:**

1. Frontend `POST /meditations/create` → API creates one `meditations` row + one `jobs_queue` row per element. Sound and pause jobs are immediately marked `complete`; text jobs are `pending`.
2. API fires-and-forgets `POST worker:3002/process` with `{ meditationId, mode: "intake" }`.
3. Worker iterates pending `jobs_queue` rows in sequence order. For each `text` job: calls ElevenLabs, saves MP3 to filesystem, marks job `complete`.
4. After every job completes, worker checks if all jobs for that meditation are `complete`. If yes, calls `concatenateMeditation()`.
5. Concatenator normalizes each segment to 44.1 kHz mono MP3, generates silence for pause segments, then merges all into the final file via `ffmpeg.mergeToFile`. Updates `meditations.status = complete` and writes `file_path`.
6. Frontend polls or re-fetches meditation status. When `complete`, it requests a stream token (`GET /meditations/:id/stream-token`) and streams audio via byte-range `GET /meditations/:id/stream`.

**No message queue.** The API-to-worker handoff is a synchronous HTTP POST with 3 retries and no durability guarantee (see §11).

**Startup reconciliation.** On `worker-node` boot, `reconcileStuckMeditations()` marks any `pending`/`processing` meditations as `failed` so they do not silently stall (see `worker-node/src/processor/processMeditation.ts:168`).

**In-memory dedup.** The worker maintains `activeMeditations: Set<number>` to prevent concurrent processing of the same meditation ID within one process.

---

## 5. Data model

No migrations directory. Schema is managed by Sequelize `sync` called inside `provisionDatabase()` in `db-models`. Schema changes in development will auto-apply; in production this needs care.

| Entity | Table | Key fields | Notes |
|---|---|---|---|
| **User** | `users` | `email`, `password` (bcrypt nullable), `auth_provider` (local/google/both), `is_admin`, `is_email_verified` | Password is null for Google-only users |
| **Meditation** | `meditations` | `user_id`, `title`, `meditation_array` (JSONB), `status`, `file_path`, `filename`, `visibility`, `listen_count` | `meditation_array` stores the original element spec; `jobs_queue` is the decomposed pipeline view |
| **JobQueue** | `jobs_queue` | `meditation_id`, `sequence`, `type` (text/sound/pause), `input_data` (JSON text), `status`, `file_path`, `attempt_count`, `last_error` | Row-level locking via `SELECT ... FOR UPDATE` in transactions |
| **SoundFile** | `sound_files` | `name`, `description`, `filename` | Admin-managed catalog of pre-recorded audio files |
| **ContractUserMeditation** | `contract_user_meditations` | `user_id`, `meditation_id` (unique pair) | Favorites/bookmarks — no `updated_at` |

`Meditation.meditation_array` (JSONB) and `jobs_queue` rows are created together in a single transaction on intake. They can drift if the meditation_array is ever mutated post-creation.

---

## 6. External integrations

| Service | Purpose | Auth | Config location |
|---|---|---|---|
| ElevenLabs | Text-to-speech synthesis | API key header | `worker-node/.env` → `API_KEY_ELEVEN_LABS`, `DEFAULT_ELEVENLABS_VOICE_ID`, `DEFAULT_ELEVENLABS_SPEED` |
| Google OAuth 2.0 | User sign-in | Client ID verified server-side via `google-auth-library` | `api/.env` → `GOOGLE_CLIENT_ID`; `web/.env` → `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |
| SMTP (Gmail) | Email verification, password reset | Username + app password | `api/.env` → `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD` |

No CDN, no object storage, no external queue. All audio files are stored on the local filesystem.

---

## 7. Running it locally

**Prerequisites:** Node.js 20+, PostgreSQL 14+, ffmpeg on `PATH` (`brew install ffmpeg`).

```bash
# 1. Provision PostgreSQL roles and database
#    Follow: docs/20260422_POSTGRES_DATABASE_PROVISIONING.md

# 2. Install and build all packages
npm install
npm run build:shared          # builds shared-types then db-models
npm run build -w @golightly/api
npm run build -w @golightly/worker-node

# 3. Copy and fill .env files
cp api/.env.example api/.env
cp worker-node/.env.example worker-node/.env
cp web/.env.example web/.env

# 4. Start services (three terminals)
cd api && npm start            # port 3000 — provisions DB and creates admin on first run
cd worker-node && npm start    # port 3002
cd web && npm run dev          # port 3001
```

**Common gotchas:**
- The API `onStartUp` uses the `boot` PostgreSQL role for provisioning. The `app` role (`golightly04_app`) is used for normal queries. Both must exist before starting.
- `PATH_PROJECT_RESOURCES` must be a writable directory; the API creates subdirectories on boot.
- ElevenLabs key is only needed in `worker-node`; the API never calls it directly.
- ffmpeg must be on `PATH` even though `@ffmpeg-installer/ffmpeg` bundles a binary — `concatenator.ts` calls `ffmpegInstaller.path` to set it programmatically, so the system PATH matters less than ensuring the installer package resolves.

---

## 8. Deployment

No CI/CD pipeline, Dockerfile, or docker-compose file exists in the repository. A production PostgreSQL provisioning guide is at `docs/20260423_POSTGRES_DATABASE_PROVISIONING_PRODUCTION.md`. Deployment is manual as of the current codebase state.

---

## 9. Testing

**API** (`api/tests/`): Jest + supertest integration tests covering each route group — `users`, `meditations`, `sounds`, `admin`, `database` — plus a smoke test and logger unit test. Run with `cd api && npm test`.

**Worker** (`worker-node/tests/`): Smoke test, process-route test, and a `processMeditation` service unit test. Run with `cd worker-node && npm test`.

**Web**: No tests found.

Tests run `--runInBand` (sequential). Test helpers are in `tests/helpers/setup.ts` in each package. Coverage appears limited to happy-path route assertions; edge cases around ElevenLabs failures and ffmpeg errors are not visibly covered in unit tests.

---

## 10. Active areas of work

Based on recent commits (all within April 2026) and code state:

1. **Audio pipeline stabilization** — the most recent fix commit (`7e0ae79`) resolved streaming and concatenation bugs, suggesting this path is still being hardened.
2. **DB provisioning with correct role** — `f6bce2a` fixed boot-role usage on startup; the two-role PostgreSQL setup (boot + app) is a deliberate security boundary that was recently corrected.
3. **Web frontend rebuild** — `a215ce1` was a full frontend rebuild; the deleted `web_obe/` tree in git status is the replaced predecessor.
4. **No retry/requeue path for failed meditations** — the `requeue` mode exists in the processor but there is no API endpoint or UI to trigger it for failed meditations.
5. **SoundFile catalog vs. filesystem** — `sound_files` table exists but sound elements in jobs reference filenames directly as strings, not DB IDs. The relationship between the catalog and the filesystem is implicit.

---

## 11. Open questions for the project owner

- **No durable job queue.** The API fires a single HTTP POST to the worker (3 retries) and forgets. If the worker is down, the meditation is silently stuck as `pending` with no retry mechanism. Is a persistent queue (e.g., BullMQ, PostgreSQL-backed polling) planned?
- **Schema migrations.** Sequelize `sync` is used instead of migrations. How will schema changes be applied to production data without data loss?
- **`meditation_array` vs. `jobs_queue` divergence.** Both store the element spec. Can a meditation be re-submitted or edited after creation? If so, the JSONB and queue rows can drift.
- **SoundFile DB catalog vs. filesystem.** `sound_files` rows store a `filename` but sound jobs in `jobs_queue.input_data` reference filenames as free strings. Is the DB catalog the source of truth, or is it decorative?
- **No rate limiting on ElevenLabs.** A large meditation with many text elements will fire concurrent ElevenLabs requests. Is there a plan to throttle or queue these?
- **Audio file storage.** All MP3s live on the local filesystem. What is the plan for scale, backup, or multi-instance deployment?
- **Admin route authentication.** Confirm that all `/admin` routes enforce `isAdmin` checks — this is worth a focused review before any public exposure.
