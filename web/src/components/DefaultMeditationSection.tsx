"use client";

import { useCallback, useEffect, useState } from "react";
import type { Meditation } from "@golightly/shared-types";
import AudioPlayer from "@/components/AudioPlayer";
import { getDefaultMeditation } from "@/lib/api/meditations";
import { useAppSelector } from "@/store/hooks";
import { formatDurationOrDash } from "@/lib/utils/formatters";

export default function DefaultMeditationSection() {
  const { isAuthenticated, accessToken } = useAppSelector((state) => state.auth);
  const [meditation, setMeditation] = useState<Meditation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noDefault, setNoDefault] = useState(false);

  const fetchDefault = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNoDefault(false);
    try {
      const response = await getDefaultMeditation(isAuthenticated ? accessToken : null);
      setMeditation(response.meditation);
    } catch (err: any) {
      const code = err?.response?.data?.error?.code;
      if (code === "NO_DEFAULT_MEDITATION") {
        setNoDefault(true);
        setMeditation(null);
        return;
      }
      setError(err?.response?.data?.error?.message || "Unable to load the default meditation.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, isAuthenticated]);

  useEffect(() => {
    void fetchDefault();
  }, [fetchDefault]);

  if (loading) {
    return (
      <section className="rounded-3xl border border-calm-200/70 bg-white p-6 shadow-sm dark:border-calm-800 dark:bg-calm-900">
        <div className="h-5 w-48 animate-pulse rounded-full bg-calm-200 dark:bg-calm-700" />
        <div className="mt-4 h-10 w-full animate-pulse rounded-full bg-calm-100 dark:bg-calm-800" />
      </section>
    );
  }

  if (noDefault) {
    return (
      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-800 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
        <h2 className="text-xl font-display font-semibold">No default meditation selected</h2>
        {isAuthenticated && (
          <p className="mt-2 text-sm">
            An admin needs to select a default meditation before this section can play.
          </p>
        )}
      </section>
    );
  }

  if (error || !meditation) {
    return (
      <section className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
        <h2 className="text-xl font-display font-semibold">Default meditation unavailable</h2>
        <p className="mt-2 text-sm">{error}</p>
        <button
          type="button"
          onClick={() => void fetchDefault()}
          className="mt-4 rounded-full border border-red-200 px-4 py-2 text-xs font-semibold transition hover:border-red-300"
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-calm-200/70 bg-white p-6 shadow-sm dark:border-calm-800 dark:bg-calm-900">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-calm-500 dark:text-calm-400">
            Default Meditation
          </p>
          <h2 className="mt-2 text-2xl font-display font-semibold text-calm-900 dark:text-calm-50">
            {meditation.title}
          </h2>
          {meditation.description && (
            <p className="mt-2 max-w-2xl text-sm text-calm-600 dark:text-calm-300">
              {meditation.description}
            </p>
          )}
          <p className="mt-2 text-xs text-calm-500 dark:text-calm-400">
            {formatDurationOrDash(meditation.durationSeconds)}
          </p>
        </div>
        {meditation.status === "complete" ? (
          <AudioPlayer meditationId={meditation.id} title={meditation.title} />
        ) : (
          <p className="text-sm text-calm-500 dark:text-calm-400">Default meditation is being prepared.</p>
        )}
      </div>
    </section>
  );
}
