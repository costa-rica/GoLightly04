"use client";

import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { uploadSoundFile } from "@/lib/api/sounds";
import { validateMp3File } from "@/lib/utils/validation";

type ModalUploadSoundFileProps = {
  isOpen: boolean;
  onClose: () => void;
  onUploaded: () => void;
};

export default function ModalUploadSoundFile({
  isOpen,
  onClose,
  onUploaded,
}: ModalUploadSoundFileProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

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
    if (!isOpen) return;
    setFile(null);
    setName("");
    setDescription("");
    setError(null);
    setProgress(0);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!file) {
      setError("Please select an MP3 file to upload.");
      return;
    }

    const validation = validateMp3File(file);
    if (!validation.valid) {
      setError(validation.message || "Invalid file.");
      return;
    }

    setIsSubmitting(true);
    setProgress(0);

    try {
      await uploadSoundFile(
        file,
        name.trim() || undefined,
        description.trim() || undefined,
        (percent) => setProgress(percent)
      );
      onUploaded();
      onClose();
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        setError("A sound file with this name already exists.");
      } else if (status === 413) {
        setError("File size must be less than 50MB.");
      } else if (err?.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError("Unable to upload sound file.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-calm-900/50 backdrop-blur-sm px-4"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-overlay p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">Sound Files</p>
            <h2 className="mt-2 text-xl font-display font-semibold text-ink">
              Upload Sound File
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-subtle px-3 py-1 text-xs font-semibold text-ink-muted transition hover:border-strong"
            aria-label="Close upload modal"
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
            <label className="text-sm font-semibold text-ink" htmlFor="sound-file">
              MP3 file
            </label>
            <input
              id="sound-file"
              type="file"
              accept=".mp3,audio/mpeg"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] || null;
                setFile(nextFile);
                setError(null);
              }}
              className="mt-2 w-full rounded-2xl border border-subtle bg-inset px-3 py-2 text-sm text-ink"
              disabled={isSubmitting}
            />
            <p className="mt-2 text-xs text-ink-muted">Max file size: 50MB.</p>
          </div>

          <div>
            <label className="text-sm font-semibold text-ink" htmlFor="sound-name">
              Name (optional)
            </label>
            <input
              id="sound-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-subtle bg-inset px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted/70 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-500/30"
              placeholder="Soft rain"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-ink" htmlFor="sound-description">
              Description (optional)
            </label>
            <textarea
              id="sound-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-subtle bg-inset px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted/70 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-500/30"
              placeholder="Gentle ambient soundscape."
              disabled={isSubmitting}
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span>Upload progress</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-inset">
              <div
                className="h-full rounded-full bg-primary-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
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
              {isSubmitting ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
