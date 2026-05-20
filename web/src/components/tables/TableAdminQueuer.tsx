"use client";

import type { ColumnDef } from "@tanstack/react-table";

import type { QueueRecord } from "@/lib/api/admin";
import {
  formatDateTime,
  formatQueueStatus,
  truncateText,
} from "@/lib/utils/formatters";

import AdminTable from "./AdminTable";

type TableAdminQueuerProps = {
  records: QueueRecord[];
  onDelete: (record: QueueRecord) => void;
  onRequeue: (record: QueueRecord) => void;
};

const statusStyles: Record<QueueRecord["status"], string> = {
  pending: "border-subtle bg-inset text-ink-muted",
  processing: "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300",
  complete: "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300",
  failed: "border-red-200 bg-red-50 text-red-600 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300",
};

export default function TableAdminQueuer({
  records,
  onDelete,
  onRequeue,
}: TableAdminQueuerProps) {
  const columns: ColumnDef<QueueRecord>[] = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "meditationId", header: "Meditation ID" },
    { accessorKey: "sequence", header: "Sequence" },
    { accessorKey: "type", header: "Type" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[row.original.status]}`}
        >
          {formatQueueStatus(row.original.status)}
        </span>
      ),
    },
    { accessorKey: "attemptCount", header: "Attempts" },
    {
      accessorKey: "lastAttemptedAt",
      header: "Last Attempted",
      cell: ({ row }) =>
        row.original.lastAttemptedAt
          ? formatDateTime(row.original.lastAttemptedAt)
          : "Never",
    },
    {
      accessorKey: "lastError",
      header: "Last Error",
      cell: ({ row }) =>
        row.original.lastError ? truncateText(row.original.lastError, 48) : "None",
    },
    {
      accessorKey: "filePath",
      header: "File Path",
      cell: ({ row }) =>
        row.original.filePath ? truncateText(row.original.filePath, 48) : "None",
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
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          {(row.original.status === "pending" || row.original.status === "failed") && (
            <button
              type="button"
              onClick={() => onRequeue(row.original)}
              className="rounded-full border border-primary-200 px-3 py-1 text-xs font-semibold text-primary-700 dark:border-primary-500/40 dark:text-primary-300"
            >
              Requeue
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(row.original)}
            className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 dark:border-red-500/40 dark:text-red-300"
          >
            Delete meditation
          </button>
        </div>
      ),
    },
  ];

  return <AdminTable columns={columns} data={records} emptyMessage="No queue records found." />;
}
