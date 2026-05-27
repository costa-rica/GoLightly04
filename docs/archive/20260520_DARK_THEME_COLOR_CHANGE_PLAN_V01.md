---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Dark Theme Color Change Plan — V01

## 1. Goals

Reduce the high-contrast "bright card on near-black body" look in dark mode and stick to a palette of blues, grays, and white text. Targets in priority order:

1. Create Meditation section (Script and Spreadsheet sub-flows)
2. Meditation Details modal
3. Admin page

Secondary outcome: any shared modal/component reused by the three primary surfaces should also pick up the darker, less-contrasty look so the user is not bounced between palettes.

## 2. Why the current dark theme looks contrasty

- Dark mode is toggled by adding `class="dark"` on `<html>` and setting `document.documentElement.style.colorScheme = "dark"` (see [ThemeToggle.tsx:10](web/src/components/ThemeToggle.tsx:10)).
- The body wrapper does flip dark: [AppShell.tsx:58](web/src/components/AppShell.tsx:58) applies `dark:bg-calm-950 dark:text-calm-100`.
- However, the major content surfaces have **zero** `dark:` variants today:
  - [CreateMeditationForm.tsx](web/src/components/forms/CreateMeditationForm.tsx) — 0 `dark:` classes
  - [ScriptMeditationEditor.tsx](web/src/components/forms/ScriptMeditationEditor.tsx) — 0 `dark:` classes
  - [ModalMeditationDetails.tsx](web/src/components/modals/ModalMeditationDetails.tsx) — 0 `dark:` classes
  - [ModalConfirmCreateMeditation.tsx](web/src/components/modals/ModalConfirmCreateMeditation.tsx) — 0 `dark:` classes
  - [admin/page.tsx](web/src/app/admin/page.tsx) — 0 `dark:` classes
- These surfaces render `bg-white` / `bg-white/80` cards and `text-calm-900` text on top of a calm-950 body — that is the bright "card sitting in a black hole" effect in the screenshot.
- Inputs look near-black because `color-scheme: dark` switches native form controls to the browser's dark UA styling while the surrounding card is still white. The visible mismatch (light card + dark native input) is what reads as "too contrasty," not just the background.

Conclusion: the fix is two-fold — (a) define a coherent dark surface palette in blues/grays/white, and (b) apply `dark:` variants to the surfaces above so the gap between card, input, and body collapses to a few small steps instead of a black-and-white jump.

## 3. Proposed dark palette

Keep the existing `calm` (slate) and `primary` (sky) ramps in [tailwind.config.js](web/tailwind.config.js). Introduce semantic surface tokens layered on top of them so future components don't have to memorize "which calm-N is the card." Each token names a role; the value is picked to keep contrast steps small (Δ in lightness between adjacent layers ≈ 4–8%).

| Token (Tailwind alias) | Light value | Dark value | Hex (dark) | Role |
| --- | --- | --- | --- | --- |
| `surface-canvas`   | calm-50    | calm-950 tinted blue | `#0d1422` | Page background |
| `surface-raised`   | white      | slate-blue           | `#172033` | Top-level card / panel |
| `surface-inset`    | calm-50    | slightly darker      | `#111a2b` | Inputs, code blocks, list rows inside a panel |
| `surface-overlay`  | white      | slightly lighter     | `#1d2740` | Modals (sit above cards) |
| `border-subtle`    | calm-200   | `#243049`            | `#243049` | Default panel/input border |
| `border-strong`    | calm-300   | `#2d3a55`            | `#2d3a55` | Hover / focus border |
| `text-primary`     | calm-900   | `#e6ecf5`            | `#e6ecf5` | Primary body text |
| `text-secondary`   | calm-600   | `#a7b2c5`            | `#a7b2c5` | Secondary / label text |
| `text-muted`       | calm-500   | `#7a8599`            | `#7a8599` | Helper / placeholder text |
| `accent` (kept)    | primary-600| primary-400          | —         | Interactive blue (links, buttons) |

Design rules the palette enforces:

- **Maximum 3 layers** between page bg and a deepest input: canvas → raised → inset. Each step is small.
- **Modals lift one step above cards** (`surface-overlay` `#1d2740` sits above `surface-raised` `#172033`) so a modal is visibly elevated.
- **No pure white** in dark mode; lightest surface is `#1d2740` (modal overlay).
- **No pure black**; darkest surface is `#0d1422` (canvas), which is calm-950 nudged toward blue.
- **Text** uses an off-white (`#e6ecf5`) rather than `#ffffff` so the type doesn't punch against the muted surfaces.
- Accent stays blue (sky-400/500), purple `secondary` ramp is unused on the targeted surfaces — verify before removal.

### Implementation form

**Decision: semantic-token approach.** Extend `tailwind.config.js` with a new `surface` color group plus the named text/border tokens above. To keep class names readable we map them flat: `bg-raised`, `bg-inset`, `bg-overlay`, `border-subtle`, `border-strong`, `text-ink`, `text-ink-muted`. Each value is exposed as a CSS variable in `globals.css` so the `.dark` selector flips them in one place.

### CSS variable wiring (sketch for 3a)

```css
/* globals.css @layer base */
:root {
  --surface-canvas: #f8fafc;   /* calm-50 */
  --surface-raised: #ffffff;
  --surface-inset:  #f1f5f9;   /* calm-100 */
  --surface-overlay:#ffffff;
  --border-subtle:  #e2e8f0;   /* calm-200 */
  --border-strong:  #cbd5e1;   /* calm-300 */
  --text-ink:       #0f172a;   /* calm-900 */
  --text-ink-muted: #64748b;   /* calm-500 */
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

Tailwind reads them via `colors: { raised: 'var(--surface-raised)', ... }` so we get `bg-raised`, `text-ink`, etc.

## 4. Files to change

Primary (must touch):

- [web/tailwind.config.js](web/tailwind.config.js) — add surface/ink/border tokens.
- [web/src/styles/globals.css](web/src/styles/globals.css) — declare CSS variables for `:root` and `.dark`; update `.card`, `.input-field`, `.btn-outline` to use the tokens so old usages benefit automatically.
- [web/src/components/forms/CreateMeditationForm.tsx](web/src/components/forms/CreateMeditationForm.tsx) — sweep `bg-white*`, `text-calm-900`, `border-calm-200*`, `bg-calm-50` to use new tokens or add `dark:` variants.
- [web/src/components/forms/ScriptMeditationEditor.tsx](web/src/components/forms/ScriptMeditationEditor.tsx) — same sweep; pay extra attention to the script `<textarea>` overlay at lines 306–328 (it renders syntax-highlighted spans on top of an invisible textarea — both layers need consistent dark backgrounds).
- [web/src/components/forms/CreateMeditationModeSwitcher.tsx](web/src/components/forms/CreateMeditationModeSwitcher.tsx) — switcher pill colors.
- [web/src/components/modals/ModalMeditationDetails.tsx](web/src/components/modals/ModalMeditationDetails.tsx) — entire modal body.
- [web/src/components/modals/ModalConfirmCreateMeditation.tsx](web/src/components/modals/ModalConfirmCreateMeditation.tsx) — confirm dialog used at submit.
- [web/src/app/admin/page.tsx](web/src/app/admin/page.tsx) — 951 lines, biggest single sweep.

Secondary (touch only if reused inside the three target flows; confirm via grep before editing):

- [web/src/components/modals/ModalUploadSoundFile.tsx](web/src/components/modals/ModalUploadSoundFile.tsx) — opened from admin and from script editor.
- [web/src/components/modals/ModalConfirmDelete.tsx](web/src/components/modals/ModalConfirmDelete.tsx), [ModalConfirmCascadeDelete.tsx](web/src/components/modals/ModalConfirmCascadeDelete.tsx), [ModalConfirmDeleteUser.tsx](web/src/components/modals/ModalConfirmDeleteUser.tsx) — admin delete flows.
- [web/src/components/modals/ModalInformationOk.tsx](web/src/components/modals/ModalInformationOk.tsx) — error/info dialog shown from admin and submit flows.

Out of scope (leave as-is unless they visibly break):

- [web/src/app/page.tsx](web/src/app/page.tsx), [Navigation.tsx](web/src/components/Navigation.tsx), [TableMeditation.tsx](web/src/components/tables/TableMeditation.tsx) — already have `dark:` variants; verify they still read well next to the new tokens but don't restyle.
- Login / Register / Forgot-Password / Reset-Password — out of the three named surfaces.

## 5. Phased implementation

### Phase 0 — token spike (≈30 min)

- Add tokens to [tailwind.config.js](web/tailwind.config.js) and CSS variables to [globals.css](web/src/styles/globals.css).
- Verify dev build still type-checks and Tailwind picks up the new utilities.
- Manually flip body to `bg-canvas text-ink` (replace the hard-coded `bg-calm-50 ... dark:bg-calm-950 dark:text-calm-100` on [AppShell.tsx:58](web/src/components/AppShell.tsx:58)).

### Phase 1 — Create Meditation (Script flow)

- Sweep [ScriptMeditationEditor.tsx](web/src/components/forms/ScriptMeditationEditor.tsx):
  - Outer collapsible header: `bg-white/80` → `bg-raised`, border → `border-subtle`.
  - Grid panel (line 256): `bg-white/90` → `bg-raised`.
  - Inputs (title, visibility select, description, script textarea, sound list buttons): backgrounds → `bg-inset`, text → `text-ink`, borders → `border-subtle` with `focus:border-primary-400` kept.
  - Token colors for syntax (`text-primary-700`, `text-emerald-700`, `text-amber-700`) get muted dark equivalents (`dark:text-primary-300`, `dark:text-emerald-300`, `dark:text-amber-300`).
- Apply the same sweep to [CreateMeditationModeSwitcher.tsx](web/src/components/forms/CreateMeditationModeSwitcher.tsx) so the Script/Spreadsheet pill blends with the panel.
- Visually verify in browser at `/` while signed in; compare against the screenshot the user shared.

### Phase 2 — Create Meditation (Spreadsheet flow)

- Same sweep on [CreateMeditationForm.tsx](web/src/components/forms/CreateMeditationForm.tsx).
- Special attention to:
  - The "#"/Sound/Time/Volume column header row (line 372).
  - The action popovers (lines 416–451) — currently `bg-white` floating menus; must become `bg-overlay` with `border-subtle`.
  - Inline error text already uses `text-red-500` — keep, it reads fine on the dark surface.

### Phase 3 — Meditation Details + Submit Confirmation

- [ModalMeditationDetails.tsx](web/src/components/modals/ModalMeditationDetails.tsx) — sweep cards, dt/dd label rows, audio player container.
- [ModalConfirmCreateMeditation.tsx](web/src/components/modals/ModalConfirmCreateMeditation.tsx) — confirm card and buttons.

### Phase 4 — Admin page

- [admin/page.tsx](web/src/app/admin/page.tsx) is the largest file (951 lines). Plan to sweep in sections so each commit is reviewable:
  1. Page header + tabs
  2. Users table
  3. Sounds table + upload area
  4. Meditations table
  5. Any inline modals/popovers
- After each section, view in dev server before moving on.

### Phase 5 — Shared modals (only those used by the above)

- ModalUploadSoundFile, ModalConfirmDelete, ModalConfirmCascadeDelete, ModalConfirmDeleteUser, ModalInformationOk.
- Same token sweep; these are short files (most under 200 lines).

### Phase 6 — Verification

- Manual QA pass with dev server (`npm run dev` in `web/`), `colorScheme=dark`:
  - Create Meditation (both Script and Spreadsheet sub-flows)
  - Meditation Details (open from home table)
  - Admin page (all three tables + at least one delete confirm + one upload)
  - Cross-check that light mode still looks like the existing baseline (the same tokens cover both).
- Lint + typecheck: `npm run lint` and `npm run typecheck` in `web/`.
- Capture before/after screenshots in dark mode for the three named surfaces; attach to PR.

## 6. Acceptance criteria

- All three named surfaces (Create Meditation, Meditation Details, Admin) render in dark mode using only blue/gray/white text — no pure white card backgrounds, no pure black bg.
- Contrast step between body, card, and input is small enough that they read as a single muted palette rather than "white card sitting in a black void."
- Light mode is visually unchanged (or only changed where the existing light styling was clearly broken).
- No regressions in the surfaces already styled for dark mode (home page, navigation, meditation table).
- Lint and typecheck pass.

## 7. Non-goals

- Reworking the `primary`/`secondary`/`accent` brand ramps. We keep blue for accent at its **current saturation** (no toning down in dark mode — primary-500/600 buttons stay as-is, providing a deliberate pop against the muted surfaces) and ignore `secondary` purple unless it appears on a target surface.
- Adding a third theme (e.g. "midnight"). Two themes only.
- Touching auth screens (login/register/forgot/reset).
- Changing typography, spacing, or layout. Color-only sweep.

## 8. Decisions locked in (2026-05-20)

1. **Implementation form**: semantic-token approach (Section 3, option a). Flat token names exposed as CSS variables and flipped by the `.dark` selector.
2. **Modal elevation**: modals are one step lighter than cards (`surface-overlay` `#1d2740` above `surface-raised` `#172033`) for visible lift.
3. **Accent saturation**: unchanged in dark mode — `primary-500/600` buttons stay as-is for a deliberate pop against muted surfaces.
4. **Admin scope**: only [web/src/app/admin/page.tsx](web/src/app/admin/page.tsx) (users / sounds / meditations). No other admin views planned.
