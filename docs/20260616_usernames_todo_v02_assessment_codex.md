---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# PRD1 Usernames TODO V02 Assessment — Codex

Qualifying concern remains before implementation:

1. **Not all existing user-creation paths are covered.** TODO V02 correctly updates public registration and Google new-user creation, but the actual repo also creates users in `api/src/startup/onStartUp.ts` for admin bootstrap and `db-models/scripts/smoke.ts` for the smoke script. Once `User.username` is required in the Sequelize model and database, these paths can fail typecheck/build, boot-time admin provisioning, or smoke validation. Add an explicit task to update every `User.create`/user-provisioning call site to assign usernames through the same canonical allocation helper or an equivalent deterministic path, and include a validation/search step confirming no required-username create path was missed.
