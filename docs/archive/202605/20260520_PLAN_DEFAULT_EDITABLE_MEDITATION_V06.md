---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Staged Default Meditation in Create Form (V06)

## Changes from V05

V06 addresses the concern raised in `20260520_PLAN_DEFAULT_EDITABLE_MEDITATION_V05_ASSESSMENT_CODEX.md`. Validated against current code:

V05 split staged Generate into two services: `getOrCreateStagedMeditation` (which copies template elements into a new staged row via the existing creation pipeline) followed by `regenerateStagedMeditation` (which applies the user's edited payload). The bug: `createMeditationFromElements` hardcodes `status: "pending"` ([createMeditationFromElements.ts:83](api/src/services/meditations/createMeditationFromElements.ts:83)), and `regenerateStagedMeditation` rejects any row whose status is not `complete` or `failed` (mirrored from [regenerateMeditationFromScript.ts:7-13](api/src/services/meditations/regenerateMeditationFromScript.ts:7)). So every fresh user's first Generate request would:

1. Create a staged row with template content and `status='pending'`.
2. Immediately 409 BUSY before applying the user's edits.
3. Leave the user with a staged row containing template content, not their edits.

V06 collapses the create-or-regenerate flow into a single transactional service that inserts directly from the user's submitted payload when no staged row exists. The template is consulted only by `GET /meditations/staging` to populate the form's initial state — it is no longer copied into a staged row at any point. Everything else from V05 (extended `createMeditationFromElements` with `stage` parameter, template seeding, partial unique indexes, access control, route ordering, admin guards) carries forward.

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

Two partial unique indexes in the migration:

- `CREATE UNIQUE INDEX meditations_one_template ON meditations ((stage)) WHERE stage = 'template';`
- `CREATE UNIQUE INDEX meditations_one_staged_per_user ON meditations (user_id) WHERE stage = 'staged';`

### Extend `createMeditationFromElements` to accept `stage` (carried from V05)

One new optional parameter:

```ts
{ …existing fields…, stage?: MeditationStage }   // defaults to "library"
```

Two-line change in `createMeditationFromElements.ts`: default to `"library"`, forward to `Meditation.create`. Existing callers (the two `/meditations/create*` routes) keep working unchanged because they omit the field. Used by:

- The seed script with `stage: "template"`.
- The new unified staged service (below) with `stage: "staged"`.

### Unified staged service (new in V06, replaces V05's two-service split)

Introduce `createOrRegenerateStagedMeditation(opts)` in `api/src/services/meditations/createOrRegenerateStagedMeditation.ts`. This is the **only** service that backs `POST /meditations/staging/generate`. It handles both first-time creation and subsequent regeneration in one transaction, always applying the **user's submitted payload** — the template is never copied into a staged row.

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

1. **Outside the transaction:** validate / parse the payload (script size check, run `parseMeditationScript` with the SoundFile lookup, or schema-check the elements). Bail with `400` on validation failure before touching the DB. Compute `elementsToPersist` and `scriptSource` from the payload.
2. **Open a transaction**:
   - `SELECT … FOR UPDATE` on `Meditation` where `user_id = opts.userId AND stage = 'staged'`. (At most one row by the partial unique index.)
   - **If no row exists** — *first-time create branch*:
     - `Meditation.create({ userId, title: "Untitled staged meditation", description: null, visibility: "private", sourceMode: payload.mode, scriptSource, stage: "staged", status: "pending", meditationArray: elementsToPersist.map((e, i) => ({ …e, sequence: i + 1 })), filename: null, filePath: null, durationSeconds: null }, { transaction })`.
     - Call `replaceMeditationElements({ meditationId: created.id, elements: elementsToPersist }, transaction)`.
     - Record `previousFilePath = null` for the post-commit step.
   - **If row exists** — *regenerate branch*:
     - Assert `lockedRow.status ∈ {complete, failed}`. Throw `409 MEDITATION_BUSY` otherwise.
     - `JobQueue.findOne({ where: { meditationId: lockedRow.id, status: 'processing' }, transaction, lock: LOCK.UPDATE })`. Throw `409 MEDITATION_BUSY` if any processing job exists.
     - `await lockedRow.update({ meditationArray: elementsToPersist.map((e, i) => ({ …e, sequence: i + 1 })), scriptSource, sourceMode: payload.mode, filename: null, filePath: null, durationSeconds: null, status: "pending" }, { transaction })`. `visibility` stays `"private"`; never overwritten.
     - `await replaceMeditationElements({ meditationId: lockedRow.id, elements: elementsToPersist }, transaction)`.
     - Record `previousFilePath = lockedRow.previous("filePath")` for cleanup.
3. **Race protection for the create branch:** if the `Meditation.create` step raises `unique_violation` (the partial unique index `meditations_one_staged_per_user` caught a concurrent insert from another tab), catch it inside the transaction handler, abort, and retry the whole operation once. On retry, the staged row now exists and the service takes the regenerate branch — which will probably throw `409 MEDITATION_BUSY` because the winning tab set status to `pending`. That 409 is the correct outcome: the second tab is told generation is already in progress.
4. **After the transaction commits**:
   - If `previousFilePath` is non-null, `await deleteMeditationAudioFiles(meditationId)` — same post-commit cleanup pattern as [regenerateMeditationFromScript.ts:86](api/src/services/meditations/regenerateMeditationFromScript.ts:86).
   - `void notifyWorker(meditationId, "intake")` — exactly once.

`POST /meditations/staging/generate` becomes a thin wrapper:

1. Validate auth.
2. Parse request body into a payload shape.
3. Call `createOrRegenerateStagedMeditation({ userId: req.user.id, payload })`.
4. Return the resulting row.

The old V05 services `getOrCreateStagedMeditation` and `regenerateStagedMeditation` are not introduced — V06 replaces both with this single service. (`getOrCreateStagedMeditation` had a legitimate purpose as a read-or-create helper, but `POST /generate` is the only caller that would have needed the "create" side, and we've now folded creation into the unified service.)

### `GET /meditations/staging` (clarified in V06)

`GET /meditations/staging` is the **only** read path that returns the template. Algorithm:

1. Find the caller's `stage='staged'` row by `user_id`. If present, return it.
2. Otherwise, find the global `stage='template'` row. Return it.

The frontend distinguishes between the two via the `stage` field on the returned row. The Save-to-Library button is only enabled when `stage === 'staged'` (you can't save the shared template into your library).

This endpoint never creates anything. The first DB row write for a user happens at Generate time, with the user's edited payload, via the unified service above.

### Template ownership (carried from V04)

Template `user_id` is the benevolent system user (`benevolent.system@golightly.local`). Extract `getOrCreateBenevolentUser` from [api/src/routes/admin.ts:10-25](api/src/routes/admin.ts:10) into `api/src/services/users/getOrCreateBenevolentUser.ts`. Add a guard rejecting `DELETE /admin/users/:id` with `409 PROTECTED_USER` if the target owns any `stage='template'` row.

### Template seed content (carried from V05, corrected shape)

Seed script content:

```
Welcome. Close your eyes.
<break time="2s" />
[Tibetan Singing Bowl]
```

Seed-script algorithm:

1. `const owner = await getOrCreateBenevolentUser();`
2. Build a lowercase-name → SoundFile map from `SoundFile.findAll()`.
3. Run `parseMeditationScript(STARTER_SCRIPT, lookup)`. On `!parseResult.ok`, log errors and exit non-zero.
4. The parser emits exactly:
   ```ts
   [
     { id: 1, text: "Welcome. Close your eyes." },
     { id: 2, pause_duration: "2" },              // string, per parser
     { id: 3, sound_file: <filename> },           // resolved at parse time
   ]
   ```
5. Call:
   ```ts
   const meditation = await createMeditationFromElements({
     userId: owner.id,
     title: "Default starter meditation",
     description: "Starter meditation for the Create form",
     visibility: "public",
     elements: parseResult.elements,
     sourceMode: "script",
     scriptSource: STARTER_SCRIPT,
     stage: "template",
   });
   ```
6. `await notifyWorker(meditation.id, "intake")`, poll until `status` is `'complete'` or `'failed'`. On failure, log `lastError` and exit non-zero.
7. Exit 0.

Idempotent under the `meditations_one_template` unique index: a second run catches `unique_violation`, reloads the existing template row, exits 0 if it's already `complete`. Refuses to silently overwrite a `failed`/`pending` template — manual cleanup expected.

### Stage-aware access control on user-facing routes (carried from V02)

A single helper `assertMeditationAccess(meditation, requester, intent)` gates every ID-based meditation route:

- `GET /:id`, `/:id/stream`, `/:id/stream-token`: staged → owner-only (404 otherwise); template → readable by any caller; library → today's visibility rule.
- `PATCH /update/:id`, `PUT /:id/script`, `DELETE /:id`, `POST /favorite/:id/:bool`: reject anything other than `stage='library'`.
- Staged rows are force-set to `visibility='private'` — enforced by the unified service in the create branch and preserved in the regenerate branch.

### Stage-aware access control on admin routes (carried from V04)

`assertAdminMeditationMutable` rejects template mutation through `DELETE /admin/meditations/:id`, `DELETE /admin/queuer/:id`, and `POST /admin/meditations/:id/requeue` with `409 PROTECTED_TEMPLATE`. Staged rows pass through admin paths normally.

### Route registration order (carried from V03)

All `/staging*` routes declared above `/:id` in `api/src/routes/meditations.ts`.

### `POST /meditations/staging/save-to-library` (carried)

Validates the caller owns a staged row with `status='complete'`, then atomically flips `stage` to `library` and sets title/description/visibility from the request body.

### Frontend flow (unchanged from V02)

Load (`GET /meditations/staging`) → dirty-check vs initial → Generate (only when dirty, calls unified service) → poll → Play. Save-to-Library only when `stage='staged' && status='complete' && !isDirty`.

On `409 MEDITATION_BUSY` (returned when a second tab's Generate hits a row already being processed), surface "Generation in progress — please wait" and let the poller drive UI refresh. This is the same handling pattern used by `ModalMeditationDetails.tsx` for the existing regenerate flow.

## Critical files

Read-only references (existing patterns to reuse):

- `shared-types/src/meditation.ts:5-12` — `MeditationElement` shape.
- `shared-types/src/scriptParser.ts:38-110` — `parseMeditationScript` output.
- `db-models/src/models/Meditation.ts:39-43` — `userId` non-null.
- `api/src/services/meditations/createMeditationFromElements.ts:8-96` — `deriveType`, `replaceMeditationElements`, `createMeditationFromElements`. Extended in this plan with a `stage` parameter.
- `api/src/services/meditations/regenerateMeditationFromScript.ts:7-86` — lock-and-replace pattern mirrored by `createOrRegenerateStagedMeditation`'s regenerate branch.
- `api/src/routes/admin.ts:10-25` — `getOrCreateBenevolentUser` to extract.
- `api/src/routes/admin.ts:57-174` — admin routes needing stage guards.
- `api/src/routes/meditations.ts:213` — `GET /:id`; staging routes go above.

Files that will need new code:

- New migration: `stage` column with backfill, two partial unique indexes.
- `shared-types/src/meditation.ts` — add `MeditationStage` type alias.
- `api/src/services/meditations/createMeditationFromElements.ts` — extend with optional `stage` (defaults to `"library"`).
- New service `api/src/services/users/getOrCreateBenevolentUser.ts` — extracted.
- New helper `api/src/services/meditations/assertMeditationAccess.ts`.
- New helper `api/src/services/meditations/assertAdminMeditationMutable.ts`.
- **New service `api/src/services/meditations/createOrRegenerateStagedMeditation.ts`** — unified create-or-regenerate path. Replaces V05's `getOrCreateStagedMeditation` + `regenerateStagedMeditation` pair.
- New service `api/src/services/meditations/saveStagedToLibrary.ts`.
- New script `scripts/seedDefaultMeditation.ts`.

## Verification

Functional (carried):

1. Run the seed script in a fresh environment. Confirm exactly one `stage='template'` row, `status='complete'`, real audio file. Run again — exits 0, no duplicate.
2. Anonymous visitor: `/meditations/all` — template absent.
3. Fresh authenticated user opens Create form: `GET /meditations/staging` returns the template; form populates from it; Play works against the template's audio.
4. Edit a row → Generate appears → click → poll → Play now plays the user's audio.
5. Reopen the form in a new tab — `GET /meditations/staging` now returns the user's staged row; the user's edited content is preserved.
6. Spreadsheet ↔ script mode switch mid-edit preserves content.
7. Save to Library → modal collects title/description/visibility → row appears in library; reopening Create form returns the template again.

First-Generate correctness (new in V06):

8. **A fresh user (no staged row) clicks Generate after editing the template content.** Expected DB state after the request returns 201:
   - Exactly one new `stage='staged'` row exists for that user, with `visibility='private'`, `status='pending'`, `meditation_array` reflecting the **user's edited payload** (not the template's content), and `scriptSource` matching the submitted script if mode='script'.
   - JobQueue contains rows derived from the user's edited elements, not the template's.
   - The worker has been notified exactly once.
   - The request did **not** return `409 MEDITATION_BUSY`.
9. After step 8 completes processing, Play returns audio matching the user's edits, not the template.

Subsequent-Generate correctness (carried):

10. A user with an existing `complete` staged row clicks Generate after further edits. Service takes the regenerate branch: row updated in place, old audio file deleted post-commit, worker notified once.
11. Double-click Generate on an existing `complete` staged row — second request returns `409 MEDITATION_BUSY`. One set of JobQueue rows, one new audio file.
12. While a staged regeneration is `processing`, additional Generate requests return 409.

Concurrent first-Generate (new in V06):

13. Two tabs of the same fresh user click Generate simultaneously. Outcomes:
    - Exactly one `stage='staged'` row exists for that user afterward.
    - One request returns 201 (the create-branch winner).
    - The other request either: (a) catches `unique_violation`, retries, hits the regenerate branch, finds `status='pending'`, returns `409 MEDITATION_BUSY`; **or** (b) catches `unique_violation`, retries, finds the row is somehow already `complete` (worker was very fast), and proceeds with a normal regenerate. Both outcomes are acceptable. Neither results in a duplicate row.

Seed shape (carried from V05):

14. Template `script_source` matches the literal starter byte-for-byte.
15. Template `meditation_array` is exactly three persisted elements:
    ```
    { id: 1, text: "Welcome. Close your eyes.", sequence: 1 }
    { id: 2, pause_duration: "2",               sequence: 2 }
    { id: 3, sound_file: <filename>,            sequence: 3 }
    ```
16. Template `JobQueue` rows have `type` values `text`, `pause`, `sound` in sequence order.
17. Template `user_id` is the benevolent system user.
18. Seed run with missing `Tibetan Singing Bowl` SoundFile aborts cleanly without creating a row.
19. `createMeditationFromElements` called without `stage` still produces `stage='library'` (regression check).
20. `createMeditationFromElements` called with `stage: "staged"` (the unified service's create branch) produces `stage='staged'`.

Access control on user-facing routes (carried):

21. As user B, `GET /meditations/:id` on user A's staged row → 404.
22. As user B, `GET /meditations/:id/stream` on user A's staged row → 404.
23. As the owner, `PATCH`, `PUT /:id/script`, `DELETE`, `POST /favorite` against own staged row → 409/404 each.
24. Inspect a freshly generated staged row — `visibility = 'private'`.

Access control on admin routes (carried):

25. `DELETE /admin/meditations/:id` against template → 409 `PROTECTED_TEMPLATE`.
26. `DELETE /admin/queuer/:id` against a template job → 409 `PROTECTED_TEMPLATE`.
27. `POST /admin/meditations/:id/requeue` on template → 409 `PROTECTED_TEMPLATE`.
28. `DELETE /admin/meditations/:id` on a user's staged row → succeeds, audio cleaned up.
29. `POST /admin/meditations/:id/requeue` on a user's stuck staged row → succeeds.
30. `DELETE /admin/users/:id` against benevolent system user while template exists → 409 `PROTECTED_USER`.

Cardinality (carried):

31. Hand-insert a second `stage='template'` row → DB rejects.
32. Hand-insert a second `stage='staged'` row for the same user → DB rejects.

Route ordering (carried):

33. `GET /meditations/staging`, `POST /meditations/staging/generate`, `POST /meditations/staging/save-to-library` reach their dedicated handlers, not the `:id` handler.
