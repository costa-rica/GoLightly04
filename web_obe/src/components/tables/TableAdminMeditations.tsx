"use client";

import type { Meditation } from "@/store/features/meditationSlice";

type TableAdminMeditationsProps = {
  meditations: Meditation[];
  onDelete: (meditation: Meditation) => void;
};

export default function TableAdminMeditations({
  meditations,
  onDelete,
}: TableAdminMeditationsProps) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px] overflow-hidden rounded-2xl border border-calm-100">
        <table className="w-full text-left text-xs md:text-sm">
          <thead className="sticky top-0 bg-white/90 backdrop-blur">
            <tr className="text-calm-500">
              <th className="px-4 py-3 font-semibold">ID</th>
              <th className="px-4 py-3 font-semibold">Title</th>
              <th className="px-4 py-3 font-semibold">Visibility</th>
              <th className="px-4 py-3 text-right font-semibold">Listens</th>
              <th className="px-4 py-3 text-right font-semibold">Delete</th>
            </tr>
          </thead>
          <tbody>
            {meditations.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-calm-500">
                  No meditations found.
                </td>
              </tr>
            )}
            {meditations.map((meditation) => {
              const listenCount =
                (meditation as { listenCount?: number }).listenCount ??
                (meditation as { listens?: number }).listens ??
                0;

              return (
                <tr key={meditation.id} className="border-t border-calm-100 text-calm-700">
                  <td className="px-4 py-3 font-medium text-calm-900">{meditation.id}</td>
                  <td className="px-4 py-3 text-calm-900">{meditation.title}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-calm-200 px-3 py-1 text-xs font-semibold text-calm-600">
                      {meditation.visibility}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-calm-600">{listenCount}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onDelete(meditation)}
                      className="inline-flex items-center gap-2 rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 transition hover:border-red-300"
                      aria-label={`Delete meditation ${meditation.title}`}
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
