# Meditations Endpoints

These endpoints cover listing meditations, streaming audio, creating meditations through the worker queue, updating metadata, deleting meditations, and marking favorites.

## GET /meditations/:id/stream

Stream the generated MP3 file for a meditation. Public meditations can be streamed anonymously. Private meditations require ownership.

1. Authentication
   - Optional bearer token
   - Required for private meditations

2. Parameters
   - Path `id` number, required
   - Header `Range` string, optional, for partial audio streaming

### Sample Request

```bash
curl --location 'http://localhost:3000/meditations/12/stream' \
--header 'Authorization: Bearer jwt-token-value' \
--header 'Range: bytes=0-1023'
```

### Sample Response

1. Success returns audio bytes, not JSON.
2. Response status is:
   - `200` for a full file response
   - `206` for a ranged response
3. Response headers include:
   - `Content-Type: audio/mpeg`
   - `Accept-Ranges: bytes`

### Error Responses

1. `400 VALIDATION_ERROR`
   - Invalid meditation ID
2. `401 AUTH_FAILED`
   - Private meditation requested without authentication
3. `403 UNAUTHORIZED_ACCESS`
   - Authenticated user does not own the private meditation
4. `404 MANTRA_NOT_FOUND`
   - Meditation or meditation audio file not found
5. `500 INTERNAL_ERROR`
   - File path configuration is missing

## GET /meditations/all

Return the meditation catalog. Anonymous users receive public meditations only. Authenticated users also receive private meditations they own.

1. Authentication
   - Optional bearer token

2. Parameters
   - None

### Sample Request

```bash
curl --location 'http://localhost:3000/meditations/all' \
--header 'Authorization: Bearer jwt-token-value'
```

### Sample Response

```json
{
  "meditationsArray": [
    {
      "id": 12,
      "title": "Evening Calm",
      "description": "Wind down meditation",
      "visibility": "public",
      "filename": "evening-calm.mp3",
      "listenCount": 7,
      "favoriteCount": 2,
      "ownerUserId": 1
    }
  ]
}
```

### Error Responses

1. `500 INTERNAL_ERROR`
   - Meditation retrieval failed unexpectedly

## POST /meditations/favorite/:meditationId/:trueOrFalse

Mark or unmark a meditation as a favorite for the authenticated user.

1. Authentication
   - Requires `Authorization: Bearer <accessToken>`

2. Parameters
   - Path `meditationId` number, required
   - Path `trueOrFalse` string, required, must be `true` or `false`

### Sample Request

```bash
curl --location --request POST 'http://localhost:3000/meditations/favorite/12/true' \
--header 'Authorization: Bearer jwt-token-value'
```

### Sample Response

```json
{
  "message": "Meditation favorited successfully",
  "meditationId": 12,
  "favorite": true
}
```

### Error Responses

1. `400 VALIDATION_ERROR`
   - Invalid meditation ID
   - `trueOrFalse` is not `true` or `false`
2. `401 AUTH_FAILED`
   - Missing or invalid bearer token
3. `404 MANTRA_NOT_FOUND`
   - Meditation not found

## POST /meditations/create

Queue a new meditation creation workflow through the worker-node service.

1. Authentication
   - Requires `Authorization: Bearer <accessToken>`

2. Parameters
   - Body `meditationArray` array, required
   - Body `title` string, optional
   - Body `description` string, optional

### Sample Request

```bash
curl --location 'http://localhost:3000/meditations/create' \
--header 'Authorization: Bearer jwt-token-value' \
--header 'Content-Type: application/json' \
--data-raw '{
  "title": "Ocean Focus",
  "description": "A short guided meditation",
  "meditationArray": [
    {
      "text": "Take a slow breath in.",
      "voice_id": "voice-123",
      "sound_file": "ocean.mp3"
    }
  ]
}'
```

### Sample Response

```json
{
  "message": "Meditation created successfully",
  "queueId": 44,
  "filePath": "/path/to/output/final-file.mp3"
}
```

### Error Responses

1. `400 VALIDATION_ERROR`
   - `meditationArray` missing or not an array
2. `401 AUTH_FAILED`
   - Missing or invalid bearer token
3. `500 INTERNAL_ERROR`
   - `URL_MANTRIFY01QUEUER` is not configured
4. `5xx QUEUER_ERROR`
   - Worker queue service returned an error or invalid response

5. Additional notes
   - This endpoint forwards the creation request to the worker-node service at `URL_MANTRIFY01QUEUER`.

## PATCH /meditations/update/:id

Update meditation metadata for a meditation owned by the authenticated user.

1. Authentication
   - Requires `Authorization: Bearer <accessToken>`

2. Parameters
   - Path `id` number, required
   - Body `title` string, optional
   - Body `description` string, optional
   - Body `visibility` string, optional, must be `public` or `private`

### Sample Request

```bash
curl --location --request PATCH 'http://localhost:3000/meditations/update/12' \
--header 'Authorization: Bearer jwt-token-value' \
--header 'Content-Type: application/json' \
--data-raw '{"title":"Updated title","visibility":"public"}'
```

### Sample Response

```json
{
  "message": "Meditation updated successfully",
  "meditation": {
    "id": 12,
    "title": "Updated title",
    "visibility": "public"
  }
}
```

### Error Responses

1. `400 VALIDATION_ERROR`
   - Invalid meditation ID
   - No updatable fields provided
   - Invalid `visibility`
   - Empty `title`
2. `401 AUTH_FAILED`
   - Missing or invalid bearer token
3. `403 UNAUTHORIZED_ACCESS`
   - Authenticated user does not own the meditation
4. `404 MANTRA_NOT_FOUND`
   - Meditation not found

## DELETE /meditations/:id

Delete a meditation owned by the authenticated user and remove its generated audio file when present.

1. Authentication
   - Requires `Authorization: Bearer <accessToken>`

2. Parameters
   - Path `id` number, required

### Sample Request

```bash
curl --location --request DELETE 'http://localhost:3000/meditations/12' \
--header 'Authorization: Bearer jwt-token-value'
```

### Sample Response

```json
{
  "message": "Meditation deleted successfully",
  "meditationId": 12
}
```

### Error Responses

1. `400 VALIDATION_ERROR`
   - Invalid meditation ID
2. `401 AUTH_FAILED`
   - Missing or invalid bearer token
3. `403 UNAUTHORIZED_ACCESS`
   - Authenticated user does not own the meditation
4. `404 MANTRA_NOT_FOUND`
   - Meditation not found
5. `500 INTERNAL_ERROR`
   - Audio file deletion or database deletion failed
