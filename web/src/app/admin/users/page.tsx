"use client";

import AdminPageShell from "@/components/AdminPageShell";
import { useCallback, useEffect, useState } from "react";
import TableAdminUsers from "@/components/tables/TableAdminUsers";
import ModalConfirmDeleteUser from "@/components/modals/ModalConfirmDeleteUser";
import Toast from "@/components/Toast";
import { deleteUser, getUsers, type AdminUser } from "@/lib/api/admin";
import { useAppSelector } from "@/store/hooks";

export default function AdminUsersPage() {
  const { user } = useAppSelector((state) => state.auth);

  const [users, setUsers] = useState<AdminUser[]>([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);

  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

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

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);
  return (
    <>
      <AdminPageShell
        title="Users"
        description="Manage registered users"
        loading={loading}
        error={error}
        onRetry={fetchUsers}
      >
        <TableAdminUsers
          users={users}
          currentUserId={user?.id}
          onDelete={(target) => setDeleteTarget(target)}
        />
      </AdminPageShell>
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
    </>
  );
}
