---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# Codex Assessment — PRD1 Usernames Plan V03

Qualifying concerns found:

1. **Migration SQL targets the wrong table name/casing.**
   - V03 uses quoted `"Users"` in its migration snippets, but the actual Sequelize model has `tableName: "users"` and existing raw SQL migrations target lowercase `users`.
   - Action: use `ALTER TABLE users ...` and `CREATE UNIQUE INDEX ... ON users (lower(username))`; do not quote/create a separate `"Users"` relation.

2. **User response/type examples do not match the repository contract.**
   - V03's `UserResponse`/`mapUser` snippets include `displayName` and `role`, but this repo's user payload is `shared-types/src/user.ts` `User` with `id`, `email`, `isAdmin`, `authProvider`, `showScriptModeForCreatingMeditations`, and optional `hasPublicMeditations`.
   - Action: add `username` to the actual `User` type and to `api/src/routes/users.ts` `mapUser` without introducing nonexistent `displayName`/`role` fields or renaming the response type contract.

3. **Profile/update response shape and web wrapper location are inconsistent with actual code.**
   - V03 defines `UpdateUsernameResponse { username: string }` and shows `getProfile(): Promise<UserResponse>`, but actual profile/preferences APIs return wrapper objects (`UserProfileResponse` / `{ user: User }`) and the web API wrappers live in `web/src/lib/api/auth.ts`, not `web/src/api/users.ts`.
   - Action: implement `updateUsername` in `web/src/lib/api/auth.ts` using `apiClient.patch` and return a response shape consistent with the existing profile/preferences pattern, e.g. `{ user: mapUser(...) }`, so Redux/profile code can replace the current user object cleanly.

4. **Username derivation references a nonexistent display-name source.**
   - V03 says usernames are derived from `displayName` or email local part, but the current `User` model and auth flows have no `displayName` field; PRD1 specifies email local part as the default source.
   - Action: derive runtime and backfill usernames from the email local part, with existing fallback/collision logic, unless a separate display-name field is explicitly added out of scope.
