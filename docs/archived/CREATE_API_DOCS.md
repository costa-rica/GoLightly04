---
name: Create API Docs
description: Instructions for AI coding agents to generate a standard docs/api-documentation/ documentation set for any project that exposes an HTTP API.
created_at: 2026-05-14
updated_at: 2026-05-14
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Create API Docs

This skill instructs AI coding agents how to generate the `docs/api-documentation/` directory for any project that exposes an HTTP API. It is technology- and framework-agnostic: it works for Express, Fastify, Flask, FastAPI, Django, Rails, Go net/http, ASP.NET, or any other server stack, and for any persistence layer.

Run this once per project, or whenever the existing API docs have drifted far enough from the implementation that regenerating is cheaper than editing.

## When to use

- The repository exposes one or more HTTP routers / controllers and has no `docs/api-documentation/` directory.
- The existing `docs/api-documentation/` is stale, incomplete, or inconsistent in format across files.
- The user explicitly asks to "create the API docs", "regenerate API documentation", or similar.

## Output location and files

All output is written under `docs/api-documentation/` at the repository root. Produce:

1. `docs/api-documentation/API_REFERENCE.md` — the top-level index.
2. One file per router/resource under `docs/api-documentation/endpoints/`.
3. Optional subdirectories under `endpoints/` when the project groups related routers into a namespace (see §3).

Before writing, read the project's existing AGENTS.md / CLAUDE.md, then enumerate every router or controller in the source tree. Source endpoint paths, methods, parameter names, status codes, and response shapes from the actual code — never invent them. If a response shape cannot be determined from the source, mark it as `TODO: confirm response shape` rather than guessing.

## Section conventions

Every generated file uses GitHub-flavored Markdown with the YAML frontmatter described in §1. Within each file use `##` for top-level sections (one per endpoint) and `###` for endpoint subsections (Parameters, Sample Request, Sample Response, Error Responses). Avoid bold text in headings and at the start of list items.

## 1. YAML frontmatter (every file)

Every generated `.md` file — including this one, `API_REFERENCE.md`, and every file under `endpoints/` — MUST begin with a YAML frontmatter block delimited by `---` lines containing exactly these four keys:

```yaml
---
created_at: YYYY-MM-DD
updated_at: YYYY-MM-DD
created_by: <agent name> (<model>)
modified_by: <agent name> (<model>)
---
```

Rules:

- `created_at` is set once, at file creation, and MUST NEVER be modified on later edits.
- `updated_at` is rewritten to today's date on every modification.
- `created_by` is set once, at file creation, and MUST NEVER be modified on later edits.
- `modified_by` is rewritten on every modification. On the very first write, set it to the same value as `created_by`.
- The `created_by` / `modified_by` value uses the format `<agent name> (<model>)`, lowercase only, with no email addresses and no angle brackets.

Acceptable examples:

```yaml
created_by: claude (sonnet-4)
created_by: claude (opus-4.7)
created_by: codex (gpt-5)
modified_by: claude (haiku-4.5)
```

Not acceptable:

- `created_by: Claude <noreply@anthropic.com>` (contains email + angle brackets + capitalization)
- `created_by: claude` (missing model)
- `created_by: Claude (Sonnet-4)` (not lowercase)

When editing an existing file that already has frontmatter, update only `updated_at` and `modified_by`. When editing a file that lacks frontmatter, add it and set `created_at` to today's date and `created_by` to the editing agent — never guess a historical author.

## 2. API_REFERENCE.md

Purpose: a single index page that names the API, states the stack in one sentence, and links to every per-router file under `endpoints/`.

Required structure:

1. Frontmatter (per §1).
2. `# <ProjectName> API Reference` heading (use the actual project name).
3. A one-sentence summary that names the server framework, language, and persistence layer (read these from the project's package manifest, `requirements.txt`, `go.mod`, or equivalent).
4. A short paragraph noting that this file is the top-level index and that each resource has its own file under `./endpoints/`.
5. A flat bullet list of links to every top-level router file under `endpoints/`. Use the file's resource name as the link text and a relative path (`./endpoints/<name>.md`) as the href.
6. One `###` subsection per namespace subdirectory (e.g. `### Analysis`, `### News Organizations`). Under each, a bullet list of links to the files inside that subdirectory.
7. A short `## File naming` section documenting the naming convention: lowercase, hyphen-separated, matching the router's URL prefix. Example: a router mounted at `/contract-users-teams` becomes `endpoints/contract-users-teams.md`.
8. A `## Endpoint documentation format` section that prescribes the per-endpoint structure used in every file under `endpoints/`. Repeat the format in §3 verbatim so a reader of `API_REFERENCE.md` can author a new endpoint file without opening this skill. Mention explicitly: avoid bold text in section headings or at the start of list items.

## 3. endpoints/ files

Purpose: one file per router/controller (or per logical resource if the project groups multiple files into one router).

### File layout

- One file per router. File name is lowercase, hyphen-separated, matches the router's URL prefix. Example: a router mounted at `/articles-approveds` becomes `endpoints/articles-approveds.md`.
- Group related routers under a subdirectory when the project itself groups them under a shared URL prefix or feature area. Example: routers mounted under `/analysis/*` go in `endpoints/analysis/`, routers mounted under `/news-orgs/*` go in `endpoints/news-orgs/`. Create a subdirectory only when there are two or more related routers; do not create a single-file subdirectory.
- Do not create an `index.md` inside subdirectories — link to each file individually from `API_REFERENCE.md`.

### Per-file structure

Every file under `endpoints/` follows this structure:

1. Frontmatter (per §1).
2. `# <Resource> API` heading. Use a human-readable resource name (e.g. `# Users API`, `# Article Approveds API`).
3. A one-sentence description of what the router handles.
4. A line stating the URL prefix every endpoint shares, formatted as: `All endpoints are prefixed with` `` `/<prefix>` ``.
5. One `##` section per endpoint in source order, following the per-endpoint structure below.

### Per-endpoint structure

Each endpoint gets a `##` section. Inside the section, use `###` for the standard subsections in this order: Parameters, Sample Request, Sample Response, Error Responses, and optionally one more section for non-standard notes.

1. Heading:

   ```text
   ## <METHOD> /<router-prefix>/<endpoint-path>
   ```

   Use the uppercase HTTP verb, then a space, then the full path including the router prefix and any URL parameters (e.g. `:id`, `{userId}`, `<token>`). Match the project's path-parameter syntax.

2. One short description sentence directly under the heading, in prose. No bold.

3. A bullet list of per-endpoint flags. Include only the bullets that apply:

   - whether authentication is required (and what kind: JWT, session cookie, API key header, etc.)
   - whether the endpoint is rate-limited (and the limiter name if the project names them)
   - any side effects worth flagging (sends email, enqueues a job, creates rows in additional tables, calls an external service)
   - request/response content type when it is not JSON (e.g. `multipart/form-data`, `application/octet-stream`, streaming responses)

4. `### Parameters` — a bullet list, one entry per parameter, in this format:

   ```text
   - `<name>` (<type>, <required|optional>[, <location>]): <description>
   ```

   `<location>` is omitted for body parameters and included when the parameter is not in the body: `URL parameter`, `query`, `header`, `path`, etc. Mention validation rules (length limits, allowed values, regex) inline when they exist in the source.

   If the endpoint takes no parameters, write `None.` instead of an empty list.

5. `### Sample Request` — a fenced `bash` block with a `curl` command that hits the endpoint. Use `http://localhost:<port>` as the base URL (read the dev port from the project's config). Include realistic header values, a realistic body, and any URL parameters substituted with example values. For authenticated endpoints, include an `Authorization` header with a placeholder token.

6. `### Sample Response` — a fenced `json` block showing a representative success response. Match the actual shape returned by the handler. If the response is not JSON, use the appropriate code fence (`text`, `xml`, etc.) and a one-line note above it.

7. `### Error Responses` — one `####` subsection per distinct error path, in this format:

   ```markdown
   #### <Short error name> (<status code>)

   ```json
   { ... }
   ```
   ```

   Cover every error path the handler can return. Read these from the source — look for `throw`, `res.status(...).json(...)`, `return Response(..., status=...)`, `raise HTTPException`, or the framework equivalent. If the handler can return a 500 from an unhandled exception, document it as a generic Server error.

   If the endpoint has no defined error paths, write `None defined.` and omit the subsection list.

8. Optional final section for non-standard information: pagination semantics, idempotency keys, webhook payloads, response streaming behavior, deprecation notes. Use this sparingly. Use a descriptive `###` heading (e.g. `### Pagination`, `### Idempotency`), not a generic label like "Additional Information".

### Formatting rules to enforce

- Do not use bold text in section headings.
- Do not start a bullet with bold text. Plain text or inline code is fine.
- Use inline code (backticks) for parameter names, header names, environment variables, URL paths, table names, and HTTP method names within prose.
- Prefer code fences over prose for any structured payload — never paraphrase a JSON body in prose.
- Keep prose descriptions to one or two sentences. The reference is for lookup, not for tutorials.

## 4. Mapping source code to files

To enumerate what files to create, walk the project's HTTP layer:

- For Express/Fastify/Koa: scan `app.use(...)` and `router.use(...)` calls in the entry point or app bootstrap. Each mounted router becomes one file.
- For Flask: scan `Blueprint` registrations and `app.register_blueprint(...)` calls. Each blueprint becomes one file.
- For FastAPI: scan `app.include_router(...)` calls. Each `APIRouter` becomes one file.
- For Django: scan the project's `urls.py` files. Each app's URL include becomes one file.
- For Rails: scan `config/routes.rb` resource and namespace declarations. Each top-level resource becomes one file.
- For Go net/http or chi/gin: scan the route registration block. Group routes by their shared path prefix; each prefix becomes one file.
- For ASP.NET: scan controllers. Each controller class becomes one file.

For every router file produced, walk its handler list in declaration order and produce one `##` section per handler. Do not reorder handlers alphabetically — preserve source order so a reader can map docs to code by line.

## Checklist before finishing

- [ ] `docs/api-documentation/API_REFERENCE.md` exists and links to every file under `endpoints/`.
- [ ] Every router in the source tree has a corresponding file under `endpoints/` (or under a namespaced subdirectory of `endpoints/`).
- [ ] Every file starts with the four-key YAML frontmatter block, with today's `created_at` / `updated_at` and the agent identified in `created_by` / `modified_by`.
- [ ] Every endpoint section follows the order: heading → description → flag bullets → Parameters → Sample Request → Sample Response → Error Responses → optional notes.
- [ ] Every `curl` example uses a real localhost URL and realistic values.
- [ ] Every JSON sample matches the shape returned by the actual handler — no invented fields.
- [ ] Every documented error path is reachable from the handler source.
- [ ] No bold text appears in any section heading or at the start of any list item.
- [ ] File names under `endpoints/` are lowercase, hyphen-separated, and match the router URL prefix.
