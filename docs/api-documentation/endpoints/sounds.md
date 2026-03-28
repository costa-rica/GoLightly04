# Sounds Endpoints

These endpoints handle background sound file listing, uploading, and deletion.

## GET /sounds/sound_files

Return the available sound file records.

1. Authentication
   - No authentication required

2. Parameters
   - None

### Sample Request

```bash
curl --location 'http://localhost:3000/sounds/sound_files'
```

### Sample Response

```json
{
  "soundFiles": [
    {
      "id": 1,
      "name": "Ocean",
      "description": "Calming ocean ambience",
      "filename": "ocean.mp3"
    }
  ]
}
```

### Error Responses

1. `500 INTERNAL_ERROR`
   - Sound file retrieval failed unexpectedly

## POST /sounds/upload

Upload a new MP3 sound file and create its database record.

1. Authentication
   - Requires `Authorization: Bearer <accessToken>`

2. Parameters
   - Multipart form `file`, required
   - Multipart form `name`, optional
   - Multipart form `description`, optional

### Sample Request

```bash
curl --location 'http://localhost:3000/sounds/upload' \
--header 'Authorization: Bearer jwt-token-value' \
--form 'file=@"/absolute/path/to/ocean.mp3"' \
--form 'name="Ocean"' \
--form 'description="Calming ocean ambience"'
```

### Sample Response

```json
{
  "message": "Sound file uploaded successfully",
  "soundFile": {
    "id": 1,
    "name": "Ocean",
    "description": "Calming ocean ambience",
    "filename": "ocean.mp3"
  }
}
```

### Error Responses

1. `400 VALIDATION_ERROR`
   - No file uploaded
   - Uploaded file is not an `.mp3`
2. `401 AUTH_FAILED`
   - Missing or invalid bearer token
3. `409 VALIDATION_ERROR`
   - Filename already exists in the database or on disk
4. `500 INTERNAL_ERROR`
   - Sound files path is not configured
   - Saving the file or database record failed

## DELETE /sounds/sound_file/:id

Delete a sound file record and remove the file from disk. This route can also delete linked meditations when requested.

1. Authentication
   - Requires `Authorization: Bearer <accessToken>`

2. Parameters
   - Path `id` number, required
   - Body `deleteLinkedMeditations` boolean, optional, default `false`

### Sample Request

```bash
curl --location --request DELETE 'http://localhost:3000/sounds/sound_file/1' \
--header 'Authorization: Bearer jwt-token-value' \
--header 'Content-Type: application/json' \
--data-raw '{"deleteLinkedMeditations":true}'
```

### Sample Response

```json
{
  "message": "Sound file deleted successfully",
  "soundFileId": 1,
  "deletedMeditationsCount": 2
}
```

### Error Responses

1. `400 VALIDATION_ERROR`
   - Invalid sound file ID
2. `401 AUTH_FAILED`
   - Missing or invalid bearer token
3. `404 VALIDATION_ERROR`
   - Sound file not found
4. `409 VALIDATION_ERROR`
   - Sound file is still used by meditations and `deleteLinkedMeditations` was not set to `true`
5. `500 INTERNAL_ERROR`
   - Audio or meditation output paths are not configured
   - File deletion failed
