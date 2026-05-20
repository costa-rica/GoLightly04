---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# TODO — Dark Theme Color Change (V02)

Implementation tracker for [20260520_DARK_THEME_COLOR_CHANGE_PLAN_V04.md](20260520_DARK_THEME_COLOR_CHANGE_PLAN_V04.md). One phase = one commit. After each phase: `npm run lint` and `npm run typecheck` in `web/`, then check items off and commit referencing this file + the phase.

## Changes from V01

Supersedes [20260520_TODO_DARK_THEME_COLOR_CHANGE.md](20260520_TODO_DARK_THEME_COLOR_CHANGE.md). One change driven by [20260520_TODO_DARK_THEME_COLOR_CHANGE_ASSESSMENT_CODEX.md](20260520_TODO_DARK_THEME_COLOR_CHANGE_ASSESSMENT_CODEX.md):

- **Phase 0** now installs the token foundation in `rgb(var(--…) / <alpha-value>)` form per plan V04 §3 so opacity modifiers (`bg-raised/90`, etc.) work. The throwaway smoke check has been expanded to include an `/90` modifier so the failure mode the assessment caught (silent non-generation of `bg-raised/90`) is detected at Phase 0 rather than at Phase 4a.
- **Phase 4a** keeps `bg-raised/90 backdrop-blur` on the sticky thead intentionally — the alpha is functional, not decorative, and Phase 0 now guarantees it compiles.

## Phase 0 — Token foundation

- [x] Add the eight color tokens (`canvas`, `raised`, `inset`, `overlay`, `subtle`, `strong`, `ink`, `ink-muted`) to `theme.extend.colors` in [web/tailwind.config.js](web/tailwind.config.js), each set to `'rgb(var(--…) / <alpha-value>)'` per plan V04 §3.
- [x] Add the `:root` and `.dark` CSS-variable blocks to `@layer base` in [web/src/styles/globals.css](web/src/styles/globals.css) as **space-separated R G B triplets** (no commas, no `rgb()` wrapper) per plan V04 §3.
- [x] Confirm the existing `.card` and `.input-field` helpers in [globals.css](web/src/styles/globals.css) are left **unchanged**.
- [x] Run `git grep -nE "(bg|text|border)-(canvas|raised|inset|overlay|subtle|strong|ink|ink-muted)\b" web/src` and confirm zero pre-existing hits (collision check).
- [x] Drop a throwaway `<div className="bg-raised bg-raised/90 text-ink text-ink/80 border-subtle">` into [web/src/app/page.tsx](web/src/app/page.tsx), run `npm run dev` in `web/`, then:
  - [x] confirm `bg-raised` and `border-subtle` render in both themes
  - [x] **devtools-inspect `bg-raised/90`** in dark mode — computed `background-color` should be `rgba(23, 32, 51, 0.9)` (this is the functional check for the V04 wiring; if it's `rgba(0, 0, 0, 0)` or missing, the variable shape or Tailwind config is wrong and must be fixed before continuing)
  - [x] revert the throwaway div
- [x] Replace `bg-calm-50 text-calm-900 dark:bg-calm-950 dark:text-calm-100` on [AppShell.tsx:58](web/src/components/AppShell.tsx:58) with `bg-canvas text-ink`.
- [x] Verify the home page (`/`), navigation, and existing meditation table on `/` still look correct in both themes (the surfaces already styled for dark mode).
- [x] Run `npm run lint` and `npm run typecheck` in `web/`.
- [x] Commit referencing this file + Phase 0.

## Phase 1 — Create Meditation (Script flow)

- [x] Sweep [ScriptMeditationEditor.tsx](web/src/components/forms/ScriptMeditationEditor.tsx) per the convention in plan V04 §3:
  - outer collapsible header (line 245) → `bg-raised border-subtle`
  - grid panel (line 256) → `bg-raised`
  - title / visibility / description / script inputs → `bg-inset text-ink border-subtle`
  - script textarea overlay (lines 306–328) — both the highlight layer and the transparent textarea need consistent backgrounds
  - sounds aside (line 369) — `border-subtle`, list rows → `bg-inset text-ink`
- [x] Sweep [CreateMeditationModeSwitcher.tsx](web/src/components/forms/CreateMeditationModeSwitcher.tsx) so the Script/Spreadsheet pill blends.
- [x] Add muted-dark variants for the syntax-highlight tokens: `text-primary-700` → also `dark:text-primary-300`; `text-emerald-700` → `dark:text-emerald-300`; `text-amber-700` → `dark:text-amber-300`.
- [ ] Verify in browser at `/` while signed in, dark mode toggled — compare against the screenshot the user shared.
- [x] Run `npm run lint` and `npm run typecheck` in `web/`.
- [x] Commit referencing this file + Phase 1.

## Phase 2 — Create Meditation (Spreadsheet flow)

- [x] Sweep [CreateMeditationForm.tsx](web/src/components/forms/CreateMeditationForm.tsx) per the convention in plan V04 §3.
- [x] Column header row (line 372): convert `text-calm-600` labels → `text-ink-muted`, dividers → `border-subtle`.
- [x] Action popovers (lines 416–451): floating menu → `bg-overlay border-subtle`, item text → `text-ink`, hover bg → `hover:bg-inset`.
- [x] Inline error text already uses `text-red-500` — leave as-is, verify it reads on the dark surface.
- [ ] Verify in browser (Spreadsheet tab in dark mode).
- [x] Run `npm run lint` and `npm run typecheck` in `web/`.
- [x] Commit referencing this file + Phase 2.

## Phase 3 — Meditation Details + Submit Confirmation

- [x] Sweep [ModalMeditationDetails.tsx](web/src/components/modals/ModalMeditationDetails.tsx): modal panel → `bg-overlay`, internal sub-panels → `bg-raised`, dt/dd label rows → `text-ink-muted` / `text-ink`, audio player container → `bg-inset border-subtle`.
- [x] Sweep [ModalConfirmCreateMeditation.tsx](web/src/components/modals/ModalConfirmCreateMeditation.tsx): modal panel → `bg-overlay`, inner cards → `bg-raised`.
- [ ] Verify modals visibly lift one step above the cards behind them in dark mode.
- [x] Run `npm run lint` and `npm run typecheck` in `web/`.
- [x] Commit referencing this file + Phase 3.

## Phase 4a — AdminTable (shared shell)

- [x] [AdminTable.tsx:68](web/src/components/tables/AdminTable.tsx:68) search input: `border-calm-200 bg-white text-calm-800` → `border-subtle bg-inset text-ink`.
- [x] [AdminTable.tsx:75](web/src/components/tables/AdminTable.tsx:75) and [:84](web/src/components/tables/AdminTable.tsx:84) pagination buttons: `border-calm-200` → `border-subtle`.
- [x] [AdminTable.tsx:92](web/src/components/tables/AdminTable.tsx:92) table container: `border-calm-100` → `border-subtle`.
- [x] [AdminTable.tsx:94](web/src/components/tables/AdminTable.tsx:94) sticky thead: `bg-white/90 backdrop-blur` → `bg-raised/90 backdrop-blur` (alpha kept; verified working in Phase 0).
- [x] [AdminTable.tsx:96](web/src/components/tables/AdminTable.tsx:96) header row and [:110](web/src/components/tables/AdminTable.tsx:110) sort indicator: `text-calm-500` / `text-calm-400` → `text-ink-muted`.
- [x] [AdminTable.tsx:130](web/src/components/tables/AdminTable.tsx:130) empty state: `text-calm-500` → `text-ink-muted`.
- [x] [AdminTable.tsx:137](web/src/components/tables/AdminTable.tsx:137) body row: `border-calm-100 text-calm-700` → `border-subtle text-ink-muted`.
- [ ] Verify admin tables in dark mode — chrome (search/header/pagination/borders) is now themed even though the per-table files haven't been touched yet. **Scroll the table** and confirm the sticky header softens rows underneath (not opaque, not fully transparent).
- [x] Run `npm run lint` and `npm run typecheck` in `web/`.
- [x] Commit referencing this file + Phase 4a.

## Phase 4b — admin/page.tsx (page chrome)

Sweep [admin/page.tsx](web/src/app/admin/page.tsx) in order. Each sub-step is small; one commit at the end of 4b is fine, or split if any individual section is large.

- [ ] Page header + tabs.
- [ ] Users tab wrapper.
- [ ] Sounds tab wrapper + upload area.
- [ ] Meditations tab wrapper.
- [ ] Queuer tab wrapper.
- [ ] Database tab wrapper.
- [ ] Verify all five admin tabs in dark mode.
- [ ] Run `npm run lint` and `npm run typecheck` in `web/`.
- [ ] Commit referencing this file + Phase 4b.

## Phase 4c — Per-table components

- [ ] Sweep [TableAdminUsers.tsx](web/src/components/tables/TableAdminUsers.tsx) — status pills, action buttons, inline calm/white classes.
- [ ] Sweep [TableAdminSoundsFiles.tsx](web/src/components/tables/TableAdminSoundsFiles.tsx).
- [ ] Sweep [TableAdminMeditations.tsx](web/src/components/tables/TableAdminMeditations.tsx).
- [ ] Sweep [TableAdminQueuer.tsx](web/src/components/tables/TableAdminQueuer.tsx).
- [ ] Sweep [TableAdminDatabase.tsx](web/src/components/tables/TableAdminDatabase.tsx).
- [ ] Verify all five tables in dark mode — cells now match the chrome.
- [ ] Run `npm run lint` and `npm run typecheck` in `web/`.
- [ ] Commit referencing this file + Phase 4c.

## Phase 5 — Shared modals reused by in-scope surfaces

- [ ] Sweep [ModalUploadSoundFile.tsx](web/src/components/modals/ModalUploadSoundFile.tsx) — modal panel `bg-overlay`, dropzone `bg-inset border-subtle`.
- [ ] Sweep [ModalConfirmDelete.tsx](web/src/components/modals/ModalConfirmDelete.tsx).
- [ ] Sweep [ModalConfirmCascadeDelete.tsx](web/src/components/modals/ModalConfirmCascadeDelete.tsx).
- [ ] Sweep [ModalConfirmDeleteUser.tsx](web/src/components/modals/ModalConfirmDeleteUser.tsx).
- [ ] Sweep [ModalInformationOk.tsx](web/src/components/modals/ModalInformationOk.tsx).
- [ ] Open at least one of each modal type (upload, confirm-delete, info) from the admin and submit flows in dark mode and verify.
- [ ] Run `npm run lint` and `npm run typecheck` in `web/`.
- [ ] Commit referencing this file + Phase 5.

## Phase 6 — Verification + screenshots

- [ ] Dev-server walkthrough in **dark mode**:
  - [ ] Create Meditation — Script sub-flow
  - [ ] Create Meditation — Spreadsheet sub-flow (incl. action popovers)
  - [ ] Meditation Details modal opened from home table
  - [ ] Submit-confirmation modal
  - [ ] Admin → Users tab (search, sort, paginate, delete confirm, **scroll long list to confirm sticky-header softening**)
  - [ ] Admin → Sounds tab (incl. upload modal)
  - [ ] Admin → Meditations tab
  - [ ] Admin → Queuer tab
  - [ ] Admin → Database tab
- [ ] Dev-server walkthrough in **light mode** — confirm visually unchanged from baseline for every surface above.
- [ ] **Auth-modal smoke check** — open [ModalLogin.tsx](web/src/components/modals/ModalLogin.tsx) and [ModalRegister.tsx](web/src/components/modals/ModalRegister.tsx) in both themes; confirm they are identical to pre-sweep baseline (positive verification that the `.input-field` boundary held).
- [ ] Existing dark-aware surfaces unchanged: home page (`/`), top navigation, meditation table on `/`.
- [ ] Final `npm run lint` and `npm run typecheck` in `web/`.
- [ ] Capture before/after screenshots in dark mode for the three named surfaces; attach to PR.
- [ ] Commit referencing this file + Phase 6.
