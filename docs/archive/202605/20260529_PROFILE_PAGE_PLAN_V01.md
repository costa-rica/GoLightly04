---
created_at: 2026-05-29
updated_at: 2026-05-29
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---
# Profile Page and Create Meditation Preference Plan V01

## Requirements Source

This plan supersedes `docs/20260527_PROFILE_PAGE_PLAN.md` as the implementation overview for adding a profile entry point, a `/profile` preferences page, and a persisted user preference that hides script-mode meditation creation unless the signed-in user opts in.

The older source file remains in place until this plan and its TODO have been vetted. It should be deleted only after the plan-and-vet workflow settles the replacement plan and TODO.

## Goal

Add an authenticated profile experience with one server-persisted preference: `showScriptModeForCreatingMeditations`. By default the preference is `false`, so authenticated users see only the form-based create-meditation flow. When the preference is `true`, the existing create-mode switch appears with `Form` and `Script` labels, allowing users to select script mode.

The implementation should stay narrow:

- one boolean user preference persisted on `users`
- one authenticated profile/preferences page at `/profile`
- authenticated profile read/update endpoints
- Redux auth-state refresh after preference changes
- UI gating for the existing create meditation mode switch
- a UI-local rename from `Spreadsheet` to `Form`

## Current Repository Context

The project is an npm workspace monorepo using:

- `api/`: Express API, route modules, middleware, Jest tests
- `db-models/`: Sequelize models and SQL migrations
- `shared-types/`: shared TypeScript request/response/user contracts
- `web/`: Next.js App Router frontend with Redux Toolkit and `redux-persist`
- `worker-node/`: worker package included in full verification

Relevant existing code:

- `shared-types/src/user.ts` defines the shared `User`, login, register, password reset, and Google auth types. The current `User` shape does not include `hasPublicMeditations` even though the API serializes it, and does not include the new profile preference.
- `db-models/src/models/User.ts` defines the Sequelize `User` model and maps snake_case database columns with camelCase model fields.
- `db-models/migrations/` currently contains SQL migrations such as `20260518_add_duration_seconds.sql` and `20260520_add_meditation_stage.sql`.
- `api/src/routes/users.ts` contains `mapUser()`, local login, Google auth, and email/password flows. `mapUser()` is the central user serializer and currently returns `hasPublicMeditations`.
- `api/src/middleware/auth.ts` exports `requireAuth`, which can protect new `/users/me` endpoints using the access-token payload on `req.user`.
- `web/src/lib/api/auth.ts` contains typed auth API helpers using `apiClient`.
- `web/src/store/features/authSlice.ts` already includes `setUser`, so preference updates can reuse the existing reducer instead of adding a new auth reducer.
- `web/src/components/Navigation.tsx` conditionally renders authenticated controls and already closes the mobile drawer through `handleCloseMobile`.
- `web/src/components/forms/CreateMeditationModeSwitcher.tsx` currently uses local `CreateMode = "script" | "spreadsheet"`, defaults to `script`, reads/writes `golightly.createMode`, and labels the form-based option `Spreadsheet`.
- `web/package.json` has `typecheck` and `lint` scripts but no web test script, so frontend coverage should rely on typecheck/lint/manual verification unless an existing harness is added elsewhere before implementation.

## Architecture and Data Model

Persist the preference on the existing `users` table rather than in `localStorage` or only in JWT claims. `localStorage` would not follow the user across browsers, and JWT claims would become stale after a preference update. The access token only needs identity/auth fields for protected routes; the fresh preference should come from database-backed user serialization.

Add a database column:

- column: `show_script_mode_for_creating_meditations`
- model field: `showScriptModeForCreatingMeditations`
- type: boolean
- nullability: `NOT NULL`
- default: `FALSE`

Add this field to the Sequelize model with `field: "show_script_mode_for_creating_meditations"`, `allowNull: false`, and `defaultValue: false`.

Create a new SQL migration in `db-models/migrations/`, likely named `20260529_add_user_create_mode_preference.sql`, using an idempotent statement:

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS show_script_mode_for_creating_meditations BOOLEAN NOT NULL DEFAULT FALSE;
```

Rollout sequencing matters. The repo's `db-models` startup uses Sequelize sync without `alter`, so runtime startup will not add this column automatically. Apply the migration before deploying or running API code that adds the Sequelize attribute; otherwise `User.findOne()` and login can fail when Sequelize selects a model attribute whose column is missing.

## Shared Type Contracts

Update `shared-types/src/user.ts` so the serialized user contract matches the actual API payload and the new preference endpoints.

The `User` type should include:

- `showScriptModeForCreatingMeditations: boolean`
- `hasPublicMeditations?: boolean`

`hasPublicMeditations` should be added because `api/src/routes/users.ts` already returns it from `mapUser()`. Making it optional preserves compatibility with any contexts that do not compute the flag.

Add profile preference types:

- `UpdateUserPreferencesRequest = { showScriptModeForCreatingMeditations: boolean }`
- `UserProfileResponse = { user: User }`
- `UpdateUserPreferencesResponse = { user: User }`

Existing login and Google auth response types should continue to use `user: User`, gaining the new fields through the shared `User` type.

## API Flow

Keep `mapUser()` in `api/src/routes/users.ts` as the single serialization point for user payloads. Extend its input type and returned object so local login, Google auth, profile reads, and preference updates all expose consistent user data.

`mapUser()` should return `showScriptModeForCreatingMeditations`, defaulting to `false` if the field is absent on a stale object or in a test double.

Add two authenticated endpoints in `api/src/routes/users.ts` protected by `requireAuth`:

- `GET /users/me`
  - read `req.user.id`
  - fetch the current user from `User`
  - return `404 USER_NOT_FOUND` if the user no longer exists
  - return `{ user: mapUser(user, await hasPublicMeditations(user.id)) }`

- `PATCH /users/me/preferences`
  - require `showScriptModeForCreatingMeditations` in the request body
  - validate that the value is a boolean, rejecting non-booleans with the existing validation error style
  - update `user.showScriptModeForCreatingMeditations`
  - save the user
  - return `{ user: mapUser(user, await hasPublicMeditations(user.id)) }`

The API should not put the preference into JWT payloads as the primary source of truth. Updating Redux with the response user is sufficient for the current session, and `/users/me` refreshes stale persisted frontend user state.

## Frontend API and State Flow

Update `web/src/lib/api/auth.ts` with typed helpers for the new profile endpoints:

- `getProfile(): Promise<UserProfileResponse>` calls `GET /users/me`
- `updateUserPreferences(data: UpdateUserPreferencesRequest): Promise<UpdateUserPreferencesResponse>` calls `PATCH /users/me/preferences`

Reuse `setUser` from `web/src/store/features/authSlice.ts`. No new reducer is necessary because the preference is part of the `User` object.

The profile page should refresh user state from `/users/me` on load to handle `redux-persist` user objects created before this field existed and to ensure cross-browser server state wins over stale local state.

## Navigation and Profile Page

Add an authenticated profile entry point in `web/src/components/Navigation.tsx`:

- desktop: render a `/profile` link with an inline generic profile/user SVG before the logout button
- mobile: render a visible `Profile` link for authenticated users, likely above logout
- use an accessible label such as `aria-label="Open profile"` for the icon link
- call `handleCloseMobile` when the mobile profile link is clicked
- do not render profile navigation for unauthenticated users
- preserve existing admin/home link behavior and logout behavior

Create `web/src/app/profile/page.tsx` as a client component. It should:

- read `isAuthenticated`, `user`, and `accessToken` from Redux
- redirect unauthenticated users to `/`
- call `getProfile()` after authenticated load, then dispatch `setUser(response.user)`
- display `Profile`, the signed-in email as the user label, and a `Preferences` section
- display one toggle labeled `Show script mode for creating meditations`
- initialize and synchronize local toggle state from `user.showScriptModeForCreatingMeditations ?? false`, preferring the fresh `/users/me` response when available
- call `updateUserPreferences()` on toggle change
- dispatch `setUser(response.user)` on success
- disable the toggle or show a saving state while the request is in flight
- show an inline error and revert local state if saving fails
- use existing Tailwind design tokens such as `bg-raised`, `border-subtle`, and `text-ink` where consistent with nearby UI

## Create Meditation Mode Switch Flow

Update `web/src/components/forms/CreateMeditationModeSwitcher.tsx` so script mode is hidden by default and exposed only when the profile preference is enabled.

Use a UI-local create mode type:

```ts
type CreateMode = "script" | "form";
```

Do not rename backend or shared meditation source-mode values as part of this feature. Existing API payloads, database `source_mode`, and backend services that currently use `"spreadsheet"` for form-based creation should keep using that value unless a separate migration is planned.

The switcher should:

- read `user` as well as `isAuthenticated` from Redux
- derive `showScriptMode = user?.showScriptModeForCreatingMeditations ?? false`
- default local `mode` state to `"form"`
- retain `STORAGE_KEY = "golightly.createMode"`
- hydrate localStorage defensively:
  - map stored `"spreadsheet"` to `"form"` and rewrite storage to `"form"`
  - use stored `"script"` only when `showScriptMode` is true
  - otherwise force/use `"form"`
  - include `showScriptMode` in the effect dependency list so disabling the preference forces form mode
- write only `"script"` or `"form"` through `updateMode()`
- render the mode switch only when `showScriptMode` is true
- render the form panel when `mode === "form"` or `showScriptMode` is false
- render the script panel only when `showScriptMode` is true and `mode === "script"`
- label the switch options `Form` and `Script`, preferably in that order
- pass `isActive` to `CreateMeditationForm` using effective form activity, not raw mode alone

This keeps existing browsers with `golightly.createMode=spreadsheet` compatible while preventing users from being restored into script mode when their account preference is off.

## API Documentation

Update `docs/api-documentation/endpoints/users.md` so generated/user-facing API docs match the new behavior:

- login and Google auth user payloads include `showScriptModeForCreatingMeditations`
- login and Google auth user payloads may include `hasPublicMeditations`
- `GET /users/me` requires bearer auth and returns `{ user: User }`
- `PATCH /users/me/preferences` requires bearer auth, accepts `{ showScriptModeForCreatingMeditations: boolean }`, documents boolean validation failure, and returns `{ user: User }`
- the preference defaults to `false`

## Testing and Verification Strategy

Backend and shared verification should include:

- `npm run typecheck -w @golightly/shared-types`
- `npm run typecheck -w @golightly/db-models`
- `npm run typecheck -w api`
- targeted user route tests, e.g. `npm test -w api -- --runInBand tests/users/users.routes.test.ts`

User route tests should cover:

- local login response includes default `showScriptModeForCreatingMeditations: false`
- `GET /users/me` returns the current user and preference
- `PATCH /users/me/preferences` persists `true` and returns the updated serialized user
- non-boolean preference values return 400 using the existing validation style
- unauthenticated profile/preference requests return 401

Frontend verification should include:

- `npm run typecheck -w web`
- `npm run lint -w web`
- manual verification because `web/package.json` has no `test` script

Manual frontend expectations:

- unauthenticated users cannot stay on `/profile`
- authenticated users can open `/profile` from desktop and mobile navigation
- profile page shows the signed-in email and the preference toggle
- default/existing users see only the form creation UI
- enabling the preference shows the `Form`/`Script` switch
- disabling the preference hides the switch and returns to the form UI
- old `localStorage` value `spreadsheet` becomes `form`

Full pre-merge verification should include the repo's broader checks where practical:

- `npm run typecheck:shared`
- `npm run typecheck:scripts`
- `npm run typecheck -w api`
- `npm run typecheck -w web`
- `npm run typecheck -w worker-node`
- `npm test -w api -- --runInBand`
- `npm test -w worker-node -- --runInBand`
- `npm test -w @golightly/shared-types -- --runInBand`
- `npm run lint -w web`

## Risks and Pitfalls

- Applying the Sequelize model change before the SQL migration can break login/profile queries because Sequelize may select a missing column.
- Storing this only in `localStorage` would fail the cross-browser/account-level preference requirement.
- Storing this only in JWT claims would become stale after preference updates.
- The form-flow UI label can change from `Spreadsheet` to `Form`, but backend/shared meditation source-mode values using `"spreadsheet"` should not be renamed as part of this narrow feature.
- `redux-persist` can preserve old user objects without the new field, so `/profile` should refresh from `/users/me` and UI code should default missing values to `false`.
- The create-mode hydration effect must react to `showScriptMode`; otherwise a user could disable the preference and remain in a stored script mode.
- Navigation changes should not remove admin/home links or make logout less accessible.
- The frontend currently has no web test harness; avoid adding test infrastructure solely for this feature unless Nick separately wants it.

## Assumptions

- The preference applies only to authenticated users because the create meditation switch currently renders only for authenticated users.
- Existing users should default to `false` through the database migration default.
- `user.email` is the display name until a separate display-name field exists.
- A simple inline SVG profile icon is preferred over adding a dependency.
- The old `docs/20260527_PROFILE_PAGE_PLAN.md` file can be removed after this replacement plan and a matching TODO are vetted and accepted.
