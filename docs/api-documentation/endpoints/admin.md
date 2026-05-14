---
created_at: 2026-05-14
updated_at: 2026-05-14
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Admin API

The admin router exposes privileged user, meditation, and queue management endpoints.

All endpoints are prefixed with `/admin`.

## GET /admin/users

Lists users with email verification, admin, and public meditation flags.

- Authentication required: JWT access token with admin privileges.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token for an admin user.

### Sample Request

```bash
curl http://localhost:3000/admin/users \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

```json
{
  "users": [
    {
      "id": 1,
      "email": "admin@example.com",
      "authProvider": "local",
      "isEmailVerified": true,
      "emailVerifiedAt": "2026-04-22T00:00:00.000Z",
      "isAdmin": true,
      "hasPublicMeditations": true,
      "createdAt": "2026-04-22T00:00:00.000Z",
      "updatedAt": "2026-04-22T00:00:00.000Z"
    }
  ]
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

## DELETE /admin/users/:id

Deletes a user and either transfers their public meditations to the benevolent system user or deletes all their meditations.

- Authentication required: JWT access token with admin privileges.
- May create the benevolent system user `benevolent.system@golightly.local`.
- Deletes private meditations through cascade cleanup.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token for an admin user.
- `id` (number, required, URL parameter): User ID.
- `savePublicMeditationsAsBenevolentUser` (boolean, optional): When `true`, public meditations are reassigned instead of deleted.

### Sample Request

```bash
curl -X DELETE http://localhost:3000/admin/users/9 \
  -H "Authorization: Bearer jwt-access-token" \
  -H "Content-Type: application/json" \
  -d '{"savePublicMeditationsAsBenevolentUser":true}'
```

### Sample Response

```json
{
  "message": "User deleted",
  "userId": 9
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

#### User not found (404)

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "User not found",
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

## GET /admin/meditations

Lists all meditation records ordered by newest creation date.

- Authentication required: JWT access token with admin privileges.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token for an admin user.

### Sample Request

```bash
curl http://localhost:3000/admin/meditations \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

```json
{
  "meditations": [
    {
      "id": 8,
      "userId": 10,
      "title": "Morning",
      "description": "Start gently",
      "meditationArray": [],
      "filename": "morning.mp3",
      "filePath": "/audio/morning.mp3",
      "visibility": "public",
      "status": "complete",
      "listenCount": 4,
      "createdAt": "2026-04-22T00:00:00.000Z",
      "updatedAt": "2026-04-22T00:00:00.000Z"
    }
  ]
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

## DELETE /admin/meditations/:id

Deletes a meditation through cascade cleanup.

- Authentication required: JWT access token with admin privileges.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token for an admin user.
- `id` (number, required, URL parameter): Meditation ID.

### Sample Request

```bash
curl -X DELETE http://localhost:3000/admin/meditations/8 \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

```json
{
  "message": "Meditation deleted",
  "meditationId": 8
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

## GET /admin/queuer

Lists all queue records ordered by ascending ID.

- Authentication required: JWT access token with admin privileges.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token for an admin user.

### Sample Request

```bash
curl http://localhost:3000/admin/queuer \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

```json
{
  "queue": [
    {
      "id": 1,
      "meditationId": 8,
      "sequence": 1,
      "type": "text",
      "status": "pending",
      "filePath": null,
      "attemptCount": 0,
      "lastError": null,
      "lastAttemptedAt": null,
      "createdAt": "2026-04-22T00:00:00.000Z",
      "updatedAt": "2026-04-22T00:00:00.000Z"
    }
  ]
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

## DELETE /admin/queuer/:id

Deletes the meditation associated with a queue record through cascade cleanup.

- Authentication required: JWT access token with admin privileges.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token for an admin user.
- `id` (number, required, URL parameter): Queue record ID.

### Sample Request

```bash
curl -X DELETE http://localhost:3000/admin/queuer/1 \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

```json
{
  "message": "Queue record deleted",
  "queueId": 1
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

#### Queue record not found (404)

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Queue record not found",
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

## POST /admin/meditations/:id/requeue

Requeues a meditation when it has incomplete jobs or completed jobs with a non-complete meditation status.

- Authentication required: JWT access token with admin privileges.
- Calls the worker service asynchronously.

### Parameters

- `Authorization` (string, required, header): Bearer JWT access token for an admin user.
- `id` (number, required, URL parameter): Meditation ID.

### Sample Request

```bash
curl -X POST http://localhost:3000/admin/meditations/8/requeue \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

```json
{
  "message": "Meditation requeued",
  "meditationId": 8
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

#### Requeue not allowed (409)

```json
{
  "error": {
    "code": "REQUEUE_NOT_ALLOWED",
    "message": "Meditation has nothing to requeue",
    "status": 409
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
