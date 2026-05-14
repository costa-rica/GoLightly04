---
created_at: 2026-05-14
updated_at: 2026-05-14
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Sounds API

The sounds router lists prerecorded sound files and lets admins upload or delete sound assets.

All endpoints are prefixed with `/sounds`.

## GET /sounds/sound_files

Lists sound files ordered by ascending ID.

### Parameters

None.

### Sample Request

```bash
curl http://localhost:3000/sounds/sound_files
```

### Sample Response

```json
{
  "soundFiles": [
    {
      "id": 1,
      "name": "Bowl",
      "description": "Calm",
      "filename": "bowl.mp3"
    }
  ]
}
```

### Error Responses

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

## POST /sounds/upload

Uploads an audio file to project resources and creates a `sound_files` row.

- Authentication required: JWT access token with admin privileges.
- Request content type: `multipart/form-data`.
- Creates a file under `prerecorded_audio` and a row in `sound_files`.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token for an admin user.
- `file` (file, required): Uploaded sound file; multer enforces a 20 MB file size limit.
- `name` (string, optional): Display name; defaults to the uploaded file's original name.
- `description` (string, optional): Trimmed description; blank values are stored as `null`.

### Sample Request

```bash
curl -X POST http://localhost:3000/sounds/upload \
  -H "Authorization: Bearer jwt-access-token" \
  -F "name=Bell" \
  -F "description=Warm" \
  -F "file=@./bell.mp3;type=audio/mpeg"
```

### Sample Response

```json
{
  "message": "Sound file uploaded successfully",
  "soundFile": {
    "id": 2,
    "name": "Bell",
    "description": "Warm",
    "filename": "1715817600000_bell.mp3"
  }
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

#### Authentication failed (401)

```json
{
  "error": {
    "code": "AUTH_FAILED",
    "message": "Invalid access token",
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

## DELETE /sounds/sound_file/:id

Deletes a sound file record and removes the backing audio file when present.

- Authentication required: JWT access token with admin privileges.
- Deletes a file from `prerecorded_audio` and removes a row from `sound_files`.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token for an admin user.
- `id` (number, required, URL parameter): Sound file ID.

### Sample Request

```bash
curl -X DELETE http://localhost:3000/sounds/sound_file/5 \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

```json
{
  "message": "Sound file deleted",
  "soundFileId": 5
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

#### Authentication failed (401)

```json
{
  "error": {
    "code": "AUTH_FAILED",
    "message": "Invalid access token",
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

#### Sound file not found (404)

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Sound file not found",
    "status": 404
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
