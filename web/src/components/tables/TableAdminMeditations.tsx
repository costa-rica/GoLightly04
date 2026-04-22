"use client";

import type { ColumnDef } from "@tanstack/react-table";

import type { Meditation } from "@/store/features/meditationSlice";
import { formatDateTime } from "@/lib/utils/formatters";

import AdminTable from "./AdminTable";

type TableAdminMeditationsProps = {
  meditations: Meditation[];
  onDelete: (meditation: Meditation) => void;
};

export default function TableAdminMeditations({
  meditations,
  onDelete,
}: TableAdminMeditationsProps) {
  const columns: ColumnDef<Meditation>[] = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "title", header: "Title" },
    {
      accessorKey: "ownerUserId",
      header: "Owner",
      cell: ({ row }) => row.original.ownerUserId ?? "Unknown",
    },
    { accessorKey: "visibility", header: "Visibility" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => row.original.status ?? "pending",
    },
    { accessorKey: "listenCount", header: "Listen Count" },
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
          onClick={() => onDelete(row.original)}
          className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-500"
        >
          Delete
        </button>
      ),
    },
  ];

  return (
    <AdminTable
      columns={columns}
      data={meditations}
      emptyMessage="No meditations found."
    />
  );
}
