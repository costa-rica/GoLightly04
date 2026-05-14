---
created_at: 2026-05-14
updated_at: 2026-05-14
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Health API

The health router exposes a lightweight readiness endpoint for the API process.

All endpoints are prefixed with `/`.

## GET /healthz

Returns a simple status payload when the Express app is running.

### Parameters

None.

### Sample Request

```bash
curl http://localhost:3000/healthz
```

### Sample Response

```json
{
  "status": "ok"
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
