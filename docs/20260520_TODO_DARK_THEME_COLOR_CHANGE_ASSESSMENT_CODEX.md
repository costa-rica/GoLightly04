---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# TODO Dark Theme Color Change Assessment

## Finding

1. The `bg-raised/90` instruction will not work with the planned token shape

- Relevant sections:
  - Phase 0 — Token foundation
  - Phase 4a — AdminTable (shared shell)
- Risk: Phase 4a instructs the implementer to replace `bg-white/90 backdrop-blur` with `bg-raised/90 backdrop-blur`. The token foundation defines `raised` as `var(--surface-raised)`, where `--surface-raised` is a hex color. With that Tailwind color shape, Tailwind generates `bg-raised`, but it does not generate `bg-raised/90`.
- Why this materially threatens implementation success: The sticky admin table header is one of the central admin surfaces. If `bg-raised/90` is used, the class will not have generated CSS, so the header can remain transparent or visually inconsistent in dark mode. The TODO's Phase 0 throwaway test checks only `bg-raised`, `text-ink`, and `border-subtle`, so it would not catch this failure before the sweep.
- Mitigation: Change the Phase 4a instruction to use `bg-raised backdrop-blur` or `bg-raised` instead of `bg-raised/90`. This matches V03's broader convention to drop alpha unless it is specifically needed.
- Alternative: If opacity modifiers are required for semantic tokens, define the CSS variables as RGB channel values and configure Tailwind colors as `rgb(var(--surface-raised) / <alpha-value>)`. That is a larger foundation change and should be reflected in V03 and Phase 0 before implementation begins.

## Readiness

- The TODO is otherwise clear and implementation-oriented.
- It is not quite fit for an AI coding agent until the `bg-raised/90` instruction is corrected or the token foundation is changed to support opacity modifiers.
