# GoLightly04 — Plan Assessment

**Date:** April 21, 2026
**Assessing:** `docs/requirements/20260421_GOLIGHTLY04_PLAN.md`

---

## Overview

This assessment reviews the plan against the existing `web/` frontend codebase to surface schema gaps, missing endpoints, open-item resolutions, and questions that require your input before a task list can be written.

---

## 1. Database Schema Gaps

### 1.1 Missing `sound_files` Table

The frontend has full sound file CRUD (`GET /sounds/sound_files`, `POST /sounds/upload`, `DELETE /sounds/sound_file/:id`) and the `SoundFile` type is:

```ts
{ id, name, description, filename }
```

A `sound_files` table is needed. Proposed schema:

| Column        | Type      | Description                                        |
| ------------- | --------- | -------------------------------------------------- |
| `id`          | INT       | Primary key                                        |
| `name`        | TEXT      | Display name                                       |
| `description` | TEXT      | Nullable                                           |
| `filename`    | TEXT      | Filename within `prerecorded_audio/`               |
| `created_at`  | TIMESTAMP |                                                    |
| `updated_at`  | TIMESTAMP |                                                    |

### 1.2 `meditations` Table — Missing Columns

The `Meditation` type in `meditationSlice.ts` exposes fields not present in the plan's schema:

| Missing Column     | Type    | Notes                                                            |
| ------------------ | ------- | ---------------------------------------------------------------- |
| `description`      | TEXT    | Nullable                                                         |
| `filename`         | TEXT    | The final MP3 filename (distinct from `file_path`)               |
| `visibility`       | ENUM    | `'public'` or `'private'`                                        |
| `listen_count`     | INT     | Default 0                                                        |

**Recommendation:** Add all four columns to `meditations`.

### 1.3 `meditations` — Storing the Original Element Array

The `Meditation` type includes `meditationArray: MeditationElement[]` where each element has `{ id, text?, voice_id?, speed?, pause_duration?, sound_file? }`. The frontend displays this (e.g., in `ModalMeditationDetails`).

**Decision needed — see Section 4, Question A.**

### 1.4 `meditations` — Per-User Favorites

The frontend supports `isFavorite` on meditations and `isOwned`/`ownerUserId`, plus a dedicated toggle endpoint (`POST /meditations/favorite/:meditationId/:trueOrFalse`). This implies a per-user favorites relationship.

**Decision needed — see Section 4, Question B.**

### 1.5 `users` Table — `auth_provider` Column

The `User` type in `authSlice.ts` includes:

```ts
authProvider: 'local' | 'google' | 'both'
```

The plan's open item asks whether this column is needed. **It is needed.** The frontend already uses it and the API has a `POST /users/google-auth` endpoint.

**Recommendation:** Add `auth_provider ENUM('local', 'google', 'both') NOT NULL DEFAULT 'local'` to `users`.

### 1.6 `jobs_queue` — Status ENUM Mismatch

The plan defines status as: `pending | processing | complete | failed`

The frontend admin UI (`admin.ts` → `QueueRecord`) defines status as: `queued | started | elevenlabs | concatenator | done`

These conflict. The frontend admin table shows the queue status in real time, so it must match whatever the API/worker writes. 

**Recommendation:** Use the more descriptive frontend values: `queued | started | elevenlabs | concatenator | done | failed`. This also makes it easier to observe worker progress.

---

## 2. Complete API Endpoint Map (Derived from Frontend)

The plan does not enumerate API endpoints. The following are required based on the frontend code. All are needed for the web UI to function.

### Auth — `/users`

| Method | Path                    | Auth Required | Notes                              |
| ------ | ----------------------- | ------------- | ---------------------------------- |
| POST   | `/users/register`       | No            | Local auth registration            |
| POST   | `/users/login`          | No            | Returns JWT + user object          |
| POST   | `/users/forgot-password`| No            | Sends reset email                  |
| POST   | `/users/reset-password` | No            | Token + newPassword body           |
| GET    | `/users/verify`         | No            | `?token=` query param              |
| POST   | `/users/google-auth`    | No            | Google ID token → JWT              |

### Meditations — `/meditations`

| Method | Path                                            | Auth Required | Notes                                |
| ------ | ----------------------------------------------- | ------------- | ------------------------------------ |
| GET    | `/meditations/all`                              | Optional      | Public + user's private if authed    |
| POST   | `/meditations/create`                           | Yes           | Creates meditation + queues jobs     |
| GET    | `/meditations/:id/stream`                       | Optional      | Streams final MP3 file               |
| POST   | `/meditations/favorite/:meditationId/:trueOrFalse` | Yes        | Toggles favorite                     |
| PATCH  | `/meditations/update/:id`                       | Yes           | Update title/description/visibility  |
| DELETE | `/meditations/:id`                              | Yes           | Owner or admin only                  |

### Sounds — `/sounds`

| Method | Path                    | Auth Required | Notes                         |
| ------ | ----------------------- | ------------- | ----------------------------- |
| GET    | `/sounds/sound_files`   | No            | Lists all prerecorded files   |
| POST   | `/sounds/upload`        | Yes (admin)   | Multipart upload              |
| DELETE | `/sounds/sound_file/:id`| Yes (admin)   | Deletes file + DB record      |

### Admin — `/admin`

| Method | Path                          | Auth Required    | Notes                        |
| ------ | ----------------------------- | ---------------- | ---------------------------- |
| GET    | `/admin/users`                | Yes (admin)      | All users                    |
| DELETE | `/admin/users/:id`            | Yes (admin)      | Optionally preserve meditations |
| GET    | `/admin/meditations`          | Yes (admin)      | All meditations              |
| DELETE | `/admin/meditations/:id`      | Yes (admin)      |                              |
| GET    | `/admin/queuer`               | Yes (admin)      | All jobs_queue records       |
| DELETE | `/admin/queuer/:id`           | Yes (admin)      |                              |

### Database — `/database`

| Method | Path                              | Auth Required | Notes                              |
| ------ | --------------------------------- | ------------- | ---------------------------------- |
| GET    | `/database/backups-list`          | Yes (admin)   | Lists backup zip files             |
| POST   | `/database/create-backup`         | Yes (admin)   | Creates CSV → zip backup           |
| GET    | `/database/download-backup/:filename` | Yes (admin) | Streams zip file download        |
| DELETE | `/database/delete-backup/:filename`   | Yes (admin) | Deletes backup file              |
| POST   | `/database/replenish-database`    | Yes (admin)   | Restore from uploaded zip          |

---

## 3. Open Items I Can Resolve

### 3.1 Audio File Naming Convention

**Recommendation:**

- ElevenLabs output (per job): `el_{meditation_id}_{job_id}_{sequence}.mp3`
- Final concatenated meditation: `meditation_{meditation_id}.mp3`
- No date prefix needed — ID uniqueness is sufficient and avoids filesystem bloat.

### 3.2 API Streaming Strategy

The frontend calls `GET /meditations/:id/stream`. 

**Recommendation:** Use Express `res.setHeader('Content-Type', 'audio/mpeg')` with `fs.createReadStream` piped to the response. Support `Range` header (HTTP 206) so the browser audio player can seek within the file. This is standard for audio streaming and requires no additional dependencies.

### 3.3 Worker Communication Strategy

The `api/.env.example` already defines `URL_WORKER_NODE=http://localhost:3002`. This confirms the communication pattern: after intake, the API does an HTTP POST to the worker with the `meditation_id`. The worker then processes it independently.

**Recommendation:** Keep the HTTP POST approach. The worker should expose a lightweight `POST /process` endpoint that accepts `{ meditationId }`. No change to the plan is needed here — just documenting the chosen approach.

### 3.4 Error Handling for Failed ElevenLabs Calls

**Recommendation:** On ElevenLabs failure, mark the individual job row as `failed`. After the failure, also mark the parent `meditations` row as `failed`. Do not auto-retry in the initial build — retry logic can be added later. The admin queue view already surfaces the `failed` status so the admin can see what needs attention.

### 3.5 PostgreSQL User / Role Setup

The `api/.env.example` shows both `PG_USER=golightly04_boot` and `PG_APP_ROLE=golightly04_app`. The `golightly04_boot` role is the privileged role used at startup (migrations, provisioning). The `golightly04_app` role is the restricted role for the running application.

**Recommendation:** The db startup module should connect as `golightly04_boot` for migrations and admin user provisioning, then the main API process should connect using `golightly04_app`.

---

## 4. Open Questions Requiring Your Input

### Question A — How to Store the Original `meditationArray`

The frontend `Meditation` type includes `meditationArray: MeditationElement[]`, and each element has: `{ id, text?, voice_id?, speed?, pause_duration?, sound_file? }`. This data is displayed in the meditation details modal and used to show the user what the meditation contains.

The `jobs_queue` table already stores the per-element data (text, sequence, type, etc.), but it does not store `voice_id` or `speed` as distinct columns. There are two options:

**Option 1 — Store as JSON column on `meditations`:**
Add a `meditation_array JSONB` column to `meditations`. The `jobs_queue` remains as-is for processing. The JSON is the source of truth for display.

**Option 2 — Expand `jobs_queue` columns + query it for display:**
Add `voice_id` and `speed` columns to `jobs_queue`. The API re-assembles the `meditationArray` from `jobs_queue` rows when returning a meditation.

Option 1 is simpler but stores data twice. Option 2 is more normalized but requires joining `jobs_queue` on every meditation fetch.

**Your call:** Which approach do you prefer?

---

### Question B — Per-User Favorites

The frontend has `isFavorite` on the `Meditation` type and a toggle endpoint. This is inherently per-user.

**Option 1 — Junction table `user_meditation_favorites`:**
```
user_id (FK → users.id), meditation_id (FK → meditations.id), PRIMARY KEY (user_id, meditation_id)
```

**Option 2 — `is_favorite` boolean on `meditations`:**
This would only work if meditations can only be favorited by their owner. Looking at the frontend, `getAllMeditations` returns both public and user's private meditations, and `isFavorite` appears to be visible per row. If a public meditation can be favorited by any user, Option 1 is required.

**Your call:** Can any user favorite any meditation (including public ones from other users), or is favoriting only for your own meditations?

---

### Question C — Google OAuth In Scope for This Build?

The frontend has `POST /users/google-auth`, `GoogleAuthProvider.tsx`, and the `NEXT_PUBLIC_GOOGLE_CLIENT_ID` env var. However, this adds meaningful complexity (Google OAuth token verification, handling the `'both'` auth_provider case, etc.).

**Your call:** Should Google OAuth be included in the initial build, or deferred to a later phase?

---

### Question D — Email Service In Scope?

The `api/.env.example` has Gmail SMTP credentials. The frontend has register → verify email flow (`GET /users/verify`) and forgot/reset password (`POST /users/forgot-password`, `POST /users/reset-password`). These require an email sending capability.

**Your call:** Should email (verification + password reset) be included in the initial build?

---

### Question E — `hasPublicMeditations` on User Object

The login response (from `API_REFERENCE.md`) and `AdminUser` type include `hasPublicMeditations: boolean`. This appears to be a derived value (does this user have any `visibility = 'public'` meditations?). Should this be stored as a column on `users`, or computed dynamically at query time?

**Recommendation:** Compute it dynamically (a count query at login/user fetch time). No column needed.

**Your call:** Agree with dynamic computation, or do you want it as a stored column?

---

## 5. db-models Package Notes

The plan calls for a shared `@golightly/db-models` Sequelize package consumed by both `api` and `worker-node`. This is the right approach. A few implementation notes:

- The package should export models, the Sequelize instance (or factory), and migration scripts.
- The `api` startup provisioning module (create DB if not exists, run migrations, seed admin user) should live in `db-models` or `api/src/startup/` — not in `worker-node`.
- The `worker-node` should only read from / write to tables — no provisioning responsibility.

---

## 6. worker-node Notes

The plan describes the worker as receiving a `meditation_id` via HTTP POST. A few clarifications:

- The worker needs its own Express server (lightweight) to expose `POST /process`.
- The worker should process jobs sequentially within a meditation — one `text` job at a time, in sequence order — to avoid hammering ElevenLabs.
- The concatenation uses `ffmpeg`. The `ffmpeg` binary must be available on `PATH` (or via the `fluent-ffmpeg` npm package which wraps it). This should be noted as a system dependency.
- Silence generation for `pause` rows: `ffmpeg` can generate silent audio of a given duration with `ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t {seconds} silence.mp3`.

---

## 7. Summary: Ready to Decide / Needs Input

| # | Topic                               | Status             |
| - | ----------------------------------- | ------------------ |
| 1 | `sound_files` table                 | Add it — confirmed |
| 2 | `auth_provider` column on `users`   | Add it — confirmed |
| 3 | `jobs_queue` status enum values     | Use frontend values — confirmed |
| 4 | Missing `meditations` columns       | Add them — confirmed |
| 5 | Audio file naming convention        | Recommendation made |
| 6 | Streaming strategy                  | Recommendation made |
| 7 | Worker HTTP POST communication      | Recommendation made |
| 8 | ElevenLabs error handling           | Recommendation made |
| 9 | PG role separation (boot vs app)    | Recommendation made |
| A | `meditationArray` storage approach  | **Needs your input** |
| B | Per-user favorites table            | **Needs your input** |
| C | Google OAuth in scope?              | **Needs your input** |
| D | Email service in scope?             | **Needs your input** |
| E | `hasPublicMeditations` computation  | Recommendation made — confirm? |
