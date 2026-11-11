---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# PRD2 Meditation Tables — Implementation Plan V04

## Goal

Introduce a shared `DataTable` component and a thin `AdminTable` wrapper, refactor the home meditation list to a proper paginated table, and leave `TableAdminMeditations` column definitions and behavior untouched except for the mechanical extraction of shared primitives.

---

## Source Constraints

- **PRD2**: `docs/20260616_prd2_meditation_tables_plan_v01.md`
- **Accepted PRD1 work**: `docs/20260616_USERNAMES_PLAN_V09.md`, `docs/20260616_USERNAMES_TODO_V05.md`
- **V03 Codex assessment** resolved here: column purity, duration field mapping, DataTable mobile API contract

---

## Resolved Codex Concerns (V03 → V04)

### 1. Admin Table Columns — Untouched

`TableAdminMeditations` existing columns are kept exactly as-is:

| Column | Field |
|---|---|
| ID | `id` |
| Owner | display name via owner relation |
| Visibility | `visibility` |
| Default / Set Default | `isDefault` + action button |
| Status | `status` |
| Listen Count | `listenCount` |
| Length | `durationSeconds` |
| Created | `createdAt` |
| Actions | edit/delete buttons |

The admin table refactor is **mechanical extraction only**: the JSX table shell, pagination controls, and search input move into shared primitives; no column is added, removed, or renamed. The home table's column model does **not** influence admin columns in any way.

### 2. Duration Field Mapping — Canonical

| Column | Field | Scope |
|---|---|---|
| Length | `durationSeconds` | home table, admin table |
| Guidance | `durationSecondsTalking` | home table only |

`durationSeconds` is total audio length. `durationSecondsTalking` is guided speech duration. These two fields are never swapped.

### 3. DataTable Mobile Render API — Concrete Contract

```ts
interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  // --- filtering ---
  globalFilter?: string
  onGlobalFilterChange?: (value: string) => void
  // --- pagination ---
  pageSize?: number
  showPageSizeSelector?: boolean
  // --- optional mobile renderer ---
  renderMobileRow?: (ctx: { row: Row<TData>; item: TData }) => ReactNode
}
```

**Responsive behavior when `renderMobileRow` is provided:**

- `md` and above: standard `<table>` rendered, mobile cards hidden (`hidden md:block` / `md:hidden`)
- Below `md`: `<table>` hidden, mobile cards rendered — one card per row from TanStack's **post-filter, post-sort, post-pagination** `table.getRowModel().rows`
- When `renderMobileRow` is absent: `<table>` always visible, no mobile layer

The home table passes `renderMobileRow`; admin tables do not (they rely on existing horizontal scroll behavior).

---

## Architecture

### New / Modified Files

```
components/
  shared/
    DataTable.tsx          ← new generic primitive
    AdminTable.tsx         ← new thin admin wrapper
  home/
    TableMeditations.tsx   ← new home meditation table (replaces list)
  admin/
    TableAdminMeditations.tsx  ← column defs unchanged; shell migrated to AdminTable
```

---

### `DataTable<TData, TValue>` — Full Contract

```ts
// components/shared/DataTable.tsx

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  globalFilter?: string
  onGlobalFilterChange?: (value: string) => void
  pageSize?: number
  showPageSizeSelector?: boolean        // default false
  renderMobileRow?: (ctx: { row: Row<TData>; item: TData }) => ReactNode
}
```

Internal behavior:

- Uses `useReactTable` with `getCoreRowModel`, `getFilteredRowModel`, `getSortedRowModel`, `getPaginationRowModel`
- Global filter applied via TanStack's built-in `globalFilter` state; controlled from outside when `onGlobalFilterChange` provided
- `pageSize` prop drives `initialState.pagination.pageSize`; cannot be changed by the user unless `showPageSizeSelector` is true
- Pagination controls (prev/next, page indicator) always rendered below the table
- When `renderMobileRow` provided:
  - `<div className="hidden md:block"><table>…</table></div>`
  - `<div className="md:hidden">{table.getRowModel().rows.map(row => renderMobileRow({ row, item: row.original }))}</div>`

---

### `AdminTable<TData, TValue>` — Full Contract

```ts
// components/shared/AdminTable.tsx

interface AdminTableProps<TData, TValue> extends DataTableProps<TData, TValue> {
  title: string
  headerAction?: ReactNode   // e.g. "Create" button
}
```

Renders `title` + optional `headerAction` above a search input, then delegates entirely to `DataTable`. Props forwarded verbatim — no column transformation. `showPageSizeSelector` defaults to `true` at this layer; `pageSize` defaults to 25.

No `renderMobileRow` is passed from admin callers; admin tables are horizontal-scroll on small screens (existing CSS, unchanged).

---

### `TableAdminMeditations` — Migration Only

Existing column definitions array (`columnDefs`) is moved to its own const but otherwise unchanged. The JSX previously rendering `<table>` manually is replaced with:

```tsx
<AdminTable
  title="Meditations"
  headerAction={<CreateMeditationButton />}
  columns={columnDefs}
  data={meditations}
  globalFilter={search}
  onGlobalFilterChange={setSearch}
  pageSize={25}
  showPageSizeSelector
/>
```

No column added or removed. Owner display, Set Default button, Actions column — all preserved exactly.

---

### `TableMeditations` — Home Meditation Table

**Columns (home only):**

| # | Header | Field | Notes |
|---|---|---|---|
| 1 | Title | `title` | Renders `<button>` opening `ModalMeditationDetails`; not a `<Link>` |
| 2 | Created By | `ownerDisplayName` | string |
| 3 | Play | — | `<PlayButton>` inline |
| 4 | Length | `durationSeconds` | formatted mm:ss |
| 5 | Guidance | `durationSecondsTalking` | formatted mm:ss |
| 6 | Favorite | `isFavorited` | optional; shown only when user is authenticated |
| 7 | Listens | `listenCount` | number |

No expand/collapse rows. No max-height inner scroll. No page size selector exposed to user (`showPageSizeSelector` false). Page size fixed at 10. Global filter scoped to title text only (configured via TanStack `columnFilters` on the `title` column, not `globalFilter`, so other columns are not searched).

**Mobile card (`renderMobileRow`):**

```tsx
renderMobileRow={({ item }) => (
  <MeditationCard
    meditation={item}
    onTitleClick={() => openModal(item)}
  />
)}
```

Card layout: Title (button), Created By, Play button, Length, Guidance, optional Favorite, Listens — stacked vertically, full width.

**Search input:** above the table, filters title only, no label beyond placeholder "Search by title…".

---

### `ModalMeditationDetails`

- Triggered by title button click in both desktop table and mobile card
- Receives full meditation row object as prop
- Not a route change; no `<Link>` used for title in any view

---

## Validation Smoke Tests

These are manual checks, not automated tests, since no test infrastructure change is in scope.

| Scenario | Expected |
|---|---|
| Home table desktop (≥ md) | 10 rows, paginated; title search filters; Length shows `durationSeconds`; Guidance shows `durationSecondsTalking` |
| Home table mobile (< md) | Table hidden; cards visible with same 10-row page from TanStack |
| Title click (desktop or mobile) | `ModalMeditationDetails` opens; no navigation |
| Admin meditations desktop | All 8 existing columns present; page size 25; global search works |
| Admin meditations owner column | Owner display name unchanged |
| Admin Set Default button | Fires existing handler unchanged |
| Admin Actions column | Edit/delete unchanged |
| Page size selector | Shown in admin, absent in home |
| `durationSeconds` / `durationSecondsTalking` | Never swapped in any column in any table |

---

## Out of Scope

- No API or database changes
- No new server actions or tRPC routes
- No changes to authentication or authorization logic
- No automated test files
- No admin column additions, renames, or reordering
