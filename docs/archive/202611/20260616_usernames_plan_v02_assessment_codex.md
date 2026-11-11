---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# Codex Assessment — PRD1 Usernames Plan V02

Qualifying concerns found:

1. **Migration ordering cannot succeed on a populated table.**
   - V02 says to add `username VARCHAR(30) NOT NULL DEFAULT ''` and then add a unique index before the backfill runs. In this repo's existing `users` table, every pre-existing row would receive `''`, so the unique index/constraint fails as soon as more than one user exists.
   - Action: follow the repo's raw-SQL migration style in `db-models/migrations/`; add the column nullable first, backfill unique values, then set `NOT NULL` and add the unique constraint/index. Do not create a unique constraint while duplicate placeholder values exist.

2. **Google account creation is omitted from the unique-username creation path.**
   - PRD1 requires username assignment for local register and Google auth. V02 only explicitly calls `createUserWithUniqueUsername` from the registration handler, while the actual repo also creates users in `api/src/routes/users.ts` under `POST /google-auth`.
   - Action: route both `POST /users/register` and the new-user branch of `POST /users/google-auth` through the same retry helper/callback that wraps the actual `User.create` call.

3. **Meditation association guidance names a non-existent foreign key/alias.**
   - V02 recommends `Meditation.belongsTo(User, { foreignKey: "createdBy", as: "creator" })` and serializing `meditation.creator?.username`. The actual model has `Meditation.userId` mapped to SQL `user_id`, and `db-models/src/models/associations.ts` already defines `Meditation.belongsTo(User, { foreignKey: "userId" })` with no alias.
   - Action: use the existing `userId` association and serialize from the actual included property (`meditation.User?.username`), or deliberately add a `creator` alias using `foreignKey: "userId"` and update every include/serializer consistently. Do not reference `createdBy`.

4. **PRD-required single-meditation `createdByUsername` path is dropped.**
   - The source PRD requires `createdByUsername` in the meditation API payload for list and single responses. V02 narrows implementation/testing to `GET /meditations/all` only and states all creator data flows through that endpoint.
   - Action: also include `User` when loading `GET /meditations/:id` via `loadMeditationOrThrow`, and test both `/meditations/all` and `/:id` responses, while keeping the field optional for routes loaded without the include.

5. **Auth/profile route naming is inconsistent with the actual API.**
   - V02 says `username` is exposed through `/auth/me` and the web reads from JWT or `/auth/me`, but this repo exposes the current user at `GET /users/me` and has no `/auth/me` router.
   - Action: add `username` to `mapUser`, all login/google-auth user responses, JWT payload if desired, and `GET /users/me`; web profile code should continue using `web/src/lib/api/auth.ts` `getProfile()` against `/users/me`.
