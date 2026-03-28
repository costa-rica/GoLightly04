# GoLightly03

GoLightly03 is the monorepo for the stage 1 absorbed GoLightly applications. The current stage 1 scope includes the shared `db-models` package, the `api` service, and the `web` Next.js app.

## Setup

1. Install dependencies from the repo root:
   - `npm install`
2. Review the per-workspace environment examples before running anything:
   - `db-models/.env.example`
   - `api/.env.example`
   - `web/.env.example`
3. Build the stage 1 workspaces from the repo root:
   - `npm run build`

## Usage

Use the root scripts when you want to work across the stage 1 monorepo:

1. Build all stage 1 workspaces:
   - `npm run build`
2. Run tests for workspaces that currently use tests:
   - `npm test`
3. Type-check workspaces that expose a typecheck script:
   - `npm run typecheck`

Use workspace-specific commands when you want to focus on one application:

1. Run the API in development:
   - `npm -w api run dev`
2. Run the web app in development:
   - `npm -w web run dev`
3. Build only `db-models`:
   - `npm -w db-models run build`

## Project Structure

```text
GoLightly03/
├── api/                         # Stage 1 Express API workspace
├── db-models/                   # Stage 1 shared Sequelize package
├── docs/
│   └── requirements/           # Requirements, assessments, and TODO files
├── web/                        # Stage 1 Next.js workspace
├── worker-node/                # Reserved for stage 2 absorption work
├── package.json                # Root npm workspace manifest
├── tsconfig.base.json          # Shared TypeScript defaults
└── README.md
```

## .env

Environment variables are documented per workspace instead of through a single root `.env` file.

1. `db-models/.env.example`
   - `PATH_DATABASE`
   - `NAME_DB`
2. `api/.env.example`
   - app, logging, auth, database, email, and file path variables
3. `web/.env.example`
   - `NEXT_PUBLIC_API_BASE_URL`
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
   - `NEXT_PUBLIC_MODE`
   - `PORT`

## References

1. `docs/requirements/FIRST_INSTRUCTIONS.md`
2. `docs/requirements/FIRST_INSTRUCTIONS_ASSESSMENT_20260328.md`
3. `docs/requirements/REQUIREMENTS_STAGE_1_TODO.md`
4. `docs/requirements/REQUIREMENTS_STAGE_2_TODO.md`
5. `docs/requirements/TEST_IMPLEMENTATION_NODE.md`
6. `docs/requirements/LOGGING_NODE_JS_V07.md`
