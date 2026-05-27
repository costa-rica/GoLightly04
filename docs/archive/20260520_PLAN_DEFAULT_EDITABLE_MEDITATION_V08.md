---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Staged Default Meditation in Create Form (V08)

## Changes from V07

V08 addresses the concern raised in `20260520_PLAN_DEFAULT_EDITABLE_MEDITATION_V07_ASSESSMENT_CODEX.md`.

V07 depended on the frontend checking `stage === 'staged'` to decide whether Save to Library can appear, but it did not explicitly require the API response mapper or shared `Meditation` type to expose `stage`. The current `mapMeditationRecord` helper in `api/src/routes/meditations.ts` omits `stage`, and `shared-types/src/meditation.ts` does not include it on `Meditation`.

V08 adds the response contract explicitly:

1. Add `MeditationStage = "template" | "staged" | "library"` to `shared-types/src/meditation.ts`.
2. Add `stage: MeditationStage` to the shared `Meditation` response type.
3. Add `stage: meditation.stage ?? "library"` to `mapMeditationRecord`.
4. Require all staging endpoint responses to return a mapped meditation record with the correct `stage`.
5. Add verification that template-vs-staged UI gating is driven by the response `stage`.

Everything else from V07 carries forward: unified staged Generate service, exact template seed, benevolent owner, partial unique indexes, route ordering, library listing filter, ID-route access control, and admin guards.

## Context

The Create Meditation form currently starts empty. The goal is to give users a starter meditation they can play immediately, edit, regenerate, and save to their library only when they choose.

The shared default meditation is always available and is seeded from this exact script:

```text
Welcome. Close your eyes.
<break time="2s" />
[Tibetan Singing Bowl]
```

The intended user flow is:

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

This response field is required because the frontend uses it to distinguish:

1. Template loaded into Create: Play is allowed, Save to Library is hidden.
2. Staged row loaded into Create: Play is allowed when audio exists, Save to Library is allowed only when complete and clean.
3. Library row: normal library behavior.

Endpoints that return meditation records must use the mapper or otherwise include `stage`:

1. `GET /meditations/staging`
2. `POST /meditations/staging/generate`
3. `POST /meditations/staging/save-to-library`
4. Existing detail/list/update/regenerate responses that return meditation objects

## Creation Pipeline Stage Support

Extend `createMeditationFromElements` with an optional `stage` parameter:

```ts
stage?: MeditationStage
```

Behavior:

1. Default omitted `stage` to `library`.
2. Pass `stage` into `Meditation.create`.
3. Keep existing `/meditations/create` and `/meditations/create/script` behavior unchanged because they omit `stage`.
4. Use `stage: "template"` from the seed script.
5. Use `stage: "staged"` from the unified staged Generate service create branch.

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
   - Validates the caller owns a staged row with `status='complete'`.
   - Validates title, description, and visibility using existing rules.
   - Atomically flips `stage` from `staged` to `library`.
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
4. Lock the user's existing `stage='staged'` row with `SELECT ... FOR UPDATE`.
5. If no row exists:
   - Create one directly from the submitted payload.
   - Set `stage='staged'`, `visibility='private'`, `status='pending'`.
   - Set `filename`, `filePath`, and `durationSeconds` to null.
   - Write JobQueue rows via `replaceMeditationElements`.
6. If a row exists:
   - Require status to be `complete` or `failed`.
   - Check for any processing JobQueue row and return `409 MEDITATION_BUSY` if found.
   - Update the same row in place with the submitted payload.
   - Clear `filename`, `filePath`, and `durationSeconds`.
   - Set `status='pending'`.
   - Replace JobQueue rows inside the same transaction.
   - Record the previous file path for cleanup.
7. If first-time creation hits the partial unique index because another tab won the race, retry once. The retry should usually return `409 MEDITATION_BUSY` because the winning row is pending.
8. After commit, call `deleteMeditationAudioFiles(meditationId)` only when an existing staged row had previous audio.
9. Notify the worker exactly once after commit.

The template is never copied into a staged row. It only supplies initial form content through `GET /meditations/staging`.

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

On Create form load:

1. Call `GET /meditations/staging`.
2. Store the returned meditation as the initial state.
3. Store `meditation.stage`.
4. Populate spreadsheet rows and script text from the returned meditation.
5. Show Play when audio is available.

Dirty checking:

1. Spreadsheet mode compares current rows to initial `meditationArray`.
2. Script mode compares current script text to initial `scriptSource`.

Controls:

1. Generate appears only when dirty.
2. Generate calls `POST /meditations/staging/generate`.
3. During pending/processing, disable Generate and poll.
4. On `409 MEDITATION_BUSY`, show a clear "Generation in progress - please wait" message and keep polling.
5. Save to Library appears only when `stage === "staged"`, `status === "complete"`, and the form is not dirty.
6. Save to Library is hidden for `stage === "template"`.

After successful Save to Library:

1. Refresh the library list.
2. Reset Create state by reloading `GET /meditations/staging`.
3. The response should be the template again because the user no longer has a staged row.

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
10. `web/src/components/forms/CreateMeditationForm.tsx`
11. `web/src/components/forms/ScriptMeditationEditor.tsx`
12. `web/src/lib/api/meditations.ts`
13. `web/src/components/AudioPlayer.tsx`
14. `web/src/components/modals/ModalConfirmCreateMeditation.tsx`

Files likely needing code:

1. New migration for `stage` and partial unique indexes.
2. `shared-types/src/meditation.ts`.
3. `db-models/src/models/Meditation.ts`.
4. `api/src/services/meditations/createMeditationFromElements.ts`.
5. New `api/src/services/users/getOrCreateBenevolentUser.ts`.
6. New `api/src/services/meditations/assertMeditationAccess.ts`.
7. New `api/src/services/meditations/assertAdminMeditationMutable.ts`.
8. New `api/src/services/meditations/createOrRegenerateStagedMeditation.ts`.
9. New `api/src/services/meditations/saveStagedToLibrary.ts`.
10. `api/src/routes/meditations.ts`.
11. `api/src/routes/admin.ts`.
12. `web/src/lib/api/meditations.ts`.
13. `web/src/components/forms/CreateMeditationForm.tsx`.
14. `web/src/components/forms/ScriptMeditationEditor.tsx`.
15. `scripts/seedDefaultMeditation.ts`.

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
8. Save to Library flips the row to `library`.
9. Reopening Create after save returns the template.

Concurrency:

1. Two first Generate requests for the same user create one staged row.
2. One request wins; the other returns either 409 busy or a valid regenerate result if processing already completed.
3. Double-click Generate on an existing staged row returns 409 for the second request.
4. A Generate request during processing returns 409 without modifying rows or jobs.

Access control:

1. Other users cannot read or stream a staged row by ID.
2. Owners cannot mutate staged rows through library mutation routes.
3. Template cannot be updated, deleted, favorited, or requeued through API/admin mutation routes.
4. Admin delete/requeue protections return the expected 409 codes.
5. Benevolent system user cannot be deleted while owning the template.

Frontend:

1. Template response hides Save to Library.
2. Staged complete clean response shows Save to Library.
3. Dirty form shows Generate and hides Save to Library.
4. Pending/processing staged row disables Generate and Save while polling.
5. Play uses template audio before edits and staged audio after generation completes.
