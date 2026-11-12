---
created_at: 2026-11-12T22:56:52Z
updated_at: 2026-11-12T22:56:52Z
created_by: claude (fable-5.2) nicksmacbookair
modified_by: claude (fable-5.2) nicksmacbookair
---

# Plan: Admin page breakout

## Source requirements

- PRD: `docs/20261112_prd_admin_breakout_plan_v02.md`.
- All six decisions in that PRD are confirmed by the operator.
- This plan covers the `web` package only.

## Changes from v01

- Responds to `docs/20261112_admin_breakout_plan_v01_assessment_codex.md`.
- The assessment raised one concern: the expanded Admin group can push sidebar controls below the viewport, where they cannot be reached.
- The concern was checked against `Navigation.tsx` and accepted.
- Added: a scrollable menu region in the sidebar, a matching risk, and short-viewport verification.
- No other part of the plan changed.

## Goal

Replace the single admin page with five pages, one per section, and replace the single sidebar Admin link with an expandable Admin group.

Behavior stays the same, except for the changes the PRD confirms:

- Pages fetch on load, not on expand.
- Sections have no collapse control.
- The "Manage Go Lightly" header is removed.
- Requeue refreshes the queue only.

## Technology

No new dependencies.

- Next.js App Router, version 16, with nested routes and a nested layout.
- React 19 client components, as the current admin page uses.
- Redux store hooks already in use: `useAppSelector`, `useAppDispatch`.
- `usePathname` from `next/navigation`, new to `Navigation.tsx`.
- `redirect` from `next/navigation`, for the index route.
- Existing Tailwind tokens and classes.

## Findings from the code

These were checked on 2026-11-12.

- `web/src/app/admin/page.tsx` is one client component of 1112 lines.
- Section state is already separate. No state variable is shared between sections except `toast` and `user`.
- The only cross-section call is in `handleRequeueMeditation`, which calls `fetchMeditations` after `fetchQueuerRecords`.
- Each section repeats the same three display states: a loading skeleton, an error box with a Retry button, and the table.
- Two section headers hold actions:
  - Sound Files has the Upload Sound File button.
  - Database has the include resources checkbox and the Create Backup button.
- Only the Database handlers use the global loading overlay, through `showLoading` and `hideLoading`.
- `ProtectedRoute` is a client component. It redirects to `/` when the user is missing or is not an admin.
- `AdminTable` is already a thin wrapper around `DataTable`. No table change is needed.
- `Navigation.tsx` does not read the current route today.
- `MenuLink` requires an icon.
- The sidebar `aside` is a full-height flex column with no vertical overflow handling.
- The `nav` inside it has no scroll region, and body scrolling is locked while the menu is open.
- Each menu row has a minimum height of three rem. Logout is the last row, after the Admin entry.
- The `web` package has `lint`, `typecheck`, and `build` scripts. It has no test script and no test files.
- `next.config.js` does not set static export, so a server redirect is available.

## Target structure

```
web/src/app/admin/
  layout.tsx            new, shared guard and container
  page.tsx              reduced to a redirect
  users/page.tsx        new
  sounds/page.tsx       new
  meditations/page.tsx  new
  queue/page.tsx        new
  database/page.tsx     new
web/src/components/
  AdminPageShell.tsx    new, shared page frame
  Navigation.tsx        changed, Admin group
```

## Components

### Admin layout

File: `web/src/app/admin/layout.tsx`.

- Renders `ProtectedRoute requireAdmin` around its children.
- Renders the `main` element and the centered container now in the admin page.
- Has no header and no links to other admin pages.
- Stays mounted while an admin moves between admin pages, so the access check runs once per visit to the admin area.

### AdminPageShell

File: `web/src/components/AdminPageShell.tsx`.

A presentational component that removes the markup each section repeats. It holds no data logic.

Props:

- `title`: page title, shown as the `h1`.
- `description`: the one-line description.
- `actions`: optional controls shown beside the title.
- `loading`: shows the skeleton rows.
- `error`: shows the error box.
- `onRetry`: called by the Retry button.
- `children`: the table and any other content, shown when not loading and not in error.

Notes:

- The skeleton, error box, and panel classes are copied from the current sections.
- The title row has no toggle button and no chevron.

### Page pattern

Each page is a client component that follows the same shape.

1. Local state for its records, loading flag, error message, modal targets, and toast.
2. A `fetch` function wrapped in `useCallback`, copied from the current page.
3. A `useEffect` that calls the fetch function once when the page loads.
4. Handlers copied from the current page without logic changes.
5. Rendering through `AdminPageShell`, followed by the page's modals and its `Toast`.

Component names follow the existing page naming: `AdminUsersPage`, `AdminSoundsPage`, `AdminMeditationsPage`, `AdminQueuePage`, `AdminDatabasePage`.

### Pages

Titles and descriptions reuse the current section text.

| Page | Title | Description |
| --- | --- | --- |
| `users` | Users | Manage registered users |
| `sounds` | Sound Files | Upload and manage audio assets |
| `meditations` | Meditations | Review all meditation content |
| `queue` | Jobs Queue | Jobs Queue mirrors the database table, one row per meditation element. |
| `database` | Database | Backup and restore database |

What moves to each page:

1. Users
   - State: `users`, `loading`, `error`, `deleteTarget`, `isDeleting`.
   - Functions: `fetchUsers`, `handleDeleteConfirm`.
   - Reads `user` from the store for the self-delete guard and `currentUserId`.
   - Components: `TableAdminUsers`, `ModalConfirmDeleteUser`.
2. Sound Files
   - State: `soundFiles`, `soundsLoading`, `soundsError`, `soundDeleteTarget`, `soundEditTarget`, `isSoundDeleting`, `isUploadOpen`.
   - Functions: `fetchSoundFiles`, `handleSoundDeleteConfirm`.
   - Shell actions: the Upload Sound File button.
   - Components: `TableAdminSoundsFiles`, `ModalUploadSoundFile`, `ModalEditSoundFile`, `ModalConfirmDelete`.
3. Meditations
   - State: `meditations`, `meditationsLoading`, `meditationsError`, the edit, delete, and default targets, and the three busy flags.
   - Functions: `fetchMeditations`, `handleMeditationDeleteConfirm`, `handleMeditationMetadataSave`, `handleSetDefaultConfirm`.
   - Components: `TableAdminMeditations`, `ModalEditAdminMeditation`, `ModalConfirmCascadeDelete`, `ModalConfirmDelete` for set default.
4. Jobs Queue
   - State: `queueRecords`, `queueLoading`, `queueError`, `queueDeleteTarget`, `isQueueDeleting`.
   - Functions: `fetchQueuerRecords`, `handleQueueDeleteConfirm`, `handleRequeueMeditation`.
   - Change: `handleRequeueMeditation` no longer calls `fetchMeditations`.
   - Components: `TableAdminQueuer`, `ModalConfirmCascadeDelete`.
5. Database
   - State: `backups`, `databaseLoading`, `databaseError`, `includeResources`, `isRestoreConfirmOpen`, `sizeEstimate`, `uploadFile`, and `uploadInputRef`.
   - Functions: `fetchBackups`, `fetchBackupSizeEstimate`, and the create, download, delete, and restore handlers.
   - The page load effect calls both fetch functions, as the expand effect does today.
   - Shell actions: the include resources checkbox and the Create Backup button.
   - Keeps `showLoading` and `hideLoading` for backup, download, and restore.
   - Components: `TableAdminDatabase`, `ModalConfirmRestore`, and the upload and restore block.

Local state names may drop their section prefix inside a single-purpose page, for example `soundsLoading` becomes `loading`. Function and handler names stay as they are.

### Index route

File: `web/src/app/admin/page.tsx`.

- Becomes a server component with no `"use client"` line.
- Calls `redirect("/admin/users")`.
- The guard still applies, because `/admin/users` is inside the admin layout.

### Sidebar Admin group

File: `web/src/components/Navigation.tsx`.

- A constant list, `ADMIN_LINKS`, holds the label and route for each admin page. A later page is one new entry.
- A new state value, `isAdminGroupOpen`, controls the group.
- `usePathname` gives the current route. When the route changes, the group is set open if the route starts with `/admin`, and closed otherwise.
- The admin can toggle the group by hand on any route.
- The group toggle is a `button` using `menuRowClass`, the existing `ShieldIcon`, the label "Admin", and a chevron.
- The toggle sets `aria-expanded` and `aria-controls`.
- The links render through a small `MenuSubLink` component, indented and without an icon, built on the same `Link` and `menuRowClass` as `MenuLink`.
- Each link calls `closeMenu()` and sets `aria-current="page"` when it matches the current route.
- The group is rendered only when `user?.isAdmin` is true, in the same place as the current Admin link.
- Escape handling, focus return, and body scroll lock are unchanged.

### Sidebar scrolling

File: `web/src/components/Navigation.tsx`.

The open Admin group adds five rows. On a short screen the menu can then be taller than the viewport, and nothing scrolls today.

- The `nav` element becomes the scroll region of the sidebar.
- It takes the remaining height of the `aside` and scrolls vertically when its content is taller, using `min-h-0`, `flex-1`, and `overflow-y-auto`.
- The sidebar header, with the logo and the Close button, stays outside the scroll region and remains visible.
- Logout stays inside the `nav`, in its current position, and is reached by scrolling.
- Body scroll lock stays, so only the menu scrolls.
- This applies to all users, but only changes what they see when the menu is taller than the screen.

## Flow

1. An admin opens the sidebar. The Admin group is shown, open if they are already on an admin page.
2. The admin picks a page. The sidebar closes and the route changes.
3. The admin layout checks access once, then renders the page.
4. The page fetches its data on load and shows the skeleton, then the table or the error box.
5. Actions open the same modals and show the same toasts as today.
6. Opening `/admin` directly lands on `/admin/users`.

## Order of work

The old page keeps working until the last step.

1. Add `AdminPageShell` and the admin layout.
2. Add the five pages, starting with Users to prove the pattern, and ending with Database.
3. Replace the sidebar link with the Admin group.
4. Replace the old page with the redirect.

One caution for step 1: the old page wraps itself in `ProtectedRoute` and its own `main` container. Once the layout exists, the old page is nested inside both until step 4. The layout step should remove those two wrappers from the old page so the container is not doubled.

## Risks

- Dropped behavior during the move. Each handler, modal, and toast must be matched against the old page before it is deleted.
- The Database page carries the most handlers and the loading overlay.
- React strict mode runs load effects twice in development. This doubles requests in development only.
- The sidebar group adds state to a component that also manages focus and Escape handling.
- The open Admin group makes the menu taller than short viewports. The scroll region must keep every link and Logout reachable.

## Verification

- `npm run lint`, `npm run typecheck`, and `npm run build` in `web`.
- There are no automated web tests, so behavior is checked by hand.
- Manual checks follow the Verification section of the PRD.
- Manual, short viewport: at 375 by 568 and in phone landscape, open the Admin group and confirm every admin link and Logout can be reached by scrolling.
- Manual, keyboard: tab through the open menu at a short viewport and confirm focused rows scroll into view.
- Manual, non-admin: confirm the menu looks and behaves as before.
- Before the old page is deleted, compare each new page against its old section: state, fetch, handlers, modals, toasts, and header actions.
