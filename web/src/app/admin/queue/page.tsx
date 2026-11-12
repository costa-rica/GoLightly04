"use client";

import AdminPageShell from "@/components/AdminPageShell";
import { useCallback, useEffect, useState } from "react";
import TableAdminQueuer from "@/components/tables/TableAdminQueuer";
import ModalConfirmCascadeDelete from "@/components/modals/ModalConfirmCascadeDelete";
import Toast from "@/components/Toast";
import {
  deleteQueuerRecord,
  getQueuerRecords,
  requeueMeditation,
  type QueueRecord,
} from "@/lib/api/admin";

export default function AdminQueuePage() {
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

  const [queueRecords, setQueueRecords] = useState<QueueRecord[]>([]);

  const [queueLoading, setQueueLoading] = useState(false);

  const [queueError, setQueueError] = useState<string | null>(null);

  const [queueDeleteTarget, setQueueDeleteTarget] =
    useState<QueueRecord | null>(null);

  const [isQueueDeleting, setIsQueueDeleting] = useState(false);

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

  const handleQueueDeleteConfirm = async () => {
    if (!queueDeleteTarget) return;
    setIsQueueDeleting(true);
    try {
      await deleteQueuerRecord(queueDeleteTarget.id);
      setQueueRecords((prev) =>
        prev.filter((item) => item.id !== queueDeleteTarget.id),
      );
      setToast({
        message: "Meditation and all related files deleted.",
        variant: "success",
      });
      setQueueDeleteTarget(null);
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message || "Unable to delete queue record.";
      setToast({ message, variant: "error" });
    } finally {
      setIsQueueDeleting(false);
    }
  };

  const handleRequeueMeditation = async (record: QueueRecord) => {
    try {
      await requeueMeditation(record.meditationId);
      setToast({ message: "Meditation requeued.", variant: "success" });
      await fetchQueuerRecords();
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message || "Unable to requeue meditation.";
      setToast({ message, variant: "error" });
    }
  };

  useEffect(() => {
    fetchQueuerRecords();
  }, [fetchQueuerRecords]);
  return (
    <>
      <AdminPageShell
        title="Jobs Queue"
        description="Jobs Queue mirrors the database table, one row per meditation element."
        loading={queueLoading}
        error={queueError}
        onRetry={fetchQueuerRecords}
      >
        <TableAdminQueuer
          records={queueRecords}
          onDelete={(target) => setQueueDeleteTarget(target)}
          onRequeue={handleRequeueMeditation}
        />
      </AdminPageShell>
      <ModalConfirmCascadeDelete
        isOpen={!!queueDeleteTarget}
        isLoading={isQueueDeleting}
        onClose={() => setQueueDeleteTarget(null)}
        onConfirm={handleQueueDeleteConfirm}
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
