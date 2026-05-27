---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Staged Default Meditation in Create Form (V07)

## Changes from V06

V07 addresses the concern raised in `20260520_PLAN_DEFAULT_EDITABLE_MEDITATION_V06_ASSESSMENT_CODEX.md`. Validated against current code:

V06's access-control section, labeled "carried from V02", dropped the explicit listing-filter rule from V02. Verification step 2 only checked the anonymous branch. The current `/meditations/all` handler ([api/src/routes/meditations.ts:171-211](api/src/routes/meditations.ts:171)) actually branches three ways on auth state, and every branch needs the stage filter:

```ts
const where = req.user?.isAdmin
  ? {}                                                       // (1) admin: every row
  : req.user
    ? { [Op.or]: [{ visibility: "public", status: "complete" },
                  { userId: req.user.id }] }                 // (2) authed: public + own
    : { visibility: "public", status: "complete" };          // (3) anon: public + complete
```

Without an explicit `stage = 'library'` clause on each branch:

- The **authenticated** branch returns the user's own staged row in their library list (the user's `userId` clause has no stage check). This directly defeats the feature.
- The **admin** branch returns the template and every staged row mixed into the user-facing listing, even though admins have a separate `/admin/meditations` endpoint for that visibility.
- The **anonymous** branch surfaces the template, which is intentionally seeded with `visibility='public'` and reaches `status='complete'` — V06 step 2 ("template absent for anonymous visitors") would silently fail.

V07 restores the explicit listing filter and breaks the verification into per-branch checks. Everything else from V06 (unified staged service, partial unique indexes, ID-route access helper, admin guards, template seeding, route ordering) carries forward unchanged.

## Context

The current Create Meditation form (`web/src/components/forms/CreateMeditationForm.tsx` + `ScriptMeditationEditor.tsx`) starts empty. Users hitting the page for the first time don't realize they need to type their own meditation text, and have no way to hear what a meditation sounds like before committing.

The goal is to give users a working starter meditation they can immediately play, edit, regenerate, and only commit to their library when they're ready. The design must:

1. Pre-populate the form with a shared default meditation (same content for every user).
2. Add a Play button that plays the current meditation audio (default or user-edited).
3. Show a Generate button only after the user has actually edited the content.
4. Hold the user's in-progress ("staged") meditation in the DB without polluting the library listing, until they explicitly save it.

Both spreadsheet mode and script mode must support this flow against the same backing content.

## Design summary

### Data model: one new column on Meditation

Add a `stage` enum column to the `meditations` table:

| Value | Meaning | Cardinality |
| --- | --- | --- |
| `template` | The global shared default meditation. Audio is seeded once. Owned by the benevolent system user. | Exactly one row globally. |
| `staged` | A user's in-progress meditation in the Create form. | At most one per user. |
| `library` | A normal meditation that appears in listings. | Many per user. Default for all existing rows. |

All existing meditations get backfilled to `stage = 'library'`. Add a `MeditationStage` type alias to `shared-types/src/meditation.ts`.

### Cardinality enforcement (carried from V02)

Two partial unique indexes:

- `CREATE UNIQUE INDEX meditations_one_template ON meditations ((stage)) WHERE stage = 'template';`
- `CREATE UNIQUE INDEX meditations_one_staged_per_user ON meditations (user_id) WHERE stage = 'staged';`

### Extend `createMeditationFromElements` to accept `stage` (carried from V05)

Add optional `stage?: MeditationStage` (defaults to `"library"`). Two-line change; existing callers omit the field and stay on the default.

### Unified staged service (carried from V06)

`createOrRegenerateStagedMeditation(opts)` handles both first-time creation and subsequent regeneration in one transaction, always applying the user's submitted payload. The template is never copied into a staged row. See V06 for the full algorithm — V07 does not change this section.

### `GET /meditations/staging` (carried from V06)

Returns the caller's `stage='staged'` row if it exists, else the global `stage='template'` row. Never creates anything.

### Library listing filter (restored explicit rule in V07)

Every server-side query that backs the user-facing meditation library must include `stage = 'library'` in its `where` clause, on **every auth-state branch**. Concretely, in `api/src/routes/meditations.ts:171-211`, the three-way `where` becomes:

```ts
const stageClause = { stage: "library" };
const where = req.user?.isAdmin
  ? stageClause                                                // (1) admin
  : req.user
    ? {
        ...stageClause,
        [Op.or]: [
          { visibility: "public", status: "complete" },
          { userId: req.user.id },
        ],
      }                                                        // (2) authed
    : { ...stageClause, visibility: "public", status: "complete" }; // (3) anon
```

Notes:

- **Admins do not see template or staged rows on `/meditations/all`.** Admins needing full-stage visibility use `/admin/meditations` (which intentionally returns every row, carried from V04). The user-facing `/all` endpoint shows only the library so admins testing the user experience see what users see.
- **Authenticated users do not see their own staged row on `/meditations/all`.** The user's own staged row is only reachable via `GET /meditations/staging` and via direct `GET /:id` as owner. It is invisible from the library list.
- **Anonymous visitors do not see the template on `/meditations/all`.** The template is reachable only via `GET /meditations/staging` (which any caller may hit) and `GET /:id`/stream as a readable-by-any-caller route.

Any future query that backs a "library" surface (e.g. user profile pages, search, favorites listings) must include the same `stage = 'library'` clause. The grep target for code review is `Meditation.findAll` and `Meditation.findOne` outside the staging service, the seed script, the admin router, and `GET /meditations/staging` itself.

`POST /meditations/favorite/:id/:bool` already runs through `assertMeditationAccess` (rejected unless `stage='library'`), so favoriting cannot create dangling references to staged or template rows.

### Stage-aware access control on ID-based user-facing routes (carried from V02)

`assertMeditationAccess(meditation, requester, intent)` gates every ID-based route:

- `GET /:id`, `/:id/stream`, `/:id/stream-token`: staged → owner-only (404 otherwise); template → readable by any caller; library → today's visibility rule.
- `PATCH /update/:id`, `PUT /:id/script`, `DELETE /:id`, `POST /favorite/:id/:bool`: reject anything other than `stage='library'`.
- Staged rows are force-set to `visibility='private'` on creation.

### Stage-aware access control on admin routes (carried from V04)

`assertAdminMeditationMutable` rejects template mutation through `DELETE /admin/meditations/:id`, `DELETE /admin/queuer/:id`, and `POST /admin/meditations/:id/requeue` with `409 PROTECTED_TEMPLATE`. `DELETE /admin/users/:id` rejects with `409 PROTECTED_USER` if the target owns a template row. Staged rows pass through admin paths normally.

`GET /admin/meditations` and `GET /admin/queuer` return every row including template and staged — admins need full visibility through admin endpoints, just not through the user-facing `/meditations/all`.

### Route registration order (carried from V03)

All `/staging*` routes declared above `/:id` in `api/src/routes/meditations.ts`.

### Template ownership and seed content (carried from V04/V05)

Template owner is the benevolent system user (`benevolent.system@golightly.local`). `getOrCreateBenevolentUser` is extracted from `api/src/routes/admin.ts:10-25` into `api/src/services/users/getOrCreateBenevolentUser.ts`. `DELETE /admin/users/:id` blocks deleting that user while the template exists.

Seed script content:

```
Welcome. Close your eyes.
<break time="2s" />
[Tibetan Singing Bowl]
```

The seed script calls `parseMeditationScript` directly and passes the parser output as `elements:` to `createMeditationFromElements` with `stage: "template"`. See V05 for the full algorithm.

### Frontend flow (unchanged from V02)

Load (`GET /meditations/staging`) → dirty-check vs initial → Generate (only when dirty, calls unified service) → poll → Play. Save-to-Library only when `stage='staged' && status='complete' && !isDirty`.

## Critical files

Read-only references:

- `api/src/routes/meditations.ts:171-211` — `/meditations/all` handler; the three-way `where` clause needs the stage clause added on every branch.
- `api/src/routes/admin.ts:90-97` — `GET /admin/meditations`; does **not** get the stage filter, intentionally.
- `api/src/routes/admin.ts:108-129` — `GET /admin/queuer`; same, intentionally.
- Rest of the read-only references carry from V06.

Files that will need new code (unchanged from V06): migration, `MeditationStage` type alias, extended `createMeditationFromElements`, extracted `getOrCreateBenevolentUser`, `assertMeditationAccess`, `assertAdminMeditationMutable`, `createOrRegenerateStagedMeditation`, `saveStagedToLibrary`, seed script.

## Verification

Functional (carried):

1. Run the seed script in a fresh environment. Exactly one `stage='template'` row, `status='complete'`, real audio file. Run again — exits 0, no duplicate.
2. Fresh authenticated user opens Create form: `GET /meditations/staging` returns the template; Play works.
3. Edit → Generate → poll → Play matches user's edits.
4. Reopen the form in a new tab — `GET /meditations/staging` returns the user's staged row.
5. Spreadsheet ↔ script mid-edit preserves content.
6. Save to Library → row appears in library; reopening Create form returns the template.

Library listing filter (per-branch, expanded in V07):

7. **Anonymous** `GET /meditations/all` returns no row where `stage != 'library'`. Specifically: template row absent even though it is `visibility='public'` and `status='complete'`.
8. **Authenticated user with an existing staged row** calls `GET /meditations/all`. Response contains the user's library rows and other users' public+complete library rows; the caller's own staged row is **absent**. Template absent.
9. **Other authenticated user** (without a staged row) hits `GET /meditations/all`. Sees public+complete library rows from everyone. Template absent. No other user's staged row appears.
10. **Admin** hits `GET /meditations/all`. Returns every library row but no template and no staged rows.
11. **Admin** hits `GET /admin/meditations`. Returns every row including template and staged (regression check that the admin endpoint is intentionally unfiltered).
12. After step 6 (Save to Library), the newly-promoted row appears in the caller's authenticated `/meditations/all` response, confirming the stage flip enables the row in the library.

First-Generate correctness (carried from V06):

13. A fresh user (no staged row) clicks Generate after editing the template content. Result: exactly one new `stage='staged'` row, `visibility='private'`, `status='pending'`, `meditation_array` reflects the user's edited payload — not the template's. Worker notified once. No 409.
14. After step 13 completes processing, Play returns audio matching the user's edits.

Subsequent-Generate correctness (carried):

15. Existing `complete` staged row: Generate after further edits takes the regenerate branch. Row updated in place; old audio deleted post-commit; worker notified once.
16. Double-click Generate on `complete` staged row — second request returns `409 MEDITATION_BUSY`.
17. While staged regeneration is `processing`, additional Generate requests return 409.

Concurrent first-Generate (carried):

18. Two tabs of the same fresh user click Generate simultaneously. Exactly one `stage='staged'` row exists. One request returns 201; the other either returns 201 (worker was already done) or 409 (worker still running). No duplicate row.

Seed shape (carried from V05):

19. Template `script_source` matches the literal starter byte-for-byte.
20. Template `meditation_array` is exactly three persisted elements:
    ```
    { id: 1, text: "Welcome. Close your eyes.", sequence: 1 }
    { id: 2, pause_duration: "2",               sequence: 2 }
    { id: 3, sound_file: <filename>,            sequence: 3 }
    ```
21. Template `JobQueue` rows have `type` values `text`, `pause`, `sound` in sequence order.
22. Template `user_id` is the benevolent system user.
23. Seed run with missing `Tibetan Singing Bowl` SoundFile aborts cleanly without creating a row.
24. `createMeditationFromElements` without `stage` produces `stage='library'`.
25. `createMeditationFromElements` with `stage: "staged"` (unified service create branch) produces `stage='staged'`.

ID-route access control (carried):

26. User B `GET /meditations/:id` on user A's staged row → 404.
27. User B `GET /meditations/:id/stream` on user A's staged row → 404.
28. Owner `PATCH`, `PUT /:id/script`, `DELETE`, `POST /favorite` against own staged row → 409/404.
29. Freshly generated staged row has `visibility='private'`.

Admin route access control (carried):

30. `DELETE /admin/meditations/:id` against template → 409 `PROTECTED_TEMPLATE`.
31. `DELETE /admin/queuer/:id` against a template job → 409 `PROTECTED_TEMPLATE`.
32. `POST /admin/meditations/:id/requeue` on template → 409 `PROTECTED_TEMPLATE`.
33. `DELETE /admin/meditations/:id` on a user's staged row → succeeds, audio cleaned up.
34. `POST /admin/meditations/:id/requeue` on a user's stuck staged row → succeeds.
35. `DELETE /admin/users/:id` against benevolent system user while template exists → 409 `PROTECTED_USER`.

Cardinality (carried):

36. Hand-insert a second `stage='template'` row → DB rejects.
37. Hand-insert a second `stage='staged'` row for the same user → DB rejects.

Route ordering (carried):

38. `GET /meditations/staging`, `POST /meditations/staging/generate`, `POST /meditations/staging/save-to-library` reach their dedicated handlers, not the `:id` handler.
