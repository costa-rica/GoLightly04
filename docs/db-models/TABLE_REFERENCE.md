---
created_at: 2026-05-14
updated_at: 2026-06-09
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Table Reference

GoLightly04 uses Sequelize 6 in the `@golightly/db-models` package with PostgreSQL as the database engine.

Most tables define `createdAt` and `updatedAt` model attributes mapped to `created_at` and `updated_at` columns. `ContractUserMeditation` disables `updatedAt` and only stores `created_at`.

## Core Tables

### User

- Table name: `users`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PK, Auto Increment |  |
| `email` | TEXT | NOT NULL, UNIQUE | Login email address. |
| `password` | TEXT | NULL | Nullable for Google-only users. |
| `auth_provider` | ENUM(`local`, `google`, `both`) | NOT NULL, DEFAULT `local` | Authentication provider state. |
| `is_email_verified` | BOOLEAN | NOT NULL, DEFAULT `false` | Email verification flag. |
| `email_verified_at` | DATE | NULL | Verification timestamp. |
| `is_admin` | BOOLEAN | NOT NULL, DEFAULT `false` | Admin permission flag. |
| `show_script_mode_for_creating_meditations` | BOOLEAN | NOT NULL, DEFAULT `false` | Profile preference that enables script-mode meditation creation. |
| `created_at` | DATE | NOT NULL | Sequelize timestamp. |
| `updated_at` | DATE | NOT NULL | Sequelize timestamp. |

- Indexes:
  - Unique index from `email.unique`.
- Relationships:
  - `hasMany Meditation` via `userId`.
  - `hasMany ContractUserMeditation` via `userId`, with cascade delete hooks.

---

### SoundFile

- Table name: `sound_files`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PK, Auto Increment |  |
| `name` | TEXT | NOT NULL | Display name for an uploaded sound. |
| `description` | TEXT | NULL | Optional catalog description. |
| `filename` | TEXT | NOT NULL | Filename under `prerecorded_audio`. |
| `duration_seconds` | INTEGER | NULL | Optional audio duration in seconds. |
| `created_at` | DATE | NOT NULL | Sequelize timestamp. |
| `updated_at` | DATE | NOT NULL | Sequelize timestamp. |

- Relationships:
  - No associations are declared in `db-models/src/models/associations.ts`.

---

### Meditation

- Table name: `meditations`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PK, Auto Increment |  |
| `user_id` | INTEGER | FK, NOT NULL | -> `users.id` |
| `title` | TEXT | NOT NULL | Meditation title. |
| `description` | TEXT | NULL | Optional description. |
| `meditation_array` | JSONB | NOT NULL, DEFAULT `[]` | Original ordered meditation element spec. |
| `filename` | TEXT | NULL | Final generated audio filename. |
| `file_path` | TEXT | NULL | Final generated audio path. |
| `visibility` | ENUM(`public`, `private`) | NOT NULL, DEFAULT `public` | Public/private access flag. |
| `stage` | ENUM(`template`, `staged`, `library`) | NOT NULL, DEFAULT `library` | Lifecycle stage for template, in-progress, or saved library meditations. |
| `source_mode` | VARCHAR(16) | NOT NULL, DEFAULT `spreadsheet` | Source creation mode; app code uses `spreadsheet` or `script`. |
| `script_source` | TEXT | NULL | Original script text for script-created meditations. |
| `status` | ENUM(`pending`, `processing`, `complete`, `failed`) | NOT NULL, DEFAULT `pending` | Audio generation state. |
| `listen_count` | INTEGER | NOT NULL, DEFAULT `0` | Playback count. |
| `duration_seconds` | INTEGER | NULL | Optional final audio duration in seconds. |
| `duration_seconds_talking` | INTEGER | NULL | Total duration in seconds of text-job audio segments, measured from generated audio files by the worker build process. Reset to null when a pending rebuild starts and repopulated when the worker completes. |
| `duration_seconds_pause` | INTEGER | NULL | Total requested pause duration in whole seconds across pause elements. Reset to null when a pending rebuild starts and repopulated when the worker completes. |
| `duration_seconds_sound` | INTEGER | NULL | Total duration in seconds of prerecorded sound-job audio segments. Reset to null when a pending rebuild starts and repopulated when the worker completes. |
| `created_at` | DATE | NOT NULL | Sequelize timestamp. |
| `updated_at` | DATE | NOT NULL | Sequelize timestamp. |

- Relationships:
  - `belongsTo User` via `userId`.
  - `hasMany JobQueue` via `meditationId`, with cascade delete hooks.
  - `hasMany ContractUserMeditation` via `meditationId`, with cascade delete hooks.

---

### JobQueue

- Table name: `jobs_queue`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PK, Auto Increment |  |
| `meditation_id` | INTEGER | FK, NOT NULL | -> `meditations.id` |
| `sequence` | INTEGER | NOT NULL | Element order within the meditation. |
| `type` | ENUM(`text`, `sound`, `pause`) | NOT NULL | Job element type. |
| `input_data` | TEXT | NOT NULL | Serialized job payload. |
| `status` | ENUM(`pending`, `processing`, `complete`, `failed`) | NOT NULL, DEFAULT `pending` | Job processing state. |
| `file_path` | TEXT | NULL | Output or source audio path for the job. |
| `attempt_count` | INTEGER | NOT NULL, DEFAULT `0` | Retry attempt counter. |
| `last_error` | TEXT | NULL | Last processing error. |
| `last_attempted_at` | DATE | NULL | Last processing attempt timestamp. |
| `created_at` | DATE | NOT NULL | Sequelize timestamp. |
| `updated_at` | DATE | NOT NULL | Sequelize timestamp. |

- Relationships:
  - `belongsTo Meditation` via `meditationId`.

---

## Junction Tables

### ContractUserMeditation

- Table name: `contract_user_meditations`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PK, Auto Increment |  |
| `user_id` | INTEGER | FK, NOT NULL | -> `users.id` |
| `meditation_id` | INTEGER | FK, NOT NULL | -> `meditations.id` |
| `created_at` | DATE | NOT NULL | Sequelize timestamp. |

- Indexes:
  - Unique index on `user_id`, `meditation_id`.
- Relationships:
  - `belongsTo User` via `userId`.
  - `belongsTo Meditation` via `meditationId`.

---
