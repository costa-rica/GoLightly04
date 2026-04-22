"use client";

import type { ColumnDef } from "@tanstack/react-table";

import type { AdminUser } from "@/lib/api/admin";
import { formatDateTime } from "@/lib/utils/formatters";

import AdminTable from "./AdminTable";

type TableAdminUsersProps = {
  users: AdminUser[];
  currentUserId?: number | null;
  onDelete: (user: AdminUser) => void;
};

export default function TableAdminUsers({
  users,
  currentUserId,
  onDelete,
}: TableAdminUsersProps) {
  const columns: ColumnDef<AdminUser>[] = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "email", header: "Email" },
    {
      accessorKey: "authProvider",
      header: "Auth Provider",
      cell: ({ row }) => row.original.authProvider ?? "local",
    },
    {
      accessorKey: "isEmailVerified",
      header: "Verified",
      cell: ({ row }) => (row.original.isEmailVerified ? "Yes" : "No"),
    },
    {
      accessorKey: "isAdmin",
      header: "Is Admin",
      cell: ({ row }) => (row.original.isAdmin ? "Yes" : "No"),
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
      cell: ({ row }) =>
        row.original.id === currentUserId ? (
          <span className="text-xs text-calm-300">Current</span>
        ) : (
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

  return <AdminTable columns={columns} data={users} emptyMessage="No users found." />;
}
