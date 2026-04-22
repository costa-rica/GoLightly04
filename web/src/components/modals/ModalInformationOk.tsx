"use client";

import { useEffect, type MouseEvent } from "react";

type Variant = "information" | "warning" | "error";

interface ModalInformationOkProps {
  isOpen: boolean;
  onClose: () => void;
  variant?: Variant;
  title: string;
  message: string;
}

export default function ModalInformationOk({
  isOpen,
  onClose,
  variant = "information",
  title,
  message,
}: ModalInformationOkProps) {
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

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Define styles based on variant
  const variantStyles = {
    information: {
      border: "border-blue-200",
      bg: "bg-blue-50",
      iconColor: "text-blue-600",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
    warning: {
      border: "border-amber-200",
      bg: "bg-amber-50",
      iconColor: "text-amber-600",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      ),
    },
    error: {
      border: "border-red-200",
      bg: "bg-red-50",
      iconColor: "text-red-600",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
  };

  const styles = variantStyles[variant];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-calm-900/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-calm-400 hover:text-calm-600 transition"
          aria-label="Close modal"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Modal content */}
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`flex-shrink-0 rounded-full p-2 ${styles.bg} ${styles.border} border`}>
            <div className={styles.iconColor}>{styles.icon}</div>
          </div>

          {/* Text content */}
          <div className="flex-1 pt-1">
            <h2 className="text-xl font-display font-bold text-calm-900">
              {title}
            </h2>
            <p className="mt-2 text-sm text-calm-600 leading-relaxed">
              {message}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
