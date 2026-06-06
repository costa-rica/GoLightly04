---
created_at: 2026-06-05
updated_at: 2026-06-05
created_by: claude planner (fallback by hermes due Claude Code auth failure)
modified_by: claude planner (fallback by hermes due Claude Code auth failure)
---

# Meditation Build UX TODO V02

Accepted plan: `docs/20260605_MEDITATION_BUILD_UX_PLAN_V01.md`
Requirements: `docs/20260605_MEDITATION_BUILD_UX_PRD.md`
Addresses: `docs/20260605_MEDITATION_BUILD_UX_TODO_V01_ASSESSMENT_CODEX.md`

## Implementation rules

- Do not change script-mode behavior or UI except where shared sound types require compile fixes.
- Do not change meditation generation semantics; duration estimates are advisory only.
- Keep DB/API internal fields camelCase (`durationSeconds`) and API wire fields snake_case (`duration_seconds`).
- Preserve existing case-insensitive sound-name uniqueness behavior.
- Commit after each completed phase once that phase’s validation passes. Use a lowercase commit title under ~50 characters and include concise body bullets for broad changes.
- If a validation command fails, fix the failure while preserving intended functionality, rerun the affected validation, then continue.

## Phase 1 — Sound-file duration data model and shared contract

- [ ] Add a new raw SQL migration `db-models/migrations/20260605_add_sound_file_duration_seconds.sql` with `ALTER TABLE sound_files ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NULL;`.
- [ ] Update `db-models/src/models/SoundFile.ts`:
  - [ ] Declare `durationSeconds: CreationOptional<number | null>`.
  - [ ] Add a Sequelize attribute `durationSeconds` with `DataTypes.INTEGER`, `allowNull: true`, and `field: "duration_seconds"`.
  - [ ] Preserve existing table/model options and normalized-name uniqueness comments.
- [ ] Update `shared-types/src/sounds.ts`:
  - [ ] Add `duration_seconds?: number | null` to `SoundFile`.
  - [ ] Add typed update request/response contracts if useful for the web/API update route.
- [ ] Run validation for this phase:
  - [ ] `npm run build:shared`
  - [ ] `npm run typecheck:shared`
- [ ] Review `git diff --stat` and commit only Phase 1 changes.

## Phase 2 — API duration probing, sound route serialization, and update endpoint

- [ ] Add API workspace dependencies needed for ffprobe duration probing, matching repo versions where possible:
  - [ ] `@ffprobe-installer/ffprobe`
  - [ ] `fluent-ffmpeg`
  - [ ] `@types/fluent-ffmpeg` as a dev dependency if TypeScript needs it.
- [ ] Create an API-local helper such as `api/src/lib/audioMetadata.ts`:
  - [ ] Set `ffmpeg.setFfprobePath(ffprobeInstaller.path)`.
  - [ ] Export `probeDurationSeconds(filePath: string): Promise<number | null>`.
  - [ ] Return rounded whole seconds only for positive finite durations.
  - [ ] Resolve `null` on ffprobe errors or invalid duration data.
- [ ] Update `api/src/routes/sounds.ts`:
  - [ ] Add a serializer helper so list/upload/update return a consistent sound-file shape including `duration_seconds`.
  - [ ] Include `duration_seconds` in `GET /sounds/sound_files`.
  - [ ] Probe uploaded files after writing them and store `durationSeconds` on the created `SoundFile`; upload must still succeed with `null` if probing fails.
  - [ ] Include `duration_seconds` in upload response.
  - [ ] Add authenticated `PATCH /sounds/sound_file/:id` for admin edits.
  - [ ] Validate update payload: name is required/non-empty when provided, description can be cleared to `null`, duration can be a whole non-negative number or cleared to `null`.
  - [ ] Preserve duplicate-name 409 behavior by comparing normalized names against all other sound rows.
  - [ ] Return 404 for unknown sound IDs.
- [ ] Add/update API tests under `api/tests/sounds/` for:
  - [ ] List response includes `duration_seconds`.
  - [ ] Upload response includes stored `duration_seconds` and still succeeds when probing returns `null` if mocking is practical.
  - [ ] Patch updates name/description/duration.
  - [ ] Patch clears description and duration.
  - [ ] Patch duplicate name returns 409.
  - [ ] Patch unknown ID returns 404.
- [ ] Run validation for this phase:
  - [ ] `npm run build:shared`
  - [ ] `npm run typecheck -w api`
  - [ ] `npm test -w api -- --runInBand`
- [ ] Review `git diff --stat` and commit only Phase 2 changes.

## Phase 3 — Sound-file duration backfill script

- [ ] Add `scripts/backfill-sound-file-durations.ts` mirroring the existing meditation-duration backfill script:
  - [ ] Load dotenv and initialize Sequelize via `createSequelize({ role: "app" })` and `initializeModels(sequelize)`.
  - [ ] Iterate `SoundFile` rows ordered by ID.
  - [ ] Support dry-run by default plus `--apply`, `--force`, and `--limit`.
  - [ ] Skip rows with existing `durationSeconds` unless `--force` is provided.
  - [ ] Resolve file paths in a script-safe way: read `PATH_PROJECT_RESOURCES` from `process.env`, require it to be set, and build paths with `path.join(PATH_PROJECT_RESOURCES, "prerecorded_audio", soundFile.filename)`.
  - [ ] Do not import service-local project path helpers from `api/src/lib/projectPaths.ts` or `worker-node/src/lib/projectPaths.ts` unless a shared script-safe helper is created first.
  - [ ] Do not hard-code production or server-specific paths.
  - [ ] Probe durations with ffprobe and update only when probing succeeds.
  - [ ] Print a summary with scanned/updated/skipped counts.
  - [ ] Always close Sequelize in a `finally` block.
- [ ] Add a root script, e.g. `backfill:sound-durations`, to `package.json` without changing the existing meditation-duration script.
- [ ] Run validation for this phase:
  - [ ] `npm run build:shared`
  - [ ] `npm run typecheck:scripts`
- [ ] Review `git diff --stat` and commit only Phase 3 changes.

## Phase 4 — Web API helper and admin sound-file editing UI

- [ ] Update `web/src/lib/api/sounds.ts`:
  - [ ] Export an `updateSoundFile(id, payload)` helper for `PATCH /sounds/sound_file/:id`.
  - [ ] Use shared request/response types if added in Phase 1.
- [ ] Update `web/src/components/tables/TableAdminSoundsFiles.tsx`:
  - [ ] Add an `onEdit(soundFile)` prop.
  - [ ] Render the ID cell as a button/link that opens edit mode.
  - [ ] Add a Duration column showing seconds or an Unknown/empty-state value when `duration_seconds` is `null`/`undefined`.
  - [ ] Preserve the existing Delete action.
- [ ] Create `web/src/components/modals/ModalEditSoundFile.tsx` following existing modal patterns:
  - [ ] Initialize form state from the selected sound file when opened.
  - [ ] Edit name, description, and duration seconds.
  - [ ] Allow duration to be cleared back to `null`.
  - [ ] Validate duration as whole non-negative seconds before submit.
  - [ ] Show duplicate-name/409 errors consistently with `ModalUploadSoundFile`.
  - [ ] Disable controls while submitting and support Close/Escape/backdrop behavior consistent with existing modals.
- [ ] Wire the modal in `web/src/app/admin/page.tsx`:
  - [ ] Add `soundEditTarget` state.
  - [ ] Pass `onEdit` to `TableAdminSoundsFiles`.
  - [ ] Refresh sound files after successful save using `fetchSoundFiles()`.
  - [ ] Use the existing toast mechanism for success/failure if appropriate.
  - [ ] Keep changes localized; do not broadly refactor the admin page.
- [ ] Run validation for this phase:
  - [ ] `npm run build:shared`
  - [ ] `npm run typecheck -w web`
- [ ] Review `git diff --stat` and commit only Phase 4 changes.

## Phase 5 — Build-block palette and form-mode build animation

- [ ] Update `web/tailwind.config.js` before adding animation JSX:
  - [ ] Add `colors.buildBlock.text`, `colors.buildBlock.pause`, and `colors.buildBlock.sound` using the PRD’s fixed indigo/amber/teal palette or close accessible values.
  - [ ] Do not add the container `maxWidth.app` task here; leave layout width changes for Phase 6.
- [ ] Update `CreateMeditationForm.tsx` to import/use the shared `SoundFile` type and preserve `duration_seconds` from `getSoundFiles()` instead of mapping sound files down to `{ name, filename }`.
- [ ] Add estimate helpers either near the form or in a focused child component/module:
  - [ ] `CHARS_PER_SECOND = 12`.
  - [ ] `formatDuration(seconds)` returning `m:ss`.
  - [ ] Row estimate logic for text, pause, and sound rows.
  - [ ] Text estimate uses character count and ignores speed.
  - [ ] Pause estimate uses `pauseDuration`, treating empty/invalid values as `0` for advisory display only.
  - [ ] Sound estimate looks up the selected file consistently with current `row.soundFile` storage and returns unknown when duration is missing.
- [ ] Add a build-animation UI inside the existing “Meditation Rows” card:
  - [ ] Keep the existing rows grid order and behavior.
  - [ ] Place the animation column to the right on large screens.
  - [ ] Hide the animation below `lg` so the rows grid remains full width on small screens.
  - [ ] Use a fixed-width stack of fixed-height blocks, one per row, in row order.
  - [ ] Use the fixed `buildBlock` Tailwind colors for Text, Pause, and Sound File blocks.
  - [ ] Show type label and `m:ss` per block, or `?` for unknown sound durations.
  - [ ] Add 200–300ms grow/pop entrance styling and respect `prefers-reduced-motion` using Tailwind motion-reduce classes or equivalent CSS.
  - [ ] Show a running total at the bottom; mark approximate/asterisk when any sound duration is unknown and include the required legend.
- [ ] Confirm row add/delete/reorder/edit state updates drive the block stack and total live without changing the generation payload.
- [ ] Run validation for this phase:
  - [ ] `npm run build:shared`
  - [ ] `npm run typecheck -w web`
  - [ ] `npm run build -w web`
- [ ] Review `git diff --stat` and commit only Phase 5 changes.

## Phase 6 — Wider app containers

- [ ] Update `web/tailwind.config.js`:
  - [ ] Add `maxWidth.app = "1382px"` under `theme.extend.maxWidth`.
  - [ ] Preserve the `buildBlock` colors added in Phase 5.
- [ ] Replace `max-w-6xl` with `max-w-app` only in the in-scope app containers:
  - [ ] `web/src/app/page.tsx`
  - [ ] `web/src/app/admin/page.tsx`
  - [ ] `web/src/components/Navigation.tsx`
  - [ ] `web/src/components/AppShell.tsx` footer container
- [ ] Confirm `web/src/app/profile/page.tsx` stays at `max-w-3xl`.
- [ ] Keep existing `w-full`, `mx-auto`, and responsive padding/gutter classes.
- [ ] Run validation for this phase:
  - [ ] `npm run typecheck -w web`
  - [ ] `npm run build -w web`
- [ ] Review `git diff --stat` and commit only Phase 6 changes.

## Phase 7 — Final integration validation and manual QA

- [ ] Run full ordered validation:
  - [ ] `npm run build:shared`
  - [ ] `npm run typecheck:shared`
  - [ ] `npm run typecheck:scripts`
  - [ ] `npm run typecheck -w api`
  - [ ] `npm test -w api -- --runInBand`
  - [ ] `npm run typecheck -w web`
  - [ ] `npm run build -w web`
  - [ ] `npm run typecheck -w worker-node`
  - [ ] `npm test -w worker-node -- --runInBand`
- [ ] Perform browser/manual QA in form mode:
  - [ ] Add text, pause, and sound rows and verify blocks appear in the same order.
  - [ ] Edit text and pause values and verify estimates/total update live.
  - [ ] Reorder and delete rows and verify blocks reorder/remove.
  - [ ] Select a sound with known duration and verify its block/total use the duration.
  - [ ] Select a sound with unknown duration and verify `?`, total marker, and legend.
  - [ ] Verify the build animation is hidden below `lg` and visible on wide screens.
  - [ ] Verify script mode does not show the build animation.
- [ ] Perform browser/manual QA in admin:
  - [ ] Open edit modal by clicking a sound-file ID.
  - [ ] Update name, description, and duration.
  - [ ] Clear duration to unknown/null.
  - [ ] Confirm duplicate-name errors are surfaced.
  - [ ] Confirm the table refreshes after save.
- [ ] Verify app layout width on home/create, admin, navigation, and footer; confirm profile remains unchanged.
- [ ] Run `git status --short --branch`, inspect final diff/log, and commit any final integration fixes separately if needed.
