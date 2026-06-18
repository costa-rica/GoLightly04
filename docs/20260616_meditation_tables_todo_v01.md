---
created_at: 2026-06-18
updated_at: 2026-06-18
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# PRD2 Meditation Tables — Implementation TODO V01

Aligned to: `docs/20260616_meditation_tables_plan_v06.md`
Depends on completed PRD1: `docs/20260616_usernames_plan_v09.md` and `docs/20260616_usernames_todo_v05.md`
Source PRD: `docs/20260616_prd2_meditation_tables_plan_v01.md`

## Global rules for implementers

- [ ] Do not begin PRD2 implementation until PRD1 is implemented and the web/shared types include `Meditation.createdByUsername?: string | null` from the accepted usernames work.
- [ ] Implement only PRD2 table UI work in the `web` package. Do not make API, database, migration, authentication, authorization, or shared-type changes except consuming PRD1's already-existing `createdByUsername` type.
- [ ] Preserve the existing architecture and file locations. Use only these target table files unless a nearby type/helper edit is mechanically necessary:
  - [ ] `web/src/components/tables/DataTable.tsx` — new shared generic table primitive.
  - [ ] `web/src/components/tables/AdminTable.tsx` — compatibility wrapper around `DataTable`.
  - [ ] `web/src/components/tables/TableAdminMeditations.tsx` — preserve current admin meditation columns/behavior.
  - [ ] `web/src/components/tables/TableMeditation.tsx` — move the home meditation presentation onto `DataTable`.
- [ ] Do not create a new parallel hierarchy such as `components/shared/*`, `components/home/*`, or `components/admin/*`.
- [ ] Do not rename `TableMeditation.tsx` to a plural `TableMeditations.tsx`.
- [ ] Keep existing non-table behavior in `TableMeditation`: Redux data flow, fetching, polling, loading/error states, modal details, audio playback, favorite toggle, update/delete/regenerate handlers, and toast behavior.
- [ ] Use the PRD1 field `createdByUsername` directly. Do not introduce or depend on `ownerDisplayName`.
- [ ] After each phase: update this checklist or implementation notes, run the listed validation, inspect `git diff`, stage only the phase's intended files, and commit with a focused message.

---

## Phase 0 — Prerequisite and baseline discovery

### 0A. Confirm dependency and current state

- [ ] Confirm PRD1 is present in the branch before making PRD2 changes:
  - [ ] `shared-types` meditation type includes `createdByUsername?: string | null`.
  - [ ] API serialization already provides flat `createdByUsername` for meditation rows.
  - [ ] `TableMeditation.tsx` receives meditation rows whose type can expose `createdByUsername`.
- [ ] Inspect current table files before editing:
  - [ ] `web/src/components/tables/AdminTable.tsx`.
  - [ ] `web/src/components/tables/TableAdminMeditations.tsx`.
  - [ ] `web/src/components/tables/TableMeditation.tsx`.
- [ ] Record current admin meditation columns before modifying anything and verify they are exactly:
  1. `ID`
  2. `Title`
  3. `Owner`
  4. `Visibility`
  5. `Default`
  6. `Status`
  7. `Listen Count`
  8. `Length`
  9. `Created`
  10. `Actions`
- [ ] Inspect the current `HeaderHelp` implementation/usage in `TableMeditation.tsx` so sorting can be added without nested interactive controls.
- [ ] Inspect any existing TanStack table imports/patterns so the new `DataTable` is extracted from current `AdminTable` behavior rather than implemented as an unrelated second table system.

### 0B. Baseline validation

- [ ] Run from repo root:
  ```sh
  npm run build:shared
  npm run typecheck -w @golightly/web
  ```
- [ ] If the branch has known pre-existing web issues, document them before PRD2 edits so new failures can be distinguished from baseline failures.
- [ ] Commit nothing for Phase 0 unless documentation notes are intentionally added. If committed, suggested message: `docs: record meditation table baseline`.

---

## Phase 1 — Create shared `DataTable` primitive

### 1A. Add `web/src/components/tables/DataTable.tsx`

- [ ] Create `web/src/components/tables/DataTable.tsx` as a generic TanStack table primitive extracted from the existing admin table behavior.
- [ ] Import/use TanStack pieces needed for filtering, sorting, pagination, and row rendering, including repo-appropriate equivalents of:
  - [ ] `ColumnDef`.
  - [ ] `Row`.
  - [ ] `SortingState`.
  - [ ] `ColumnFiltersState`.
  - [ ] `useReactTable`.
  - [ ] `getCoreRowModel()`.
  - [ ] `getFilteredRowModel()`.
  - [ ] `getSortedRowModel()`.
  - [ ] `getPaginationRowModel()`.
  - [ ] `flexRender()`.
- [ ] Define a local filter mode type:
  ```ts
  type FilterMode = "global" | "column" | "none";
  ```
- [ ] Define `DataTableProps<TData, TValue = unknown>` with this contract:
  ```ts
  type DataTableProps<TData, TValue = unknown> = {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    emptyMessage?: string;

    filterMode?: FilterMode;
    filterColumnId?: string;
    filterValue?: string;
    onFilterValueChange?: (value: string) => void;
    defaultFilterValue?: string;
    searchPlaceholder?: string;
    showSearch?: boolean;

    sorting?: SortingState;
    onSortingChange?: (sorting: SortingState) => void;
    defaultSorting?: SortingState;
    enableSorting?: boolean;

    pageSize?: number;
    showPagination?: boolean;
    showPageSizeSelector?: boolean;
    pageSizeOptions?: number[];

    minWidthClassName?: string;
    tableClassName?: string;
    wrapperClassName?: string;

    renderMobileRow?: (ctx: { row: Row<TData>; item: TData }) => React.ReactNode;
  };
  ```
- [ ] Keep defaults compatible with existing admin behavior:
  - [ ] `filterMode` defaults to `"global"`.
  - [ ] `searchPlaceholder` defaults to `"Search table..."`.
  - [ ] `showSearch` defaults to `filterMode !== "none"`.
  - [ ] `enableSorting` defaults to `true`.
  - [ ] `pageSize` defaults to `25`.
  - [ ] `showPagination` defaults to `true`.
  - [ ] `showPageSizeSelector` defaults to `false`.
  - [ ] `minWidthClassName` defaults to `"min-w-[960px]"`.
- [ ] Preserve the current admin shell style as closely as possible: search input placement, horizontal scroll behavior, table markup classes, empty-message row, pagination controls, and page label.

### 1B. Filtering behavior

- [ ] Implement controlled/uncontrolled filter value support:
  - [ ] Controlled mode when `filterValue` and/or `onFilterValueChange` are supplied.
  - [ ] Uncontrolled internal state initialized from `defaultFilterValue ?? ""`.
- [ ] For `filterMode="global"`:
  - [ ] Wire the search input to TanStack global filter state.
  - [ ] Preserve broad admin search semantics equivalent to current `Object.values(row.original).join(" ")` matching.
  - [ ] Ensure admin search still matches across existing serializable row values.
- [ ] For `filterMode="column"`:
  - [ ] Require `filterColumnId` and wire the search input to that column's filter value only.
  - [ ] Prefer a development-time guard/error if `filterColumnId` is missing; do not silently fall back to global filtering.
  - [ ] Ensure this mode can be used by home with `filterColumnId="title"` so Created By, Length, Guidance, and Listens are not searched.
- [ ] For `filterMode="none"`:
  - [ ] Do not render search by default.
  - [ ] Do not wire global or column filter state.
- [ ] When search/filter value changes, reset to the first page unless TanStack already does this correctly through its state handling.

### 1C. Sorting behavior and header accessibility

- [ ] Include `getSortedRowModel()` in `useReactTable`.
- [ ] Implement sorting state that is controlled when `sorting`/`onSortingChange` are provided and internal otherwise, initialized from `defaultSorting ?? []`.
- [ ] Respect `enableSorting={false}` at the table level and per-column `enableSorting: false` for action/control columns.
- [ ] Render sort indicators equivalent to the current admin behavior:
  - [ ] Ascending: `▲`.
  - [ ] Descending: `▼`.
  - [ ] Unsorted but sortable: `↕`.
- [ ] For non-sortable headers, render header content directly or in a non-interactive wrapper with no sort click handler.
- [ ] For sortable headers, do not blindly wrap `flexRender(header.column.columnDef.header, header.getContext())` in a sorting `<button>`.
- [ ] Implement an accessibility-safe header rendering contract:
  - [ ] The sorting affordance is a distinct interactive control, such as a `<button type="button">`, that toggles only sorting.
  - [ ] Any `HeaderHelp` or tooltip trigger remains outside the sort button as a sibling or otherwise separate control.
  - [ ] No `<button>` is nested inside another `<button>`.
  - [ ] No interactive help control is nested inside the sort button.
  - [ ] Clicking or keyboard-activating help controls must not toggle sorting.
  - [ ] Expose sort state accessibly via `aria-sort` on the `<th>` and/or an accessible sort button label such as `Sort by Length, currently ascending`.
- [ ] If a custom home header layout is needed for `HeaderHelp`, support it without violating the no-nested-interactive-controls rule. Do not remove `HeaderHelp` and do not disable sorting for Length, Guidance, or Listens as a workaround.

### 1D. Pagination and mobile row behavior

- [ ] Include `getPaginationRowModel()` in `useReactTable`.
- [ ] Set initial page size from the `pageSize` prop.
- [ ] Render Previous/Next controls and a page label when `showPagination !== false`.
- [ ] Do not render a page-size selector unless `showPageSizeSelector` is explicitly true.
- [ ] If a selector is rendered, update TanStack pagination state; do not slice data outside the table.
- [ ] When `renderMobileRow` is absent, preserve admin behavior: show the regular table with horizontal scroll on small screens.
- [ ] When `renderMobileRow` is present:
  - [ ] At `md` and above, show the normal table.
  - [ ] Below `md`, hide the table and render mobile cards.
  - [ ] Generate mobile cards from `table.getRowModel().rows`.
  - [ ] Pass both `row` and `row.original` as `{ row, item }` to `renderMobileRow`.
  - [ ] Do not render cards from raw `data`, a separately filtered list, or an independently sliced array.

### 1E. Phase 1 validation and commit

- [ ] Run from repo root:
  ```sh
  npm run build:shared
  npm run typecheck -w @golightly/web
  npm run build -w @golightly/web
  ```
- [ ] If lint is stable for this repo/branch, run:
  ```sh
  npm run lint -w @golightly/web
  ```
- [ ] Manually inspect generated header markup in browser dev tools or React output for a sample sortable column and confirm no nested buttons are produced by `DataTable` itself.
- [ ] Commit only the new `DataTable` primitive and any mechanical imports/types needed for it. Suggested message: `feat: add shared data table primitive`.

---

## Phase 2 — Convert `AdminTable` to compatibility wrapper

### 2A. Preserve the public `AdminTable` caller contract

- [ ] Update `web/src/components/tables/AdminTable.tsx` so it becomes a thin wrapper around `DataTable`.
- [ ] Preserve the current caller contract exactly; existing callers must still compile with only:
  ```ts
  type AdminTableProps<TData> = {
    columns: ColumnDef<TData>[];
    data: TData[];
    emptyMessage?: string;
  };
  ```
- [ ] Do not require existing admin callers to provide filter, sorting, pagination, or layout props.
- [ ] If optional new `DataTable` props are exposed through `AdminTable`, make them optional and non-breaking.
- [ ] Do not transform, wrap, add, remove, or reorder admin columns in `AdminTable`; pass `columns` through verbatim.

### 2B. Apply admin defaults through `DataTable`

- [ ] Call `DataTable` with admin-compatible defaults:
  ```tsx
  <DataTable
    columns={columns}
    data={data}
    emptyMessage={emptyMessage ?? "No records found."}
    filterMode="global"
    searchPlaceholder="Search table..."
    pageSize={25}
    showPagination
    showPageSizeSelector={false}
    minWidthClassName="min-w-[960px]"
  />
  ```
- [ ] Preserve existing admin global search behavior.
- [ ] Preserve existing admin page size of 25.
- [ ] Preserve existing admin horizontal-scroll/min-width behavior.
- [ ] Preserve existing admin empty-state behavior.

### 2C. Phase 2 validation and commit

- [ ] Run from repo root:
  ```sh
  npm run build:shared
  npm run typecheck -w @golightly/web
  npm run build -w @golightly/web
  ```
- [ ] If lint is stable, run `npm run lint -w @golightly/web`.
- [ ] Manually smoke an admin table that uses `AdminTable`:
  - [ ] Existing caller compiles without new props.
  - [ ] Search input placeholder is still `Search table...`.
  - [ ] Global search still matches broad row values.
  - [ ] Pagination still uses 25 rows by default.
  - [ ] Horizontal scroll/min-width behavior remains compatible.
- [ ] Commit only the wrapper conversion. Suggested message: `refactor: wrap admin tables with data table`.

---

## Phase 3 — Preserve `TableAdminMeditations`

### 3A. Confirm and protect exact columns

- [ ] Update `web/src/components/tables/TableAdminMeditations.tsx` only as needed for compatibility with the `AdminTable`/`DataTable` extraction.
- [ ] Preserve exactly 10 columns in this order:
  1. `ID`
  2. `Title`
  3. `Owner`
  4. `Visibility`
  5. `Default`
  6. `Status`
  7. `Listen Count`
  8. `Length`
  9. `Created`
  10. `Actions`
- [ ] Do not add taxonomy, type/subtype, PRD3, or admin split columns.
- [ ] Do not drop the admin meditation `Title` column.
- [ ] Do not rename `Owner` to `Created By`; PRD2's `Created By` addition is for the home meditation table.

### 3B. Preserve cell behavior

- [ ] `Owner` still renders from the current admin fields: `ownerEmail ?? ownerUserId ?? "Unknown"`.
- [ ] `Default` keeps the current default/hidden label and styling behavior.
- [ ] `Status` keeps the current fallback `status ?? "pending"`.
- [ ] `Listen Count` continues to use the current listen-count value.
- [ ] `Length` continues to use `durationSeconds` and `formatDurationOrDash`.
- [ ] `Created` continues to use `createdAt` and `formatDateTime`.
- [ ] `Actions` keeps current `Edit`, `Set Default`, and `Delete` buttons and handlers.
- [ ] `Actions` remains non-sortable with `enableSorting: false`.
- [ ] Keep any other existing admin action/control columns that currently require `enableSorting: false` non-sortable.

### 3C. Phase 3 validation and commit

- [ ] Run from repo root:
  ```sh
  npm run build:shared
  npm run typecheck -w @golightly/web
  npm run build -w @golightly/web
  ```
- [ ] If lint is stable, run `npm run lint -w @golightly/web`.
- [ ] Manually smoke the admin meditations table:
  - [ ] It shows exactly the 10 columns listed above, in order.
  - [ ] Owner rendering is unchanged.
  - [ ] Default, Status, Set Default, Edit, and Delete behaviors are unchanged.
  - [ ] Length still uses `durationSeconds`.
  - [ ] Actions remains non-sortable.
  - [ ] Admin global search still works through the wrapper.
- [ ] Commit only admin meditation compatibility work. Suggested message: `refactor: preserve admin meditations table on shared table`.

---

## Phase 4 — Refactor home `TableMeditation` onto `DataTable`

### 4A. Preserve non-table behavior

- [ ] Update `web/src/components/tables/TableMeditation.tsx` so the visible home meditation list/table is rendered by `DataTable`.
- [ ] Preserve all existing surrounding behavior not explicitly removed by PRD2:
  - [ ] Redux data source from `state.meditation.meditations`.
  - [ ] `fetchMeditations`, `setMeditations`, `setLoading`, and `setError` flow.
  - [ ] Authenticated access token passed to `getAllMeditations`.
  - [ ] `isOwned` derivation from `ownerUserId === user.id`.
  - [ ] Polling for owned `pending`/`processing` meditations.
  - [ ] Loading skeleton.
  - [ ] Error state and retry button.
  - [ ] `ModalMeditationDetails` for title clicks.
  - [ ] `AudioPlayer` cell behavior.
  - [ ] In-flight and failed row/cell messages.
  - [ ] Favorite toggle behavior and optimistic rollback.
  - [ ] Update/delete/regenerate handlers.
  - [ ] Toast behavior.
  - [ ] Existing guidance color/duration helper semantics.
  - [ ] Existing header help text/behavior for Length, Guidance, and Listens.
- [ ] Remove only the presentation mechanics PRD2 replaces:
  - [ ] Remove the expand/collapse section button.
  - [ ] Remove associated `isExpanded` state and conditional table visibility.
  - [ ] Remove the inner `max-h-[360px]` scrolling table container.
  - [ ] Remove the inner `max-h-[360px]` mobile card container.
  - [ ] Remove any separate raw mobile list derived from `visibleRows` or raw meditations.

### 4B. Configure home `DataTable`

- [ ] Build a `ColumnDef<Meditation>[]` column list with stable ids/accessors.
- [ ] Pass the same data set that currently backs visible home rows, after preserving existing ownership/status visibility rules, into `DataTable` as `data={visibleRows}` or the current equivalent.
- [ ] Configure home `DataTable` with these PRD2 values:
  ```tsx
  <DataTable
    columns={columns}
    data={visibleRows}
    emptyMessage="No meditations available yet."
    filterMode="column"
    filterColumnId="title"
    searchPlaceholder="Search by title…"
    pageSize={10}
    showPagination
    showPageSizeSelector={false}
    minWidthClassName="min-w-[720px]"
    renderMobileRow={({ row, item }) => renderMeditationMobileCard(row, item)}
  />
  ```
- [ ] Ensure home search filters only the `title` column.
- [ ] Ensure searching by creator username, duration, guidance value, listen count, visibility, status, or hidden/control fields does not match solely because of those fields.
- [ ] Do not add home page-size controls; PRD2 uses fixed page size 10.
- [ ] Ensure the table is visible immediately with no expand/collapse gate.

### 4C. Implement home columns exactly

- [ ] `Title` column:
  - [ ] id/accessor: `title`.
  - [ ] Sortable.
  - [ ] The only home search/filter target.
  - [ ] Cell is a `<button type="button">` opening `ModalMeditationDetails` by setting the selected meditation.
  - [ ] Do not use a `<Link>` and do not navigate.
- [ ] `Created By` column:
  - [ ] id/accessor: `createdByUsername`.
  - [ ] Sortable.
  - [ ] Cell displays `row.original.createdByUsername || "—"` so null, missing, and empty string fall back to `—`.
  - [ ] Do not use `ownerDisplayName`.
  - [ ] Do not derive this value from admin owner fields.
- [ ] `Play` column:
  - [ ] id: `play`.
  - [ ] Non-sortable with `enableSorting: false`.
  - [ ] Cell preserves existing in-flight, failed, and `AudioPlayer` behavior.
- [ ] `Length` column:
  - [ ] id/accessor: `durationSeconds`.
  - [ ] Sortable by numeric `durationSeconds`, not formatted duration text.
  - [ ] Cell uses `formatDurationOrDash(row.original.durationSeconds)` or the current equivalent.
  - [ ] Header keeps existing Length `HeaderHelp` text/behavior.
  - [ ] Sort control and `HeaderHelp` are siblings/separate controls; no nested buttons.
- [ ] `Guidance` column:
  - [ ] id/accessor: `durationSecondsTalking`.
  - [ ] Sortable by numeric `durationSecondsTalking`, not color, label, tooltip text, or `durationSeconds`.
  - [ ] Cell preserves current guidance dot, `title`, and `aria-label` behavior based on `durationSecondsTalking`.
  - [ ] Header keeps existing Guidance `HeaderHelp` text/behavior.
  - [ ] Sort control and `HeaderHelp` are siblings/separate controls; no nested buttons.
- [ ] `Favorite` column:
  - [ ] id: `favorite`.
  - [ ] Present only when `isAuthenticated` is true, matching current behavior.
  - [ ] Non-sortable with `enableSorting: false`.
  - [ ] Cell preserves current pending/failed handling and favorite button behavior.
- [ ] `Listens` column:
  - [ ] id/accessor: `listenCount`.
  - [ ] Sortable by numeric listen count.
  - [ ] Cell preserves fallback logic `listenCount ?? listens ?? 0`.
  - [ ] Header keeps existing Listens `HeaderHelp` text/behavior.
  - [ ] Sort control and `HeaderHelp` are siblings/separate controls; no nested buttons.
- [ ] Preserve canonical duration mapping everywhere:
  - [ ] `Length` always uses `durationSeconds`.
  - [ ] `Guidance` always uses `durationSecondsTalking`.
  - [ ] Admin `Length` remains `durationSeconds`.
  - [ ] Never swap `durationSeconds` and `durationSecondsTalking`.

### 4D. Implement mobile cards from the same row model

- [ ] Implement or refactor `renderMeditationMobileCard(row, item)` for `DataTable.renderMobileRow`.
- [ ] Ensure mobile cards include the same user-facing data and controls as desktop, stacked for mobile:
  - [ ] Title button opening `ModalMeditationDetails`.
  - [ ] Created By displaying `createdByUsername || "—"`.
  - [ ] Play/in-flight/failed behavior.
  - [ ] Length using `durationSeconds`.
  - [ ] Guidance using `durationSecondsTalking`.
  - [ ] Favorite button only for authenticated users and only where current pending/failed rules allow it.
  - [ ] Listens using `listenCount ?? listens ?? 0`.
- [ ] Ensure mobile cards are rendered only through `DataTable` from `table.getRowModel().rows`.
- [ ] Do not keep a separate mobile list from raw `data`, `visibleRows`, or independently paginated/sliced rows.
- [ ] Confirm mobile search, sorting, and pagination use exactly the same post-filter, post-sort, post-pagination row model as desktop.

### 4E. Phase 4 validation and commit

- [ ] Run from repo root:
  ```sh
  npm run build:shared
  npm run typecheck -w @golightly/web
  npm run build -w @golightly/web
  ```
- [ ] If lint is stable, run `npm run lint -w @golightly/web`.
- [ ] Manual home desktop smoke checks at `md` and above:
  - [ ] Table is visible immediately; no expand/collapse gate remains.
  - [ ] No `max-h-[360px]` inner vertical scroll remains.
  - [ ] Pagination bounds row count and home page size is 10.
  - [ ] Search placeholder is exactly `Search by title…`.
  - [ ] Search filters matching titles.
  - [ ] Searching a creator username that is not in a title does not match solely because of Created By.
  - [ ] Searching duration, guidance, or listen count values does not match solely because of those columns.
  - [ ] Title, Created By, Length, Guidance, and Listens sort ascending/descending with indicators.
  - [ ] Play and Favorite headers do not trigger sorting.
  - [ ] Created By displays `createdByUsername` and falls back to `—` for null/missing/empty values.
  - [ ] Title click opens `ModalMeditationDetails` and does not route navigate.
  - [ ] Length displays `durationSeconds`.
  - [ ] Guidance displays/labels `durationSecondsTalking`.
  - [ ] Audio player works for ready meditations.
  - [ ] In-flight/failed owned meditation messages remain.
  - [ ] Favorite shows only when authenticated and preserves optimistic toggle behavior.
  - [ ] Listens displays `listenCount ?? listens ?? 0`.
  - [ ] Loading skeleton, error retry, polling, modal update/delete/regenerate, and toast behavior still work.
- [ ] Manual header accessibility/help smoke checks:
  - [ ] Length, Guidance, and Listens each show both a sort affordance/indicator and their existing `HeaderHelp` affordance.
  - [ ] No `<button>` is nested inside another `<button>`.
  - [ ] No interactive help control is nested inside a sort button.
  - [ ] Clicking or keyboard-activating the sort control toggles sorting.
  - [ ] Clicking or keyboard-activating `HeaderHelp` shows help text and does not toggle sorting.
  - [ ] Sort state is exposed accessibly through `aria-sort` on the header cell and/or an accessible sort button label.
- [ ] Manual mobile smoke checks below `md`:
  - [ ] Desktop table is hidden and cards are visible.
  - [ ] Cards show Title, Created By, Play/in-flight/failed state, Length, Guidance, optional Favorite, and Listens.
  - [ ] Cards reflect the same filtered, sorted, and paginated row set as desktop.
  - [ ] Changing search, sorting, or page changes the mobile cards identically to the desktop table row model.
  - [ ] No mobile `max-h-[360px]` inner vertical scroll remains.
- [ ] Commit only home table refactor work. Suggested message: `feat: modernize home meditation table`.

---

## Phase 5 — Final integrated validation and readiness

### 5A. Full web validation

- [ ] Run from repo root:
  ```sh
  npm run build:shared
  npm run typecheck -w @golightly/web
  npm run build -w @golightly/web
  ```
- [ ] If lint is stable, run:
  ```sh
  npm run lint -w @golightly/web
  ```
- [ ] If any validation command fails because of a pre-existing issue, document the exact command, failure summary, and why it is unrelated to PRD2.

### 5B. Integrated manual smoke matrix

- [ ] Home table:
  - [ ] PRD1-backed `createdByUsername` appears in the Created By column.
  - [ ] `createdByUsername || "—"` fallback works for null/missing/empty values.
  - [ ] Home search is title-only.
  - [ ] Home sorting works for Title, Created By, Length, Guidance, and Listens.
  - [ ] Home non-sorting columns Play and Favorite do not sort.
  - [ ] Header help for Length, Guidance, and Listens remains available and separate from sorting.
  - [ ] Mobile cards are generated from the same filtered/sorted/paginated row model.
- [ ] Admin tables:
  - [ ] Existing admin callers still compile without new props.
  - [ ] Admin search remains global with placeholder `Search table...`.
  - [ ] Admin page size remains 25.
  - [ ] Admin horizontal scroll/min width behavior remains compatible.
  - [ ] Admin meditation columns are exactly: ID, Title, Owner, Visibility, Default, Status, Listen Count, Length, Created, Actions.
  - [ ] Admin meditation behavior for Owner, Default, Status, Set Default, Edit, Delete, Length, and non-sortable Actions is unchanged.
- [ ] Out-of-scope guardrails:
  - [ ] No API files changed for PRD2.
  - [ ] No database files changed for PRD2.
  - [ ] No migrations changed or added for PRD2.
  - [ ] No PRD3 taxonomy/type/subtype/admin split work was added.
  - [ ] No `ownerDisplayName` field was introduced.

### 5C. Final git checks and commit

- [ ] Run:
  ```sh
  git status --short --branch
  git diff --stat
  ```
- [ ] Confirm changed implementation files are limited to the intended web table files and any mechanically necessary local imports/types.
- [ ] Confirm this PRD2 TODO remains documentation-only if it is edited during implementation.
- [ ] Commit final validation/docs updates if any. Suggested message: `docs: record meditation table validation`.
- [ ] Final implementation report must include:
  - [ ] Completed phases and commit hashes.
  - [ ] Validation commands run and results.
  - [ ] Manual smoke checks completed.
  - [ ] Any skipped checks with reasons.
  - [ ] Final `git status --short --branch` output.
