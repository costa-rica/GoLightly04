# Requirements Stage 1 Phase 4 Web Notes

This document records the web-specific decisions made during Phase 4 of `docs/requirements/REQUIREMENTS_STAGE_1_TODO.md`.

## API Base URL Decision

- The absorbed `web` app continues to use `NEXT_PUBLIC_API_BASE_URL`.
- The default local value remains `http://localhost:3000`.
- This keeps the stage 1 `web` application pointed at the absorbed `api` service.

## Web Logging Decision

- Stage 1 does not replace the existing browser logger in `web/src/lib/logger.ts`.
- The current client-side logger remains in place as the intentional stage 1 logging strategy for the Next.js app.
- This is consistent with the project assessment that the Node Winston logging requirement does not directly apply to the Next.js frontend.
- Any broader redesign of frontend logging should be handled as a separate web-focused follow-up, not as part of stage 1 absorption.

## Deferred Web Testing Work

- Stage 1 does not introduce a dedicated frontend test stack for `web`.
- Baseline verification for this phase is limited to successful build validation.
- The stage 1 build command uses `next build --webpack` so the app can build reliably in this environment without Turbopack sandbox issues.
- Deferred items include:
  1. selecting a frontend test runner
  2. adding app boot or rendering smoke tests
  3. adding auth and API-facing UI flow tests
  4. deciding whether component tests, browser tests, or both are the preferred long-term approach
