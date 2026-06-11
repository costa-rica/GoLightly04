---
created_at: 2026-06-11
updated_at: 2026-06-11
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---

# System User Meditation Import and Default Management TODO V01

Source plan: `docs/20260611_SYSTEM_USER_IMPORT_DEFAULT_PLAN_V02.md`

Vetting status: Codex accepted Plan V02 for TODO determination and did not create a V02 assessment file.

## Execution Notes

- Implement on a feature branch.
- Keep the feature reset-oriented; no historical-data migration is required for this scope.
- Do not commit credentials or contents of `/home/nick/agents_home/hermes/secrets/.env`.
- Treat database field `metadata` as import provenance. Use `importMetadata` or `provenanceMetadata` in API/shared/UI names when possible so it is not confused with existing admin presentation metadata (`title`, `description`, `visibility`).
- Keep `stage: "staged" | "library"` behavior for current creation flows; remove only the seeded/template-default dependency.

## Phase 1: Schema, Types, and Default Service

### TODO 1. Add fresh schema fields

- Update `db-models/src/models/Meditation.ts` with:
  - `isDefault` boolean -> `is_default`, non-null default `false`.
  - `metadata` JSONB -> `metadata`, non-null default `{}`.
- Confirm `sequelize.sync()` provisioning creates the fields on a fresh DB.
- Consider service-layer one-default enforcement sufficient unless a clean partial-index hook is already available.

### TODO 2. Extend shared meditation/admin types

- Add `isDefault` and provenance metadata fields to shared meditation/admin response types as needed.
- Add default endpoint response types.
- Add import lookup/create response types if a dedicated import API is introduced.
- Keep existing `AdminUpdateMeditationMetadataRequest` terminology for presentation metadata and avoid overloading it for import provenance.

### TODO 3. Add default meditation service

- Add service functions for:
  - `getDefaultMeditation()`
  - `setDefaultMeditation(id)`
- `setDefaultMeditation` must run in a transaction and leave exactly one row with `isDefault = true`.
- Return clear not-found / no-default errors.

## Phase 2: API Behavior

### TODO 4. Add `GET /meditations/default`

- Return the `isDefault = true` meditation through normal serialization.
- Do not apply ordinary list visibility filters.
- Return structured `NO_DEFAULT_MEDITATION` when no default exists.
- Preserve existing authentication behavior for the route/surface; if public, do not expose admin-only no-default details to anonymous visitors.

### TODO 5. Add `POST /admin/meditations/:id/set-default`

- Require admin.
- Use the default service transaction.
- Return updated admin meditation row or enough data to update the table state.
- Log the admin actor and target meditation without sensitive data.

### TODO 6. Hide defaults from ordinary lists after default endpoint exists

- Update `GET /meditations/all` so ordinary list responses exclude `isDefault = true`.
- Ensure admin meditation list still includes default rows.
- Ensure default rows are not hidden from the dedicated default endpoint.

### TODO 7. Add HTTP-visible import lookup/contract

- Add an authenticated owner-scoped import lookup or import endpoint, e.g. `GET /meditations/imports?sourceUserKey=...&sourceFile=...`.
- Lookup by provenance metadata (`metadata.sourceUserKey` and `metadata.sourceFile`).
- Ensure it works for private and default meditations.
- Do not require admin credentials for normal user imports.
- Define and implement `--overwrite` server behavior before importer scripting; prefer delete/recreate only if generated-audio cleanup is safe through existing cascade helpers.

### TODO 8. Allow controlled provenance metadata on import create

- Either extend `POST /meditations/create/script` with validated provenance metadata or add a dedicated create/import endpoint.
- Preserve normal script parsing and worker notification behavior.
- Reject unsafe or unknown provenance shapes.

## Phase 3: Retire Seeded/Template Default and Phantom User Creation

### TODO 9. Remove seeded/template default dependency

- Remove or deprecate `scripts/seedDefaultMeditation.ts` from active use.
- Remove `GET /meditations/staging` fallback to `stage: "template"`.
- Ensure staging still works without a template/default meditation.
- Replace template-protection assumptions with actual mutability rules where needed.

### TODO 10. Replace `getOrCreateBenevolentUser()` behavior

- Remove auto-creation from admin flows.
- For delete-user preservation, lookup the manually registered benevolent_monkey account only.
- If missing, fail with a clear operational error.
- Update admin modal copy to describe reassignment to the existing benevolent_monkey account.
- Update admin row labeling/edit gating so it no longer depends on auto-creating a benevolent user.

### TODO 11. Support comma-separated `ADMIN_EMAIL`

- Update env parsing and `api/src/startup/onStartUp.ts`.
- Split/trim/de-duplicate emails case-insensitively.
- Create missing local verified admin users and promote existing matching users to admin.
- Do not log or expose passwords.

## Phase 4: Frontend

### TODO 12. Add frontend default meditation surface

- Add default meditation API client in `web/src/lib/api/meditations.ts`.
- Add a focused component/section, likely used by `web/src/app/page.tsx`, to fetch/display the default meditation separately from `TableMeditation`.
- Render `NO_DEFAULT_MEDITATION` as an admin-style banner for logged-in users.
- Do this before relying on ordinary list hiding.

### TODO 13. Update admin meditations table

- Add Default column and badge/check.
- Add Set as Default action.
- Disable Set as Default for current default.
- Use an app-consistent confirmation modal.
- Update local state on success so exactly one row is default.
- Show failure toast/error and preserve/reload state as needed.
- Show enough context that admins understand the default is hidden from ordinary lists.

## Phase 5: Import Script

### TODO 14. Build markdown parser/import helpers

- Parse `## Title`, `## Description`, and `## Meditation Script`.
- Ignore `## Nick Description` for published content.
- Support existing script syntax, including sounds, breaks, and speed tags.
- Fail only the current file for missing sections or unknown sounds.

### TODO 15. Build `scripts/importMeditations.ts`

- Load credentials from `/home/nick/agents_home/hermes/secrets/.env`.
- Require `--user-key` and exactly one of `--dir` or `--file`.
- Support `nick` and `benevolent_monkey` user keys.
- Use `CREDENTIALS_EMAIL_NICK` / `CREDENTIALS_PASSWORD_NICK` and `CREDENTIALS_EMAIL_BENEVOLENT_MONKEY` / `CREDENTIALS_PASSWORD_BENEVOLENT_MONKEY`.
- Fail fast if `BENEVOLENT_MOKNEY` variables are present.
- Login through HTTP, import as that user, and create private script-mode meditations.
- Use provenance metadata with `sourceFile`, `sourceRoot`, `sourceUserKey`, `importedAt`, and `checksum`.
- Implement `--dry-run`, duplicate skip, and explicit `--overwrite` behavior.
- Poll each created meditation up to 5 minutes for completion; do not retry automatically.

## Phase 6: Docs and Validation

### TODO 16. Update reset/import runbook docs

- Remove old seed-default instructions.
- Document reset steps, admin bootstrap, manual registration, secrets file format, importer usage, admin default selection, and smoke checks.
- Include a placeholder for future non-reset migrations.

### TODO 17. Automated validation

Run available checks for touched packages:

- DB/shared typecheck/build.
- API typecheck/tests for default/import/admin behavior.
- Script typecheck/tests for parser/import logic.
- Web typecheck/lint/build for home/default/admin UI.

### TODO 18. Manual smoke validation

Verify:

- Comma-separated admin bootstrap works and does not expose passwords.
- No phantom benevolent user is auto-created.
- Delete-user preservation fails clearly if real benevolent_monkey is missing.
- Importer rejects missing credentials and `BENEVOLENT_MOKNEY` typos.
- `--dry-run`, `--file`, `--dir`, duplicate skip, and `--overwrite` work.
- Imported meditations have expected owner, private visibility, provenance metadata, status progression, and audio output.
- Set default leaves exactly one default.
- Default is hidden from ordinary lists but visible through default surface/endpoint.
- No-default state renders without crashing.
