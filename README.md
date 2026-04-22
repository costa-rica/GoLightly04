<img src="docs/images/golightlyLogo02.png" alt="GoLightly Logo" width="220" />

# GoLightly04

A guided meditation platform where users create custom meditations by composing text-to-speech segments, sound files, and silence. Built as a TypeScript monorepo with a Next.js frontend, Express API, and a dedicated audio worker service.

---

## Project Overview

GoLightly04 generates personalized meditation audio by sending user-defined element sequences to ElevenLabs for text-to-speech synthesis, then concatenating the resulting segments with prerecorded sound files and silent pauses into a final MP3 using ffmpeg.

Stack: Next.js 16, React 19, Redux Toolkit, Express, Sequelize, PostgreSQL, ElevenLabs API, ffmpeg.

---

## Setup

Prerequisites:

- Node.js 20+
- PostgreSQL 14+ (see [docs/20260422_POSTGRES_DATABASE_PROVISIONING.md](docs/20260422_POSTGRES_DATABASE_PROVISIONING.md) for role and database setup)
- ffmpeg installed on PATH (`brew install ffmpeg` on macOS)

Install and build all packages from the repo root:

1. `npm install`
2. `npm run build --workspaces`

Each package (`api`, `worker-node`, `web`) also has its own `.env` — copy `.env.example` to `.env` in each and fill in the values before starting.

---

## Usage

Start each service in a separate terminal:

```bash
# API (port 3000)
cd api && npm start

# Worker node (port 3002)
cd worker-node && npm start

# Web frontend (port 3001)
cd web && npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in a browser.

On first API start, `onStartUp` provisions the database schema and creates the admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in the API `.env`.

---

## Project Structure

```
GoLightly04/
├── api/                        # Express REST API
│   └── src/
│       ├── routes/             # users, meditations, sounds, admin, database
│       ├── services/           # email, workerClient, deleteMeditationCascade
│       ├── middleware/         # auth, errorHandler, validate, upload
│       ├── startup/onStartUp.ts
│       └── app.ts
├── worker-node/                # Audio generation worker
│   └── src/
│       ├── processor/          # processMeditation.ts
│       ├── services/           # elevenLabs.ts, concatenator.ts
│       └── app.ts              # POST /process endpoint
├── web/                        # Next.js frontend
│   └── src/
│       ├── app/                # pages: home, admin, auth flows
│       ├── components/         # AudioPlayer, tables, modals, forms
│       ├── store/              # Redux slices: auth, meditation, ui
│       └── lib/api/            # typed API client methods
├── db-models/                  # Shared Sequelize models (@golightly/db-models)
│   └── src/
│       ├── models/             # User, Meditation, JobQueue, SoundFile, ContractUserMeditation
│       └── config/             # sequelize factory, env validation
├── shared-types/               # Shared TypeScript types (@golightly/shared-types)
│   └── src/                    # meditation, user, admin, sounds, database, error
├── docs/
│   ├── requirements/           # planning and spec documents
│   └── 20260422_POSTGRES_DATABASE_PROVISIONING.md
├── package.json                # npm workspace root
└── tsconfig.base.json
```

---

## .env

Each package has its own `.env`. Common variables across services:

```
# Shared across api and worker-node
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=golightly04_dev
PG_USER=golightly04_boot
PG_APP_ROLE=golightly04_app
PG_SCHEMA=public

NODE_ENV=development
PATH_TO_LOGS=/path/to/logs
PATH_PROJECT_RESOURCES=/path/to/project_resources/golightly04
```

API-specific:

```
NAME_APP=GoLightly04API
PORT=3000
JWT_SECRET=
URL_BASE_WEBSITE=http://localhost:3001
URL_WORKER_NODE=http://localhost:3002
ADMIN_EMAIL=
ADMIN_PASSWORD=
GOOGLE_CLIENT_ID=
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_FROM=GoLightly <your-email>
```

Worker-node-specific:

```
NAME_APP=GoLightly04WorkerNode
PORT=3002
API_KEY_ELEVEN_LABS=
DEFAULT_ELEVENLABS_VOICE_ID=
DEFAULT_ELEVENLABS_SPEED=0.85
```

Web-specific:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
PORT=3001
```

---

## References

- [Postgres provisioning guide](docs/20260422_POSTGRES_DATABASE_PROVISIONING.md)
- [db-models README](db-models/README.md)
- [API requirements](docs/requirements/20260421_TODO_API.md)
- [Worker node requirements](docs/requirements/20260421_TODO_WORKER_NODE.md)
- [Web requirements](docs/requirements/20260421_TODO_WEB.md)
