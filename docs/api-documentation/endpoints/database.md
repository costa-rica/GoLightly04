---
created_at: 2026-05-14
updated_at: 2026-05-14
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Database API

The database router manages admin-only database backups, downloads, deletion, and restore operations.

All endpoints are prefixed with `/database`.

## GET /database/backups-list

Lists backup ZIP files stored under the configured backup directory.

- Authentication required: JWT access token with admin privileges.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token for an admin user.

### Sample Request

```bash
curl http://localhost:3000/database/backups-list \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

```json
{
  "backups": [
    {
      "filename": "backup_20260514_120000.zip",
      "size": 2048,
      "sizeFormatted": "2.0 KB",
      "createdAt": "2026-05-14T19:00:00.000Z"
    }
  ],
  "count": 1
}
```

### Error Responses

#### Authentication required (401)

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication required",
    "status": 401
  }
}
```

#### Admin required (403)

```json
{
  "error": {
    "code": "ADMIN_REQUIRED",
    "message": "Admin access required",
    "status": 403
  }
}
```

#### Server error (500)

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error",
    "status": 500
  }
}
```

## POST /database/create-backup

Exports database tables to CSV files, archives them into a ZIP backup, and stores the backup on disk.

- Authentication required: JWT access token with admin privileges.
- Creates CSV exports for `users`, `sound_files`, `meditations`, `jobs_queue`, and `contract_user_meditations`.
- Creates a ZIP file under the configured backup directory.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token for an admin user.

### Sample Request

```bash
curl -X POST http://localhost:3000/database/create-backup \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

```json
{
  "message": "Backup created",
  "filename": "backup_20260514_120000.zip",
  "path": "/path/to/resources/backups_db/backup_20260514_120000.zip",
  "tablesExported": 5,
  "timestamp": "20260514_120000"
}
```

### Error Responses

#### Authentication required (401)

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication required",
    "status": 401
  }
}
```

#### Admin required (403)

```json
{
  "error": {
    "code": "ADMIN_REQUIRED",
    "message": "Admin access required",
    "status": 403
  }
}
```

#### Server error (500)

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error",
    "status": 500
  }
}
```

## GET /database/download-backup/:filename

Downloads a backup ZIP file.

- Authentication required: JWT access token with admin privileges.
- Response content type is determined by Express `res.download`.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token for an admin user.
- `filename` (string, required, URL parameter): Backup ZIP filename.

### Sample Request

```bash
curl -OJ http://localhost:3000/database/download-backup/backup_20260514_120000.zip \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

The response body is the backup ZIP file.

```text
<binary zip file>
```

### Error Responses

#### Authentication required (401)

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication required",
    "status": 401
  }
}
```

#### Admin required (403)

```json
{
  "error": {
    "code": "ADMIN_REQUIRED",
    "message": "Admin access required",
    "status": 403
  }
}
```

#### Backup not accessible (500)

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error",
    "status": 500
  }
}
```

## DELETE /database/delete-backup/:filename

Deletes a backup ZIP file from the backup directory.

- Authentication required: JWT access token with admin privileges.
- Deletes a file from the configured backup directory.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token for an admin user.
- `filename` (string, required, URL parameter): Backup ZIP filename.

### Sample Request

```bash
curl -X DELETE http://localhost:3000/database/delete-backup/backup_20260514_120000.zip \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

```json
{
  "message": "Backup deleted",
  "filename": "backup_20260514_120000.zip"
}
```

### Error Responses

#### Authentication required (401)

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication required",
    "status": 401
  }
}
```

#### Admin required (403)

```json
{
  "error": {
    "code": "ADMIN_REQUIRED",
    "message": "Admin access required",
    "status": 403
  }
}
```

#### Server error (500)

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error",
    "status": 500
  }
}
```

## POST /database/replenish-database

Restores database tables from an uploaded backup ZIP containing CSV files.

- Authentication required: JWT access token with admin privileges.
- Request content type: `multipart/form-data`.
- Truncates and refills `contract_user_meditations`, `jobs_queue`, `meditations`, `sound_files`, and `users` inside a transaction.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token for an admin user.
- `file` (file, required): Backup ZIP file; multer enforces a 20 MB file size limit.

### Sample Request

```bash
curl -X POST http://localhost:3000/database/replenish-database \
  -H "Authorization: Bearer jwt-access-token" \
  -F "file=@./backup_20260514_120000.zip;type=application/zip"
```

### Sample Response

```json
{
  "message": "Database replenished",
  "tablesImported": 5,
  "rowsImported": {
    "users": 1,
    "sound_files": 0,
    "meditations": 0,
    "jobs_queue": 0,
    "contract_user_meditations": 0
  },
  "totalRows": 1
}
```

### Error Responses

#### Authentication required (401)

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication required",
    "status": 401
  }
}
```

#### Admin required (403)

```json
{
  "error": {
    "code": "ADMIN_REQUIRED",
    "message": "Admin access required",
    "status": 403
  }
}
```

#### Validation error (400)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "file is required",
    "status": 400
  }
}
```

#### Server error (500)

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error",
    "status": 500
  }
}
```
