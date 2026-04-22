"use client";

import { useEffect } from "react";

type ToastProps = {
  message: string;
  variant?: "success" | "error";
  duration?: number;
  onClose: () => void;
};

export default function Toast({
  message,
  variant = "success",
  duration = 3000,
  onClose,
}: ToastProps) {
  useEffect(() => {
    const timeout = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timeout);
  }, [duration, onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-[60]">
      <div
        className={`rounded-2xl border px-4 py-3 text-sm shadow-lg ${
          variant === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-red-200 bg-red-50 text-red-600"
        }`}
        role="status"
      >
        {message}
      </div>
    </div>
  );
}
