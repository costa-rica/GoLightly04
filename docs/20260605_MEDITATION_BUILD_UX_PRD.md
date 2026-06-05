# PRD: Meditation Build UX — Build Animation, Sound-File Duration, Fluid Layout

**Date:** 2026-06-05
**Status:** Draft for planning
**Author:** founder + Claude
**Related docs:** `docs/20260428_CPO_ONBOARDING_GO_LIGHTLY.md`, `docs/PLAN_AND_VET.md`

## 1. Context & motivation

Go Lightly lets users compose a meditation by sequencing rows of three types — **Text** (TTS narration), **Pause** (silence), and **Sound File** (ambient audio) — in the create-meditation form. Today the form is a flat spreadsheet-style grid. Users get no visual sense that their meditation is "growing" as they add rows, and no sense of how long it will run.

This PRD covers three related improvements to the creation experience:

1. **Build animation** — a live, color-coded stack of blocks beside the form that grows as rows are added and shows a per-block time estimate, so users understand the shape and length of what they're building.
2. **Sound-file duration** — the data and admin tooling needed to know how long each sound file is, which the build animation needs for its time estimates.
3. **Fluid section widths** — let page sections expand on wide screens instead of capping at a fixed width, partly to make room for the build animation.

These ship together because (1) depends on (2) for accurate estimates, and (1) needs the horizontal room that (3) provides.

## 2. Goals / non-goals

**Goals**
- Give users an at-a-glance, growing visual of their meditation with per-block and total time estimates, in **form mode only**.
- Capture and maintain a duration (in seconds) for every sound file.
- Make page sections use wide-screen real estate better without breaking small screens.

**Non-goals**
- No changes to script (text) mode.
- No change to how meditations are actually generated (audio pipeline, ElevenLabs, concatenation) — estimates are advisory only and do not feed generation.
- No reordering/drag-drop redesign of rows beyond what exists.
- Not building a precise TTS-duration predictor; the time estimate is intentionally a rough guide.

## 3. Stack reference (for the implementing engineer)

- **Web:** Next.js 16 / React 19, Redux Toolkit, **Tailwind CSS** (dark mode via `.dark` class on `<html>` + CSS variables in `web/src/styles/globals.css`). Fixed color palettes (`primary`, `secondary`, `accent`, `calm`) live in `web/tailwind.config.js` and do **not** change with theme.
- **Form:** `web/src/components/forms/CreateMeditationForm.tsx` (form mode), `ScriptMeditationEditor.tsx` (script mode), wrapped by `CreateMeditationModeSwitcher.tsx`. Row type is `"text" | "pause" | "sound"`; fields `text`, `speed`, `pauseDuration`, `soundFile`.
- **API:** Express, `api/src/routes/sounds.ts` (upload via multer → saves to disk via `getPrerecordedAudioPath`, list, delete).
- **DB:** Sequelize/Postgres. `db-models/src/models/SoundFile.ts` → table `sound_files` (`id`, `name`, `description`, `filename`, timestamps; case-insensitive unique index on name). Raw-SQL migrations in `db-models/migrations/` (pattern: `20260518_add_duration_seconds.sql`).
- **Audio metadata:** ffprobe already wired up in **worker-node** only — `worker-node/src/services/concatenator.ts` `probeDurationSeconds()` (uses `@ffprobe-installer/ffprobe` + `fluent-ffmpeg`). The **api** does not currently have ffprobe.
- **Admin:** `web/src/app/admin/page.tsx` + `web/src/components/tables/TableAdminSoundsFiles.tsx` (shows ID; click currently only deletes). Existing modal patterns: `ModalUploadSoundFile`, `ModalConfirmDelete`, `ModalInformationOk`.
- **Layout:** main sections capped at `max-w-6xl` (1152px) centered with `mx-auto` in `web/src/app/page.tsx`, `web/src/app/admin/page.tsx`, `web/src/components/Navigation.tsx`, `web/src/components/AppShell.tsx`. Profile uses `max-w-3xl` and is **out of scope** for widening. Tailwind default breakpoints (`sm` 640 / `md` 768 / `lg` 1024 / `xl` 1280 / `2xl` 1536); no custom breakpoints today.

---

## 4. Feature 1 — Build animation

### 4.1 Placement & visibility
- Rendered inside the existing **"Meditation Rows"** card in `CreateMeditationForm.tsx`, **aligned to the right** of the rows grid (e.g. flex row: rows grid on the left grows to fill, animation column fixed-width ~`14rem` on the right).
- **Form mode only.** Never shown in script mode (different component, so naturally scoped).
- **Hidden on small screens.** Below the `lg` breakpoint (1024px) the animation column is hidden (`hidden lg:flex`) and the rows grid takes full width. Final breakpoint to be confirmed during implementation if `lg` feels cramped.

### 4.2 Blocks
- One block per meditation row, stacked vertically **in the same order as the rows**, updating live as rows are added, removed, reordered, or edited.
- **Fixed-height** blocks (consistent size regardless of duration).
- Each block shows: the **type label** ("Text" / "Pause" / "Sound File") and its **time estimate** formatted `m:ss` (e.g. `0:12`).
- **Entrance animation:** new blocks **grow/pop in** — scale from small to full size over ~200–300ms via CSS transition. Should respect `prefers-reduced-motion` (no scaling for users who opt out).

### 4.3 Colors (theme-independent)
- Each type has a **distinct, fixed color used in both light and dark themes** (does not change with theme). Add a dedicated fixed palette to `web/tailwind.config.js` (e.g. a `buildBlock` color group) so it is not tied to the theme CSS variables.
- Proposed palette (consistent family, distinct hues, white text legible on each in both themes — final hex to confirm in plan):
  - **Text** → indigo `#4F46E5`
  - **Pause** → amber `#D97706`
  - **Sound File** → teal `#0D9488`

### 4.4 Time estimates
- **Text row:** `estimatedSeconds = characterCount / CHARS_PER_SECOND`, where `CHARS_PER_SECOND` is a single tunable constant (proposed default **12**, representing calm narration pace). The row's `speed` multiplier is **ignored** for this estimate (kept simple; estimate is advisory).
- **Pause row:** `estimatedSeconds = pauseDuration` (the value in the Pause column, in seconds).
- **Sound File row:** `estimatedSeconds = sound_file.duration_seconds`. If the file's duration is **null/unknown**, the block shows **`?`** instead of a time.
- **Total:** a running **total estimated length** is shown at the bottom of the stack (formatted `m:ss`). If any sound row has unknown duration, the total is marked as approximate with an asterisk (e.g. `~3:40*`) and a short legend ("* one or more sounds have no known duration").

### 4.5 Data dependency
- The form already loads available sound files (`getSoundFiles()` → `{name, filename}`). The list response and the shared `SoundFile` type must be extended to include `duration_seconds` so the form can compute sound estimates client-side.

---

## 5. Feature 2 — Sound-file duration

### 5.1 Data model
- Add nullable column **`duration_seconds INTEGER NULL`** to `sound_files`.
  - New raw-SQL migration in `db-models/migrations/` following the existing pattern (`ALTER TABLE sound_files ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NULL;`).
  - Add the field to the `SoundFile` Sequelize model so it syncs and is queryable.
- Nullable by design: legacy files and any file whose duration can't be read stay `null` until set.

### 5.2 Auto-extraction on upload
- On upload (`api/src/routes/sounds.ts`), after the file is written to disk, **probe its duration via ffprobe** and store `duration_seconds` (rounded to whole seconds) on the new record.
- The api workspace does **not** currently have ffprobe. The plan must add it: bring `@ffprobe-installer/ffprobe` + `fluent-ffmpeg` into the api and reuse the logic pattern from `worker-node`'s `probeDurationSeconds()` (consider a small shared helper). If probing fails, store `null` and do not fail the upload.

### 5.3 Backfill existing files
- Provide a one-off backfill script (mirroring `scripts/backfill-meditation-durations.ts`) that iterates existing `sound_files`, probes each file on disk, and sets `duration_seconds` where it can be read.

### 5.4 Admin edit modal
- In the admin sound-files table (`TableAdminSoundsFiles.tsx`), clicking the **sound file ID** opens an **edit modal**.
- The modal lets an admin edit **name, description, and duration (seconds)**. Duration accepts whole seconds and may be cleared back to null.
- Requires a new authenticated **admin update endpoint** for a sound file (e.g. `PATCH /sounds/:id`) covering those fields.
- Renames must honor the existing **case-insensitive name-uniqueness** constraint — surface the duplicate-name (409) case in the modal, consistent with the upload modal's handling.
- Build the modal from existing modal patterns; on save, refresh the table.

---

## 6. Feature 3 — Fluid section widths

- **Problem:** main sections cap at `max-w-6xl` (1152px) and stop growing on wide screens, wasting space and leaving no room for the build animation.
- **Change:** widen the shared container max-width by ~20% (1152px → **~1382px**). Recommended approach: add a named max-width to `web/tailwind.config.js` (e.g. `maxWidth.app = '1382px'`) and apply it where `max-w-6xl` is used today.
- **Apply to:** all main pages/containers (home/create `page.tsx`, `admin/page.tsx`, `Navigation.tsx`, `AppShell.tsx` footer). **Keep the existing `w-full` + responsive horizontal padding** (`px-4 md:px-8`) so the container never exceeds the viewport and always has gutter on medium/large screens.
- **Out of scope:** the profile page (`max-w-3xl`) stays as-is.

## 7. Edge cases & details
- Editing a Text row's text live-updates its block estimate and the total.
- Reordering / deleting rows reorders / removes blocks accordingly.
- An empty Text row estimates `0:00`.
- Unknown sound duration → block shows `?`, total shows `*`.
- `prefers-reduced-motion` disables the pop-in scaling.
- Upload still succeeds if ffprobe can't read a file (duration stays null).

## 8. Open questions for the owner
1. **Narration rate:** is `CHARS_PER_SECOND = 12` the right default, or do you want a different pace? (Easy to tune later.)
2. **Hide breakpoint:** hide the animation below `lg` (1024px) — acceptable, or prefer `xl` (1280px)?
3. **Palette:** OK to go with indigo / amber / teal, or do you have specific brand colors in mind?
4. **Block content:** is "Type · m:ss" enough per block, or do you want a small icon per type too?

## 9. Out of scope (explicitly)
- Script-mode parity for the animation.
- Feeding estimates into actual generation or storing them.
- Drag-and-drop row reordering changes.
- Widening the profile page.
