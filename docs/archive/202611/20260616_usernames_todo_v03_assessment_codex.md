---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# PRD1 Usernames TODO V03 Assessment — Codex

Qualifying concern remains before implementation:

1. **Non-router user creation paths are still not explicit implementation work.** TODO V03 adds validation/test bullets for `api/src/startup/onStartUp.ts` and `db-models/scripts/smoke.ts`, but Phase 2B only directs username allocation for `POST /users/register` and `POST /users/google-auth`. In the actual repo, admin bootstrap and the db-models smoke script also call `User.create`; once `User.username` is required, those paths can fail boot/smoke/typecheck or collide with existing derived usernames. Add explicit implementation tasks to update every `User.create`/user-provisioning call site, including `onStartUp.ts` and `smoke.ts`, to provide a valid unique username via the same canonical allocation helper where applicable (or an equivalent deterministic script-safe value for smoke), and include a final search/validation step confirming no required-username creation path was missed.
