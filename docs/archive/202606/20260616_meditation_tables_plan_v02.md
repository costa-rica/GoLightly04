---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# PRD2 Implementation Plan V02 — Meditation Table Modernisation

## 1. Background

PRD2 adds a **Created By** column to both the home and admin meditation tables, replaces the expand/collapse show-more pattern with proper pagination, and extracts a shared `DataTable` component. This work depends on PRD1 (username work) having landed and its `createdByUsername` field being present in the meditation API response.

## 2. Changes from V01

All six concerns raised in the Codex assessment of V01 are resolved in this revision:

| # | Concern | Resolution |
|---|---------|-----------|
| 1 | Home search must filter title only, not createdByUsername | Search scope locked to `title` accessor only on home page |
| 2 | Column spec was incomplete; existing behaviors not enumerated | Full 7-column home spec with all preserved behaviors in §6.1 |
| 3 | Expand/collapse and inner scroll must be explicitly removed | Removed entirely in §8; no conditional display, no max-h |
| 4 | DataTable/AdminTable contract was too vague | Concrete TypeScript-style interfaces in §5.1 and §5.2 including sorting |
| 5 | Mobile cards not tied to shared TanStack row model | `renderMobileRow` receives `Row<TData>` from post-filter/sort/paginated model |
| 6 | Validation lacked sorting smoke tests | §11.3 adds smoke tests for all sortable columns and verifies non-sortable columns |

All open decisions from V01 are now closed:

| Decision | Resolution |
|----------|-----------|
| Keep AdminTable wrapper | Yes |
| Home page size | 10 |
| Page-size selector | No |
| API/DB changes | None |
| PRD1 files | Not altered; no low-risk gap identified |

## 3. Scope

**In scope**
- New shared `DataTable<TData>` component with internal sort, filter, and pagination state
- `AdminTable` refactored as thin wrapper around `DataTable`
- Home page meditation table migrated to `DataTable`
- Both tables gain a **Created By** column
- Expand/collapse pattern removed; replaced with pagination
- All inner `max-h-[360px]` scroll removed from home and admin

**Out of scope**
- No API or DB changes
- No PRD1 changes
- No page-size selector UI
- No changes to individual meditation page, audio player logic, or auth flow
- No changes to routing or URL structure

## 4. PRD Dependencies

PRD2 requires PRD1 to be merged. PRD1 adds `createdByUsername` to the meditation API response payload. This plan does not modify any PRD1 files. Phase 1 (DataTable build) is independent of PRD1 and may proceed in parallel; Phases 2 and 3 are blocked until PRD1 is merged.

## 5. Component Contracts

### 5.1 DataTable

`DataTable` is a generic, self-contained component. It owns filter, sort, and pagination state internally and renders both desktop and mobile views from a single TanStack Table row model, guaranteeing mobile/desktop parity.

```typescript
interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];

  // Pagination — page size is fixed, no selector rendered
  pageSize?: number;              // default: 10

  // Filter
  filterMode?: 'title' | 'none'; // default: 'title'
  searchPlaceholder?: string;     // default: 'Search…'

  // Layout
  minWidthClassName?: string;     // applied to inner <table>; e.g. 'min-w-[700px]'

  // Mobile
  renderMobileRow: (row: Row<TData>) => ReactNode;
}
```

**Sorting**: Each `ColumnDef` declares `enableSorting: true` or `enableSorting: false`. Clicking a sortable column header cycles `asc → desc → unsorted`. Non-data columns (Play, Favorite, admin actions) must set `enableSorting: false` and render no sort affordance (no arrow icon, no cursor-pointer on header).

**Filter**: When `filterMode` is `'title'`, the search input is bound to TanStack's column filter on the `title` accessor using the `includesString` filter function (case-insensitive substring, deterministic). `filterMode: 'none'` hides the search input entirely.

**Pagination**: `pageSize` is fixed at construction time; no selector is rendered. Prev/next controls appear below the table. Page index resets to 0 whenever filter or sort state changes.

**Mobile/desktop split**: The desktop `<table>` element is hidden at or below the `md` breakpoint (e.g., `hidden md:table`). The mobile card list is shown below `md` (e.g., `md:hidden`). Both consume `table.getRowModel().rows` — the same post-filter, post-sort, post-paginated row array — so mobile always matches desktop state exactly. `renderMobileRow` receives the full `Row<TData>` object; callers can access `row.getValue('columnId')` or `row.original` as needed.

**No inner overflow**: `DataTable` must not apply `max-h`, `overflow-y: auto`, or any scroll constraint to its own container or inner table wrapper. Height is bounded by the page-size limit.

### 5.2 AdminTable

`AdminTable` remains a thin wrapper around `DataTable` to preserve backward compatibility with all existing callers. No caller signature changes are required.

```typescript
interface AdminTableProps {
  meditations: MeditationRow[];    // existing prop name preserved
  onEdit: (id: string) => void;    // existing
  onDelete: (id: string) => void;  // existing
  // All other existing admin props preserved as-is
}
```

Internally, `AdminTable`:
- Builds the 9-column `ColumnDef[]` (§6.2) including Edit and Delete action columns
- Calls `<DataTable data={meditations} columns={...} pageSize={20} filterMode="title" minWidthClassName="min-w-[900px]" renderMobileRow={...} />`
- Owns no sort, filter, or pagination state itself — all delegated to `DataTable`

## 6. Column Specification

### 6.1 Home Page Table

Seven columns, ordered left to right:

| # | Column | Accessor | Sortable | Preserved Behaviour |
|---|--------|----------|----------|---------------------|
| 1 | Title | `title` | Yes | Clickable link navigating to the meditation detail page |
| 2 | Created By | `createdByUsername` | Yes | New column; plain text display |
| 3 | Play | — | No | Renders `AudioPlayer` component; preserves in-flight/loading spinner and failed/error states |
| 4 | Length | `durationSeconds` | Yes | Display formatted as `mm:ss`; sorts numerically by raw seconds |
| 5 | Guidance | `guidanceDurationSeconds` | Yes | Dot indicator preserved; help tooltip preserved; sorts by raw guidance seconds ascending |
| 6 | Favorite | — | No | Auth-gated: renders toggle for authenticated users; renders empty/locked state for unauthenticated. Existing gate logic and toggle callback preserved |
| 7 | Listens | `listenCount` | Yes | Numeric display; sorts numerically |

### 6.2 Admin Page Table

Inherits all 7 home columns, plus two action columns:

| # | Column | Accessor | Sortable | Notes |
|---|--------|----------|----------|-------|
| 8 | Edit | — | No | Existing admin edit action; fires `onEdit(id)` |
| 9 | Delete | — | No | Existing admin delete action; fires `onDelete(id)` |

## 7. Search Behaviour

- **Home**: search input filters the `title` column only (`filterMode="title"`). This matches current home behaviour exactly and is not a scope change. Entering a creator's username in the search box will not filter by username.
- **Admin**: search input filters the `title` column only (`filterMode="title"`).
- Filter function: `includesString` (TanStack built-in) — case-insensitive substring match, no fuzzy matching.

## 8. Layout Changes: Remove Expand/Collapse and Inner Scroll

### 8.1 What is removed

The following must be deleted from the home page component:

- `showAll` / `expanded` boolean state variable
- The "Show more" / "Show less" toggle button element
- The conditional header/gate that hides the table until the user clicks
- All `max-h-[360px]` CSS classes on the home table container on desktop
- All `max-h-[360px]` CSS classes on the mobile card container on home
- Any equivalent `max-h` or `overflow-y: auto` inner scroll wrappers on the admin table

### 8.2 What replaces it

Pagination controls (prev/next buttons, page indicator) below the table bound the visible row count to `pageSize` rows. The table and mobile cards are **always rendered on page load** — no conditional display, no user interaction required to see content. The overall page may scroll normally; there is no inner scroll region within the table.

## 9. Mobile Strategy

Mobile cards are rendered inside `DataTable` via `renderMobileRow`. The prop signature is:

```typescript
renderMobileRow: (row: Row<TData>) => ReactNode
```

Because `row` comes from `table.getRowModel().rows` — the same post-filter, post-sort, post-paginated array used for desktop — mobile parity is guaranteed structurally, not by convention. If desktop shows 10 rows matching the search term sorted by title ascending, mobile shows the identical 10 rows in the identical order.

The home page `renderMobileRow` implementation must include all of: Title (clickable link), Created By, Play (AudioPlayer), Length, Guidance dot, Favorite toggle (auth-gated), Listens.

The admin `renderMobileRow` (inside `AdminTable`) must additionally include Edit and Delete actions.

## 10. Implementation Phases

### Phase 1 — Build DataTable (no PRD1 dependency)

Files created:
- `components/DataTable.tsx`
- `components/DataTable.test.tsx`

Checklist:
- [ ] Confirm or install `@tanstack/react-table`; use existing version if already present
- [ ] Implement `DataTable` generic component per §5.1 interface
- [ ] `useReactTable` with `getCoreRowModel`, `getFilteredRowModel`, `getSortedRowModel`, `getPaginationRowModel`
- [ ] Search input bound to title column filter when `filterMode='title'`; hidden when `filterMode='none'`
- [ ] Sort toggling on sortable headers (`asc → desc → unsorted`); no affordance on non-sortable headers
- [ ] Pagination prev/next controls; page index resets on filter or sort change
- [ ] Desktop `<table>` hidden below `md`; mobile card list hidden at or above `md`
- [ ] Mobile card list iterates same `table.getRowModel().rows` and calls `renderMobileRow`
- [ ] No `max-h` or inner overflow applied by the component
- [ ] `minWidthClassName` applied to inner `<table>` when provided

### Phase 2 — Home Page Migration (requires PRD1)

Files modified: home page component (table section)

Checklist:
- [ ] Remove `showAll` state, toggle button, and header gate
- [ ] Remove all `max-h-[360px]` and inner overflow CSS from table and card containers
- [ ] Build 7-column `ColumnDef[]` per §6.1
- [ ] Title column: `cell` renders `<Link>` to meditation page; `enableSorting: true`
- [ ] Created By column: `cell` renders `row.getValue('createdByUsername')`; `enableSorting: true`
- [ ] Play column: `cell` renders `AudioPlayer`; `enableSorting: false`; `header` renders without sort affordance
- [ ] Length column: `cell` formats seconds to `mm:ss`; `accessorFn` or `accessorKey: 'durationSeconds'`; `enableSorting: true`
- [ ] Guidance column: `cell` renders dot + tooltip; `accessorKey: 'guidanceDurationSeconds'`; `enableSorting: true`
- [ ] Favorite column: `cell` renders auth-gated toggle; `enableSorting: false`
- [ ] Listens column: `accessorKey: 'listenCount'`; `enableSorting: true`
- [ ] Implement `renderMobileRow` including all 7 column values
- [ ] Mount `<DataTable data={meditations} columns={homeCols} pageSize={10} filterMode="title" searchPlaceholder="Search meditations…" renderMobileRow={...} />`
- [ ] Verify AudioPlayer in-flight and failed states still render correctly
- [ ] Verify guidance tooltip still accessible

### Phase 3 — Admin Table Migration (requires PRD1)

Files modified: `AdminTable` component

Checklist:
- [ ] Audit all import sites of `AdminTable` to confirm no undocumented props
- [ ] Refactor `AdminTable` to thin wrapper per §5.2
- [ ] Build 9-column `ColumnDef[]` (home columns + Edit + Delete); action columns use `enableSorting: false`
- [ ] Implement `renderMobileRow` for admin including Edit and Delete
- [ ] Remove any inner scroll from admin table wrapper
- [ ] Confirm `onEdit` and `onDelete` callbacks still fire correctly
- [ ] Confirm no callers require signature changes

## 11. Validation Plan

### 11.1 Column Render Tests

| Test | Expected |
|------|----------|
| Title renders as clickable link | `<a>` or `<Link>` wraps title text |
| AudioPlayer renders in Play cell | Component present for meditation with audio file |
| AudioPlayer shows failed state | Error indicator renders when audio URL is invalid |
| Guidance dot present | Dot element renders for meditations with guidance duration > 0 |
| Guidance help tooltip | Tooltip text visible on hover or focus |
| Favorite hidden for unauthenticated user | No toggle rendered when user is not logged in |
| Favorite toggle for authenticated user | Toggle renders and fires callback when user is logged in |
| Listens count present | Numeric value rendered in Listens cell |
| Created By present | `createdByUsername` value rendered in Created By cell |

### 11.2 Search Tests

| Test | Expected |
|------|----------|
| Search by title substring | Rows matching title substring shown; non-matching rows hidden |
| Search does not match on username | Entering a string present only in Created By (not in Title) returns zero matching rows |
| Clear search | All rows up to pageSize restored |
| Search resets to page 1 | After typing in search, page index returns to first page |

### 11.3 Sorting Smoke Tests

| Column | Action | Expected |
|--------|--------|----------|
| Title | Click header once | Rows sorted A→Z by title |
| Title | Click header twice | Rows sorted Z→A by title |
| Title | Click header three times | Rows unsorted (original order) |
| Created By | Click header once | Rows sorted A→Z by createdByUsername |
| Created By | Click header twice | Rows sorted Z→A by createdByUsername |
| Length | Click header once | Rows sorted shortest→longest by durationSeconds |
| Length | Click header twice | Rows sorted longest→shortest |
| Guidance | Click header once | Rows sorted by guidanceDurationSeconds ascending |
| Guidance | Click header twice | Rows sorted by guidanceDurationSeconds descending |
| Listens | Click header once | Rows sorted fewest→most by listenCount |
| Listens | Click header twice | Rows sorted most→fewest |
| Play | Click header | No sort change; no sort indicator rendered on header |
| Favorite | Click header | No sort change; no sort indicator rendered on header |
| Edit (admin) | Click header | No sort change; no sort indicator rendered on header |
| Delete (admin) | Click header | No sort change; no sort indicator rendered on header |

### 11.4 Pagination Tests

| Test | Expected |
|------|----------|
| Home shows at most 10 rows per page | Row count ≤ 10 when data exceeds 10 items |
| Admin shows at most 20 rows per page | Row count ≤ 20 when data exceeds 20 items |
| Next button disabled on last page | Button is disabled or hidden when on last page |
| Prev button disabled on first page | Button is disabled or hidden when on first page |
| Sort change resets to page 1 | After clicking a sort header, page index returns to first page |
| Filter change resets to page 1 | After typing in search, page index returns to first page |
| No page-size selector rendered | No dropdown or control for changing page size present in DOM |

### 11.5 Layout and Scroll Regression Tests

| Test | Expected |
|------|----------|
| No expand/collapse button on home | Toggle button absent from DOM |
| No `max-h-[360px]` on home table container | Class absent from table wrapper element |
| No `max-h-[360px]` on home mobile card container | Class absent from card list wrapper element |
| Table visible on page load without interaction | Table rows render immediately without any user click |
| Mobile cards visible on page load without interaction | Cards render on mobile viewport without any user click |
| No inner overflow-y scroll on admin table | No `overflow-y: auto` or `overflow-y: scroll` on table wrapper |

### 11.6 Mobile Parity Tests

| Test | Expected |
|------|----------|
| Search on mobile hides non-matching cards | Cards reflect same filter result as desktop |
| Sort on mobile reorders cards | Cards reflect same sort order as desktop |
| Mobile page navigation matches desktop | Mobile shows same page of rows as desktop at same time |
| Mobile card includes Created By | createdByUsername value visible in mobile card |
| Mobile card includes Play | AudioPlayer visible in mobile card |
| Mobile card includes Favorite (auth-gated) | Toggle visible for authenticated user in mobile card |

## 12. Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| PRD1 not merged when Phase 2/3 starts | Medium | Phase 1 (DataTable) is independent; hard-block Phase 2 on PRD1 merge |
| `createdByUsername` absent from API response at runtime | Low | PRD1 explicitly adds this field; verify presence in Phase 2 integration test |
| AudioPlayer remounts on each render causing playback reset | Low | Assign stable `key` prop derived from meditation id to AudioPlayer |
| TanStack table version conflict with existing usage | Low | Check `package.json` before installing; use existing version if present |
| Undocumented `AdminTable` props broken by wrapper refactor | Low | Audit all import sites in Phase 3 before modifying the component |
| Mobile card layout regression from removing max-h | Low | Screenshot/visual test mobile viewport before and after |
