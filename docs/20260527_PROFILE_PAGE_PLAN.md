---
created_at: 2026-05-27
updated_at: 2026-05-27
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---
# Profile Page and Create Meditation Preference Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a logged-in user profile entry point, a profile/preferences page, and a persisted per-user preference that hides script-mode creation by default unless the user opts in.

**Architecture:** Persist the preference on the `users` table so it follows the authenticated account across browsers. Include the preference in auth user payloads, expose authenticated profile read/update endpoints, update Redux auth state after preference changes, and gate the existing create-meditation mode switch from that preference. Keep the implementation intentionally narrow: one boolean preference, one profile page, and one visible label rename from `Spreadsheet` to `Form`.

**Tech Stack:** Express + Sequelize + PostgreSQL migrations in `api/` and `db-models/`; shared TypeScript contracts in `shared-types/`; Next.js App Router + Redux Toolkit in `web/`; Jest and TypeScript typecheck for verification.

---

## Current Code Context

- The app already has authenticated user state in `web/src/store/features/authSlice.ts` using the shared `User` type.
- Auth responses are produced by `api/src/routes/users.ts` through `mapUser()` for local and Google login.
- User columns live in `db-models/src/models/User.ts`; migrations live under `db-models/migrations/`.
- The header lives in `web/src/components/Navigation.tsx` and already conditionally renders authenticated/admin controls.
- The home page renders `CreateMeditationModeSwitcher` from `web/src/app/page.tsx`.
- `CreateMeditationModeSwitcher` currently uses `CreateMode = "script" | "spreadsheet"`, defaults to `script`, persists local mode in `localStorage`, and labels the non-script option as `Spreadsheet`.

## Product Decisions

- Preference name in code: `showScriptModeForCreatingMeditations`.
- Database column name: `show_script_mode_for_creating_meditations`.
- Default value: `false` for all users, including existing users.
- Profile page route: `/profile`.
- Displayed user name: use `user.email` until the app has a separate display-name field.
- Header icon: simple inline SVG generic user/profile icon; no new dependency.
- When the preference is off:
  - Do not show the mode switch.
  - Render only the form flow.
  - Do not restore a previously stored `script` mode from `localStorage`.
- When the preference is on:
  - Show the existing mode switch.
  - Rename labels to `Form` and `Script`.
  - Prefer default active mode `form` unless the user previously selected `script` while the preference was on.
- Internal mode string should be renamed from `spreadsheet` to `form`, but migration should tolerate the old `localStorage` value by mapping `spreadsheet` to `form`.

---

## Task 1: Add the persisted user preference to shared and database models

**Objective:** Make the preference available in TypeScript types and the Sequelize user model.

**Files:**
- Modify: `shared-types/src/user.ts`
- Modify: `db-models/src/models/User.ts`
- Create: `db-models/migrations/20260527_add_user_create_mode_preference.sql`

**Steps:**

1. In `shared-types/src/user.ts`, add `showScriptModeForCreatingMeditations: boolean` to `User`.
2. Also add the currently returned `hasPublicMeditations?: boolean` to `User`, because `api/src/routes/users.ts` already returns it from `mapUser()` and the frontend stores the returned object in Redux. This tightens the actual serialized user contract instead of introducing a second user shape.
3. Add profile preference request/response types:
   - `UpdateUserPreferencesRequest = { showScriptModeForCreatingMeditations: boolean }`
   - `UserProfileResponse = { user: User }`
   - `UpdateUserPreferencesResponse = { user: User }`
4. In `db-models/src/models/User.ts`, add the model declaration:
   - `declare showScriptModeForCreatingMeditations: CreationOptional<boolean>;`
5. Add the Sequelize field with `DataTypes.BOOLEAN`, `allowNull: false`, `defaultValue: false`, and field name `show_script_mode_for_creating_meditations`.
6. Create migration:

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS show_script_mode_for_creating_meditations BOOLEAN NOT NULL DEFAULT FALSE;
```

**Migration rollout requirement:** Apply this migration before deploying/running API code that adds the Sequelize attribute. The repo's `db-models` startup uses `sequelize.sync()` without `alter`, so startup will not add this column automatically. If API code with the new model attribute runs before the column exists, `User.findOne()`/login can fail when Sequelize selects the missing column.

**Verification:**

```bash
npm run typecheck -w @golightly/shared-types
npm run typecheck -w @golightly/db-models
```

Expected: both pass.

---

## Task 2: Return and update the preference through authenticated user endpoints

**Objective:** Let the frontend read and persist the preference for the logged-in user.

**Files:**
- Modify: `api/src/routes/users.ts`
- Modify or add tests: `api/tests/users/users.routes.test.ts`

**Steps:**

1. Update `mapUser()` in `api/src/routes/users.ts` to return `showScriptModeForCreatingMeditations` with fallback `false`.
2. Ensure local login and Google auth automatically include the field because both use `mapUser()`.
3. Import `requireAuth` from `api/src/middleware/auth.ts`.
4. Add `GET /users/me` protected by `requireAuth`:
   - Use `req.user.id` to find the current user.
   - Return `404 USER_NOT_FOUND` if missing.
   - Return `{ user: mapUser(user, await hasPublicMeditations(user.id)) }`.
5. Add `PATCH /users/me/preferences` protected by `requireAuth`:
   - Require `showScriptModeForCreatingMeditations` in the body.
   - Validate it is boolean; reject non-booleans with `400 VALIDATION_ERROR`/existing validation style.
   - Save to `user.showScriptModeForCreatingMeditations`.
   - Return `{ user: mapUser(user, await hasPublicMeditations(user.id)) }`.
6. Add API tests for:
   - Login response includes default `false`.
   - `GET /users/me` returns the current user and preference.
   - `PATCH /users/me/preferences` persists `true` and returns updated user.
   - Invalid non-boolean preference returns 400.
   - Unauthenticated profile/preference requests return 401.

**Verification:**

```bash
npm run typecheck -w api
npm test -w api -- --runInBand tests/users/users.routes.test.ts
```

Expected: typecheck passes; user route tests pass.

---

## Task 3: Add frontend auth API helpers and Redux support

**Objective:** Give the profile page a typed API and a way to update the current user in Redux after saving preferences.

**Files:**
- Modify: `web/src/lib/api/auth.ts`
- Confirm existing reducer: `web/src/store/features/authSlice.ts`

**Steps:**

1. Import the new shared types in `web/src/lib/api/auth.ts`.
2. Add:

```ts
export const getProfile = async (): Promise<UserProfileResponse> => {
  const response = await apiClient.get<UserProfileResponse>("/users/me");
  return response.data;
};

export const updateUserPreferences = async (
  data: UpdateUserPreferencesRequest,
): Promise<UpdateUserPreferencesResponse> => {
  const response = await apiClient.patch<UpdateUserPreferencesResponse>(
    "/users/me/preferences",
    data,
  );
  return response.data;
};
```

3. Reuse the existing `setUser` reducer in `authSlice.ts`; no new Redux reducer should be necessary.

**Verification:**

```bash
npm run typecheck -w web
```

Expected: passes after later tasks are complete.

---

## Task 4: Add the profile icon entry point in the navigation

**Objective:** Show a generic profile icon for logged-in users and navigate to `/profile` when clicked.

**Files:**
- Modify: `web/src/components/Navigation.tsx`

**Steps:**

1. Add a small `ProfileIcon` inline SVG component or JSX fragment inside `Navigation.tsx`.
2. In the desktop authenticated control area, render a `Link href="/profile"` before the logout button.
3. Give it an accessible label, e.g. `aria-label="Open profile"`.
4. Keep the existing `Logout` button as-is.
5. In the mobile menu, add a visible `Profile` link for authenticated users, likely above `Logout`.
6. Ensure profile navigation closes the mobile menu with `onClick={handleCloseMobile}`.
7. Do not show the profile icon/link when unauthenticated.

**Verification:**

```bash
npm run typecheck -w web
```

Expected: passes.

---

## Task 5: Create the profile/preferences page

**Objective:** Add `/profile` with the user email/name and one persisted preference toggle.

**Files:**
- Create: `web/src/app/profile/page.tsx`

**Steps:**

1. Make the page a client component with `"use client"`.
2. Read `isAuthenticated`, `user`, and `accessToken` from Redux.
3. Use `useRouter()` to redirect unauthenticated users to `/`.
4. On authenticated page load, call `getProfile()` to refresh the user from `/users/me` and dispatch `setUser(response.user)`. This avoids stale `redux-persist` user objects that predate the new preference and confirms cross-browser server state.
5. Render a card with:
   - Heading: `Profile`
   - User name label with `user.email`
   - Section heading: `Preferences`
   - Toggle label: `Show script mode for creating meditations`
6. Initialize/synchronize toggle state from the freshest available `user.showScriptModeForCreatingMeditations ?? false`, after `getProfile()` returns when possible.
7. On toggle change:
   - Optimistically or pessimistically call `updateUserPreferences({ showScriptModeForCreatingMeditations: checked })`.
   - Dispatch `setUser(response.user)` on success.
   - Show loading/disabled state while saving.
   - Show an inline error message and revert local state on failure.
8. Keep styling consistent with existing Tailwind classes (`bg-raised`, `border-subtle`, `text-ink`, etc.).

**Verification:**

```bash
npm run typecheck -w web
```

Expected: passes.

---

## Task 6: Gate the create meditation mode switch and rename Spreadsheet to Form

**Objective:** Hide script mode by default and expose it only when the profile preference is enabled.

**Files:**
- Modify: `web/src/components/forms/CreateMeditationModeSwitcher.tsx`

**Steps:**

1. Rename the local UI type to `type CreateMode = "script" | "form"`.
2. Do **not** rename shared/API meditation `sourceMode`, request payloads, database `source_mode`, or backend service values. Those should continue to use `"spreadsheet"` where they currently represent the form-based creation payload. This task is a UI label/local-switch rename only.
3. Keep `STORAGE_KEY = "golightly.createMode"` unless there is a reason to migrate keys.
4. Read `user` as well as `isAuthenticated` from Redux.
5. Derive:

```ts
const showScriptMode = user?.showScriptModeForCreatingMeditations ?? false;
```

6. Default `mode` state to `"form"`.
7. Update the localStorage hydration effect:
   - If stored is `"spreadsheet"`, treat it as `"form"` and rewrite the value to `"form"`.
   - If stored is `"script"` and `showScriptMode` is true, use `"script"`.
   - Otherwise set/use `"form"`.
   - Include `showScriptMode` in dependencies so disabling the preference forces form mode.
8. Update `updateMode()` to store only `"script"` or `"form"`.
9. Only render the mode switch when `showScriptMode` is true.
10. Render the form panel when `mode === "form"` or when `showScriptMode` is false.
11. Render the script panel only when `showScriptMode` is true and `mode === "script"`.
12. Rename the switch labels to `Form` and `Script`. Prefer ordering `Form`, then `Script` to make the default first.
13. Pass `isActive` to `CreateMeditationForm` based on effective form activity, not just raw mode.

**Verification:**

```bash
npm run typecheck -w web
```

Manual expectations:
- New/default users see only the form create UI.
- Users who enable the preference see `Form` and `Script` switch options.
- Turning the preference off again hides the switch and returns to the form UI.
- Any old `localStorage` value of `spreadsheet` becomes `form`.

---

## Task 7: Update user API docs

**Objective:** Keep generated API documentation aligned with the new authenticated user endpoints and user response field.

**Files:**
- Modify: `docs/api-documentation/endpoints/users.md`

**Steps:**

1. Document that login and Google auth user payloads include `showScriptModeForCreatingMeditations` and optional `hasPublicMeditations`.
2. Add `GET /users/me` with bearer auth requirement and response shape `{ user: User }`.
3. Add `PATCH /users/me/preferences` with bearer auth requirement, request body, validation behavior, and response shape.
4. Note that the preference defaults to `false`.

**Verification:**

```bash
git diff -- docs/api-documentation/endpoints/users.md
```

Expected: docs cover the new endpoints and field.

---

## Task 8: Add frontend tests if the repo has a web test harness; otherwise rely on typecheck/manual verification

**Objective:** Avoid inventing a test harness if the web package currently only typechecks/lints.

**Files:**
- Check: `web/package.json`
- If a web test harness exists, add tests near the existing pattern.

**Steps:**

1. Inspect `web/package.json` for a `test` script.
2. If none exists, do not add new test infrastructure just for this feature.
3. If tests exist, add coverage for:
   - Profile page toggle calls update API and dispatches `setUser`.
   - Create switch hidden when preference is false.
   - Create switch shown with `Form`/`Script` labels when preference is true.

**Verification:**

```bash
npm run typecheck -w web
npm run lint -w web
```

Expected: typecheck and lint pass. Web tests only if an existing test command is present.

---

## Task 9: Full verification before merge

**Objective:** Prove the feature compiles and the changed backend behavior works.

**Commands:**

```bash
npm run typecheck:shared
npm run typecheck:scripts
npm run typecheck -w api
npm run typecheck -w web
npm run typecheck -w worker-node
npm test -w api -- --runInBand
npm test -w worker-node -- --runInBand
npm test -w @golightly/shared-types -- --runInBand
npm run lint -w web
```

Expected: all pass, or document any pre-existing lint issues separately before merging.

---

## Implementation Notes and Pitfalls

- The preference must be server-persisted, not only `localStorage`, because the product request says it is a user preference on a profile page.
- Do not put this preference into JWT payload only. JWTs are issued at login and would go stale after preference updates. Use `setUser(response.user)` after updates and keep endpoints reading from the database.
- Existing tokens do not need the new preference because `req.user` only needs id/email/admin/provider for protected routes.
- Ensure `mapUser()` is the single serialization point for the new field so local login, Google auth, profile, and preference update remain consistent.
- Existing users are covered by the migration default `false`.
- Keep the old localStorage value `spreadsheet` backward-compatible so current browsers do not get stuck in an invalid mode.
- Profile page should be accessible to any authenticated user, not admin-only.
- Keep the logout control available after adding the profile icon.

---

## Plan Review Status

- Claude Code plan generation was attempted first as requested, but the local Claude Code CLI returned an authentication error despite reporting a Pro login in `claude auth status`. Hermes created the working implementation plan from repo inspection so Codex could evaluate it.
- Codex evaluated the first draft and marked the architecture viable, with required changes around migration rollout, profile refresh, shared user contracts, preserving backend `"spreadsheet"` source-mode values, backend test setup, and API docs.
- Those Codex recommendations are incorporated into the task list above. The current plan is considered viable for implementation.
