---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (opus-4.8)
modified_by: codex (gpt-5)
---

# Todo: Move "Create New Meditation" to its own page (web)

## Context

Move the meditation-creation UI off the home page and onto its own route at
`/create-meditation`, reachable from the sidebar menu. The home page keeps the
marketing header and `TableMeditation`; only the creation UI relocates.

Key facts established during exploration:

- `web/src/app/page.tsx` (server component) currently renders the marketing
  header, `<TableMeditation />`, then `<CreateMeditationModeSwitcher />`.
- `web/src/components/forms/CreateMeditationModeSwitcher.tsx` is the entire
  "Create New Meditation" UI. It is a client component that already owns its own
  data loading (staging/default meditation) and returns `null` when the user
  is not authenticated.
- `web/src/components/Navigation.tsx` renders sidebar `MenuLink`s split into an
  authenticated block and an unauthenticated block.
- `web/src/components/ProtectedRoute.tsx` redirects unauthenticated (and, when
  `requireAdmin`, non-admin) users to `/`. Used by auth-gated pages.
- `web/src/app/profile/page.tsx` and `web/src/app/admin/page.tsx` are the
  templates for a standalone client page.

Confirmed operator decisions:

- Route path: `/create-meditation`.
- Home header copy: unchanged.

Scope guardrails: no API, Redux store, or shared-types changes. `web` has no
test runner; end-of-phase checks are lint + typecheck + build only.

---

## Phase 1 — Create the `/create-meditation` page

- [x] Create `web/src/app/create-meditation/page.tsx` as a client page
      (`"use client"`).
- [x] Wrap the page body in `<ProtectedRoute>` so unauthenticated users are
      redirected to `/` (the switcher renders nothing for them otherwise).
- [x] Render a page header followed by `<CreateMeditationModeSwitcher />`,
      mirroring the layout/structure of `web/src/app/profile/page.tsx`
      (same `main`/container wrappers and theme classes).
- [x] Do not duplicate any data-loading logic — `CreateMeditationModeSwitcher`
      already handles staging/default loading and auth gating internally.

End of Phase 1:

1. `npm run lint` (in `web/`)
2. `npm run typecheck` (in `web/`)
3. `npm run build` (in `web/`)
4. Fix any failures while preserving intended behavior, then check off the
   completed tasks above and commit the Phase 1 changes.

---

## Phase 2 — Wire the sidebar link and trim the home page

- [x] In `web/src/components/Navigation.tsx`, add a new icon component for the
      Create action, following the existing local icon pattern (e.g.
      `ProfileIcon`/`InfoIcon`: an inline `svg` accepting `IconProps`).
- [x] Add a `MenuLink` to the authenticated block (near the top, e.g. above
      or alongside Profile) with `href="/create-meditation"`, the new icon, and
      label "Create Meditation". Use the existing `onClick={() => closeMenu()}`
      pattern. Do not add it to the unauthenticated block.
- [x] In `web/src/app/page.tsx`, remove the `CreateMeditationModeSwitcher`
      import and its `<CreateMeditationModeSwitcher />` render. Keep the
      marketing header (copy unchanged) and `<TableMeditation />`.

End of Phase 2:

1. `npm run lint` (in `web/`)
2. `npm run typecheck` (in `web/`)
3. `npm run build` (in `web/`)
4. Fix any failures while preserving intended behavior, then check off the
   completed tasks above and commit the Phase 2 changes.

---

## Phase 3 — Verify the flow

- [ ] Authenticated: open the sidebar, click "Create Meditation", confirm it
      navigates to `/create-meditation` and the creation UI (form and, when the
      user preference is enabled, the Form/Script switcher) renders and works.
- [x] Home page (`/`) shows the header and `TableMeditation` only — the
      creation UI is gone.
- [x] Unauthenticated: visiting `/create-meditation` directly redirects to `/`,
      and the sidebar shows no "Create Meditation" link.
- [ ] Confirm no console errors and theme/dark-mode styling matches the
      profile/admin pages.

End of Phase 3:

1. Re-run `npm run lint`, `npm run typecheck`, `npm run build` if any code was
   touched during verification.
2. Check off the completed tasks above and commit any remaining changes.
