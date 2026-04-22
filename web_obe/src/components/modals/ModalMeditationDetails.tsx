"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { Meditation } from "@/store/features/meditationSlice";
import ModalConfirmDelete from "@/components/modals/ModalConfirmDelete";

type ModalMeditationDetailsProps = {
  isOpen: boolean;
  meditation: Meditation | null;
  userId: number | null;
  onClose: () => void;
  onUpdate: (id: number, data: { title?: string; description?: string; visibility?: 'public' | 'private' }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
};

export default function ModalMeditationDetails({
  isOpen,
  meditation,
  userId,
  onClose,
  onUpdate,
  onDelete,
}: ModalMeditationDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isOwner = meditation && userId && meditation.ownerUserId === userId;

  useEffect(() => {
    if (meditation) {
      setTitle(meditation.title || "");
      setDescription(meditation.description || "");
      setVisibility(meditation.visibility as 'public' | 'private' || 'public');
    }
    setIsEditing(false);
  }, [meditation, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, showDeleteConfirm]);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !meditation) return null;

  const handleClose = () => {
    setIsEditing(false);
    onClose();
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleUpdate = async () => {
    if (!meditation) return;

    setIsUpdating(true);
    try {
      await onUpdate(meditation.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        visibility,
      });
      setIsEditing(false);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!meditation) return;

    setIsDeleting(true);
    try {
      await onDelete(meditation.id);
      setShowDeleteConfirm(false);
      handleClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center bg-calm-900/50 backdrop-blur-sm px-4"
        onClick={handleBackdropClick}
      >
        <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-calm-400">Details</p>
              <h2 className="mt-2 text-xl font-display font-semibold text-calm-900">
                Meditation Details
              </h2>
            </div>
            {isOwner && !isEditing && (
              <button
                type="button"
                onClick={handleEdit}
                className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 transition hover:border-primary-300"
                aria-label="Edit meditation"
              >
                Edit
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="meditation-title" className="block text-xs font-semibold text-calm-600 mb-2">
                Title
              </label>
              <input
                id="meditation-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!isEditing}
                className="w-full rounded-xl border border-calm-200 bg-white px-4 py-2 text-sm text-calm-900 transition focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-calm-50 disabled:text-calm-600"
              />
            </div>

            <div>
              <label htmlFor="meditation-description" className="block text-xs font-semibold text-calm-600 mb-2">
                Description
              </label>
              <textarea
                id="meditation-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!isEditing}
                rows={3}
                className="w-full rounded-xl border border-calm-200 bg-white px-4 py-2 text-sm text-calm-900 transition focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-calm-50 disabled:text-calm-600 resize-none"
              />
            </div>

            <div>
              <label htmlFor="meditation-visibility" className="block text-xs font-semibold text-calm-600 mb-2">
                Visibility
              </label>
              <select
                id="meditation-visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
                disabled={!isEditing}
                className="w-full rounded-xl border border-calm-200 bg-white px-4 py-2 text-sm text-calm-900 transition focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-calm-50 disabled:text-calm-600"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>

          {isOwner && (
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300"
                disabled={isUpdating || isDeleting}
              >
                Delete
              </button>
              <button
                type="button"
                onClick={handleUpdate}
                className="rounded-full border border-primary-200 bg-primary-50 px-4 py-2 text-xs font-semibold text-primary-700 transition hover:border-primary-300 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!isEditing || isUpdating || isDeleting}
              >
                {isUpdating ? "Updating..." : "Update"}
              </button>
            </div>
          )}
        </div>
      </div>

      <ModalConfirmDelete
        isOpen={showDeleteConfirm}
        title={`Delete ${meditation.title}`}
        message="This will permanently remove this meditation from your library."
        confirmLabel="Delete meditation"
        isLoading={isDeleting}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}
