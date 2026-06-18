---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# Codex Assessment — PRD1 Usernames Plan V05

Qualifying concerns found:

1. **Backfill/creation suffixing is artificially capped and can still fail the PRD's uniqueness requirement.**
   - V05 limits collision handling to `_2` … `_99`, while PRD1 requires deterministic unique usernames for every existing row and new account. A real table with 100+ users whose email local parts normalize to the same base would leave the migration unable to produce unique non-null usernames before adding `NOT NULL`/`lower(username)` uniqueness.
   - Action: remove the fixed suffix cap. Use a deterministic SQL window-number backfill that can assign an unbounded suffix while truncating the base to keep the final value ≤30 characters, and make the account-creation retry helper continue until it finds/commits an available suffix or fails with an explicit operational error after a documented high retry limit.

2. **Default username derivation does not satisfy V05's own validation rules for common email local parts.**
   - V05 changes validation to alphanumeric/underscore only, 3–30 chars, and "must not start with a digit," but its backfill/default derivation only lowercases, replaces non-alphanumerics with underscores, and truncates. Email locals such as `a@...`, `12nick@...`, or punctuation-only locals can create stored usernames that the profile PATCH endpoint and client-side validation would later reject, violating the intended single username contract.
   - Action: either align validation with the PRD's proposed `[a-z0-9._-]` lowercase 3–30 rule (no start-digit ban), or make the shared derivation helper enforce the exact same canonical rules used by PATCH, including fallback/prefix behavior for empty, too-short, or digit-leading bases, before both migration backfill and registration/Google create paths use it.

3. **Invalid-username status code conflicts with PRD1 and repository validation conventions.**
   - PRD1 specifies invalid username format as `AppError(400, "VALIDATION_ERROR", ...)`, and the current `api/src/middleware/validate.ts` / route handlers consistently use 400 for validation errors. V05's test plan expects `PATCH /users/me/username` invalid format to return `422`, which would cause implementation/tests to diverge from the existing API error contract.
   - Action: keep invalid username responses/tests at 400 with `VALIDATION_ERROR` unless the API-wide validation status convention is deliberately re-baselined.
