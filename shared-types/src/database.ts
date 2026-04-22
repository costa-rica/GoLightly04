export type BackupFile = {
  filename: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
};

export type GetBackupsResponse = {
  backups: BackupFile[];
  count: number;
};

export type CreateBackupResponse = {
  message: string;
  filename: string;
  path: string;
  tablesExported: number;
  timestamp: string;
};

export type DeleteBackupResponse = {
  message: string;
  filename: string;
};

export type RestoreDatabaseResponse = {
  message: string;
  tablesImported: number;
  rowsImported: Record<string, number>;
  totalRows: number;
};
