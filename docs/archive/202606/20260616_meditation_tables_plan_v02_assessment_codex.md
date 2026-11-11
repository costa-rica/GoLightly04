---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# Codex Assessment — PRD2 Meditation Tables Plan V02

V02 is not ready. It resolves the V01 assessment items in several areas, but the following remaining issues risk correctness or implementation success against the source PRD, accepted PRD1 plan/TODO, and the actual web repo.

## Concerns

1. **`AdminTable` is incorrectly redefined as meditation-specific, which would break existing admin callers.**
   - Actual `web/src/components/tables/AdminTable.tsx` is a generic component with props `{ columns, data, emptyMessage? }` and is imported by `TableAdminUsers`, `TableAdminQueuer`, `TableAdminDatabase`, `TableAdminSoundsFiles`, and other admin tables.
   - V02 §5.2 instead defines `AdminTableProps` as `{ meditations, onEdit, onDelete, ... }` and says it internally builds a 9-column meditation table. That is not backward compatible with the actual caller contract and conflicts with the source PRD's shared-table extraction from the generic admin table.
   - Action: keep `AdminTable<TData>` generic with the existing public props (`columns`, `data`, `emptyMessage?`) and delegate those to `DataTable`; put meditation-specific 9-column logic in `TableAdminMeditations` or another meditation-specific wrapper, not in `AdminTable` itself.

2. **V02 changes existing admin table behavior that PRD2 says should be preserved.**
   - Actual `AdminTable` currently uses global search across row values and a fixed page size of 25.
   - Source PRD2 describes admin's current search-all-columns global filter as the admin default and says admin tables are already sort/search/paginate; changing admin behavior beyond shared-component extraction is out of scope.
   - V02 §5.2/§7 sets admin `filterMode="title"` and page size `20`, which would break non-meditation admin tables (many have no `title` accessor) and alter existing pagination.
   - Action: make `DataTable` support at least `filterMode: 'global' | 'title' | 'none'`; preserve `AdminTable` defaults as global search, page size 25, existing placeholder/min width/empty message. Use title-only search only for the home meditation table unless a meditation-specific admin wrapper explicitly needs it.

3. **The plan names the wrong guidance accessor.**
   - Actual shared/web/API fields use `durationSecondsTalking`; there is no `guidanceDurationSeconds` in `shared-types/src/meditation.ts` or `TableMeditation.tsx`.
   - V02 §6.1, §10, and §11 require `guidanceDurationSeconds`, which would produce type/build failures or require an out-of-scope API/type rename.
   - Action: replace `guidanceDurationSeconds` with the existing `durationSecondsTalking` accessor everywhere in the plan, while keeping the user-facing column label `Guidance`.

4. **The home title behavior is changed from modal open to route navigation despite routing being out of scope.**
   - Actual `TableMeditation.tsx` title cells are buttons that call `setSelectedMeditation(meditation)` and open `ModalMeditationDetails`; there is no meditation detail route under `web/src/app`.
   - Source PRD2 says to preserve clickable title → details modal, and V02 itself says routing/URL structure changes are out of scope.
   - V02 §6.1/§10 says the title renders a `<Link>` navigating to a meditation detail page.
   - Action: specify that the Title cell remains a button (or equivalent control) that opens the existing `ModalMeditationDetails` flow; do not introduce `Link` navigation or new routes in PRD2.

5. **The new file paths omit the actual web source directory.**
   - V02 §10 says to create `components/DataTable.tsx` and `components/DataTable.test.tsx`, but the repo's table components live under `web/src/components/tables/` and the source PRD names `web/src/components/tables/DataTable.tsx`.
   - Action: update the plan to create `web/src/components/tables/DataTable.tsx` (and any test file only if it matches the repo's test conventions); otherwise validation should remain `npm run typecheck -w @golightly/web` and `npm run build -w @golightly/web`.
