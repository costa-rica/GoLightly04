---
created_at: 2026-06-11
updated_at: 2026-06-11
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---

# System User Meditation Import and Default Management Plan V02

## Source Requirements

Primary requirements are in `docs/archive/202606/20260610_prd_system_user_meditation_import_and_default_v03.md`.

This V02 plan responds to `docs/archive/202606/20260611_SYSTEM_USER_IMPORT_DEFAULT_PLAN_V01_ASSESSMENT_CODEX.md` by making four previously under-specified areas concrete:

1. the frontend default-meditation surface and sequencing;
2. HTTP-visible duplicate detection for imports;
3. naming separation between presentation metadata and import provenance;
4. admin deletion preservation behavior after retiring phantom benevolent-user creation.

This plan assumes a clean-slate rollout: the database and `project_resources` will be reset before the feature is used. The plan targets fresh schema/model definitions rather than old-data migrations.

## Existing Architecture Observed

### Packages and models

- Sequelize models live in `db-models/src/models/`.
- `db-models/src/models/Meditation.ts` currently defines `stage`, `sourceMode`, `scriptSource`, visibility, status, duration fields, and no `isDefault` or JSON provenance field.
- API startup calls `provisionDatabase()` through `api/src/startup/onStartUp.ts`, so fresh schema changes should be made in the model/provisioning path rather than old-data migration scripts.
- Shared API response types live under `shared-types/src/`, including `admin`, `meditation`, and script parser exports.

### Current meditation API and UI

- `api/src/routes/meditations.ts` exposes normal creation through `POST /meditations/create`, `POST /meditations/create/script`, staging endpoints, and `GET /meditations/all`.
- `GET /meditations/all` is consumed by `web/src/components/tables/TableMeditation.tsx` through `web/src/lib/api/meditations.ts` and is the ordinary meditation list.
- The home page (`web/src/app/page.tsx`) renders the ordinary table/create experience and currently has no separate default-meditation surface.
- `GET /meditations/staging` currently falls back to `stage: "template"` if no staged meditation exists. That fallback is part of the seeded/template behavior this feature should remove or replace.

### Current admin API/UI

- `api/src/routes/admin.ts` imports `getOrCreateBenevolentUser()` and `BENEVOLENT_USER_EMAIL` to identify benevolent-owned rows and to support deleting users while preserving public meditations.
- `web/src/components/modals/ModalConfirmDeleteUser.tsx` exposes the preservation choice in the admin delete-user flow.
- Admin meditations are serialized by `serializeAdminMeditationRow()` and consumed by `web/src/app/admin/page.tsx` and `web/src/components/tables/TableAdminMeditations.tsx`.
- Admin meditations currently support edit/delete actions and presentation metadata patching through `PATCH /admin/meditations/:id/metadata`.
- There is no default column or set-default endpoint.

### Current script/default code

- `scripts/seedDefaultMeditation.ts` exists and should be retired or removed from active runbooks.
- `api/src/services/users/getOrCreateBenevolentUser.ts` is currently used in admin routes and seed behavior. Removing it requires replacing admin references with normal user/ownership logic.
- Shared script parsing already exists in `@golightly/shared-types` and is used by `POST /meditations/create/script`; the import script should reuse the same parser rather than creating a divergent parser.

## Implementation Approach

### 1. Fresh schema/model updates

Update `db-models/src/models/Meditation.ts` to add:

- `isDefault` boolean, stored as `is_default`, default `false`, non-null.
- `metadata` JSONB, stored as `metadata`, default `{}`, non-null.

At the API/type boundary, refer to the JSONB field as import provenance metadata where possible, e.g. `importMetadata` or `provenanceMetadata`, to avoid confusion with existing admin presentation metadata routes.

Keep existing generation fields (`stage`, `sourceMode`, `scriptSource`, `status`, duration fields) unless implementation proves they are truly obsolete. The plan removes reliance on `stage: "template"` for defaults, not all stage behavior, because staged/library state is still used by current meditation creation and worker flows.

The one-default invariant should be enforced in a service-layer transaction. A partial unique index may be added through provisioning if the current provisioning mechanism supports it cleanly; otherwise service-layer enforcement is acceptable for this fresh-reset feature.

### 2. Remove seeded/template default path without breaking staging

Replace `stage: "template"` default semantics with `isDefault`.

Key changes:

- Stop using `scripts/seedDefaultMeditation.ts` in docs/runbooks; remove it or mark it deprecated if removal would break package scripts during implementation.
- Remove the `GET /meditations/staging` fallback that looks for `stage: "template"`. If no staged meditation exists, return a clear no-staged response or initialize through normal staging behavior; do not depend on the default meditation for staging.
- Remove or replace admin route assumptions that template meditations are protected because they are the default. Protection should be based on actual mutability rules, not `stage: "template"`.

### 3. Replace benevolent phantom-user dependencies

Retire direct creation of a benevolent phantom user for this workflow.

Concrete product decision for user deletion preservation:

- Keep the ability to preserve public meditations only if the real manually registered benevolent_monkey user already exists.
- Do not auto-create a benevolent user.
- If an admin attempts to preserve meditations and the real benevolent_monkey user cannot be found, fail with a clear operational error explaining that the manually registered benevolent_monkey user must exist first.
- Update admin modal copy so it says public meditations will be reassigned to the existing benevolent_monkey account, not to an auto-created/system account.

Implementation options for finding the real benevolent_monkey user:

- Prefer an explicit config/env value for the benevolent user email if one already exists or is introduced without storing a password; or
- Use a named constant for `benevolent_monkey@go-lightly.love` that does not create users and is documented as a lookup-only email.

The important invariant is: lookup-only is allowed; auto-create is not.

Admin row labeling should not require `getOrCreateBenevolentUser()`. Either join owner user email for labels, compare to the lookup-only benevolent email, or remove special `isBenevolentOwned` behavior where it is not needed.

### 4. Admin bootstrap: comma-separated `ADMIN_EMAIL`

Update `api/src/startup/onStartUp.ts` and env parsing so `ADMIN_EMAIL` can contain one or more comma-separated emails.

Behavior:

- Split on comma, trim, drop blanks, and de-duplicate case-insensitively.
- Require `ADMIN_PASSWORD` when any admin email is configured.
- For each email:
  - create a local verified admin user if missing;
  - ensure an existing matching user has `isAdmin = true`;
  - avoid overwriting existing password unless current admin-bootstrap behavior intentionally does so.
- Log counts/emails safely, but never log passwords.

The fresh-reset sequence can use this to bootstrap both Nick and benevolent_monkey as admins if desired.

### 5. Default meditation API

Add a default-meditation service module, for example `api/src/services/meditations/defaultMeditation.ts`, with functions such as:

- `setDefaultMeditation(id, transaction?)`
- `getDefaultMeditation()`

`setDefaultMeditation` should run in a transaction, clear all defaults, set the target row's `isDefault = true`, and return not-found if the target does not exist.

Add admin endpoint:

```http
POST /admin/meditations/:id/set-default
```

Add default endpoint:

```http
GET /meditations/default
```

The default endpoint should query by `isDefault = true` and should not apply normal list visibility filters. This allows the default meditation to remain hidden from ordinary lists while still powering the default-meditation surface.

If no default exists, return a structured no-default error such as `NO_DEFAULT_MEDITATION` without crashing the page.

### 6. Frontend default-meditation surface before list hiding

To avoid making the default disappear from the primary UI with no replacement, implement the frontend default surface before hiding default rows from ordinary lists.

Concrete targets:

- Add a default meditation API client in `web/src/lib/api/meditations.ts`.
- Add or update shared response types for `GET /meditations/default`.
- Add a focused home-page section/component, likely used by `web/src/app/page.tsx`, that fetches and displays the default meditation separately from `TableMeditation`.
- Handle `NO_DEFAULT_MEDITATION` by rendering an admin-style banner/error state for logged-in users.
- Only after the separate default surface works, update `GET /meditations/all` and ordinary list UI assumptions to exclude `isDefault = true` rows.

This sequencing ensures the selected default remains visible in the intended default experience even when hidden from normal lists/tables.

### 7. Normal list hiding

Update ordinary meditation list queries, especially `GET /meditations/all`, to exclude `isDefault = true` rows.

Admin views can still include default rows because admins need to see/change the default. The admin table should clearly mark default status and visibility/listing state.

### 8. Import provenance naming and serialization

The database/model field may be `metadata`, but API-facing language should distinguish import provenance from existing admin presentation metadata.

Use names such as:

- `importMetadata` or `provenanceMetadata` in API/shared types if serializing the JSONB value;
- `AdminUpdateMeditationMetadataRequest` remains presentation metadata for title/description/visibility;
- `PATCH /admin/meditations/:id/metadata` remains the existing presentation metadata route unless separately renamed in a larger cleanup.

Update shared types for:

- meditation records with `isDefault` and optional provenance metadata where appropriate;
- admin meditation rows with `isDefault`, provenance metadata, and any listing/visibility hint;
- admin set-default request/response types if the project convention uses explicit response interfaces;
- import lookup/create responses if a dedicated import API is introduced.

Update `mapMeditationRecord()` and `serializeAdminMeditationRow()` accordingly, using clear names that do not conflate presentation metadata with import provenance.

### 9. HTTP import API contract for duplicate detection

Because the importer is HTTP-first, duplicate detection must not depend on direct DB access or unreliable ordinary list filtering.

Add a narrow authenticated import API contract. Preferred shape:

```http
GET /meditations/imports?sourceUserKey=<key>&sourceFile=<relative-path>
```

or an equivalent purpose-built endpoint under `/meditations/imports`.

Requirements:

- Authenticated user only.
- Owner-scoped: only returns/import-checks meditations owned by the authenticated user unless requester is admin and the endpoint explicitly supports admin behavior.
- Looks up by `metadata.sourceUserKey` and `metadata.sourceFile`.
- Returns enough data for the script to decide skip/overwrite/create.
- Works even when the matching meditation is default and hidden from ordinary lists.

If implementation prefers a single server-side import endpoint that handles duplicate detection and creation atomically, that is acceptable, but the TODO must spell out the endpoint behavior before scripting.

`--overwrite` should use the same server-side contract. It should either delete/recreate via existing cascade helpers or update in place, but the chosen behavior must be explicit in the TODO and tests.

### 10. Import script architecture

Create `scripts/importMeditations.ts` as a root monorepo script.

The script should be HTTP-first:

1. Load credentials from environment supplied by `/home/nick/agents_home/hermes/secrets/.env`.
2. Validate `--user-key` and exactly one of `--dir` or `--file`.
3. Map `--user-key nick` to `CREDENTIALS_EMAIL_NICK` / `CREDENTIALS_PASSWORD_NICK`.
4. Map `--user-key benevolent_monkey` to `CREDENTIALS_EMAIL_BENEVOLENT_MONKEY` / `CREDENTIALS_PASSWORD_BENEVOLENT_MONKEY`.
5. Fail fast if misspelled `BENEVOLENT_MOKNEY` variables are present.
6. Login through the existing HTTP auth endpoint.
7. For `--dir`, process `.md` files sorted deterministically.
8. For `--file`, process exactly that file.
9. For each file, parse sections and script content.
10. Use the import duplicate-detection endpoint/contract.
11. Create a private script-mode meditation as the authenticated user through an endpoint that records provenance metadata.
12. Store provenance including `sourceFile`, `sourceRoot`, `sourceUserKey`, `importedAt`, and `checksum`.
13. Support `--dry-run` and `--overwrite`.
14. Poll up to 5 minutes for each created meditation to complete; do not retry automatically.

Prefer reusing the existing shared script parser and normal creation/worker notification path. If `POST /meditations/create/script` is extended for provenance, validate provenance fields server-side and do not let arbitrary clients set unsafe or reserved metadata.

### 11. Markdown parser behavior

The parser should read the GoLightly04-meditations markdown format:

- `## Nick Description` is ignored for published content.
- `## Title` becomes title.
- `## Description` becomes description.
- `## Meditation Script` becomes script-mode text/elements.

It should support existing script syntax:

- plain spoken text;
- `<break time="Ns" />` with or without a space before `/>`;
- `{speed=N}...{/speed}`;
- bracketed sound names, including Tibetan Singing Bowl, Double Tibetan Singing Bowl, Inhale, and Exhale.

Unknown sound names or missing required sections should fail only that file.

### 12. Admin UI

Update the admin Meditations table:

- Add a Default column.
- Show a badge/check for the current default.
- Add a Set as Default action.
- Disable the action for the current default.
- Use an app-consistent modal, not `window.confirm()`.
- On success, update local table state so exactly one row shows default.
- On failure, show a toast/error and preserve or reload prior state.
- Show enough visibility/listing context that admins understand the default is hidden from ordinary user lists.

Existing `web/src/app/admin/page.tsx`, `web/src/components/tables/TableAdminMeditations.tsx`, and `web/src/lib/api/admin.ts` are the main UI/API client targets.

### 13. No-default UI state

Wherever the default meditation is displayed, handle `NO_DEFAULT_MEDITATION` gracefully:

- Logged-in users see an admin-style error banner.
- The page still renders.
- There is no hard-coded fallback meditation.
- If an unauthenticated visitor reaches the route, preserve existing auth behavior if that route is gated; otherwise show a generic no-default state without admin-only details.

### 14. Reset/runbook documentation

Update documentation/runbooks to remove the old seed-default step and describe the new flow:

1. Stop services.
2. Drop/recreate database.
3. Clear `project_resources` after verifying path.
4. Apply fresh schema/provisioning.
5. Start API/web.
6. Manually register users.
7. Bootstrap admins via comma-separated `ADMIN_EMAIL` or admin tooling.
8. Store credentials outside repo in `/home/nick/agents_home/hermes/secrets/.env`.
9. Run importer with `--user-key` and `--dir`/`--file`.
10. Set default in `/admin`.
11. Smoke test default endpoint/surface, normal-list hiding, admin table, and generated resources.

## Risks and Design Constraints

- Removing `stage: "template"` must not break staged meditation creation; staged/library stage semantics are still active in current code.
- Hiding default meditations from ordinary lists must not hide them from admin default-management views or the dedicated default surface.
- Extending create endpoints with provenance metadata must avoid letting arbitrary users set unsafe or reserved metadata fields.
- The import script must not print or commit credentials.
- Directory import and one-file import must share parsing and duplicate-detection code to avoid drift.
- `--overwrite` must define whether it deletes/regenerates or updates in place; implementation should inspect generated file cleanup helpers such as `deleteMeditationCascade()` before choosing.
- The current admin delete-user preservation flow must be changed so it never auto-creates a phantom benevolent user.

## Validation Strategy

Run package-level checks appropriate to touched areas:

- DB/shared types build/typecheck if available.
- API typecheck and targeted tests for admin/default/import behavior.
- Script typecheck or script-specific test command.
- Web typecheck/lint/build for admin UI and home/default surface changes.

Manual smoke checks after implementation:

- Admin bootstrap creates/updates both configured admin emails without exposing passwords.
- Admin delete-user preservation fails clearly if the real benevolent_monkey user is missing and never auto-creates a user.
- Import script fails fast for missing credentials and misspelled `MOKNEY` env vars.
- `--dry-run`, `--file`, and `--dir` behave as expected.
- Imported meditation has expected owner, provenance metadata, status progression, and generated audio.
- Duplicate detection works for normal, private, and default meditations.
- Setting a default makes exactly one row default.
- Default is hidden from ordinary lists but returned by `GET /meditations/default` and displayed by the dedicated frontend surface.
- No-default state renders without crashing.

## Open Questions

None from the PRD or V01 assessment. V02 turns the V01 assessment findings into concrete implementation direction.
