---
created_at: 2026-06-03
updated_at: 2026-06-03
created_by: hermes nws-go-lightly-prod (gpt-5.5)
modified_by: hermes nws-go-lightly-prod (gpt-5.5)
---

# Save & Regenerate "Authentication required" Diagnosis

## Reported production symptom

When a logged-in user opens an existing meditation, edits the script, and clicks **Save & Regenerate**, the meditation details modal shows:

> Authentication required

The attached screenshot shows the error rendered under the Script textarea after clicking **Save & Regenerate** on meditation `Metta (Love and Kindness)`.

Browser console evidence provided by Nick:

```text
Uncaught (in promise) AxiosError: Request failed with status code 401
[GoLightly] [INFO] ... [DEBUG] API Request {"method":"PUT","url":"/meditations/6/script","baseURL":"https://api.go-lightly.love","hasAuth":false}
[GoLightly] [ERROR] ... API Error Response {"status":401,"url":"/meditations/6/script","method":"PUT","errorData":{"error":{"code":"AUTH_REQUIRED","message":"Authentication required","status":401}}}
```

## Scope of this note

This is diagnosis only. No application code was modified.

## Relevant code path

Frontend click path:

1. `web/src/components/modals/ModalMeditationDetails.tsx`
   - The **Save & Regenerate** button calls `handleRegenerate()`.
   - `handleRegenerate()` calls the prop `onRegenerateScript(meditation.id, script)`.
   - If the API rejects, it surfaces `error.response.data.error.message` inside the modal.

2. `web/src/components/tables/TableMeditation.tsx`
   - Passes `onRegenerateScript={handleRegenerateScript}` into the modal.
   - `handleRegenerateScript()` calls `regenerateMeditationScript(id, script)`.

3. `web/src/lib/api/meditations.ts`
   - `regenerateMeditationScript()` sends:

```ts
apiClient.put(`/meditations/${id}/script`, { script });
```

Backend route:

1. `api/src/routes/meditations.ts`
   - `PUT /meditations/:id/script` is protected by `requireAuth`.

2. `api/src/middleware/auth.ts`
   - `requireAuth` calls `optionalAuth`.
   - If no Bearer token is found and `req.user` is not set, it returns:

```ts
new AppError(401, "AUTH_REQUIRED", "Authentication required")
```

## Key evidence

- The failing endpoint is `PUT /meditations/6/script`.
- The backend returned `AUTH_REQUIRED`, not `AUTH_FAILED`.
  - `AUTH_REQUIRED` means the request reached a protected route without an authenticated `req.user`.
  - In this auth middleware, that most directly means no valid Bearer token was available to `optionalAuth`; an invalid token would produce `AUTH_FAILED` instead.
- The frontend request log says `hasAuth:false` for this request.
  - Important nuance: `web/src/lib/api/client.ts` logs `hasAuth` before it attempts to read `persist:root` from `localStorage` and set `config.headers.Authorization`, so this log field alone is not definitive.
  - However, the server-side error code `AUTH_REQUIRED` confirms the request did not authenticate.

## Likely root cause

The regenerate-script API call does not receive the in-memory Redux `accessToken` directly. It relies on the shared Axios request interceptor to read the token from `localStorage` key `persist:root`:

```ts
const persistedState = localStorage.getItem('persist:root');
const parsed = JSON.parse(persistedState);
const authState = JSON.parse(parsed.auth);
const token = authState?.accessToken;
config.headers.Authorization = `Bearer ${token}`;
```

By contrast, `getAllMeditations()` explicitly accepts `accessToken` and sends it in the request config when `TableMeditation` fetches meditations:

```ts
getAllMeditations(isAuthenticated ? accessToken : null)
```

So the table can appear logged in / owner-aware based on Redux state and the explicit token passed to the list endpoint, while **Save & Regenerate** depends on a separate `localStorage` lookup path. If `localStorage.persist:root.auth.accessToken` is missing, stale, malformed, not yet flushed by redux-persist, or cleared by an earlier 401 handler, the `PUT /meditations/:id/script` request goes out unauthenticated and the API correctly returns `AUTH_REQUIRED`.

This same auth-path inconsistency may affect other protected meditation actions that rely solely on the Axios interceptor instead of passing the current Redux token explicitly, including update, delete, favorite, stream-token, staging, and create endpoints.

## Additional observation

`apiClient` clears only `localStorage` auth state on any 401 response, but it does not dispatch the Redux `logout` action. That can create a temporary split-brain state where the live Redux store still renders logged-in/owner UI while future interceptor-based requests read a cleared token from `localStorage`.

## Suggested fix direction for the dev agent

Pick one auth source of truth for API requests and make protected requests use it consistently.

Potential approaches:

- Prefer passing the current Redux `accessToken` explicitly into protected API helper functions, like `getAllMeditations()` already does.
- Or make the Axios client/interceptor use a reliable token provider wired to current app state rather than reparsing persisted localStorage for every request.
- Ensure 401 handling updates live Redux auth state as well as persisted storage, so the UI does not continue showing owner-only controls after auth has been cleared.
- Move the request debug log after auth header injection, or log both `hadAuthBeforeInterceptor` and `hasAuthAfterInterceptor`, so console diagnostics reflect the actual outgoing request.

## Reproduction checklist for the dev agent

1. Log in on production or a dev environment.
2. Open the meditation table and choose an owned meditation.
3. Click **Edit** in the meditation details modal.
4. Change the Script textarea.
5. Click **Save & Regenerate** and confirm the browser `confirm()` prompt.
6. Inspect the Network request for `PUT /meditations/:id/script`.
7. Verify whether the outgoing request includes an Authorization header with a Bearer token.
8. Compare current Redux auth state to `JSON.parse(JSON.parse(localStorage.getItem('persist:root')).auth)` at the moment of the click.

## Files likely involved

- `web/src/lib/api/client.ts`
- `web/src/lib/api/meditations.ts`
- `web/src/components/tables/TableMeditation.tsx`
- `web/src/components/modals/ModalMeditationDetails.tsx`
- `web/src/store/features/authSlice.ts`
- `web/src/store/index.ts`
- `api/src/middleware/auth.ts`
- `api/src/routes/meditations.ts`
