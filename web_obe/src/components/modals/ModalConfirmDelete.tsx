"use client";

import { useEffect, type MouseEvent } from "react";

type ModalConfirmDeleteProps = {
  isOpen: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  isLoading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function ModalConfirmDelete({
  isOpen,
  title = "Delete meditation",
  message = "Are you sure you want to delete this meditation? This action cannot be undone.",
  confirmLabel = "Delete",
  isLoading = false,
  onClose,
  onConfirm,
}: ModalConfirmDeleteProps) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-calm-900/50 backdrop-blur-sm px-4"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-calm-400">Confirmation</p>
            <h2 className="mt-2 text-xl font-display font-semibold text-calm-900">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-calm-200 px-3 py-1 text-xs font-semibold text-calm-500 transition hover:border-calm-300"
            aria-label="Close delete confirmation"
          >
            Close
          </button>
        </div>

        <p className="mt-4 text-sm text-calm-600">{message}</p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-calm-200 px-4 py-2 text-xs font-semibold text-calm-600 transition hover:border-calm-300"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300"
            disabled={isLoading}
          >
            {isLoading ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
