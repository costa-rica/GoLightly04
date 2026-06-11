---
created_at: 2026-06-11
updated_at: 2026-06-11
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: codex (gpt-5)
---

# System User Meditation Import and Default Management TODO V02

Source plan: `docs/20260611_SYSTEM_USER_IMPORT_DEFAULT_PLAN_V02.md`

V01 assessment: `docs/20260611_SYSTEM_USER_IMPORT_DEFAULT_TODO_V01_ASSESSMENT_CODEX.md`

V02 changes:

- Moves the frontend default-meditation surface before ordinary-list hiding.
- Chooses a concrete import overwrite contract: owner-scoped duplicate lookup plus delete/recreate overwrite through a dedicated authenticated import endpoint using `deleteMeditationCascade()` for cleanup, returning a new meditation ID.

## Execution Notes

- Implement on a feature branch.
- Keep the feature reset-oriented; no historical-data migration is required for this scope.
- Do not commit credentials or contents of `/home/nick/agents_home/hermes/secrets/.env`.
- Treat database field `metadata` as import provenance. Use `importMetadata` or `provenanceMetadata` in API/shared/UI names when possible so it is not confused with existing admin presentation metadata (`title`, `description`, `visibility`).
- Keep `stage: "staged" | "library"` behavior for current creation flows; remove only the seeded/template-default dependency.
- Do not perform live reset/import/service actions as part of implementation. Leave those as manual smoke-validation gates.

## Phase 1: Schema, Types, and Default Service

### TODO 1. Add fresh schema fields

- [x] Update `db-models/src/models/Meditation.ts` with:
  - `isDefault` boolean -> `is_default`, non-null default `false`.
  - `metadata` JSONB -> `metadata`, non-null default `{}`.
- [ ] Confirm `sequelize.sync()` provisioning creates the fields on a fresh DB.
- [x] Consider service-layer one-default enforcement sufficient unless a clean partial-index hook is already available.

### TODO 2. Extend shared meditation/admin types

- [x] Add `isDefault` and provenance metadata fields to shared meditation/admin response types as needed.
- [x] Add default endpoint response types.
- [x] Add import lookup/create response types for the dedicated import API.
- [x] Keep existing `AdminUpdateMeditationMetadataRequest` terminology for presentation metadata and avoid overloading it for import provenance.

### TODO 3. Add default meditation service

- [x] Add service functions for:
  - `getDefaultMeditation()`
  - `setDefaultMeditation(id)`
- [x] `setDefaultMeditation` must run in a transaction and leave exactly one row with `isDefault = true`.
- [x] Return clear not-found / no-default errors.

## Phase 2: Core API Behavior Before List Hiding

### TODO 4. Add `GET /meditations/default`

- [x] Return the `isDefault = true` meditation through normal serialization.
- [x] Do not apply ordinary list visibility filters.
- [x] Return structured `NO_DEFAULT_MEDITATION` when no default exists.
- [x] Preserve existing authentication behavior for the route/surface; if public, do not expose admin-only no-default details to anonymous visitors.

### TODO 5. Add `POST /admin/meditations/:id/set-default`

- [x] Require admin.
- [x] Use the default service transaction.
- [x] Return updated admin meditation row or enough data to update the table state.
- [x] Log the admin actor and target meditation without sensitive data.

### TODO 6. Add HTTP-visible import duplicate lookup

- [x] Add an authenticated owner-scoped import lookup endpoint, e.g. `GET /meditations/imports?sourceUserKey=...&sourceFile=...`.
- [x] Lookup by provenance metadata (`metadata.sourceUserKey` and `metadata.sourceFile`).
- [x] Ensure it works for private and default meditations.
- [x] Do not require admin credentials for normal user imports.
- [x] Return enough data for the importer to decide duplicate skip, overwrite, or create.

### TODO 7. Add dedicated import create/overwrite API contract

- [x] Add a dedicated authenticated import endpoint, or equivalent import mode, that creates private script-mode meditations with validated provenance metadata.
- [x] Preserve normal script parsing and worker notification behavior.
- [x] Reject unsafe or unknown provenance shapes.
- [x] Implement `overwrite` as delete/recreate:
  - look up an existing owner-scoped import by `metadata.sourceUserKey` + `metadata.sourceFile`;
  - if no existing import and `overwrite` is false, create a new private script meditation;
  - if an existing import exists and `overwrite` is false, return a duplicate/skip response without mutation;
  - if an existing import exists and `overwrite` is true, delete the old meditation through `deleteMeditationCascade()` and create a new private script meditation with fresh provenance;
  - return the new meditation ID for overwrite creates; old IDs are not preserved.
- [x] Add tests/response shapes for create, duplicate skip, and overwrite delete/recreate.

## Phase 3: Frontend Default Surface, Then Ordinary List Hiding

### TODO 8. Add frontend default meditation surface

- [x] Add default meditation API client in `web/src/lib/api/meditations.ts`.
- [x] Add a focused component/section, likely used by `web/src/app/page.tsx`, to fetch/display the default meditation separately from `TableMeditation`.
- [x] Render `NO_DEFAULT_MEDITATION` as an admin-style banner for logged-in users.
- [x] Complete this before changing ordinary list filtering.

### TODO 9. Hide defaults from ordinary lists only after TODO 8 is complete

- [x] Update `GET /meditations/all` so ordinary list responses exclude `isDefault = true`.
- [x] Ensure admin meditation list still includes default rows.
- [x] Ensure default rows are not hidden from `GET /meditations/default` or from the frontend default surface.

### TODO 10. Update admin meditations table

- [x] Add Default column and badge/check.
- [x] Add Set as Default action.
- [x] Disable Set as Default for current default.
- [x] Use an app-consistent confirmation modal.
- [x] Update local state on success so exactly one row is default.
- [x] Show failure toast/error and preserve/reload state as needed.
- [x] Show enough context that admins understand the default is hidden from ordinary lists.

## Phase 4: Retire Seeded/Template Default and Phantom User Creation

### TODO 11. Remove seeded/template default dependency

- [x] Remove or deprecate `scripts/seedDefaultMeditation.ts` from active use.
- [x] Remove `GET /meditations/staging` fallback to `stage: "template"`.
- [x] Ensure staging still works without a template/default meditation.
- [x] Replace template-protection assumptions with actual mutability rules where needed.

### TODO 12. Replace `getOrCreateBenevolentUser()` behavior

- [x] Remove auto-creation from admin flows.
- [x] For delete-user preservation, lookup the manually registered benevolent_monkey account only.
- [x] If missing, fail with a clear operational error.
- [x] Update admin modal copy to describe reassignment to the existing benevolent_monkey account.
- [x] Update admin row labeling/edit gating so it no longer depends on auto-creating a benevolent user.

### TODO 13. Support comma-separated `ADMIN_EMAIL`

- [x] Update env parsing and `api/src/startup/onStartUp.ts`.
- [x] Split/trim/de-duplicate emails case-insensitively.
- [x] Create missing local verified admin users and promote existing matching users to admin.
- [x] Do not log or expose passwords.

## Phase 5: Import Script

### TODO 14. Build markdown parser/import helpers

- [x] Parse `## Title`, `## Description`, and `## Meditation Script`.
- [x] Ignore `## Nick Description` for published content.
- [x] Support existing script syntax, including sounds, breaks, and speed tags.
- [x] Fail only the current file for missing sections or unknown sounds.

### TODO 15. Build `scripts/importMeditations.ts`

- [x] Load credentials from `/home/nick/agents_home/hermes/secrets/.env` without printing secrets.
- [x] Require `--user-key` and exactly one of `--dir` or `--file`.
- [x] Support `nick` and `benevolent_monkey` user keys.
- [x] Use `CREDENTIALS_EMAIL_NICK` / `CREDENTIALS_PASSWORD_NICK` and `CREDENTIALS_EMAIL_BENEVOLENT_MONKEY` / `CREDENTIALS_PASSWORD_BENEVOLENT_MONKEY`.
- [x] Fail fast if `BENEVOLENT_MOKNEY` variables are present.
- [x] Login through HTTP, import as that user, and create private script-mode meditations.
- [x] Use provenance metadata with `sourceFile`, `sourceRoot`, `sourceUserKey`, `importedAt`, and `checksum`.
- [x] Implement `--dry-run`, duplicate skip, and `--overwrite` using the delete/recreate API contract from TODO 7.
- [x] Poll each created meditation up to 5 minutes for completion; do not retry automatically.

## Phase 6: Docs and Validation

### TODO 16. Update reset/import runbook docs

- [x] Remove old seed-default instructions.
- [x] Document reset steps, admin bootstrap, manual registration, secrets file format, importer usage, admin default selection, and smoke checks.
- [x] Include a placeholder for future non-reset migrations.

### TODO 17. Automated validation

Run available checks for touched packages:

- [x] DB/shared typecheck/build.
- [x] API typecheck/tests for default/import/admin behavior.
- [x] Script typecheck/tests for parser/import logic.
- [x] Web typecheck/lint/build for home/default/admin UI.

### TODO 18. Manual smoke validation gates

Do not perform these gates automatically during implementation unless Nick explicitly authorizes the live actions/environment. Leave any unperformed gates unchecked with notes.

- [ ] Comma-separated admin bootstrap works and does not expose passwords.
- [ ] No phantom benevolent user is auto-created.
- [ ] Delete-user preservation fails clearly if real benevolent_monkey is missing.
- [ ] Importer rejects missing credentials and `BENEVOLENT_MOKNEY` typos.
- [ ] `--dry-run`, `--file`, `--dir`, duplicate skip, and `--overwrite` work against a live/reset environment.
- [ ] Imported meditations have expected owner, private visibility, provenance metadata, status progression, and audio output.
- [ ] Set default leaves exactly one default.
- [ ] Default is hidden from ordinary lists but visible through default surface/endpoint.
- [ ] No-default state renders without crashing.
