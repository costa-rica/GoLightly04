"use client";

import { useEffect, useState, type MouseEvent } from "react";
import type { AdminUser } from "@/lib/api/admin";

type ModalConfirmDeleteUserProps = {
  isOpen: boolean;
  user: AdminUser | null;
  isLoading?: boolean;
  onClose: () => void;
  onConfirm: (savePublicMeditations: boolean) => void;
};

export default function ModalConfirmDeleteUser({
  isOpen,
  user,
  isLoading = false,
  onClose,
  onConfirm,
}: ModalConfirmDeleteUserProps) {
  const [savePublicMeditations, setSavePublicMeditations] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isLoading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    // Reset checkbox when modal opens/closes
    if (!isOpen) {
      setSavePublicMeditations(false);
    }
  }, [isOpen]);

  if (!isOpen || !user) return null;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isLoading) {
      onClose();
    }
  };

  const handleConfirm = () => {
    onConfirm(savePublicMeditations);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-calm-900/50 backdrop-blur-sm px-4"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-overlay p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">
              Confirmation
            </p>
            <h2 className="mt-2 text-xl font-display font-semibold text-ink">
              Delete {user.email}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-full border border-subtle px-3 py-1 text-xs font-semibold text-ink-muted transition hover:border-strong disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close delete confirmation"
          >
            Close
          </button>
        </div>

        <p className="mt-4 text-sm text-ink-muted">
          This will permanently remove the user account.
        </p>

        {user.hasPublicMeditations && (
          <div className="mt-4 rounded-lg border border-subtle bg-inset p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={savePublicMeditations}
                onChange={(e) => setSavePublicMeditations(e.target.checked)}
                disabled={isLoading}
                className="mt-0.5 h-4 w-4 rounded border-strong text-primary-600 focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed"
              />
              <div>
                <span className="text-sm font-semibold text-ink">
                  Keep public meditations
                </span>
                <p className="mt-1 text-xs text-ink-muted">
                  Convert user to benevolent account to preserve their public
                  meditations
                </p>
              </div>
            </label>
          </div>
        )}

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
            onClick={handleConfirm}
            className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200"
            disabled={isLoading}
          >
            {isLoading ? "Deleting..." : "Delete user"}
          </button>
        </div>
      </div>
    </div>
  );
}
