---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# Usernames Plan V02

## Overview

This plan covers the work to introduce a `username` field for users — creation, uniqueness enforcement, collision-safe suffixing, exposure through the API, and surfacing the creator's username on meditation listings. It corresponds to PRD1 (username infrastructure and meditation creator display) and does not include table rendering, taxonomy, or admin work from later PRDs.

## Decisions resolved

- **Username format**: lowercase alphanumeric plus hyphens and underscores, 3–30 characters, validated by a shared regex in `shared-types`.
- **Collision strategy**: suffix-based (`nick`, `nick2`, `nick3`, …). The base is truncated to `30 - suffix.length` characters before appending so the result never exceeds 30 characters. Suffixes begin at `2` and increment. Tests must cover the edge case where the base is already exactly 30 characters.
- **Unique retry location**: the retry loop wraps the actual `User.create` call (or an equivalent attributes-plus-callback form) so that a real `UniqueConstraintError` caught from the database triggers the next suffix attempt. A pre-insert `findOne` check alone is insufficient because it cannot close the race window.
- **Migration vs. generated column**: a real `username` column with a `UNIQUE` index is added via migration; no generated/virtual column.
- **Backfill**: a one-time script derives usernames from existing email prefixes and runs the same truncation+suffix logic to resolve conflicts, executed as part of the deployment step before the API goes live.
- **Token exposure**: `username` is included in the JWT payload and the `/auth/me` response so the web client can display it without an extra fetch.

## Existing architecture touched

| Package | Location | Change |
|---|---|---|
| `db-models` | `src/models/User.ts` | Add `username` field |
| `db-models` | `src/models/associations.ts` | Confirm/add `User` include on `Meditation.findAll` used by `/meditations/all` |
| `db-models` | `src/index.ts` | Associations initialized here; no `db.ts` exists |
| `api` | `src/routes/users.ts` (mounted at `/users`) | Add `router.patch("/me/username", …)` — external endpoint resolves to `PATCH /users/me/username` |
| `shared-types` | `src/index.ts` | Add `UpdateUsernameRequest`, `UpdateUsernameResponse`, username regex constant |
| `web` | `src/lib/apiClient.ts` | Add `updateUsername` using `apiClient.patch<UpdateUsernameResponse>("/users/me/username", data)` |
| `worker-node` | backfill script | One-time migration helper |

## Data model / migration approach

Add a new Sequelize migration that:

1. Adds `username VARCHAR(30) NOT NULL DEFAULT ''` to `Users`.
2. Adds a `UNIQUE` constraint/index on `username`.
3. The default is a temporary placeholder; the backfill script runs immediately after to populate all rows before the default is tightened or the column is set to non-nullable in a follow-up migration.

The `User` model gains:

```
username: DataTypes.STRING(30)
```

with a model-level `validate` using the shared regex, and a `unique: true` declaration so Sequelize emits `UniqueConstraintError` on collision.

## API / shared-types approach

**shared-types additions**

```
USERNAME_REGEX = /^[a-z0-9_-]{3,30}$/
interface UpdateUsernameRequest { username: string }
interface UpdateUsernameResponse { username: string }
```

**API route** (`users.ts`, router mounted at `/users`):

```
router.patch("/me/username", requireAuth, async (req, res) => { … })
```

This is reachable externally as `PATCH /users/me/username`. The handler validates the incoming value against `USERNAME_REGEX`, calls `user.update({ username })`, and returns `UpdateUsernameResponse`. A `UniqueConstraintError` from Sequelize returns HTTP 409.

**Web API wrapper** uses the existing client pattern:

```ts
export const updateUsername = (data: UpdateUsernameRequest) =>
  apiClient.patch<UpdateUsernameResponse>("/users/me/username", data);
```

No raw `fetch` or `/api/...` prefixes anywhere.

## Unique retry / creation-time suffixing approach

The collision-safe helper is a standalone async function, testable in isolation:

```
async function createUserWithUniqueUsername(attributes: UserCreationAttributes): Promise<User>
```

It derives a candidate from the email prefix, truncates the base to `30 - suffix.length` characters (where suffix is the string representation of the counter, e.g. `"2"` has length 1), then attempts `User.create(attrs)`. On `UniqueConstraintError` it increments the counter and retries. On any other error it rethrows. This function is called from the registration handler in place of the bare `User.create` call, so real database uniqueness violations are caught and retried correctly.

Truncation rule summary:

- Counter 1 (no suffix): base truncated to 30 chars.
- Counter 2 (`"2"`, length 1): base truncated to 29 chars, then `"2"` appended.
- Counter N: base truncated to `30 - len(String(N))`, then `String(N)` appended.

Unit tests must include a case where the input email prefix is exactly 30 characters and a collision exists, verifying the generated suffixed username stays ≤ 30 characters.

## Meditation creator serialization approach

`GET /meditations/all` is the existing route that returns the meditation list. Its Sequelize query must include:

```ts
include: [{ model: User, attributes: ["username"] }]
```

This requires `db-models/src/models/associations.ts` to define `Meditation.belongsTo(User, { foreignKey: "createdBy", as: "creator" })` (or equivalent). Associations are registered by `db-models/src/index.ts`; no separate `db.ts` exists. The response serializer maps `meditation.creator?.username` to `createdByUsername` on the outbound DTO.

`shared-types` gains an optional `createdByUsername?: string` on the meditation response type so PRD2 can consume it without a further API change.

There are no public profile routes or owner-list routes referenced in this plan; all creator data flows through the existing `/meditations/all` endpoint.

## Web profile approach

A minimal `/profile` or `/settings/username` page is added to the web app. It:

- Reads the current username from the auth context (populated from JWT or `/auth/me`).
- Calls `updateUsername` from the API wrapper on form submit.
- Displays the 409 conflict error inline without page reload.

No public-facing profile pages are in scope for this PRD.

## Tests / validation strategy

**Unit tests (worker-node or api package)**

- `createUserWithUniqueUsername`: happy path, single collision (retry produces `base2`), collision at 30-char base (verify length ≤ 30), multiple sequential collisions.
- `USERNAME_REGEX`: valid and invalid strings covering each character class and boundary lengths.

**Integration tests (api package)**

- `PATCH /users/me/username` with a valid token returns 200 and updated username.
- `PATCH /users/me/username` with a taken username returns 409.
- `PATCH /users/me/username` without auth returns 401.
- `GET /meditations/all` response includes `createdByUsername` on each item that has a creator.

**Build order**

`shared-types` and `db-models` must be compiled before any consumer package runs type-checks or builds. The root `build:shared` script already sequences `shared-types` then `db-models`. Any CI step for `api`, `worker-node`, or `web` must run `npm run build:shared` first. If new npm scripts are added or updated, they must preserve this ordering.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Backfill window: users can register between migration and backfill | Registration path uses `createUserWithUniqueUsername` immediately; backfill only touches pre-existing rows |
| Unique retry infinite loop | Cap retries at a configurable limit (default 10); throw after cap |
| JWT stale after username change | `/auth/me` always returns current DB value; advise clients to refresh token or re-fetch on username update |
| Sequelize `UniqueConstraintError` vs. `ValidationError` confusion | Tests assert on the specific Sequelize error class so handler branching is verified |
| Build order breaks type-check in CI | Document `npm run build:shared` as a prerequisite step; verify in CI matrix before merging |

## Dependencies for later PRDs

- PRD2 (meditation table rendering) depends on `createdByUsername` being present on the `/meditations/all` response. This plan delivers that field; PRD2 may proceed once this branch is merged.
- PRD3 (admin username management) depends on the `username` column, the uniqueness logic helper, and the `PATCH /users/me/username` endpoint all existing.
- No other PRDs in the current roadmap are blocked by this work.
