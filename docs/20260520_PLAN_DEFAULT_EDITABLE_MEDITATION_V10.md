---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Staged Default Meditation in Create Form (V10)

## Changes from V09

V10 addresses the concerns raised in `20260520_PLAN_DEFAULT_EDITABLE_MEDITATION_V09_ASSESSMENT_CODEX.md`.

1. Frontend staging state is now owned above both editors. The current app mounts both `CreateMeditationForm` and `ScriptMeditationEditor` inside `CreateMeditationModeSwitcher`, hiding one with `hidden`. V10 requires shared staging state in the mode switcher or a shared hook/context so hidden editors cannot keep stale template or staged snapshots.
2. Save to Library now uses the same concurrency discipline as Generate. `saveStagedToLibrary` must lock the staged row, re-check stage and status inside the transaction, check for active jobs, and only then flip to `library`.

Everything else from V09 carries forward: shared `stage` response mapping, placeholder staged metadata, explicit lock semantics for Generate, shared metadata validation, exact template seed, benevolent owner, partial unique indexes, route ordering, library listing filter, ID-route access control, and admin guards.

## Context

The Create Meditation form currently starts empty. The goal is to give users a starter meditation they can play immediately, edit, regenerate, and save to their library only when they choose.

The shared default meditation is always available and is seeded from this exact script:

```text
Welcome. Close your eyes.
<break time="2s" />
[Tibetan Singing Bowl]
```

The intended flow is:

1. A fresh user opens Create and sees the shared template.
2. Playing before edits streams the template audio.
3. Editing does not create a row yet.
4. Clicking Generate creates exactly one user-owned `staged` row from the submitted edited payload.
5. Further Generate actions update that same staged row in place.
6. Old generated audio for that staged row is deleted after successful regeneration setup.
7. Clicking Save to Library flips the staged row to `library`.
8. The next Create load returns the shared template again.

## Data Model

Add a `stage` enum column to `meditations`.

| Value | Meaning | Cardinality |
| --- | --- | --- |
| `template` | Global shared default meditation, owned by the benevolent system user. | Exactly one globally. |
| `staged` | A user's in-progress Create form meditation. | At most one per user. |
| `library` | Normal meditation that appears in user-facing library listings. | Many per user. |

Migration requirements:

1. Add the enum column with default `library`.
2. Backfill existing rows to `library`.
3. Add a partial unique index for one template:
   ```sql
   CREATE UNIQUE INDEX meditations_one_template
     ON meditations ((stage))
     WHERE stage = 'template';
   ```
4. Add a partial unique index for one staged row per user:
   ```sql
   CREATE UNIQUE INDEX meditations_one_staged_per_user
     ON meditations (user_id)
     WHERE stage = 'staged';
   ```

## Shared Types and API Mapping

Update `shared-types/src/meditation.ts`:

```ts
export type MeditationStage = "template" | "staged" | "library";

export type Meditation = {
  // existing fields
  stage: MeditationStage;
};
```

Update `mapMeditationRecord` in `api/src/routes/meditations.ts` to include:

```ts
stage: meditation.stage ?? "library",
```

Endpoints that return meditation records must use the mapper or otherwise include `stage`:

1. `GET /meditations/staging`
2. `POST /meditations/staging/generate`
3. `POST /meditations/staging/save-to-library`
4. Existing detail/list/update/regenerate responses that return meditation objects

The frontend depends on this field to distinguish template, staged, and library behavior.

## Shared Metadata Validation

Create `api/src/services/meditations/validateMeditationMetadata.ts`.

The helper should accept a title, optional description, and visibility value, then return normalized values:

```ts
{
  title: string;
  description: string | null;
  visibility: "public" | "private";
}
```

Validation rules:

1. Title is required and should use the same rule as existing create flows.
2. Description is optional; blank or whitespace-only description becomes null.
3. Description length must match the current frontend/backend limit if enforced server-side.
4. Visibility must be exactly `public` or `private`.
5. Validation failures throw `AppError(400, "VALIDATION_ERROR", ...)`.

Use this helper in:

1. Existing `POST /meditations/create`.
2. Existing `POST /meditations/create/script`.
3. New `POST /meditations/staging/save-to-library`.

## Creation Pipeline Stage Support

Extend `createMeditationFromElements` with optional `stage?: MeditationStage`.

Behavior:

1. Default omitted `stage` to `library`.
2. Pass `stage` into `Meditation.create`.
3. Existing create routes omit `stage` and remain library rows.
4. The seed script uses `stage: "template"`.
5. The unified staged Generate service creates staged rows with `stage: "staged"`.

## Template Ownership and Seed Script

The template row must have a real `user_id`. Use the benevolent system user:

```text
benevolent.system@golightly.local
```

Implementation requirements:

1. Extract `getOrCreateBenevolentUser` from `api/src/routes/admin.ts` into `api/src/services/users/getOrCreateBenevolentUser.ts`.
2. Import that helper from both the admin router and `scripts/seedDefaultMeditation.ts`.
3. Add a `DELETE /admin/users/:id` guard that returns `409 PROTECTED_USER` if the target user owns any `stage='template'` row.

Seed script requirements:

1. Use the exact starter script shown above.
2. Build a lowercase trimmed SoundFile lookup.
3. Run `parseMeditationScript(STARTER_SCRIPT, lookup)`.
4. Fail before creating anything if `Tibetan Singing Bowl` cannot be resolved.
5. Pass `parseResult.elements` directly as `elements`.
6. Call `createMeditationFromElements` with `stage: "template"`, `sourceMode: "script"`, and `scriptSource: STARTER_SCRIPT`.
7. Notify the worker once and poll until the template reaches `complete` or `failed`.
8. On a second run, catch the template unique constraint, reload the existing template, and exit 0 only if it is already `complete`.

The parser output for the starter script should be:

```ts
[
  { id: 1, text: "Welcome. Close your eyes." },
  { id: 2, pause_duration: "2" },
  { id: 3, sound_file: "<resolved filename>" },
]
```

## Staging Endpoints

Declare all `/meditations/staging*` routes before any `/:id` route in `api/src/routes/meditations.ts`.

Required endpoints:

1. `GET /meditations/staging`
   - Requires auth.
   - Returns the caller's `stage='staged'` row if one exists.
   - Otherwise returns the global `stage='template'` row.
   - Never creates a meditation row.
   - Response includes `meditation.stage`.

2. `POST /meditations/staging/generate`
   - Requires auth.
   - Accepts either script or spreadsheet payload.
   - Calls `createOrRegenerateStagedMeditation`.
   - Returns the staged row with `stage: "staged"`.

3. `POST /meditations/staging/save-to-library`
   - Requires auth.
   - Uses `validateMeditationMetadata`.
   - Calls `saveStagedToLibrary`.
   - Returns the saved row with `stage: "library"`.

## Unified Staged Generate Service

Create `api/src/services/meditations/createOrRegenerateStagedMeditation.ts`.

Input:

```ts
{
  userId: number;
  payload:
    | { mode: "script"; script: string }
    | { mode: "spreadsheet"; elements: MeditationElement[] };
}
```

Algorithm:

1. Outside the transaction, parse or validate the submitted payload.
2. Compute `elementsToPersist` and `scriptSource`.
3. Open a transaction.
4. Attempt to load the caller's existing staged row with `findOne({ where: { userId, stage: "staged" }, transaction, lock: transaction.LOCK.UPDATE })`.
5. The lock applies only if a row is returned. If the result is null, take the create branch. If a row is returned, take the regenerate branch.
6. First-time create branch:
   - Create one row directly from the submitted payload.
   - Set `userId` to the caller.
   - Set `title: "Untitled staged meditation"`.
   - Set `description: null`.
   - Set `stage: "staged"`.
   - Set `visibility: "private"`.
   - Set `status: "pending"`.
   - Set `sourceMode` from the payload mode.
   - Set `scriptSource` to the submitted script for script mode, otherwise null.
   - Set `meditationArray` from `elementsToPersist` with sequence values.
   - Set `filename`, `filePath`, and `durationSeconds` to null.
   - Write JobQueue rows via `replaceMeditationElements`.
7. Regenerate branch:
   - Require status to be `complete` or `failed`.
   - Check for any processing JobQueue row and return `409 MEDITATION_BUSY` if found.
   - Update the same staged row in place with the submitted payload.
   - Preserve `visibility: "private"`.
   - Preserve placeholder title and description until Save to Library.
   - Clear `filename`, `filePath`, and `durationSeconds`.
   - Set `status: "pending"`.
   - Replace JobQueue rows inside the same transaction.
   - Record the previous file path for cleanup.
8. If first-time creation hits the partial unique index because another tab won the race, abort the transaction and retry the full operation once. On retry, the staged row should exist; if it is pending or processing, return `409 MEDITATION_BUSY`.
9. After commit, call `deleteMeditationAudioFiles(meditationId)` only when an existing staged row had previous audio.
10. Notify the worker exactly once after commit.

The template is never copied into a staged row. It only supplies initial form content through `GET /meditations/staging`.

## Save to Library Service

Create `api/src/services/meditations/saveStagedToLibrary.ts`.

Input:

```ts
{
  userId: number;
  metadata: {
    title: unknown;
    description?: unknown;
    visibility: unknown;
  };
}
```

Algorithm:

1. Normalize and validate metadata with `validateMeditationMetadata`.
2. Open a transaction.
3. Load the caller's staged row with `findOne({ where: { userId, stage: "staged" }, transaction, lock: transaction.LOCK.UPDATE })`.
4. If no staged row exists, return 404.
5. After acquiring the lock, re-check `stage === "staged"` and `status === "complete"`.
6. Check `JobQueue` for any row with `status IN ('pending', 'processing')` for this meditation.
7. If work is active, return `409 MEDITATION_BUSY`.
8. Update the row in the same transaction:
   - Set `stage: "library"`.
   - Set normalized `title`.
   - Set normalized `description`.
   - Set normalized `visibility`.
9. Return the mapped meditation record with `stage: "library"`.

Concurrency rule:

1. Save and Generate must not mutate the same staged row at the same time.
2. If Generate has already moved the row to pending/processing, Save returns `409 MEDITATION_BUSY`.
3. If Save wins first and flips the row to library, a concurrent Generate retry must not continue mutating it as staged.

## Library Listing Filter

Every user-facing library query must include `stage = 'library'`.

For `/meditations/all`, update each auth branch:

```ts
const stageClause = { stage: "library" };
const where = req.user?.isAdmin
  ? stageClause
  : req.user
    ? {
        ...stageClause,
        [Op.or]: [
          { visibility: "public", status: "complete" },
          { userId: req.user.id },
        ],
      }
    : { ...stageClause, visibility: "public", status: "complete" };
```

Rules:

1. Anonymous users do not see the template.
2. Authenticated users do not see their staged row in the library list.
3. Admins do not see template or staged rows on `/meditations/all`.
4. Admins continue to see every row through `/admin/meditations`.
5. Future library/search/favorites surfaces must also filter to `stage='library'`.

## Access Control

Create `assertMeditationAccess(meditation, requester, intent)` for user-facing ID routes.

Read intent:

1. `library`: preserve existing visibility behavior.
2. `staged`: owner only; return 404 for everyone else.
3. `template`: readable and streamable by any caller.

Mutation intent:

1. `library`: preserve existing owner/admin rules.
2. `staged`: reject via existing library mutation routes; staged rows mutate only through `/meditations/staging/*`.
3. `template`: reject for all callers through API routes; seed script owns template writes.

Apply this to:

1. `GET /meditations/:id`
2. `GET /meditations/:id/stream-token`
3. `GET /meditations/:id/stream`
4. `PATCH /meditations/update/:id`
5. `PUT /meditations/:id/script`
6. `DELETE /meditations/:id`
7. `POST /meditations/favorite/:id/:bool`

Create `assertAdminMeditationMutable(meditation, intent)` for admin mutation routes.

Admin rules:

1. Reject template delete, queue delete, and requeue with `409 PROTECTED_TEMPLATE`.
2. Allow staged delete through admin routes, using existing cascade cleanup.
3. Allow staged requeue as an admin recovery path.
4. Keep `/admin/meditations` and `/admin/queuer` unfiltered.

## Frontend Flow

`CreateMeditationModeSwitcher` must own the staging lifecycle for both modes, or it must provide a shared hook/context with a single source of truth.

Shared state owned above both editors:

1. Current staging meditation.
2. Current `stage`, `status`, and meditation id.
3. Initial spreadsheet rows.
4. Initial script text.
5. Current spreadsheet draft.
6. Current script draft.
7. Dirty state for both modes.
8. Polling state.
9. Generate, refresh, reset, and save callbacks.

Reason:

1. The current app mounts both `CreateMeditationForm` and `ScriptMeditationEditor` and hides one with `hidden`.
2. If each editor loads staging independently, the hidden editor can keep stale template or staged state.
3. A mode switch after Generate or Save must not expose old controls or overwrite the single staged row with stale template-derived content.

Flow:

1. `CreateMeditationModeSwitcher` loads `GET /meditations/staging` once.
2. It passes shared staging state and callbacks into both editors.
3. Generate from either mode calls the shared Generate callback.
4. After Generate, the shared state refreshes once and both editors receive the new staged row.
5. Save from either mode calls the shared Save callback.
6. After Save, the shared state reloads staging and both editors receive the template.

Controls:

1. Generate appears only when the active mode is dirty.
2. Generate calls `POST /meditations/staging/generate`.
3. During pending/processing, disable Generate and poll.
4. On `409 MEDITATION_BUSY`, show "Generation in progress - please wait" and keep polling.
5. Save to Library appears only when `stage === "staged"`, `status === "complete"`, and the active mode is not dirty.
6. Save to Library is hidden for `stage === "template"`.

## Critical Files

Read before implementation:

1. `shared-types/src/meditation.ts`
2. `shared-types/src/scriptParser.ts`
3. `db-models/src/models/Meditation.ts`
4. `api/src/routes/meditations.ts`
5. `api/src/routes/admin.ts`
6. `api/src/services/meditations/createMeditationFromElements.ts`
7. `api/src/services/meditations/regenerateMeditationFromScript.ts`
8. `api/src/services/meditations/meditationFileCleanup.ts`
9. `worker-node/src/processor/processMeditation.ts`
10. `web/src/components/forms/CreateMeditationModeSwitcher.tsx`
11. `web/src/components/forms/CreateMeditationForm.tsx`
12. `web/src/components/forms/ScriptMeditationEditor.tsx`
13. `web/src/lib/api/meditations.ts`
14. `web/src/components/AudioPlayer.tsx`
15. `web/src/components/modals/ModalConfirmCreateMeditation.tsx`

Files likely needing code:

1. New migration for `stage` and partial unique indexes.
2. `shared-types/src/meditation.ts`.
3. `db-models/src/models/Meditation.ts`.
4. New `api/src/services/meditations/validateMeditationMetadata.ts`.
5. `api/src/services/meditations/createMeditationFromElements.ts`.
6. New `api/src/services/users/getOrCreateBenevolentUser.ts`.
7. New `api/src/services/meditations/assertMeditationAccess.ts`.
8. New `api/src/services/meditations/assertAdminMeditationMutable.ts`.
9. New `api/src/services/meditations/createOrRegenerateStagedMeditation.ts`.
10. New `api/src/services/meditations/saveStagedToLibrary.ts`.
11. `api/src/routes/meditations.ts`.
12. `api/src/routes/admin.ts`.
13. `web/src/lib/api/meditations.ts`.
14. `web/src/components/forms/CreateMeditationModeSwitcher.tsx`.
15. `web/src/components/forms/CreateMeditationForm.tsx`.
16. `web/src/components/forms/ScriptMeditationEditor.tsx`.
17. `scripts/seedDefaultMeditation.ts`.

## Verification

Seed:

1. Fresh seed creates exactly one `stage='template'` row.
2. Template owner is the benevolent system user.
3. Template `scriptSource` matches the starter script byte-for-byte.
4. Template `meditationArray` has exactly three persisted elements:
   ```ts
   { id: 1, text: "Welcome. Close your eyes.", sequence: 1 }
   { id: 2, pause_duration: "2", sequence: 2 }
   { id: 3, sound_file: "<filename>", sequence: 3 }
   ```
5. Template JobQueue rows are `text`, `pause`, `sound`.
6. Missing `Tibetan Singing Bowl` SoundFile aborts before row creation.
7. Running seed twice exits 0 on the second run without duplicating or modifying the template.

API response contract:

1. `mapMeditationRecord` includes `stage`.
2. Shared `Meditation` type includes `stage`.
3. `GET /meditations/staging` returns `stage='template'` for a fresh user.
4. `POST /meditations/staging/generate` returns `stage='staged'`.
5. `POST /meditations/staging/save-to-library` returns `stage='library'`.

Metadata validation:

1. Existing create routes and save-to-library all use `validateMeditationMetadata`.
2. Blank descriptions normalize to null.
3. Invalid visibility returns `400 VALIDATION_ERROR`.
4. Missing or invalid title returns `400 VALIDATION_ERROR`.
5. Fresh staged rows created by Generate have `title = "Untitled staged meditation"` and `description = null`.

Library listing:

1. Anonymous `/meditations/all` returns only `library` rows.
2. Authenticated `/meditations/all` excludes the caller's staged row.
3. Admin `/meditations/all` returns only `library` rows.
4. `/admin/meditations` returns all stages.
5. Saved staged row appears in `/meditations/all` only after stage flips to `library`.

Staging flow:

1. Fresh user loads Create and receives the template.
2. Fresh user edits and clicks Generate.
3. The created staged row reflects the edited payload, not the template payload.
4. Worker is notified once.
5. Reopening Create returns the staged row.
6. Further Generate updates the same staged row.
7. Old staged audio is removed after regeneration setup.
8. Save to Library flips the row to `library` and applies user-provided title, description, and visibility.
9. Reopening Create after save returns the template.

Concurrency:

1. Two first Generate requests for the same user create one staged row.
2. One request wins; the other returns either 409 busy or a valid regenerate result if processing already completed.
3. Double-click Generate on an existing staged row returns 409 for the second request.
4. A Generate request during processing returns 409 without modifying rows or jobs.
5. Save and Generate issued together against the same staged row produce one clean winner; the other request returns `409 MEDITATION_BUSY` or stale-state error.
6. If Save wins, no Generate path continues mutating the promoted library row.
7. If Generate wins, Save sees active work and returns `409 MEDITATION_BUSY`.

Access control:

1. Other users cannot read or stream a staged row by ID.
2. Owners cannot mutate staged rows through library mutation routes.
3. Template cannot be updated, deleted, favorited, or requeued through API/admin mutation routes.
4. Admin delete/requeue protections return the expected 409 codes.
5. Benevolent system user cannot be deleted while owning the template.

Frontend:

1. Template response hides Save to Library in both modes.
2. Staged complete clean response shows Save to Library in the active mode.
3. Dirty form shows Generate and hides Save to Library.
4. Pending/processing staged row disables Generate and Save while polling.
5. Play uses template audio before edits and staged audio after generation completes.
6. Generate in script mode then switch to spreadsheet mode shows the same staged row, not a stale template snapshot.
7. Generate in spreadsheet mode then switch to script mode shows the same staged row, not a stale template snapshot.
8. Save to Library in one mode resets both modes back to the template state.
