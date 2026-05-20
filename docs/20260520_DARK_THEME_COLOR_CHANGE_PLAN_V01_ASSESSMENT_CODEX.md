---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Dark Theme Color Change Plan V01 Assessment

## Findings

1. Tailwind token aliases may not generate the class names the plan intends

- Relevant sections: 3. Proposed dark palette, especially "Implementation form" and "CSS variable wiring"; 5. Phase 0.
- Risk: The plan says to expose flat Tailwind aliases such as `border-subtle`, `border-strong`, `text-ink`, and `text-ink-muted`, then use classes like `border-subtle` and `text-ink`. If those names are added directly under `theme.extend.colors` as `border-subtle` or `text-ink`, Tailwind's utility prefixes will likely produce classes such as `border-border-subtle` and `text-text-ink`, not the intended `border-subtle` and `text-ink`.
- Why this matters: The implementation could either fail at build time with unknown classes in `@apply`, or silently leave developers using inconsistent class names across the sweep. Because this palette is the foundation for every phase, a naming mismatch materially threatens implementation success and maintainability.
- Mitigation: Define color keys according to the desired utility names before starting the component sweep. For example:
  - `colors.raised = "var(--surface-raised)"` for `bg-raised`
  - `colors.inset = "var(--surface-inset)"` for `bg-inset`
  - `colors.overlay = "var(--surface-overlay)"` for `bg-overlay`
  - `colors.canvas = "var(--surface-canvas)"` for `bg-canvas`
  - `colors.ink = "var(--text-ink)"` for `text-ink`
  - `colors["ink-muted"] = "var(--text-ink-muted)"` for `text-ink-muted`
  - `colors.subtle = "var(--border-subtle)"` for `border-subtle`
  - `colors.strong = "var(--border-strong)"` for `border-strong`
- Alternative: Use nested groups such as `surface.raised`, `ink.DEFAULT`, `ink.muted`, and `line.subtle`, then update the planned class names to `bg-surface-raised`, `text-ink`, `text-ink-muted`, and `border-line-subtle`.

2. Admin table components are omitted from the implementation scope

- Relevant sections: 4. Files to change; 5. Phase 4; 6. Acceptance criteria.
- Risk: The plan lists only `web/src/app/admin/page.tsx` as the admin primary file, but the admin page renders table bodies through shared components: `TableAdminUsers`, `TableAdminSoundsFiles`, `TableAdminMeditations`, `TableAdminQueuer`, `TableAdminDatabase`, and the shared `AdminTable`. `AdminTable` currently owns important admin UI surfaces such as the search input, table container, sticky header, row borders, row text, and pagination controls.
- Why this matters: Sweeping only `admin/page.tsx` will leave the central admin data surfaces as white/light cards inside the new dark admin panels. That directly undermines the feature's primary admin acceptance criterion and creates a high regression risk because the page would look partially converted while the most-used admin controls remain on the old palette.
- Mitigation: Add the admin table components to the primary admin scope, especially `web/src/components/tables/AdminTable.tsx`. Also review the table-specific wrappers and status badges in `TableAdminUsers.tsx`, `TableAdminSoundsFiles.tsx`, `TableAdminMeditations.tsx`, `TableAdminQueuer.tsx`, and `TableAdminDatabase.tsx` for hard-coded calm/white classes used inside cells.
- Alternative: If the intent is to keep table components globally reusable, convert `AdminTable` to the new semantic tokens once and then keep each table-specific component limited to status badges and action buttons.
