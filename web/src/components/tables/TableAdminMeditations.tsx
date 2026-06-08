"use client";

import type { ColumnDef } from "@tanstack/react-table";

import type { AdminMeditation } from "@/lib/api/admin";
import { formatDateTime, formatDurationOrDash } from "@/lib/utils/formatters";

import AdminTable from "./AdminTable";

type TableAdminMeditationsProps = {
  meditations: AdminMeditation[];
  onEdit: (meditation: AdminMeditation) => void;
  onDelete: (meditation: AdminMeditation) => void;
};

export default function TableAdminMeditations({
  meditations,
  onEdit,
  onDelete,
}: TableAdminMeditationsProps) {
  const columns: ColumnDef<AdminMeditation>[] = [
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
      accessorKey: "durationSeconds",
      header: "Length",
      cell: ({ row }) => formatDurationOrDash(row.original.durationSeconds),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
    {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      cell: ({ row }) => {
        const canEdit =
          row.original.isBenevolentOwned && row.original.stage === "library";

        return (
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(row.original)}
                className="rounded-full border border-primary-200 px-3 py-1 text-xs font-semibold text-primary-700 transition hover:border-primary-300 dark:border-primary-500/40 dark:text-primary-200"
              >
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(row.original)}
              className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 dark:border-red-500/40 dark:text-red-300"
            >
              Delete
            </button>
          </div>
        );
      },
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
