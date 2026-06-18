---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# Codex Assessment — PRD1 Usernames Plan V07

Qualifying concerns found:

1. **The proposed backfill window strategy can still produce duplicate usernames across different normalized bases.**
   - V07 partitions by `lower(base)` and appends `2`, `3`, etc. only within each base group, but that does not reserve generated suffix names against other users whose actual base already equals the suffixed candidate. Example: rows normalizing to `nick`, `nick`, and `nick2` would produce both `nick2` for the second `nick` row and `nick2` for the `nick2` row, so the uniqueness proof/index can fail on valid existing data.
   - Action: replace the simple per-base window-number algorithm with an allocation algorithm that checks every candidate against the full set of already assigned normalized usernames, including cross-base suffix collisions. A recursive CTE, migration script, or deterministic ordered loop is acceptable as long as it keeps the ≤30-character cap and can prove zero `lower(username)` duplicates before `NOT NULL`/unique index creation.

2. **Runtime account creation cannot rely on `user{id}` padding/fallback before the user row exists.**
   - V07 says migration derivation falls back to `user{id}` and pads too-short bases with the user id, while runtime registration/Google creation must create the row with a non-null username inside the same `User.create` retry boundary. In the current create paths, the auto-increment `id` is not known until after insert, so implementing the stated `user{id}`/id-padding rule literally would either be impossible or require a two-step nullable insert that conflicts with the post-migration `NOT NULL` model.
   - Action: define separate deterministic creation-safe fallback/padding seeds that do not require the database id before insert (for example a fixed `user`/base-padding sequence plus database unique-index retry), while allowing the migration path to use existing ids if desired. Keep both paths canonical with the same validation/length/collision rules, but do not require pre-insert knowledge of `id`.
