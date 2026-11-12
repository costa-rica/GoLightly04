"use client";

import type { ReactNode } from "react";

type AdminPageShellProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: ReactNode;
};

export default function AdminPageShell({
  title,
  description,
  actions,
  loading,
  error,
  onRetry,
  children,
}: AdminPageShellProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-subtle bg-raised px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold text-ink">{title}</h1>
          <p className="text-sm text-ink-muted">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      <div className="rounded-3xl border border-subtle bg-raised p-4 shadow-sm md:p-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-2xl border border-subtle bg-inset px-4 py-3 animate-pulse"
              >
                <div className="h-4 w-1/3 rounded-full bg-strong/60" />
                <div className="h-4 w-20 rounded-full bg-strong/60" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-600">
            <p>{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300"
            >
              Retry
            </button>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
