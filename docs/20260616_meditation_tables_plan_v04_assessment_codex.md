---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# Codex Assessment — PRD2 Meditation Tables Plan V04

V04 resolves the V03 concerns around preserving admin-specific behavior in principle, duration field mapping, and a concrete mobile render prop. It is still not ready because the following issues risk correctness or implementation success against PRD2, accepted PRD1, and the actual web repo.

## Concerns

1. **The home Created By field uses a non-existent/incorrect name.**
   - Accepted PRD1 exposes the meditation creator as the flat field `createdByUsername?: string | null`; source PRD2 says the new home Created By column is backed by `createdByUsername`.
   - V04 specifies `ownerDisplayName` for the home Created By column, but that field is not introduced by PRD1 and is not present in the actual web table/store references searched.
   - Action: change the home Created By column/accessor to `createdByUsername` with an appropriate null fallback such as `—`. Do not introduce `ownerDisplayName` unless a separate API/type plan adds it.

2. **The `DataTable` filtering contract cannot support V04's required title-only home search.**
   - V04's `DataTableProps` exposes only `globalFilter` / `onGlobalFilterChange`, while the home table section says search is title-only via TanStack `columnFilters` on the `title` column, not `globalFilter`.
   - With no `columnFilters`, `onColumnFiltersChange`, `filterMode`, or `filterColumnId` prop, implementers must invent an API or may accidentally reuse admin global search, violating PRD2's title-only search requirement.
   - Action: add an explicit filtering API to `DataTable`, e.g. `filterMode: "global" | "column" | "none"`, `filterColumnId?: string`, controlled/uncontrolled filter state, and search placeholder support; require home to filter only `title` and admin to keep global search.

3. **Sortable home-table behavior is underspecified despite being a core PRD2 requirement.**
   - Source PRD2 requires the rebuilt home table to be sortable by column header and calls out sorting by underlying values.
   - V04 mentions `getSortedRowModel`, but does not specify sorting state / `onSortingChange`, clickable sortable header rendering, which home columns are sortable vs disabled (`Play`/`Favorite`), or smoke tests for sorting.
   - Action: make sorting an explicit `DataTable` behavior and column contract: render header buttons with sort indicators for sortable columns, manage sorting state, disable sorting for action/control columns, and add validation for sorting by Title, Created By, Length, Guidance, and Listens.

4. **Actual component paths/names are wrong, which can send implementation into a parallel structure.**
   - The repo's table components live under `web/src/components/tables/`: `TableMeditation.tsx`, `AdminTable.tsx`, and `TableAdminMeditations.tsx`.
   - V04 lists `components/shared/DataTable.tsx`, `components/shared/AdminTable.tsx`, `components/home/TableMeditations.tsx`, and `components/admin/TableAdminMeditations.tsx`, including the plural `TableMeditations` name that does not match the current file.
   - Action: update the plan to target `web/src/components/tables/DataTable.tsx`, keep or delegate `web/src/components/tables/AdminTable.tsx`, refactor the existing `web/src/components/tables/TableMeditation.tsx`, and update imports at existing call sites only.

5. **The admin meditation column inventory contradicts the actual table.**
   - V04 says existing admin columns are kept exactly as-is, but its enumerated list omits the current `Title` column and later refers to "all 8 existing columns"; actual `TableAdminMeditations.tsx` has `ID`, `Title`, `Owner`, `Visibility`, `Default`, `Status`, `Listen Count`, `Length`, `Created`, and `Actions`.
   - This contradiction risks an implementer treating the incomplete inventory as authoritative and dropping `Title` or otherwise changing admin columns despite PRD2's preservation rule.
   - Action: correct the inventory and validation to match the actual existing `TableAdminMeditations` columns exactly, or remove the enumerated list and explicitly instruct implementers to preserve the current column definition array byte-for-byte except for mechanical relocation.
