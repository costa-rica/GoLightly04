"use client";

import AdminPageShell from "@/components/AdminPageShell";
import { useCallback, useEffect, useState } from "react";
import TableAdminSoundsFiles from "@/components/tables/TableAdminSoundsFiles";
import ModalUploadSoundFile from "@/components/modals/ModalUploadSoundFile";
import ModalEditSoundFile from "@/components/modals/ModalEditSoundFile";
import ModalConfirmDelete from "@/components/modals/ModalConfirmDelete";
import Toast from "@/components/Toast";
import {
  deleteSoundFile,
  getSoundFiles,
  type SoundFile,
} from "@/lib/api/sounds";

export default function AdminSoundsPage() {
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

  const [soundFiles, setSoundFiles] = useState<SoundFile[]>([]);

  const [soundsLoading, setSoundsLoading] = useState(false);

  const [soundsError, setSoundsError] = useState<string | null>(null);

  const [soundDeleteTarget, setSoundDeleteTarget] = useState<SoundFile | null>(
    null,
  );

  const [soundEditTarget, setSoundEditTarget] = useState<SoundFile | null>(
    null,
  );

  const [isSoundDeleting, setIsSoundDeleting] = useState(false);

  const [isUploadOpen, setIsUploadOpen] = useState(false);

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

  useEffect(() => {
    fetchSoundFiles();
  }, [fetchSoundFiles]);
  return (
    <>
      <AdminPageShell
        title="Sound Files"
        description="Upload and manage audio assets"
        loading={soundsLoading}
        error={soundsError}
        onRetry={fetchSoundFiles}
        actions={
          <>
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
          </>
        }
      >
        <TableAdminSoundsFiles
          soundFiles={soundFiles}
          onEdit={(target) => setSoundEditTarget(target)}
          onDelete={(target) => setSoundDeleteTarget(target)}
        />
      </AdminPageShell>
      <ModalUploadSoundFile
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={() => {
          fetchSoundFiles();
          setToast({ message: "Sound file uploaded.", variant: "success" });
        }}
      />
      <ModalEditSoundFile
        soundFile={soundEditTarget}
        onClose={() => setSoundEditTarget(null)}
        onSaved={() => {
          fetchSoundFiles();
          setToast({ message: "Sound file updated.", variant: "success" });
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
