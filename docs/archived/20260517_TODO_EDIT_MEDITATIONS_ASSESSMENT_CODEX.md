---
created_at: 2026-05-17
updated_at: 2026-05-17
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# TODO assessment: edit meditations

The TODO list is mostly sufficient for an AI coding agent. It is well phased, references the V03 plan, includes test and typecheck gates, and captures the important race-safety and access-control work.

Before implementation, fix the items below so an agent does not lose time on avoidable command errors or ambiguous web/API behavior.

## 1. Fix the web workspace name in Phase 7 and Phase 8

The TODO uses:

1. `npm run typecheck -w @golightly-web`
2. `npm run build -w @golightly-web`

The actual package name is `@golightly/web`.

Use:

1. `npm run typecheck -w @golightly/web`
2. `npm run build -w @golightly/web`

## 2. Clarify web API wiring because the slice has no thunks today

Phase 7 says to add `regenerateScript(id, script)` as a thunk/action in `web/src/store/features/meditationSlice.ts` and to find the existing fetch pattern in the slice.

Currently `meditationSlice.ts` is a plain Redux slice with reducers only. Existing API calls live in components and `web/src/lib/api/meditations.ts`.

Recommended TODO wording:

1. Add the `PUT /meditations/:id/script` API helper in `web/src/lib/api/meditations.ts`.
2. Either introduce a thunk intentionally, or keep the existing component-driven fetch pattern in `TableMeditation.tsx`.
3. Dispatch `updateMeditation(response.meditation)` after the API call succeeds.

This avoids sending the agent looking for a thunk pattern that does not exist.

## 3. Adjust the stream-token test matrix

The TODO says `GET /:id/stream-token` should use the same access matrix as `GET /:id`.

That endpoint uses `requireAuth`, so anonymous requests should return `401`, not `403`.

Recommended test wording:

1. Authenticated non-owner public complete → allowed.
2. Authenticated non-owner public pending → 403.
3. Owner public pending → allowed.
4. Admin public pending → allowed.
5. Anonymous public pending → 401.

## 4. Clarify stream-token access helper behavior

The TODO says `canAccessMeditationDetails` allows stream-token holders for any status. That is confusing for `GET /:id/stream-token`, because this route issues the token and usually receives no token yet.

Recommended clarification:

1. Token issuance should follow owner/admin/public-complete rules.
2. Stream-token holder logic only matters for `GET /:id/stream`.
3. `GET /:id/stream` should still apply status-aware access before the `filePath` readiness check.

## 5. Make the polling cap behavior smaller and explicit

The TODO says to cap polling at about 5 minutes and fall back to a manual refresh prompt. That is a good idea, but it could lead an agent to invent a larger new UI.

Recommended TODO wording:

1. After 5 minutes, stop polling.
2. Keep the existing Refresh button available.
3. Optionally show one short inline message on the in-flight card: "Still processing. Refresh to check again."

With these changes, the TODO list should be ready for an AI coding agent to execute phase by phase.
