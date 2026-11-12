"use client";

import AdminPageShell from "@/components/AdminPageShell";
import { useCallback, useEffect, useState } from "react";
import TableAdminMeditations from "@/components/tables/TableAdminMeditations";
import ModalConfirmDelete from "@/components/modals/ModalConfirmDelete";
import ModalConfirmCascadeDelete from "@/components/modals/ModalConfirmCascadeDelete";
import ModalEditAdminMeditation from "@/components/modals/ModalEditAdminMeditation";
import Toast from "@/components/Toast";
import {
  type AdminMeditation,
  deleteMeditationObj,
  getAllMeditations,
  setDefaultMeditation,
  updateAdminMeditationMetadata,
} from "@/lib/api/admin";
import type { AdminUpdateMeditationMetadataRequest } from "@golightly/shared-types";

export default function AdminMeditationsPage() {
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

  const [meditations, setMeditations] = useState<AdminMeditation[]>([]);

  const [meditationsLoading, setMeditationsLoading] = useState(false);

  const [meditationsError, setMeditationsError] = useState<string | null>(null);

  const [meditationDeleteTarget, setMeditationDeleteTarget] =
    useState<AdminMeditation | null>(null);

  const [meditationEditTarget, setMeditationEditTarget] =
    useState<AdminMeditation | null>(null);

  const [meditationDefaultTarget, setMeditationDefaultTarget] =
    useState<AdminMeditation | null>(null);

  const [isMeditationDeleting, setIsMeditationDeleting] = useState(false);

  const [isMeditationSaving, setIsMeditationSaving] = useState(false);

  const [isSettingDefault, setIsSettingDefault] = useState(false);

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

  const handleMeditationDeleteConfirm = async () => {
    if (!meditationDeleteTarget) return;
    setIsMeditationDeleting(true);
    try {
      await deleteMeditationObj(meditationDeleteTarget.id);
      setMeditations((prev) =>
        prev.filter((item) => item.id !== meditationDeleteTarget.id),
      );
      setToast({
        message: "Meditation and all related files deleted.",
        variant: "success",
      });
      setMeditationDeleteTarget(null);
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message || "Unable to delete meditation.";
      setToast({ message, variant: "error" });
    } finally {
      setIsMeditationDeleting(false);
    }
  };

  const handleMeditationMetadataSave = async (
    meditationId: number,
    data: AdminUpdateMeditationMetadataRequest,
  ) => {
    setIsMeditationSaving(true);
    try {
      const response = await updateAdminMeditationMetadata(meditationId, data);
      setMeditations((prev) =>
        prev.map((item) =>
          item.id === response.meditation.id ? response.meditation : item,
        ),
      );
      setToast({ message: "Meditation updated.", variant: "success" });
      setMeditationEditTarget(null);
    } finally {
      setIsMeditationSaving(false);
    }
  };

  const handleSetDefaultConfirm = async () => {
    if (!meditationDefaultTarget) return;
    setIsSettingDefault(true);
    try {
      const response = await setDefaultMeditation(meditationDefaultTarget.id);
      setMeditations((prev) =>
        prev.map((item) => ({
          ...item,
          isDefault: item.id === response.meditation.id,
        })),
      );
      setToast({ message: "Default meditation updated.", variant: "success" });
      setMeditationDefaultTarget(null);
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message ||
        "Unable to set default meditation.";
      setToast({ message, variant: "error" });
    } finally {
      setIsSettingDefault(false);
    }
  };

  useEffect(() => {
    fetchMeditations();
  }, [fetchMeditations]);
  return (
    <>
      <AdminPageShell
        title="Meditations"
        description="Review all meditation content"
        loading={meditationsLoading}
        error={meditationsError}
        onRetry={fetchMeditations}
      >
        <TableAdminMeditations
          meditations={meditations}
          onEdit={(target) => setMeditationEditTarget(target)}
          onDelete={(target) => setMeditationDeleteTarget(target)}
          onSetDefault={(target) => setMeditationDefaultTarget(target)}
        />
      </AdminPageShell>
      <ModalEditAdminMeditation
        meditation={meditationEditTarget}
        isSubmitting={isMeditationSaving}
        onClose={() => setMeditationEditTarget(null)}
        onSave={handleMeditationMetadataSave}
      />
      <ModalConfirmCascadeDelete
        isOpen={!!meditationDeleteTarget}
        isLoading={isMeditationDeleting}
        onClose={() => setMeditationDeleteTarget(null)}
        onConfirm={handleMeditationDeleteConfirm}
      />
      <ModalConfirmDelete
        isOpen={!!meditationDefaultTarget}
        title="Set default meditation"
        message={`Set "${meditationDefaultTarget?.title ?? "this meditation"}" as the default? It will be hidden from ordinary meditation lists and used as the selected app default.`}
        confirmLabel="Set Default"
        variant="primary"
        isLoading={isSettingDefault}
        onClose={() => setMeditationDefaultTarget(null)}
        onConfirm={handleSetDefaultConfirm}
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
