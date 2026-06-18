"use client";

import type { ColumnDef } from "@tanstack/react-table";

import DataTable from "./DataTable";

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
  return (
    <DataTable
      columns={columns}
      data={data}
      emptyMessage={emptyMessage}
      filterMode="global"
      searchPlaceholder="Search table..."
      pageSize={25}
      showPagination
      showPageSizeSelector={false}
      minWidthClassName="min-w-[960px]"
    />
  );
}
