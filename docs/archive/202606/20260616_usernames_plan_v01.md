---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# Implementation Plan — PRD1: Usernames

## Overview

This plan covers the end-to-end addition of a `username` field to GoLightly's user model, including database migration and backfill, API surface changes, propagation of creator username into meditation payloads, and a profile-page UI for viewing and editing the field.

The scope is limited to PRD1: making `username` a first-class field on existing users, assigning it at account creation, exposing it in the API, and surfacing `createdByUsername` on meditation records so downstream PRDs (public profiles, table UI) can consume it without further schema work.

The architectural principle throughout is **additive-only**: every change must leave existing call sites—other routes, existing clients, worker-node—untouched unless they are explicitly in scope for this PRD.

---

## Decisions Resolved

| Question | Decision | Rationale |
|---|---|---|
| Case sensitivity | Stored and compared **lowercase only** | Avoids case-collision bugs; consistent with email handling already in the repo |
| Allowed characters | `[a-z0-9._-]` | Standard, human-friendly username set; no Unicode edge cases at this stage |
| Length constraints | 3–30 characters | Short enough for display; long enough for real names/handles |
| Endpoint | `PATCH /users/me/username` (dedicated) | Keeps validation logic isolated; `PATCH /users/me/preferences` handles a different concern |
| Backfill strategy | `sanitize(email_local_part)` → collision suffix (`nick`, `nick2`, ...) ordered by `id`; fallback `user{id}` when sanitized base is empty | Deterministic, repeatable, audit-friendly |
| Username uniqueness check at registration | Retry loop (up to 3 attempts) with incrementing suffix before raising an error | Guards the TOCTOU window between uniqueness check and INSERT |
| `createdByUsername` nullability | The field is `string \| null` in shared types and the API response | Existing meditations pre-backfill, or meditations whose creator account is deleted, must not block the API response |
| Migration tooling | Raw SQL file in `db-models/migrations/`, consistent with existing convention | No new tooling introduced |

---

## Existing Architecture Touched

### `db-models`

**`db-models/src/models/User.ts`** is the Sequelize model for the `users` table. It uses `underscored: true`, so a TypeScript field `username` maps to `username` in the DB (no underscore needed here). The field must be added with `allowNull: false` after backfill is guaranteed, but the migration itself adds it as `NULL`-able first, then backfills, then adds the `NOT NULL` constraint and unique index in the same transaction. This is the only model file that changes in the DB layer.

No other model file changes. The `Meditation` model gains a runtime association path (User include) but no new columns.

### `shared-types`

**`shared-types/src/user.ts`**: The `User` type and `UserProfileResponse` gain `username: string`. A new `UpdateUsernameRequest` and `UpdateUsernameResponse` are added. No existing types are removed or narrowed.

**`shared-types/src/meditation.ts`**: The `Meditation` type gains `createdByUsername: string | null`. Existing fields are untouched.

### `api`

**`api/src/routes/users.ts`**: `mapUser()` gains `username`. A new route `PATCH /users/me/username` is added. The register handler and Google auth handler both call a shared `assignUsername(base, trx?)` utility before committing the user INSERT. No existing route signatures change.

**`api/src/routes/meditations.ts`**: `mapMeditationRecord()` gains `createdByUsername`. The `loadMeditationOrThrow` helper and the public/owner list routes each add an `include: [{ model: User, attributes: ['username'] }]` clause. The return type of `mapMeditationRecord` widens; no call site breaks because they all consume the mapped object, not a narrowed subtype.

### `web`

**`web/src/lib/api/auth.ts`**: Gains a `updateUsername(username: string)` function that calls `PATCH /users/me/username`. The existing `updateUserPreferences` is untouched.

**`web/src/app/profile/page.tsx`**: Gains a username display/edit field. The `setUser` dispatch is already in place; the Redux store's `User` type will widen automatically once `shared-types` is rebuilt.

---

## Data Model / Migration Approach

### Migration file

**Filename**: `db-models/migrations/YYYYMMDDHHMMSS-add-users-username.sql`

The migration runs as a single transaction with four logical phases:

1. **Add column as nullable**
   ```sql
   ALTER TABLE users ADD COLUMN username VARCHAR(30) DEFAULT NULL;
   ```

2. **Backfill existing rows** using a deterministic CTE. The logic sanitizes `SPLIT_PART(email, '@', 1)` — stripping characters outside `[a-z0-9._-]` and lowercasing — then assigns the suffix-free base to the row with the lowest `id` holding that base, and appends a numeric suffix (starting at 2) to each subsequent row in ascending `id` order. Rows where the sanitized base is empty receive `'user' || id`.

   The CTE approach means the entire backfill is a single `UPDATE ... FROM (SELECT ...)` statement. No procedural loop, no risk of partial application.

3. **Set NOT NULL constraint**
   ```sql
   ALTER TABLE users ALTER COLUMN username SET NOT NULL;
   ```

4. **Add unique index**
   ```sql
   CREATE UNIQUE INDEX users_username_unique ON users (username);
   ```

All four phases execute within the same `BEGIN`/`COMMIT` block so a failure at step 3 or 4 rolls back the backfill rather than leaving the column in an inconsistent state.

### Sequelize model addition (`User.ts`)

```ts
username: {
  type: DataTypes.STRING(30),
  allowNull: false,
  unique: true,
  validate: {
    is: /^[a-z0-9._-]{3,30}$/,
  },
},
```

The `field` option is omitted because `underscored: true` only affects multi-word names; `username` needs no mapping.

---

## API / Shared Types Approach

### `shared-types` changes

```ts
// user.ts additions
export interface UpdateUsernameRequest {
  username: string;
}

export interface UpdateUsernameResponse {
  user: User;
}

// Existing User type gains:
username: string;
```

```ts
// meditation.ts — existing Meditation type gains:
createdByUsername: string | null;
```

### `mapUser()` in `api/src/routes/users.ts`

The existing mapper already returns a plain object. Adding `username: user.username` is a one-line change. All existing callers of `mapUser()` — `/me`, login, register, Google auth, `/me/preferences` — automatically include username in their responses without any further change.

### New endpoint: `PATCH /users/me/username`

**Auth**: `requireAuth` middleware (same as `/me/preferences`).

**Request body**: `{ username: string }` validated against `UpdateUsernameRequest`.

**Server-side validation** (in order):
1. Trim and lowercase the input.
2. Check length: 3–30 characters. Return `400` with `{ error: 'USERNAME_TOO_SHORT' | 'USERNAME_TOO_LONG' }`.
3. Check character set against `/^[a-z0-9._-]+$/`. Return `400` with `{ error: 'USERNAME_INVALID_CHARS' }`.
4. Check uniqueness via `User.findOne({ where: { username } })`. If taken, return `409` with `{ error: 'USERNAME_TAKEN' }`.
5. `User.update({ username }, { where: { id: req.user.id } })`.
6. Refetch and return `UpdateUsernameResponse`.

The uniqueness check at step 4 does not use a DB-level constraint as the sole guard — the constraint is still there as a last-ditch safety net and will manifest as a Sequelize `UniqueConstraintError` that the route catches and maps to the same `409` shape.

### `assignUsername(base, transaction?)` utility

A shared function (co-located in `api/src/routes/users.ts` or extracted to `api/src/lib/username.ts`) used at both local registration and Google account creation.

```
sanitize(base) → strip invalid chars, lowercase, trim to 30 chars
if sanitized is empty → use 'user' + temp placeholder (replaced post-INSERT with real id)
attempt INSERT with username = sanitized
  on UniqueConstraintError: append '2', '3', ... up to attempt limit (10)
  on still-unique-error after limit: throw 500
```

For Google auth, the base is derived from the Google profile's display name or email local part (whichever is available). For local registration, it is derived from the email local part.

Because the user `id` is not known before the INSERT, the `user{id}` fallback only applies in the **migration backfill** for existing rows. For new registrations, the base will always have at least the email local part to derive from, so the empty-base path is not expected in practice; it is nonetheless handled for safety.

---

## Meditation Creator Serialization Approach

The design goal is to expose `createdByUsername` on every meditation response without introducing a mandatory join that could silently return `null` records or break existing call sites that call `Meditation.findByPk` without an include.

### Strategy

`loadMeditationOrThrow` is updated to include the User association:

```ts
const meditation = await Meditation.findByPk(id, {
  include: [{ model: User, attributes: ['id', 'username'] }],
});
```

The existing `Association` between `Meditation` and `User` (`Meditation.belongsTo(User, { foreignKey: 'userId' })`) already exists in `db-models/src/db.ts`, so Sequelize will resolve `meditation.User` automatically.

`mapMeditationRecord()` already accepts an `options` parameter. It is updated to read:

```ts
createdByUsername: (meditation as any).User?.username ?? null,
```

The same include is added to:
- `Meditation.findAll` in the public list route (the route that returns meditations for a given user's public profile).
- `Meditation.findAll` in the authenticated owner list route.

List routes that do not include User explicitly (e.g., admin routes) will have `createdByUsername: null` in their responses, which is acceptable because those routes are internal.

### Why not a JOIN on every route unconditionally

Adding `include: [User]` to every `Meditation.findAll` call would couple meditation queries to the users table everywhere, including bulk admin operations. The targeted approach — include only where the result is consumed by `mapMeditationRecord` — keeps the blast radius minimal.

---

## Web Profile Approach

### State management

The Redux `User` type is derived from `shared-types/src/user.ts`. Once `shared-types` is rebuilt, the store automatically carries `username`. No store slice changes are needed.

### Profile page (`web/src/app/profile/page.tsx`)

The page currently dispatches `setUser` from a `getProfile()` call on mount. The new username field is added as a controlled input with a separate save button, mirroring the pattern used by any future preference field.

**Flow**:
1. On mount, `username` is populated from the store (already fetched via `/users/me`).
2. User edits the field; local state tracks the draft.
3. On submit, `updateUsername(draft)` is called.
4. On success, `setUser` is dispatched with the updated user from the response.
5. On error, the API error code (`USERNAME_TAKEN`, `USERNAME_INVALID_CHARS`, etc.) is mapped to a human-readable inline message beneath the field. No toast/modal — inline is consistent with how form errors are handled elsewhere in the codebase.

### `web/src/lib/api/auth.ts`

```ts
export async function updateUsername(
  username: string
): Promise<UpdateUsernameResponse> {
  const res = await fetch('/api/users/me/username', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username } satisfies UpdateUsernameRequest),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}
```

---

## Tests / Validation Strategy

### Unit-level

- **Username sanitizer / `assignUsername`**: Pure function tests covering: valid base passes through unchanged; invalid chars are stripped; empty result triggers `user{n}` fallback; suffix increments correctly on simulated collisions.
- **`mapMeditationRecord`**: Test that `createdByUsername` is `null` when `User` is not included, and populated when it is.

### Integration-level (against real DB or test DB)

- **Migration idempotency**: Run migration on a DB seeded with known rows; assert all `username` values match expected backfill output; assert the unique constraint rejects a duplicate insert.
- **`POST /users/register`**: Assert the response body includes `username` derived from the email; assert a second registration with a colliding email local part gets a suffix.
- **`PATCH /users/me/username`**: Happy path returns 200 with updated user. Too-short, too-long, invalid-char, and duplicate inputs each return the correct status and error code.
- **`GET /meditations` (public list)**: Assert `createdByUsername` is present and correct in every item. Assert the route still works when the creator has no username (pre-migration state is not reproducible post-migration but can be simulated by temporarily nulling the column in a test fixture).

### TypeScript build order

`shared-types` must be built before `api`, `worker-node`, and `web`. `db-models` must be built before `api`. The npm workspace build order is: `db-models` → `shared-types` → `api` / `worker-node` / `web`. Any CI step that builds downstream packages without first building `shared-types` and `db-models` will fail on type errors; fix CI scripts before merging.

---

## Risks and Mitigations

### Backfill collision edge cases

**Risk**: Two users share the same email local part (e.g., `nick@gmail.com` and `nick@yahoo.com`). The CTE backfill assigns `nick` to the lower `id` and `nick2` to the higher. This is correct but produces non-intuitive usernames for one of the users.

**Mitigation**: Accepted. The user can change their username on the profile page immediately. Document in the migration comment.

### TOCTOU on username registration

**Risk**: Between the uniqueness SELECT and the INSERT, another request claims the same username, causing a unique constraint violation.

**Mitigation**: The `assignUsername` function wraps the check-and-insert in a retry loop (up to 10 attempts with incrementing suffix). The DB constraint is the final guard and the caught `UniqueConstraintError` triggers the next suffix attempt. 10 retries is far beyond any realistic concurrent load.

### `createdByUsername` null in production before backfill runs

**Risk**: If the API is deployed before the migration runs (e.g., during a rolling deploy), `meditation.User?.username` will be undefined and `createdByUsername` will be `null`.

**Mitigation**: Migration must run before new API code is live. Document the deploy order: `run migration → deploy api → deploy web`. The `null` value is typed as acceptable in shared-types so the web client will not crash; it will simply not display a username until the migration completes.

### Large `users` table backfill locking

**Risk**: On a large table, the single-statement `UPDATE ... FROM (SELECT ...)` CTE backfill holds a table lock for the duration.

**Mitigation**: At the current scale of GoLightly, this is not a concern. If the table grows significantly before this migration runs, the mitigation is to batch the backfill in application code (outside the migration) and run the `NOT NULL` constraint addition separately. Document this as an out-of-scope concern.

### Association not registered at module load time

**Risk**: If `loadMeditationOrThrow` or a list route executes the `include: [{ model: User }]` query before the `Meditation.belongsTo(User)` association is registered, Sequelize will throw at query time.

**Mitigation**: Associations are registered in `db-models/src/db.ts` at DB initialization, which runs before any route handler. The existing `Meditation.belongsTo(User)` is already registered. Verify in the test suite that the include resolves correctly.

### Web Redux type mismatch after partial build

**Risk**: If `web` is built against a stale `shared-types` that still lacks `username`, the Redux store type will not include `username`, causing TypeScript errors on the profile page.

**Mitigation**: CI enforces clean builds from root. Local dev must run `npm run build --workspace=shared-types` before `npm run dev` in `web` to pick up type changes.

---

## Dependencies for Later PRDs

**PRD2 (public profiles / meditation table UI)**:
- Requires `username` to be available on `User` in the API response — satisfied by this PRD.
- Requires `createdByUsername` on the meditation list response — satisfied by this PRD.
- Will likely add a `GET /users/:username` route for public profile lookup. The unique index on `users.username` added in this PRD makes that query efficient.
- Will need the profile page to link to public profile URLs constructed from `username`; the username field added here is the stable identifier to use.

**PRD3 (taxonomy / type / subtype)**:
- No dependency on usernames. Can proceed in parallel after PRD1 merges.

**Any PRD adding social features (following, feed)**:
- Depends on `username` being unique, non-null, and indexed — all guaranteed by this PRD's migration.
- The username change endpoint (`PATCH /users/me/username`) will need rate-limiting or a change-history table if usernames become part of shareable URLs. That is explicitly out of scope here; document as a future constraint.
