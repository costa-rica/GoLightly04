"use client";

import type { ColumnDef } from "@tanstack/react-table";

import type { SoundFile } from "@/lib/api/sounds";

import AdminTable from "./AdminTable";

type TableAdminSoundsFilesProps = {
  soundFiles: SoundFile[];
  onDelete: (soundFile: SoundFile) => void;
};

export default function TableAdminSoundsFiles({
  soundFiles,
  onDelete,
}: TableAdminSoundsFilesProps) {
  const columns: ColumnDef<SoundFile>[] = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },
    { accessorKey: "description", header: "Description" },
    { accessorKey: "filename", header: "Filename" },
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
      data={soundFiles}
      emptyMessage="No sound files found."
    />
  );
}
