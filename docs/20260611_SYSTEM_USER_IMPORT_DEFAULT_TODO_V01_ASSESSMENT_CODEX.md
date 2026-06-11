---
created_at: 2026-06-11
updated_at: 2026-06-11
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# System User Import Default TODO V01 Assessment

Assessment target: `docs/20260611_SYSTEM_USER_IMPORT_DEFAULT_TODO_V01.md`

Accepted plan: `docs/20260611_SYSTEM_USER_IMPORT_DEFAULT_PLAN_V02.md`

Result: implementation should not proceed until the TODO is revised.

## Qualifying Concerns

### 1. TODO phase order conflicts with accepted frontend/list-hiding sequence

The accepted plan requires the frontend default-meditation surface to be implemented before hiding default rows from ordinary lists:

- Plan section 6: "Frontend default-meditation surface before list hiding"
- Plan section 6: "Only after the separate default surface works, update `GET /meditations/all` and ordinary list UI assumptions to exclude `isDefault = true` rows."

The implementation TODO currently places list hiding in Phase 2 as TODO 6:

- `TODO 6. Hide defaults from ordinary lists after default endpoint exists`

The frontend default surface is later in Phase 4 as TODO 12:

- `TODO 12. Add frontend default meditation surface`

The user instruction for implementation is to work through `TODO_V01` phase-by-phase in order. Following the TODO literally would hide default meditations from `GET /meditations/all` before the replacement frontend default surface exists. That violates the accepted plan's sequencing and risks a regression where the selected default disappears from the primary user-facing experience.

Recommended TODO revision:

- Move the frontend default-meditation API/client/component work before normal list hiding, or split TODO 6 so backend support can be prepared in Phase 2 but the actual `GET /meditations/all` filtering change is completed only after TODO 12.

### 2. Import overwrite behavior remains under-specified before scripting

The accepted plan requires the HTTP import contract to define overwrite behavior before importer scripting:

- Plan section 9: "`--overwrite` should use the same server-side contract. It should either delete/recreate via existing cascade helpers or update in place, but the chosen behavior must be explicit in the TODO and tests."

The implementation TODO says:

- `Define and implement --overwrite server behavior before importer scripting; prefer delete/recreate only if generated-audio cleanup is safe through existing cascade helpers.`

This does not select a concrete behavior. It leaves the implementer to decide during implementation whether overwrite updates in place or deletes/recreates. That decision affects API shape, tests, generated audio cleanup, queue behavior, importer polling, and whether imported meditation IDs remain stable.

Recommended TODO revision:

- Explicitly choose one overwrite contract before implementation. For example:
  - lookup existing owner-scoped import by provenance;
  - when `--overwrite` is set, call a dedicated server endpoint that deletes the existing meditation through `deleteMeditationCascade()` and creates a new private script meditation with fresh provenance; or
  - update/regenerate the existing meditation in place through a defined endpoint and preserve the meditation ID.
- Add the expected response shape and tests for duplicate skip and overwrite.

## Non-Blocking Observations

- The current repo still has `stage: "template"` fallback in `api/src/routes/meditations.ts`, template mutability protections in meditation/admin services, and active `getOrCreateBenevolentUser()` use in `api/src/routes/admin.ts`. These match the accepted plan's intended implementation scope and are not TODO blockers by themselves.
- The model currently lacks `isDefault` and provenance `metadata`; this also matches the intended implementation scope.
- The root/package validation scripts needed by TODO 17 are discoverable in `package.json` and package-level `package.json` files.

