---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# Codex Assessment — PRD2 Meditation Tables Plan V01

V01 is not ready. The following concerns risk correctness or implementation success and should be resolved before implementation.

## Concerns

1. **Home search semantics conflict with the PRD.**
   - Source PRD2 specifies title search / title-only filtering for the home table (`searchable by title`, `home table filters on title only`, and `do not reuse the admin "search all columns" filter there`).
   - V01 says the home filter applies against both `title` and `createdByUsername`.
   - Action: change the plan so home search filters only `title`; keep Created By sortable/display-only unless the source PRD is explicitly revised.

2. **Required existing home columns/behaviors are omitted or remapped incorrectly.**
   - The actual current desktop table has `Title`, `Play`, `Length`, `Guidance`, optional `Favorite`, and `Listens`; PRD2 explicitly says to preserve guidance dot, listens, length, audio, favorite, in-flight/failed states, and clickable title.
   - V01's planned columns are `Title`, `Duration`, `Created By`, `Audio`, `Favorite`, `Status`, omitting `Listens` and replacing the existing separate `Guidance` column with a title-cell mention. It also introduces a separate `Status` column even though current status rendering lives in play/favorite cell states.
   - Action: define TanStack columns that mirror the current table plus Created By: `Title`, `Created By`, `Play`, `Length`, `Guidance`, optional authenticated `Favorite`, and `Listens` (with sortable accessors where required). Keep in-flight/failed rendering in the same user-visible cells unless intentionally changing UX.

3. **Always-displayed/no-inner-scroll requirements are not carried through.**
   - Source PRD2 requires removing the expand/collapse wrapper and the `max-h-[360px]` inner scroll so the home table is always displayed.
   - Actual `TableMeditation.tsx` has `isExpanded` gating and `max-h-[360px]` on both desktop and mobile list containers.
   - V01 repeatedly says to preserve existing behavior/mobile unchanged and does not clearly instruct removal of `isExpanded` or the mobile fixed-height scroll.
   - Action: explicitly remove the expand/collapse state/header gate and all home-table/card `max-h-[360px]` inner scrolling, while leaving pagination to bound desktop height.

4. **`DataTable` / `AdminTable` contract is internally inconsistent and may not preserve admin behavior.**
   - Actual `AdminTable` currently owns sorting, global filter, pagination state, page size 25, all row-model hooks, search placeholder, min width, and `emptyMessage`; its public props are only `columns`, `data`, and optional `emptyMessage`.
   - V01 defines `DataTable` as requiring controlled `pageIndex`, `pageCount`, and `onPageChange`, but also says `AdminTable(props) → DataTable(props)` with the `AdminTable` props signature unchanged. Those statements cannot both be true without adding wrapper-owned state/default mapping.
   - V01's `DataTable` contract also omits explicit sorting state/callbacks and row-model/filter-mode/page-size/min-width defaults needed to preserve current admin sorting/search/pagination and to satisfy PRD2 sortable home headers.
   - Action: make the contract concrete: either let `DataTable` own internal sorting/filter/pagination by default with configurable `pageSize`, `filterMode`, `searchPlaceholder`, `minWidthClassName`, and optional callbacks, or specify exactly how `AdminTable` maps its existing behavior/state into controlled `DataTable` props. Include sorting support in the contract.

5. **Mobile card filtering/pagination/sorting behavior is underspecified and currently risks diverging from desktop.**
   - Source PRD2 suggests mobile cards should retain responsive behavior while search/pagination/sort apply consistently if using shared table row models.
   - V01 says the mobile branch reads directly from the Redux rows array and is preserved unchanged, while desktop goes through TanStack `DataTable`.
   - That would make mobile ignore the new search, pagination, and sorting behavior, and it would preserve the current mobile fixed-height scroll.
   - Action: decide and document whether mobile cards consume TanStack's filtered/sorted/paginated row model or an equivalent derived row list from `TableMeditation`; ensure mobile matches desktop search/pagination/sort requirements and includes Created By.

6. **Validation omits required sorting smoke tests.**
   - PRD2's core modernization requirement includes sortable column headers.
   - V01's home manual smoke checklist covers pagination/search but does not require verifying sorting on every sortable home column.
   - Action: add smoke checks for sorting by title, Created By, length, guidance duration, and listens, plus confirming non-data/action columns do not sort if intentionally disabled.
