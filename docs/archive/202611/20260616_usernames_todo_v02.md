---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# Usernames Implementation TODO — V02

Aligned to: `docs/20260616_USERNAMES_PLAN_V09.md`
Source PRD: `docs/20260616_prd1_usernames_plan_v01.md`
Supersedes: `docs/20260616_USERNAMES_TODO_V01.md`

## Global rules for implementers

- [ ] Do not begin implementation until this TODO is the latest vetted TODO.
- [ ] Use the repository's existing TypeScript/npm workspace architecture; do not introduce a new migration runner unless this TODO explicitly asks for it.
- [ ] Username canonical rules everywhere: trim, lowercase, 3–30 characters, allowed characters `[a-z0-9._-]`, digits may start usernames.
- [ ] Generated usernames derive from email local part only; no display name source.
- [ ] Collision suffix convention: first winner keeps `base`; later collisions use `base2`, `base3`, ... (not `base1`). Truncate `base` before appending a suffix so the final username is at most 30 characters.
- [ ] After each phase: update this checklist, run the listed validation for that phase, stage only that phase's intended files, and commit with a focused message.

---

## Phase 1 — Schema, migration, and shared contracts

### 1A. Raw SQL migration

- [ ] Create a new raw SQL migration in `db-models/migrations/`, following the existing filename style, e.g. `20260616_add_user_username.sql`.
- [ ] Keep the table name lowercase and unquoted: `users`.
- [ ] Add the column nullable first and idempotently:
  ```sql
  ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
  ```
- [ ] Backfill only rows where `username IS NULL`.
- [ ] Backfill derivation for each row:
  - [ ] Take the email local part before `@`.
  - [ ] Lowercase it.
  - [ ] Keep only `[a-z0-9._-]`.
  - [ ] If the cleaned base is empty, use a creation-safe seed such as `user`.
  - [ ] If the cleaned base is shorter than 3 characters, pad deterministically with safe characters such as `user` until it reaches 3 characters.
  - [ ] Do not require an auto-increment id to build a runtime-compatible username; migration may use id only for deterministic ordering.
- [ ] Allocate final usernames globally, not merely per normalized base:
  - [ ] Process rows deterministically, preferably ascending `id`.
  - [ ] For each row, try `base`, then `base2`, `base3`, ... until the candidate is absent from the complete set of already assigned `lower(username)` values.
  - [ ] Include pre-existing non-null usernames in the assigned set so reruns remain safe.
  - [ ] Before suffixing, truncate base to `30 - length(suffix)`.
  - [ ] Use no small fixed suffix cap; if an operational safety cap is needed inside a procedural loop, make it very high and raise an explicit error if exhausted.
  - [ ] Explicitly handle cross-base collisions such as email locals `nick`, another `nick`, and `nick2`.
- [ ] Prove correctness before constraints:
  ```sql
  SELECT COUNT(*) FROM users WHERE username IS NULL;
  SELECT lower(username), COUNT(*) FROM users GROUP BY lower(username) HAVING COUNT(*) > 1;
  SELECT COUNT(*) FROM users WHERE username !~ '^[a-z0-9._-]{3,30}$';
  ```
  The migration should abort if any check fails.
- [ ] Set NOT NULL only after the proof checks pass:
  ```sql
  ALTER TABLE users ALTER COLUMN username SET NOT NULL;
  ```
- [ ] Create the case-insensitive unique index idempotently, using the accepted plan's concurrent form if compatible with the actual migration runner:
  ```sql
  CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS users_username_lower_idx ON users (lower(username));
  ```
  If the actual runner wraps migrations in a transaction and cannot run `CONCURRENTLY`, document the maintenance-window reason and use the equivalent non-concurrent unique index inside that controlled window.
- [ ] Do not add a JS/TS `queryInterface` migration or `sequelize-cli` dependency unless a separate repo migration-runner task is explicitly added and validated.

### 1B. Migration verification fixture or script

- [ ] Add a repo-appropriate migration verification path. If no `db-models` test runner exists, create a documented script or SQL fixture rather than requiring `npm test` in `db-models`.
- [ ] Cover these cases:
  - [ ] `nick@example.com`, `nick@other.com`, `nick@third.com` → `nick`, `nick2`, `nick3`.
  - [ ] Cross-base collision: `nick@example.com`, another `nick@...`, and `nick2@...` all remain globally unique.
  - [ ] 100+ users with the same local part remain globally unique and ≤30 chars.
  - [ ] 30-character local parts with collisions truncate before suffixing.
  - [ ] Empty/punctuation-only locals use a valid seed.
  - [ ] One-character/two-character locals are padded to 3 chars.
  - [ ] Digit-leading locals remain valid; do not prefix only because they start with a digit.
- [ ] Confirm final database checks show zero nulls, zero duplicate `lower(username)`, and zero invalid-format usernames.

### 1C. Sequelize model and shared types

- [ ] Update `db-models/src/models/User.ts`:
  - [ ] Add `declare username: string;`.
  - [ ] Add a `username` attribute using `DataTypes.TEXT` (or length validation while keeping DB `TEXT`), `allowNull: false`.
  - [ ] Keep `tableName: "users"` unchanged.
  - [ ] Do not add a case-sensitive `unique: true` that conflicts with the lower-case unique index semantics; rely on the migration's `lower(username)` unique index for DB enforcement.
- [ ] Update `shared-types/src/user.ts`:
  - [ ] Add `username: string` to the existing `User` type; keep `id: number` and `authProvider: AuthProvider`.
  - [ ] Add `UpdateUsernameRequest = { username: string }`.
  - [ ] Add `UpdateUsernameResponse = { user: User }`.
- [ ] Update `shared-types/src/meditation.ts`:
  - [ ] Add `createdByUsername?: string | null` to `Meditation`.
- [ ] Update exports if needed by the package's existing `src/index.ts` pattern.

### 1D. Phase 1 validation and commit

- [ ] Run `npm run typecheck:shared` from the repo root.
- [ ] Run `npm run build:shared` from the repo root.
- [ ] If a migration verification script/fixture was added, run it and save its command/output notes in the implementation report.
- [ ] Commit only schema/shared-type changes. Suggested message: `feat: add username schema and shared types`.

---

## Phase 2 — API user creation, profile, and username update

### 2A. Username helpers in `api/src/routes/users.ts` or a small API-local helper module

- [ ] Implement a canonical normalizer used for registration, Google auth creation, and `PATCH /users/me/username` validation:
  - [ ] Trim input where applicable.
  - [ ] Lowercase.
  - [ ] Keep/validate `[a-z0-9._-]`.
  - [ ] Enforce 3–30 chars for user-submitted PATCH values.
  - [ ] For generated values from email local part, apply creation-safe fallback/padding for empty or too-short bases without requiring a database id.
- [ ] Implement candidate suffixing with the accepted convention: `base`, `base2`, `base3`, ...; no `base1`.
- [ ] Implement a high operational cap for runtime allocation/retry, with a clear error if exhausted; the cap must not be a small 5/10-attempt race-only limit.
- [ ] Ensure retry after a database `UniqueConstraintError` advances the suffix seed and does not recompute the same candidate repeatedly.

### 2B. Register and Google-auth creation paths

- [ ] In `POST /users/register`, wrap the actual `User.create` call in the username creation/retry helper.
- [ ] In the new-user branch of `POST /users/google-auth`, use the same helper wrapping the actual `User.create` call.
- [ ] Existing Google users keep their current `username`; do not overwrite customized names.
- [ ] Keep the current `RegisterResponse` shape unless intentionally changing shared types. The PRD does not require registration to return `username`; verify assigned username through DB lookup, login, or `GET /users/me` instead.
- [ ] Update `mapUser` so all existing user payloads include `username`:
  - [ ] Login response.
  - [ ] Google auth response.
  - [ ] `GET /users/me`.
  - [ ] Preference update response.
  - [ ] New username update response.

### 2C. Username update endpoint

- [ ] Add router-local route in `api/src/routes/users.ts`: `router.patch("/me/username", requireAuth, ...)`.
- [ ] Confirm the external path is `PATCH /users/me/username` because the users router is mounted at `/users`.
- [ ] Validate request body:
  - [ ] `username` must be a string.
  - [ ] Trim/lowercase before validation/storage.
  - [ ] Must match `^[a-z0-9._-]{3,30}$`.
  - [ ] Invalid input returns `400` with `VALIDATION_ERROR` using existing `AppError`/route error conventions.
- [ ] Check case-insensitive uniqueness excluding the current user.
- [ ] Map conflicts to `409 USERNAME_TAKEN` both for pre-check conflicts and Sequelize unique-index races.
- [ ] On success return `200` with `{ user: mapUser(...) }` matching `UpdateUsernameResponse`.

### 2D. API tests and validation

- [ ] Add/extend API tests for:
  - [ ] Register assigns a valid username in the database; verify through login or `GET /users/me`, not by assuming `RegisterResponse` includes username.
  - [ ] Register collision uses `nick`, then `nick2`, then `nick3`.
  - [ ] Google auth new-user branch assigns username; existing-user branch does not overwrite.
  - [ ] `PATCH /users/me/username` success returns `{ user }` with updated username.
  - [ ] Invalid PATCH values return `400 VALIDATION_ERROR`.
  - [ ] Taken username returns `409 USERNAME_TAKEN`.
  - [ ] Simulated `UniqueConstraintError` during create retries with an advanced suffix and eventually succeeds or returns explicit operational failure at the cap.
- [ ] Run `npm run build:shared` from the repo root before API checks.
- [ ] Run `npm test -w @golightly/api`.
- [ ] Run `npm run typecheck -w @golightly/api`.
- [ ] Run `npm run build -w @golightly/api`.
- [ ] Commit only API user-flow changes. Suggested message: `feat: add username user api flows`.

---

## Phase 3 — Meditation creator serialization

### 3A. Shared route behavior

- [ ] Use the existing association from `db-models/src/models/associations.ts`: `Meditation.belongsTo(User, { foreignKey: "userId" })`.
- [ ] Do not add a `createdBy` foreign key or nested `creator` alias/object.
- [ ] Update `mapMeditationRecord` to add flat `createdByUsername: meditation.User?.username ?? null` while preserving all existing fields.
- [ ] Keep the field optional/null-safe for call sites that do not eager-load `User`.

### 3B. Queries to update

- [ ] In `GET /meditations/all`, add a LEFT JOIN include:
  ```ts
  include: [{ model: User, attributes: ["id", "username"], required: false }]
  ```
- [ ] In `loadMeditationOrThrow` / `GET /meditations/:id`, add the same include.
- [ ] Destructure/import `User` from `getDb()` where needed.
- [ ] Verify other `mapMeditationRecord` callers still work when `meditation.User` is undefined.

### 3C. Tests and validation

- [ ] Add/extend API tests for `GET /meditations/all` showing `createdByUsername` is present and correct.
- [ ] Add/extend API tests for `GET /meditations/:id` showing `createdByUsername` is present and correct.
- [ ] Add a null-safe serialization test or fixture for a meditation record without an included `User`.
- [ ] Run `npm run build:shared` from the repo root before API checks.
- [ ] Run `npm test -w @golightly/api`.
- [ ] Run `npm run typecheck -w @golightly/api`.
- [ ] Run `npm run build -w @golightly/api`.
- [ ] Commit only meditation serialization changes. Suggested message: `feat: expose meditation creator usernames`.

---

## Phase 4 — Web profile username UI

### 4A. API wrapper

- [ ] Update `web/src/lib/api/auth.ts`:
  - [ ] Import `UpdateUsernameRequest` and `UpdateUsernameResponse`.
  - [ ] Add `updateUsername(data: UpdateUsernameRequest): Promise<UpdateUsernameResponse>`.
  - [ ] Use the existing `apiClient` pattern and return `response.data`:
    ```ts
    const response = await apiClient.patch<UpdateUsernameResponse>("/users/me/username", data);
    return response.data;
    ```

### 4B. Profile page UI

- [ ] Update `web/src/app/profile/page.tsx`:
  - [ ] Display the current `user.username` near the existing email/profile information.
  - [ ] Add a controlled username input initialized from `user.username`.
  - [ ] Use the same client-side validation rule as the API: lowercase `[a-z0-9._-]`, 3–30 chars; digits may start usernames.
  - [ ] On save, call `updateUsername({ username })`.
  - [ ] On success, dispatch `setUser(response.user)`.
  - [ ] Show inline errors for `400 VALIDATION_ERROR`, `409 USERNAME_TAKEN`, and generic network/server failures.
  - [ ] Preserve the existing script-mode preference behavior.
  - [ ] No full page reload.

### 4C. Web validation and commit

- [ ] Run `npm run build:shared` from the repo root before web checks because web does not rebuild shared packages itself.
- [ ] Run `npm run typecheck -w @golightly/web`.
- [ ] Run `npm run build -w @golightly/web`.
- [ ] If lint is stable in the repo, run `npm run lint -w @golightly/web`; if it fails due pre-existing issues, document that separately.
- [ ] Commit only web changes. Suggested message: `feat: add profile username editor`.

---

## Phase 5 — Full validation and rollout notes

### 5A. Full local validation

- [ ] Run `npm run build:shared` from the repo root.
- [ ] Run `npm run typecheck -w @golightly/api`.
- [ ] Run `npm test -w @golightly/api`.
- [ ] Run `npm run build -w @golightly/api`.
- [ ] Run `npm run typecheck -w @golightly/worker-node`.
- [ ] Run `npm test -w @golightly/worker-node`.
- [ ] Run `npm run build -w @golightly/worker-node`.
- [ ] Run `npm run typecheck -w @golightly/web`.
- [ ] Run `npm run build -w @golightly/web`.
- [ ] Do not run `cd db-models && npm test`; `db-models` currently has no test script unless one was explicitly added in Phase 1.

### 5B. Local/manual smoke checks

- [ ] Apply the migration to a local/dev database using the repository's actual SQL migration process.
- [ ] Confirm `users.username` is NOT NULL and `users_username_lower_idx` exists.
- [ ] Confirm zero null usernames and zero duplicate `lower(username)` groups.
- [ ] Local registration creates a user with an assigned username; verify via DB, login response, or `GET /users/me`.
- [ ] Second local registration with same email local part gets `base2` convention.
- [ ] Google OAuth new-user flow assigns username; existing Google user keeps username.
- [ ] `PATCH /users/me/username` valid value → `200` and `{ user }` has updated username.
- [ ] Invalid username → `400 VALIDATION_ERROR`.
- [ ] Taken username → `409 USERNAME_TAKEN`.
- [ ] `GET /users/me` and login responses include `username`.
- [ ] `GET /meditations/all` and `GET /meditations/:id` include flat `createdByUsername` string/null.
- [ ] Profile page loads current username, saves edits, dispatches Redux update, and preserves script-mode preference behavior.

### 5C. Production rollout note / maintenance boundary

- [ ] Document the production rollout sequence in the implementation report or a follow-up runbook if deployment is part of the same work.
- [ ] Use a maintenance/write-pause boundary for the full migration plus username-aware API deployment:
  - [ ] Pause account-creation writes or stop the API.
  - [ ] Run the raw SQL migration through the repo's actual migration process.
  - [ ] Deploy username-aware API build before reopening writes.
  - [ ] Deploy web build.
  - [ ] Reopen writes.
  - [ ] Smoke-test local registration and Google-auth new-user creation after reopening.
- [ ] Do not implement a zero-downtime expand/contract rollout unless Nick explicitly requests it.

### 5D. Final commit/readiness

- [ ] Run `git status --short --branch` and confirm only intended changes are present.
- [ ] Ensure all completed checklist items are checked in this TODO or summarized in the implementation report.
- [ ] Commit final validation/docs updates if any. Suggested message: `docs: record username rollout validation`.
- [ ] Report validation commands, any skipped commands with reasons, rollout notes, and current git status.
