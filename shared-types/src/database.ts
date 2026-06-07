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

export type CreateBackupRequest = {
  includeResources: boolean;
};

export type CreateBackupResponse = {
  message: string;
  queuedAt: string;
};

export type DeleteBackupResponse = {
  message: string;
  filename: string;
};

export type ManifestFile = {
  created_at: string;
  app: string;
  environment: string;
  package_type: "db_only" | "db_and_resources";
  database_tables: string[];
  resources_root: string;
  excluded_dirs: string[];
};

export type RestoreDatabaseResponse = {
  message: string;
  tablesImported: number;
  rowsImported: Record<string, number>;
  totalRows: number;
  resourcesRestored: boolean;
  resourceFilesRestored: number;
};

export type BackupSizeEstimateResponse = {
  totalBytes: number;
  totalBytesFormatted: string;
};
