"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type OnChangeFn,
  type PaginationState,
  type Row,
  type SortingState,
} from "@tanstack/react-table";

type FilterMode = "global" | "column" | "none";

export type DataTableProps<TData, TValue = unknown> = {
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

  renderMobileRow?: (ctx: { row: Row<TData>; item: TData }) => ReactNode;
};

function resolveUpdater<T>(updaterOrValue: T | ((old: T) => T), currentValue: T): T {
  return typeof updaterOrValue === "function"
    ? (updaterOrValue as (old: T) => T)(currentValue)
    : updaterOrValue;
}

function sortLabel(sortState: false | "asc" | "desc") {
  if (sortState === "asc") return "ascending";
  if (sortState === "desc") return "descending";
  return "not sorted";
}

function ariaSort(sortState: false | "asc" | "desc") {
  if (sortState === "asc") return "ascending";
  if (sortState === "desc") return "descending";
  return "none";
}

function sortIndicator(sortState: false | "asc" | "desc") {
  if (sortState === "asc") return "▲";
  if (sortState === "desc") return "▼";
  return "↕";
}

export default function DataTable<TData, TValue = unknown>({
  columns,
  data,
  emptyMessage = "No records found.",
  filterMode = "global",
  filterColumnId,
  filterValue,
  onFilterValueChange,
  defaultFilterValue = "",
  searchPlaceholder = "Search table...",
  showSearch,
  sorting,
  onSortingChange,
  defaultSorting = [],
  enableSorting = true,
  pageSize = 25,
  showPagination = true,
  showPageSizeSelector = false,
  pageSizeOptions = [10, 25, 50, 100],
  minWidthClassName = "min-w-[960px]",
  tableClassName = "w-full text-left text-xs md:text-sm",
  wrapperClassName = "space-y-4",
  renderMobileRow,
}: DataTableProps<TData, TValue>) {
  const isFilterControlled = filterValue !== undefined || onFilterValueChange !== undefined;
  const [internalFilterValue, setInternalFilterValue] = useState(defaultFilterValue);
  const effectiveFilterValue = isFilterControlled ? (filterValue ?? "") : internalFilterValue;

  const isSortingControlled = sorting !== undefined || onSortingChange !== undefined;
  const [internalSorting, setInternalSorting] = useState<SortingState>(defaultSorting);
  const effectiveSorting = isSortingControlled ? (sorting ?? []) : internalSorting;

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  useEffect(() => {
    setPagination((current) =>
      current.pageSize === pageSize ? current : { ...current, pageSize, pageIndex: 0 },
    );
  }, [pageSize]);

  if (process.env.NODE_ENV !== "production" && filterMode === "column" && !filterColumnId) {
    throw new Error("DataTable requires filterColumnId when filterMode is 'column'.");
  }

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    if (filterMode !== "column" || !filterColumnId || !effectiveFilterValue) return [];
    return [{ id: filterColumnId, value: effectiveFilterValue }];
  }, [effectiveFilterValue, filterColumnId, filterMode]);

  const handleSortingChange: OnChangeFn<SortingState> = (updaterOrValue) => {
    const nextSorting = resolveUpdater(updaterOrValue, effectiveSorting);
    if (!isSortingControlled) {
      setInternalSorting(nextSorting);
    }
    onSortingChange?.(nextSorting);
  };

  const handleFilterValueChange = (value: string) => {
    if (!isFilterControlled) {
      setInternalFilterValue(value);
    }
    onFilterValueChange?.(value);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is the supported table state primitive for this component.
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: effectiveSorting,
      globalFilter: filterMode === "global" ? effectiveFilterValue : undefined,
      columnFilters: filterMode === "column" ? columnFilters : [],
      pagination,
    },
    enableSorting,
    onSortingChange: handleSortingChange,
    onPaginationChange: setPagination,
    globalFilterFn: (row, _columnId, value) => {
      const text = Object.values(row.original as Record<string, unknown>)
        .join(" ")
        .toLowerCase();
      return text.includes(String(value).toLowerCase());
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const pageLabel = `${table.getState().pagination.pageIndex + 1} / ${table.getPageCount() || 1}`;
  const shouldShowSearch = showSearch ?? filterMode !== "none";
  const visibleRows = table.getRowModel().rows;

  return (
    <div className={wrapperClassName}>
      {(shouldShowSearch || showPagination) && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {shouldShowSearch ? (
            <input
              type="search"
              value={effectiveFilterValue}
              onChange={(event) => handleFilterValueChange(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-2xl border border-subtle bg-inset px-4 py-2 text-sm text-ink shadow-sm outline-none transition placeholder:text-ink-muted/70 focus:border-primary-300 md:max-w-sm"
            />
          ) : (
            <span />
          )}
          {showPagination && (
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              {showPageSizeSelector && (
                <select
                  value={table.getState().pagination.pageSize}
                  onChange={(event) => table.setPageSize(Number(event.target.value))}
                  className="rounded-full border border-subtle bg-inset px-3 py-1 font-semibold outline-none"
                  aria-label="Rows per page"
                >
                  {pageSizeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option} / page
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="rounded-full border border-subtle px-3 py-1 font-semibold transition hover:border-strong disabled:opacity-40"
              >
                Prev
              </button>
              <span>{pageLabel}</span>
              <button
                type="button"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="rounded-full border border-subtle px-3 py-1 font-semibold transition hover:border-strong disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {renderMobileRow && (
        <div className="space-y-3 md:hidden">
          {visibleRows.length === 0 ? (
            <div className="rounded-2xl border border-calm-100 px-4 py-6 text-center text-sm text-calm-500 dark:border-calm-800 dark:text-calm-400">
              {emptyMessage}
            </div>
          ) : (
            visibleRows.map((row) => (
              <div key={row.id}>{renderMobileRow({ row, item: row.original })}</div>
            ))
          )}
        </div>
      )}

      <div className={`${renderMobileRow ? "hidden md:block" : ""} overflow-x-auto`}>
        <div className={`${minWidthClassName} overflow-hidden rounded-2xl border border-subtle`}>
          <table className={tableClassName}>
            <thead className="sticky top-0 bg-raised/90 backdrop-blur">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="text-ink-muted">
                  {headerGroup.headers.map((header) => {
                    const sortState = header.column.getIsSorted();
                    const canSort = header.column.getCanSort();
                    return (
                      <th
                        key={header.id}
                        className="px-4 py-3 font-semibold"
                        aria-sort={canSort ? ariaSort(sortState) : undefined}
                      >
                        {header.isPlaceholder ? null : (
                          <div className="inline-flex items-center gap-2">
                            <span>
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                            </span>
                            {canSort && (
                              <button
                                type="button"
                                onClick={header.column.getToggleSortingHandler()}
                                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-transparent px-1 text-[10px] text-ink-muted/70 transition hover:border-subtle hover:text-ink"
                                aria-label={`Sort by ${String(header.column.columnDef.header ?? header.column.id)}, currently ${sortLabel(sortState)}`}
                              >
                                {sortIndicator(sortState)}
                              </button>
                            )}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-6 text-center text-ink-muted">
                    {emptyMessage}
                  </td>
                </tr>
              )}
              {visibleRows.map((row) => (
                <tr key={row.id} className="border-t border-subtle text-ink-muted">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
