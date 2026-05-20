---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Staged Default Meditation in Create Form (V04)

## Changes from V03

V04 addresses two concerns raised in `20260520_PLAN_DEFAULT_EDITABLE_MEDITATION_V03_ASSESSMENT_CODEX.md`. Both were validated against current code before incorporating:

1. **Template ownership and seed content were underspecified.** `meditations.user_id` is `allowNull: false` ([db-models/src/models/Meditation.ts:41](db-models/src/models/Meditation.ts:41)) and `createMeditationFromElements` requires a `userId`, so the seed script cannot insert a template row without choosing an owner. V03 said "a curated `meditation_array`" without pinning the owner or the content. V04 reuses the existing benevolent system user as the template owner and pins the exact starter script.
2. **Admin routes were not stage-aware.** [DELETE /admin/meditations/:id](api/src/routes/admin.ts:99), [DELETE /admin/queuer/:id](api/src/routes/admin.ts:131), and [POST /admin/meditations/:id/requeue](api/src/routes/admin.ts:145) all operate on any meditation ID with no stage check. An admin (or an admin script) could delete the global template — breaking the Create form for every new user until reseeded — or requeue/cascade-delete a user's staged row outside the staged workflow. V04 extends the stage-aware access policy to the admin router.

Everything else (data model, partial unique indexes, route ordering, staged regeneration service, frontend flow) carries forward from V03 unchanged.

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

All existing meditations get backfilled to `stage = 'library'`.

### Cardinality enforcement (carried from V02)

Two partial unique indexes in the migration:

- `CREATE UNIQUE INDEX meditations_one_template ON meditations ((stage)) WHERE stage = 'template';`
- `CREATE UNIQUE INDEX meditations_one_staged_per_user ON meditations (user_id) WHERE stage = 'staged';`

`getOrCreateStagedMeditation(userId)` runs in a transaction with `SELECT … FOR UPDATE`. On `unique_violation` it catches, reloads, and returns the winner.

### Template ownership (new in V04)

The template row's `user_id` is the existing **benevolent system user** (email `benevolent.system@golightly.local`). This user already exists for the "preserve public meditations after user deletion" admin flow ([api/src/routes/admin.ts:10-25](api/src/routes/admin.ts:10)). Reusing it avoids inventing a parallel system-user pattern.

Refactor: extract `getOrCreateBenevolentUser` from `api/src/routes/admin.ts` into a shared service at `api/src/services/users/getOrCreateBenevolentUser.ts`. The admin router imports it from the new location; the seed script imports the same helper. The function body and email value are unchanged.

Additional protection: the benevolent system user must not be user-deletable through any admin flow while a `stage='template'` row exists. Add an early-return guard in `DELETE /admin/users/:id` ([api/src/routes/admin.ts:57](api/src/routes/admin.ts:57)) that rejects with `409 PROTECTED_USER` if the target user owns any `stage='template'` row. (The user is already a non-admin sentinel email and won't normally be a delete target, but the guard makes the invariant explicit.)

### Template seed content (new in V04)

The seed script creates the template row with exactly this script:

```
Welcome. Close your eyes.
<break time="2s" />
[Tibetan Singing Bowl]
```

Parsed into `meditation_array` form, this is three elements:

1. `{ type: "text", text: "Welcome. Close your eyes.", sequence: 1 }`
2. `{ type: "pause", durationSeconds: 2, sequence: 2 }`
3. `{ type: "sound", soundFilename: <resolved by SoundFile lookup for "Tibetan Singing Bowl">, sequence: 3 }`

The seed script:

1. Calls `getOrCreateBenevolentUser()` to obtain the owner.
2. Runs the existing script parser against the literal starter text. If parsing fails (e.g. the parser changes or the literal becomes malformed), the script aborts with a clear error and exit code — do not insert a partial row.
3. Asserts the SoundFile lookup resolves `Tibetan Singing Bowl` to a real prerecorded sound. Aborts with a clear error if the sound is missing — this guarantees seeding fails loudly in environments where prerecorded audio hasn't been loaded yet.
4. Calls `createMeditationFromElements({ userId: benevolentUserId, title: "Default starter meditation", description: "Starter meditation for the Create form", visibility: "public", sourceMode: "script", scriptSource: <literal>, meditationArray: <parsed>, stage: "template" })`.
5. Waits for the worker to finish (polls Meditation by ID until `status='complete'` or `'failed'`; on `'failed'`, aborts with the captured `lastError`).
6. Exits 0.

Idempotency: the constraint-backed find-or-create from V02 still applies. A second seed run hits the `meditations_one_template` unique index, catches the conflict, and exits 0 without touching the existing row.

### Stage-aware access control on user-facing routes (carried from V02)

A single helper `assertMeditationAccess(meditation, requester, intent)` gates every ID-based meditation route in `api/src/routes/meditations.ts`. Summary:

- `GET /:id`, `/:id/stream`, `/:id/stream-token`: staged → owner-only (404 otherwise); template → readable by any caller; library → today's visibility rule.
- `PATCH /update/:id`, `PUT /:id/script`, `DELETE /:id`, `POST /favorite/:id/:bool`: reject anything other than `stage='library'`.
- Staged rows are force-set to `visibility='private'` on creation.

### Stage-aware access control on admin routes (new in V04)

Add stage guards to the admin router (`api/src/routes/admin.ts`):

| Admin route | Behavior on `stage='template'` | Behavior on `stage='staged'` |
| --- | --- | --- |
| `DELETE /admin/meditations/:id` | **Reject** with `409 PROTECTED_TEMPLATE` — the template is recreated only by the seed script. | Allow. Routes through existing `deleteMeditationCascade` so audio is cleaned up. The user's next Create form load shows the template again. |
| `DELETE /admin/queuer/:id` | **Reject** with `409 PROTECTED_TEMPLATE` if the resolved meditation is the template. | Allow (same cascade as above). |
| `POST /admin/meditations/:id/requeue` | **Reject** with `409 PROTECTED_TEMPLATE` — template regeneration only happens via the seed script. | Allow — requeue is a recovery path for stuck jobs and should remain available for staged rows that get wedged. |
| `GET /admin/meditations` | No change — admin listing returns every row, including template and staged. (Admins explicitly need to see all rows for operations.) |
| `GET /admin/queuer` | No change. |
| `DELETE /admin/users/:id` | **Reject** with `409 PROTECTED_USER` when the target owns any `stage='template'` row (i.e. the benevolent system user, while the template exists). |

Implementation: add a small helper `assertAdminMeditationMutable(meditation, intent)` next to `assertMeditationAccess`, called at the top of each admin mutate route. The guard reads `meditation.stage` and throws `AppError(409, "PROTECTED_TEMPLATE", …)` when appropriate.

### Route registration order (carried from V03)

In `api/src/routes/meditations.ts`, all `/staging*` routes must be declared above the `/:id` family. See V03 for the exact ordering table.

### Staged regeneration service (carried from V03)

`regenerateStagedMeditation` mirrors the lock-and-replace pattern of `regenerateMeditationFromScript`. Accepts both spreadsheet and script payloads. The endpoint `POST /meditations/staging/generate` resolves the staged row via `getOrCreateStagedMeditation`, then calls `regenerateStagedMeditation`. Two locks: one for cardinality races, one for content-replacement races.

### New owner-only endpoints (carried from V02)

- `GET /meditations/staging` — returns the caller's staged row, or the template if none.
- `POST /meditations/staging/generate` — wrapper around get-or-create + regenerate.
- `POST /meditations/staging/save-to-library` — flips `stage` from `staged` to `library`, sets title/description/visibility.

### Frontend flow (unchanged from V02)

Load → dirty-check → Generate (only when dirty) → poll → Play. Save-to-library only when staged + complete + clean. On `409 MEDITATION_BUSY` or `409 PROTECTED_TEMPLATE` the form surfaces a clear message without retrying.

## Critical files

Read-only references (existing patterns to reuse):

- `db-models/src/models/Meditation.ts:39-43` — `userId` is non-null; template owner must be a real user row.
- `api/src/routes/admin.ts:10-25` — existing `getOrCreateBenevolentUser` helper to extract.
- `api/src/routes/admin.ts:57-88` — delete-user flow; needs a new template-owner guard.
- `api/src/routes/admin.ts:99-174` — meditation/queuer/requeue admin routes; each needs an `assertAdminMeditationMutable` call.
- `api/src/routes/meditations.ts:213` — `GET /:id`; new staging routes go above this.
- `api/src/services/meditations/regenerateMeditationFromScript.ts:7-86` — exact lock-and-replace pattern to mirror.
- `api/src/services/meditations/createMeditationFromElements.ts` — `replaceMeditationElements` is the in-transaction job-replacement helper.

Files that will need new code:

- New migration: `stage` column, backfill, two partial unique indexes.
- New service `api/src/services/users/getOrCreateBenevolentUser.ts` — extracted from admin router.
- New helper `api/src/services/meditations/assertMeditationAccess.ts` — user-facing route gating.
- New helper `api/src/services/meditations/assertAdminMeditationMutable.ts` — admin route gating.
- New service `api/src/services/meditations/getOrCreateStagedMeditation.ts`.
- New service `api/src/services/meditations/regenerateStagedMeditation.ts`.
- New service `api/src/services/meditations/saveStagedToLibrary.ts`.
- New script `scripts/seedDefaultMeditation.ts`.

## Verification

Functional (carried):

1. Run the seed script in a fresh environment. Confirm exactly one `stage='template'` row with `status='complete'` and a real audio file. Run again — no duplicate.
2. Anonymous visitor: `/meditations/all` — template row absent.
3. Fresh authenticated user: Create form pre-populates from the template. Play works.
4. Edit a row → Generate appears → click → poll → audio updates.
5. Re-open the form in a new tab — user's staged content persists.
6. Switch between spreadsheet and script mid-edit — content stays consistent.
7. Save to Library → modal collects title/description/visibility → row appears in library, no longer in staging.
8. Open Create form again — back to the template.
9. As another user, step-7's saved meditation does not appear in *their* staging area.

Template ownership and content (new in V04):

10. After seeding, the template row's `user_id` equals the benevolent system user's id (email `benevolent.system@golightly.local`).
11. The template's `script_source` matches the literal starter script byte-for-byte.
12. The template's `meditation_array` parses to exactly three elements: text "Welcome. Close your eyes.", a 2-second pause, and a sound element resolving to the `Tibetan Singing Bowl` SoundFile row.
13. Run the seed script in an environment where the `Tibetan Singing Bowl` SoundFile row is absent — seed aborts with a clear error and creates no row.

Access control on user-facing routes (carried):

14. As user B, `GET /meditations/:id` on user A's staged row — 404.
15. As user B, `GET /meditations/:id/stream` on user A's staged row — 404.
16. As the owner, `PATCH`, `PUT /:id/script`, `DELETE`, `POST /favorite` against own staged row — all 409/404.
17. Inspect a freshly generated staged row — `visibility = 'private'`.

Access control on admin routes (new in V04):

18. As an admin, `DELETE /admin/meditations/:id` against the template row — 409 `PROTECTED_TEMPLATE`. Template still exists.
19. As an admin, `DELETE /admin/queuer/:id` against any queue row belonging to the template — 409 `PROTECTED_TEMPLATE`. Template and its jobs still exist.
20. As an admin, `POST /admin/meditations/:id/requeue` on the template — 409 `PROTECTED_TEMPLATE`.
21. As an admin, `DELETE /admin/meditations/:id` on a user's staged row — succeeds. The audio file is removed (cascade). The user's next Create form load shows the template.
22. As an admin, `POST /admin/meditations/:id/requeue` on a user's stuck staged row — succeeds and the worker reprocesses normally.
23. As an admin, attempt `DELETE /admin/users/:id` against the benevolent system user while the template exists — 409 `PROTECTED_USER`. Template still exists.
24. `GET /admin/meditations` and `GET /admin/queuer` continue to return every row including template and staged (admins need full visibility).

Concurrency (carried):

25. Two tabs as the same fresh user click Generate simultaneously — exactly one staged row exists afterward.
26. Hand-insert a second `stage='template'` row — DB rejects.
27. Hand-insert a second `stage='staged'` row for the same user — DB rejects.

Route ordering (carried):

28. `GET /meditations/staging`, `POST /meditations/staging/generate`, `POST /meditations/staging/save-to-library` all reach their dedicated handlers and never hit the `:id` handler with `id="staging"`.

Staged regeneration concurrency (carried):

29. Double-click Generate on an existing staged row that is `complete` — second request returns `409 MEDITATION_BUSY`. Final DB state shows one set of JobQueue rows, one new audio file, no orphaned old audio.
30. While a staged regeneration is `processing`, an additional Generate request returns 409 without modifying the row.
