# GoLightly04 — Architecture & Build Plan

**Date:** April 21, 2026

---

## Overview

GoLightly04 is a meditation creation app that allows users to build custom guided meditations composed of three types of audio elements: text-to-speech (via ElevenLabs), pre-recorded sounds (e.g. Tibetan bowls), and silence pauses. These elements are sequenced by the user, processed by a backend worker, and concatenated into a final MP3 file.

This version replaces the fragile CSV-based handoff approach of GoLightly03 with a proper database-driven pipeline and a clean monorepo architecture.

---

## Tech Stack

| Layer        | Technology                         |
| ------------ | ---------------------------------- |
| Frontend     | Next.js                            |
| API          | Express.js                         |
| Worker       | Node.js (`worker-node`)            |
| Database ORM | Sequelize (`db-models` shared pkg) |
| Database     | PostgreSQL                         |
| TTS          | ElevenLabs API                     |

---

## Monorepo Structure

```
golightly04/
├── api/               # Express.js API
├── worker-node/       # Node.js worker service
├── db-models/         # Shared Sequelize package (e.g. @golightly/db-models)
└── web/            # Next.js frontend
```

The `db-models` package is shared between `api` and `worker-node` so that any schema updates propagate to both services automatically.

---

## Server File Structure

use the `PATH_PROJECT_RESOURCES` .env variable value as the root path

```
PATH_PROJECT_RESOURCES/
├── meditation_soundfiles/      # Final concatenated meditation MP3s
├── eleven_labs_audio_files/     # Individual TTS audio responses from ElevenLabs
└── prerecorded_audio/           # Permanently stored sound files (e.g. Tibetan bowls)
```

---

## Database Tables

### `users`

| Column              | Type      | Description                                   |
| ------------------- | --------- | --------------------------------------------- |
| `id`                | INT       | Primary key for the job row                   |
| `email`             | TEXT      | required                                      |
| `password`          | TEXT      | not required                                  |
| `is_email_verified` | BOOLEAN   | required default false                        |
| `email_verified_at` | TIMESTAMP | nullable                                      |
| `is_admin`          | BOOLEAN   | `pending`, `processing`, `complete`, `failed` |
| `created_at`        | TIMESTAMP |                                               |
| `updated_at`        | TIMESTAMP |                                               |

### `jobs_queue`

Tracks every individual step in building a meditation. Each meditation submission creates multiple rows, all sharing the same `meditation_id`.

| Column          | Type      | Description                                              |
| --------------- | --------- | -------------------------------------------------------- |
| `id`            | INT       | Primary key for the job row                              |
| `meditation_id` | INT       | Groups all rows belonging to the same meditation         |
| `sequence`      | INT       | Order in which this step appears in the final meditation |
| `type`          | ENUM      | `text`, `sound`, or `pause`                              |
| `input_data`    | TEXT      | The text string, sound ID, or pause duration             |
| `status`        | ENUM      | `pending`, `processing`, `complete`, `failed`            |
| `file_path`     | TEXT      | Path to the audio file once the job is complete          |
| `created_at`    | TIMESTAMP |                                                          |
| `updated_at`    | TIMESTAMP |                                                          |

### `meditations`

Tracks completed meditations and the final output file.

| Column       | Type      | Description                                           |
| ------------ | --------- | ----------------------------------------------------- |
| `id`         | INT       | Primary key (matches `meditation_id` in `jobs_queue`) |
| `user_id`    | INT       | The user who created the meditation                   |
| `title`      | TEXT      | Meditation title                                      |
| `status`     | ENUM      | `pending`, `processing`, `complete`, `failed`         |
| `file_path`  | TEXT      | Path to final MP3 in `meditation_soundfiles/`         |
| `created_at` | TIMESTAMP |                                                       |
| `updated_at` | TIMESTAMP |                                                       |

---

## Request & Processing Flow

### 1. User Submits Meditation (Frontend → API)

- User builds a meditation as a sequence of rows, each typed as `text`, `sound`, or `pause`
- Frontend sends all rows to the API in a single request

### 2. API Intake

- API assigns a `meditation_id`
- Creates a row in the `meditations` table with status `pending`
- Creates one row per user-submitted row in the `jobs_queue` table, preserving `sequence` order
- For `sound` rows: immediately resolves the file path from the `prerecorded_audio/` directory and marks status `complete`
- For `pause` rows: marks status `complete` immediately (no file needed — handled at concatenation)
- For `text` rows: marks status `pending` and queues for ElevenLabs processing
- Notifies `worker-node` with the `meditation_id`

### 3. Worker Processing (`worker-node`)

- Receives the `meditation_id`
- Queries the `jobs_queue` table for all `pending` rows with that `meditation_id`
- For each `text` job:
  - Calls ElevenLabs API with the text
  - Saves the returned MP3 to `eleven_labs_audio_files/`
  - Updates the job row: `status = complete`, `file_path = <path>`
- After each job completes, checks if **all** job rows for that `meditation_id` are `complete`
- If yes → triggers the concatenation function

### 4. Concatenation (within `worker-node`)

- Queries all job rows for the `meditation_id`, ordered by `sequence`
- Concatenates audio files in order:
  - `text` → use file from `eleven_labs_audio_files/`
  - `sound` → use file from `prerecorded_audio/`
  - `pause` → generate silence of specified duration
- Saves final MP3 to `meditation_soundfiles/`
- Updates `meditations` table: `status = complete`, `file_path = <path>`

### 5. Serving the File (API)

- API serves completed meditation audio to the frontend, likely via streaming
- _(Details TBD)_

---

## Key Design Decisions

- **No CSV handoffs** — all state is tracked in PostgreSQL via the `jobs_queue` table
- **Shared `db-models` package** — single source of truth for schema, shared across `api` and `worker-node`
- **API is intake-only** — it does not call ElevenLabs; all audio processing happens in `worker-node`
- **Sequence integrity** — the `sequence` column in `jobs_queue` guarantees correct concatenation order
- **Sound files are pre-resolved** — the API resolves paths for `sound` rows immediately, no worker wait needed
- **Concatenation is self-triggering** — after each job completes, the worker checks if all jobs are done and auto-kicks concatenation; no external orchestrator needed
- **PostgreSQL handles concurrency** — row-level locking prevents duplicate job processing
- **PostgreSQL password** — no password to access database

## Additional Requirements

### Codebase

All subprojects should use an src/ directory to store the codebase.

### Testing

Use the docs/requirements/TEST_IMPLEMENTATION_NODE.md guidance to implement tests. If the absorbed GoLightly02 or microservice already uses a test that follows this guidance, then just use the same tests from that project adjusted to fit this new monorepo structure. Otherwise, bring this up as a concern during the assessment phase.

### Logging

Use the docs/requirements/LOGGING_NODE_JS_V07.md guidance to implement logging. If the absorbed GoLightly02 or microservice already uses a logging flow that follows this guidance, then just use the same logging flow from that project adjusted to fit this new monorepo structure. Otherwise, bring this up as a concern during the assessment phase.

### API on start up

Let's create a module that runs when the api starts. This will provision the database if the database does not already exist.

This could be multiple functions or a single function. It will:

- make the first user which will be an admin user.
- see `ADMIN_EMAIL` and `ADMIN_PASSWORD` .env variables for the email and password

---

## Open Items / Future Discussions

- [ ] Audio file naming conventions
- [ ] API streaming strategy for serving final meditation files
- [ ] Authentication & user validation
- [ ] Error handling & retry logic for failed ElevenLabs calls
- [ ] Worker polling strategy vs. push notification from API
- [ ] database `users` table, does it need a string `auth_provider` column validated as one of `local`, `google`, `both`?
