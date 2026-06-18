---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# PRD1 Usernames TODO V04 Assessment — Codex

Qualifying concern remains before implementation:

1. **`db-models/scripts/smoke.ts` validation is still not concretely covered.** TODO V04 correctly adds implementation tasks for the smoke script, but its stated validation command `npm run typecheck:scripts` does not typecheck `db-models/scripts/smoke.ts` in the actual repo: root `tsconfig.scripts.json` only includes `scripts/**/*.ts`, while `db-models/tsconfig.json` only includes `src/**/*.ts`. Because adding required `User.username` can break this exact script, update the TODO to require a real validation path for `db-models/scripts/smoke.ts` (for example, extend/add a scripts tsconfig that includes `db-models/scripts/**/*.ts`, add a package/root script for it, or run the smoke script against a dev DB) and keep `npm run typecheck:scripts` only for the root scripts it actually covers.
