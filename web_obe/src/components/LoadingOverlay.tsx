"use client";

import { useEffect } from "react";
import { useAppSelector } from "@/store/hooks";

export default function LoadingOverlay() {
  const { isOpen, message } = useAppSelector((state) => state.ui.loading);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-calm-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-4">
        {/* Spinner */}
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 rounded-full border-4 border-calm-200/30"></div>
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary-500 border-r-primary-500"></div>
        </div>

        {/* Optional message */}
        {message && (
          <p className="text-center text-sm font-medium text-white">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
