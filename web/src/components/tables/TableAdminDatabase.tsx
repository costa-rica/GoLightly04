"use client";

import type { ColumnDef } from "@tanstack/react-table";

import type { BackupFile } from "@/lib/api/database";
import { formatDateTime, formatFileSize } from "@/lib/utils/formatters";

import AdminTable from "./AdminTable";

type TableAdminDatabaseProps = {
  backups: BackupFile[];
  onDownload: (filename: string) => void;
  onDelete: (filename: string) => void;
};

export default function TableAdminDatabase({
  backups,
  onDownload,
  onDelete,
}: TableAdminDatabaseProps) {
  const columns: ColumnDef<BackupFile>[] = [
    {
      accessorKey: "filename",
      header: "Filename",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onDownload(row.original.filename)}
          className="max-w-[280px] truncate text-left font-semibold text-primary-600 hover:underline"
        >
          {row.original.filename}
        </button>
      ),
    },
    {
      accessorKey: "size",
      header: "Size",
      cell: ({ row }) => row.original.sizeFormatted || formatFileSize(row.original.size),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
    {
      id: "delete",
      header: "Delete",
      enableSorting: false,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onDelete(row.original.filename)}
          className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-500"
        >
          Delete
        </button>
      ),
    },
  ];

  return <AdminTable columns={columns} data={backups} emptyMessage="No backups available." />;
}
