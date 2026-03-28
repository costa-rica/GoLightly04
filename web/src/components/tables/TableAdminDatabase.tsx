"use client";

import type { BackupFile } from "@/lib/api/database";
import { formatDateTime, formatFileSize } from "@/lib/utils/formatters";

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
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px] overflow-hidden rounded-2xl border border-calm-100">
        <table className="w-full text-left text-xs md:text-sm">
          <thead className="sticky top-0 bg-white/90 backdrop-blur">
            <tr className="text-calm-500">
              <th className="px-4 py-3 font-semibold">Filename</th>
              <th className="px-4 py-3 font-semibold">Size</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 text-right font-semibold">Delete</th>
            </tr>
          </thead>
          <tbody>
            {backups.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-calm-500">
                  No backups available.
                </td>
              </tr>
            )}
            {backups.map((backup) => (
              <tr key={backup.filename} className="border-t border-calm-100 text-calm-700">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onDownload(backup.filename)}
                    className="max-w-[280px] truncate text-left font-semibold text-primary-600 transition hover:text-primary-700 hover:underline"
                    title={backup.filename}
                    aria-label={`Download backup ${backup.filename}`}
                  >
                    {backup.filename}
                  </button>
                </td>
                <td className="px-4 py-3 text-calm-700">
                  {backup.sizeFormatted || formatFileSize(backup.size)}
                </td>
                <td className="px-4 py-3 text-calm-600">
                  {formatDateTime(backup.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onDelete(backup.filename)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-200 text-xs font-semibold text-red-500 transition hover:border-red-300 hover:text-red-600"
                    aria-label={`Delete backup ${backup.filename}`}
                  >
                    X
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
