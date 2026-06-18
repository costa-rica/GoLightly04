---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# PRD1 Usernames TODO V01 Assessment — Codex

Qualifying concerns remain before implementation:

1. **Username canonical rules do not match accepted V09.** TODO V01 specifies generated/editable usernames as `[a-z0-9_]`, 1–30 chars, and generated names that are prefixed if they start with a digit. V09 resolves lowercase `[a-z0-9._-]`, 3–30 chars, digits allowed at the start, trim/lowercase on PATCH, and deterministic padding for too-short bases. Update migration, runtime helper, PATCH validation, client validation, and tests to the V09 rules.

2. **Collision suffix numbering conflicts with V09/source PRD.** TODO V01 expects `nick`, `nick1`, `nick2`; V09/source PRD describe `nick`, `nick2`, `nick3` after the unsuffixed winner. Pick the accepted V09/source convention and make migration/runtime allocation/tests consistent, including cross-base collisions such as an existing `nick2`.

3. **Migration format/runner is inconsistent with the repo.** TODO V01 asks for `db-models/migrations/<timestamp>-add-username-to-users.js`/`.ts`, `queryInterface.sequelize.query(...)`, and rollout via `sequelize-cli`, but the repo currently has plain `.sql` migrations only and no visible sequelize-cli/umzug migration runner configuration. Align the TODO to the repo’s actual SQL migration mechanism or add explicit runner/configuration work before implementation.

4. **Migration SQL details diverge from V09 idempotence/locking requirements.** V09 calls for `ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT` and `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS users_username_lower_idx ON users (lower(username))`. TODO V01 uses `VARCHAR(30)` without `IF NOT EXISTS` and a non-concurrent index. Update this or explicitly justify the deviation for the maintenance-window rollout.

5. **Runtime allocation retry caps are smaller/ambiguous versus V09.** TODO V01 sets `allocateUsername` cap 200 and creation retry cap 10, while V09 says suffix allocation should have no small fixed cap and creation retry should use a documented high operational cap. Also clarify how retries advance suffixes after a database `UniqueConstraintError` so they do not recompute the same candidate.

6. **Meditation eager-load instructions omit V09’s LEFT JOIN requirement.** V09 specifies `include: [{ model: User, attributes: ["id", "username"], required: false }]` for list and single-meditation queries. TODO V01 omits `required: false` and uses only `username`. Add `required: false` to avoid dropping meditations without a linked/eager-loaded user and match accepted serialization behavior.

7. **Validation commands include non-existent or wrong package names.** `db-models/package.json` has no `npm test` script, but TODO V01 requires `cd db-models && npm test`. The repo workspace is `worker-node`, but TODO V01 refers to `worker`. Replace these with actual available commands or add the missing test/build scripts as explicit implementation tasks.

8. **Registration smoke expectation is unsupported by the planned/shared response shape.** TODO V01 Phase 5C expects local registration responses to contain `username`, but current `RegisterResponse` is `{ message, userId }` and TODO V01 does not add a `user` or `username` field to that response. Either add an explicit response/type/API-client change for registration, or change the smoke test to verify the assigned username through a supported endpoint or database check.
