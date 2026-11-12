---
created_at: 2026-11-12T22:59:09Z
updated_at: 2026-11-12T23:17:00Z
created_by: claude (fable-5.2) nicksmacbookair
modified_by: codex (gpt-6) nicksmacbookair
---

# Todo: Admin page breakout

## Sources

- Plan: `docs/20261112_admin_breakout_plan_v02.md`.
- PRD: `docs/20261112_prd_admin_breakout_plan_v02.md`.

Read both before starting. The plan is the authority for names and structure.

## Rules for the implementing agent

- All code changes are in the `web` package.
- Do not change `api`, `worker-node`, `db-models`, or `shared-types`.
- Copy fetch functions and handlers from `web/src/app/admin/page.tsx` without logic changes, except where a task says otherwise.
- Do not delete code from the old admin page until phase 6, except the wrappers named in phase 1.
- `web` has no automated tests. The checks are lint, typecheck, and build.

## End of every phase

Run these from the `web` folder.

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`

Then:

- Fix any failure so that behavior is kept and the checks pass.
- Check off the completed tasks in this file.
- Commit the changes for the phase. Follow the commit rules in `AGENTS.md` and reference this file and the phase number.

## Phase 0: Branch

- [x] Run `git fetch` and `git branch -a`.
- [x] Create a new branch from an up-to-date `main`, named by the branch rules in `AGENTS.md`, for example `dev_NN_admin_breakout`.
- [x] Confirm the PRD, plan, and todo files for this work are present on the new branch. If they are not, stop and ask the operator.

## Phase 1: Shared shell and admin layout

- [x] Create `web/src/components/AdminPageShell.tsx` as a client component.
  - [x] Props: `title`, `description`, `actions` (optional), `loading`, `error` (string or null), `onRetry`, `children`.
  - [x] Render a `section` with the title row and the content panel, using the classes from the current section markup in the old admin page.
  - [x] Title row: an `h1` for `title`, a `p` for `description`, and `actions` on the right. No toggle button and no chevron.
  - [x] Content panel: when `loading`, show the four skeleton rows copied from the Users section.
  - [x] Content panel: when not loading and `error` is set, show the error box and a Retry button that calls `onRetry`.
  - [x] Content panel: otherwise show `children`.
- [x] Create `web/src/app/admin/layout.tsx`.
  - [x] Wrap `children` in `ProtectedRoute requireAdmin`.
  - [x] Inside it, render the `main` element and the centered container `div`, with the classes used by the old admin page.
  - [x] Add no header and no links.
- [x] In `web/src/app/admin/page.tsx`, remove only the wrappers now in the layout.
  - [x] Remove the `ProtectedRoute` wrapper and its import.
  - [x] Remove the `main` element and the centered container `div`, keeping their contents.
  - [x] Keep the modals and toast rendering as they are.
- [ ] Run the dev server and confirm `/admin` looks and works as before, with no doubled padding.
- [x] Run the end of phase steps.

## Phase 2: Users page

- [x] Create `web/src/app/admin/users/page.tsx` as a client component named `AdminUsersPage`.
- [x] Copy the users state: `users`, `loading`, `error`, `deleteTarget`, `isDeleting`.
- [x] Add a local `toast` state with the same shape as the old page.
- [x] Read `user` from the store with `useAppSelector`.
- [x] Copy `fetchUsers` and `handleDeleteConfirm`, including the self-delete guard.
- [x] Add a `useEffect` that calls `fetchUsers` when the page loads.
- [x] Render `AdminPageShell` with title "Users" and description "Manage registered users".
- [x] Pass `loading`, `error`, and `fetchUsers` as `onRetry`.
- [x] Render `TableAdminUsers` as the shell's children, with the same props as the old page.
- [x] Render `ModalConfirmDeleteUser` and `Toast` with the same props as the old page.
- [ ] Open `/admin/users` and confirm the table loads and delete works.
- [x] Run the end of phase steps.

## Phase 3: Sound Files, Meditations, and Jobs Queue pages

Follow the pattern from phase 2 for each page. Each page has its own `toast` state and its own load effect.

### Sound Files

- [x] Create `web/src/app/admin/sounds/page.tsx` named `AdminSoundsPage`.
- [x] Copy the state: `soundFiles`, `soundsLoading`, `soundsError`, `soundDeleteTarget`, `soundEditTarget`, `isSoundDeleting`, `isUploadOpen`.
- [x] Copy `fetchSoundFiles` and `handleSoundDeleteConfirm`.
- [x] Render `AdminPageShell` with title "Sound Files" and description "Upload and manage audio assets".
- [x] Pass the Upload Sound File button as the shell's `actions`. It sets `isUploadOpen` to true.
- [x] Render `TableAdminSoundsFiles` with the same props as the old page.
- [x] Render `ModalUploadSoundFile`, `ModalEditSoundFile`, the sound file `ModalConfirmDelete`, and `Toast`, with the same props and callbacks as the old page.

### Meditations

- [x] Create `web/src/app/admin/meditations/page.tsx` named `AdminMeditationsPage`.
- [x] Copy the state: `meditations`, `meditationsLoading`, `meditationsError`, the edit, delete, and default targets, `isMeditationDeleting`, `isMeditationSaving`, `isSettingDefault`.
- [x] Copy `fetchMeditations`, `handleMeditationDeleteConfirm`, `handleMeditationMetadataSave`, and `handleSetDefaultConfirm`.
- [x] Render `AdminPageShell` with title "Meditations" and description "Review all meditation content".
- [x] Render `TableAdminMeditations` with the same props as the old page.
- [x] Render `ModalConfirmCascadeDelete`, `ModalEditAdminMeditation`, the set default `ModalConfirmDelete`, and `Toast`, with the same props as the old page.

### Jobs Queue

- [x] Create `web/src/app/admin/queue/page.tsx` named `AdminQueuePage`.
- [x] Copy the state: `queueRecords`, `queueLoading`, `queueError`, `queueDeleteTarget`, `isQueueDeleting`.
- [x] Copy `fetchQueuerRecords`, `handleQueueDeleteConfirm`, and `handleRequeueMeditation`.
- [x] In `handleRequeueMeditation`, remove the call to `fetchMeditations`. Keep the call to `fetchQueuerRecords`.
- [x] Render `AdminPageShell` with title "Jobs Queue" and description "Jobs Queue mirrors the database table, one row per meditation element."
- [x] Render `TableAdminQueuer` with the same props as the old page.
- [x] Render the queue `ModalConfirmCascadeDelete` and `Toast`, with the same props as the old page.

### Check

- [ ] Open each of the three pages and confirm the table loads.
- [x] Run the end of phase steps.

## Phase 4: Database page

- [x] Create `web/src/app/admin/database/page.tsx` named `AdminDatabasePage`.
- [x] Copy the state: `backups`, `databaseLoading`, `databaseError`, `includeResources`, `isRestoreConfirmOpen`, `sizeEstimate`, `uploadFile`, and the `uploadInputRef` ref.
- [x] Add `useAppDispatch` for `showLoading` and `hideLoading`.
- [x] Copy `fetchBackups` and `fetchBackupSizeEstimate`.
- [x] Copy `handleCreateBackup`, `handleDownloadBackup`, `handleDeleteBackup`, and `handleRestoreDatabase`.
- [x] Add a `useEffect` that calls both `fetchBackups` and `fetchBackupSizeEstimate` when the page loads.
- [x] Render `AdminPageShell` with title "Database" and description "Backup and restore database".
- [x] Pass the include resources checkbox and the Create Backup button as the shell's `actions`.
- [x] As the shell's children, render the size estimate line, `TableAdminDatabase`, and the upload and restore block, copied from the old page.
- [x] Render `ModalConfirmRestore` and `Toast` with the same props as the old page.
- [ ] Open `/admin/database` and confirm the backup list and size estimate load.
- [x] Run the end of phase steps.

## Phase 5: Sidebar Admin group and scrolling

All tasks are in `web/src/components/Navigation.tsx`.

### Admin group

- [x] Add a constant `ADMIN_LINKS` with label and route for Users, Sound Files, Meditations, Jobs Queue, and Database, using the routes in the plan.
- [x] Import `usePathname` from `next/navigation` and read the current route.
- [x] Add state `isAdminGroupOpen`.
- [x] Add an effect that sets `isAdminGroupOpen` to true when the route starts with `/admin`, and to false otherwise, each time the route changes.
- [x] Add a chevron icon component in the same style as the existing icon components.
- [x] Add a `MenuSubLink` component: a `Link` using `menuRowClass`, indented, with no icon, that accepts `href`, `label`, `onClick`, and an `isCurrent` flag.
- [x] `MenuSubLink` sets `aria-current="page"` when `isCurrent` is true.
- [x] Replace the Admin `MenuLink` with a toggle `button` using `menuRowClass`, `ShieldIcon`, the label "Admin", and the chevron.
- [x] The toggle flips `isAdminGroupOpen` and sets `aria-expanded` and `aria-controls`.
- [x] Below the toggle, render the `ADMIN_LINKS` as `MenuSubLink` items inside a container whose `id` matches `aria-controls`, only when the group is open.
- [x] Each sub link calls `closeMenu()` on click.
- [x] Keep the group inside the existing `user?.isAdmin` check, with the existing dividers.

### Scrolling

- [x] Make the `nav` element the scroll region: add `min-h-0`, `flex-1`, and `overflow-y-auto` to its classes.
- [x] Leave the sidebar header, with the logo and Close button, outside the `nav` so it stays visible.
- [x] Leave Logout inside the `nav` in its current position.
- [x] Do not change the Escape handler, the focus return, or the body scroll lock.

### Check

- [ ] As an admin, confirm the group is open on an admin page and closed on other pages.
- [ ] Confirm each link navigates, the menu closes, and the current page is marked.
- [ ] At a viewport of 375 by 568 with the group open, confirm the menu scrolls and Logout can be reached.
- [ ] As a non-admin, confirm the Admin group is not shown and the menu looks as before.
- [x] Run the end of phase steps.

## Phase 6: Index redirect and cleanup

- [x] Before deleting anything, compare each new page against its section in the old page: state, fetch, handlers, modals, toasts, and header actions. Fix any gap.
- [x] Replace the contents of `web/src/app/admin/page.tsx` with a server component that calls `redirect("/admin/users")` from `next/navigation`. It has no `"use client"` line.
- [x] Search `web/src` for imports or references that are now unused, and remove only those left unused by this work.
- [ ] Confirm opening `/admin` lands on `/admin/users`.
- [ ] Confirm a non-admin opening `/admin` or any `/admin` page is sent to `/`.
- [x] Run the end of phase steps.

## Phase 7: Manual verification

Run the app with the API and worker available. Record any failure and fix it before closing the phase.

- [ ] Every page: the title and one-line description show, with no collapse control and no "Manage Go Lightly" header.
- [ ] Every page: the skeleton shows while loading. With the API stopped, the error box and Retry button show.
- [ ] Users: delete a user. Confirm an admin cannot delete their own account.
- [ ] Sound Files: upload, edit, and delete a sound file.
- [ ] Meditations: edit metadata, set a default, and delete a meditation.
- [ ] Jobs Queue: requeue a meditation and delete a record.
- [ ] Database: create a backup, download it, and delete it.
- [ ] Database: upload a backup and restore, only on a development database.
- [ ] Sidebar: the group opens on admin pages, links navigate, and the menu closes.
- [ ] Sidebar: at 375 by 568 and in phone landscape, every admin link and Logout can be reached by scrolling.
- [ ] Keyboard: tab through the open menu at a short viewport and confirm focused rows scroll into view. Escape closes the menu and focus returns to the menu button.
- [ ] Access: a non-admin user cannot open any `/admin` route.
- [ ] Check off the completed tasks and commit any fixes, following the end of phase steps.
