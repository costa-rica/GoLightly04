---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Plan: Usernames + meditation "Created By" (PRD 1)

## Overview

Add a `username` to every user. It is unique, editable on the profile page, and
defaults (on backfill and at account creation) to the local part of the email
(the portion before `@`). Surface the creating user's username through the
meditation API so the web tables can show who created each meditation.

This is the foundational PRD of a three-PRD effort:

- **PRD 1 (this plan)** — usernames end to end + expose creator username in the
  meditation API.
- **PRD 2** ([20260616_prd2_meditation_tables_plan_v01.md](20260616_prd2_meditation_tables_plan_v01.md))
  — modernize the home `TableMeditation` (TanStack) and render the new
  "Created By" column. Depends on this PRD.
- **PRD 3** ([20260616_prd3_admin_split_and_taxonomy_plan_v01.md](20260616_prd3_admin_split_and_taxonomy_plan_v01.md))
  — admin page split + meditation taxonomy (type/subtype).

Affected packages: `db-models`, `api`, `shared-types`, `web`.

### In scope

- `users.username` column, unique, not null after backfill.
- One-time backfill of existing rows from the email local part, with collision
  disambiguation.
- Username assigned at account creation (local register + Google auth).
- Profile page field to view and edit username, with validation + uniqueness
  errors.
- `username` added to the API `User` payload.
- `createdByUsername` added to the meditation API payload (list + single).

### Out of scope (later PRDs)

- Rendering the "Created By" column in any table (PRD 2).
- Meditation `type`/`subtype` and the admin taxonomy (PRD 3).
- Showing usernames anywhere other than where the existing `User` payload is
  already consumed.

## Technology / conventions

- DB: PostgreSQL via Sequelize models in `db-models`, with raw SQL migrations in
  `db-models/migrations/` (e.g. `20260529_add_user_create_mode_preference.sql`).
  Columns are snake_case in SQL, camelCase in the model with `field:` mappings;
  models use `underscored: true`.
- API: Express routers in `api/src/routes`, shared response shapes from
  `@golightly/shared-types`, validation via `AppError` + helpers in
  `api/src/middleware/validate.ts`.
- Web: Next.js App Router, Redux Toolkit auth slice, API wrappers in
  `web/src/lib/api`.

## Data model changes (`db-models`)

### Migration

New file `db-models/migrations/20260616_add_user_username.sql`:

1. Add column nullable first:
   `ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;`
2. Backfill every existing row from the email local part, sanitized to the
   allowed charset and lowercased, then disambiguated so the result is unique
   (see [Backfill + disambiguation](#backfill--disambiguation)). This is done in
   SQL (window function over a normalized base) so the migration is
   self-contained.
3. Enforce constraints after backfill:
   - `ALTER TABLE users ALTER COLUMN username SET NOT NULL;`
   - `CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (LOWER(username));`
     (case-insensitive uniqueness — see [Validation rules](#validation-rules)).

### Model

`db-models/src/models/User.ts`:

- Add `declare username: string;`
- Add the attribute init: `username: { type: DataTypes.TEXT, allowNull: false, unique: true }`.

No association changes — `Meditation.belongsTo(User, { foreignKey: "userId" })`
already exists in `associations.ts`.

## Backfill + disambiguation

Base value = email local part (`split('@')[0]`), lowercased, with any character
outside the allowed set replaced/stripped (see rules below). If sanitization
yields an empty string, fall back to `user{id}`.

Collisions (two emails producing the same base, e.g. `nick@a.com` and
`nick@b.com`) are resolved by appending the smallest integer suffix that makes
the value unique within the table: `nick`, `nick2`, `nick3`, … Ordering for
suffix assignment is by `id` ascending so it is deterministic and the
lowest-id user keeps the unsuffixed name.

The same base-derivation helper is reused at account creation so new users get a
sensible default that is then made unique against existing rows.

## API changes (`api`, `shared-types`)

### shared-types

- `shared-types/src/user.ts`: add `username: string;` to `User`.
- Add request/response types for the profile update, e.g.
  `UpdateUsernameRequest { username: string }` and reuse
  `UpdateUserPreferencesResponse`/`UserProfileResponse` shape (returns `{ user }`).
- `shared-types/src/meditation.ts`: add `createdByUsername?: string;` to
  `Meditation`.

### users router (`api/src/routes/users.ts`)

- Extend `mapUser` to include `username: user.username`.
- Account creation paths set a username:
  - `POST /register` and `POST /google-auth` derive a default username from the
    email local part and ensure uniqueness before `User.create(...)`.
- New endpoint to update username, e.g. `PATCH /me/username` (mirrors the
  existing `PATCH /me/preferences` handler):
  - validate type (string), trim, lowercase per rules, validate format/length,
  - check uniqueness (case-insensitive) excluding the current user,
  - on conflict throw `AppError(409, "USERNAME_TAKEN", ...)`,
  - on invalid format throw `AppError(400, "VALIDATION_ERROR", ...)`,
  - save and return `{ user: mapUser(user, await hasPublicMeditations(...)) }`.

  (Alternatively fold username into a generalized `PATCH /me/preferences`; a
  dedicated endpoint is preferred here for a clean 409 path. This is an open
  decision — see below.)

### meditations router (`api/src/routes/meditations.ts`)

- `mapMeditationRecord` adds `createdByUsername: meditation.User?.username ?? undefined`.
- The list query (`GET /` handler, currently `Meditation.findAll({ where, order })`)
  adds `include: [{ model: User, attributes: ["id", "username"] }]`.
- `loadMeditationOrThrow` (used by `GET /:id`) likewise includes the `User`
  association so single-meditation responses carry `createdByUsername`.
- Verify other call sites of `mapMeditationRecord` (admin/staging/default
  paths) still function; `createdByUsername` is optional so records loaded
  without the include simply omit it.

## Web changes (`web`)

- Profile page (`web/src/app/profile/page.tsx`): add a username field with an
  edit/save control following the existing preferences pattern; call a new
  `updateUsername` wrapper in `web/src/lib/api/auth.ts`; on success
  `dispatch(setUser(...))`. Show inline errors for taken/invalid usernames.
- The Redux `User` type / auth slice already flows the API `User` object, so
  `username` becomes available app-wide once the payload includes it; confirm
  the slice type picks up the shared-types change.
- No table changes in this PRD — the `createdByUsername` field lands in the
  payload now and is rendered in PRD 2.

## Validation rules (proposed)

- Allowed characters: `[a-z0-9._-]`.
- Length: 3–30 characters.
- Stored lowercase; uniqueness enforced case-insensitively
  (`LOWER(username)` unique index + case-insensitive check in the handler).
- Backfill sanitizer maps disallowed characters out and lowercases before
  disambiguation.

These are defaults chosen for safety/clarity; flagged as an open decision.

## Key files

| File | Change |
| --- | --- |
| `db-models/migrations/20260616_add_user_username.sql` | new column, backfill, NOT NULL + unique index |
| `db-models/src/models/User.ts` | `username` attribute |
| `shared-types/src/user.ts` | `username` on `User` + update req/res types |
| `shared-types/src/meditation.ts` | `createdByUsername` on `Meditation` |
| `api/src/routes/users.ts` | `mapUser`, creation defaults, `PATCH /me/username` |
| `api/src/routes/meditations.ts` | `mapMeditationRecord`, `User` include on list + `:id` |
| `web/src/lib/api/auth.ts` | `updateUsername` wrapper |
| `web/src/app/profile/page.tsx` | username view/edit field |

## Risks / edge cases

- **Backfill correctness**: the migration must produce unique, non-null values
  for all existing rows before adding the NOT NULL + unique constraints, or the
  migration fails. Disambiguation logic must be deterministic.
- **Concurrent username edits**: rely on the DB unique index as the source of
  truth; the handler's pre-check is a UX nicety, and a unique-violation from the
  DB must also be caught and mapped to the 409 code.
- **Creation-time uniqueness race**: two new accounts whose emails share a local
  part — handle the unique-violation on `User.create` by retrying with the next
  suffix.
- **Google-auth and existing flows**: ensure `username` is set on the
  Google-auth create path, not just local register.
- **Other `mapMeditationRecord` callers**: those without the `User` include must
  still return valid payloads (field optional) — no crashes on `meditation.User`
  being undefined.

## Open decisions for the operator

1. Username format/length rules above — accept defaults or adjust?
2. Dedicated `PATCH /me/username` endpoint vs. extending `PATCH /me/preferences`.
3. Case handling: store/display lowercase only (proposed) vs. preserve display
   case while enforcing case-insensitive uniqueness.

## Verification (per phase, during the todo)

`web` has no test runner; `api`, `db-models`, and `shared-types` do.

- `shared-types`: build.
- `db-models`: run the migration against a dev DB and the smoke script; confirm
  backfill produced unique non-null usernames.
- `api`: `npm test` (extend users/meditations route tests for username default,
  update, 409 on conflict, and `createdByUsername` presence in list/single).
- `web`: lint + typecheck + build; manual profile edit (happy path, taken
  username, invalid format).
