# GoLightly03 API Reference

This API is an Express and TypeScript service backed by SQLite through the `db-models` package.

This directory is the API documentation home for the `api/` subproject. Router-level endpoint docs live under [`./endpoints`](./endpoints).

1. Available endpoint guides
   - [users](./endpoints/users.md)

2. Common conventions
   - Base URL for local development: `http://localhost:3000`
   - Protected routes use `Authorization: Bearer <accessToken>`
   - JSON request bodies should include `Content-Type: application/json`
   - Error responses use a shared envelope with `code`, `message`, `status`, and optional `details`

3. Shared error response shape

```json
{
	"error": {
		"code": "AUTH_FAILED",
		"message": "Invalid email or password",
		"status": 401
	}
}
```

4. Endpoint documentation format
   - Each file documents a single router or route group
   - Each endpoint has its own section
   - Each endpoint includes parameters, a sample request, a sample response, and notable error responses
   - File names are lower case and follow the router subdomain

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

#### Missing required field (400)

```json
{
	"error": {
		"code": "VALIDATION_ERROR",
		"message": "Email and password are required",
		"status": 400
	}
}
```

#### Invalid credentials (401)

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

5. Additional notes
   - Accounts created through Google-only authentication cannot use this endpoint until their auth provider supports password login.
