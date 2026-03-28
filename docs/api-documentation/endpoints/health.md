# Health Endpoints

This file documents the lightweight service health route exposed directly from the API app.

## GET /health

Return a basic status payload to confirm the API process is running.

1. Authentication
   - No authentication required

2. Parameters
   - None

### Sample Request

```bash
curl --location 'http://localhost:3000/health'
```

### Sample Response

```json
{
  "status": "ok",
  "service": "GoLightly03API"
}
```

### Error Responses

1. This route is intended to return `200` when the API process is healthy.
