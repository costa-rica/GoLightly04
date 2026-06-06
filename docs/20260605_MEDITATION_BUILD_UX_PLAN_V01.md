---
created_at: 2026-06-05
updated_at: 2026-06-05
created_by: claude planner (fallback by hermes due Claude Code auth failure)
modified_by: claude planner (fallback by hermes due Claude Code auth failure)
---

# Meditation Build UX Plan V01

## Source requirements

This plan implements `docs/20260605_MEDITATION_BUILD_UX_PRD.md` on branch `dev_08_build_animation`. The scope is limited to form-mode meditation creation, sound-file duration metadata, admin sound-file editing, and wider app containers. Script mode, the generation pipeline semantics, drag/drop redesign, and the profile page remain out of scope.

## Existing architecture to preserve

- **Monorepo/workspaces:** root package with `shared-types`, `db-models`, `api`, `worker-node`, and `web` workspaces.
- **Shared contracts:** web imports sound API types from `@golightly/shared-types`; shared declarations must be rebuilt before downstream typechecks when contracts change.
- **Sound API:** `api/src/routes/sounds.ts` owns list/upload/delete. Upload stores the file under `getPrerecordedAudioPath(filename)` and creates a `SoundFile` row. Existing duplicate-name behavior uses a case-insensitive comparison and returns `DUPLICATE_SOUND_NAME`/409.
- **DB model:** `db-models/src/models/SoundFile.ts` maps the `sound_files` table. Existing migrations are raw SQL in `db-models/migrations/`.
- **Audio probing precedent:** `worker-node/src/services/concatenator.ts` and `scripts/backfill-meditation-durations.ts` use `@ffprobe-installer/ffprobe` plus `fluent-ffmpeg` and resolve `null` instead of failing when probing cannot produce a positive finite duration.
- **Form mode UI:** `web/src/components/forms/CreateMeditationForm.tsx` owns the spreadsheet-style rows and is naturally separate from `ScriptMeditationEditor.tsx`, so the build animation can stay form-only.
- **Admin UI:** `web/src/app/admin/page.tsx` owns sound-file state, fetching, deletion, and upload modal wiring. `TableAdminSoundsFiles.tsx` owns sound-file table columns. Existing modal patterns live under `web/src/components/modals/`.
- **Layout:** `max-w-6xl` is used by home/create, admin, navigation, and footer containers; profile-page width is not part of this change.

## Implementation approach

### 1. Add sound-file duration to data contracts and persistence

Add a nullable `duration_seconds` column to `sound_files` using a new raw SQL migration, for example `db-models/migrations/20260605_add_sound_file_duration_seconds.sql`, with `ALTER TABLE sound_files ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NULL;`. The migration should be idempotent like existing migrations.

Update `db-models/src/models/SoundFile.ts` to declare and map `durationSeconds: number | null` with `field: "duration_seconds"`, `allowNull: true`, and `DataTypes.INTEGER`. Preserve `underscored: true` and the existing normalized-name uniqueness comments.

Update `shared-types/src/sounds.ts` so `SoundFile` includes `duration_seconds?: number | null` (wire-format snake case, matching the current API response style for sound fields and the PRD). Add request/response types for admin update if desired, such as `UpdateSoundFileRequest` and `UpdateSoundFileResponse`, so the web API helper and API route stay typed from the same source.

### 2. Centralize API-side duration probing without changing generation semantics

The API workspace currently lacks local ffprobe/fluent-ffmpeg dependencies, even though root and worker already have them. Add `@ffprobe-installer/ffprobe`, `fluent-ffmpeg`, and `@types/fluent-ffmpeg` to the API workspace package as needed, using versions already present elsewhere in the repo to avoid lockfile churn beyond expected dependency additions.

Create a small API-local helper, e.g. `api/src/lib/audioMetadata.ts`, that sets `ffmpeg.setFfprobePath(ffprobeInstaller.path)` and exports `probeDurationSeconds(filePath: string): Promise<number | null>`. Match the existing precedent: parse `data.format.duration`, reject non-finite or non-positive values, round to whole seconds, and resolve `null` on errors. Do not throw probe failures into upload failures.

Avoid moving worker code into a shared runtime package unless necessary; shared-types is currently type-only/domain logic, and adding ffprobe there would couple browser/shared code to Node/audio dependencies. Keeping the API helper local is lower risk. A later refactor can consolidate probing if duplication becomes a problem.

### 3. Extend sound routes: list, upload, update

In `api/src/routes/sounds.ts`:

- Include `duration_seconds: sound.durationSeconds ?? null` in `GET /sounds/sound_files` responses.
- On upload, after writing the buffer to disk and before/while creating the `SoundFile` row, call `probeDurationSeconds(filePath)` and store the result as `durationSeconds`. If probing returns `null`, create the record with `durationSeconds: null` and still return success.
- Include `duration_seconds` in the upload response.
- Add an authenticated admin update endpoint. To match current route style, prefer `PATCH /sounds/sound_file/:id` rather than introducing a competing plural route. It should accept name, description, and duration fields; trim names/descriptions; allow duration to be cleared to `null`; and validate duration as a non-negative whole number if provided.
- Preserve the existing case-insensitive uniqueness behavior by checking other sound rows with the normalized name and returning 409 `DUPLICATE_SOUND_NAME` when a different row already owns the requested name. Also rely on the DB unique index as the final guard.
- Return 404 for unknown IDs and a typed response containing the updated sound file.

Consider extracting a small serializer function for sound responses so list/upload/update all return the same shape.

### 4. Add sound-file duration backfill

Add a script mirroring `scripts/backfill-meditation-durations.ts`, likely `scripts/backfill-sound-file-durations.ts`, with dry-run-by-default behavior and `--apply`, `--force`, and `--limit` options. It should initialize Sequelize with app role, iterate `SoundFile` rows ordered by ID, skip rows with existing duration unless `--force`, resolve file paths via the same prerecorded audio root/path helper available to scripts, probe each file, and update `durationSeconds` only when probing succeeds.

Update the root `package.json` scripts with an explicit command such as `backfill:sound-durations`. Keep the existing meditation-duration script unchanged.

### 5. Add admin sound-file editing UI

Extend `web/src/lib/api/sounds.ts` with `updateSoundFile(id, payload)` calling the new `PATCH /sounds/sound_file/:id` endpoint.

Update `TableAdminSoundsFiles.tsx` so the ID cell is a button/link that calls a new `onEdit(soundFile)` prop. Add a `Duration` column that renders `duration_seconds` as seconds or an em dash/Unknown. Preserve the delete button column.

Create `web/src/components/modals/ModalEditSoundFile.tsx` following existing modal patterns (`ModalUploadSoundFile`, `ModalConfirmDelete`, `ModalInformationOk`):

- Opens with current name, description, and duration.
- Allows name and description edits.
- Allows whole-second duration edits and clearing duration back to `null`.
- Shows duplicate-name/409 errors consistently with upload modal.
- Disables controls while submitting and closes on successful save.

Wire this modal in `web/src/app/admin/page.tsx` with `soundEditTarget` state. On save, refresh sound files using existing `fetchSoundFiles()` and show the existing toast mechanism if appropriate. Avoid broad admin-page restructuring; this page is already large, so keep changes localized.

### 6. Add form-mode build animation

In `CreateMeditationForm.tsx`, change the local `soundFiles` state to use the shared `SoundFile` type, keeping `duration_seconds` from `getSoundFiles()` instead of mapping it down to name/filename only. Script mode can continue to load sound files as it does today, but it does not render the animation.

Add pure helper functions near the form component or in a small component file if the JSX becomes too large:

- `CHARS_PER_SECOND = 12` as a single constant.
- `formatDuration(seconds: number): string` returning `m:ss`.
- `estimateRow(row, soundMap)` returning `{ seconds: number | null, unknown: boolean }`.
- Text estimates use `row.text.length / CHARS_PER_SECOND`, rounded to whole seconds for display. Speed is ignored.
- Pause estimates parse `row.pauseDuration` to a whole number or treat invalid/empty as `0` for advisory display while validation still handles submission errors.
- Sound estimates find the selected sound by filename/name consistently with existing row storage (`row.soundFile` stores filename) and return `null` when the sound or its `duration_seconds` is unknown.

Add a build animation column inside the existing “Meditation Rows” card, beside the row grid. The likely structure is a responsive wrapper like `lg:flex lg:items-start lg:gap-6`, with the existing grid in a `min-w-0 flex-1 overflow-x-auto` container and a fixed-width `hidden w-56 shrink-0 lg:flex` stack. Preserve the current row grid on small screens.

Each row block should render in row order, with fixed height, type label, and time display (`?` for unknown). Use fixed Tailwind colors from a new `buildBlock` palette (see layout/color section). Add a CSS/Tailwind transition for new blocks using scale/opacity over 200–300ms and include `motion-reduce:transform-none motion-reduce:transition-none` or equivalent classes so users with reduced motion are not animated.

Render a total at the bottom. Sum only known durations; if any selected sound has unknown duration, show the approximate marker/legend required by the PRD. Do not persist estimates or feed them into the generation request.

### 7. Add fixed colors and wider containers

Extend `web/tailwind.config.js` with:

- `colors.buildBlock.text`, `colors.buildBlock.pause`, and `colors.buildBlock.sound` using the PRD palette or close accessible values.
- `maxWidth.app = "1382px"` under `theme.extend.maxWidth`.

Replace `max-w-6xl` with `max-w-app` in:

- `web/src/app/page.tsx`
- `web/src/app/admin/page.tsx`
- `web/src/components/Navigation.tsx`
- `web/src/components/AppShell.tsx` footer container

Do not widen the profile page. Keep existing `w-full`, `mx-auto`, and responsive horizontal padding patterns.

## Validation strategy

Because this change touches shared contracts, DB models, API, scripts, and web, validation should be sequenced so generated workspace output is fresh before downstream checks:

1. `npm run build:shared`
2. `npm run typecheck:shared`
3. `npm run typecheck:scripts`
4. `npm run typecheck -w api`
5. `npm test -w api -- --runInBand`
6. `npm run typecheck -w web`
7. `npm run build -w web`
8. `npm run typecheck -w worker-node`
9. `npm test -w worker-node -- --runInBand`

If time permits, add targeted API route tests for sound update/list/upload serialization and a small web/unit test only if the repo already has a compatible test setup for React components. If no frontend test harness exists, rely on typecheck/build plus manual browser QA notes for the form-mode animation and admin edit modal.

## Risks and constraints

- **Wire-format naming:** Existing sound API responses use `filename` and `description`; the new duration field should consistently use `duration_seconds` per PRD. The Sequelize model should remain camelCase internally.
- **Duplicate-name races:** App-level checks should mirror existing behavior, but the DB unique index remains the final source of truth; route error handling should surface duplicate names cleanly.
- **ffprobe availability/permissions:** The API service will now invoke ffprobe on upload. Upload must still succeed with `null` duration if probing fails. Be aware of the known server permission issue where ffprobe binaries may lose group execute permission after installs.
- **Script path helpers:** The backfill script must use the same prerecorded-audio path conventions as runtime services; avoid hard-coded production paths.
- **Large form component:** `CreateMeditationForm.tsx` is already large. Prefer small helper functions or a focused build-animation child component to avoid making the form harder to maintain.
- **Responsive width:** The animation is hidden below `lg`; ensure the existing row grid remains usable and horizontally safe on smaller screens.
- **Advisory estimates:** Estimates must never block generation or alter generated meditation contents.

## Assumptions / open questions

- Use `CHARS_PER_SECOND = 12` unless Nick chooses a different narration pace later.
- Hide the animation below `lg` as specified unless implementation QA shows `xl` is necessary.
- Use indigo/amber/teal from the PRD for fixed build-block colors.
- “Type + time” is enough block content; no icon work is planned unless Nick asks for it.
