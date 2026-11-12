"use client";

import AdminPageShell from "@/components/AdminPageShell";
import { useCallback, useEffect, useRef, useState } from "react";
import TableAdminDatabase from "@/components/tables/TableAdminDatabase";
import ModalConfirmRestore from "@/components/modals/ModalConfirmRestore";
import Toast from "@/components/Toast";
import {
  createBackup,
  deleteBackup,
  downloadBackup,
  getBackupSizeEstimate,
  getBackupsList,
  replenishDatabase,
  type BackupFile,
} from "@/lib/api/database";
import type { BackupSizeEstimateResponse } from "@golightly/shared-types";
import { useAppDispatch } from "@/store/hooks";
import { hideLoading, showLoading } from "@/store/features/uiSlice";

export default function AdminDatabasePage() {
  const dispatch = useAppDispatch();

  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

  const [backups, setBackups] = useState<BackupFile[]>([]);

  const [databaseLoading, setDatabaseLoading] = useState(false);

  const [databaseError, setDatabaseError] = useState<string | null>(null);

  const [includeResources, setIncludeResources] = useState(true);

  const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);

  const [sizeEstimate, setSizeEstimate] =
    useState<BackupSizeEstimateResponse | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const uploadInputRef = useRef<HTMLInputElement | null>(null);

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

  const fetchBackupSizeEstimate = useCallback(async () => {
    try {
      setSizeEstimate(await getBackupSizeEstimate());
    } catch {
      setSizeEstimate(null);
    }
  }, []);

  const handleCreateBackup = async () => {
    dispatch(showLoading("Queuing database backup..."));
    try {
      await createBackup(includeResources);
      setToast({
        message:
          "Backup job queued — refresh this page when the job completes.",
        variant: "success",
      });
    } catch (err: any) {
      const status = err?.response?.status;
      const message =
        status === 409
          ? "A backup job is already running"
          : "Worker unavailable — backup could not be started. Try again shortly.";
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
    dispatch(showLoading("Queuing restore..."));
    try {
      await replenishDatabase(uploadFile);
      setUploadFile(null);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
      setToast({
        message:
          "Restore queued. The database will be updated in the background.",
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

  useEffect(() => {
    fetchBackups();
    fetchBackupSizeEstimate();
  }, [fetchBackups, fetchBackupSizeEstimate]);
  return (
    <>
      <AdminPageShell
        title="Database"
        description="Backup and restore database"
        loading={databaseLoading}
        error={databaseError}
        onRetry={fetchBackups}
        actions={
          <>
            <label className="flex items-center gap-2 rounded-full border border-subtle px-3 py-2 text-xs font-semibold text-ink-muted">
              <input
                type="checkbox"
                checked={includeResources}
                onChange={(event) => setIncludeResources(event.target.checked)}
                className="h-4 w-4 rounded border-subtle text-primary-600 focus:ring-primary-500"
              />
              Include sound & resource files
            </label>
            <button
              type="button"
              onClick={handleCreateBackup}
              className="rounded-full border border-primary-200 px-4 py-2 text-xs font-semibold text-primary-700 transition hover:border-primary-300"
            >
              Create Backup
            </button>
          </>
        }
      >
        <div className="space-y-6">
          {sizeEstimate && (
            <p className="text-xs font-semibold text-ink-muted">
              Estimated uncompressed size: {sizeEstimate.totalBytesFormatted}
            </p>
          )}
          <TableAdminDatabase
            backups={backups}
            onDownload={handleDownloadBackup}
            onDelete={handleDeleteBackup}
          />

          <div className="rounded-2xl border border-subtle bg-inset/60 p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">
                  Upload Backup (.zip)
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {uploadFile ? uploadFile.name : "No file selected"}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="rounded-full border border-subtle bg-raised px-4 py-2 text-xs font-semibold text-ink transition hover:border-primary-200">
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
                  onClick={() => setIsRestoreConfirmOpen(true)}
                  disabled={!uploadFile}
                  className="rounded-full border border-primary-200 px-4 py-2 text-xs font-semibold text-primary-700 transition hover:border-primary-300 disabled:cursor-not-allowed disabled:border-subtle disabled:text-ink-muted/60"
                >
                  Restore Database
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs font-semibold text-red-500">
              Warning: Restoring will replace all current data
            </p>
          </div>
        </div>
      </AdminPageShell>
      <ModalConfirmRestore
        isOpen={isRestoreConfirmOpen}
        isLoading={databaseLoading}
        onClose={() => setIsRestoreConfirmOpen(false)}
        onConfirm={() => {
          setIsRestoreConfirmOpen(false);
          handleRestoreDatabase();
        }}
      />
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
