# Users Endpoints

These endpoints handle account registration, login, Google authentication, email verification, password reset, and self-service account deletion.

## POST /users/register

Create a new local user account and send an email verification message.

1. Authentication
   - No authentication required

2. Parameters
   - Body `email` string, required
   - Body `password` string, required, minimum length `4`

### Sample Request

```bash
curl --location 'http://localhost:3000/users/register' \
--header 'Content-Type: application/json' \
--data-raw '{"email":"user@example.com","password":"test"}'
```

### Sample Response

```json
{
  "message": "Registration successful. Please check your email to verify your account.",
  "userId": 1
}
```

### Error Responses

1. `400 VALIDATION_ERROR`
   - Missing email or password
   - Invalid email format
   - Password shorter than 4 characters
2. `409 CONFLICT`
   - User with this email already exists
3. `409 GOOGLE_USER_EXISTS`
   - An account with this email already exists and must use Google Sign-In

## GET /users/verify

Verify a user's email address using the emailed verification token.

1. Authentication
   - No authentication required

2. Parameters
   - Query `token` string, required

### Sample Request

```bash
curl --location 'http://localhost:3000/users/verify?token=verification-token'
```

### Sample Response

```json
{
  "message": "Email verified successfully. You can now log in."
}
```

### Error Responses

1. `400 VALIDATION_ERROR`
   - Missing verification token
2. `401 TOKEN_EXPIRED`
   - Verification token has expired
3. `401 INVALID_TOKEN`
   - Verification token is invalid
4. `404 USER_NOT_FOUND`
   - User for the token no longer exists

## POST /users/login

Authenticate a local account with email and password and return an access token.

1. Authentication
   - No authentication required

2. Parameters
   - Body `email` string, required
   - Body `password` string, required

### Sample Request

```bash
curl --location 'http://localhost:3000/users/login' \
--header 'Content-Type: application/json' \
--data-raw '{"email":"user@example.com","password":"test"}'
```

### Sample Response

```json
{
  "message": "Login successful",
  "accessToken": "jwt-token-value",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "isAdmin": false,
    "hasPublicMeditations": false
  }
}
```

### Error Responses

1. `400 VALIDATION_ERROR`
   - Missing email or password
2. `401 AUTH_FAILED`
   - Invalid email or password
3. `403 PASSWORD_AUTH_DISABLED`
   - Account must use Google Sign-In instead of password login
4. `403 EMAIL_NOT_VERIFIED`
   - Email verification has not been completed

## POST /users/google-auth

Authenticate with a Google ID token. This route can create a new Google user, log in an existing Google user, or link Google auth to an existing local user.

1. Authentication
   - No authentication required

2. Parameters
   - Body `idToken` string, required

### Sample Request

```bash
curl --location 'http://localhost:3000/users/google-auth' \
--header 'Content-Type: application/json' \
--data-raw '{"idToken":"google-id-token"}'
```

### Sample Response

```json
{
  "message": "Login successful via Google",
  "accessToken": "jwt-token-value",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "isAdmin": false,
    "hasPublicMeditations": false,
    "authProvider": "google"
  }
}
```

### Error Responses

1. `400 VALIDATION_ERROR`
   - Missing Google ID token
2. `401 INVALID_GOOGLE_TOKEN`
   - Google token could not be verified

## POST /users/forgot-password

Send a password reset email to an existing user.

1. Authentication
   - No authentication required

2. Parameters
   - Body `email` string, required

### Sample Request

```bash
curl --location 'http://localhost:3000/users/forgot-password' \
--header 'Content-Type: application/json' \
--data-raw '{"email":"user@example.com"}'
```

### Sample Response

```json
{
  "message": "Password reset link has been sent to your email address"
}
```

### Error Responses

1. `400 VALIDATION_ERROR`
   - Missing email
2. `404 USER_NOT_FOUND`
   - No account exists for the provided email

## POST /users/reset-password

Reset a password using a valid password reset token.

1. Authentication
   - No authentication required

2. Parameters
   - Body `token` string, required
   - Body `newPassword` string, required, minimum length `2`

### Sample Request

```bash
curl --location 'http://localhost:3000/users/reset-password' \
--header 'Content-Type: application/json' \
--data-raw '{"token":"reset-token","newPassword":"new-secret"}'
```

### Sample Response

```json
{
  "message": "Password has been reset successfully. You can now log in with your new password."
}
```

### Error Responses

1. `400 VALIDATION_ERROR`
   - Missing token or new password
   - New password shorter than 2 characters
2. `401 TOKEN_EXPIRED`
   - Password reset token has expired
3. `401 INVALID_TOKEN`
   - Password reset token is invalid
4. `404 USER_NOT_FOUND`
   - User for the token no longer exists

## DELETE /users/me

Delete the authenticated user's account and optionally preserve public meditations under a benevolent replacement user.

1. Authentication
   - Requires `Authorization: Bearer <accessToken>`

2. Parameters
   - Body `savePublicMeditationsAsBenevolentUser` boolean, optional, default `false`

### Sample Request

```bash
curl --location --request DELETE 'http://localhost:3000/users/me' \
--header 'Authorization: Bearer jwt-token-value' \
--header 'Content-Type: application/json' \
--data-raw '{"savePublicMeditationsAsBenevolentUser":true}'
```

### Sample Response

```json
{
  "message": "Your account has been deleted successfully",
  "userId": 1,
  "meditationsDeleted": 3,
  "elevenLabsFilesDeleted": 6,
  "benevolentUserCreated": true
}
```

### Error Responses

1. `401 AUTH_FAILED`
   - Missing or invalid bearer token
2. `500 INTERNAL_ERROR`
   - Account deletion workflow failed
