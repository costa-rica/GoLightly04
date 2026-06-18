---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# PRD2 Meditation Tables — Implementation Plan V03

## Sources

- PRD2: `docs/20260616_prd2_meditation_tables_plan_v01.md`
- V02 plan: `docs/20260616_MEDITATION_TABLES_PLAN_V02.md`
- Codex assessment: `docs/20260616_MEDITATION_TABLES_PLAN_V02_ASSESSMENT_CODEX.md`
- Accepted PRD1: `docs/20260616_USERNAMES_PLAN_V09.md`, `docs/20260616_USERNAMES_TODO_V05.md`

---

## Scope

No API or database changes. All work is in `web/src/`. This plan depends on PRD1's `createdByUsername` field being present on the meditation type.

---

## Architecture

### Layer 1 — Generic foundation: `DataTable<TData>`

**File:** `web/src/components/tables/DataTable.tsx`

Fully generic TanStack Table wrapper. Public contract:

```ts
interface DataTableProps<TData> {
  columns: ColumnDef<TData>[]
  data: TData[]
  emptyMessage?: string
  filterMode?: 'global' | 'title' | 'none'   // default: 'global'
  pageSize?: number                            // default: 25
}
```

Behavior:
- `filterMode: 'global'` — filter input tests every column value (string coercion); used by admin tables.
- `filterMode: 'title'` — filter input tests only the `title` column accessor; used by the home `TableMeditation`.
- `filterMode: 'none'` — no filter input rendered.
- Page size defaults to 25 for admin; callers may override.
- Placeholder text, column min-widths, and empty-message rendering stay exactly as they are today.
- No expand/collapse rows. No max-height inner scroll on desktop or mobile — the component renders its full row set and lets the page scroll.
- Exports the filtered/sorted/paginated **row model** to its render slot so that the mobile card layout (see Layer 3) can consume the same derived rows.

`DataTable` has no knowledge of meditation columns, routes, or modals.

---

### Layer 2 — Admin meditation table: `TableAdminMeditations`

**File:** `web/src/components/tables/TableAdminMeditations.tsx`

Thin wrapper. Defines meditation-specific `ColumnDef<Meditation>[]` and delegates to `DataTable` with `filterMode="global"` and `pageSize={25}`.

Admin column set (order matches PRD2):

| # | Header | Accessor / render |
|---|--------|-------------------|
| 1 | Title | `title` — plain text cell |
| 2 | Created By | `createdByUsername` — plain text |
| 3 | Play | action button (existing behavior) |
| 4 | Length | `durationSecondsTalking` — formatted mm:ss, sortable |
| 5 | Guidance | `durationSecondsTalking` — same field, guidance-specific display (see note below) |
| 6 | Listens | `listens` or equivalent existing field |
| 7 | Actions | edit / delete controls (existing) |

**Note on Length vs Guidance:** Both derive from `durationSecondsTalking`. "Length" is the total track duration; "Guidance" is the guidance-audio duration. If the existing data model carries a separate guidance field under a different name, use that exact field name as it exists in the codebase — do **not** introduce `guidanceDurationSeconds`. Confirm the real field name before implementation and use it consistently.

`TableAdminMeditations` is the single source of truth for admin column definitions. `AdminTable` never contains meditation column definitions.

---

### Layer 3 — Admin generic shell: `AdminTable<TData>`

**File:** location as it exists today (do not move).

Public contract stays unchanged and fully generic:

```ts
interface AdminTableProps<TData> {
  columns: ColumnDef<TData>[]
  data: TData[]
  emptyMessage?: string
}
```

`AdminTable` passes these props straight through to `DataTable` with `filterMode="global"` and `pageSize={25}`. It adds no meditation-specific logic, no column definitions, and no routing knowledge.

The admin meditations page passes `TableAdminMeditations`-defined columns to `AdminTable` (or calls `TableAdminMeditations` directly — whichever matches the existing admin page pattern). Either way, column definitions never live in `AdminTable`.

---

### Layer 4 — Home meditation table: `TableMeditation`

**File:** `web/src/components/tables/TableMeditation.tsx` (or existing path)

Uses `DataTable` with `filterMode="title"` so the search input filters on title only.

Home column set:

| # | Header | Accessor / render |
|---|--------|-------------------|
| 1 | Title | `title` — **button** that opens `ModalMeditationDetails` (existing modal, existing handler) |
| 2 | Created By | `createdByUsername` |
| 3 | Play | play control |
| 4 | Length | `durationSecondsTalking` |
| 5 | Guidance | guidance duration field (same field-name caveat as admin) |
| 6 | Favorite | optional — only rendered when user is authenticated |
| 7 | Listens | listen count |

Title cell is a `<button>` (or equivalent interactive element) that calls the existing `ModalMeditationDetails` open handler. It is **not** a `<Link>` and does not create a new route.

**Mobile cards:** The mobile layout renders a card per row. It consumes the same filtered/sorted/paginated row model produced by `DataTable` — not a separate data fetch. Each card includes: Title (same button/modal open as desktop), Created By, Play, Length, Guidance, Favorite (if authenticated), Listens. The mobile card view is toggled by the existing responsive breakpoint strategy in the codebase.

---

## Validation

1. `cd web && npm run lint` — no new errors.
2. `cd web && npm run typecheck` — no new type errors.
3. `cd web && npm run build` — clean build.
4. Manual smoke:
   - Home table: search filters by title only; Title cell opens `ModalMeditationDetails`; sorting works on Length and Guidance columns; mobile cards show correct fields including Created By; no inner scroll / no expand-collapse.
   - Admin table: global search filters across all columns; page size 25; empty message renders; sorting on all sortable columns.
   - Authenticated home: Favorite column visible. Unauthenticated home: Favorite column absent.

---

## V02 Codex concerns — resolution checklist

| Concern | Resolution in V03 |
|---------|------------------|
| `AdminTable` received meditation-specific columns | Fixed: `AdminTable<TData>` props are `{ columns, data, emptyMessage? }` only; meditation columns live exclusively in `TableAdminMeditations`. |
| Admin global search vs home title-only search | Fixed: `DataTable` accepts `filterMode: 'global' \| 'title' \| 'none'`; admin uses `'global'`, home uses `'title'`. |
| Invented field `guidanceDurationSeconds` | Fixed: use `durationSecondsTalking` (the existing field) everywhere; confirm exact guidance field name from codebase before writing code. |
| Title cell as `Link` / new route | Fixed: Title cell is a `<button>` opening existing `ModalMeditationDetails`; no new route. |
| Wrong file path for `DataTable` | Fixed: path is `web/src/components/tables/DataTable.tsx`. |
