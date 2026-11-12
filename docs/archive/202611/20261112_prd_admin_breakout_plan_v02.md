---
created_at: 2026-11-12T22:48:05Z
updated_at: 2026-11-12T22:48:05Z
created_by: claude (fable-5.2) nicksmacbookair
modified_by: claude (fable-5.2) nicksmacbookair
---

# PRD: Admin page breakout

## Overview

Split the single admin page into one page per feature, and give admins a way to move between those pages.

- Each current admin section becomes its own route under `/admin`.
- The sidebar gets an Admin group that lists the admin pages.
- Behavior of every section stays the same as today, except where the decisions below say otherwise.

This version replaces `docs/20261112_prd_admin_breakout_plan_v01.md`. It folds the six open questions from v01 into the plan as confirmed decisions.

This PRD also replaces Part A of `docs/20260616_prd3_admin_split_and_taxonomy_plan_v01.md`. That document stays as a reference only.

## Relationship to other work

Three pieces of work are planned. Each gets its own PRD.

1. Admin page breakout (this PRD).
2. Admin voices page, see `docs/20261112_prd_admin_voices_plan_v01.md`.
3. Meditation taxonomy, see `docs/20261112_prd_meditation_taxonomy_plan_v01.md`.

The breakout goes first. It gives the voices page and the taxonomy page a place to live.

## Operator-confirmed decisions

The operator accepted all six recommendations from v01 on 2026-11-12.

1. `/admin` redirects to `/admin/users`.
2. Pages do not keep the collapse control. Each page shows its section directly.
3. The sidebar Admin group opens automatically when the current route is under `/admin`.
4. Admin navigation is in the sidebar only. The admin layout has no links to other admin pages.
5. Route names are `/admin/users`, `/admin/sounds`, `/admin/meditations`, `/admin/queue`, and `/admin/database`.
6. Each page shows a page title and a one-line description. The "Manage Go Lightly" header is removed.

## In scope

- One route per existing admin section.
- A shared admin layout for the parts every page repeats.
- An Admin group in the sidebar, shown to admins only.
- A redirect from `/admin` to `/admin/users`.

## Out of scope

- Any change to `api`, `worker-node`, `db-models`, or `shared-types`.
- New admin features, including the voices page and the taxonomy page.
- Redesign of the admin tables or modals.
- Moving the admin tables from `AdminTable` to `DataTable`.
- A landing page at `/admin`.
- Links between admin pages inside the admin layout.

## Current state

These points were checked in the code on 2026-11-12.

- `web/src/app/admin/page.tsx` is the only admin route. It is 1112 lines.
- It holds the state, fetches, handlers, and modals for five sections: Users, Sound Files, Meditations, Jobs Queue, Database.
- Each section is a collapsible panel. A section fetches its data when it is expanded.
- One toast state is shared by all five sections.
- Requeuing a meditation from the Jobs Queue section also refreshes the Meditations section.
- The page wraps its content in `ProtectedRoute requireAdmin`.
- `web/src/lib/utils/auth.ts` treats any route starting with `/admin` as an admin route.
- `web/src/components/Navigation.tsx` shows one Admin `MenuLink` to `/admin` when `user?.isAdmin` is true.
- The five admin table components all use `AdminTable`.

## Routes

| Route | Section today | Table component |
| --- | --- | --- |
| `/admin` | All sections | Redirects to `/admin/users` |
| `/admin/users` | Users | `TableAdminUsers` |
| `/admin/sounds` | Sound Files | `TableAdminSoundsFiles` |
| `/admin/meditations` | Meditations | `TableAdminMeditations` |
| `/admin/queue` | Jobs Queue | `TableAdminQueuer` |
| `/admin/database` | Database | `TableAdminDatabase` |

Routes planned by later PRDs, not built here:

- `/admin/voices`
- `/admin/taxonomy`

## Page design

Each page owns only what its section needs.

- Its own state, fetch, handlers, and modals, moved from the current page without logic changes.
- Its own toast state.
- Its own loading and error display.
- A fetch when the page loads, replacing the fetch on expand.
- The section content shown directly, with no collapse control.
- A page title and a one-line description at the top.

Section details to carry over:

1. Users
   - Delete user modal, including the option to keep public meditations.
   - The guard that stops an admin deleting their own account.
2. Sound Files
   - Upload modal, edit modal, and delete confirm.
3. Meditations
   - Metadata edit modal, delete confirm, cascade delete confirm, and set default confirm.
4. Jobs Queue
   - Delete confirm and requeue action.
   - Requeue refreshes the queue only. The meditations page fetches fresh data when opened.
5. Database
   - Create backup with the include resources option and size estimate.
   - Download, delete, upload, and restore, including the restore confirm modal.
   - The global loading overlay used for backup, download, and restore.

## Shared layout

Add `web/src/app/admin/layout.tsx`.

- Wraps all admin pages in `ProtectedRoute requireAdmin`.
- Holds the page container.
- Does not show the "Manage Go Lightly" header.
- Does not show links to other admin pages.
- Each page supplies its own title and one-line description.

## Index route

- `web/src/app/admin/page.tsx` is reduced to a redirect to `/admin/users`.
- Existing bookmarks and links to `/admin` keep working.
- A non-admin user who opens `/admin` is still blocked by the admin guard.

## Navigation

Replace the single Admin link in `Navigation.tsx` with an expandable Admin group.

- Shown only when `user?.isAdmin` is true.
- Lists the five admin pages.
- Opens automatically when the current route is under `/admin`.
- Stays closed on other routes until the admin opens it.
- Uses the existing `MenuLink` and `menuRowClass` styling.
- Each link calls `closeMenu()` like the existing links.
- The group toggle is a button with `aria-expanded`.
- The group is keyboard accessible and follows the existing focus behavior.
- Adding a page later is one new entry in a list.

## Key files

| File | Change |
| --- | --- |
| `web/src/app/admin/layout.tsx` | New shared layout |
| `web/src/app/admin/page.tsx` | Reduced to a redirect to `/admin/users` |
| `web/src/app/admin/users/page.tsx` | New page |
| `web/src/app/admin/sounds/page.tsx` | New page |
| `web/src/app/admin/meditations/page.tsx` | New page |
| `web/src/app/admin/queue/page.tsx` | New page |
| `web/src/app/admin/database/page.tsx` | New page |
| `web/src/components/Navigation.tsx` | Expandable Admin group |

## Suggested phases

1. Add the layout and the Users page. Confirm the pattern works.
2. Move Sound Files, Meditations, Jobs Queue, and Database, one page at a time.
3. Replace the sidebar link with the Admin group.
4. Reduce `/admin` to the redirect and delete the unused code.

## Risks

- Dropped behavior during the move. Modals, toasts, loading states, and error states are the most likely losses.
- The Database page has the most handlers and the global loading overlay, so it carries the most risk.
- Pages now fetch on load. An admin opening a page always triggers a request.
- During phases 1 to 3, the old page and the new pages exist together. The old page is removed only in phase 4.

## Verification

- `web`: lint, typecheck, and build pass.
- Manual, per page: data loads, and loading and error states show.
- Manual, per page: the title and one-line description show, with no collapse control.
- Manual, Users: delete a user, and confirm the self-delete guard.
- Manual, Sound Files: upload, edit, and delete.
- Manual, Meditations: edit metadata, set default, and delete.
- Manual, Jobs Queue: requeue and delete a record.
- Manual, Database: create, download, delete, upload, and restore a backup.
- Manual, index: opening `/admin` lands on `/admin/users`.
- Manual, sidebar: the Admin group is open on an admin page and closed elsewhere.
- Manual, sidebar: links navigate and the menu closes.
- Manual, access: a non-admin user cannot open any `/admin` route.
- Manual, keyboard: the Admin group can be opened and used without a mouse.
