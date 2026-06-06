"use client";

import type { ColumnDef } from "@tanstack/react-table";

import type { SoundFile } from "@/lib/api/sounds";

import AdminTable from "./AdminTable";

type TableAdminSoundsFilesProps = {
  soundFiles: SoundFile[];
  onEdit: (soundFile: SoundFile) => void;
  onDelete: (soundFile: SoundFile) => void;
};

export default function TableAdminSoundsFiles({
  soundFiles,
  onEdit,
  onDelete,
}: TableAdminSoundsFilesProps) {
  const columns: ColumnDef<SoundFile>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onEdit(row.original)}
          className="font-semibold text-primary-700 underline-offset-4 transition hover:text-primary-800 hover:underline dark:text-primary-300 dark:hover:text-primary-200"
        >
          {row.original.id}
        </button>
      ),
    },
    { accessorKey: "name", header: "Name" },
    { accessorKey: "description", header: "Description" },
    { accessorKey: "filename", header: "Filename" },
    {
      accessorKey: "duration_seconds",
      header: "Duration",
      cell: ({ row }) =>
        row.original.duration_seconds === null ||
        row.original.duration_seconds === undefined
          ? "Unknown"
          : `${row.original.duration_seconds}s`,
    },
    {
      id: "delete",
      header: "Delete",
      enableSorting: false,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onDelete(row.original)}
          className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 dark:border-red-500/40 dark:text-red-300"
        >
          Delete
        </button>
      ),
    },
  ];

  return (
    <AdminTable
      columns={columns}
      data={soundFiles}
      emptyMessage="No sound files found."
    />
  );
}
