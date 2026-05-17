"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteMeditationObj,
  favoriteMeditation,
  getAllMeditations,
  updateMeditationObj,
} from "@/lib/api/meditations";
import AudioPlayer from "@/components/AudioPlayer";
import ModalMeditationDetails from "@/components/modals/ModalMeditationDetails";
import Toast from "@/components/Toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  deleteMeditation,
  updateMeditation,
  toggleFavorite,
  setError,
  setLoading,
  setMeditations,
  Meditation,
} from "@/store/features/meditationSlice";

export default function TableMeditation() {
  const dispatch = useAppDispatch();
  const { meditations, loading, error } = useAppSelector(
    (state) => state.meditation,
  );
  const { isAuthenticated, accessToken, user } = useAppSelector(
    (state) => state.auth,
  );
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedMeditation, setSelectedMeditation] =
    useState<Meditation | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);
  const pollingStartedAtRef = useRef<number | null>(null);

  const fetchMeditations = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) {
      dispatch(setLoading(true));
    }
    dispatch(setError(null));

    try {
      // Pass accessToken if authenticated - backend will return appropriate meditations
      const response = await getAllMeditations(
        isAuthenticated ? accessToken : null,
      );
      const meditations = response.meditations ?? [];

      // Set isOwned flag based on ownerUserId comparison
      const meditationsWithOwnership = meditations.map((meditation) => ({
        ...meditation,
        isOwned: user ? meditation.ownerUserId === user.id : undefined,
      }));

      dispatch(setMeditations(meditationsWithOwnership));
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message ||
        "Unable to load meditations. Please try again.";
      dispatch(setError(message));
    }
  }, [accessToken, dispatch, isAuthenticated, user]);

  useEffect(() => {
    fetchMeditations();
  }, [fetchMeditations]);

  // Backend already filters meditations based on authentication state:
  // - Anonymous: only public meditations
  // - Authenticated: public meditations + user's private meditations
  const visibleRows = useMemo(() => {
    return Array.isArray(meditations) ? meditations : [];
  }, [meditations]);
  const hasInFlight = useMemo(
    () =>
      visibleRows.some(
        (meditation) =>
          meditation.isOwned &&
          (meditation.status === "pending" || meditation.status === "processing"),
      ),
    [visibleRows],
  );

  useEffect(() => {
    if (!hasInFlight) {
      pollingStartedAtRef.current = null;
      return;
    }

    if (pollingStartedAtRef.current === null) {
      pollingStartedAtRef.current = Date.now();
    }

    const interval = window.setInterval(() => {
      const startedAt = pollingStartedAtRef.current ?? Date.now();
      if (Date.now() - startedAt > 5 * 60 * 1000) {
        window.clearInterval(interval);
        return;
      }
      void fetchMeditations({ silent: true });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [fetchMeditations, hasInFlight]);

  const handleToggleFavorite = async (
    meditationId: number,
    currentValue?: boolean,
  ) => {
    if (!isAuthenticated) return;
    const nextValue = !currentValue;
    dispatch(toggleFavorite({ id: meditationId, isFavorite: nextValue }));

    try {
      await favoriteMeditation(meditationId, nextValue);
    } catch (err) {
      dispatch(toggleFavorite({ id: meditationId, isFavorite: !nextValue }));
    }
  };

  const handleUpdate = async (
    id: number,
    data: {
      title?: string;
      description?: string;
      visibility?: "public" | "private";
    },
  ) => {
    try {
      const response = await updateMeditationObj(id, data);
      dispatch(updateMeditation(response.meditation));
      setToast({
        message: "Meditation updated successfully.",
        variant: "success",
      });
      setSelectedMeditation(null);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) {
        setToast({
          message: "You can only update your own meditations.",
          variant: "error",
        });
      } else if (status === 404) {
        setToast({ message: "Meditation not found.", variant: "error" });
      } else {
        setToast({
          message: "Unable to update meditation. Please try again.",
          variant: "error",
        });
      }
      throw err;
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMeditationObj(id);
      dispatch(deleteMeditation(id));
      setToast({
        message: "Meditation deleted successfully.",
        variant: "success",
      });
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) {
        setToast({
          message: "You can only delete your own meditations.",
          variant: "error",
        });
      } else if (status === 404) {
        setToast({ message: "Meditation not found.", variant: "error" });
      } else {
        setToast({
          message: "Unable to delete meditation. Please try again.",
          variant: "error",
        });
      }
      throw err;
    }
  };

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-2xl border border-calm-200/70 bg-white/80 px-4 py-3 text-left shadow-sm transition hover:border-primary-200 dark:border-calm-800 dark:bg-calm-900/80 dark:hover:border-primary-800"
        aria-expanded={isExpanded}
      >
        <div>
          <h2 className="text-xl font-display font-semibold text-calm-900 dark:text-calm-50">
            Meditations
          </h2>
          <p className="text-sm text-calm-500 dark:text-calm-400">Explore the community library</p>
        </div>
        <span className="text-calm-500 dark:text-calm-400">
          {isExpanded ? (
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 15l7-7 7 7"
              />
            </svg>
          ) : (
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          )}
        </span>
      </button>

      {isExpanded && (
        <div className="rounded-3xl border border-calm-200/70 bg-white p-4 shadow-sm dark:border-calm-800 dark:bg-calm-900 md:p-6">
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="flex animate-pulse items-center justify-between rounded-2xl border border-calm-100 bg-calm-50 px-4 py-3 dark:border-calm-800 dark:bg-calm-800"
                >
                  <div className="h-4 w-1/2 rounded-full bg-calm-200 dark:bg-calm-700" />
                  <div className="h-4 w-16 rounded-full bg-calm-200 dark:bg-calm-700" />
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-600">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void fetchMeditations()}
                className="mt-3 rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <div className="max-h-[360px] min-w-[520px] overflow-y-auto rounded-2xl border border-calm-100 dark:border-calm-800">
                  <table className="w-full text-left text-xs md:text-sm">
                    <thead className="sticky top-0 bg-white/90 backdrop-blur dark:bg-calm-900/90">
                      <tr className="text-calm-500 dark:text-calm-400">
                        <th className="px-4 py-3 font-semibold">Title</th>
                        <th className="px-4 py-3 font-semibold">Play</th>
                        {isAuthenticated && (
                          <th className="px-4 py-3 text-center font-semibold">
                            Favorite
                          </th>
                        )}
                        <th className="px-4 py-3 text-right font-semibold">
                          Listens
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={isAuthenticated ? 4 : 3}
                            className="px-4 py-6 text-center text-calm-500"
                          >
                            No meditations available yet.
                          </td>
                        </tr>
                      )}
                      {visibleRows.map((meditation) => {
                        const listenCount =
                          (meditation as { listenCount?: number }).listenCount ??
                          (meditation as { listens?: number }).listens ??
                          0;
                        const isInFlight =
                          meditation.isOwned &&
                          (meditation.status === "pending" || meditation.status === "processing");
                        const isFailed = meditation.isOwned && meditation.status === "failed";

                        return (
                          <tr
                            key={meditation.id}
                            className="border-t border-calm-100 text-calm-700 dark:border-calm-800 dark:text-calm-300"
                          >
                            <td className="px-4 py-3 font-medium text-calm-900 dark:text-calm-100">
                              <button
                                type="button"
                                onClick={() => setSelectedMeditation(meditation)}
                                className="text-left underline decoration-calm-300 underline-offset-2 transition hover:text-primary-700 hover:decoration-primary-500 dark:decoration-calm-600 dark:hover:text-primary-300"
                              >
                                {meditation.title}
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              {isInFlight ? (
                                <div className="flex items-center gap-2 text-xs text-calm-500 dark:text-calm-400">
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-calm-200 border-t-primary-500" />
                                  <span>Your meditation will be ready shortly…</span>
                                </div>
                              ) : isFailed ? (
                                <span className="text-xs text-red-600 dark:text-red-300">
                                  Generation failed. Edit or delete to try again.
                                </span>
                              ) : (
                                <AudioPlayer
                                  meditationId={meditation.id}
                                  title={meditation.title}
                                />
                              )}
                            </td>
                            {isAuthenticated && (
                              <td className="px-4 py-3 text-center">
                                {isInFlight || isFailed ? (
                                  <span className="text-xs text-calm-400">Pending</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleFavorite(
                                        meditation.id,
                                        meditation.isFavorite,
                                      )
                                    }
                                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm transition ${
                                      meditation.isFavorite
                                        ? "border-amber-200 bg-amber-50 text-amber-500"
                                        : "border-calm-200 text-calm-400 hover:border-primary-200 hover:text-primary-700 dark:border-calm-700 dark:text-calm-500 dark:hover:border-primary-500 dark:hover:text-primary-300"
                                    }`}
                                    aria-label={
                                      meditation.isFavorite
                                        ? `Remove ${meditation.title} from favorites`
                                        : `Add ${meditation.title} to favorites`
                                    }
                                  >
                                    ★
                                  </button>
                                )}
                              </td>
                            )}
                            <td className="px-4 py-3 text-right text-calm-600 dark:text-calm-400">
                              {listenCount}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="block md:hidden">
                {visibleRows.length === 0 ? (
                  <div className="rounded-2xl border border-calm-100 px-4 py-6 text-center text-sm text-calm-500 dark:border-calm-800 dark:text-calm-400">
                    No meditations available yet.
                  </div>
                ) : (
                  <div className="max-h-[360px] overflow-y-auto space-y-3">
                    {visibleRows.map((meditation) => {
                      const listenCount =
                        (meditation as { listenCount?: number }).listenCount ??
                        (meditation as { listens?: number }).listens ??
                        0;
                      const isInFlight =
                        meditation.isOwned &&
                        (meditation.status === "pending" || meditation.status === "processing");
                      const isFailed = meditation.isOwned && meditation.status === "failed";

                      return (
                        <div
                          key={meditation.id}
                          className="space-y-3 rounded-2xl border border-calm-100 bg-white p-4 dark:border-calm-800 dark:bg-calm-950/60"
                        >
                          {/* Title Row */}
                          <div>
                            <button
                              type="button"
                              onClick={() => setSelectedMeditation(meditation)}
                              className="text-left text-sm font-medium text-calm-900 underline decoration-calm-300 underline-offset-2 transition hover:text-primary-700 hover:decoration-primary-500 dark:text-calm-100 dark:decoration-calm-600 dark:hover:text-primary-300"
                            >
                              {meditation.title}
                            </button>
                          </div>

                          {/* Controls Row */}
                          <div className="flex items-center justify-between gap-3">
                            {isInFlight ? (
                              <div className="flex items-center gap-2 text-xs text-calm-500 dark:text-calm-400">
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-calm-200 border-t-primary-500" />
                                <span>Your meditation will be ready shortly…</span>
                              </div>
                            ) : isFailed ? (
                              <span className="text-xs text-red-600 dark:text-red-300">
                                Generation failed. Edit or delete to try again.
                              </span>
                            ) : (
                              <AudioPlayer
                                meditationId={meditation.id}
                                title={meditation.title}
                              />
                            )}
                            <div className="flex items-center gap-3">
                              {isAuthenticated && !isInFlight && !isFailed && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleFavorite(
                                      meditation.id,
                                      meditation.isFavorite,
                                    )
                                  }
                                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm transition ${
                                    meditation.isFavorite
                                      ? "border-amber-200 bg-amber-50 text-amber-500"
                                      : "border-calm-200 text-calm-400 hover:border-primary-200 hover:text-primary-700 dark:border-calm-700 dark:text-calm-500 dark:hover:border-primary-500 dark:hover:text-primary-300"
                                  }`}
                                  aria-label={
                                    meditation.isFavorite
                                      ? `Remove ${meditation.title} from favorites`
                                      : `Add ${meditation.title} to favorites`
                                  }
                                >
                                  ★
                                </button>
                              )}
                              <div className="flex items-center gap-1 text-xs text-calm-600 dark:text-calm-400">
                                <svg
                                  className="h-4 w-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.414C4.22 13.935 3 11.793 3 9.5 3 5.916 5.916 3 9.5 3c1.793 0 3.435.72 4.621 1.879"
                                  />
                                </svg>
                                <span>{listenCount}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
      <ModalMeditationDetails
        isOpen={!!selectedMeditation}
        meditation={selectedMeditation}
        userId={user?.id ?? null}
        onClose={() => setSelectedMeditation(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </section>
  );
}
