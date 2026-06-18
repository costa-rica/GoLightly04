"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef, Row } from "@tanstack/react-table";
import {
  deleteMeditationObj,
  favoriteMeditation,
  getAllMeditations,
  regenerateMeditationScript,
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
import { formatDurationOrDash } from "@/lib/utils/formatters";

import DataTable from "./DataTable";

const MID_THRESHOLD = 5;
const HIGH_THRESHOLD = 30;

const headerHelp = {
  length: "Total generated audio duration.",
  guidance:
    "Gray = low/no guidance, yellow = medium guidance, orange = high guidance, based on talking duration.",
  favorite: "Marks meditations you want quick access to.",
  listens: "Number of times this meditation has been played.",
};

function formatGuidanceDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "-";

  const roundedSeconds = Math.max(0, Math.round(seconds));
  if (roundedSeconds < 60) return `${roundedSeconds}s`;

  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  return remainingSeconds === 0
    ? `${minutes}m`
    : `${minutes}m ${remainingSeconds}s`;
}

function guidanceColor(seconds: number | null | undefined): string {
  const baseClass = "inline-flex h-3 w-3 shrink-0 rounded-full";
  if (seconds === null || seconds === undefined) {
    return `${baseClass} bg-calm-300 dark:bg-calm-600`;
  }
  if (seconds >= HIGH_THRESHOLD) {
    return `${baseClass} bg-buildBlock-text`;
  }
  if (seconds >= MID_THRESHOLD) {
    return `${baseClass} bg-yellow-300 dark:bg-yellow-400`;
  }
  return `${baseClass} bg-calm-300 dark:bg-calm-600`;
}

type MeditationTableRow = Meditation & {
  createdByUsername?: string | null;
  listens?: number;
};

function getListenCount(meditation: MeditationTableRow): number {
  return meditation.listenCount ?? meditation.listens ?? 0;
}

function isMeditationInFlight(meditation: MeditationTableRow): boolean {
  return Boolean(
    meditation.isOwned &&
      (meditation.status === "pending" || meditation.status === "processing"),
  );
}

function isMeditationFailed(meditation: MeditationTableRow): boolean {
  return Boolean(meditation.isOwned && meditation.status === "failed");
}

function GuidanceDot({ meditation }: { meditation: MeditationTableRow }) {
  return (
    <span
      className={guidanceColor(meditation.durationSecondsTalking)}
      title={formatGuidanceDuration(meditation.durationSecondsTalking)}
      aria-label={`Guidance ${formatGuidanceDuration(
        meditation.durationSecondsTalking,
      )}`}
    />
  );
}

function HeaderHelp({
  label,
  helpText,
  align = "left",
}: {
  label: string;
  helpText: string;
  align?: "left" | "center" | "right";
}) {
  const id = `meditation-table-${label.toLowerCase()}-help`;
  const tooltipAlign =
    align === "right"
      ? "right-0"
      : align === "center"
        ? "left-1/2 -translate-x-1/2"
        : "left-0";

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${
        align === "right" ? "justify-end" : align === "center" ? "justify-center" : ""
      }`}
    >
      <span>{label}</span>
      <span className="group relative inline-flex">
        <button
          type="button"
          aria-describedby={id}
          aria-label={`${label}: ${helpText}`}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-calm-300 text-[10px] font-semibold leading-none text-calm-500 transition hover:border-primary-300 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-300 dark:border-calm-600 dark:text-calm-400 dark:hover:border-primary-500 dark:hover:text-primary-300"
        >
          ?
        </button>
        <span
          id={id}
          role="tooltip"
          className={`pointer-events-none invisible absolute top-full z-20 mt-2 w-56 rounded-md border border-calm-200 bg-white px-3 py-2 text-left text-xs font-normal leading-snug text-calm-700 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 dark:border-calm-700 dark:bg-calm-950 dark:text-calm-200 ${tooltipAlign}`}
        >
          {helpText}
        </span>
      </span>
    </span>
  );
}

export default function TableMeditation() {
  const dispatch = useAppDispatch();
  const { meditations, loading, error } = useAppSelector(
    (state) => state.meditation,
  );
  const { isAuthenticated, accessToken, user } = useAppSelector(
    (state) => state.auth,
  );
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
  const visibleRows = useMemo<MeditationTableRow[]>(() => {
    return Array.isArray(meditations) ? (meditations as MeditationTableRow[]) : [];
  }, [meditations]);
  const hasInFlight = useMemo(
    () => visibleRows.some((meditation) => isMeditationInFlight(meditation)),
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

  const handleToggleFavorite = useCallback(
    async (meditationId: number, currentValue?: boolean) => {
      if (!isAuthenticated) return;
      const nextValue = !currentValue;
      dispatch(toggleFavorite({ id: meditationId, isFavorite: nextValue }));

      try {
        await favoriteMeditation(meditationId, nextValue);
      } catch (err) {
        dispatch(toggleFavorite({ id: meditationId, isFavorite: !nextValue }));
      }
    },
    [dispatch, isAuthenticated],
  );

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

  const handleRegenerateScript = async (id: number, script: string) => {
    try {
      const response = await regenerateMeditationScript(id, script);
      dispatch(updateMeditation(response.meditation));
      setSelectedMeditation(response.meditation);
      setToast({
        message: "Meditation regeneration started.",
        variant: "success",
      });
    } catch (err: any) {
      const status = err?.response?.status;
      const code = err?.response?.data?.error?.code;
      if (status === 409 || code === "MEDITATION_BUSY") {
        setToast({
          message: "This meditation is already being regenerated.",
          variant: "error",
        });
      } else if (code === "SCRIPT_PARSE_ERROR") {
        setToast({
          message: "The script has a formatting issue. Please review it and try again.",
          variant: "error",
        });
      } else {
        setToast({
          message: "Unable to regenerate meditation. Please try again.",
          variant: "error",
        });
      }
      throw err;
    }
  };

  const renderPlayCell = useCallback((meditation: MeditationTableRow) => {
    const isInFlight = isMeditationInFlight(meditation);
    const isFailed = isMeditationFailed(meditation);

    if (isInFlight) {
      return (
        <div className="flex items-center gap-2 text-xs text-calm-500 dark:text-calm-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-calm-200 border-t-primary-500" />
          <span>Your meditation will be ready shortly…</span>
        </div>
      );
    }

    if (isFailed) {
      return (
        <span className="text-xs text-red-600 dark:text-red-300">
          Generation failed. Edit or delete to try again.
        </span>
      );
    }

    return <AudioPlayer meditationId={meditation.id} title={meditation.title} />;
  }, []);

  const renderFavoriteCell = useCallback(
    (meditation: MeditationTableRow) => {
      const isInFlight = isMeditationInFlight(meditation);
      const isFailed = isMeditationFailed(meditation);

      if (isInFlight || isFailed) {
        return <span className="text-xs text-calm-400">Pending</span>;
      }

      return (
        <button
          type="button"
          onClick={() => handleToggleFavorite(meditation.id, meditation.isFavorite)}
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
      );
    },
    [handleToggleFavorite],
  );

  const columns = useMemo<ColumnDef<MeditationTableRow>[]>(() => {
    const tableColumns: ColumnDef<MeditationTableRow>[] = [
      {
        accessorKey: "title",
        id: "title",
        header: "Title",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setSelectedMeditation(row.original)}
            className="text-left font-medium text-calm-900 underline decoration-calm-300 underline-offset-2 transition hover:text-primary-700 hover:decoration-primary-500 dark:text-calm-100 dark:decoration-calm-600 dark:hover:text-primary-300"
          >
            {row.original.title}
          </button>
        ),
      },
      {
        accessorKey: "createdByUsername",
        id: "createdByUsername",
        header: "Created By",
        cell: ({ row }) => row.original.createdByUsername || "—",
      },
      {
        id: "play",
        header: "Play",
        enableSorting: false,
        cell: ({ row }) => renderPlayCell(row.original),
      },
      {
        accessorKey: "durationSeconds",
        id: "durationSeconds",
        header: () => <HeaderHelp label="Length" helpText={headerHelp.length} />,
        cell: ({ row }) => formatDurationOrDash(row.original.durationSeconds),
      },
      {
        accessorKey: "durationSecondsTalking",
        id: "durationSecondsTalking",
        header: () => (
          <HeaderHelp
            label="Guidance"
            helpText={headerHelp.guidance}
            align="center"
          />
        ),
        cell: ({ row }) => (
          <div className="text-center">
            <GuidanceDot meditation={row.original} />
          </div>
        ),
      },
    ];

    if (isAuthenticated) {
      tableColumns.push({
        id: "favorite",
        header: () => (
          <HeaderHelp
            label="Favorite"
            helpText={headerHelp.favorite}
            align="center"
          />
        ),
        enableSorting: false,
        cell: ({ row }) => <div className="text-center">{renderFavoriteCell(row.original)}</div>,
      });
    }

    tableColumns.push({
      id: "listenCount",
      accessorFn: (row) => getListenCount(row),
      header: () => (
        <HeaderHelp
          label="Listens"
          helpText={headerHelp.listens}
          align="right"
        />
      ),
      cell: ({ row }) => (
        <div className="text-right text-calm-600 dark:text-calm-400">
          {getListenCount(row.original)}
        </div>
      ),
    });

    return tableColumns;
  }, [isAuthenticated, renderFavoriteCell, renderPlayCell]);

  const renderMeditationMobileCard = useCallback(
    (_row: Row<MeditationTableRow>, meditation: MeditationTableRow) => {
      const isInFlight = isMeditationInFlight(meditation);
      const isFailed = isMeditationFailed(meditation);

      return (
        <div className="space-y-3 rounded-2xl border border-calm-100 bg-white p-4 dark:border-calm-800 dark:bg-calm-950/60">
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setSelectedMeditation(meditation)}
              className="text-left text-sm font-medium text-calm-900 underline decoration-calm-300 underline-offset-2 transition hover:text-primary-700 hover:decoration-primary-500 dark:text-calm-100 dark:decoration-calm-600 dark:hover:text-primary-300"
            >
              {meditation.title}
            </button>
            <div className="text-xs text-calm-500 dark:text-calm-400">
              Created By: {meditation.createdByUsername || "—"}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">{renderPlayCell(meditation)}</div>
            <div className="flex shrink-0 items-center gap-3">
              {isAuthenticated && !isInFlight && !isFailed && renderFavoriteCell(meditation)}
              {isAuthenticated && (isInFlight || isFailed) && (
                <span className="text-xs text-calm-400">Pending</span>
              )}
              <div className="flex items-center gap-1 text-xs text-calm-600 dark:text-calm-400">
                <span>{formatDurationOrDash(meditation.durationSeconds)}</span>
                <span aria-hidden="true">·</span>
                <GuidanceDot meditation={meditation} />
                <span aria-hidden="true">·</span>
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
                <span>{getListenCount(meditation)}</span>
              </div>
            </div>
          </div>
        </div>
      );
    },
    [isAuthenticated, renderFavoriteCell, renderPlayCell],
  );

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-calm-200/70 bg-white/80 px-4 py-3 shadow-sm dark:border-calm-800 dark:bg-calm-900/80">
        <h2 className="text-xl font-display font-semibold text-calm-900 dark:text-calm-50">
          Meditations
        </h2>
        <p className="text-sm text-calm-500 dark:text-calm-400">Explore the community library</p>
      </div>

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
          <DataTable
            columns={columns}
            data={visibleRows}
            emptyMessage="No meditations available yet."
            filterMode="column"
            filterColumnId="title"
            searchPlaceholder="Search by title…"
            pageSize={10}
            showPagination
            showPageSizeSelector={false}
            minWidthClassName="min-w-[720px]"
            renderMobileRow={({ row, item }) => renderMeditationMobileCard(row, item)}
          />
        )}
      </div>

      <ModalMeditationDetails
        isOpen={!!selectedMeditation}
        meditation={selectedMeditation}
        userId={user?.id ?? null}
        onClose={() => setSelectedMeditation(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onRegenerateScript={handleRegenerateScript}
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
