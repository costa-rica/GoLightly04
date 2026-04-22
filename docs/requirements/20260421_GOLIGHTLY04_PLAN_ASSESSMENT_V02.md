# GoLightly04 — Plan Assessment V02

**Date:** April 21, 2026
**Supersedes:** `docs/requirements/20260421_GOLIGHTLY04_PLAN_ASSESSMENT.md`
**Supplemented by:** `docs/requirements/20260421_GOLIGHTLY04_PLAN_ASSESSMENT_V04_CLAUDE.md` — V04 adds the canonical meditation-element DTO, worker recovery design, signed stream token, and the `web/` rebuild plan. V04 overrides any conflicting JSON example here.

This document incorporates your responses from the V01 assessment and raises new concerns or questions that stem from those responses. When this document is fully resolved, it becomes the authoritative source for the TODO task list.

---

## Summary of Resolved Items

| Item                          | Decision                                                 |
| ----------------------------- | -------------------------------------------------------- |
| `sound_files` table           | ✅ Add it                                                |
| Missing `meditations` columns | ✅ Add them; default visibility = `public`               |
| `meditationArray` storage     | ✅ Option 1 — JSONB column on `meditations`              |
| Per-user favorites            | ✅ New `contract_user_meditations` table                 |
| `auth_provider` column        | ✅ Add to `users`                                        |
| `jobs_queue` status enum      | ✅ Use plan values; update frontend to match             |
| Jobs Queue admin UI           | ✅ Rename from "Queuer", TanStack Table with search/sort |
| Audio file naming             | ✅ Date subdirectories (with a clarification below)      |
| `hasPublicMeditations`        | ✅ Compute dynamically at query time                     |
| Google OAuth                  | ✅ Include in initial build                              |
| Email service                 | ✅ Include in initial build                              |
| Worker communication          | ✅ HTTP POST from API → worker                           |
| ElevenLabs error handling     | ✅ Mark job + meditation as `failed`; no auto-retry      |

---

## 1. Authoritative Database Schema

### `users`

| Column              | Type      | Notes                                               |
| ------------------- | --------- | --------------------------------------------------- |
| `id`                | INT       | Primary key, auto-increment                         |
| `email`             | TEXT      | Required, unique                                    |
| `password`          | TEXT      | Nullable (Google-only users have no password)       |
| `auth_provider`     | ENUM      | `'local'`, `'google'`, `'both'` — default `'local'` |
| `is_email_verified` | BOOLEAN   | Default `false`                                     |
| `email_verified_at` | TIMESTAMP | Nullable                                            |
| `is_admin`          | BOOLEAN   | Default `false`                                     |
| `created_at`        | TIMESTAMP |                                                     |
| `updated_at`        | TIMESTAMP |                                                     |

**Note on `auth_provider`:** This is the standard approach for apps supporting both local and social auth. When a user who already registered locally signs in with Google using the same email, the API updates their `auth_provider` to `'both'`. This is the only case that produces the `'both'` value. Confirmed conventional and correct.

---

### `sound_files`

| Column        | Type      | Notes                                |
| ------------- | --------- | ------------------------------------ |
| `id`          | INT       | Primary key, auto-increment          |
| `name`        | TEXT      | Display name                         |
| `description` | TEXT      | Nullable                             |
| `filename`    | TEXT      | Filename within `prerecorded_audio/` |
| `created_at`  | TIMESTAMP |                                      |
| `updated_at`  | TIMESTAMP |                                      |

---

### `meditations`

| Column             | Type      | Notes                                                 |
| ------------------ | --------- | ----------------------------------------------------- |
| `id`               | INT       | Primary key, auto-increment                           |
| `user_id`          | INT       | FK → `users.id`                                       |
| `title`            | TEXT      | Required                                              |
| `description`      | TEXT      | Nullable                                              |
| `meditation_array` | JSONB     | Snapshot of original elements (see Section 2)         |
| `filename`         | TEXT      | Final MP3 filename (set after concatenation)          |
| `file_path`        | TEXT      | Full path to final MP3 (set after concatenation)      |
| `visibility`       | ENUM      | `'public'`, `'private'` — default `'public'`          |
| `status`           | ENUM      | `'pending'`, `'processing'`, `'complete'`, `'failed'` |
| `listen_count`     | INT       | Default `0`                                           |
| `created_at`       | TIMESTAMP |                                                       |
| `updated_at`       | TIMESTAMP |                                                       |

---

### `jobs_queue`

| Column          | Type      | Notes                                                 |
| --------------- | --------- | ----------------------------------------------------- |
| `id`            | INT       | Primary key, auto-increment                           |
| `meditation_id` | INT       | FK → `meditations.id`                                 |
| `sequence`      | INT       | Order in the final concatenated file                  |
| `type`          | ENUM      | `'text'`, `'sound'`, `'pause'`                        |
| `input_data`    | TEXT      | JSON string — see Section 3 for format per type       |
| `status`        | ENUM      | `'pending'`, `'processing'`, `'complete'`, `'failed'` |
| `file_path`     | TEXT      | Nullable — path to audio file once job is complete    |
| `created_at`    | TIMESTAMP |                                                       |
| `updated_at`    | TIMESTAMP |                                                       |

---

### `contract_user_meditations`

| Column          | Type      | Notes                                  |
| --------------- | --------- | -------------------------------------- |
| `id`            | INT       | Primary key, auto-increment            |
| `user_id`       | INT       | FK → `users.id`                        |
| `meditation_id` | INT       | FK → `meditations.id`                  |
| `created_at`    | TIMESTAMP | When the user favorited the meditation |

Composite unique constraint on `(user_id, meditation_id)` to prevent duplicate favorites.

---

## 2. `meditation_array` JSONB — Clarification

**Your question:** "What do you mean it stores data twice?"

Here is the explanation: The `jobs_queue` table stores each meditation element as a separate row — this is the **operational data** the worker uses to process the meditation. The `meditation_array` JSONB column on `meditations` is a **display snapshot** — the same data, stored in JSON form for the frontend to read back.

They are written in the same API intake transaction and never re-synced after that. This is intentional **denormalization** — trading a tiny bit of storage for a much simpler read path. When the frontend requests a meditation, it gets back the `meditationArray` directly from the JSON column without needing to join across `jobs_queue` rows.

**Example JSON stored in `meditation_array`:**

```json
[
	{
		"sequence": 1,
		"type": "text",
		"text": "Close your eyes...",
		"voiceId": "nPczCjzI2devNBz1zQrb",
		"speed": "0.85"
	},
	{ "sequence": 2, "type": "pause", "pauseDuration": "5" },
	{ "sequence": 3, "type": "sound", "soundFile": "tibetan_bowl.mp3" }
]
```

---

## 3. `jobs_queue.input_data` Format

The `input_data` column is `TEXT` in the schema, but for `text`-type jobs the worker needs `voiceId` and `speed` in addition to the text string. The plan's original description ("The text string, sound ID, or pause duration") is too simple. **Recommendation: store `input_data` as a JSON string.**

| Job type | `input_data` JSON content                              |
| -------- | ------------------------------------------------------ |
| `text`   | `{ "text": "...", "voiceId": "...", "speed": "0.85" }` |
| `sound`  | `{ "soundFile": "tibetan_bowl.mp3" }`                  |
| `pause`  | `{ "pauseDuration": "5" }`                             |

If `voiceId` or `speed` are omitted (user didn't specify), the worker falls back to `DEFAULT_ELEVENLABS_VOICE_ID` and `DEFAULT_ELEVENLABS_SPEED` from its `.env`.

**No new questions — this is a recommendation you can confirm or override.**

---

## 4. Audio File Naming — Clarification Needed

Your response described the naming convention for two folders, but the header labels appeared to swap `prerecorded_audio` and `meditation_soundfiles`. Here is my interpretation — please confirm:

**`eleven_labs_audio_files/` (ElevenLabs TTS output, per job):**

```
{PATH_PROJECT_RESOURCES}/eleven_labs_audio_files/{YYYYMMDD}/el_{meditation_id}_{job_id}_{sequence}.mp3
```

**`meditation_soundfiles/` (final concatenated meditation MP3):**

```
{PATH_PROJECT_RESOURCES}/meditation_soundfiles/{YYYYMMDD}/meditation_{meditation_id}.mp3
```

**`prerecorded_audio/` (admin-uploaded sound files):**

```
{PATH_PROJECT_RESOURCES}/prerecorded_audio/{filename}
```

No date subdirectory here — these are permanent admin-uploaded files referenced by the `sound_files` table. The `filename` stored in the DB is what goes here.

**Is this interpretation correct?**

**Regarding `meditation_{meditation_id}.mp3` being problematic:** Since each meditation has a unique `id`, the filename is inherently unique. The only edge case would be if a `failed` meditation were ever re-queued and re-processed. In that scenario, the old (possibly incomplete or empty) file would be overwritten by the new one. This is actually acceptable behavior — there is no data loss because the content was invalid. No issue with this naming convention.

---

## 5. `onStartUp.ts` Module

Your addition: a startup module that ensures the required directory structure exists and provisions the admin user.

**Proposed location:** `api/src/startup/onStartUp.ts`

**Proposed responsibilities:**

1. Ensure database is provisioned (run Sequelize migrations/sync)
2. Ensure `PATH_PROJECT_RESOURCES` subdirectories exist: `meditation_soundfiles/`, `eleven_labs_audio_files/`, `prerecorded_audio/`
3. Create admin user if not already present (from `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars)

**New concern — should `worker-node` also check directories?**

The `worker-node` writes to `eleven_labs_audio_files/` and reads from `prerecorded_audio/`. If the API runs `onStartUp.ts` first and creates the directories, the worker is covered — as long as the API always starts before the worker. In a typical deployment (systemd, Docker Compose), this ordering can be enforced.

> **Question F:** Should the `worker-node` also include a lightweight directory check on startup (just the two directories it uses), or do we rely on the API's `onStartUp.ts` always running first?

---

## 6. `listen_count` — How Should It Be Incremented?

You said: "make the api function so that it responds to the web app when a user listens."

The `GET /meditations/:id/stream` endpoint is what the frontend uses to play audio (via `getStreamUrl()` in `web/src/lib/api/meditations.ts`). The current frontend does not call any separate "listen" endpoint — it just constructs and uses the stream URL directly.

There are two options:

**Option 1 — Auto-increment on stream request:**  
The stream endpoint (`GET /meditations/:id/stream`) increments `listen_count` each time it is called. Simple, no frontend change needed. Downside: counts partial or failed playback attempts.

**Option 2 — Dedicated `POST /meditations/:id/listen` endpoint:**  
The frontend explicitly calls this endpoint when the user actually starts listening. More accurate, but requires a small frontend change (adding the call to `AudioPlayer.tsx` or similar).

> **Question G:** Which approach do you prefer — auto-increment on stream, or a dedicated listen endpoint?

---

## 7. `ModalMeditationDetails` — No New Endpoint Needed

After reading the component code (`web/src/components/modals/ModalMeditationDetails.tsx`), the modal only shows and edits: **title, description, visibility**. It does not display the individual meditation elements (text rows, pauses, sounds).

The modal receives the full `Meditation` object from Redux state (already loaded via `GET /meditations/all`) and uses `PATCH /meditations/update/:id` and `DELETE /meditations/:id` — both already in the endpoint map.

**No new endpoint is needed for this modal.** The `GET /meditations/all` response will include the `meditation_array` JSONB data, so if you ever want to display the elements in this modal in the future, the data is already there.

However, I do recommend adding `GET /meditations/:id` (single meditation fetch) to the API — it's a standard REST endpoint that will be useful for direct links or future features.

---

## 8. Jobs Queue Admin Table — Changes Required

**Frontend changes needed for section 1.6:**

1. **Rename** the admin section from "Queuer" to "Jobs Queue"
2. **Update `QueueRecord` type** in `web/src/lib/api/admin.ts` to match the `jobs_queue` table:

```ts
// CURRENT (to be replaced):
export interface QueueRecord {
	id: number;
	userId: number;
	status: "queued" | "started" | "elevenlabs" | "concatenator" | "done";
	jobFilename: string;
	createdAt: string;
	updatedAt: string;
}

// NEW:
export interface QueueRecord {
	id: number;
	meditationId: number;
	sequence: number;
	type: "text" | "sound" | "pause";
	status: "pending" | "processing" | "complete" | "failed";
	filePath: string | null;
	createdAt: string;
	updatedAt: string;
}
```

3. **Replace `TableAdminQueuer.tsx`** with a TanStack Table implementation showing the new columns: ID, Meditation ID, Sequence, Type, Status, File Path (truncated), Created At, Delete

4. **Add `@tanstack/react-table`** to `web/package.json` — it is **not currently installed**

5. **Update `GET /admin/queuer` API response** to return rows shaped like the `jobs_queue` table

**Delete behavior (resolved):** Clicking delete on any `jobs_queue` row triggers a **full cascade delete** for the entire `meditation_id`:

- Delete all `jobs_queue` rows for that `meditation_id`
- Delete the `meditations` row
- Delete all `contract_user_meditations` rows for that `meditation_id`
- Delete the ElevenLabs MP3 files generated for that meditation (`eleven_labs_audio_files/{YYYYMMDD}/el_{meditation_id}_*.mp3`)
- Delete the final concatenated MP3 file (`meditation_soundfiles/{YYYYMMDD}/meditation_{meditation_id}.mp3`)
- **Do NOT delete any files in `prerecorded_audio/`** — those are shared across meditations

This same cascade also fires when deleting via `DELETE /meditations/:id` (owner delete) or `DELETE /admin/meditations/:id` (admin delete). The admin Jobs Queue "delete" is effectively a meditation-level delete triggered from a per-job row.

---

## 9. `contract_user_meditations` Endpoints

Based on the existing frontend favorite toggle endpoint (`POST /meditations/favorite/:meditationId/:trueOrFalse`), the following behavior is implied:

- **Favorite (true):** `INSERT` a row into `contract_user_meditations` for the authenticated user + meditation
- **De-favorite (false):** `DELETE` the row from `contract_user_meditations` for the authenticated user + meditation
- **On `GET /meditations/all`:** The API should JOIN with `contract_user_meditations` to compute `isFavorite` per meditation for the authenticated user

No new endpoints are needed — the existing `POST /meditations/favorite/:meditationId/:trueOrFalse` maps cleanly to insert/delete in this table. The API logic handles which operation to perform based on the URL parameter.

---

## 10. Google OAuth — Implementation Notes

Since Google OAuth is included in the initial build, here is what's required:

**Backend (`api`):**

- Install `google-auth-library` npm package
- `POST /users/google-auth` receives a Google `idToken` from the frontend
- Verify the token using `OAuth2Client.verifyIdToken()`
- Extract email from the verified payload
- **Case 1 — New user:** Create a `users` row with `auth_provider = 'google'`, `password = NULL`, `is_email_verified = true` (Google accounts are pre-verified)
- **Case 2 — Existing local user (same email):** Update `auth_provider` to `'both'`, set `is_email_verified = true`
- **Case 3 — Existing Google user:** Just return a new JWT

**Frontend:**

- `@react-oauth/google` is already installed in `web/package.json` ✅
- `GoogleAuthProvider.tsx` already exists ✅
- No additional packages needed

**No new questions — this is well-defined.**

---

## 11. Email Service — Implementation Notes

Gmail SMTP via `nodemailer`. Already outlined in `api/.env.example`. Two email flows:

1. **Email verification** — sent on register; link contains a signed token → `GET /users/verify?token=`
2. **Password reset** — sent on forgot-password; link contains a signed token → `POST /users/reset-password`

Both tokens should be short-lived JWTs (or random signed strings stored temporarily). No new questions.

---

## 12. Updated API Endpoint Map (Final)

New endpoints added vs V01:

| Method | Path               | Auth Required | Notes                          |
| ------ | ------------------ | ------------- | ------------------------------ |
| GET    | `/meditations/:id` | Optional      | Single meditation detail (new) |

**Note on `listen_count`:** Per Q-G Option 1, the existing `GET /meditations/:id/stream` endpoint auto-increments `listen_count` on each request. No new endpoint needed; no frontend change needed.

All other endpoints from V01 remain unchanged.

---

## 13. Open Questions — Resolved

| #   | Question                                                                             | Resolution                                                     |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| F   | Should `worker-node` also check/create directories on startup?                       | ✅ Yes — worker checks/creates the directories it uses         |
| G   | listen_count: auto-increment on stream, or dedicated `POST /meditations/:id/listen`? | ✅ Option 1 — auto-increment on `GET /meditations/:id/stream`  |
| H   | Jobs Queue delete: single row, all rows for meditation, or remove delete button?     | ✅ Full cascade delete for the entire `meditation_id` (see §8) |

**Audio folder interpretation (Section 4) is confirmed:** `prerecorded_audio/` is flat, no date subdirectory. The other two use `{YYYYMMDD}/` date subdirectories.

**Cascade delete semantics (applies to all meditation deletions — owner, admin, and Jobs Queue row):**

1. Delete `jobs_queue` rows for the `meditation_id`
2. Delete `contract_user_meditations` rows for the `meditation_id`
3. Delete the `meditations` row
4. Delete ElevenLabs output files for the meditation: `eleven_labs_audio_files/*/el_{meditation_id}_*.mp3`
5. Delete the final MP3: `meditation_soundfiles/*/meditation_{meditation_id}.mp3`
6. **Never** delete files in `prerecorded_audio/` (shared)

The API implements this as a single service function (e.g., `deleteMeditationCascade(meditationId)`) used by all three entry points.

---

## 14. Pre-Task-List Checklist

All open questions are resolved. The TODO task lists are split into three files per `TODO_LIST_GUIDANCE.md`:

- `docs/requirements/20260421_TODO_DB_MODELS.md`
- `docs/requirements/20260421_TODO_API.md`
- `docs/requirements/20260421_TODO_WORKER_NODE.md`

Frontend-side updates (Jobs Queue table rename, `QueueRecord` type update, TanStack Table) will be folded into the `API_TODO` since they are tightly coupled to the `/admin/queuer` response shape — or can be split into a `WEB_TODO` file if you prefer a separate track.
