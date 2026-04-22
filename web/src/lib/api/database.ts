import type {
  BackupFile,
  CreateBackupResponse,
  DeleteBackupResponse,
  GetBackupsResponse,
  RestoreDatabaseResponse,
} from "@golightly/shared-types";

import apiClient from "./client";

export type { BackupFile } from "@golightly/shared-types";

export const getBackupsList = async (): Promise<GetBackupsResponse> => {
  const response = await apiClient.get<GetBackupsResponse>(
    "/database/backups-list",
  );
  return response.data;
};

export const createBackup = async (): Promise<CreateBackupResponse> => {
  const response = await apiClient.post<CreateBackupResponse>(
    "/database/create-backup",
  );
  return response.data;
};

export const downloadBackup = async (filename: string): Promise<Blob> => {
  const response = await apiClient.get<Blob>(
    `/database/download-backup/${filename}`,
    {
      responseType: "blob",
    },
  );

  const blob = response.data;

  if (typeof window !== "undefined") {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  return blob;
};

export const deleteBackup = async (
  filename: string,
): Promise<DeleteBackupResponse> => {
  const response = await apiClient.delete<DeleteBackupResponse>(
    `/database/delete-backup/${filename}`,
  );
  return response.data;
};

export const replenishDatabase = async (
  file: File,
): Promise<RestoreDatabaseResponse> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post<RestoreDatabaseResponse>(
    "/database/replenish-database",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return response.data;
};
