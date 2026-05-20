---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Assessment: Staged Default Meditation in Create Form V06

1. User-facing library listing filter is no longer explicit

   - Risk: V06 keeps the stage-aware policy focused on ID-based routes and admin routes, but it does not explicitly require `/meditations/all` to filter to `stage = 'library'`. The current `/meditations/all` query returns authenticated users' own meditations regardless of status/visibility, and admins currently get every meditation row.
   - Why this materially matters: The feature's core promise is that template and staged rows do not pollute the meditation library. Without an explicit `stage='library'` filter on `/meditations/all`, a user's staged meditation can appear in their library listing as soon as it exists, and an admin using the user-facing list could see template/staged rows mixed with normal library meditations. That is a direct regression against the staged workflow and can expose draft content in the wrong UI.
   - Relevant plan sections: lines 26-31 state staged meditations must stay out of the library listing; lines 130-175 define access control but only for ID-based routes; lines 224-230 verify the functional flow but only checks anonymous `/meditations/all`, not authenticated owner/admin listing behavior.
   - Mitigation: Add an explicit server-side rule that `/meditations/all` and any non-admin owner/library query always include `stage = 'library'`, including the authenticated user's own rows. If the admin UI needs all stages, keep that behavior isolated to `/admin/meditations`. Add tests for anonymous, authenticated owner, other authenticated user, and admin calls to `/meditations/all` proving template and staged rows are absent.
