# Database Endpoints

All routes in this file require an authenticated admin user. These endpoints manage backup creation, backup inspection, backup download, backup deletion, and full database restore.

1. Authentication
   - Requires `Authorization: Bearer <accessToken>`
   - The authenticated user must have `isAdmin = true`

## POST /database/create-backup

Create a zipped database backup under the configured project resources directory.

2. Parameters
   - None

### Sample Request

```bash
curl --location --request POST 'http://localhost:3000/database/create-backup' \
--header 'Authorization: Bearer jwt-token-value'
```

### Sample Response

```json
{
  "message": "Database backup created successfully",
  "filename": "database_backup_20260328_153000.zip",
  "path": "/path/to/projectResources/databaseBackups/database_backup_20260328_153000.zip",
  "tablesExported": 10,
  "timestamp": "20260328_153000"
}
```

### Error Responses

1. `401 AUTH_FAILED`
   - Missing or invalid bearer token
2. `403 ADMIN_REQUIRED`
   - Authenticated user is not an admin
3. `500 BACKUP_FAILED`
   - Backup creation failed
4. `500 INTERNAL_ERROR`
   - `PATH_PROJECT_RESOURCES` is not configured

## GET /database/backups-list

Return the available backup zip files sorted from newest to oldest.

2. Parameters
   - None

### Sample Request

```bash
curl --location 'http://localhost:3000/database/backups-list' \
--header 'Authorization: Bearer jwt-token-value'
```

### Sample Response

```json
{
  "backups": [
    {
      "filename": "database_backup_20260328_153000.zip",
      "size": 12048,
      "sizeFormatted": "11.77 KB",
      "createdAt": "2026-03-28T15:30:00.000Z"
    }
  ],
  "count": 1
}
```

### Error Responses

1. `401 AUTH_FAILED`
   - Missing or invalid bearer token
2. `403 ADMIN_REQUIRED`
   - Authenticated user is not an admin
3. `500 INTERNAL_ERROR`
   - Backup listing failed unexpectedly

## GET /database/download-backup/:filename

Download a specific backup zip file.

2. Parameters
   - Path `filename` string, required, must be a valid `.zip` filename

### Sample Request

```bash
curl --location 'http://localhost:3000/database/download-backup/database_backup_20260328_153000.zip' \
--header 'Authorization: Bearer jwt-token-value' \
--output database_backup_20260328_153000.zip
```

### Sample Response

1. Success returns a zip file stream, not JSON.
2. Response headers include:
   - `Content-Type: application/zip`
   - `Content-Disposition: attachment`

### Error Responses

1. `401 AUTH_FAILED`
   - Missing or invalid bearer token
2. `403 ADMIN_REQUIRED`
   - Authenticated user is not an admin
3. `404 BACKUP_NOT_FOUND`
   - Backup file does not exist
4. `400 INVALID_FILENAME`
   - Filename failed validation
5. `500 INTERNAL_ERROR`
   - `PATH_PROJECT_RESOURCES` is not configured

## DELETE /database/delete-backup/:filename

Delete a specific backup zip file.

2. Parameters
   - Path `filename` string, required, must be a valid `.zip` filename

### Sample Request

```bash
curl --location --request DELETE 'http://localhost:3000/database/delete-backup/database_backup_20260328_153000.zip' \
--header 'Authorization: Bearer jwt-token-value'
```

### Sample Response

```json
{
  "message": "Backup deleted successfully",
  "filename": "database_backup_20260328_153000.zip"
}
```

### Error Responses

1. `401 AUTH_FAILED`
   - Missing or invalid bearer token
2. `403 ADMIN_REQUIRED`
   - Authenticated user is not an admin
3. `404 BACKUP_NOT_FOUND`
   - Backup file does not exist
4. `400 INVALID_FILENAME`
   - Filename failed validation
5. `500 BACKUP_FAILED`
   - Backup deletion failed

## POST /database/replenish-database

Restore the full database from an uploaded backup zip.

2. Parameters
   - Multipart form `file`, required, must be a `.zip` backup archive

### Sample Request

```bash
curl --location 'http://localhost:3000/database/replenish-database' \
--header 'Authorization: Bearer jwt-token-value' \
--form 'file=@"/absolute/path/to/database_backup_20260328_153000.zip"'
```

### Sample Response

```json
{
  "message": "Database restored successfully",
  "tablesImported": 10,
  "rowsImported": {
    "users": 3,
    "meditations": 12
  },
  "totalRows": 42
}
```

### Error Responses

1. `400 INVALID_BACKUP_FILE`
   - No backup file uploaded
   - Uploaded file is not a valid zip archive
   - No CSV files were found in the archive
2. `401 AUTH_FAILED`
   - Missing or invalid bearer token
3. `403 ADMIN_REQUIRED`
   - Authenticated user is not an admin
4. `500 RESTORE_FAILED`
   - Restore workflow failed unexpectedly
5. `500 INTERNAL_ERROR`
   - `PATH_PROJECT_RESOURCES` is not configured
