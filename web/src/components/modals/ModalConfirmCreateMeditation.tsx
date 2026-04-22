"use client";

import { useEffect, type MouseEvent } from "react";

type MeditationRow = {
  id: number;
  type: "text" | "pause" | "sound";
  text: string;
  speed: string;
  pauseDuration: string;
  soundFile: string;
};

type ModalConfirmCreateMeditationProps = {
  isOpen: boolean;
  rows: MeditationRow[];
  soundFiles: Array<{ name: string; filename: string }>;
  title: string;
  description: string;
  visibility: "public" | "private";
  errors: { title?: string; description?: string };
  isSubmitting: boolean;
  maxDescriptionLength: number;
  onClose: () => void;
  onConfirm: () => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onVisibilityChange: (value: "public" | "private") => void;
  onTitleBlur: () => void;
};

export default function ModalConfirmCreateMeditation({
  isOpen,
  rows,
  soundFiles,
  title,
  description,
  visibility,
  errors,
  isSubmitting,
  maxDescriptionLength,
  onClose,
  onConfirm,
  onTitleChange,
  onDescriptionChange,
  onVisibilityChange,
  onTitleBlur,
}: ModalConfirmCreateMeditationProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isSubmitting) {
      onClose();
    }
  };

  const getRowSummary = (row: MeditationRow): string => {
    if (row.type === "text") {
      const speedText = row.speed ? ` (speed: ${row.speed})` : "";
      const truncatedText = row.text.length > 50 ? `${row.text.slice(0, 50)}...` : row.text;
      return `Text: "${truncatedText}"${speedText}`;
    }
    if (row.type === "pause") {
      return `Pause: ${row.pauseDuration} seconds`;
    }
    const soundName = soundFiles.find((s) => s.filename === row.soundFile)?.name || row.soundFile;
    return `Sound: ${soundName}`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-calm-900/50 backdrop-blur-sm px-4"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-calm-400">Confirm Creation</p>
            <h2 className="mt-2 text-xl font-display font-semibold text-calm-900">
              Create Meditation
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full border border-calm-200 px-3 py-1 text-xs font-semibold text-calm-500 transition hover:border-calm-300 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <div className="mt-6">
          <p className="text-sm font-medium text-calm-500">Your meditation:</p>
          <ul className="mt-2 space-y-1 text-xs text-calm-400">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start gap-2">
                <span className="mt-1">•</span>
                <span>{getRowSummary(row)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-semibold text-calm-700" htmlFor="modal-meditation-title">
              Title
            </label>
            <input
              id="modal-meditation-title"
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              onBlur={onTitleBlur}
              disabled={isSubmitting}
              className={`mt-2 w-full rounded-2xl border px-4 py-3 text-sm text-calm-900 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50 ${
                errors.title ? "border-red-300" : "border-calm-200"
              }`}
              placeholder="Evening clarity"
            />
            {errors.title && <p className="mt-2 text-xs text-red-500">{errors.title}</p>}
          </div>

          <div>
            <label className="text-sm font-semibold text-calm-700" htmlFor="modal-meditation-description">
              Description (optional)
            </label>
            <textarea
              id="modal-meditation-description"
              rows={3}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              disabled={isSubmitting}
              className={`mt-2 w-full rounded-2xl border px-4 py-3 text-sm text-calm-900 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50 ${
                errors.description ? "border-red-300" : "border-calm-200"
              }`}
              placeholder="Set an intention for the day with gentle pauses."
            />
            <div className="mt-2 flex items-center justify-between text-xs text-calm-500">
              <span>{errors.description || "Keep it concise and helpful."}</span>
              <span>
                {description.length}/{maxDescriptionLength}
              </span>
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-calm-700" htmlFor="modal-meditation-visibility">
              Visibility
            </label>
            <select
              id="modal-meditation-visibility"
              value={visibility}
              onChange={(e) => onVisibilityChange(e.target.value as "public" | "private")}
              disabled={isSubmitting}
              className="mt-2 w-full rounded-2xl border border-calm-200 bg-white px-4 py-3 text-sm text-calm-900 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
            <p className="mt-2 text-xs text-calm-500">
              Private meditations are only visible to you.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full border border-calm-200 px-4 py-2 text-xs font-semibold text-calm-600 transition hover:border-calm-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="rounded-full bg-primary-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-primary-200"
          >
            {isSubmitting ? "Creating..." : "Create Meditation"}
          </button>
        </div>
      </div>
    </div>
  );
}
