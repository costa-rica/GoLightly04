---
created_at: 2026-05-29
updated_at: 2026-05-29
created_by: codex (Codex CLI)
modified_by: codex (Codex CLI)
---
# Profile Page TODO V01 Assessment

## Qualifying Concern

The TODO does not account for workspace package build output after changing `shared-types/src/user.ts`.

`@golightly/shared-types` declares its package entry types as `dist/index.d.ts`, and `web` imports shared contracts through the package name. Phase 1 only runs:

```bash
npm run typecheck -w @golightly/shared-types
```

That command uses `--noEmit`, so it will not refresh `shared-types/dist`. Phase 3 then asks the frontend to import the new `UpdateUserPreferencesRequest`, `UpdateUserPreferencesResponse`, and `UserProfileResponse` types from `@golightly/shared-types`; depending on the local `dist` state, `npm run typecheck -w web` can fail even if the source contract is correct.

## Recommended TODO Adjustment

Add a build step after shared-types contract changes and before any downstream package imports the new exported types:

```bash
npm run build -w @golightly/shared-types
```

If implementation also changes exported db-model types consumed through `@golightly/db-models`, use the repo-level build helper instead:

```bash
npm run build:shared
```

This should be called out in Phase 1 validation or sequencing so implementing agents do not chase misleading frontend type errors caused by stale generated declarations.
