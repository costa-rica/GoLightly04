---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# Codex Assessment — PRD1 Usernames Plan V08

Qualifying concerns found:

1. **The migration/deploy ordering still leaves a write-breaking window for current account creation code.**
   - V08 says the full migration, including `ALTER COLUMN username SET NOT NULL`, must run before application code that references `username` is deployed. In the actual repo, the current `POST /users/register` and new-user `POST /users/google-auth` paths call `User.create` without `username`; after the full migration completes but before the new API is live, those inserts will fail the `NOT NULL` constraint. Deploying the new model before the column exists is also unsafe because current `User.findOne`/`mapUser` flows select/model the new field.
   - Action: define a safe rollout explicitly: either schedule a write-downtime/maintenance window covering the full migration plus API deployment, or split into expand/contract steps (`ADD COLUMN` nullable + unique index/backfill-compatible code deployed first; new code writes usernames; then backfill remaining nulls and set `NOT NULL` after all running API instances are updated). Ensure registration and Google-auth are verified during the rollout boundary.
