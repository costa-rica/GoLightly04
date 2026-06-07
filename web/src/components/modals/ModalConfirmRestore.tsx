"use client";

import { useEffect, type MouseEvent } from "react";

type ModalConfirmRestoreProps = {
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function ModalConfirmRestore({
  isOpen,
  isLoading,
  onClose,
  onConfirm,
}: ModalConfirmRestoreProps) {
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

  if (!isOpen) return null;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-calm-900/50 px-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-overlay p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">
              Confirmation
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold text-ink">
              Restore Database
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-subtle px-3 py-1 text-xs font-semibold text-ink-muted transition hover:border-strong"
            aria-label="Close restore confirmation"
          >
            Close
          </button>
        </div>

        <p className="mt-4 text-sm text-ink-muted">
          This will permanently overwrite the current database and, if the
          backup package includes resource files, overwrite those files as well.
          This action cannot be undone.
        </p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-subtle px-4 py-2 text-xs font-semibold text-ink-muted transition hover:border-strong"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200"
            disabled={isLoading}
          >
            {isLoading ? "Restoring..." : "Yes, restore"}
          </button>
        </div>
      </div>
    </div>
  );
}
