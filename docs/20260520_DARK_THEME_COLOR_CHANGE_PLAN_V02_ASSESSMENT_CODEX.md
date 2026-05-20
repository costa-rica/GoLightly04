---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Dark Theme Color Change Plan V02 Assessment

## Finding

1. The global `.input-field` update conflicts with the stated auth-screen non-goal

- Relevant sections:
  - 4. Files to change, Foundation
  - 5. Phase 0 — token foundation
  - 7. Non-goals
- Risk: V02 tells the implementer to update `.input-field` in `web/src/styles/globals.css` so existing usages benefit automatically, while also saying login, register, forgot, and reset screens are out of scope. In the current codebase, the only `input-field` consumers are `ModalLogin.tsx` and `ModalRegister.tsx`.
- Why this materially threatens implementation success: Once `.input-field` uses theme tokens, those auth modal inputs will change in dark mode even though their surrounding modal panels, labels, dividers, and helper text remain on the old light-only palette. That can recreate the exact mixed light-card/dark-input mismatch the plan is trying to remove, but in an explicitly out-of-scope surface. It also makes acceptance harder because "light mode unchanged" and "auth out of scope" are no longer true boundaries for the implementation.
- Mitigation: Do not update `.input-field` globally as part of Phase 0 unless the auth modals are added to scope and converted together. Instead, apply `bg-inset`, `text-ink`, and `border-subtle` directly to the target forms and modals listed in the primary scope.
- Alternative: Split the helper into a new tokenized class such as `.input-field-themed` for the dark-theme sweep, leave `.input-field` unchanged, and migrate only the targeted surfaces to the new helper.

## Readiness

- V02 is close, but it is not ready to turn into a TODO list until the `.input-field` instruction is clarified.
- After that adjustment, the plan is concrete enough for an AI coding agent to implement.
