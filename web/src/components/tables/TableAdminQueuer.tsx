"use client";

import type { QueueRecord } from "@/lib/api/admin";
import { formatDateTime, formatQueueStatus } from "@/lib/utils/formatters";

type TableAdminQueuerProps = {
  records: QueueRecord[];
  onDelete: (record: QueueRecord) => void;
};

const statusStyles: Record<QueueRecord["status"], string> = {
  queued: "border-calm-200 bg-calm-50 text-calm-600",
  started: "border-blue-200 bg-blue-50 text-blue-600",
  elevenlabs: "border-purple-200 bg-purple-50 text-purple-600",
  concatenator: "border-orange-200 bg-orange-50 text-orange-600",
  done: "border-emerald-200 bg-emerald-50 text-emerald-600",
};

export default function TableAdminQueuer({ records, onDelete }: TableAdminQueuerProps) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px] overflow-hidden rounded-2xl border border-calm-100">
        <table className="w-full text-left text-xs md:text-sm">
          <thead className="sticky top-0 bg-white/90 backdrop-blur">
            <tr className="text-calm-500">
              <th className="px-4 py-3 font-semibold">ID</th>
              <th className="px-4 py-3 font-semibold">User ID</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Job Filename</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 text-right font-semibold">Delete</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-calm-500">
                  No queue records found.
                </td>
              </tr>
            )}
            {records.map((record) => (
              <tr key={record.id} className="border-t border-calm-100 text-calm-700">
                <td className="px-4 py-3 font-medium text-calm-900">{record.id}</td>
                <td className="px-4 py-3 text-calm-700">{record.userId}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[record.status]}`}
                  >
                    {formatQueueStatus(record.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-calm-700">{record.jobFilename}</td>
                <td className="px-4 py-3 text-calm-600">
                  {formatDateTime(record.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onDelete(record)}
                    className="inline-flex items-center gap-2 rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 transition hover:border-red-300"
                    aria-label={`Delete queue record ${record.id}`}
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
