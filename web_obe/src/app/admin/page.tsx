"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import TableAdminUsers from "@/components/tables/TableAdminUsers";
import TableAdminSoundsFiles from "@/components/tables/TableAdminSoundsFiles";
import TableAdminMeditations from "@/components/tables/TableAdminMeditations";
import TableAdminQueuer from "@/components/tables/TableAdminQueuer";
import TableAdminDatabase from "@/components/tables/TableAdminDatabase";
import ModalUploadSoundFile from "@/components/modals/ModalUploadSoundFile";
import ModalConfirmDelete from "@/components/modals/ModalConfirmDelete";
import ModalConfirmDeleteUser from "@/components/modals/ModalConfirmDeleteUser";
import Toast from "@/components/Toast";
import {
  deleteMeditationObj,
  deleteQueuerRecord,
  deleteUser,
  getAllMeditations,
  getQueuerRecords,
  getUsers,
  type AdminUser,
  type QueueRecord,
} from "@/lib/api/admin";
import type { Meditation } from "@/store/features/meditationSlice";
import {
  deleteSoundFile,
  getSoundFiles,
  type SoundFile,
} from "@/lib/api/sounds";
import {
  createBackup,
  deleteBackup,
  downloadBackup,
  getBackupsList,
  replenishDatabase,
  type BackupFile,
} from "@/lib/api/database";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { hideLoading, showLoading } from "@/store/features/uiSlice";

export default function AdminPage() {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const [isExpanded, setIsExpanded] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);
  const [isSoundsExpanded, setIsSoundsExpanded] = useState(false);
  const [soundFiles, setSoundFiles] = useState<SoundFile[]>([]);
  const [soundsLoading, setSoundsLoading] = useState(false);
  const [soundsError, setSoundsError] = useState<string | null>(null);
  const [soundDeleteTarget, setSoundDeleteTarget] = useState<SoundFile | null>(
    null,
  );
  const [isSoundDeleting, setIsSoundDeleting] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isMeditationsExpanded, setIsMeditationsExpanded] = useState(false);
  const [meditations, setMeditations] = useState<Meditation[]>([]);
  const [meditationsLoading, setMeditationsLoading] = useState(false);
  const [meditationsError, setMeditationsError] = useState<string | null>(null);
  const [meditationDeleteTarget, setMeditationDeleteTarget] =
    useState<Meditation | null>(null);
  const [isMeditationDeleting, setIsMeditationDeleting] = useState(false);
  const [isQueuerExpanded, setIsQueuerExpanded] = useState(false);
  const [queueRecords, setQueueRecords] = useState<QueueRecord[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueDeleteTarget, setQueueDeleteTarget] =
    useState<QueueRecord | null>(null);
  const [isQueueDeleting, setIsQueueDeleting] = useState(false);
  const [isDatabaseExpanded, setIsDatabaseExpanded] = useState(false);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [databaseLoading, setDatabaseLoading] = useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await getUsers();
      setUsers(response.users);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setError("You do not have permission to view users.");
      } else {
        setError(
          err?.response?.data?.error?.message || "Unable to load users.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSoundFiles = useCallback(async () => {
    setSoundsLoading(true);
    setSoundsError(null);

    try {
      const response = await getSoundFiles();
      setSoundFiles(response.soundFiles ?? []);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setSoundsError("You do not have permission to view sound files.");
      } else {
        setSoundsError(
          err?.response?.data?.error?.message || "Unable to load sound files.",
        );
      }
    } finally {
      setSoundsLoading(false);
    }
  }, []);

  const fetchMeditations = useCallback(async () => {
    setMeditationsLoading(true);
    setMeditationsError(null);

    try {
      const response = await getAllMeditations();
      setMeditations(response.meditations ?? []);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setMeditationsError("You do not have permission to view meditations.");
      } else {
        setMeditationsError(
          err?.response?.data?.error?.message || "Unable to load meditations.",
        );
      }
    } finally {
      setMeditationsLoading(false);
    }
  }, []);

  const fetchQueuerRecords = useCallback(async () => {
    setQueueLoading(true);
    setQueueError(null);

    try {
      const response = await getQueuerRecords();
      setQueueRecords(response.queue ?? []);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setQueueError("You do not have permission to view queue records.");
      } else {
        setQueueError(
          err?.response?.data?.error?.message ||
            "Unable to load queue records.",
        );
      }
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const fetchBackups = useCallback(async () => {
    setDatabaseLoading(true);
    setDatabaseError(null);

    try {
      const response = await getBackupsList();
      setBackups(response.backups ?? []);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setDatabaseError("You do not have permission to view backups.");
      } else {
        setDatabaseError(
          err?.response?.data?.error?.message || "Unable to load backups.",
        );
      }
    } finally {
      setDatabaseLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchSoundFiles();
  }, [fetchSoundFiles]);

  useEffect(() => {
    fetchMeditations();
  }, [fetchMeditations]);

  useEffect(() => {
    fetchQueuerRecords();
  }, [fetchQueuerRecords]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  const handleDeleteConfirm = async (savePublicMeditations: boolean) => {
    if (!deleteTarget) return;
    if (deleteTarget.id === user?.id) {
      setToast({
        message: "You cannot delete your own admin account.",
        variant: "error",
      });
      setDeleteTarget(null);
      return;
    }

    setIsDeleting(true);
    try {
      const options = deleteTarget.hasPublicMeditations
        ? { savePublicMeditationsAsBenevolentUser: savePublicMeditations }
        : undefined;
      await deleteUser(deleteTarget.id, options);
      setUsers((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setToast({ message: "User deleted.", variant: "success" });
      setDeleteTarget(null);
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message || "Unable to delete user.";
      setToast({ message, variant: "error" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSoundDeleteConfirm = async () => {
    if (!soundDeleteTarget) return;
    setIsSoundDeleting(true);
    try {
      await deleteSoundFile(soundDeleteTarget.id);
      setSoundFiles((prev) =>
        prev.filter((item) => item.id !== soundDeleteTarget.id),
      );
      setToast({ message: "Sound file deleted.", variant: "success" });
      setSoundDeleteTarget(null);
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message || "Unable to delete sound file.";
      setToast({ message, variant: "error" });
    } finally {
      setIsSoundDeleting(false);
    }
  };

  const handleMeditationDeleteConfirm = async () => {
    if (!meditationDeleteTarget) return;
    setIsMeditationDeleting(true);
    try {
      await deleteMeditationObj(meditationDeleteTarget.id);
      setMeditations((prev) =>
        prev.filter((item) => item.id !== meditationDeleteTarget.id),
      );
      setToast({ message: "Meditation deleted.", variant: "success" });
      setMeditationDeleteTarget(null);
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message || "Unable to delete meditation.";
      setToast({ message, variant: "error" });
    } finally {
      setIsMeditationDeleting(false);
    }
  };

  const handleQueueDeleteConfirm = async () => {
    if (!queueDeleteTarget) return;
    setIsQueueDeleting(true);
    try {
      await deleteQueuerRecord(queueDeleteTarget.id);
      setQueueRecords((prev) =>
        prev.filter((item) => item.id !== queueDeleteTarget.id),
      );
      setToast({ message: "Queue record deleted.", variant: "success" });
      setQueueDeleteTarget(null);
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message || "Unable to delete queue record.";
      setToast({ message, variant: "error" });
    } finally {
      setIsQueueDeleting(false);
    }
  };

  const handleCreateBackup = async () => {
    dispatch(showLoading("Creating database backup..."));
    try {
      await createBackup();
      await fetchBackups();
      setToast({ message: "Database backup created.", variant: "success" });
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message ||
        "Unable to create database backup.";
      setToast({ message, variant: "error" });
    } finally {
      dispatch(hideLoading());
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    dispatch(showLoading("Downloading backup..."));
    try {
      await downloadBackup(filename);
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message || "Unable to download backup.";
      setToast({ message, variant: "error" });
    } finally {
      dispatch(hideLoading());
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    try {
      await deleteBackup(filename);
      setBackups((prev) => prev.filter((item) => item.filename !== filename));
      setToast({ message: "Backup deleted.", variant: "success" });
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message || "Unable to delete backup.";
      setToast({ message, variant: "error" });
    }
  };

  const handleRestoreDatabase = async () => {
    if (!uploadFile) return;
    dispatch(showLoading("Restoring database..."));
    try {
      const response = await replenishDatabase(uploadFile);
      setUploadFile(null);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
      const tablesImported = response.tablesImported ?? 0;
      const totalRows = response.totalRows ?? 0;
      setToast({
        message: `Database restored. ${tablesImported} tables, ${totalRows} rows.`,
        variant: "success",
      });
      await fetchBackups();
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message || "Unable to restore database.";
      setToast({ message, variant: "error" });
    } finally {
      dispatch(hideLoading());
    }
  };

  return (
    <ProtectedRoute requireAdmin>
      <main className="min-h-screen bg-gradient-to-b from-calm-50 via-white to-primary-50">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 md:px-8 md:py-16">
          <header className="rounded-3xl border border-calm-200/70 bg-white/80 p-8 shadow-sm backdrop-blur">
            <p className="text-xs uppercase tracking-[0.25em] text-calm-500">
              Admin
            </p>
            <h1 className="mt-3 text-3xl font-display font-semibold text-calm-900 md:text-4xl">
              Manage Go Lightly
            </h1>
            <p className="mt-3 max-w-2xl text-base text-calm-600 md:text-lg">
              Review user accounts, meditation content, sound files, and queued
              jobs.
            </p>
          </header>

          <section className="space-y-4">
            <div className="flex w-full items-center justify-between rounded-2xl border border-calm-200/70 bg-white/80 px-4 py-3 text-left shadow-sm">
              <div>
                <h2 className="text-xl font-display font-semibold text-calm-900">
                  Users
                </h2>
                <p className="text-sm text-calm-500">Manage registered users</p>
              </div>
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="text-calm-500 transition hover:text-primary-700"
                aria-expanded={isExpanded}
                aria-label="Toggle users"
              >
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
              </button>
            </div>

            {isExpanded && (
              <div className="rounded-3xl border border-calm-200/70 bg-white p-4 shadow-sm md:p-6">
                {loading && (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={`admin-users-skeleton-${index}`}
                        className="flex items-center justify-between rounded-2xl border border-calm-100 bg-calm-50 px-4 py-3 animate-pulse"
                      >
                        <div className="h-4 w-1/3 rounded-full bg-calm-200" />
                        <div className="h-4 w-20 rounded-full bg-calm-200" />
                      </div>
                    ))}
                  </div>
                )}

                {!loading && error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-600">
                    <p>{error}</p>
                    <button
                      type="button"
                      onClick={fetchUsers}
                      className="mt-3 rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {!loading && !error && (
                  <TableAdminUsers
                    users={users}
                    currentUserId={user?.id}
                    onDelete={(target) => setDeleteTarget(target)}
                  />
                )}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex w-full items-center justify-between rounded-2xl border border-calm-200/70 bg-white/80 px-4 py-3 text-left shadow-sm">
              <div>
                <h2 className="text-xl font-display font-semibold text-calm-900">
                  Sound Files
                </h2>
                <p className="text-sm text-calm-500">
                  Upload and manage audio assets
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsUploadOpen(true);
                  }}
                  className="rounded-full border border-primary-200 px-4 py-2 text-xs font-semibold text-primary-700 transition hover:border-primary-300"
                >
                  Upload Sound File
                </button>
                <button
                  type="button"
                  onClick={() => setIsSoundsExpanded((prev) => !prev)}
                  className="text-calm-500 transition hover:text-primary-700"
                  aria-expanded={isSoundsExpanded}
                  aria-label="Toggle sound files"
                >
                  {isSoundsExpanded ? (
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
                </button>
              </div>
            </div>

            {isSoundsExpanded && (
              <div className="rounded-3xl border border-calm-200/70 bg-white p-4 shadow-sm md:p-6">
                {soundsLoading && (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={`admin-sounds-skeleton-${index}`}
                        className="flex items-center justify-between rounded-2xl border border-calm-100 bg-calm-50 px-4 py-3 animate-pulse"
                      >
                        <div className="h-4 w-1/3 rounded-full bg-calm-200" />
                        <div className="h-4 w-20 rounded-full bg-calm-200" />
                      </div>
                    ))}
                  </div>
                )}

                {!soundsLoading && soundsError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-600">
                    <p>{soundsError}</p>
                    <button
                      type="button"
                      onClick={fetchSoundFiles}
                      className="mt-3 rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {!soundsLoading && !soundsError && (
                  <TableAdminSoundsFiles
                    soundFiles={soundFiles}
                    onDelete={(target) => setSoundDeleteTarget(target)}
                  />
                )}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex w-full items-center justify-between rounded-2xl border border-calm-200/70 bg-white/80 px-4 py-3 text-left shadow-sm">
              <div>
                <h2 className="text-xl font-display font-semibold text-calm-900">
                  Meditations
                </h2>
                <p className="text-sm text-calm-500">
                  Review all meditation content
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMeditationsExpanded((prev) => !prev)}
                className="text-calm-500 transition hover:text-primary-700"
                aria-expanded={isMeditationsExpanded}
                aria-label="Toggle meditations"
              >
                {isMeditationsExpanded ? (
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
              </button>
            </div>

            {isMeditationsExpanded && (
              <div className="rounded-3xl border border-calm-200/70 bg-white p-4 shadow-sm md:p-6">
                {meditationsLoading && (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={`admin-meditations-skeleton-${index}`}
                        className="flex items-center justify-between rounded-2xl border border-calm-100 bg-calm-50 px-4 py-3 animate-pulse"
                      >
                        <div className="h-4 w-1/3 rounded-full bg-calm-200" />
                        <div className="h-4 w-20 rounded-full bg-calm-200" />
                      </div>
                    ))}
                  </div>
                )}

                {!meditationsLoading && meditationsError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-600">
                    <p>{meditationsError}</p>
                    <button
                      type="button"
                      onClick={fetchMeditations}
                      className="mt-3 rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {!meditationsLoading && !meditationsError && (
                  <TableAdminMeditations
                    meditations={meditations}
                    onDelete={(target) => setMeditationDeleteTarget(target)}
                  />
                )}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex w-full items-center justify-between rounded-2xl border border-calm-200/70 bg-white/80 px-4 py-3 text-left shadow-sm">
              <div>
                <h2 className="text-xl font-display font-semibold text-calm-900">
                  Queuer
                </h2>
                <p className="text-sm text-calm-500">
                  Monitor queued meditation jobs
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsQueuerExpanded((prev) => !prev)}
                className="text-calm-500 transition hover:text-primary-700"
                aria-expanded={isQueuerExpanded}
                aria-label="Toggle queuer"
              >
                {isQueuerExpanded ? (
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
              </button>
            </div>

            {isQueuerExpanded && (
              <div className="rounded-3xl border border-calm-200/70 bg-white p-4 shadow-sm md:p-6">
                {queueLoading && (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={`admin-queue-skeleton-${index}`}
                        className="flex items-center justify-between rounded-2xl border border-calm-100 bg-calm-50 px-4 py-3 animate-pulse"
                      >
                        <div className="h-4 w-1/3 rounded-full bg-calm-200" />
                        <div className="h-4 w-20 rounded-full bg-calm-200" />
                      </div>
                    ))}
                  </div>
                )}

                {!queueLoading && queueError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-600">
                    <p>{queueError}</p>
                    <button
                      type="button"
                      onClick={fetchQueuerRecords}
                      className="mt-3 rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {!queueLoading && !queueError && (
                  <TableAdminQueuer
                    records={queueRecords}
                    onDelete={(target) => setQueueDeleteTarget(target)}
                  />
                )}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex w-full items-center justify-between rounded-2xl border border-calm-200/70 bg-white/80 px-4 py-3 text-left shadow-sm">
              <div>
                <h2 className="text-xl font-display font-semibold text-calm-900">
                  Database
                </h2>
                <p className="text-sm text-calm-500">
                  Backup and restore database
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCreateBackup}
                  className="rounded-full border border-primary-200 px-4 py-2 text-xs font-semibold text-primary-700 transition hover:border-primary-300"
                >
                  Create Backup
                </button>
                <button
                  type="button"
                  onClick={() => setIsDatabaseExpanded((prev) => !prev)}
                  className="text-calm-500 transition hover:text-primary-700"
                  aria-expanded={isDatabaseExpanded}
                  aria-label="Toggle database backups"
                >
                  {isDatabaseExpanded ? (
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
                </button>
              </div>
            </div>

            {isDatabaseExpanded && (
              <div className="rounded-3xl border border-calm-200/70 bg-white p-4 shadow-sm md:p-6">
                {databaseLoading && (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={`admin-database-skeleton-${index}`}
                        className="flex items-center justify-between rounded-2xl border border-calm-100 bg-calm-50 px-4 py-3 animate-pulse"
                      >
                        <div className="h-4 w-1/2 rounded-full bg-calm-200" />
                        <div className="h-4 w-24 rounded-full bg-calm-200" />
                      </div>
                    ))}
                  </div>
                )}

                {!databaseLoading && databaseError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-600">
                    <p>{databaseError}</p>
                    <button
                      type="button"
                      onClick={fetchBackups}
                      className="mt-3 rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {!databaseLoading && !databaseError && (
                  <div className="space-y-6">
                    <TableAdminDatabase
                      backups={backups}
                      onDownload={handleDownloadBackup}
                      onDelete={handleDeleteBackup}
                    />

                    <div className="rounded-2xl border border-calm-100 bg-calm-50/60 p-4">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-calm-700">
                            Upload Backup (.zip)
                          </p>
                          <p className="mt-1 text-xs text-calm-500">
                            {uploadFile ? uploadFile.name : "No file selected"}
                          </p>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <label className="rounded-full border border-calm-200 bg-white px-4 py-2 text-xs font-semibold text-calm-700 transition hover:border-primary-200">
                            Choose File
                            <input
                              type="file"
                              accept=".zip"
                              className="sr-only"
                              ref={uploadInputRef}
                              onChange={(event) => {
                                const file = event.target.files?.[0] || null;
                                setUploadFile(file);
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={handleRestoreDatabase}
                            disabled={!uploadFile}
                            className="rounded-full border border-primary-200 px-4 py-2 text-xs font-semibold text-primary-700 transition hover:border-primary-300 disabled:cursor-not-allowed disabled:border-calm-200 disabled:text-calm-400"
                          >
                            Restore Database
                          </button>
                        </div>
                      </div>
                      <p className="mt-3 text-xs font-semibold text-red-500">
                        ⚠️ Warning: Restoring will replace all current data
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      <ModalConfirmDeleteUser
        isOpen={!!deleteTarget}
        user={deleteTarget}
        isLoading={isDeleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
      <ModalUploadSoundFile
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={() => {
          fetchSoundFiles();
          setToast({ message: "Sound file uploaded.", variant: "success" });
        }}
      />
      <ModalConfirmDelete
        isOpen={!!soundDeleteTarget}
        title={`Delete ${soundDeleteTarget?.name || "sound file"}`}
        message="This will permanently remove the sound file."
        confirmLabel="Delete sound file"
        isLoading={isSoundDeleting}
        onClose={() => setSoundDeleteTarget(null)}
        onConfirm={handleSoundDeleteConfirm}
      />
      <ModalConfirmDelete
        isOpen={!!meditationDeleteTarget}
        title={`Delete ${meditationDeleteTarget?.title || "meditation"}`}
        message="This will permanently remove the meditation. Admins can delete any meditation."
        confirmLabel="Delete meditation"
        isLoading={isMeditationDeleting}
        onClose={() => setMeditationDeleteTarget(null)}
        onConfirm={handleMeditationDeleteConfirm}
      />
      <ModalConfirmDelete
        isOpen={!!queueDeleteTarget}
        title={`Delete queue record ${queueDeleteTarget?.id || ""}`}
        message="This will remove the queue record but not the meditation itself."
        confirmLabel="Delete queue record"
        isLoading={isQueueDeleting}
        onClose={() => setQueueDeleteTarget(null)}
        onConfirm={handleQueueDeleteConfirm}
      />
    </ProtectedRoute>
  );
}
