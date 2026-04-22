"use client";

import ModalConfirmDelete from "./ModalConfirmDelete";

type ModalConfirmCascadeDeleteProps = {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function ModalConfirmCascadeDelete({
  isOpen,
  isLoading = false,
  onClose,
  onConfirm,
}: ModalConfirmCascadeDeleteProps) {
  return (
    <ModalConfirmDelete
      isOpen={isOpen}
      title="Delete meditation and all related files"
      message="This will permanently delete the meditation, all ElevenLabs audio generated for it, and the final MP3. This cannot be undone. Shared prerecorded sound files are not affected."
      confirmLabel="Delete meditation"
      isLoading={isLoading}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
