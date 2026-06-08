"use client";

import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import type {
  AdminMeditation,
  AdminUpdateMeditationMetadataRequest,
} from "@golightly/shared-types";

type ModalEditAdminMeditationProps = {
  meditation: AdminMeditation | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSave: (
    meditationId: number,
    data: AdminUpdateMeditationMetadataRequest,
  ) => Promise<void>;
};

export default function ModalEditAdminMeditation({
  meditation,
  isSubmitting,
  onClose,
  onSave,
}: ModalEditAdminMeditationProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [error, setError] = useState<string | null>(null);

  const isOpen = !!meditation;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!meditation) return;
    setTitle(meditation.title);
    setDescription(meditation.description ?? "");
    setVisibility(meditation.visibility === "private" ? "private" : "public");
    setError(null);
  }, [meditation]);

  if (!meditation) return null;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }

    try {
      await onSave(meditation.id, {
        title: trimmedTitle,
        description,
        visibility,
      });
    } catch (err: any) {
      setError(
        err?.response?.data?.error?.message ||
          "Unable to update meditation metadata.",
      );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-calm-900/50 px-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-overlay p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">
              Meditations
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold text-ink">
              Edit Meditation
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-subtle px-3 py-1 text-xs font-semibold text-ink-muted transition hover:border-strong"
            aria-label="Close edit modal"
            disabled={isSubmitting}
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200">
              {error}
            </div>
          )}

          <div>
            <label
              className="text-sm font-semibold text-ink"
              htmlFor="edit-admin-meditation-title"
            >
              Title
            </label>
            <input
              id="edit-admin-meditation-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-subtle bg-inset px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted/70 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-500/30"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label
              className="text-sm font-semibold text-ink"
              htmlFor="edit-admin-meditation-description"
            >
              Description
            </label>
            <textarea
              id="edit-admin-meditation-description"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-2 w-full resize-none rounded-2xl border border-subtle bg-inset px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted/70 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-500/30"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label
              className="text-sm font-semibold text-ink"
              htmlFor="edit-admin-meditation-visibility"
            >
              Visibility
            </label>
            <select
              id="edit-admin-meditation-visibility"
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as "public" | "private")
              }
              className="mt-2 w-full rounded-2xl border border-subtle bg-inset px-3 py-2 text-sm text-ink outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-500/30"
              disabled={isSubmitting}
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-subtle px-4 py-2 text-xs font-semibold text-ink-muted transition hover:border-strong"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-primary-200"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
