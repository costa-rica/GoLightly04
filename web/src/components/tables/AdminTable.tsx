"use client";

import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";

type AdminTableProps<TData> = {
  columns: ColumnDef<TData>[];
  data: TData[];
  emptyMessage?: string;
};

export default function AdminTable<TData>({
  columns,
  data,
  emptyMessage = "No records found.",
}: AdminTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const text = Object.values(row.original as Record<string, unknown>)
        .join(" ")
        .toLowerCase();
      return text.includes(String(filterValue).toLowerCase());
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 25,
      },
    },
  });

  const pageLabel = useMemo(
    () => `${table.getState().pagination.pageIndex + 1} / ${table.getPageCount() || 1}`,
    [table],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          type="search"
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder="Search table..."
          className="w-full rounded-2xl border border-calm-200 bg-white px-4 py-2 text-sm text-calm-800 shadow-sm outline-none transition focus:border-primary-300 md:max-w-sm"
        />
        <div className="flex items-center gap-2 text-xs text-calm-500">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="rounded-full border border-calm-200 px-3 py-1 font-semibold disabled:opacity-40"
          >
            Prev
          </button>
          <span>{pageLabel}</span>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="rounded-full border border-calm-200 px-3 py-1 font-semibold disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[960px] overflow-hidden rounded-2xl border border-calm-100">
          <table className="w-full text-left text-xs md:text-sm">
            <thead className="sticky top-0 bg-white/90 backdrop-blur">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="text-calm-500">
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3 font-semibold">
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-2"
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {header.column.getCanSort() && (
                            <span className="text-[10px] text-calm-400">
                              {header.column.getIsSorted() === "asc"
                                ? "▲"
                                : header.column.getIsSorted() === "desc"
                                  ? "▼"
                                  : "↕"}
                            </span>
                          )}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-6 text-center text-calm-500"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              )}
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-t border-calm-100 text-calm-700">
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
