import apiClient from './client';

export interface BackupFile {
  filename: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
}

export interface GetBackupsResponse {
  backups: BackupFile[];
  count: number;
}

export interface CreateBackupResponse {
  message: string;
  filename: string;
  path: string;
  tablesExported: number;
  timestamp: string;
}

export interface DeleteBackupResponse {
  message: string;
  filename: string;
}

export interface RestoreDatabaseResponse {
  message: string;
  tablesImported: number;
  rowsImported: Record<string, number>;
  totalRows: number;
}

// GET /database/backups-list
export const getBackupsList = async (): Promise<GetBackupsResponse> => {
  const response = await apiClient.get<GetBackupsResponse>('/database/backups-list');
  return response.data;
};

// POST /database/create-backup
export const createBackup = async (): Promise<CreateBackupResponse> => {
  const response = await apiClient.post<CreateBackupResponse>('/database/create-backup');
  return response.data;
};

// GET /database/download-backup/:filename
export const downloadBackup = async (filename: string): Promise<Blob> => {
  const response = await apiClient.get<Blob>(`/database/download-backup/${filename}`, {
    responseType: 'blob',
  });

  const blob = response.data;

  if (typeof window !== 'undefined') {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  return blob;
};

// DELETE /database/delete-backup/:filename
export const deleteBackup = async (filename: string): Promise<DeleteBackupResponse> => {
  const response = await apiClient.delete<DeleteBackupResponse>(
    `/database/delete-backup/${filename}`
  );
  return response.data;
};

// POST /database/replenish-database
export const replenishDatabase = async (file: File): Promise<RestoreDatabaseResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post<RestoreDatabaseResponse>(
    '/database/replenish-database',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data;
};
