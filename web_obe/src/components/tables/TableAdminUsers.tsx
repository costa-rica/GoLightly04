"use client";

import type { AdminUser } from "@/lib/api/admin";

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
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px] overflow-hidden rounded-2xl border border-calm-100">
        <table className="w-full text-left text-xs md:text-sm">
          <thead className="sticky top-0 bg-white/90 backdrop-blur">
            <tr className="text-calm-500">
              <th className="px-4 py-3 font-semibold">ID</th>
              <th className="px-4 py-3 font-semibold">Username</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 text-right font-semibold">Delete</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-calm-500">
                  No users found.
                </td>
              </tr>
            )}
            {users.map((user) => (
              <tr key={user.id} className="border-t border-calm-100 text-calm-700">
                <td className="px-4 py-3 font-medium text-calm-900">{user.id}</td>
                <td className="px-4 py-3 text-calm-700">
                  {user.username?.trim() || user.email}
                </td>
                <td className="px-4 py-3 text-calm-600">{user.email}</td>
                <td className="px-4 py-3 text-right">
                  {user.id === currentUserId ? (
                    <span className="text-xs text-calm-300">Current</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onDelete(user)}
                      className="inline-flex items-center gap-2 rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 transition hover:border-red-300"
                      aria-label={`Delete user ${user.email}`}
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 6v12" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 6v12" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6h4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6V4h6v2" />
                      </svg>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
