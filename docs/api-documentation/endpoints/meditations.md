---
created_at: 2026-05-14
updated_at: 2026-05-14
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Meditations API

The meditations router creates, lists, streams, favorites, updates, and deletes meditation records.

All endpoints are prefixed with `/meditations`.

## POST /meditations/create

Creates a meditation, creates one queue row per meditation element, and asks the worker to process it.

- Authentication required: JWT access token.
- Creates rows in `meditations` and `jobs_queue`.
- Calls the worker service asynchronously.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token.
- `title` (string, required): Meditation title.
- `visibility` (string, required): Must be `public` or `private`.
- `description` (string, optional): Trimmed description; blank values are stored as `null`.
- `meditationArray` (array, required): One or more meditation elements. Text elements use `text`, `voice_id`, and `speed`; sound elements use `sound_file`; pause elements use `pause_duration`.

### Sample Request

```bash
curl -X POST http://localhost:3000/meditations/create \
  -H "Authorization: Bearer jwt-access-token" \
  -H "Content-Type: application/json" \
  -d '{"title":"Morning","visibility":"public","meditationArray":[{"id":1,"text":"Breathe in","voice_id":"calm","speed":1},{"id":2,"pause_duration":"5"}]}'
```

### Sample Response

```json
{
  "message": "Meditation created successfully",
  "queueId": 42,
  "filePath": ""
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

#### Validation error (400)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "meditationArray must contain at least one element",
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

## GET /meditations/all

Lists public meditations, plus the authenticated user's private meditations when a valid token is provided.

- Authentication optional: JWT access token.

### Parameters

- `Authorization` (string, optional, header): Bearer JWT access token.

### Sample Request

```bash
curl http://localhost:3000/meditations/all \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

```json
{
  "meditations": [
    {
      "id": 3,
      "title": "Evening",
      "description": "Wind down",
      "meditationArray": [],
      "filename": "",
      "filePath": "/audio/evening.mp3",
      "visibility": "public",
      "createdAt": "2026-04-22T00:00:00.000Z",
      "updatedAt": "2026-04-22T00:00:00.000Z",
      "listenCount": 0,
      "status": "pending",
      "isFavorite": false,
      "isOwned": true,
      "ownerUserId": 10
    }
  ]
}
```

### Error Responses

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

## GET /meditations/:id

Returns one accessible meditation by ID.

- Authentication optional: JWT access token.

### Parameters

- `Authorization` (string, optional, header): Bearer JWT access token.
- `id` (number, required, URL parameter): Meditation ID.

### Sample Request

```bash
curl http://localhost:3000/meditations/3 \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

```json
{
  "meditation": {
    "id": 3,
    "title": "Evening",
    "description": "Wind down",
    "meditationArray": [],
    "filename": "",
    "filePath": "/audio/evening.mp3",
    "visibility": "public",
    "createdAt": "2026-04-22T00:00:00.000Z",
    "updatedAt": "2026-04-22T00:00:00.000Z",
    "listenCount": 0,
    "status": "complete",
    "isOwned": true,
    "ownerUserId": 10
  }
}
```

### Error Responses

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

#### Forbidden (403)

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have access to this meditation",
    "status": 403
  }
}
```

#### Meditation not found (404)

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Meditation not found",
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

## GET /meditations/:id/stream-token

Issues a short-lived token for streaming an accessible meditation.

- Authentication required: JWT access token.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token.
- `id` (number, required, URL parameter): Meditation ID.

### Sample Request

```bash
curl http://localhost:3000/meditations/11/stream-token \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

```json
{
  "token": "jwt-stream-token"
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

#### Forbidden (403)

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have access to this meditation",
    "status": 403
  }
}
```

#### Meditation not found (404)

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Meditation not found",
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

## GET /meditations/:id/stream

Streams the generated meditation audio file.

- Authentication optional: JWT access token or `token` query string stream token.
- Response content type: `audio/mpeg`.
- Supports byte range requests and returns `206` when `Range` is supplied.
- Increments `listenCount` when the stream starts from the beginning.

### Parameters

- `Authorization` (string, optional, header): Bearer JWT access token.
- `Range` (string, optional, header): Byte range in `bytes=<start>-<end>` format.
- `id` (number, required, URL parameter): Meditation ID.
- `token` (string, optional, query): JWT stream token issued by `/meditations/:id/stream-token`.

### Sample Request

```bash
curl http://localhost:3000/meditations/15/stream?token=jwt-stream-token \
  -H "Range: bytes=0-"
```

### Sample Response

The response body is MP3 audio bytes.

```text
<binary audio/mpeg stream>
```

### Error Responses

#### Authentication failed (401)

```json
{
  "error": {
    "code": "AUTH_FAILED",
    "message": "Invalid stream token",
    "status": 401
  }
}
```

#### Forbidden (403)

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have access to this meditation",
    "status": 403
  }
}
```

#### Meditation not found (404)

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Meditation not found",
    "status": 404
  }
}
```

#### Meditation not ready (409)

```json
{
  "error": {
    "code": "MEDITATION_NOT_READY",
    "message": "Meditation audio is not ready",
    "status": 409
  }
}
```

#### Invalid range (416)

```json
{
  "error": {
    "code": "INVALID_RANGE",
    "message": "Invalid Range header",
    "status": 416
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

### Streaming

When `Range` is present, the handler sets `Content-Range`, `Accept-Ranges`, `Content-Length`, and `Content-Type`. Without `Range`, it streams the full file with `Content-Length`, `Content-Type`, and `Accept-Ranges`.

## POST /meditations/favorite/:meditationId/:trueOrFalse

Adds or removes a meditation from the authenticated user's favorites.

- Authentication required: JWT access token.
- Creates or deletes a row in `contract_user_meditations`.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token.
- `meditationId` (number, required, URL parameter): Meditation ID.
- `trueOrFalse` (string, required, URL parameter): Use `true` to favorite; any other value unfavorites.

### Sample Request

```bash
curl -X POST http://localhost:3000/meditations/favorite/3/true \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

```json
{
  "message": "Meditation favorited",
  "meditationId": 3,
  "favorite": true
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

#### Meditation not found (404)

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Meditation not found",
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

## PATCH /meditations/update/:id

Updates editable fields for a meditation owned by the authenticated user.

- Authentication required: JWT access token.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token.
- `id` (number, required, URL parameter): Meditation ID.
- `title` (string, optional): New title.
- `description` (string, optional): New description; blank values are stored as `null`.
- `visibility` (string, optional): Must be `public` or `private` when supplied.

### Sample Request

```bash
curl -X PATCH http://localhost:3000/meditations/update/3 \
  -H "Authorization: Bearer jwt-access-token" \
  -H "Content-Type: application/json" \
  -d '{"title":"Evening calm","visibility":"private"}'
```

### Sample Response

```json
{
  "message": "Meditation updated",
  "meditation": {
    "id": 3,
    "title": "Evening calm",
    "description": "Wind down",
    "meditationArray": [],
    "filename": "",
    "filePath": "/audio/evening.mp3",
    "visibility": "private",
    "createdAt": "2026-04-22T00:00:00.000Z",
    "updatedAt": "2026-04-22T00:00:00.000Z",
    "listenCount": 0,
    "status": "complete",
    "isOwned": true,
    "ownerUserId": 10
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

#### Validation error (400)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "visibility must be public or private",
    "status": 400
  }
}
```

#### Forbidden (403)

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not own this meditation",
    "status": 403
  }
}
```

#### Meditation not found (404)

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Meditation not found",
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

## DELETE /meditations/:id

Deletes a meditation when requested by its owner or an admin.

- Authentication required: JWT access token.
- Deletes the meditation through cascade cleanup.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token.
- `id` (number, required, URL parameter): Meditation ID.

### Sample Request

```bash
curl -X DELETE http://localhost:3000/meditations/3 \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

```json
{
  "message": "Meditation deleted",
  "meditationId": 3
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

#### Forbidden (403)

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You cannot delete this meditation",
    "status": 403
  }
}
```

#### Meditation not found (404)

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Meditation not found",
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
