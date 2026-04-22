"use client";

import type { SoundFile } from "@/lib/api/sounds";

type TableAdminSoundsFilesProps = {
  soundFiles: SoundFile[];
  onDelete: (soundFile: SoundFile) => void;
};

export default function TableAdminSoundsFiles({
  soundFiles,
  onDelete,
}: TableAdminSoundsFilesProps) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px] overflow-hidden rounded-2xl border border-calm-100">
        <table className="w-full text-left text-xs md:text-sm">
          <thead className="sticky top-0 bg-white/90 backdrop-blur">
            <tr className="text-calm-500">
              <th className="px-4 py-3 font-semibold">ID</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 text-right font-semibold">Delete</th>
            </tr>
          </thead>
          <tbody>
            {soundFiles.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-calm-500">
                  No sound files found.
                </td>
              </tr>
            )}
            {soundFiles.map((soundFile) => (
              <tr key={soundFile.id} className="border-t border-calm-100 text-calm-700">
                <td className="px-4 py-3 font-medium text-calm-900">{soundFile.id}</td>
                <td className="px-4 py-3 text-calm-700">{soundFile.name}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onDelete(soundFile)}
                    className="inline-flex items-center gap-2 rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 transition hover:border-red-300"
                    aria-label={`Delete sound file ${soundFile.name}`}
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
