---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Dark Theme Color Change Plan — V02

## 0. Changes from V01

Supersedes [20260520_DARK_THEME_COLOR_CHANGE_PLAN_V01.md](20260520_DARK_THEME_COLOR_CHANGE_PLAN_V01.md). Two issues from [20260520_DARK_THEME_COLOR_CHANGE_PLAN_V01_ASSESSMENT_CODEX.md](20260520_DARK_THEME_COLOR_CHANGE_PLAN_V01_ASSESSMENT_CODEX.md) drove this revision:

1. **Tailwind token naming** — V01 said utilities would be `bg-raised`, `text-ink`, `border-subtle`, etc., but the example CSS-variable names (`--surface-raised`, `--text-ink`, `--border-subtle`) and the `theme.extend.colors` shape were ambiguous. If keys were added literally as `border-subtle` / `text-ink`, Tailwind would generate `border-border-subtle` / `text-text-ink`. V02 pins the exact Tailwind config shape and a complete token table so the utility names are unambiguous.
2. **Admin scope gap** — V01 listed only [admin/page.tsx](web/src/app/admin/page.tsx). The admin page renders six sub-components ([AdminTable.tsx](web/src/components/tables/AdminTable.tsx) and the five `TableAdmin*.tsx` files), all with 0 `dark:` variants. They own the search input, table container, sticky header, row borders, and pagination — the actual data surfaces an admin uses. V02 brings those into primary scope.

Locked-in decisions from V01 carry forward (semantic-token approach, modals one step lighter than cards, current accent saturation, admin scope = the existing `admin/page.tsx` plus its table components).

## 1. Goals

Reduce the high-contrast "bright card on near-black body" look in dark mode and stick to a palette of blues, grays, and white text. Targets in priority order:

1. Create Meditation section (Script and Spreadsheet sub-flows)
2. Meditation Details modal
3. Admin page (including its shared table components)

Any shared modal/component reused by these surfaces should also pick up the new palette so the user is not bounced between dark looks.

## 2. Why the current dark theme looks contrasty

- Dark mode is toggled by adding `class="dark"` on `<html>` and setting `document.documentElement.style.colorScheme = "dark"` (see [ThemeToggle.tsx:10](web/src/components/ThemeToggle.tsx:10)).
- The body wrapper does flip dark: [AppShell.tsx:58](web/src/components/AppShell.tsx:58) applies `dark:bg-calm-950 dark:text-calm-100`.
- The major content surfaces have **zero** `dark:` variants today:
  - [CreateMeditationForm.tsx](web/src/components/forms/CreateMeditationForm.tsx), [ScriptMeditationEditor.tsx](web/src/components/forms/ScriptMeditationEditor.tsx), [CreateMeditationModeSwitcher.tsx](web/src/components/forms/CreateMeditationModeSwitcher.tsx)
  - [ModalMeditationDetails.tsx](web/src/components/modals/ModalMeditationDetails.tsx), [ModalConfirmCreateMeditation.tsx](web/src/components/modals/ModalConfirmCreateMeditation.tsx)
  - [admin/page.tsx](web/src/app/admin/page.tsx) **and** [AdminTable.tsx](web/src/components/tables/AdminTable.tsx), [TableAdminUsers.tsx](web/src/components/tables/TableAdminUsers.tsx), [TableAdminSoundsFiles.tsx](web/src/components/tables/TableAdminSoundsFiles.tsx), [TableAdminMeditations.tsx](web/src/components/tables/TableAdminMeditations.tsx), [TableAdminQueuer.tsx](web/src/components/tables/TableAdminQueuer.tsx), [TableAdminDatabase.tsx](web/src/components/tables/TableAdminDatabase.tsx)
- These surfaces render `bg-white` / `bg-white/80` cards and `text-calm-900` text on top of a calm-950 body — that is the bright "card sitting in a black hole" effect in the screenshot.
- Inputs look near-black because `color-scheme: dark` switches native form controls to the browser's dark UA styling while the surrounding card is still white. The visible mismatch (light card + dark native input) is what reads as "too contrasty."

Fix: (a) define a coherent dark surface palette in blues/grays/white, and (b) apply `dark:` variants on the surfaces above so the gap between card, input, and body collapses to small steps.

## 3. Proposed dark palette

Keep the existing `calm` (slate) and `primary` (sky) ramps in [tailwind.config.js](web/tailwind.config.js). Add semantic surface/text/border tokens layered on top. Each token names a role; values keep contrast steps small (Δ in lightness between adjacent layers ≈ 4–8%).

| Utility class (final) | Tailwind config key | CSS variable | Light value | Dark value | Role |
| --- | --- | --- | --- | --- | --- |
| `bg-canvas`        | `colors.canvas`   | `--surface-canvas`  | `#f8fafc` | `#0d1422` | Page background |
| `bg-raised`        | `colors.raised`   | `--surface-raised`  | `#ffffff` | `#172033` | Top-level card / panel |
| `bg-inset`         | `colors.inset`    | `--surface-inset`   | `#f1f5f9` | `#111a2b` | Inputs, code blocks, list rows inside a panel |
| `bg-overlay`       | `colors.overlay`  | `--surface-overlay` | `#ffffff` | `#1d2740` | Modals (one step lighter than `raised`) |
| `border-subtle`    | `colors.subtle`   | `--border-subtle`   | `#e2e8f0` | `#243049` | Default panel / input border |
| `border-strong`    | `colors.strong`   | `--border-strong`   | `#cbd5e1` | `#2d3a55` | Hover / focus border |
| `text-ink`         | `colors.ink`      | `--text-ink`        | `#0f172a` | `#e6ecf5` | Primary body text |
| `text-ink-muted`   | `colors["ink-muted"]` | `--text-ink-muted` | `#64748b` | `#a7b2c5` | Secondary / muted text |

Reading the table: the **utility class** column is exactly what gets typed in JSX. The **Tailwind config key** is the literal key under `theme.extend.colors`. Because Tailwind prefixes the utility (`bg-`, `text-`, `border-`) ahead of the color key, the keys are bare (e.g. `raised`, not `surface-raised`) — that is what produces `bg-raised` instead of `bg-surface-raised` or `bg-bg-raised`.

Design rules the palette enforces:

- **Maximum 3 layers** between page bg and a deepest input: canvas → raised → inset.
- **Modals lift one step above cards** (`overlay` `#1d2740` sits above `raised` `#172033`).
- **No pure white** in dark mode; lightest surface is `#1d2740` (modal overlay).
- **No pure black**; darkest surface is `#0d1422` (canvas) — calm-950 nudged toward blue.
- **Text** uses an off-white (`#e6ecf5`) rather than `#ffffff`.
- **Accent stays at current saturation** — `primary-500/600` buttons unchanged in dark mode for deliberate pop.

### Tailwind config — exact shape

Extend [tailwind.config.js](web/tailwind.config.js) — add **next to** the existing `primary`/`secondary`/`accent`/`calm` ramps, do not replace them:

```js
// tailwind.config.js — inside theme.extend.colors
canvas:        'var(--surface-canvas)',
raised:        'var(--surface-raised)',
inset:         'var(--surface-inset)',
overlay:       'var(--surface-overlay)',
subtle:        'var(--border-subtle)',
strong:        'var(--border-strong)',
ink:           'var(--text-ink)',
'ink-muted':   'var(--text-ink-muted)',
```

This produces exactly: `bg-canvas`, `bg-raised`, `bg-inset`, `bg-overlay`, `border-subtle`, `border-strong`, `text-ink`, `text-ink-muted`. No accidental `bg-bg-*` or `text-text-*` doubling.

Naming collision check before adding: none of the keys above (`canvas`, `raised`, `inset`, `overlay`, `subtle`, `strong`, `ink`, `ink-muted`) overlap with Tailwind's default palette or with the existing custom keys (`primary`, `secondary`, `accent`, `calm`). Verify with a quick grep during Phase 0.

### CSS variable wiring

In [globals.css](web/src/styles/globals.css), inside `@layer base`:

```css
:root {
  --surface-canvas:  #f8fafc;
  --surface-raised:  #ffffff;
  --surface-inset:   #f1f5f9;
  --surface-overlay: #ffffff;
  --border-subtle:   #e2e8f0;
  --border-strong:   #cbd5e1;
  --text-ink:        #0f172a;
  --text-ink-muted:  #64748b;
}
.dark {
  --surface-canvas:  #0d1422;
  --surface-raised:  #172033;
  --surface-inset:   #111a2b;
  --surface-overlay: #1d2740;
  --border-subtle:   #243049;
  --border-strong:   #2d3a55;
  --text-ink:        #e6ecf5;
  --text-ink-muted:  #a7b2c5;
}
```

The CSS-variable names are deliberately verbose (`--surface-raised` etc.) for legibility in devtools. The Tailwind key (and therefore the utility suffix) is the bare role name.

### Convention for component sweeps

When converting a component:

- `bg-white` / `bg-white/80` / `bg-white/90` on a panel → `bg-raised` (drop the alpha unless you specifically need backdrop blur — most current uses are decorative).
- `bg-white` on a modal panel → `bg-overlay`.
- `bg-calm-50` on inputs / inner rows → `bg-inset`.
- `text-calm-900` → `text-ink`.
- `text-calm-500` / `text-calm-600` (helper / label text) → `text-ink-muted`.
- `border-calm-200` / `border-calm-200/70` → `border-subtle`.
- `border-calm-300` (focus/hover borders) → `border-strong`.
- Anything that is already `dark:`-aware (home page, navigation, meditation table) is **left as-is** — those use the calm ramp directly and read fine.

Tokens replace the underlying value in both themes, so a component written with the new tokens still renders correctly in light mode without `dark:` variants.

## 4. Files to change

### Primary (must touch)

**Foundation**
- [web/tailwind.config.js](web/tailwind.config.js) — add tokens per §3.
- [web/src/styles/globals.css](web/src/styles/globals.css) — declare CSS variables for `:root` and `.dark`; update `.card` and `.input-field` component classes to use the tokens so old usages benefit automatically.
- [web/src/components/AppShell.tsx](web/src/components/AppShell.tsx) — replace the hard-coded `bg-calm-50 ... dark:bg-calm-950 dark:text-calm-100` on line 58 with `bg-canvas text-ink`.

**Create Meditation flow**
- [web/src/components/forms/ScriptMeditationEditor.tsx](web/src/components/forms/ScriptMeditationEditor.tsx) — outer panel, inputs, syntax-highlighted textarea overlay (lines 306–328), sounds aside.
- [web/src/components/forms/CreateMeditationForm.tsx](web/src/components/forms/CreateMeditationForm.tsx) — spreadsheet panel, action popovers (lines 416–451 — must become `bg-overlay`), column header row.
- [web/src/components/forms/CreateMeditationModeSwitcher.tsx](web/src/components/forms/CreateMeditationModeSwitcher.tsx) — Script/Spreadsheet pill.

**Meditation Details**
- [web/src/components/modals/ModalMeditationDetails.tsx](web/src/components/modals/ModalMeditationDetails.tsx) — `bg-overlay` for the dialog, `bg-raised`/`bg-inset` for sub-panels, audio player container.
- [web/src/components/modals/ModalConfirmCreateMeditation.tsx](web/src/components/modals/ModalConfirmCreateMeditation.tsx) — `bg-overlay`.

**Admin page**
- [web/src/app/admin/page.tsx](web/src/app/admin/page.tsx) — tabs, section headers, page chrome around the tables.
- [web/src/components/tables/AdminTable.tsx](web/src/components/tables/AdminTable.tsx) — **the central admin surface**: search input (line 68), table container (line 92), sticky thead (line 94), header row (line 96), sort indicators (line 110), empty state (line 130), body row borders (line 137), pagination buttons (lines 75, 84).
- [web/src/components/tables/TableAdminUsers.tsx](web/src/components/tables/TableAdminUsers.tsx) — status pills, action buttons, hard-coded calm/white classes inside cells.
- [web/src/components/tables/TableAdminSoundsFiles.tsx](web/src/components/tables/TableAdminSoundsFiles.tsx) — same.
- [web/src/components/tables/TableAdminMeditations.tsx](web/src/components/tables/TableAdminMeditations.tsx) — same.
- [web/src/components/tables/TableAdminQueuer.tsx](web/src/components/tables/TableAdminQueuer.tsx) — same.
- [web/src/components/tables/TableAdminDatabase.tsx](web/src/components/tables/TableAdminDatabase.tsx) — same.

### Secondary (touch only if reused inside the three target flows; confirm via grep before editing)

- [web/src/components/modals/ModalUploadSoundFile.tsx](web/src/components/modals/ModalUploadSoundFile.tsx) — opened from admin and from script editor.
- [web/src/components/modals/ModalConfirmDelete.tsx](web/src/components/modals/ModalConfirmDelete.tsx), [ModalConfirmCascadeDelete.tsx](web/src/components/modals/ModalConfirmCascadeDelete.tsx), [ModalConfirmDeleteUser.tsx](web/src/components/modals/ModalConfirmDeleteUser.tsx) — admin delete flows.
- [web/src/components/modals/ModalInformationOk.tsx](web/src/components/modals/ModalInformationOk.tsx) — error / info dialog shown from admin and submit flows.

### Out of scope

- [web/src/app/page.tsx](web/src/app/page.tsx), [Navigation.tsx](web/src/components/Navigation.tsx), [TableMeditation.tsx](web/src/components/tables/TableMeditation.tsx) — already have `dark:` variants; verify they read well next to the new tokens but don't restyle.
- Login / Register / Forgot-Password / Reset-Password.

## 5. Phased implementation

### Phase 0 — token foundation (≈30 min)

- Add tokens to [tailwind.config.js](web/tailwind.config.js) and CSS variables to [globals.css](web/src/styles/globals.css).
- Run `npm run typecheck` and a one-off `npm run dev` to confirm Tailwind picks up the new utilities. Use a throwaway `<div className="bg-raised text-ink border-subtle">` in `page.tsx` to verify class generation, then revert.
- Grep for collisions: `git grep -nE "(bg|text|border)-(canvas|raised|inset|overlay|subtle|strong|ink|ink-muted)\b" web/src` should return no hits before the sweep starts.
- Update [AppShell.tsx:58](web/src/components/AppShell.tsx:58) to `bg-canvas text-ink` so the body itself uses the tokens.
- Update `.card` and `.input-field` in [globals.css](web/src/styles/globals.css) to use the tokens so existing usages of those component classes benefit automatically.

### Phase 1 — Create Meditation (Script flow)

- Sweep [ScriptMeditationEditor.tsx](web/src/components/forms/ScriptMeditationEditor.tsx) per the convention in §3.
- Apply the same sweep to [CreateMeditationModeSwitcher.tsx](web/src/components/forms/CreateMeditationModeSwitcher.tsx) so the Script/Spreadsheet pill blends with the panel.
- Syntax-highlight token colors in the script overlay (`text-primary-700`, `text-emerald-700`, `text-amber-700`) get muted dark equivalents (`dark:text-primary-300`, `dark:text-emerald-300`, `dark:text-amber-300`).
- Visually verify in browser at `/` while signed in; compare against the screenshot the user shared.

### Phase 2 — Create Meditation (Spreadsheet flow)

- Sweep [CreateMeditationForm.tsx](web/src/components/forms/CreateMeditationForm.tsx).
- Special attention to:
  - Column header row.
  - Action popovers (lines 416–451) — must become `bg-overlay border-subtle`.

### Phase 3 — Meditation Details + Submit Confirmation

- [ModalMeditationDetails.tsx](web/src/components/modals/ModalMeditationDetails.tsx) — modal body uses `bg-overlay`; internal panels use `bg-raised`.
- [ModalConfirmCreateMeditation.tsx](web/src/components/modals/ModalConfirmCreateMeditation.tsx) — `bg-overlay`.

### Phase 4 — Admin page + admin tables

Sweep in this order so each commit is reviewable on its own; verify in dev server between sub-phases:

4a. [AdminTable.tsx](web/src/components/tables/AdminTable.tsx) — convert the shared shell first. Once this is done, every consuming table picks up the new look automatically for the shared chrome (container, search, header, pagination, row borders). Specific spots:
- Line 68 search input: `border-calm-200 bg-white text-calm-800` → `border-subtle bg-inset text-ink`.
- Line 92 table container: `border-calm-100` → `border-subtle`.
- Line 94 sticky thead: `bg-white/90 backdrop-blur` → `bg-raised/90 backdrop-blur`.
- Line 96 header row text + line 110 sort indicator: `text-calm-500` / `text-calm-400` → `text-ink-muted`.
- Line 130 empty state: `text-calm-500` → `text-ink-muted`.
- Line 137 body row: `border-calm-100 text-calm-700` → `border-subtle text-ink-muted`.
- Lines 75 / 84 pagination buttons: `border-calm-200` → `border-subtle`.

4b. [admin/page.tsx](web/src/app/admin/page.tsx) — page chrome. Largest file (951 lines). Sweep in sections so each commit is reviewable:
1. Page header + tabs
2. Users tab wrapper
3. Sounds tab wrapper + upload area
4. Meditations tab wrapper
5. Queuer tab wrapper
6. Database tab wrapper

4c. [TableAdminUsers.tsx](web/src/components/tables/TableAdminUsers.tsx), [TableAdminSoundsFiles.tsx](web/src/components/tables/TableAdminSoundsFiles.tsx), [TableAdminMeditations.tsx](web/src/components/tables/TableAdminMeditations.tsx), [TableAdminQueuer.tsx](web/src/components/tables/TableAdminQueuer.tsx), [TableAdminDatabase.tsx](web/src/components/tables/TableAdminDatabase.tsx) — the per-table files are small (46–102 lines each); sweep the in-cell styling (status pills, action buttons, inline calm/white classes) after `AdminTable` is done.

### Phase 5 — Shared modals (only those used by the above)

- ModalUploadSoundFile, ModalConfirmDelete, ModalConfirmCascadeDelete, ModalConfirmDeleteUser, ModalInformationOk.
- Same token sweep; these are short files (most under 200 lines). Modal bodies use `bg-overlay`.

### Phase 6 — Verification

- Manual QA pass with dev server (`npm run dev` in `web/`), with theme toggled to dark:
  - Create Meditation (both Script and Spreadsheet sub-flows)
  - Meditation Details (open from home table)
  - Admin page: all five tabs (Users, Sounds, Meditations, Queuer, Database), at least one delete confirm, one upload
  - Cross-check light mode still looks like the existing baseline.
- Lint + typecheck: `npm run lint` and `npm run typecheck` in `web/`.
- Capture before/after screenshots in dark mode for the three named surfaces; attach to PR.

## 6. Acceptance criteria

- All three named surfaces (Create Meditation, Meditation Details, Admin including its tables) render in dark mode using only blue/gray/white text — no pure white card backgrounds, no pure black bg.
- Contrast step between body, card, and input is small enough that they read as a single muted palette.
- Modal dialogs are visibly elevated (one step lighter) above the cards behind them.
- Light mode is visually unchanged from the existing baseline.
- No regressions in the surfaces already styled for dark mode (home page, navigation, meditation table).
- `npm run lint` and `npm run typecheck` pass in `web/`.

## 7. Non-goals

- Reworking the `primary` / `secondary` / `accent` brand ramps. Accent blue keeps its **current saturation** in dark mode — `primary-500/600` buttons stay as-is. `secondary` purple is ignored unless it appears on a target surface.
- Adding a third theme. Two themes only.
- Touching auth screens (login / register / forgot / reset).
- Changing typography, spacing, or layout. Color-only sweep.
- Re-styling surfaces that already work in dark mode (home page, top nav, meditation table on `/`).
