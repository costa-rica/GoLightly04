---
created_at: 2026-05-14
updated_at: 2026-05-14
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# GoLightly04 API Reference

GoLightly04 exposes a TypeScript Express 5 API backed by Sequelize models over PostgreSQL.

This file is the top-level index for the API documentation. Each router has its own file under `./endpoints/`, with endpoint sections kept in source order.

- [Health](./endpoints/health.md)
- [Users](./endpoints/users.md)
- [Sounds](./endpoints/sounds.md)
- [Meditations](./endpoints/meditations.md)
- [Admin](./endpoints/admin.md)
- [Database](./endpoints/database.md)

## File naming

Endpoint files use lowercase, hyphen-separated names that match the router URL prefix. For example, a router mounted at `/contract-users-teams` becomes `endpoints/contract-users-teams.md`. The root health route is documented as `endpoints/health.md` because it has no mounted router prefix and exposes `/healthz`.

## Endpoint documentation format

Every file under `endpoints/` follows this structure:

1. Frontmatter with `created_at`, `updated_at`, `created_by`, and `modified_by`.
2. `# <Resource> API` heading.
3. A one-sentence description of what the router handles.
4. A line stating the shared URL prefix, formatted as `All endpoints are prefixed with` `/<prefix>`.
5. One `##` section per endpoint in source order.

Each endpoint section follows this structure:

1. `## <METHOD> /<router-prefix>/<endpoint-path>`
2. One short description sentence.
3. A bullet list for endpoint flags, only when they apply:
   - authentication requirements and token type
   - rate limiting
   - side effects
   - non-JSON request or response content types
4. `### Parameters`
5. `### Sample Request`
6. `### Sample Response`
7. `### Error Responses`
8. Optional focused sections such as `### Pagination`, `### Streaming`, or `### Idempotency`

Formatting rules:

- Avoid bold text in section headings or at the start of list items.
- Use inline code for parameter names, header names, environment variables, URL paths, table names, and HTTP methods.
- Use code fences for structured payloads.
- Keep prose descriptions to one or two sentences.
