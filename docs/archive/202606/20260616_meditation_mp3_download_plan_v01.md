---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Plan: Authenticated MP3 Download per Meditation

## Goal

Let a user download the rendered `.mp3` for a meditation, with the download
available **only when the user is logged in** and only for meditations the user
is allowed to access.

## Scope

- `api` — one new route serving the file as an attachment.
- `web` — one client helper plus a download control in the audio UI.

Out of scope: changing how meditations are generated/stored, batch/zip
downloads, offline caching, and download analytics.

## Technology and existing building blocks

The rendered audio already exists on disk and is already served. This feature
reuses that machinery rather than adding new infrastructure.

- **File source:** `Meditation.filePath` (absolute path to the rendered `.mp3`),
  already used by the streaming endpoint.
- **Streaming reference implementation:** `GET /:id/stream` in
  `api/src/routes/meditations.ts` — reads `filePath`, validates access, and
  pipes the file. The download handler is a trimmed sibling of this (no HTTP
  range handling, no `listenCount` increment).
- **Access control:** `assertMeditationAccess(meditation, requester, "stream")`
  in `api/src/services/meditations/assertMeditationAccess.ts`. The `"stream"`
  intent already encodes "is this user allowed to listen to this audio," which
  is the correct rule for "is this user allowed to download this audio." No new
  intent is required.
- **Auth middleware:** `requireAuth` in `api/src/middleware/auth.ts`, already
  used across the meditation routes.
- **Web client:** `api/.../web/src/lib/api/meditations.ts` (axios `apiClient`
  with bearer token) and `web/src/components/AudioPlayer.tsx` (where audio is
  surfaced today).

## Authentication transport decision

The streaming endpoint uses `optionalAuth` plus a short-lived stream-token
query param because the HTML `<audio>` element cannot send an `Authorization`
header. A download is a deliberate user click, so we do not need that
work-around.

**Chosen approach: `fetch`-with-Authorization → Blob → trigger save.**

- The browser calls the download route with the existing bearer token via
  `apiClient` (responseType `blob`).
- The route is gated by `requireAuth`, so the "logged-in only" rule is enforced
  purely server-side; an anonymous request gets `401` and never reaches the
  file.
- The blob is turned into an object URL and a synthetic `<a download>` click
  saves it with a friendly filename.

Rejected alternative: reuse the stream-token query param with a plain
`<a download>` link. It works, but it would require the download route to accept
the token transport and would weaken the "logged-in only" guarantee to "has a
token," which is unnecessary for a click-driven action.

## API flow

New route: `GET /meditations/:id/download`, registered in
`api/src/routes/meditations.ts` alongside the existing stream routes.

1. `requireAuth` — reject anonymous requests with `401` before any work.
2. Load the meditation (`loadMeditationOrThrow`); `404` if missing.
3. `assertMeditationAccess(meditation, req.user, "stream")` — `403` if the user
   may not access this meditation.
4. If `!meditation.filePath`, return `409 MEDITATION_NOT_READY` (mirrors the
   stream handler's not-ready guard).
5. `stat` the file for `Content-Length`.
6. Set response headers:
   - `Content-Type: audio/mpeg`
   - `Content-Length: <size>`
   - `Content-Disposition: attachment; filename="<safe-title>.mp3"`
7. Pipe the file with `fs.createReadStream(filePath).pipe(res)`.

Notes:

- **No range handling.** Download is a single whole-file transfer; the `206`
  range branch from the stream handler is intentionally omitted.
- **No `listenCount` increment.** A download is not a listen; leave the counter
  to the stream endpoint.
- **Filename derivation.** Build the download filename from `meditation.title`,
  sanitized to a safe ASCII set (strip path separators and quotes, collapse
  whitespace, fall back to `meditation-<id>` if empty), then append `.mp3`. Keep
  this in a small local helper next to the route.

## Web flow

1. **Client helper** in `web/src/lib/api/meditations.ts`, e.g.
   `downloadMeditation(id: number)`:
   - `apiClient.get('/meditations/${id}/download', { responseType: 'blob' })`.
   - Read the filename from the response `Content-Disposition` header when
     present; otherwise fall back to a title-derived default passed by the
     caller.
   - Create an object URL, trigger a synthetic anchor click, then revoke the
     object URL.
2. **UI control** in `web/src/components/AudioPlayer.tsx` (or the nearest
   meditation-actions surface that already knows it is rendering for a
   logged-in user): a "Download" button shown only when the user is
   authenticated and the meditation has finished rendering
   (`status === "complete"` / has a `filePath`-backed stream). Disable while the
   download request is in flight to avoid duplicate saves.
3. **Error handling:** surface `401/403/409` via the existing toast mechanism
   (`web/src/components/Toast.tsx`) with a human-readable message; a `409` maps
   to an "audio not ready yet" message.

## Key functions / files touched

- `api/src/routes/meditations.ts` — add `GET /:id/download`; add a local
  `safeDownloadFilename(title, id)` helper.
- `web/src/lib/api/meditations.ts` — add `downloadMeditation(...)`.
- `web/src/components/AudioPlayer.tsx` — add the gated download button + handler.
- Reused unchanged: `assertMeditationAccess`, `requireAuth`,
  `loadMeditationOrThrow`.

## Risks and mitigations

- **Access bypass:** mitigated by reusing `assertMeditationAccess(..., "stream")`
  and `requireAuth` — identical rules to the audited stream path; no new policy
  surface.
- **Large file memory use:** mitigated by streaming with
  `createReadStream(...).pipe(res)` rather than buffering the file.
- **Header-injection via title in `Content-Disposition`:** mitigated by the
  sanitizing filename helper.
- **Double-counting listens:** avoided by deliberately not touching
  `listenCount` in the download handler.

## Testing

- API: add a test alongside the existing meditation route tests
  (`api/tests/...`) covering: `401` when anonymous, `403` when accessing a
  private meditation owned by another user, `409` when `filePath` is absent,
  and `200` with `Content-Disposition: attachment` for an authorized request.
- Web: manual verification that the button only appears when logged in and that
  the saved file opens as valid audio.

## Assessment of size

This is a small, additive change that reuses existing access control and
file-serving patterns (roughly one new route plus one client helper and one
button). Per `docs/PLAN_AND_VET.md`, it is above the "~5 lines, trivial" bar
(it adds a new route and a UI integration point), so a phased todo list is
warranted before implementation if the operator wants to run the full
plan-and-vet loop. Otherwise it is small enough to implement directly from this
plan.
