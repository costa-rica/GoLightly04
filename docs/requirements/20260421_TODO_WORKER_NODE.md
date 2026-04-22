# Worker Node — TODO

**Project:** `worker-node/` (Node.js worker service)
**Date:** 2026-04-21
**Authoritative source:** `docs/requirements/20260421_GOLIGHTLY04_PLAN_ASSESSMENT_V02.md`
**Depends on:** `@golightly/db-models` and `@golightly/shared-types` (see `20260421_TODO_DB_MODELS.md`)
**Also references:** `docs/requirements/20260421_GOLIGHTLY04_PLAN_ASSESSMENT_V04_CLAUDE.md` — worker boot-time reconciliation design

The worker receives `POST /process { meditationId }` from the API, generates ElevenLabs audio for each `text` job, then concatenates all jobs into a final MP3 using `ffmpeg`.

---

## Phase 1 — Scaffolding

- [ ] Initialize `worker-node/` as a TypeScript project with `src/` directory
- [ ] `package.json`: name `@golightly/worker-node`, scripts `dev`, `build`, `start`, `typecheck`, `test`
- [ ] `tsconfig.json` extending `tsconfig.base.json`
- [ ] Install runtime deps: `express`, `dotenv`, `winston`, `winston-daily-rotate-file`, `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg` (or document system ffmpeg as required), `axios` (or `undici`), `@golightly/db-models`
- [ ] Install devDeps: `typescript`, `ts-node-dev`, `@types/*`, `jest`, `ts-jest`, `supertest`
- [ ] Confirm `ffmpeg` is available on PATH; document installation in README
- [ ] Commit scaffolding

## Phase 2 — Logger (per `LOGGING_NODE_JS_V07.md`)

- [ ] Mirror the API's logger pattern: validate `NODE_ENV`, `NAME_APP`, `PATH_TO_LOGS`, exit on missing
- [ ] Configure Winston transports per mode; daily rotate with `LOG_MAX_SIZE`, `LOG_MAX_FILES`
- [ ] Export singleton `logger`

## Phase 3 — Bootstrap & startup

- [ ] `src/app.ts` — Express app factory exposing `POST /process`
- [ ] `src/server.ts` — async IIFE entry point: loads dotenv, runs startup checks, then `app.listen(PORT)`
- [ ] `src/startup/onStartUp.ts` — ensures `PATH_PROJECT_RESOURCES` subdirectories exist (`eleven_labs_audio_files/`, `meditation_soundfiles/`, `prerecorded_audio/` — also check `prerecorded_audio/` for read access even though the worker never writes to it)
- [ ] Use the `await new Promise(r => setTimeout(r, 100)); process.exit(1)` pattern from the logging spec for any early exit (missing env, DB connect failure)
- [ ] **Boot-time reconciliation**: after the Express server is listening, run `reconcileStuckMeditations()` in the background. This pass does not silently resume half-finished work. Instead it:
  - finds meditations stuck in `pending` or `processing`
  - marks abandoned `jobs_queue` rows that are still `pending` or `processing` as `failed`
  - preserves any already-`failed` rows as failed
  - increments no extra attempts during reconciliation itself
  - writes a clear `last_error` value such as "worker interrupted before completion" when appropriate
  - updates `meditations.status = 'failed'` when unfinished work is discovered
  - logs each reconciled meditation ID
  - leaves actual retrying to explicit admin requeue
  This keeps the status model historically truthful: unfinished work is marked failed rather than quietly reset or auto-resumed.

## Phase 4 — `POST /process` endpoint

- [ ] Accepts `{ meditationId: number, mode?: 'intake' | 'requeue' }`
- [ ] Validates the meditation exists; behavior depends on mode:
  - `intake` mode accepts meditations in `pending` or `processing`
  - `requeue` mode accepts meditations in `pending`, `processing`, or `failed`
  - returns 404 or 409 otherwise
- [ ] Responds `202 Accepted` immediately and processes asynchronously in the background — the API must not block on audio generation
- [ ] Dedupe: if a meditation is already being processed, short-circuit with 202 and log

## Phase 5 — Job processor

- [ ] `src/processor/processMeditation.ts` — main entry:
  1. Accept `mode: 'intake' | 'requeue'`
  2. Set `meditations.status = 'processing'`
  3. Select retryable rows by mode:
     - `intake` mode: fetch `jobs_queue` rows with `status = 'pending'`
     - `requeue` mode: fetch rows with `status != 'complete'`
  4. Before claiming a row in `requeue` mode, normalize any stale `processing` rows for this meditation back into a retryable path without erasing history:
     - mark them `failed`
     - set `last_error` if absent
  5. For each text job: call ElevenLabs (see Phase 6); on each attempt:
     - increment `attempt_count`
     - set `last_attempted_at = now()`
     - set `status = 'processing'` while claimed
     - on success, update the row to `status = 'complete'`, set `file_path`, and clear `last_error`
     - on failure, mark row + meditation as `'failed'`, set `last_error`, and abort
  6. After every job completes, re-query all jobs for the meditation: if **all** are `complete`, trigger concatenation (Phase 7)
  7. All DB updates must use row-level locking (`SELECT ... FOR UPDATE`) when claiming a job to prevent duplicate processing if two worker instances ever run

## Phase 6 — ElevenLabs client

- [ ] `src/services/elevenLabs.ts` — wraps the ElevenLabs HTTP API
- [ ] `generateSpeech({ text, voiceId, speed })` — returns MP3 buffer
- [ ] Reads `API_KEY_ELEVEN_LABS` from env
- [ ] Falls back to `DEFAULT_ELEVENLABS_VOICE_ID` and `DEFAULT_ELEVENLABS_SPEED` when `voiceId` or `speed` are missing from `input_data` JSON
- [ ] Writes output to `{PATH_PROJECT_RESOURCES}/eleven_labs_audio_files/{YYYYMMDD}/el_{meditationId}_{jobId}_{sequence}.mp3`, creating the date subdirectory if missing
- [ ] Tests stub `fetch`/`axios` and assert request body shape + output file path

## Phase 7 — FFmpeg concatenation

- [ ] `src/services/concatenator.ts` — `concatenateMeditation(meditationId)`:
  1. Query all jobs for the meditation, ordered by `sequence`
  2. Build an ffmpeg concat list:
     - `text` → file from `eleven_labs_audio_files/...`
     - `sound` → file from `prerecorded_audio/...`
     - `pause` → generate silent segment inline using `ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t {seconds}`
  3. Output to `{PATH_PROJECT_RESOURCES}/meditation_soundfiles/{YYYYMMDD}/meditation_{meditationId}.mp3`, creating the date subdirectory if missing
  4. Update `meditations.status = 'complete'`, `meditations.filename`, `meditations.file_path`
  5. If any input file is missing or ffmpeg fails → mark `meditations.status = 'failed'` and log with enough detail to troubleshoot
- [ ] Normalize sample rate / channels across inputs to avoid ffmpeg concat errors (re-encode all to `44100 Hz mono` before concat)
- [ ] Tests use tiny fixture MP3s and assert the output file is created with a non-zero size

## Phase 8 — Error handling & resilience

- [ ] Wrap each job's processing in `try/catch`; log the full error with `meditationId`, `jobId`, `sequence`
- [ ] On ElevenLabs failure: mark the individual `jobs_queue` row `failed`, set `last_error`, set `last_attempted_at`, increment `attempt_count`, and mark `meditations.status = failed`. Do not process further jobs for that meditation. No automatic retry (per plan).
- [ ] On ffmpeg failure: mark `meditations.status = failed`; do not retry automatically. If a job-level error record is useful for admin visibility, populate `last_error` on the affected row or store a meditation-level failure log.
- [ ] Log `logger.error()` on all failures for systemd tailing visibility

## Phase 9 — Tests

- [ ] Suite layout follows `TEST_IMPLEMENTATION_NODE.md`: `tests/smoke/`, `tests/routes/`, `tests/services/`, `tests/helpers/`
- [ ] Mock `@golightly/db-models` at the module boundary
- [ ] Mock the ElevenLabs HTTP client; assert it is called with the expected voiceId/speed
- [ ] Mock or sandbox `fluent-ffmpeg` for concatenation tests
- [ ] `POST /process` route test covers: unknown meditation → 404, already complete → 409, pending intake → 202, failed requeue → 202
- [ ] Processor unit test: all-text meditation → all jobs transition `pending → complete`, meditation concatenates to `complete`
- [ ] Processor unit test: ElevenLabs failure → meditation ends at `failed`, `attempt_count` increments, `last_error` is persisted, subsequent jobs untouched
- [ ] Processor unit test: requeue mode processes previously failed jobs without first rewriting them to `pending`
- [ ] Reconciliation unit test: stranded `pending`/`processing` jobs are marked `failed` with reconciliation error text and are not auto-resumed

## Phase 10 — Final pass

- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] README documents ffmpeg as a system dependency and lists required env vars
- [ ] Commit referencing this TODO

---

## Definition of done

- `POST /process` accepts a meditationId and returns 202 immediately
- An all-text meditation runs end-to-end: ElevenLabs calls → files on disk → concatenated MP3 → `meditations.status = complete` with `file_path` populated
- A meditation with mixed text/sound/pause concatenates in correct sequence order
- A failed ElevenLabs call marks the job + meditation `failed` and stops processing
- `onStartUp.ts` ensures all required directories exist on cold start
- Jest suite passes, typecheck clean
