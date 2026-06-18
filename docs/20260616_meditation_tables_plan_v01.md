---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# PRD2 Meditation Tables — Architecture Plan V01

## Overview

This plan describes the architecture changes required to migrate the home-page meditation table from its current hand-rolled implementation to a shared `DataTable` component built on TanStack Table, while preserving all existing behavior and maintaining a safe compatibility shim for the five existing admin tables. A new `createdByUsername` column is added to the home table, sourced from a flat string field delivered by the API as part of PRD1.

The work is confined entirely to the `web` package. No API routes, database schema, or server-side code are touched. The plan assumes PRD1 has landed and the `/meditations/all` and `/:id` endpoints already include `createdByUsername?: string | null` on the meditation object.

---

## Decisions Resolved

| Open question | Resolution |
|---|---|
| Extract DataTable or extend AdminTable? | Extract a new `DataTable` component; keep `AdminTable` as a thin wrapper around it. AdminTable is not deleted in this PR. |
| Home page row count | 10 rows per page. |
| Page-size selector on home? | No selector in V1. Fixed at 10. Search field plus prev/next pagination controls only. |
| Creator field shape | Flat `createdByUsername?: string | null` only. No nested creator object. |
| PRD1 coupling | PRD2 reads the field but does not own or duplicate the PRD1 work. If PRD1 has not landed, `createdByUsername` renders as a graceful empty/dash. |

---

## Existing Architecture Touched

### `web/src/components/tables/TableMeditation.tsx`
The current home table is entirely hand-rolled. It owns its own:
- Row data fetching via Redux (rows come from the Redux store, not local state).
- Polling loop that refreshes rows on an interval.
- In-flight and failed row states with per-row status indicators.
- Favorite toggle integrated directly into each row.
- Details modal triggered by row click.
- AudioPlayer embedded per row.
- Guidance dot and help tooltip.
- Mobile card view: below a breakpoint the table collapses into a stacked card layout rendered separately from the desktop table markup.

All of these behaviors must be preserved verbatim after the refactor. The refactor replaces the table skeleton and column definition mechanism only; it does not touch the feature logic listed above.

### `web/src/components/tables/AdminTable.tsx`
The existing admin table is already a TanStack Table wrapper. It is used by five consumers:
- `TableAdminMeditations`
- `TableAdminUsers`
- `TableAdminSoundsFiles`
- `TableAdminQueuer`
- `TableAdminDatabase`

These five consumers must continue to work without any changes to their own files. `AdminTable` becomes a thin re-export/wrapper, not a deleted file.

### `web/src/lib/api/meditations.ts`
Read-only during this PR. The API client is expected to already type `createdByUsername` after PRD1 merges. This plan adds no new fetches and changes no endpoint URLs.

### `web/src/app/page.tsx`
The home page renders `TableMeditation` by name. The component file is replaced but the import statement in `page.tsx` does not change.

---

## DataTable Extraction Approach

### Goal
Move the reusable TanStack Table scaffolding that currently lives inside `AdminTable` into a new primitive component called `DataTable`. `AdminTable` is then re-expressed as a thin wrapper that passes its existing props through to `DataTable` unchanged.

### `DataTable` contract
`DataTable` accepts the minimal set of props required by both the home table and the admin tables:

- `columns: ColumnDef<TData, any>[]` — TanStack column definitions.
- `data: TData[]` — the row array.
- `pageIndex: number` and `pageCount: number` — controlled pagination state.
- `onPageChange: (index: number) => void` — pagination callback.
- `globalFilter?: string` and `onGlobalFilterChange?: (v: string) => void` — optional search passthrough.
- `getRowId?: (row: TData) => string` — optional stable row key, used by the home table to preserve in-flight row identity across polling refreshes.
- `renderSubComponent?: (row: Row<TData>) => ReactNode` — optional row expansion slot, retained for admin use cases that need it.

`DataTable` renders: search input (when `onGlobalFilterChange` is provided), the `<table>` element with header and body, and prev/next pagination controls. It does not render the AudioPlayer, the details modal, or any feature-specific cell content — those remain in the column definitions supplied by the caller.

### `AdminTable` wrapper
`AdminTable` keeps its existing file path and export name. Its implementation becomes a single-level wrapper:

```
AdminTable(props) → DataTable(props)
```

The props signature of `AdminTable` does not change. Its internal TanStack `useReactTable` call is moved into `DataTable`. If `AdminTable` had any admin-specific styling slots or prop names that do not map cleanly to `DataTable`, they are mapped at the wrapper boundary rather than leaking into `DataTable`.

### File locations
- `web/src/components/tables/DataTable.tsx` — new primitive.
- `web/src/components/tables/AdminTable.tsx` — updated wrapper, same path.
- `web/src/components/tables/TableMeditation.tsx` — refactored consumer.

---

## TableMeditation Refactor Approach

### Column definitions
Each column is expressed as a TanStack `ColumnDef<Meditation>`. Custom cell renderers replicate the existing bespoke cell markup exactly:

- **Title cell** — existing title + guidance dot.
- **Duration cell** — existing formatted duration.
- **Audio cell** — `AudioPlayer` component, same as today.
- **Favorite cell** — favorite toggle button, same Redux dispatch as today.
- **Status cell** — in-flight spinner or failed indicator, same logic as today.
- **Created By cell** — new column, renders `createdByUsername ?? '—'`.

Column order on desktop: Title, Duration, Created By, Audio, Favorite, Status.

### State management
All Redux state connections remain. The component still selects rows from the Redux store, dispatches the same actions, and runs the same polling interval. The only change is that the render path goes through `DataTable` instead of a hand-rolled `<table>`.

Pagination state (`pageIndex`) is held in local component state via `useState`. On each polling refresh the current page is preserved; the component does not reset to page 0 unless a search filter changes.

Search filter state is also local. The filter is applied client-side via TanStack's `globalFilterFn` against the title and `createdByUsername` fields.

### Details modal
The existing details modal is triggered by the `onRowClick` pattern. `DataTable` accepts an optional `onRowClick: (row: Row<TData>) => void` prop. `TableMeditation` passes its existing modal-open handler through this prop. The modal itself lives outside `DataTable` markup, appended to the component return just as it does today.

### Mobile card view
The mobile card view is not expressed as a TanStack table. It is a separate JSX branch gated by a CSS breakpoint check (or a `useMediaQuery` hook, matching whatever the current implementation uses). This branch is preserved unchanged. `DataTable` is only rendered in the desktop branch. The mobile branch reads from the same Redux rows array and continues to function independently.

This avoids any risk of TanStack's responsive behavior interfering with the existing mobile layout.

---

## Created By / PRD1 Dependency Handling

### Type contract
The `Meditation` type in `web/src/lib/api/meditations.ts` gains `createdByUsername?: string | null` after PRD1 merges. This plan does not modify that type file; it consumes the field as-is.

### Graceful degradation
The Created By column cell renderer uses the nullish coalescing pattern `createdByUsername ?? '—'`. If PRD1 has not yet merged into the branch being tested, the column renders dashes for all rows without throwing or breaking the table layout.

### Import ordering
PRD2 must not be merged to `main` before PRD1 because the home table will display the Created By column regardless, and without PRD1 all rows will show `'—'`. The release sequencing is: PRD1 to `main` first, then PRD2. This is a deployment dependency, not a code dependency.

### No PRD1 file edits
PRD2 touches zero PRD1 files. If Codex review identifies a specific low-risk gap — for example, that the accepted PRD1 TODO omitted `createdByUsername` from a type declaration — that finding is addressed in a targeted addendum to the PRD1 TODO, not by expanding the PRD2 diff.

---

## Mobile / Responsive Behavior

The existing `TableMeditation` already has two render paths: a desktop table and a mobile card list. This dual-path approach is preserved exactly.

`DataTable` is desktop-only. It renders a standard `<table>` element and makes no assumptions about viewport width. The breakpoint logic that selects between desktop and mobile remains in `TableMeditation`, one level above `DataTable`.

The mobile card view does not change at all in this PR. It continues to map over Redux rows and render bespoke card markup. The Created By field is added to the mobile card view as a subtitle line below the meditation title, rendered as `createdByUsername ?? '—'`.

Admin tables are not touched by the mobile changes. Their layouts are unchanged.

---

## Admin Table Compatibility

### Contract preservation
The five admin table consumers (`TableAdminMeditations`, `TableAdminUsers`, `TableAdminSoundsFiles`, `TableAdminQueuer`, `TableAdminDatabase`) must pass a zero-diff review: their files are not modified. The only file that changes in the admin table subtree is `AdminTable.tsx` itself, and its external props interface is frozen.

### Regression surface
The extraction moves TanStack's `useReactTable` call from `AdminTable` into `DataTable`. The risk is that the hook call receives slightly different option objects at the boundary and produces different behavior. To mitigate this, all options that `AdminTable` previously passed directly to `useReactTable` are forwarded verbatim through `DataTable`'s props. No defaults are added to `DataTable` that could silently change admin sorting, filtering, or pagination behavior.

### Styling isolation
If `AdminTable` applies any CSS classes or wrapper elements that are admin-specific (background color, border style, padding), those styles stay in `AdminTable`'s wrapper JSX and are not absorbed into `DataTable`. `DataTable` is unstyled at the wrapper level; callers own their container.

---

## Validation Strategy

The project has no test script in `web/package.json`. Validation is therefore entirely static and manual.

### Static checks (must pass before PR)
1. `npm run typecheck` — zero TypeScript errors.
2. `npm run lint` — zero lint errors or warnings above the existing baseline.
3. `npm run build` — clean production build with no new warnings.

### Manual smoke tests (home table)
- Page loads with 10 rows.
- Prev/next pagination advances and retreats through the full row set.
- Search field filters rows by title and by `createdByUsername`.
- Clearing the search restores the full row set and resets to page 0.
- Favorite toggle fires, row updates optimistically.
- AudioPlayer plays and pauses.
- Row click opens the details modal.
- In-flight row shows spinner; failed row shows error state.
- Guidance dot and help tooltip render and dismiss correctly.
- Polling fires on interval and updates rows without resetting page or search state.
- On narrow viewport the mobile card view renders instead of the table.
- Created By column shows username for meditations that have one; shows `'—'` for rows where the field is null or absent.

### Manual smoke tests (admin tables)
- All five admin table pages load without console errors.
- Sorting, filtering, and pagination in each admin table work identically to before.
- No visual regressions in admin table borders, padding, or row density.

### Review gate
Because there is no automated test suite, the PR description must include a completed manual smoke-test checklist signed off by the author before merge.

---

## Risks and Mitigations

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| AdminTable behavior silently changes after extraction | Medium | High | Freeze `AdminTable` props interface; forward all `useReactTable` options verbatim; manual smoke test all five admin pages. |
| Polling reset on page change caused by row array identity change | Medium | Medium | Use stable `getRowId` so TanStack does not treat a refresh as a full replacement; test that page and search state survive a polling tick. |
| Mobile card view broken by a shared style import moved into DataTable | Low | Medium | Keep DataTable unstyled at the wrapper level; mobile branch never renders DataTable. |
| PRD1 not yet merged when PRD2 is tested | High | Low | Graceful `?? '—'` fallback; column renders without error; documented release ordering. |
| TanStack version mismatch between what AdminTable used and what DataTable expects | Low | High | DataTable is extracted from AdminTable, not written from scratch — same version, same import paths. |
| Search interaction with in-flight rows producing empty filtered set | Low | Low | In-flight rows still carry title field; they participate in filtering normally. |

---

## Dependencies for PRD3

PRD3 is expected to add per-user filtering, saved search state, and possibly server-side pagination. The following design choices made in PRD2 are specifically intended to lower PRD3 friction:

- **Controlled pagination** (`pageIndex` / `pageCount` / `onPageChange`) is already the `DataTable` contract. Switching from client-side to server-side pagination in PRD3 requires only that the caller compute `pageCount` from an API total and move the `pageIndex` reset into the fetch effect — `DataTable` itself does not change.
- **`globalFilter` as a controlled prop** means PRD3 can lift filter state to a URL query parameter or Redux slice without touching `DataTable`.
- **`getRowId` prop** gives PRD3 a stable identity hook for row-level optimistic updates if the feature set expands.
- **Mobile card view isolation** means PRD3 can evolve the mobile layout independently without touching the TanStack layer.
- **`AdminTable` preserved as a wrapper** means any PRD3 admin-side changes can target `AdminTable` or `DataTable` selectively without coordinating a rename across five consumers.
