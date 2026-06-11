---
created_at: 2026-06-11
updated_at: 2026-06-11
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---

# System User Meditation Import and Default Management Plan V01

## Source Requirements

Primary requirements are in `docs/20260610_prd_system_user_meditation_import_and_default_v03.md`.

This plan assumes a clean-slate rollout: the database and `project_resources` will be reset before the feature is used. The plan therefore targets the fresh schema/model definitions instead of writing backward-compatible data migrations for existing user data.

## Existing Architecture Observed

### Packages and models

- Sequelize models live in `db-models/src/models/`.
- `db-models/src/models/Meditation.ts` currently defines `stage`, `sourceMode`, `scriptSource`, visibility, status, duration fields, and no `isDefault` or `metadata` field.
- API startup calls `provisionDatabase()` through `api/src/startup/onStartUp.ts`, so fresh schema changes should be made in the model/provisioning path rather than old-data migration scripts.
- Shared API response types live under `shared-types/src/`, including `admin`, `meditation`, and script parser exports.

### Current meditation API

- `api/src/routes/meditations.ts` exposes normal meditation creation through:
  - `POST /meditations/create`
  - `POST /meditations/create/script`
  - staging endpoints
  - `GET /meditations/all`
- `mapMeditationRecord()` serializes common meditation fields and should be extended for `isDefault`/`metadata` where client code needs them.
- `GET /meditations/all` builds visibility queries around `stage: "library"`, `visibility`, `status`, and ownership/admin status.
- `GET /meditations/staging` currently falls back to `stage: "template"` if no staged meditation exists. That fallback is part of the seeded/template behavior this feature should remove or replace.

### Current admin API/UI

- `api/src/routes/admin.ts` imports `getOrCreateBenevolentUser()` and `BENEVOLENT_USER_EMAIL` to identify benevolent-owned rows and support deleting users while preserving public meditations.
- Admin meditations are serialized by `serializeAdminMeditationRow()` and consumed by `web/src/app/admin/page.tsx` and `web/src/components/tables/TableAdminMeditations.tsx`.
- Admin meditations currently support edit/delete actions and metadata patching. There is no default column or set-default endpoint.
- `web/src/lib/api/admin.ts` contains typed admin API wrappers and should gain a wrapper for the set-default endpoint.

### Current script/default code

- `scripts/seedDefaultMeditation.ts` exists and should be retired or removed from active runbooks.
- `api/src/services/users/getOrCreateBenevolentUser.ts` is currently used in admin routes and seed behavior. Removing it requires replacing admin references with normal user/ownership logic.
- Shared script parsing already exists in `@golightly/shared-types` and is used by `POST /meditations/create/script`; the import script should reuse the same parser rather than creating a divergent parser.

## Implementation Approach

### 1. Fresh schema/model updates

Update `db-models/src/models/Meditation.ts` to add:

- `isDefault` boolean, stored as `is_default`, default `false`, non-null.
- `metadata` JSONB, stored as `metadata`, default `{}`, non-null.

Keep existing generation fields (`stage`, `sourceMode`, `scriptSource`, `status`, duration fields) unless implementation proves they are truly obsolete. The plan should remove reliance on `stage: "template"` for defaults, not delete all stage behavior, because staged/library state is still used by current meditation creation and worker flows.

The one-default invariant should be enforced in a service-layer transaction. A partial unique index may be added through provisioning if the existing provisioning mechanism supports custom indexes cleanly; otherwise service-layer enforcement is acceptable for this fresh-reset feature.

### 2. Remove seeded/template default path

Replace `stage: "template"` default semantics with `isDefault`.

Key changes:

- Stop using `scripts/seedDefaultMeditation.ts` in docs/runbooks; either remove it or leave it clearly deprecated if other tooling references it.
- Remove the `GET /meditations/staging` fallback that looks for `stage: "template"`. If no staged meditation exists, return a clear no-staged/default response appropriate to the current UI flow, or initialize a staged meditation through normal staging behavior.
- Remove or replace admin route assumptions that template meditations are protected because they are the default. Protection should be based on actual mutability rules, not `stage: "template"`.

### 3. Replace benevolent phantom-user dependencies

Retire direct creation of a benevolent phantom user for this workflow.

Admin routes that currently call `getOrCreateBenevolentUser()` need a new strategy:

- For row labeling, either compare owner email to configured/import metadata when joined, or remove the special `isBenevolentOwned` dependency where not needed.
- For user deletion preservation behavior, do not auto-create a benevolent user. If preserving public meditations under benevolent_monkey is still needed, require a real user lookup by email or remove/defer that preservation mode in favor of rejecting the operation until the real user exists.
- Logging should not use `BENEVOLENT_USER_EMAIL` from a hard-coded service. Use the actual owner email if available, or log owner ID only.

Because Nick will reset the database, there is no need to migrate old phantom-owned rows.

### 4. Admin bootstrap: comma-separated `ADMIN_EMAIL`

Update `api/src/startup/onStartUp.ts` and env parsing so `ADMIN_EMAIL` can contain one or more comma-separated emails.

Behavior:

- Split on comma, trim, drop blanks, and de-duplicate case-insensitively.
- Require `ADMIN_PASSWORD` when any admin email is configured.
- For each email:
  - create a local verified admin user if missing;
  - ensure existing matching user has `isAdmin = true`;
  - avoid overwriting existing password unless the current startup semantics intentionally do so.
- Log counts/emails safely, but never log passwords.

The fresh-reset sequence can use this to bootstrap both Nick and benevolent_monkey as admins if desired.

### 5. Default meditation API

Add a default-meditation service module, for example `api/src/services/meditations/defaultMeditation.ts`, with functions such as:

- `setDefaultMeditation(id, transaction?)`
- `getDefaultMeditation()`

`setDefaultMeditation` should run in a transaction, clear all defaults, set the target row's `isDefault = true`, and return/not-found if the target does not exist.

Add admin endpoint:

```http
POST /admin/meditations/:id/set-default
```

Add public/default endpoint:

```http
GET /meditations/default
```

The default endpoint should query by `isDefault = true` and should not apply normal list visibility filters. This allows the default meditation to remain hidden from normal lists while still powering the default-meditation experience.

If no default exists, return a structured no-default error such as `NO_DEFAULT_MEDITATION` without crashing the page.

### 6. Normal list hiding

Update normal meditation list queries, especially `GET /meditations/all`, to exclude `isDefault = true` rows from ordinary list/table views.

Admin views can still include default rows because admins need to see/change the default. The admin table should clearly mark default status and visibility/listing state.

### 7. Shared types and API serialization

Update shared types for:

- meditation records with `isDefault` and optional `metadata` where appropriate;
- admin meditation rows with `isDefault`, `metadata`, and any listing/visibility hint;
- admin set-default request/response types if the project convention uses explicit response interfaces.

Update `mapMeditationRecord()` and `serializeAdminMeditationRow()` accordingly.

### 8. Import script architecture

Create `scripts/importMeditations.ts` as a root monorepo script.

The script should be HTTP-first:

1. Load credentials from environment supplied by `/home/nick/agents_home/hermes/secrets/.env`.
2. Validate `--user-key` and exactly one of `--dir` or `--file`.
3. Map `--user-key nick` to `CREDENTIALS_EMAIL_NICK` / `CREDENTIALS_PASSWORD_NICK`.
4. Map `--user-key benevolent_monkey` to `CREDENTIALS_EMAIL_BENEVOLENT_MONKEY` / `CREDENTIALS_PASSWORD_BENEVOLENT_MONKEY`.
5. Fail fast if the misspelled `BENEVOLENT_MOKNEY` variables are present.
6. Login through the existing HTTP auth endpoint.
7. For `--dir`, process `.md` files sorted deterministically.
8. For `--file`, process exactly that file.
9. For each file, parse sections and script content, then create a private script-mode meditation as the authenticated user.
10. Store provenance in `metadata`, including `sourceFile`, `sourceRoot`, `sourceUserKey`, `importedAt`, and `checksum`.
11. Detect duplicates by `metadata.sourceFile` plus `metadata.sourceUserKey`.
12. Support `--dry-run` and `--overwrite`.
13. Poll up to 5 minutes for each created meditation to complete; do not retry automatically.

The cleanest API integration is likely either:

- extend `POST /meditations/create/script` to accept optional `metadata` from authenticated callers; or
- add a narrow authenticated import endpoint if existing creation routes cannot safely accept metadata.

Prefer reusing the existing shared script parser and normal creation/worker notification path.

### 9. Markdown parser behavior

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

### 10. Admin UI

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

### 11. No-default UI state

Wherever the default meditation is displayed, handle `NO_DEFAULT_MEDITATION` gracefully:

- Logged-in users see an admin-style error banner.
- The page still renders.
- There is no hard-coded fallback meditation.
- If an unauthenticated visitor reaches the route, preserve existing auth behavior if that route is gated; otherwise show a generic no-default state without admin-only details.

### 12. Reset/runbook documentation

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
11. Smoke test default endpoint, normal-list hiding, admin table, and generated resources.

## Risks and Design Constraints

- Removing `stage: "template"` must not break staged meditation creation; staged/library stage semantics are still active in current code.
- Hiding default meditations from normal lists must not hide them from admin default-management views.
- Extending create endpoints with metadata must avoid letting arbitrary users set dangerous or reserved metadata fields unless that is acceptable.
- The import script must not print or commit credentials.
- Directory import and one-file import must share parsing and duplicate-detection code to avoid drift.
- `--overwrite` must define whether it deletes/regenerates or updates in place; implementation should pick the safer path after inspecting generated file cleanup helpers such as `deleteMeditationCascade()`.
- The current admin route has hard-coded benevolent-user preservation behavior; replacing it with manually registered user logic may touch more than the default/import work.

## Validation Strategy

Run package-level checks appropriate to touched areas:

- DB/shared types build/typecheck if available.
- API typecheck and targeted tests for admin/default/import behavior.
- Script typecheck or script-specific test command.
- Web typecheck/lint/build for admin UI changes.

Manual smoke checks after implementation:

- Admin bootstrap creates/updates both configured admin emails without exposing passwords.
- Import script fails fast for missing credentials and misspelled `MOKNEY` env vars.
- `--dry-run`, `--file`, and `--dir` behave as expected.
- Imported meditation has expected owner, `metadata`, status progression, and generated audio.
- Setting a default makes exactly one row default.
- Default is hidden from normal lists but returned by `GET /meditations/default`.
- No-default state renders without crashing.

## Open Questions

None from the PRD. Implementation may discover route-level details such as the safest metadata ingress point, but those are engineering choices rather than product requirement blockers.
