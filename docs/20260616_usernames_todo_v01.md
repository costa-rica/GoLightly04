---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# Usernames Implementation TODO — V01

Aligned to: `docs/20260616_USERNAMES_PLAN_V09.md`
Source PRD: `docs/20260616_prd1_usernames_plan_v01.md`

---

## Overview

Add a unique, user-settable `username` field to `users`. Backfill all existing rows globally collision-aware. Surface username in API responses, meditation listings, and a web profile UI. Rollout is a single maintenance-window deploy (NOT NULL migration + username-aware API, no expand/contract).

---

## Phase 1 — Database Migration & Shared Types

### 1A. Migration file

- [ ] Create `db-models/migrations/<timestamp>-add-username-to-users.js` (or `.ts`)
- [ ] Step 1 — add nullable column:
  ```sql
  ALTER TABLE users ADD COLUMN username VARCHAR(30);
  ```
- [ ] Step 2 — globally collision-aware backfill:
  - Collect every `email` local part (text before `@`), lower-cased, stripped to `[a-z0-9_]`, max 30 chars (if result is empty or starts with a digit, prefix `user`).
  - For each candidate, count existing `username` values matching `lower(username) = candidate` across **all rows already assigned in this pass** plus any pre-existing values.
  - If count = 0, assign candidate; if count = N, assign `candidate` truncated to `(30 - len(str(N)))` chars + `N`. Re-check; increment until no collision.
  - Update each row individually (cursor or per-row UPDATE) so assignments are sequential and self-consistent.
  - Raw SQL only (no ORM); write the migration in plain SQL executed via `queryInterface.sequelize.query(...)`.
- [ ] Step 3 — prove correctness before constraining:
  ```sql
  -- no nulls
  SELECT COUNT(*) FROM users WHERE username IS NULL;
  -- no duplicates on lower(username)
  SELECT lower(username), COUNT(*) FROM users GROUP BY lower(username) HAVING COUNT(*) > 1;
  ```
  If either query returns rows, raise an error inside the migration and abort.
- [ ] Step 4 — set NOT NULL:
  ```sql
  ALTER TABLE users ALTER COLUMN username SET NOT NULL;
  ```
- [ ] Step 5 — create unique case-insensitive index:
  ```sql
  CREATE UNIQUE INDEX users_username_lower_idx ON users (lower(username));
  ```
- [ ] Write `down` migration: drop index, drop NOT NULL, drop column.

### 1B. Migration verification tests (run before committing)

Test these cross-base collision scenarios against a local test DB seeded with:

- [ ] Single user with email `nick@example.com` → assigned `nick`
- [ ] Second user with email `nick@other.com` → assigned `nick1` (collision with `nick`)
- [ ] Third user with email `nick@third.com` → assigned `nick2`
- [ ] 100+ users all with local part `test` → assigned `test`, `test1` … `test99`, `test100`, … (verify suffix does not exceed 30 chars total)
- [ ] User with email that produces a 30-char local part + collision suffix truncation: local part `abcdefghijklmnopqrstuvwxyzabcd` (30 chars), collision N=1 → truncated base to 29 chars + `1` = 30 chars total
- [ ] User with email `123nick@example.com` → local part starts with digit → prefixed → `user123nick` (or truncated to 30)
- [ ] User with email `@example.com` or empty local → prefix `user` → e.g. `user`
- [ ] User with email `a@example.com` (single char local) → assigned `a`; collision → `a1`

Verify after all assertions:
- [ ] `SELECT COUNT(*) FROM users WHERE username IS NULL` → 0
- [ ] No duplicate `lower(username)` groups

### 1C. `db-models/src/models/User.ts`

- [ ] Add `username: string` field to the model class (DataType `STRING(30)`, `allowNull: false` after migration, `unique: true` / `validate: len [1,30]`)
- [ ] Table name must remain lowercase `users` (`tableName: 'users'`)
- [ ] Do **not** rename or remove any existing fields

### 1D. Shared types — `shared-types/src/user.ts`

- [ ] The `User` type must contain at minimum: `id: number`, `authProvider: AuthProvider`, `username: string` (add here)
- [ ] Add `UpdateUsernameRequest`: `{ username: string }`
- [ ] Add `UpdateUsernameResponse`: `{ user: User }`
- [ ] Re-export both from `shared-types/src/index.ts` if not already auto-exported

### 1E. Shared types — `shared-types/src/meditation.ts`

- [ ] Add `createdByUsername?: string | null` to the `Meditation` type

### 1F. Build shared types

- [ ] Run `npm run build:shared` from the repo root (or `cd shared-types && npm run build`)
- [ ] Confirm zero TypeScript errors
- [ ] **Note:** `api`, `web`, and `worker` packages consume the built output of `shared-types`; they do not rebuild it themselves. Always rebuild shared-types before running downstream type checks.

### 1G. Commit

- [ ] `git add db-models/ shared-types/`
- [ ] Commit message: `feat(schema+types): add users.username column, backfill migration, shared type updates`

---

## Phase 2 — API: User Flows

### 2A. Username normalization/allocation helpers — `api/src/routes/users.ts`

Add these as module-local (non-exported) helpers at the top of the file:

- [ ] `normalizeCandidate(email: string): string`
  - Extract local part (before `@`), lower-case, strip to `[a-z0-9_]`, truncate to 30 chars
  - If result is empty or matches `/^[0-9]/`, prepend `user` and re-truncate to 30
- [ ] `async allocateUsername(candidate: string, transaction?: Transaction): Promise<string>`
  - In a loop (cap: 200 iterations):
    - Query `User.findOne({ where: sequelize.where(sequelize.fn('lower', sequelize.col('username')), candidate), transaction })`
    - If no row found, return `candidate`
    - Increment counter; build next candidate: base truncated to `30 - digits(counter)` chars + counter string
  - Throw if cap exceeded (signals data integrity issue, not a user error)
- [ ] `mapUser(user: UserInstance): User` — returns plain object including `username`

### 2B. Local registration path

- [ ] Wrap `User.create(...)` in a retry loop for Sequelize `UniqueConstraintError`:
  - On `UniqueConstraintError`, re-run `allocateUsername` with incremented counter seed
  - Retry cap: 10 attempts (race-condition window only; `allocateUsername` already resolved the bulk; this handles concurrent registrations)
  - On exhaustion, return `500` with `INTERNAL_ERROR`
- [ ] `User.create` call must include `username: await allocateUsername(normalizeCandidate(email))`

### 2C. Google OAuth new-user branch

- [ ] Same helper wrapping pattern as 2B
- [ ] `User.create` includes `username: await allocateUsername(normalizeCandidate(googleEmail))`
- [ ] Existing-user branch: no change to username (user may have customised it)

### 2D. `PATCH /users/me/username` endpoint

- [ ] Add `router.patch("/me/username", requireAuth, async (req, res) => { ... })` inside the existing users router
- [ ] Parse and validate `req.body.username`:
  - Must be a string, 1–30 chars, matching `/^[a-z0-9_]+$/` (lower-case only at write time)
  - Failure → `400` with `{ error: { code: "VALIDATION_ERROR", message: "..." } }`
- [ ] Attempt `user.update({ username: req.body.username })`
- [ ] On Sequelize `UniqueConstraintError` → `409` with `{ error: { code: "USERNAME_TAKEN", message: "..." } }`
- [ ] On success → `200` with `{ user: mapUser(user) }` (i.e. `UpdateUsernameResponse`)
- [ ] External route is `PATCH /users/me/username` (no prefix change needed if users router is already mounted at `/users`)

### 2E. `mapUser` and existing response shapes

- [ ] `GET /users/me` response includes `username`
- [ ] Login response includes `username` (via `mapUser`)
- [ ] Google auth callback/response includes `username` (via `mapUser`)
- [ ] No nested `creator` object; username is a flat field on the user object

### 2F. Validate API types

- [ ] Run `cd api && npx tsc --noEmit` (or `npm run typecheck`) — zero errors
- [ ] Run API unit tests: `cd api && npm test`

### 2G. Commit

- [ ] `git add api/`
- [ ] Commit message: `feat(api/users): username allocation helpers, PATCH /me/username, username in auth responses`

---

## Phase 3 — API: Meditation Serialization

### 3A. Association check — `api/src/models/` or wherever associations are defined

- [ ] Confirm `Meditation.belongsTo(User, { foreignKey: 'userId' })` is already in place (do **not** add a duplicate)
- [ ] Confirm `User.hasMany(Meditation, { foreignKey: 'userId' })` exists or add it alongside the `belongsTo`

### 3B. `GET /meditations/all` — `api/src/routes/meditations.ts`

- [ ] Add `include: [{ model: User, attributes: ['username'] }]` to the `Meditation.findAll(...)` call
- [ ] In the serialization/map step, add `createdByUsername: meditation.User?.username ?? null` as a flat field
- [ ] Do **not** include a nested `creator` or `user` object in the response; `createdByUsername` is the only addition

### 3C. `GET /meditations/:id` (via `loadMeditationOrThrow` or equivalent)

- [ ] Add the same `include: [{ model: User, attributes: ['username'] }]` to the single-meditation query
- [ ] Serialize `createdByUsername` the same way

### 3D. Validate

- [ ] Run `cd api && npx tsc --noEmit` — zero errors
- [ ] Run API tests: `cd api && npm test`
- [ ] Manual smoke: `GET /meditations/all` response items contain `createdByUsername` field (string or null)

### 3E. Commit

- [ ] `git add api/src/routes/meditations.ts` (and any association file touched)
- [ ] Commit message: `feat(api/meditations): include createdByUsername in meditation responses`

---

## Phase 4 — Web: Profile UI

### 4A. API client — `web/src/lib/api/auth.ts`

- [ ] Add `updateUsername(data: UpdateUsernameRequest): Promise<UpdateUsernameResponse>`:
  ```ts
  return apiClient.patch<UpdateUsernameResponse>("/users/me/username", data);
  ```
- [ ] Import `UpdateUsernameRequest`, `UpdateUsernameResponse` from `shared-types`

### 4B. Profile page — `web/src/app/profile/page.tsx`

- [ ] Display current `username` from Redux auth state (read from `state.auth.user.username`)
- [ ] Username input field (controlled, pre-filled with current username)
- [ ] Save button that calls `updateUsername({ username: inputValue })`
- [ ] Inline error display:
  - `400 VALIDATION_ERROR` → show validation message below input
  - `409 USERNAME_TAKEN` → show "Username already taken" below input
  - Network/500 → show generic error
- [ ] On success: dispatch `setUser(response.user)` to Redux store so header/nav reflects new username immediately
- [ ] Loading state on the save button while request is in-flight
- [ ] No full page reload

### 4C. TypeScript and build

- [ ] Run `cd web && npx tsc --noEmit` — zero errors
- [ ] Run `cd web && npm run build` — zero errors
- [ ] Confirm `shared-types` was already rebuilt in Phase 1F before running these

### 4D. Commit

- [ ] `git add web/src/lib/api/auth.ts web/src/app/profile/page.tsx`
- [ ] Commit message: `feat(web/profile): username edit UI with inline errors and Redux update`

---

## Phase 5 — Integration Validation & Rollout

### 5A. Full build check (all packages)

- [ ] `npm run build:shared` — clean
- [ ] `cd api && npm run build` — clean
- [ ] `cd web && npm run build` — clean
- [ ] `cd worker && npm run build` (if worker has a build step) — clean
- [ ] All TypeScript: zero errors across all packages

### 5B. Test suite

- [ ] `cd db-models && npm test` (migration tests from Phase 1B)
- [ ] `cd api && npm test`
- [ ] `cd web && npm test` (if applicable)

### 5C. Local end-to-end smoke tests

- [ ] Start local DB, run migration: confirm `users` table has `username NOT NULL`, unique index `users_username_lower_idx` present
- [ ] Local registration flow: create account with email `nick@example.com` → response contains `username: "nick"`
- [ ] Create second account `nick@other.com` → response contains `username: "nick1"`
- [ ] Google OAuth new-user flow: simulate new Google user → `username` auto-assigned and present in response
- [ ] `PATCH /users/me/username` with valid new username → `200`, user object in response has updated username
- [ ] `PATCH /users/me/username` with invalid format (e.g. `"bad name!"`) → `400 VALIDATION_ERROR`
- [ ] `PATCH /users/me/username` with a taken username → `409 USERNAME_TAKEN`
- [ ] `GET /users/me` → username present
- [ ] Login response → username present
- [ ] `GET /meditations/all` → each item has `createdByUsername` (string or null)
- [ ] `GET /meditations/:id` → `createdByUsername` present
- [ ] Web profile page: load, edit username, save → Redux store updated, displayed value changes without page reload

### 5D. Rollout procedure (maintenance / write-pause boundary)

**Do not implement zero-downtime expand/contract unless explicitly requested.**

- [ ] Announce maintenance window / pause writes
- [ ] Deploy `db-models` migration: `npx sequelize-cli db:migrate` (or equivalent)
- [ ] Verify migration assertions passed (nulls = 0, duplicates = 0)
- [ ] Deploy new API build (includes username allocation, `PATCH /me/username`, meditation serialization)
- [ ] Deploy new web build (profile UI)
- [ ] Reopen writes / end maintenance window
- [ ] Verify post-deploy:
  - [ ] New local registration assigns username
  - [ ] New Google OAuth user creation assigns username
  - [ ] Existing users can update username via profile page
  - [ ] Meditation list shows `createdByUsername`

### 5E. Final commit (if any remaining changes)

- [ ] `git add .`
- [ ] Commit message: `chore: integration validation complete, rollout notes confirmed`

---

## Quick Reference: Error Codes

| Scenario | HTTP | Code |
|---|---|---|
| Invalid username format/length | 400 | `VALIDATION_ERROR` |
| Username already taken (PATCH) | 409 | `USERNAME_TAKEN` |
| Allocation cap exceeded | 500 | `INTERNAL_ERROR` |

## Quick Reference: Key File Locations

| Concern | File |
|---|---|
| Migration | `db-models/migrations/<timestamp>-add-username-to-users.js` |
| User model | `db-models/src/models/User.ts` |
| Shared user types | `shared-types/src/user.ts` |
| Shared meditation types | `shared-types/src/meditation.ts` |
| Users router | `api/src/routes/users.ts` |
| Meditations router | `api/src/routes/meditations.ts` |
| Web API client | `web/src/lib/api/auth.ts` |
| Profile page | `web/src/app/profile/page.tsx` |
