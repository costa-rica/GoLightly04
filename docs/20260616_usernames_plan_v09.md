---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# Username Feature — Architecture Plan V09

## Overview

This plan describes the work to add a `username` field to the platform. The field is stored on the `users` table, derived automatically from the email local part at registration and on first Google sign-in, exposed in the public meditation feed so listeners can see who created a meditation, and editable by the account owner through a profile settings flow. V09 supersedes V08 by making rollout ordering explicit: the full NOT NULL migration and username-aware API deployment occur inside a write-maintenance window so old account-creation code cannot insert rows without usernames against the new constraint.

---

## Decisions Resolved

| Question | Decision |
|---|---|
| SQL table name | `users` (lowercase, unquoted, no change from current) |
| New column | `username TEXT NOT NULL` after migration; nullable during backfill window |
| Shared `User` type extension | Add only `username: string`; no `displayName`, no `role` |
| New response wrapper type | `UpdateUsernameResponse = { user: User }` — matches existing `UserProfileResponse` and `UpdateUserPreferencesResponse` shapes |
| Dropped non-existent type | `UserResponse` is not introduced |
| Dropped non-existent route | `/auth/me` is not used; profile comes from existing authenticated endpoints |
| External PATCH route | `PATCH /users/me/username` |
| Router-internal route | `router.patch("/me/username", ...)` inside the users router already mounted at `/users` |
| Web wrapper file | `web/src/lib/api/auth.ts`; call `apiClient.patch<UpdateUsernameResponse>("/users/me/username", data)` |
| Username derivation source | Email local part only; no display name source |
| Uniqueness enforcement | Unique index on `lower(username)`; suffix retry on collision |
| Username validation | Lowercase `[a-z0-9._-]`, 3–30 characters; digits may start usernames; generated defaults use the same canonical rules |
| Max username length | 30 characters including numeric suffix |
| Meditation creator | Serialize `meditation.User?.username` from existing Sequelize association |
| Build order | `npm run build:shared` (shared-types, then db-models) before API/web/worker |

---

## Existing Architecture Touched

### shared-types
Defines the canonical `User` interface consumed by every package. Currently contains `id: number`, `email`, `isAdmin`, `authProvider`, `showScriptModeForCreatingMeditations`, and optional `hasPublicMeditations`. `username: string` is appended here; nothing else changes.

`UpdateUsernameResponse` is added alongside the existing `UserProfileResponse` and `UpdateUserPreferencesResponse` types, all following the `{ user: User }` wrapper shape.

### db-models
The Sequelize `User` model gains a `username` DataTypes.TEXT column. The model already has `userId` foreign keys flowing outward to `Meditation` via `Meditation.belongsTo(User, { foreignKey: "userId" })` in `db-models/src/models/associations.ts`. No association changes are needed; the eager-load path for meditations already resolves to `meditation.User`.

### api (Express)
The users router gains one new route handler. Registration (`POST /users/register`) and new-user Google auth (`POST /users/google-auth`) both call a shared retry helper that wraps `User.create` and retries on a real Sequelize `UniqueConstraintError` from the database.

The meditations router for `GET /meditations/all` and `GET /meditations/:id` already uses a `loadMeditationOrThrow` helper; that helper's Sequelize query gains `include: [{ model: User, attributes: ["username"] }]` so the creator username is available for serialization.

### web (Next.js/Redux)
`web/src/lib/api/auth.ts` is the file that wraps all auth-related API calls. A new `updateUsername` function is added here using `apiClient.patch<UpdateUsernameResponse>`. The Redux auth slice already handles `{ user: User }` responses for profile and preference updates; the same dispatch pattern is reused when the PATCH response arrives.

---

## Data Model / Migration Approach

The migration runs in three statements to avoid a long table lock on a non-null column with no default:

1. `ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT` — adds the column nullable with no default. Existing rows are unaffected.
2. Backfill: for every row where `username IS NULL`, derive a canonical base from the email local part using the same rules as the PATCH endpoint: lowercase, keep only `[a-z0-9._-]`, and use a creation-safe `user` seed if the cleaned base is empty. If the cleaned base is shorter than three characters, pad deterministically with safe characters such as `user` until it satisfies the 3-character minimum. Allocate final usernames in a deterministic global order, preferably by ascending `id`, while checking each candidate against the full set of already-assigned `lower(username)` values, not just rows with the same base. Candidate generation starts with the base, then advances through `base2`, `base3`, and so on with no small fixed cap; for suffixed values, truncate the base to `30 - length(suffix)` first so every final username is ≤30 characters. This global allocation avoids cross-base collisions such as an existing `nick2` base colliding with the suffixed second `nick`. The backfill is idempotent because of the `IS NULL` guard and must prove zero duplicate `lower(username)` values before constraints are added.
3. `ALTER TABLE users ALTER COLUMN username SET NOT NULL` — only safe after backfill confirms zero null rows.
4. `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS users_username_lower_idx ON users (lower(username))` — concurrent form avoids locking reads during index build.

The migration and application deploy must be coordinated as one rollout boundary. Because the current deployed API creates local and Google users without `username`, the full migration through `ALTER COLUMN username SET NOT NULL` is run only while account-creation writes are paused (maintenance window or stopped API). The username-aware API/web build is deployed before writes are reopened, and registration plus Google-auth new-user creation are smoke-tested immediately after reopening. If zero write downtime is required later, this can be split into an expand/contract rollout (nullable column first, deploy dual-compatible writers, backfill, then set `NOT NULL`), but this PRD plan assumes the simpler controlled maintenance window.

---

## API / Shared Types Approach

### Shared types (`shared-types` package)

```
User {
  id: number
  email: string
  isAdmin: boolean
  authProvider: AuthProvider
  showScriptModeForCreatingMeditations: boolean
  hasPublicMeditations?: boolean
  username: string          // new
}

UpdateUsernameResponse {
  user: User
}
```

`UserProfileResponse` and `UpdateUserPreferencesResponse` remain unchanged; they already use `{ user: User }` and will automatically carry `username` once `User` is updated.

### New API route

`PATCH /users/me/username` accepts `{ username: string }`. Validation: trim and lowercase, require 3–30 characters, and allow only `[a-z0-9._-]` as proposed in PRD1. Digits are allowed at the start. Invalid format returns `400` with `VALIDATION_ERROR`; conflicts return `409` with `USERNAME_TAKEN`. The handler checks uniqueness against `lower(username)` before attempting the update and still maps a database unique-constraint race to `409`. On success it returns `{ user: User }` — the full refreshed user record.

### Registration and Google auth username derivation

A single canonical username derivation helper is used by migration logic and runtime account creation. It derives from email local part only, lowercases, keeps `[a-z0-9._-]`, falls back to creation-safe `user`-style seeds when the base is empty, pads too-short bases deterministically without requiring a database id, and truncates bases before suffixing so the final value always fits 30 characters. The migration may additionally use existing row ids only as deterministic ordering input, not as a required username component. Both `POST /users/register` and the new-user branch of `POST /users/google-auth` call a `createUserWithRetry` helper that wraps the actual `User.create` call and retries on Sequelize `UniqueConstraintError`, advancing to the next numeric suffix each time. The retry loop should use a documented high cap suitable for operational safety, not a small fixed cap, and should fail with an explicit operational error if exhausted. This is the correct layer to catch the error — the database constraint is the source of truth, not an application-layer pre-check.

### Build order

`npm run build:shared` at the repo root compiles `shared-types` then `db-models` in dependency order. API, web, and worker packages must be built or type-checked only after this completes.

---

## Meditation Creator Serialization Approach

The existing association `Meditation.belongsTo(User, { foreignKey: "userId" })` is declared in `db-models/src/models/associations.ts`. No new association is needed.

`loadMeditationOrThrow` (used by both `GET /meditations/:id` and any single-meditation fetch path) is updated to include `{ model: User, attributes: ["id", "username"], required: false }` in its Sequelize `include` array. The `required: false` keeps the query as a LEFT JOIN so meditations without a linked user still load.

`GET /meditations/all` (the public feed) is updated with the same include. The serialized meditation object gains the PRD-required flat field `createdByUsername: meditation.User?.username ?? null`. This field is nullable/optional in the response type to handle any legacy rows or call sites that do not eager-load `User`.

No changes are required to the `Meditation` Sequelize model itself; the association provides the join automatically.

---

## Web Profile Approach

### API wrapper

In `web/src/lib/api/auth.ts`, one function is added:

```
updateUsername(username: string): Promise<UpdateUsernameResponse>
  → apiClient.patch<UpdateUsernameResponse>("/users/me/username", { username })
```

### Redux integration

The auth slice already stores the `User` object and has reducers that accept `{ user: User }` from profile and preference endpoints. The `updateUsername` thunk dispatches the same fulfilled action that the preference update thunk dispatches, replacing the stored user with the returned user. No new reducer logic is required; `username` is present on the type and flows through.

### Profile settings UI

A username input field is added to the existing profile settings page or modal. It shows the current `username` from the Redux store, validates client-side using the same 3–30 character `[a-z0-9._-]` lowercase rule, and on submit calls `updateUsername`. On success the Redux user is updated and the field reflects the new value. On `409` it surfaces a "username already taken" inline error.

---

## Tests / Validation Strategy

**Migration tests** — a test fixture seeds the `users` table with rows having null usernames, then runs the backfill logic and asserts: no null values remain, all values are lowercase, all values are unique case-insensitively, no value exceeds 30 characters.

**Unit tests for `deriveUsername`** — cover the stripping, lowercasing, truncation, and suffix increment cases including the 30-character cap.

**Integration tests for `createUserWithRetry`** — mock `User.create` to throw `UniqueConstraintError` on the first N calls, assert it retries and ultimately succeeds, and assert it surfaces the error after the retry limit.

**API route tests** — `PATCH /users/me/username`: valid update returns `{ user: User }` with updated username; duplicate username returns `409`; unauthenticated request returns `401`; invalid format returns `400 VALIDATION_ERROR`.

**Shared type compile check** — TypeScript compilation of all packages after adding `username` to `User` surfaces any consumer that destructures `User` without the new field, making breakage visible before runtime.

**Meditation feed serialization tests** — existing meditation endpoint tests are extended to assert `createdByUsername` is present (non-null) for meditations that have a linked user, and null/omitted for any meditation loaded without an included user.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Backfill produces collisions for large user sets with similar or suffix-like email prefixes | Deterministic global allocation checks each candidate against all already-assigned usernames, progresses suffixes as far as needed, truncates the base to reserve suffix length, verifies uniqueness before `NOT NULL` and index creation, and can be re-run if it fails partway through |
| `ALTER COLUMN SET NOT NULL` blocks writes until it completes | Run during low-traffic window; step is fast because backfill already guarantees zero nulls |
| Race between two registrations choosing the same derived username | `createUserWithRetry` catches the real database `UniqueConstraintError` and retries; unique index is the enforcement point |
| Old API creates users during the full migration before new code is live | Pause account-creation writes or stop the API for the migration/deploy boundary, deploy username-aware API before reopening writes, then smoke-test local registration and Google new-user creation |
| Frontend shows stale username after update | Redux dispatch of the returned `{ user: User }` replaces the entire stored user, so the UI is always consistent with the server response |
| Meditation feed breaks if User eager-load is missing | `required: false` (LEFT JOIN) ensures meditations without a linked user still serialize; `createdByUsername` is typed nullable/optional |
| Build order mistakes cause type errors | `npm run build:shared` is a single root-level command that enforces correct compilation order; documented as the required first step |

---

## Dependencies for Later PRDs

- **Public profile pages** — once `username` is stable and unique, a route like `/u/:username` can be introduced to display a user's public meditations. No schema change required; the username is already indexed.
- **Meditation table rendering** — the upcoming table PRD can consume `createdByUsername` from the already-serialized feed response without any additional API work.
- **Username display in meditation cards** — front-end rendering of `createdByUsername` in the public feed is a pure UI addition on top of the already-available field.
- **Admin username management** — a future admin PRD may need to allow admins to reset usernames; the `PATCH /users/me/username` pattern can be extended to `PATCH /users/:id/username` behind an `isAdmin` guard without architectural changes.
