---
created_at: 2026-05-29
updated_at: 2026-05-29
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---
# Profile Page and Create Meditation Preference TODO V02

## Source Plan

Implement from the accepted plan: `docs/20260529_PROFILE_PAGE_PLAN_V01.md`.

This TODO replaces the implementation-task content in `docs/20260527_PROFILE_PAGE_PLAN.md`. Do not delete the older file until the plan-and-vet workflow has settled this TODO. V02 incorporates Codex assessment feedback from `docs/20260529_PROFILE_PAGE_TODO_V01_ASSESSMENT_CODEX.md` by adding shared workspace build sequencing after shared contract/model changes.

## Phase 1: Shared user contracts and database preference field

- [ ] Update `shared-types/src/user.ts`:
  - [ ] Add `showScriptModeForCreatingMeditations: boolean` to `User`.
  - [ ] Add `hasPublicMeditations?: boolean` to `User` because API user serialization already returns it.
  - [ ] Add `UpdateUserPreferencesRequest = { showScriptModeForCreatingMeditations: boolean }`.
  - [ ] Add `UserProfileResponse = { user: User }`.
  - [ ] Add `UpdateUserPreferencesResponse = { user: User }`.
- [ ] Update `db-models/src/models/User.ts`:
  - [ ] Add `declare showScriptModeForCreatingMeditations: CreationOptional<boolean>;` to the `User` class.
  - [ ] Add a Sequelize field named `showScriptModeForCreatingMeditations` using `DataTypes.BOOLEAN`, `allowNull: false`, `defaultValue: false`, and `field: "show_script_mode_for_creating_meditations"`.
- [ ] Create `db-models/migrations/20260529_add_user_create_mode_preference.sql`:
  - [ ] Add `show_script_mode_for_creating_meditations BOOLEAN NOT NULL DEFAULT FALSE` to `users`.
  - [ ] Use `ADD COLUMN IF NOT EXISTS` so the migration is idempotent.
- [ ] Preserve the rollout warning from the plan: apply this migration before API/model code that selects the new field is deployed or run against a database missing the column.

### Phase 1 validation

Run:

```bash
npm run typecheck -w @golightly/shared-types
npm run typecheck -w @golightly/db-models
npm run build:shared
```

Expected: both typecheck commands pass and `build:shared` refreshes the `shared-types/dist` and `db-models/dist` package outputs before downstream packages import the changed contracts/models.

If validation fails, fix the code while preserving the intended preference contract, then rerun the failing command. Do not proceed to API or web phases while workspace package `dist` declarations are stale.

After validation passes:

- [ ] Check off completed Phase 1 tasks.
- [ ] Commit only Phase 1 changes, including any intentional refreshed package build outputs if this repo tracks them.

## Phase 2: Authenticated profile/preference API endpoints and tests

- [ ] Update `api/src/routes/users.ts` imports:
  - [ ] Import `requireAuth` from `api/src/middleware/auth.ts`.
  - [ ] Import any shared request/response types if useful for typed request bodies.
- [ ] Update `mapUser()` in `api/src/routes/users.ts`:
  - [ ] Accept/read `showScriptModeForCreatingMeditations` on user-like inputs.
  - [ ] Return `showScriptModeForCreatingMeditations`, defaulting to `false` when absent.
  - [ ] Continue returning `hasPublicMeditations` as it does today.
- [ ] Confirm local login and Google auth responses include the new preference through `mapUser()`.
- [ ] Add `GET /users/me` in `api/src/routes/users.ts`:
  - [ ] Protect with `requireAuth`.
  - [ ] Use `req.user.id` to fetch the current user.
  - [ ] Return `404 USER_NOT_FOUND` if the user is missing.
  - [ ] Return `{ user: mapUser(user, await hasPublicMeditations(user.id)) }`.
- [ ] Add `PATCH /users/me/preferences` in `api/src/routes/users.ts`:
  - [ ] Protect with `requireAuth`.
  - [ ] Require `showScriptModeForCreatingMeditations` in the body.
  - [ ] Validate that `showScriptModeForCreatingMeditations` is boolean.
  - [ ] Reject invalid values with `400 VALIDATION_ERROR` following the existing validation style.
  - [ ] Persist the value on `user.showScriptModeForCreatingMeditations`.
  - [ ] Save the user.
  - [ ] Return `{ user: mapUser(user, await hasPublicMeditations(user.id)) }`.
- [ ] Update `api/tests/users/users.routes.test.ts`:
  - [ ] Ensure mocked user objects include `showScriptModeForCreatingMeditations` where needed, or verify the fallback default.
  - [ ] Test login response includes `showScriptModeForCreatingMeditations: false` by default.
  - [ ] Test `GET /users/me` returns the authenticated user and preference.
  - [ ] Test `PATCH /users/me/preferences` persists `true` and returns the updated serialized user.
  - [ ] Test non-boolean preference values return 400 with `VALIDATION_ERROR`.
  - [ ] Test unauthenticated `GET /users/me` and `PATCH /users/me/preferences` return 401.

### Phase 2 validation

Run:

```bash
npm run typecheck -w api
npm test -w api -- --runInBand tests/users/users.routes.test.ts
```

Expected: typecheck passes and targeted user route tests pass.

If validation fails, fix the API or tests while preserving the intended endpoint contract, then rerun the failing command.

After validation passes:

- [ ] Check off completed Phase 2 tasks.
- [ ] Commit only Phase 2 changes.

## Phase 3: Frontend profile API helpers and navigation entry point

- [ ] Update `web/src/lib/api/auth.ts`:
  - [ ] Import `UpdateUserPreferencesRequest`, `UpdateUserPreferencesResponse`, and `UserProfileResponse` from `@golightly/shared-types`.
  - [ ] Add `getProfile()` that calls `apiClient.get<UserProfileResponse>("/users/me")` and returns `response.data`.
  - [ ] Add `updateUserPreferences(data)` that calls `apiClient.patch<UpdateUserPreferencesResponse>("/users/me/preferences", data)` and returns `response.data`.
- [ ] Confirm `web/src/store/features/authSlice.ts` already exports `setUser` and do not add a redundant reducer unless implementation reveals a real need.
- [ ] Update `web/src/components/Navigation.tsx`:
  - [ ] Add a small inline `ProfileIcon` SVG component or JSX fragment in the file.
  - [ ] In the desktop authenticated controls, render a `Link href="/profile"` before the logout button.
  - [ ] Give the desktop icon link `aria-label="Open profile"` or equivalent accessible text.
  - [ ] In the mobile drawer, render a visible `Profile` link for authenticated users, likely above logout.
  - [ ] Ensure the mobile profile link calls `handleCloseMobile` on click.
  - [ ] Do not render the profile link/icon for unauthenticated users.
  - [ ] Preserve the existing admin/home navigation behavior and logout behavior.

### Phase 3 validation

Run:

```bash
npm run typecheck -w web
```

Expected: web typecheck passes after the API helper and navigation changes.

If validation fails, fix the frontend types or component code while preserving existing navigation behavior, then rerun the failing command.

After validation passes:

- [ ] Check off completed Phase 3 tasks.
- [ ] Commit only Phase 3 changes.

## Phase 4: Profile preferences page

- [ ] Create `web/src/app/profile/page.tsx`.
- [ ] Make the page a client component with `"use client"`.
- [ ] Read `isAuthenticated`, `user`, and `accessToken` from Redux.
- [ ] Use `useRouter()` to redirect unauthenticated users to `/`.
- [ ] On authenticated page load, call `getProfile()`:
  - [ ] Dispatch `setUser(response.user)` on success.
  - [ ] Use the refreshed user as the preferred source for the toggle value.
  - [ ] Handle request failure with an inline error that does not crash the page.
- [ ] Render the profile UI:
  - [ ] Page/card heading: `Profile`.
  - [ ] User label using `user.email` until a display-name field exists.
  - [ ] Section heading: `Preferences`.
  - [ ] Toggle label: `Show script mode for creating meditations`.
- [ ] Initialize and synchronize local toggle state from `user.showScriptModeForCreatingMeditations ?? false`.
- [ ] On toggle change:
  - [ ] Call `updateUserPreferences({ showScriptModeForCreatingMeditations: checked })`.
  - [ ] Dispatch `setUser(response.user)` on success.
  - [ ] Disable the toggle or show saving state while saving.
  - [ ] Show an inline error and revert local state if saving fails.
- [ ] Use existing Tailwind/design tokens where appropriate, such as `bg-raised`, `border-subtle`, and `text-ink`, while matching nearby page layout patterns.

### Phase 4 validation

Run:

```bash
npm run typecheck -w web
```

Expected: web typecheck passes.

Manual checks if the app is available:

- [ ] Unauthenticated users are redirected away from `/profile`.
- [ ] Authenticated users can load `/profile`.
- [ ] The page shows the signed-in email and preference toggle.
- [ ] Toggling the preference persists through the API and updates Redux state.

If validation fails, fix the page while preserving the profile refresh and persistence behavior, then rerun the failing command.

After validation passes:

- [ ] Check off completed Phase 4 tasks.
- [ ] Commit only Phase 4 changes.

## Phase 5: Gate create meditation mode switch and rename UI label

- [ ] Update `web/src/components/forms/CreateMeditationModeSwitcher.tsx`.
- [ ] Change the local UI type to `type CreateMode = "script" | "form"`.
- [ ] Do not rename backend/shared meditation `sourceMode`, API payloads, `source_mode`, or services that use `"spreadsheet"` for form-based creation.
- [ ] Keep `STORAGE_KEY = "golightly.createMode"` unless implementation reveals a strong reason to migrate keys.
- [ ] Read `user` from Redux in addition to `isAuthenticated`.
- [ ] Derive `const showScriptMode = user?.showScriptModeForCreatingMeditations ?? false`.
- [ ] Default local `mode` state to `"form"`.
- [ ] Update the localStorage hydration effect:
  - [ ] Treat stored `"spreadsheet"` as `"form"` and rewrite the stored value to `"form"`.
  - [ ] Use stored `"script"` only when `showScriptMode` is true.
  - [ ] Otherwise force `"form"`.
  - [ ] Include `showScriptMode` in dependencies so disabling the preference forces form mode.
- [ ] Update `updateMode()` so it stores only `"script"` or `"form"`.
- [ ] Render the mode switch only when `showScriptMode` is true.
- [ ] Render the form panel when `mode === "form"` or `showScriptMode` is false.
- [ ] Render the script panel only when `showScriptMode` is true and `mode === "script"`.
- [ ] Rename switch labels to `Form` and `Script`, preferably in that order.
- [ ] Pass `isActive` to `CreateMeditationForm` based on effective form activity rather than raw mode alone.
- [ ] Preserve staging meditation refresh/polling behavior for authenticated users.

### Phase 5 validation

Run:

```bash
npm run typecheck -w web
npm run lint -w web
```

Expected: typecheck and lint pass.

Manual checks if the app is available:

- [ ] Default/existing users see only the form create UI.
- [ ] Users who enable the preference see `Form` and `Script` switch options.
- [ ] Turning the preference off hides the switch and returns to the form UI.
- [ ] Old `localStorage` value `spreadsheet` is converted to `form`.
- [ ] Old `localStorage` value `script` is ignored when the preference is off.

If validation fails, fix the switcher while preserving backward compatibility with old localStorage values, then rerun the failing command.

After validation passes:

- [ ] Check off completed Phase 5 tasks.
- [ ] Commit only Phase 5 changes.

## Phase 6: API documentation

- [ ] Update `docs/api-documentation/endpoints/users.md`:
  - [ ] Document that local login and Google auth user payloads include `showScriptModeForCreatingMeditations`.
  - [ ] Document that local login and Google auth user payloads may include `hasPublicMeditations`.
  - [ ] Add `GET /users/me` with bearer auth requirement and response shape `{ user: User }`.
  - [ ] Add `PATCH /users/me/preferences` with bearer auth requirement.
  - [ ] Document request body `{ showScriptModeForCreatingMeditations: boolean }`.
  - [ ] Document non-boolean validation behavior.
  - [ ] Document response shape `{ user: User }`.
  - [ ] Note the preference defaults to `false`.

### Phase 6 validation

Run:

```bash
git diff -- docs/api-documentation/endpoints/users.md
```

Expected: docs cover the new endpoints and fields accurately.

After validation passes:

- [ ] Check off completed Phase 6 tasks.
- [ ] Commit only Phase 6 changes.

## Phase 7: Full verification and rollout notes

- [ ] Run shared and script typechecks:

```bash
npm run typecheck:shared
npm run typecheck:scripts
```

- [ ] Run package typechecks:

```bash
npm run typecheck -w api
npm run typecheck -w web
npm run typecheck -w worker-node
```

- [ ] Run package tests:

```bash
npm test -w api -- --runInBand
npm test -w worker-node -- --runInBand
npm test -w @golightly/shared-types -- --runInBand
```

- [ ] Run web lint:

```bash
npm run lint -w web
```

- [ ] If any command fails because of a pre-existing unrelated issue, document it clearly before merge and still fix any failure introduced by this feature.
- [ ] Record or preserve the migration rollout note for deployment: `db-models/migrations/20260529_add_user_create_mode_preference.sql` must be applied before running API/model code that expects the new column.
- [ ] Do not implement a new frontend test harness unless Nick separately requests it; `web/package.json` has no test script.

After full verification passes:

- [ ] Check off completed Phase 7 tasks.
- [ ] Commit final verification/docs-only cleanup changes if any.
- [ ] Confirm `git status --short --branch` is clean or contains only intentional remaining changes.

