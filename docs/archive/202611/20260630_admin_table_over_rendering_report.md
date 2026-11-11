---
created_at: 2026-06-30T01:42:02+00:00
updated_at: 2026-06-30T01:42:02+00:00
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---

# Admin table over-rendering investigation

## Summary

The current Firefox console timeout still points at the admin table rendering path, not at authentication or API startup:

- The application starts normally in `NEXT_PUBLIC_MODE=testing` against `https://api.dev.go-lightly.love`.
- The timeout stack enters TanStack Table at `getSortedRowModel`, then flows through `getExpandedRowModel`, `getPaginationRowModel`, `getRowCount`, and `getPageCount`.
- In our source, that path corresponds to `web/src/components/tables/DataTable.tsx`, especially the `useReactTable(...)` setup and the render-time calls to `table.getPageCount()` and `table.getRowModel()`.

The likely remaining problem is not that every admin section loads immediately anymore. The last two commits reduced that. The remaining problem is that once a large admin table is opened, we still give TanStack Table a full in-memory dataset and client-side sorting/filtering/pagination model. The `/admin/meditations` endpoint still returns every meditation row, including the large `meditationArray`/script-related payload inherited from the shared `Meditation` type, and the frontend then asks TanStack to derive all row models on the client.

In short: the table is less eager at page load, but it is still eager once a heavy section is expanded.

## Evidence from the console stack

The user-provided console log terminates inside the production bundle at:

```text
createTable/e.getSortedRowModel
createTable/e.getPreExpandedRowModel
createTable/e.getExpandedRowModel
createTable/e.getPrePaginationRowModel
createTable/e.getRowCount
createTable/e.getPageCount
```

That maps to our table component:

- `web/src/components/tables/DataTable.tsx`
  - imports `getSortedRowModel`, `getFilteredRowModel`, and `getPaginationRowModel`.
  - passes those row-model factories into `useReactTable(...)`.
  - computes `pageLabel` with `table.getPageCount()` on every render.
  - computes `visibleRows` with `table.getRowModel().rows` on every render.
- `web/src/components/tables/AdminTable.tsx`
  - hard-codes admin tables to use global filtering, page size `25`, and client-side pagination.
- `web/src/components/tables/TableAdminMeditations.tsx`
  - passes all fetched meditations into `AdminTable`.

The timeout is therefore consistent with expensive client-side row-model recalculation over a large admin dataset, rather than a network failure. Firefox reports it as a script timeout because the browser is spending too long in synchronous JavaScript.

## What the last two commits changed

### `5135d30 reduce admin page eager loading`

This commit addressed the most obvious eager-load behavior in `web/src/app/admin/page.tsx`:

- stopped fetching sound files, meditations, queue records, backups, and backup-size estimates on initial admin page mount;
- scoped those fetches to the matching expanded section;
- made the database heading itself toggle the database section.

This means the admin page should no longer immediately pull every heavy admin collection just because `/admin` loaded.

### `3617ab2 reduce admin initial rendering`

This commit went further:

- changed the Users section from expanded-by-default to collapsed-by-default;
- scoped the users fetch behind `isExpanded` so even users do not load until opened;
- wrapped each admin table's column definitions in `useMemo(...)` so columns are not recreated from scratch on every table component render.

This reduced initial render pressure and removed one avoidable source of TanStack recalculation.

## Why those changes did not fully fix it

The page is no longer as eager during the initial `/admin` render, but the table architecture remains client-eager after expansion:

1. **The admin meditations API is unpaginated.**

   `api/src/routes/admin.ts` uses:

   ```ts
   const meditations = await Meditation.findAll({
     include: [{ model: User, attributes: ["email"], required: false }],
     order: [["createdAt", "DESC"]],
   });
   ```

   Then it returns all rows in one response. There is no `limit`, `offset`, cursor, search parameter, or sort parameter.

2. **The admin response shape is wider than the table needs.**

   `AdminMeditation` extends the shared `Meditation` type. That type includes fields such as `meditationArray`, `scriptSource`, `importMetadata`, and file/path metadata. The visible admin table only needs summary columns such as id, title, owner, visibility, default flag, status, listen count, duration, and created date. Loading large per-meditation arrays/scripts just to render the admin list increases memory pressure and global filter cost.

3. **`AdminTable` always uses client-side global filtering/sorting/pagination.**

   The `DataTable` global filter currently builds searchable text with:

   ```ts
   Object.values(row.original as Record<string, unknown>)
     .join(" ")
     .toLowerCase()
   ```

   For admin meditations, `row.original` includes large object/array fields. Even when a user is not typing in search, the table is configured with the full filtered/sorted/paginated row-model chain.

4. **Pagination is client-side, not server-side.**

   Showing 25 rows per page does not mean only 25 rows are processed. TanStack still has to derive the sorted/filtered/pre-pagination model from the full `data` array before it can know page count and visible rows.

5. **Some callback props are still created inline in `AdminPage`.**

   The table column arrays are now memoized inside table components, but several dependencies passed from `AdminPage` are inline lambdas such as:

   ```tsx
   onEdit={(target) => setMeditationEditTarget(target)}
   onDelete={(target) => setMeditationDeleteTarget(target)}
   onSetDefault={(target) => setMeditationDefaultTarget(target)}
   ```

   Those identities change whenever `AdminPage` renders. That makes the `useMemo(...)` dependency arrays in the table components invalidate more often than intended. This is probably secondary to the unpaginated dataset, but it is still avoidable churn.

## Current working hypothesis

The remaining browser timeout is caused by opening a large admin table, most likely **Meditations**, in the production-like deployed bundle. The client receives a large, wide dataset and asks TanStack Table to synchronously compute global filtering, sorting, page count, and row models in the browser. Firefox's script timeout catches this while the bundle is inside `getSortedRowModel()`/`getPageCount()`.

The next fix should attack the source of the work rather than adding more memoization around it:

- add server-side pagination for the heavy admin tables, especially meditations and queue records;
- return a narrow admin-list DTO for `/admin/meditations` instead of full `Meditation` records;
- configure TanStack Table in manual/server mode for admin tables that use server paging/sorting/filtering;
- restrict any remaining client-side search to explicit small string fields, not `Object.values(row.original)` across all values;
- optionally wrap inline admin callbacks in `useCallback` or pass state setters directly where safe.

## Can workstation agents reproduce this locally on a Mac?

Yes, but **`cd web && npm run dev` is the wrong reproduction mode** for this specific bug.

The deployed service is production-mode Next.js:

```ini
WorkingDirectory=/home/limited_user/applications/GoLightly04/web
Environment="NODE_ENV=production"
Environment="PORT=8002"
EnvironmentFile=/home/limited_user/applications/GoLightly04/web/.env
ExecStart=/usr/bin/npm start
```

The README's web command runs `next dev` instead:

```bash
cd web && npm run dev
```

That can mask or change the symptom because it uses the development server, unminified/dev-instrumented bundles, hot reload behavior, and different React/Next runtime behavior. It also usually runs against a smaller local database unless the workstation points its `.env` at the dev API.

To reproduce on the Mac workstation, use a production-style web build and the same dev API/dataset:

```bash
cd /path/to/GoLightly04
npm install
npm run build --workspaces

cd web
cp .env.example .env.local  # if needed; do not commit local env files
```

Set the workstation web environment to the dev API and testing mode:

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.dev.go-lightly.love
NEXT_PUBLIC_MODE=testing
PORT=3001
```

Then run the production web server locally:

```bash
cd web
npm run build
PORT=3001 npm run start
```

Open `http://localhost:3001/admin`, authenticate as an admin account, and expand the Meditations section. Use Firefox if possible, because the reported failure is Firefox's script timeout. Chrome DevTools can also help by recording a Performance trace while expanding the table.

If the workstation must use local API/database instead of `https://api.dev.go-lightly.love`, seed or restore enough meditations and queue records to match the dev database scale. A tiny local database probably will not reproduce the timeout.

## Suggested next implementation direction

For coding agents, the most direct remediation path is:

1. Add a narrow shared admin-list type for meditations, for example `AdminMeditationListItem`, without `meditationArray`, `scriptSource`, or `importMetadata`.
2. Change `GET /admin/meditations` to accept pagination and sort/filter query params, such as `page`, `pageSize`, `sort`, `direction`, and `search`.
3. Return `{ meditations, page, pageSize, totalCount, pageCount }` from the API.
4. Update `TableAdminMeditations`/`AdminTable`/`DataTable` to support manual server pagination for this table.
5. For global search, search only fields that the table shows: id, title, owner email, visibility, default status, status, listen count, duration, and created date.
6. Add instrumentation around table expansion during development, such as logging row counts, payload sizes, and render timings, then remove noisy diagnostics before merging.

Do not try to fix this only by adding more `useMemo`. The last two commits already reduced initial eager work; the remaining architectural issue is that the heavy admin tables are still full-dataset, client-derived tables.
