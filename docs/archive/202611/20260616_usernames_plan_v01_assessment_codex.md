---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# Codex Assessment — PRD1 Usernames Plan V01

Qualifying concerns found:

1. **Web API wrapper endpoint/style is wrong in the concrete snippet.**
   - The plan's `web/src/lib/api/auth.ts` snippet uses `fetch('/api/users/me/username', ...)`, but this repo uses the shared Axios `apiClient` with `NEXT_PUBLIC_API_BASE_URL` and existing paths like `/users/me/preferences`.
   - Action: implement `updateUsername` via `apiClient.patch<UpdateUsernameResponse>("/users/me/username", data)`, not a relative `/api/...` fetch.

2. **Router path wording risks registering the endpoint at the wrong URL.**
   - `api/src/app.ts` mounts `buildUsersRouter()` at `/users`; inside `api/src/routes/users.ts`, the route must be `router.patch("/me/username", ...)`.
   - The plan repeatedly says to add `PATCH /users/me/username` in `users.ts`; implemented literally inside that router it would become `/users/users/me/username`.
   - Action: distinguish full external endpoint (`PATCH /users/me/username`) from router-local path (`/me/username`).

3. **Backfill collision suffix can violate the 30-character limit.**
   - The plan uses `VARCHAR(30)` / `DataTypes.STRING(30)` but describes assigning `base`, then `base2`, `base3`, etc. If the sanitized email local part is already 30 chars, any collision suffix exceeds 30 chars and the migration fails.
   - Action: in the migration and account-creation helper, reserve suffix length by truncating the base before appending numeric suffixes; test 30-character colliding bases.

4. **Meditation list route claims do not match the actual repository route.**
   - The plan refers to a public list route "for a given user's public profile" and an authenticated owner list route. In this repo, the home/table list consumed by PRD2 is `GET /meditations/all` in `api/src/routes/meditations.ts` (`router.get("/all", ...)`).
   - Action: explicitly add the `User` include to `GET /meditations/all` and verify PRD2's home table data path receives `createdByUsername`; do not rely on non-existent public-profile/owner-list route names.

5. **Association/file location claim is incorrect.**
   - The plan says `Meditation.belongsTo(User, { foreignKey: 'userId' })` exists in `db-models/src/db.ts`; this repo has no `db-models/src/db.ts`. The association is in `db-models/src/models/associations.ts` and is initialized via `db-models/src/index.ts`.
   - Action: update implementation notes/tests to import/destructure `User` from `getDb()` and rely on `initializeModels()` / `models/associations.ts`, not a nonexistent `db.ts` file.

6. **Creation-time retry utility is underspecified in a way that can miss the unique-constraint race.**
   - The plan says registration/Google auth call `assignUsername(base, trx?)` before committing the user insert, but the pseudocode says the utility attempts INSERT itself. In this repo the create paths call `User.create({...})` directly with required auth fields.
   - Action: make the retry boundary wrap the actual `User.create` call (or pass a callback/attributes into the helper) so a `UniqueConstraintError` from the real insert retries with the next suffix. A pre-insert `findOne`/returned string alone does not close the TOCTOU window.

7. **Build-order statement does not match package scripts.**
   - The plan states the workspace build order is `db-models → shared-types → api / worker-node / web`, but the root `build:shared` script currently runs `shared-types` then `db-models`, and only `api` invokes that script before building. `worker-node` and `web` build scripts do not rebuild shared packages first.
   - Action: either correct the plan's build-order claim or update root/package scripts/CI so `shared-types` and `db-models` are built before every downstream package that consumes their `dist` types.
