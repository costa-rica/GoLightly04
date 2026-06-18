---
created_at: 2026-06-18
updated_at: 2026-06-18
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# PRD2 Meditation Tables — Implementation Plan V06

## Goal

Modernize the home meditation table in `web/src/components/tables/TableMeditation.tsx` by moving it onto a shared TanStack table primitive, adding the PRD1-backed `Created By` column, and preserving existing home and admin table behavior. V06 supersedes V05 and resolves the Codex V05 assessment concern around sortable header composition with `HeaderHelp` by requiring an accessibility-safe header rendering contract with no nested interactive controls.

Affected package: `web` only. No API, database, authentication, authorization, or implementation-code changes are part of this planning artifact.

---

## Source Constraints

- Source PRD2: `docs/20260616_prd2_meditation_tables_plan_v01.md`
- Accepted PRD1 plan: `docs/20260616_usernames_plan_v09.md`
- Accepted PRD1 TODO: `docs/20260616_usernames_todo_v05.md`
- Prior PRD2 plan: `docs/20260616_meditation_tables_plan_v05.md`
- V05 assessment: `docs/20260616_meditation_tables_plan_v05_assessment_codex.md`
- Earlier V04 assessment: `docs/20260616_meditation_tables_plan_v04_assessment_codex.md`

PRD1 exposes the meditation creator on meditation rows as the flat field:

```ts
createdByUsername?: string | null
```

PRD2 must consume that field directly. Do not introduce or depend on a home-table field named `ownerDisplayName`.

---

## Resolved Assessment Concerns

1. **Home Created By field**: use `createdByUsername?: string | null` with a null/empty fallback such as `—`; do not use `ownerDisplayName`.
2. **Filtering contract**: `DataTable` explicitly supports admin global filtering and home title-only filtering through `filterMode`, `filterColumnId`, controlled/uncontrolled filter state, and configurable placeholder text.
3. **Sorting contract**: `DataTable` explicitly manages or accepts sorting state, renders accessible sortable header controls with indicators, and respects disabled sorting for action/control columns. Home sorting smoke tests cover Title, Created By, Length, Guidance, and Listens.
4. **Correct paths and names**: target `web/src/components/tables/DataTable.tsx`, `web/src/components/tables/AdminTable.tsx`, `web/src/components/tables/TableMeditation.tsx`, and `web/src/components/tables/TableAdminMeditations.tsx`. Do not create `components/shared/*`, `components/home/*`, `components/admin/*`, or a plural `TableMeditations.tsx`.
5. **Admin meditation columns**: preserve the current `TableAdminMeditations` column inventory exactly: `ID`, `Title`, `Owner`, `Visibility`, `Default`, `Status`, `Listen Count`, `Length`, `Created`, `Actions`.
6. **Sortable header accessibility with help controls**: sortable headers must not wrap rendered header content in a sort `<button>` when that content may include `HeaderHelp` or another interactive control. `Length`, `Guidance`, and `Listens` must keep their help affordances without creating nested buttons or causing help clicks to toggle sorting.

---

## Current State Summary

### Existing files

- `web/src/components/tables/AdminTable.tsx`
  - Already uses TanStack Table.
  - Supports sorting, global filtering, pagination, and a horizontal-scroll desktop table shell.
  - Current props are `columns`, `data`, and `emptyMessage`.
  - Current defaults include global search placeholder `Search table...`, page size `25`, and admin min width `min-w-[960px]`.

- `web/src/components/tables/TableAdminMeditations.tsx`
  - Uses `AdminTable`.
  - Current columns are exactly:
    1. `ID` (`id`)
    2. `Title` (`title`)
    3. `Owner` (`ownerUserId`, rendered as `ownerEmail ?? ownerUserId ?? "Unknown"`)
    4. `Visibility` (`visibility`)
    5. `Default` (`isDefault`, rendered as current default/hidden messaging)
    6. `Status` (`status`, fallback `pending`)
    7. `Listen Count` (`listenCount`)
    8. `Length` (`durationSeconds`, formatted)
    9. `Created` (`createdAt`, formatted)
    10. `Actions` (`Edit`, `Set Default`, `Delete`, sorting disabled)

- `web/src/components/tables/TableMeditation.tsx`
  - Hand-rolled home table with an expand/collapse section, `max-h-[360px]` inner scroll, desktop table, separate mobile card list, loading/error states, polling for in-flight owned meditations, details modal, audio playback, favorite toggle, guidance indicator, length, listens, update/delete/regenerate handlers, and toast behavior.
  - PRD2 replaces only the presentation table/list mechanics. Data fetching, Redux behavior, modal/update/delete/regenerate/favorite logic, polling, and error/loading handling must remain intact.

---

## Target Files and Responsibilities

```txt
web/src/components/tables/DataTable.tsx
  New shared TanStack table primitive extracted from the existing AdminTable behavior.

web/src/components/tables/AdminTable.tsx
  Keep as a thin compatibility wrapper around DataTable with admin defaults.
  Preserve existing caller contract and defaults.

web/src/components/tables/TableAdminMeditations.tsx
  Preserve current columns and behavior exactly, except for mechanical compatibility with the AdminTable/DataTable extraction.

web/src/components/tables/TableMeditation.tsx
  Rebuild the home meditation presentation on DataTable, add Created By, title-only search, sorting, pagination, and mobile cards driven by the same row model.
```

Do not modify implementation code while creating this plan. During the later implementation, update only existing call sites that need to consume the new table primitive/wrapper.

---

## Shared `DataTable` Contract

Create `web/src/components/tables/DataTable.tsx` as the generic primitive. It should be extracted from the current admin table rather than invented as a second unrelated implementation.

```ts
import type {
  ColumnDef,
  Row,
  SortingState,
  ColumnFiltersState,
} from "@tanstack/react-table";
import type { ReactNode } from "react";

type FilterMode = "global" | "column" | "none";

type DataTableProps<TData, TValue = unknown> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyMessage?: string;

  // Search/filtering
  filterMode?: FilterMode;              // default: "global" for compatibility
  filterColumnId?: string;              // required when filterMode === "column"
  filterValue?: string;                 // controlled filter value
  onFilterValueChange?: (value: string) => void;
  defaultFilterValue?: string;          // uncontrolled initial filter value
  searchPlaceholder?: string;           // default: "Search table..."
  showSearch?: boolean;                 // default: filterMode !== "none"

  // Sorting
  sorting?: SortingState;               // controlled sorting
  onSortingChange?: (sorting: SortingState) => void;
  defaultSorting?: SortingState;        // uncontrolled initial sorting
  enableSorting?: boolean;              // default: true

  // Pagination
  pageSize?: number;                    // default: 25
  showPagination?: boolean;             // default: true
  showPageSizeSelector?: boolean;       // default: false
  pageSizeOptions?: number[];           // used only when selector is shown

  // Layout
  minWidthClassName?: string;           // default: "min-w-[960px]"
  tableClassName?: string;
  wrapperClassName?: string;

  // Responsive/mobile rendering
  renderMobileRow?: (ctx: { row: Row<TData>; item: TData }) => ReactNode;
};
```

### Filtering behavior

`DataTable` must support three explicit modes:

- `filterMode: "global"`
  - Use TanStack global filtering.
  - This is the admin default and preserves the existing admin search behavior: search all serializable row values using the current broad `Object.values(row.original).join(" ")` semantics unless an implementer chooses an equivalent compatible global filter.
  - The search input controls `globalFilter`.

- `filterMode: "column"`
  - Use TanStack column filtering on exactly `filterColumnId`.
  - The home table must pass `filterMode="column"` and `filterColumnId="title"` so search matches titles only.
  - Other columns, including Created By, Length, Guidance, and Listens, must not be searched by the home search box.

- `filterMode: "none"`
  - Do not render a search input by default.
  - Do not wire TanStack global or column filter state.

Filtering state must work in both modes as controlled or uncontrolled state:

- Controlled: `filterValue` and `onFilterValueChange` are provided by the caller.
- Uncontrolled: `DataTable` owns internal filter state initialized from `defaultFilterValue ?? ""`.

If `filterMode === "column"` and `filterColumnId` is missing, fail loudly during development or document a safe no-filter fallback. The implementation TODO should prefer a development-time guard because silent global filtering would violate PRD2.

### Sorting behavior

`DataTable` must include:

- `getSortedRowModel()` in `useReactTable`.
- Sorting state that is controlled when `sorting`/`onSortingChange` are provided and internal otherwise, initialized from `defaultSorting ?? []`.
- Header rendering that checks `header.column.getCanSort()`.
- A header rendering/accessibility contract that never creates nested interactive controls.
- Sort indicators equivalent to the current admin behavior:
  - ascending: `▲`
  - descending: `▼`
  - unsorted but sortable: `↕`
- For non-sortable headers, render the header content without a sorting button/indicator or render a disabled non-interactive wrapper; do not attach a click handler.

Column definitions are responsible for disabling sorting on action/control columns with `enableSorting: false`.

### Header rendering and accessibility contract

Sortable headers must remain keyboard- and screen-reader-accessible while supporting header help/tooltips such as the existing `HeaderHelp` used by `Length`, `Guidance`, and `Listens`. The implementation must not render a `<button>` inside another `<button>` or otherwise nest interactive elements.

Required contract:

- `DataTable` must not blindly wrap `flexRender(header.column.columnDef.header, header.getContext())` in a sorting `<button>`, because the rendered header may contain its own interactive help control.
- The sort affordance must be a distinct interactive control when sorting is enabled, for example a `<button type="button">` whose click/keyboard handler calls `header.column.getToggleSortingHandler()` or equivalent `header.column.toggleSorting(...)` logic.
- Any help affordance (`HeaderHelp` or equivalent tooltip trigger) must be a sibling of the sort control, not a descendant of it. Interacting with the help control must not toggle sorting.
- The header cell may use a non-interactive wrapper such as `<div className="flex items-center gap-1">` or `<span>` to lay out the sortable label/sort indicator next to the help control. This wrapper must not have button semantics or a sorting click handler when it contains an interactive child.
- Acceptable sortable header patterns include either:
  1. **Separate controls pattern**: render the sort button around only the plain sortable label and sort indicator, then render `HeaderHelp` as a separate sibling button/control; or
  2. **Non-button wrapper pattern**: render a non-interactive wrapper containing a dedicated sort button plus any help control as siblings.
- If a column requires a fully custom header layout, `DataTable` may expose or document a column/header escape hatch, but the resulting markup must still keep sort and help controls separate.
- Sort controls should expose the current sort state accessibly, e.g. through `aria-sort` on the `<th>` and/or an `aria-label` on the sort button such as `Sort by Length, currently ascending`.
- Sort indicators (`▲`, `▼`, `↕`) must be associated with the sort control, not with the help control.
- Non-sortable headers may render `flexRender(...)` directly and must not receive a sorting click handler.

For the home `Length`, `Guidance`, and `Listens` headers, keep the existing `HeaderHelp` text/behavior, but compose it as a sibling of the sorting control or convert only the surrounding header layout to non-interactive markup. Do not solve this by removing `HeaderHelp`, disabling sorting for those columns, or wrapping `HeaderHelp` inside the sort button.

### Pagination behavior

`DataTable` must include:

- `getPaginationRowModel()`.
- `pageSize` default `25` for compatibility with existing admin usage.
- Previous/next controls and page label when `showPagination !== false`.
- No page-size selector unless `showPageSizeSelector` is explicitly true.
- When page size changes through an optional selector, use TanStack pagination state rather than slicing data outside the table.

### Mobile row behavior

When `renderMobileRow` is provided:

- Desktop/tablet (`md` and above): render the normal table.
- Mobile (below `md`): hide the table and render cards.
- The mobile cards must be generated from `table.getRowModel().rows`, not from raw `data`, not from the pre-filtered list, and not from a separate independently sliced array.
- This guarantees mobile cards use the same post-filter, post-sort, post-pagination row model as the desktop table.

Equivalent derived-list implementations are acceptable only if they are explicitly derived from the same TanStack row model and verified to produce identical visible rows.

When `renderMobileRow` is absent, `DataTable` should preserve admin behavior: show the table with horizontal scroll on small screens and no mobile-card layer.

---

## `AdminTable` Compatibility Wrapper

Keep `web/src/components/tables/AdminTable.tsx` as a thin wrapper around `DataTable` to avoid breaking existing admin callers.

The current public caller contract must continue to work:

```ts
type AdminTableProps<TData> = {
  columns: ColumnDef<TData>[];
  data: TData[];
  emptyMessage?: string;
};
```

The wrapper may also accept the new optional `DataTable` configuration props if useful, but it must not require existing callers to pass anything new.

Admin defaults must preserve current behavior:

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

Do not transform admin columns in the wrapper. Props and columns should pass through verbatim apart from applying defaults.

---

## `TableAdminMeditations` Preservation Plan

`web/src/components/tables/TableAdminMeditations.tsx` must preserve current columns exactly. The implementation may move the array to a `useMemo` or a named const if required for React performance, but it must not drop, add, rename, reorder, or reinterpret columns.

Required column inventory:

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

Specific behavior to preserve:

- `Title` remains present after the extraction.
- `Owner` remains based on the current owner field/rendering: `ownerEmail ?? ownerUserId ?? "Unknown"`.
- `Default` cell keeps the current label/styling behavior for default and non-default rows.
- `Status` keeps the current `status ?? "pending"` fallback.
- `Length` keeps `durationSeconds` and `formatDurationOrDash`.
- `Created` keeps `createdAt` and `formatDateTime`.
- `Actions` keeps current `Edit`, `Set Default`, and `Delete` buttons and handlers.
- `Actions` remains non-sortable with `enableSorting: false`.

Admin meditation changes are limited to mechanical extraction compatibility with `AdminTable`/`DataTable`. PRD2 does not authorize admin taxonomy columns, admin page splits, or any PRD3 behavior.

---

## Home `TableMeditation` Plan

Refactor `web/src/components/tables/TableMeditation.tsx` so the visible meditation list/table is rendered by `DataTable` while preserving the surrounding behavior.

### Surrounding behavior to preserve

Keep all existing non-table behavior unless the PRD explicitly removes it:

- Redux data source from `state.meditation.meditations`.
- `fetchMeditations`, `setMeditations`, `setLoading`, and `setError` flow.
- Authenticated access token passed to `getAllMeditations`.
- `isOwned` derivation from `ownerUserId === user.id`.
- Polling for owned `pending`/`processing` meditations.
- Loading skeleton.
- Error state and retry button.
- `ModalMeditationDetails` for title clicks.
- `AudioPlayer` cell behavior.
- In-flight and failed row/cell messages.
- Favorite toggle behavior and optimistic rollback.
- Update/delete/regenerate handlers.
- Toast behavior.
- Existing helper semantics for guidance color/duration and header help.

### Presentation behavior to remove

- Remove the expand/collapse section button and associated `isExpanded` state; the table area is always visible.
- Remove the inner `max-h-[360px]` scrolling table/card containers; pagination bounds the visible rows instead.
- Do not render a separate raw mobile list from `visibleRows`; mobile cards must come from `DataTable`'s row model.

### Home table configuration

Home should use `DataTable` roughly as follows:

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

The home search input must filter only the `title` column. Searching by creator username, duration, guidance, listen count, visibility, status, or any hidden/control field is not part of PRD2.

### Home columns

Define home columns as `ColumnDef<Meditation>[]` with stable ids/accessors. Sorting must use underlying values, not rendered text or JSX.

1. **Title**
   - Column id/accessor: `title`.
   - Sortable: yes.
   - Filter target: yes, this is the only home search column.
   - Cell: `<button type="button">` that opens `ModalMeditationDetails` by setting the selected meditation.
   - Do not use a `<Link>` and do not navigate.

2. **Created By**
   - Column id/accessor: `createdByUsername`.
   - Sortable: yes.
   - Cell value: `row.original.createdByUsername ?? "—"`; also treat empty string as fallback if desired (`row.original.createdByUsername || "—"`).
   - This field comes from accepted PRD1. Do not use `ownerDisplayName`.

3. **Play**
   - Column id: `play`.
   - Sortable: no (`enableSorting: false`).
   - Cell: preserve the existing in-flight, failed, and `AudioPlayer` behavior.

4. **Length**
   - Column id/accessor: `durationSeconds`.
   - Sortable: yes by numeric `durationSeconds`.
   - Cell: `formatDurationOrDash(row.original.durationSeconds)`.
   - Header: keep `HeaderHelp` with the existing Length help text, composed as a sibling of the sort control so no sort button wraps the help button.

5. **Guidance**
   - Column id/accessor: `durationSecondsTalking`.
   - Sortable: yes by numeric `durationSecondsTalking`.
   - Cell: preserve the guidance dot, `title`, and `aria-label` behavior based on `durationSecondsTalking`.
   - Header: keep `HeaderHelp` with the existing Guidance help text, composed as a sibling of the sort control so no sort button wraps the help button.
   - Do not swap this with `durationSeconds`.

6. **Favorite**
   - Column id: `favorite`.
   - Present only when `isAuthenticated` is true, matching current behavior.
   - Sortable: no (`enableSorting: false`).
   - Cell: preserve current pending/failed handling and favorite button behavior.

7. **Listens**
   - Column id/accessor: `listenCount`.
   - Sortable: yes by numeric listen count.
   - Cell: preserve current fallback logic where needed: `listenCount ?? listens ?? 0`.
   - Header: keep `HeaderHelp` with the existing Listens help text, composed as a sibling of the sort control so no sort button wraps the help button.

### Canonical duration mapping

- `Length` always uses `durationSeconds`.
- `Guidance` always uses `durationSecondsTalking`.
- Admin `Length` also remains `durationSeconds`.
- These fields must never be swapped.

### Mobile card content

The home mobile renderer should include the same user-facing data and controls as desktop, stacked for mobile:

- Title button opening `ModalMeditationDetails`.
- Created By using `createdByUsername || "—"`.
- Play/in-flight/failed cell behavior.
- Length using `durationSeconds`.
- Guidance using `durationSecondsTalking`.
- Favorite button only for authenticated users and only where current pending/failed rules allow it.
- Listens using `listenCount ?? listens ?? 0`.

The cards must be rendered from `table.getRowModel().rows` through `renderMobileRow`, so mobile search, sorting, and pagination match desktop exactly.

---

## Sorting Requirements and Smoke Tests

Sortable home headers must be clickable and show indicators. The following home columns must sort correctly by underlying values:

- `Title` — alphabetical title sort.
- `Created By` — alphabetical username sort, with `null`/empty fallback handled consistently.
- `Length` — numeric `durationSeconds`, not formatted duration text.
- `Guidance` — numeric `durationSecondsTalking`, not color or formatted tooltip text.
- `Listens` — numeric listen count.

Sortable header accessibility/help smoke tests:

- `Length`, `Guidance`, and `Listens` each show both a sort affordance/indicator and their existing `HeaderHelp` affordance.
- The sort control and help control are siblings or otherwise separate controls; there is no `<button>` nested inside another `<button>` and no interactive element nested inside the sort button.
- Clicking or keyboard-activating the sort control toggles sort for the column.
- Clicking or keyboard-activating `HeaderHelp` opens/shows the help text and does not toggle sort.
- Screen-reader semantics remain coherent, with sort state exposed through `aria-sort` on the header cell and/or an accessible label on the sort button.

The following home columns must not sort:

- `Play`.
- `Favorite`.

The following admin/control columns must not sort unless they are already intentionally sortable today:

- `TableAdminMeditations` `Actions` remains non-sortable.
- Any other existing admin action/control columns that currently set or require `enableSorting: false` must keep that behavior.

---

## Filtering Requirements and Smoke Tests

- Home search placeholder: `Search by title…`.
- Home search mode: `filterMode="column"`, `filterColumnId="title"`.
- Home search expected behavior:
  - Searching for title text filters matching rows.
  - Searching for a creator username that is not in a title does not match solely because of Created By.
  - Searching for a duration, guidance value, or listen count does not match solely because of those columns.
- Admin search placeholder/default: preserve `Search table...` unless an existing caller explicitly overrides it.
- Admin search mode: `filterMode="global"` through `AdminTable` defaults.
- Admin global search expected behavior: broad search continues to match across current row values as before.

---

## Generic Table Preservation Pitfalls

The implementation TODO must explicitly guard against these pitfalls:

- Do not break existing admin callers of `AdminTable`; `columns`, `data`, and `emptyMessage` must remain sufficient.
- Do not require every caller to manage sorting or filtering state; controlled and uncontrolled modes must both work.
- Do not move files into a new parallel directory hierarchy.
- Do not render mobile cards from raw `data` or `visibleRows`; use the DataTable row model after filtering, sorting, and pagination.
- Do not wrap rendered header content in a sortable `<button>` when the header content can include `HeaderHelp` or another interactive control.
- Do not remove `HeaderHelp` or disable sorting on `Length`, `Guidance`, or `Listens` as a workaround for nested controls; use the header accessibility contract instead.
- Do not add home page-size controls unless separately requested; PRD2 uses fixed home page size `10`.
- Do not add or remove admin meditation columns during this PRD.
- Do not introduce PRD3 taxonomy/admin split work.

---

## Validation Strategy

Automated test infrastructure changes are not required by this plan. The implementation TODO should require repo-appropriate web checks and manual smoke validation.

### Build/type checks

Run from the repository root unless the actual workspace scripts require package-specific commands:

```sh
npm run typecheck -w @golightly/web
npm run build -w @golightly/web
```

If lint is stable for the repo, also run:

```sh
npm run lint -w @golightly/web
```

If the actual package names or scripts differ, the TODO creator should inspect `package.json` and use the repository's real web typecheck/build/lint commands.

### Manual smoke checks

Home table:

- Desktop (`md` and above): table is visible immediately; no expand/collapse gate.
- Desktop: no `max-h-[360px]` inner vertical scroll; pagination controls bound the row count.
- Home page size: 10 rows per page by default.
- Home search: title-only filtering with placeholder `Search by title…`.
- Home sorting: Title, Created By, Length, Guidance, and Listens sort ascending/descending with indicators.
- Home header help: Length, Guidance, and Listens help controls still open/show the existing help text and do not trigger sorting.
- Home header markup/accessibility: no nested buttons or nested interactive controls in sortable headers; sort state is exposed accessibly.
- Home non-sorting: Play and Favorite headers do not trigger sorting.
- Created By: displays `createdByUsername` and falls back to `—` for null/missing/empty values.
- Title click: opens `ModalMeditationDetails`; no route navigation.
- Length: displays `durationSeconds`.
- Guidance: displays/labels `durationSecondsTalking`.
- Audio player: works for ready meditations.
- In-flight/failed owned meditations: existing messages remain.
- Favorite: shown only when authenticated and preserves optimistic toggle behavior.
- Listens: displays `listenCount ?? listens ?? 0`.
- Loading skeleton, error retry, polling, modal update/delete/regenerate, and toast behavior still work.

Mobile home table:

- Below `md`, table is hidden and cards are visible.
- Cards show Title, Created By, Play/in-flight/failed state, Length, Guidance, optional Favorite, and Listens.
- Cards reflect the same filtered, sorted, and paginated row set as desktop.
- Changing search, sorting, or page changes the mobile card list identically to the desktop table row model.
- No mobile `max-h-[360px]` inner vertical scroll remains.

Admin tables:

- Existing admin callers still compile without passing new props.
- Admin global search still works.
- Admin page size remains 25.
- Admin horizontal scroll/min width behavior remains compatible with the current UI.
- `TableAdminMeditations` shows exactly 10 columns in this order: ID, Title, Owner, Visibility, Default, Status, Listen Count, Length, Created, Actions.
- Admin meditation Title is not dropped.
- Admin meditation Owner rendering is unchanged.
- Admin meditation Default, Status, Set Default, Edit, and Delete behaviors are unchanged.
- Admin meditation Length still uses `durationSeconds`.
- Admin meditation Actions remains non-sortable.

---

## Out of Scope

- No API changes.
- No database or migration changes.
- No shared-types changes beyond consuming the already-planned PRD1 field.
- No authentication or authorization changes.
- No changes to meditation creation, update, delete, regeneration, polling, or favorite API behavior.
- No admin page split or taxonomy/type/subtype columns; that is PRD3.
- No automated test framework setup unless requested by the implementation TODO.
- No implementation code changes as part of this planning artifact.
