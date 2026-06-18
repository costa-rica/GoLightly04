---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# Usernames Plan V03

## Overview

Adds a `username` field to the `Users` table, surfaces it on authentication responses and the `/users/me` profile endpoint, exposes it on meditation list and detail responses as `createdByUsername`, and adds a `PATCH /users/me/username` endpoint for self-service username changes. No table-rendering or taxonomy work is in scope.

## Decisions Resolved

- **Column nullability**: `username` starts nullable with no default and no unique constraint. After backfill it becomes NOT NULL, and a unique functional index on `lower(username)` is added. This avoids duplicate placeholder collisions and satisfies case-insensitive uniqueness.
- **Retry helper**: a single shared helper wraps `User.create` (and the update path) and retries on `UniqueConstraintError` with a numeric suffix. Suffix length is reserved so the full username never exceeds 30 characters.
- **Association source**: the existing `Meditation.userId` → `User` association defined in `db-models/src/models/associations.ts` and initialized via `db-models/src/index.ts` is used as-is. No new alias or `createdBy` field is introduced.
- **Serialization field name**: meditations expose the creator as `createdByUsername` (string | null). It is null for meditations whose joined User row has no username yet and for call sites that do not include the User.
- **Auth surface**: `GET /users/me` is the profile route; there is no `/auth/me`. `mapUser` is extended to include `username` so login (`POST /users/login`), google-auth (`POST /users/google-auth`), and `/users/me` all return it consistently.
- **Web API call**: `apiClient.patch<UpdateUsernameResponse>("/users/me/username", data)`. The Express router registers this as `router.patch("/me/username", ...)` inside the `users` router mounted at `/users`, making the external path `PATCH /users/me/username`.
- **Build order**: `npm run build:shared` at the repo root builds `shared-types` then `db-models` in dependency order. It must be run before any downstream `api`, `web`, or `worker` typecheck or build because those packages do not rebuild shared packages themselves.

## Existing Architecture Touched

| Package | Files | Nature of change |
|---|---|---|
| `db-models` | `models/User.ts`, `migrations/` | Add column, add index |
| `db-models` | `models/associations.ts` | No change — association already exists |
| `db-models` | `index.ts` | No change — already initializes associations |
| `shared-types` | `user.ts`, `meditation.ts` | Add `username` to user response; add `createdByUsername` to meditation response |
| `api` | `routes/users.ts` | New `PATCH /me/username`; extend `mapUser` |
| `api` | `routes/meditations.ts` | Include User on `GET /meditations/all` and `GET /meditations/:id` via `loadMeditationOrThrow`; serialize `createdByUsername` |
| `api` | `services/userRegistration.ts` (new) | Shared retry helper |
| `web` | `api/users.ts` | Add `updateUsername`, `getProfile` remains `/users/me` |
| `web` | profile UI component | Username display and edit form |

## Data Model / Migration Approach

Three sequential migrations are required and must not be collapsed into one:

**Migration 1 — add nullable column**

```sql
ALTER TABLE "Users" ADD COLUMN username VARCHAR(30);
```

No default, no unique constraint. The column is nullable so existing rows are unaffected.

**Migration 2 — backfill unique values**

A scripted migration iterates existing users and assigns a username derived from the display name or email local part, appending a numeric suffix when needed. Each candidate is checked against already-assigned values within the migration transaction. Because the column has no unique constraint yet, the backfill logic must track uniqueness in application memory (or use a subquery) rather than relying on DB rejection.

**Migration 3 — enforce NOT NULL and add unique index**

```sql
ALTER TABLE "Users" ALTER COLUMN username SET NOT NULL;
CREATE UNIQUE INDEX users_username_lower_uidx ON "Users" (lower(username));
```

The functional index enforces case-insensitive uniqueness without changing stored case.

### Username generation rules

- Derived from `displayName` (strip non-alphanumeric, lowercase) or email local part.
- Maximum 30 characters total including any numeric suffix.
- Suffix reserved: if base is 28 characters, suffix space is 2 digits (up to `_99`); base is truncated to leave room.
- Retry limit: 10 attempts before raising a hard error.

## API / Shared Types Approach

### Shared types additions (`shared-types`)

```ts
// user.ts
export interface UserResponse {
  id: number;
  email: string;
  displayName: string;
  username: string;          // added
  role: string;
  // ...existing fields
}

export interface UpdateUsernameRequest {
  username: string;
}

export interface UpdateUsernameResponse {
  username: string;
}
```

```ts
// meditation.ts — existing response type extended
export interface MeditationResponse {
  // ...existing fields
  createdByUsername: string | null;   // added; null when user row unavailable
}
```

### Registration retry helper (`api/services/userRegistration.ts`)

Both the local registration path (`POST /users/register`) and the new-user branch of `POST /users/google-auth` call this helper instead of calling `User.create` directly:

```ts
async function createUserWithUsername(attrs: UserCreateAttrs): Promise<User>
```

It generates an initial username candidate, calls `User.create`, and on `UniqueConstraintError` from the username column retries with an incremented numeric suffix (up to 10 attempts). Suffix length is calculated before truncating the base so the total never exceeds 30 characters.

### `mapUser` extension (`api/routes/users.ts`)

```ts
function mapUser(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    username: user.username,
    role: user.role,
    // ...
  };
}
```

All existing callers of `mapUser` automatically include `username`.

### New route: `PATCH /me/username`

Registered as `router.patch("/me/username", requireAuth, async (req, res) => { ... })` inside `routes/users.ts`. External path is `PATCH /users/me/username`.

Validation: username 3–30 characters, alphanumeric plus underscore, no leading/trailing underscore. Returns `UpdateUsernameResponse`. On `UniqueConstraintError` returns HTTP 409.

## Meditation Creator Serialization Approach

`loadMeditationOrThrow` (used by `GET /meditations/:id`) and the list query for `GET /meditations/all` both include `{ model: User, attributes: ["username"] }` in their Sequelize `include` option. No alias is used; the association is accessed as `meditation.User`.

Serialization:

```ts
createdByUsername: meditation.User?.username ?? null
```

This is safe for meditations created before the username backfill (where `username` may briefly be null) and for any call site that omits the include. The field is typed `string | null` in shared types and the API response.

## Web Profile Approach

### API wrapper (`web/src/api/users.ts`)

```ts
export async function updateUsername(data: UpdateUsernameRequest): Promise<UpdateUsernameResponse> {
  return apiClient.patch<UpdateUsernameResponse>("/users/me/username", data);
}

export async function getProfile(): Promise<UserResponse> {
  return apiClient.get<UserResponse>("/users/me");
}
```

`getProfile` is unchanged; it already targets `/users/me`.

### UI

The profile page displays the current username returned by `getProfile()` (which now includes it via `mapUser`). An edit form calls `updateUsername` and refreshes the displayed value. Username is also available immediately after login and google-auth without a separate profile fetch because login and google-auth responses already include it.

## Tests / Validation Strategy

### Unit / integration tests

- **`createUserWithUsername` helper**: test base-case creation, suffix retry on collision, suffix length capped at 30 chars, hard error after 10 collisions.
- **`POST /users/register`** and **`POST /users/google-auth`** (new-user branch): verify `username` appears in the response body.
- **`GET /users/me`**: verify `username` is present after login.
- **`PATCH /users/me/username`**: happy path, 409 on duplicate, 422 on invalid format, 401 unauthenticated.
- **`GET /meditations/all`**: each item includes `createdByUsername`; value matches the creator's username. Test that null is returned for a meditation whose creator has no username (pre-backfill simulation).
- **`GET /meditations/:id`** via `loadMeditationOrThrow`: same `createdByUsername` assertions.

### Migration tests

- After Migration 1: existing rows have `username IS NULL`.
- After Migration 2: all rows have non-null, non-empty, unique (case-insensitive) usernames.
- After Migration 3: `NOT NULL` constraint rejects insert without username; duplicate lower-cased username rejected by index.

### Build verification

Run `npm run build:shared` before any downstream typecheck to catch shared-type regressions early.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Backfill produces duplicate usernames | Migration 2 tracks assigned values in-transaction; suffix retry logic is the same used at runtime |
| Race condition on suffix retry at runtime | `UniqueConstraintError` catch-and-retry in helper; DB unique index is the authoritative guard |
| `meditation.User` is undefined at serialization | `?.username ?? null` pattern; `createdByUsername` typed as `string | null` |
| Downstream packages typecheck against stale shared types | `build:shared` step documented as prerequisite; CI enforces order |
| Username change breaks existing references | Out of scope for this PRD; no cross-table denormalization is introduced |
| 30-char limit broken by suffix | Suffix length reserved before base truncation in helper |

## Dependencies for Later PRDs

- **Table rendering PRD**: can display `createdByUsername` from the already-included field without additional backend work.
- **Taxonomy PRD**: no dependency on username column, but the `db-models` package build chain established here must be respected.
- **Admin PRD**: admin username management (if any) would reuse the same retry helper and `PATCH` route pattern.
