---
created_at: 2026-05-17
updated_at: 2026-05-17
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Plan v02 assessment: edit meditations

The v02 plan is much stronger than the original. It incorporates the locked regenerate flow, the pending/processing UI state, the worker voice-key fix, and the sound lookup cleanup.

There is one substantial flaw to fix before implementation.

## 1. Apply the complete-only rule to `GET /:id`, not only `GET /all`

The plan says:

1. Owners see their own in-flight meditations.
2. Non-owners do not see in-flight meditations until `status="complete"`.

The proposed `GET /all` filter enforces that for list views, but `GET /:id` keeps current behavior. Current access logic allows any public meditation through `canAccessMeditation`, regardless of status. That means a non-owner with a direct id can still fetch a public `pending` or `processing` meditation, including its title, description, `meditationArray`, and serialized `scriptSource`.

That is not just a UI issue. It contradicts the visibility rule and can expose an in-progress meditation before generation has succeeded.

Recommended API rule:

1. Owners can fetch their own meditations at any status.
2. Admin behavior should be explicit. If admins need operational review, allow admins; otherwise match owner-only for in-flight details.
3. Non-owners can fetch a meditation only when `visibility="public"` and `status="complete"`.
4. Apply this rule to `GET /:id`, `GET /:id/stream-token`, and `GET /:id/stream`.

The stream route already rejects when `filePath` is missing, but it should still share the same status-aware access rule so token issuance and error behavior do not leak that an in-flight public meditation exists.

## Suggested implementation adjustment

Add a status-aware access helper instead of relying only on the current `canAccessMeditation`:

1. `canAccessMeditationDetails(meditation, req)` for `GET /:id`.
2. `canAccessMeditationStream(meditation, req)` for stream-token and stream, or one shared helper if the rules are identical.
3. Tests for direct id access:
   - non-owner public complete succeeds
   - non-owner public pending returns 403 or 404
   - owner public pending succeeds
   - anonymous public pending returns 403 or 404

After this adjustment, the plan looks good and should be implementable without a broader redesign.
