---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Plan: Meditation tables modernization (PRD 2)

## Overview

Rebuild the home page meditation table (`web/src/components/tables/TableMeditation.tsx`)
on TanStack Table so it is sortable by column header, searchable by title,
paginated, and always displayed (no inner fixed-height scroll, no
expand/collapse). Add a "Created By" column backed by the `createdByUsername`
field introduced in [PRD 1](20260616_prd1_usernames_plan_v01.md). Do this by
lifting the existing admin table into a shared, configurable TanStack component
so both the home table and the admin tables share one implementation.

This is the second of three PRDs:

- **PRD 1** — usernames + `createdByUsername` in the meditation API (dependency).
- **PRD 2 (this plan)** — modernize the home meditation table.
- **PRD 3** — admin page split + meditation taxonomy
  ([20260616_prd3_admin_split_and_taxonomy_plan_v01.md](20260616_prd3_admin_split_and_taxonomy_plan_v01.md)).

Affected package: `web` only. **Depends on PRD 1** for the Created By data.

### In scope

- Shared TanStack table component (generalized from the existing `AdminTable`).
- Refactor `TableMeditation` to use it: sortable headers, title search,
  pagination, always-on display.
- New "Created By" column rendering `createdByUsername`.
- Preserve all existing `TableMeditation` behavior: clickable title → details
  modal, audio player cell, in-flight/failed states, favorite toggle
  (authenticated only), guidance dot, listens, length, polling, and the mobile
  card view.

### Out of scope

- `type`/`subtype` columns or editing (PRD 3; admin-only).
- Any API or DB change (`createdByUsername` arrives via PRD 1).
- Changing the admin tables' behavior beyond what the shared-component
  extraction requires (admin tables already sort/search/paginate).

## Current state (what we are replacing)

- `TableMeditation.tsx` (~655 lines) is a hand-rolled `<table>` with:
  - an expand/collapse section wrapper and a `max-h-[360px]` inner scroll
    container (both to be removed per requirements),
  - custom cells: title button, `AudioPlayer`, guidance color dot, favorite
    star (rendered only when `isAuthenticated`), listens, length,
  - a separate **mobile card view** (`block md:hidden`),
  - loading skeleton, error+retry, polling for in-flight meditations,
  - Redux-sourced rows (`state.meditation.meditations`) with an `isOwned` flag.
- `AdminTable.tsx` already wraps TanStack with `getSortedRowModel`,
  `getFilteredRowModel`, `getPaginationRowModel`, a global filter, sort
  indicators, prev/next pagination, and a `min-w-[960px]` scroll container. It
  is consumed by `TableAdminMeditations`, `TableAdminUsers`, etc.

## Approach

### 1. Extract a shared table component

Generalize `AdminTable` into a reusable table (e.g. `web/src/components/tables/DataTable.tsx`)
that supports what both surfaces need. New/!configurable props beyond today's
`columns`/`data`/`emptyMessage`:

- `searchPlaceholder` and a **filter mode**: either the current
  search-all-columns global filter (admin default) or a **single-column filter**
  (home table filters on `title` only, per the requirement).
- `pageSize` (admin uses 25; home can use a smaller page size — open decision).
- `minWidthClassName` (admin uses `min-w-[960px]`; the home table is narrower).
- Optional `renderMobileRow(row)` so a caller can supply the card layout used
  below `md`; when provided, the component renders the table at `md+` and the
  card list below `md`. This keeps the home table's responsive behavior without
  forcing it on admin tables (which pass nothing and keep desktop-only).

`AdminTable` is then either replaced by `DataTable` at its call sites or kept as
a thin wrapper that delegates to `DataTable` with admin defaults — preferred:
re-point the admin tables at `DataTable` and delete `AdminTable` to avoid two
implementations. (Open decision: replace vs. wrap.)

Title-only filtering uses a column filter on the `title` column (e.g.
`getColumnCanGlobalFilter`/`columnFilters`, or a `globalFilterFn` that reads
only `row.original.title`). The simplest fit with the existing pattern is a
`globalFilterFn` variant that, in single-column mode, matches against just the
configured field.

### 2. Define `TableMeditation` columns

Build a `ColumnDef<Meditation>[]` mirroring today's cells:

| Column | accessor | cell | sortable | notes |
| --- | --- | --- | --- | --- |
| Title | `title` | clickable button → details modal | yes | also the search field |
| Created By | `createdByUsername` | text (fallback `—`) | yes | **new**, from PRD 1 |
| Play | n/a (`id: "play"`) | `AudioPlayer` / in-flight / failed states | no | |
| Length | `durationSeconds` | `formatDurationOrDash` | yes | |
| Guidance | `durationSecondsTalking` | guidance color dot + tooltip | yes (by seconds) | keep `HeaderHelp` tooltip |
| Favorite | `isFavorite` | star toggle | optional | column only when `isAuthenticated` |
| Listens | `listenCount` | number | yes | keep `HeaderHelp` |

`HeaderHelp` and the guidance/format helpers move with the component (or into a
small shared module) — no behavior change.

### 3. Keep the surrounding behavior

- Data still comes from Redux (`fetchMeditations`, `setMeditations`, polling,
  `isOwned`) — unchanged; only the presentation layer changes.
- Remove the expand/collapse wrapper and the `max-h-[360px]` inner scroll so the
  table is always shown and grows with content (pagination bounds the height).
- Details modal, favorite handler, update/delete/regenerate handlers, toast —
  unchanged.
- Mobile card view: pass the existing card markup via `renderMobileRow` (or keep
  a parallel card list driven by the same `table.getRowModel().rows` so search
  + pagination + sort apply consistently across both layouts).

## Key files

| File | Change |
| --- | --- |
| `web/src/components/tables/DataTable.tsx` | new shared TanStack table (from `AdminTable`) |
| `web/src/components/tables/AdminTable.tsx` | replaced by / delegated to `DataTable` |
| `web/src/components/tables/TableAdminMeditations.tsx` (+ other `TableAdmin*`) | re-point to `DataTable` |
| `web/src/components/tables/TableMeditation.tsx` | rebuilt on `DataTable`; new Created By column; drop scroll/expand |
| `web/src/lib/utils/formatters.ts` | reuse `formatDurationOrDash` (no change expected) |

## Risks / edge cases

- **Regression surface**: `TableMeditation` carries a lot of bespoke behavior
  (polling, in-flight/failed cells, favorites gated by auth, mobile cards). The
  refactor must preserve each; this is the main risk.
- **Sorting custom cells**: sort must key off the underlying value
  (`durationSeconds`, `durationSecondsTalking`, `listenCount`,
  `createdByUsername`), not rendered markup.
- **Search semantics**: requirement is title-only filtering on the home table —
  do not reuse the admin "search all columns" filter there.
- **Admin tables**: if `AdminTable` is replaced, verify every admin table
  (`Users`, `SoundsFiles`, `Meditations`, `Queuer`, `Database`) still renders,
  sorts, and paginates identically.
- **Created By for system/imported meditations**: rows whose owner has no
  username (should not happen post-PRD-1 backfill) render a `—` fallback.
- **PRD 1 ordering**: until PRD 1 ships, `createdByUsername` is absent; the
  column would show `—`. Land PRD 1 first.

## Open decisions for the operator

1. Replace `AdminTable` with `DataTable` outright vs. keep `AdminTable` as a thin
   wrapper.
2. Home table page size (e.g. 10/15/25).
3. Whether the home table should expose a page-size selector or keep prev/next
   only (admin currently is prev/next only).

## Verification (per phase, during the todo)

`web` has no test runner; checks are lint + typecheck + build.

- `npm run lint`, `npm run typecheck`, `npm run build` in `web/`.
- Manual: home table sorts on each sortable header; title search filters rows;
  pagination works; table is always visible with no inner scrollbar; Created By
  shows usernames; audio playback, favorites (logged in), details modal,
  in-flight/failed states, and the mobile card layout all still work; admin
  tables unchanged.
