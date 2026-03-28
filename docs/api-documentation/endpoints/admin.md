# Admin Endpoints

All routes in this file require an authenticated admin user.

1. Authentication
   - Requires `Authorization: Bearer <accessToken>`
   - The authenticated user must have `isAdmin = true`

## GET /admin/users

Return all users with selected account fields and a computed `hasPublicMeditations` flag.

2. Parameters
   - None

### Sample Request

```bash
curl --location 'http://localhost:3000/admin/users' \
--header 'Authorization: Bearer jwt-token-value'
```

### Sample Response

```json
{
  "users": [
    {
      "id": 1,
      "email": "user@example.com",
      "isEmailVerified": true,
      "emailVerifiedAt": "2026-03-28T00:00:00.000Z",
      "isAdmin": false,
      "createdAt": "2026-03-28T00:00:00.000Z",
      "updatedAt": "2026-03-28T00:00:00.000Z",
      "hasPublicMeditations": false
    }
  ]
}
```

### Error Responses

1. `401 AUTH_FAILED`
   - Missing or invalid bearer token
2. `403 UNAUTHORIZED_ACCESS`
   - Authenticated user is not an admin
3. `500 INTERNAL_ERROR`
   - User retrieval failed unexpectedly

## GET /admin/meditations

Return all meditations, including private records, with computed listen totals.

2. Parameters
   - None

### Sample Request

```bash
curl --location 'http://localhost:3000/admin/meditations' \
--header 'Authorization: Bearer jwt-token-value'
```

### Sample Response

```json
{
  "meditations": [
    {
      "id": 12,
      "title": "Evening Calm",
      "visibility": "private",
      "listens": 10
    }
  ]
}
```

### Error Responses

1. `401 AUTH_FAILED`
   - Missing or invalid bearer token
2. `403 UNAUTHORIZED_ACCESS`
   - Authenticated user is not an admin
3. `500 INTERNAL_ERROR`
   - Meditation retrieval failed unexpectedly

## DELETE /admin/meditations/:meditationId

Delete any meditation as an admin and remove its audio file when present.

2. Parameters
   - Path `meditationId` number, required

### Sample Request

```bash
curl --location --request DELETE 'http://localhost:3000/admin/meditations/12' \
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
   - Authenticated user is not an admin
4. `404 MANTRA_NOT_FOUND`
   - Meditation not found
5. `500 INTERNAL_ERROR`
   - File deletion or database deletion failed

## GET /admin/queuer

Return queue records from the worker-node workflow table.

2. Parameters
   - None

### Sample Request

```bash
curl --location 'http://localhost:3000/admin/queuer' \
--header 'Authorization: Bearer jwt-token-value'
```

### Sample Response

```json
{
  "queue": [
    {
      "id": 44,
      "status": "completed"
    }
  ]
}
```

### Error Responses

1. `401 AUTH_FAILED`
   - Missing or invalid bearer token
2. `403 UNAUTHORIZED_ACCESS`
   - Authenticated user is not an admin
3. `500 INTERNAL_ERROR`
   - Queue retrieval failed unexpectedly

## DELETE /admin/users/:userId

Delete any user as an admin and optionally preserve public meditations under a benevolent replacement user.

2. Parameters
   - Path `userId` number, required
   - Body `savePublicMeditationsAsBenevolentUser` boolean, optional, default `false`

### Sample Request

```bash
curl --location --request DELETE 'http://localhost:3000/admin/users/7' \
--header 'Authorization: Bearer jwt-token-value' \
--header 'Content-Type: application/json' \
--data-raw '{"savePublicMeditationsAsBenevolentUser":true}'
```

### Sample Response

```json
{
  "message": "User deleted successfully",
  "userId": 7,
  "meditationsDeleted": 2,
  "elevenLabsFilesDeleted": 4,
  "benevolentUserCreated": true
}
```

### Error Responses

1. `400 VALIDATION_ERROR`
   - Invalid user ID
2. `401 AUTH_FAILED`
   - Missing or invalid bearer token
3. `403 UNAUTHORIZED_ACCESS`
   - Authenticated user is not an admin
4. `500 INTERNAL_ERROR`
   - User deletion workflow failed
