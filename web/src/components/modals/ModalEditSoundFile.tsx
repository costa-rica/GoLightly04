"use client";

import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { updateSoundFile, type SoundFile } from "@/lib/api/sounds";

type ModalEditSoundFileProps = {
  soundFile: SoundFile | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function ModalEditSoundFile({
  soundFile,
  onClose,
  onSaved,
}: ModalEditSoundFileProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isOpen = !!soundFile;

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
    if (!soundFile) return;
    setName(soundFile.name);
    setDescription(soundFile.description ?? "");
    setDurationSeconds(
      soundFile.duration_seconds === null || soundFile.duration_seconds === undefined
        ? ""
        : String(soundFile.duration_seconds),
    );
    setError(null);
  }, [soundFile]);

  if (!soundFile) return null;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    const trimmedDuration = durationSeconds.trim();
    const parsedDuration =
      trimmedDuration === "" ? null : Number(trimmedDuration);
    if (
      parsedDuration !== null &&
      (!Number.isInteger(parsedDuration) || parsedDuration < 0)
    ) {
      setError("Duration must be a whole non-negative number of seconds.");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateSoundFile(soundFile.id, {
        name: trimmedName,
        description: description.trim() || null,
        duration_seconds: parsedDuration,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        setError("A sound file with this name already exists.");
      } else if (err?.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError("Unable to update sound file.");
      }
    } finally {
      setIsSubmitting(false);
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
            <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">Sound Files</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-ink">
              Edit Sound File
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
            <label className="text-sm font-semibold text-ink" htmlFor="edit-sound-name">
              Name
            </label>
            <input
              id="edit-sound-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-subtle bg-inset px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted/70 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-500/30"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-ink" htmlFor="edit-sound-description">
              Description
            </label>
            <textarea
              id="edit-sound-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-subtle bg-inset px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted/70 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-500/30"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-ink" htmlFor="edit-sound-duration">
              Duration seconds
            </label>
            <input
              id="edit-sound-duration"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={durationSeconds}
              onChange={(event) => setDurationSeconds(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-subtle bg-inset px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted/70 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-500/30"
              placeholder="Unknown"
              disabled={isSubmitting}
            />
            <p className="mt-2 text-xs text-ink-muted">
              Leave blank to mark duration as unknown.
            </p>
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
