---
created_at: 2026-05-14
updated_at: 2026-05-29
created_by: codex (gpt-5)
modified_by: codex (gpt-5.5)
---

# Users API

The users router handles account registration, login, email verification, password reset, and Google authentication.

All endpoints are prefixed with `/users`.

## POST /users/register

Creates a local user account and sends an email verification message.

- Sends a verification email.

### Parameters

- `email` (string, required): Email address for the new account; trimmed and lowercased.
- `password` (string, required): Password for the new account.

### Sample Request

```bash
curl -X POST http://localhost:3000/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

### Sample Response

```json
{
  "message": "Registration successful",
  "userId": 7
}
```

### Error Responses

#### Validation error (400)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing required field: email",
    "status": 400
  }
}
```

#### Email already registered (409)

```json
{
  "error": {
    "code": "EMAIL_EXISTS",
    "message": "Email is already registered",
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

## POST /users/login

Authenticates a verified local user and returns a JWT access token.

### Parameters

- `email` (string, required): Email address; trimmed and lowercased.
- `password` (string, required): Account password.

### Sample Request

```bash
curl -X POST http://localhost:3000/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

### Sample Response

```json
{
  "message": "Login successful",
  "accessToken": "jwt-access-token",
  "user": {
    "id": 5,
    "email": "user@example.com",
    "isAdmin": false,
    "authProvider": "local",
    "showScriptModeForCreatingMeditations": false,
    "hasPublicMeditations": false
  }
}
```

User payloads include `showScriptModeForCreatingMeditations`, which defaults to `false`. They may include `hasPublicMeditations` when the API computes the public meditation flag.

### Error Responses

#### Validation error (400)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing required field: email",
    "status": 400
  }
}
```

#### Authentication failed (401)

```json
{
  "error": {
    "code": "AUTH_FAILED",
    "message": "Invalid email or password",
    "status": 401
  }
}
```

#### Email not verified (403)

```json
{
  "error": {
    "code": "EMAIL_NOT_VERIFIED",
    "message": "Please verify your email before logging in",
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

## POST /users/forgot-password

Sends a password reset email when the account exists and always returns the same public response.

- Sends a password reset email when a matching user exists.

### Parameters

- `email` (string, required): Account email address; trimmed and lowercased.

### Sample Request

```bash
curl -X POST http://localhost:3000/users/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

### Sample Response

```json
{
  "message": "If that account exists, a password reset email has been sent"
}
```

### Error Responses

#### Validation error (400)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing required field: email",
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

## GET /users/me

Returns the currently authenticated user's profile.

Requires bearer authentication.

### Sample Request

```bash
curl http://localhost:3000/users/me \
  -H "Authorization: Bearer jwt-access-token"
```

### Sample Response

```json
{
  "user": {
    "id": 5,
    "email": "user@example.com",
    "isAdmin": false,
    "authProvider": "local",
    "showScriptModeForCreatingMeditations": false,
    "hasPublicMeditations": false
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

#### User not found (404)

```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User not found",
    "status": 404
  }
}
```

## PATCH /users/me/preferences

Updates the currently authenticated user's preferences.

Requires bearer authentication. The `showScriptModeForCreatingMeditations` preference defaults to `false` for new and existing users after migration.

### Parameters

- `showScriptModeForCreatingMeditations` (boolean, required): Enables the script-mode option in the create meditation UI.

### Sample Request

```bash
curl -X PATCH http://localhost:3000/users/me/preferences \
  -H "Authorization: Bearer jwt-access-token" \
  -H "Content-Type: application/json" \
  -d '{"showScriptModeForCreatingMeditations":true}'
```

### Sample Response

```json
{
  "user": {
    "id": 5,
    "email": "user@example.com",
    "isAdmin": false,
    "authProvider": "local",
    "showScriptModeForCreatingMeditations": true,
    "hasPublicMeditations": false
  }
}
```

### Error Responses

#### Validation error (400)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "showScriptModeForCreatingMeditations must be a boolean",
    "status": 400
  }
}
```

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

#### User not found (404)

```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User not found",
    "status": 404
  }
}
```

## POST /users/reset-password

Accepts a reset token and replaces the user's password.

### Parameters

- `token` (string, required): JWT reset token with `kind` equal to `reset-password`.
- `newPassword` (string, required): New password value.

### Sample Request

```bash
curl -X POST http://localhost:3000/users/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"reset-password-token","newPassword":"new-password123"}'
```

### Sample Response

```json
{
  "message": "Password reset successful"
}
```

### Error Responses

#### Validation error (400)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing required field: token",
    "status": 400
  }
}
```

#### Invalid token (400)

```json
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Invalid reset token",
    "status": 400
  }
}
```

#### User not found (404)

```json
{
  "error": {
    "code": "USER_NOT_FOUND",
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

## GET /users/verify

Verifies a user's email address from an email verification token.

### Parameters

- `token` (string, required, query): JWT verification token with `kind` equal to `verify-email`.

### Sample Request

```bash
curl "http://localhost:3000/users/verify?token=verify-email-token"
```

### Sample Response

```json
{
  "message": "Email verified successfully"
}
```

### Error Responses

#### Validation error (400)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "token must be a non-empty string",
    "status": 400
  }
}
```

#### Invalid token (400)

```json
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Invalid verification token",
    "status": 400
  }
}
```

#### User not found (404)

```json
{
  "error": {
    "code": "USER_NOT_FOUND",
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

## POST /users/google-auth

Authenticates a Google account, creating or linking a user record as needed.

- Calls Google's token verification service.

### Parameters

- `idToken` (string, required): Google ID token verified against `GOOGLE_CLIENT_ID`.

### Sample Request

```bash
curl -X POST http://localhost:3000/users/google-auth \
  -H "Content-Type: application/json" \
  -d '{"idToken":"google-id-token"}'
```

### Sample Response

```json
{
  "message": "Google authentication successful",
  "accessToken": "jwt-access-token",
  "user": {
    "id": 8,
    "email": "google@example.com",
    "isAdmin": false,
    "authProvider": "google",
    "showScriptModeForCreatingMeditations": false,
    "hasPublicMeditations": false
  }
}
```

User payloads include `showScriptModeForCreatingMeditations`, which defaults to `false`. They may include `hasPublicMeditations` when the API computes the public meditation flag.

### Error Responses

#### Validation error (400)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing required field: idToken",
    "status": 400
  }
}
```

#### Google email unavailable (400)

```json
{
  "error": {
    "code": "GOOGLE_AUTH_FAILED",
    "message": "Google account email is unavailable",
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
