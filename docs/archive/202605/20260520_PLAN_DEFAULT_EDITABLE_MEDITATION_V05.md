---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Staged Default Meditation in Create Form (V05)

## Changes from V04

V05 addresses the concern raised in `20260520_PLAN_DEFAULT_EDITABLE_MEDITATION_V04_ASSESSMENT_CODEX.md`. Validated against current code:

V04's seed-script section described element objects shaped as `{ type, durationSeconds, soundFilename, sequence }`, passed to `createMeditationFromElements` under a `meditationArray:` parameter with `stage: "template"` alongside. **None of these match the actual code.**

- The real `MeditationElement` ([shared-types/src/meditation.ts:5-12](shared-types/src/meditation.ts:5)) is `{ id, text?, voice_id?, speed?, pause_duration?, sound_file? }`. No `type` discriminator — `replaceMeditationElements` derives it at runtime from which optional key is present ([createMeditationFromElements.ts:8-13](api/src/services/meditations/createMeditationFromElements.ts:8)).
- `parseMeditationScript` emits exactly that shape, with `pause_duration` as a **string** ([scriptParser.ts:75-83](shared-types/src/scriptParser.ts:75)) and `sound_file` as the resolved SoundFile filename ([scriptParser.ts:99-107](shared-types/src/scriptParser.ts:99)).
- `createMeditationFromElements` takes `elements:`, not `meditationArray:` ([createMeditationFromElements.ts:64-72](api/src/services/meditations/createMeditationFromElements.ts:64)).
- `createMeditationFromElements` has no `stage` parameter today, so V04's `stage: "template"` argument would be silently dropped and the template row would persist with the default stage — defeating the entire design.

V05 fixes the seed shape, the parameter name, and adds the `stage` plumbing to the create service. The rest of V04 (template ownership, admin route guards, partial unique indexes, route ordering, staged regeneration locking, frontend flow) carries forward unchanged.

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

Also add a `MeditationStage` type alias to `shared-types/src/meditation.ts` so both server and client can refer to it.

### Cardinality enforcement (carried from V02)

Two partial unique indexes in the migration:

- `CREATE UNIQUE INDEX meditations_one_template ON meditations ((stage)) WHERE stage = 'template';`
- `CREATE UNIQUE INDEX meditations_one_staged_per_user ON meditations (user_id) WHERE stage = 'staged';`

### Extend `createMeditationFromElements` to accept `stage` (new in V05)

The existing service ([createMeditationFromElements.ts:64-96](api/src/services/meditations/createMeditationFromElements.ts:64)) gets one new optional parameter:

```ts
export async function createMeditationFromElements(opts: {
  userId: number;
  title: string;
  description: string | null;
  visibility: "public" | "private";
  elements: MeditationElement[];
  sourceMode: SourceMode;
  scriptSource: string | null;
  stage?: MeditationStage; // NEW; defaults to "library"
}): Promise<Meditation>
```

Two-line change: default `opts.stage ?? "library"`, and pass it through to `Meditation.create({ … stage })`. All existing callers (the two `/meditations/create*` routes) continue to work because they omit the field and get the default. This is the single chokepoint that lets the seed script and the staged-creation path produce non-library rows without inventing parallel create services.

### Template ownership (carried from V04)

The template row's `user_id` is the existing **benevolent system user** (email `benevolent.system@golightly.local`). Refactor: extract `getOrCreateBenevolentUser` from [api/src/routes/admin.ts:10-25](api/src/routes/admin.ts:10) into `api/src/services/users/getOrCreateBenevolentUser.ts`. Admin router and seed script both import it from there.

Add a `DELETE /admin/users/:id` guard rejecting with `409 PROTECTED_USER` if the target owns any `stage='template'` row.

### Template seed content (corrected in V05)

The seed script creates the template row with exactly this script:

```
Welcome. Close your eyes.
<break time="2s" />
[Tibetan Singing Bowl]
```

The seed script does **not** hand-construct elements. It calls `parseMeditationScript` against the literal text, passing a sound lookup that maps `"Tibetan Singing Bowl"` (case-insensitive, trimmed) to the matching `SoundFile` row. The parser's actual output for this script is three elements:

```ts
[
  { id: 1, text: "Welcome. Close your eyes." },
  { id: 2, pause_duration: "2" },                  // string, per parser
  { id: 3, sound_file: <SoundFile.filename> },     // resolved at parse time
]
```

Note: there is no `type`, no `durationSeconds`, no `soundFilename`, no `sequence` on these objects. The `type` is derived inside `replaceMeditationElements` from the presence of `text` / `sound_file` / `pause_duration`. The `sequence` is added by `createMeditationFromElements` when it persists `meditation_array` ([createMeditationFromElements.ts:84-87](api/src/services/meditations/createMeditationFromElements.ts:84)).

Seed-script algorithm:

1. `const owner = await getOrCreateBenevolentUser();`
2. `const sounds = await SoundFile.findAll();` build a lowercase-name → SoundFile map.
3. Run `parseMeditationScript(STARTER_SCRIPT, lookup)`. If `parseResult.ok === false`, log the errors and exit non-zero — do not create a partial row.
4. Confirm exactly one element has `sound_file` set and that file resolves to the `Tibetan Singing Bowl` SoundFile (defensive — the parser would already have errored otherwise). If the SoundFile row is missing entirely, fail with a clear message before creating anything.
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
6. `await notifyWorker(meditation.id, "intake")` and poll `Meditation.findByPk` until `status` is `'complete'` or `'failed'`. On `'failed'`, log `lastError` and exit non-zero.
7. Exit 0.

Idempotency: the `meditations_one_template` partial unique index catches a second seed run on the `Meditation.create` call inside the transaction. The script catches `unique_violation`, reloads the existing template row, confirms it is `status='complete'`, and exits 0 without touching it. If the existing row is in a bad state (`failed` / `pending`), the script logs and exits non-zero — manual cleanup is expected rather than silent overwrite.

### Stage-aware access control on user-facing routes (carried from V02)

A single helper `assertMeditationAccess(meditation, requester, intent)` gates every ID-based meditation route. Summary:

- `GET /:id`, `/:id/stream`, `/:id/stream-token`: staged → owner-only (404 otherwise); template → readable by any caller; library → today's visibility rule.
- `PATCH /update/:id`, `PUT /:id/script`, `DELETE /:id`, `POST /favorite/:id/:bool`: reject anything other than `stage='library'`.
- Staged rows are force-set to `visibility='private'` on creation.

### Stage-aware access control on admin routes (carried from V04)

`assertAdminMeditationMutable` rejects template mutation through `DELETE /admin/meditations/:id`, `DELETE /admin/queuer/:id`, and `POST /admin/meditations/:id/requeue` with `409 PROTECTED_TEMPLATE`. Staged rows pass through admin paths normally (cascade-delete still cleans up audio).

### Route registration order (carried from V03)

In `api/src/routes/meditations.ts`, all `/staging*` routes must be declared above the `/:id` family. New ordering:

1. `POST /meditations/create` *(existing)*
2. `POST /meditations/create/script` *(existing)*
3. `GET /meditations/all` *(existing)*
4. **`GET /meditations/staging`** *(new)*
5. **`POST /meditations/staging/generate`** *(new)*
6. **`POST /meditations/staging/save-to-library`** *(new)*
7. `GET /meditations/:id` *(existing, line 213)*
8. … remaining `/:id*` routes …

### Staged regeneration service (carried from V03)

`regenerateStagedMeditation` mirrors the lock-and-replace pattern of `regenerateMeditationFromScript`. Accepts both spreadsheet and script payloads. `POST /meditations/staging/generate` resolves the staged row via `getOrCreateStagedMeditation`, then calls `regenerateStagedMeditation`. Inside the staged regeneration: lock row, probe processing jobs, throw `409 MEDITATION_BUSY` if busy, update content + null filename/filePath/durationSeconds, set status to `pending`, replace job queue inside the same transaction. Post-commit: `deleteMeditationAudioFiles`, then a single `notifyWorker`.

`getOrCreateStagedMeditation`'s create path calls `createMeditationFromElements` with `stage: "staged"`. It seeds the new row from the template's current `elements` (read from the template's `meditation_array`).

### New owner-only endpoints (carried)

- `GET /meditations/staging` — returns caller's staged row, or the template if none.
- `POST /meditations/staging/generate` — get-or-create + regenerate.
- `POST /meditations/staging/save-to-library` — flips `stage` from `staged` to `library`, sets title/description/visibility.

### Frontend flow (unchanged from V02)

Load → dirty-check → Generate (only when dirty) → poll → Play. Save-to-library only when staged + complete + clean.

## Critical files

Read-only references (existing patterns to reuse):

- `shared-types/src/meditation.ts:5-12` — `MeditationElement` shape. Authoritative; do not invent a different shape in the seed script.
- `shared-types/src/scriptParser.ts:38-110` — `parseMeditationScript` output shape. Seed uses this output directly.
- `db-models/src/models/Meditation.ts:39-43` — `userId` is non-null.
- `api/src/services/meditations/createMeditationFromElements.ts:8-96` — `deriveType`, `replaceMeditationElements`, `createMeditationFromElements`. The `stage` parameter is added here.
- `api/src/services/meditations/regenerateMeditationFromScript.ts:7-86` — lock-and-replace pattern to mirror in `regenerateStagedMeditation`.
- `api/src/routes/admin.ts:10-25` — `getOrCreateBenevolentUser` to extract.
- `api/src/routes/admin.ts:57-174` — admin routes that need stage guards.
- `api/src/routes/meditations.ts:213` — `GET /:id`; staging routes go above this.

Files that will need new code:

- New migration: `stage` column (with backfill of `'library'`), two partial unique indexes.
- `shared-types/src/meditation.ts` — add `MeditationStage` type alias.
- `api/src/services/meditations/createMeditationFromElements.ts` — extend with optional `stage` parameter (defaults to `"library"`).
- New service `api/src/services/users/getOrCreateBenevolentUser.ts` — extracted from admin router.
- New helper `api/src/services/meditations/assertMeditationAccess.ts`.
- New helper `api/src/services/meditations/assertAdminMeditationMutable.ts`.
- New service `api/src/services/meditations/getOrCreateStagedMeditation.ts` — uses extended `createMeditationFromElements` with `stage: "staged"`.
- New service `api/src/services/meditations/regenerateStagedMeditation.ts`.
- New service `api/src/services/meditations/saveStagedToLibrary.ts`.
- New script `scripts/seedDefaultMeditation.ts`.

## Verification

Functional (carried):

1. Run the seed script in a fresh environment. Confirm exactly one `stage='template'` row with `status='complete'` and a real audio file. Run again — no duplicate, exits 0.
2. Anonymous visitor: `/meditations/all` — template row absent.
3. Fresh authenticated user: Create form pre-populates from the template. Play works.
4. Edit a row → Generate appears → click → poll → audio updates.
5. Re-open the form in a new tab — user's staged content persists.
6. Switch between spreadsheet and script mid-edit — content stays consistent.
7. Save to Library → modal collects title/description/visibility → row appears in library, no longer in staging.
8. Open Create form again — back to the template.
9. As another user, step-7's saved meditation does not appear in *their* staging area.

Seed content and shape (corrected in V05):

10. After seeding, the template's `script_source` matches the literal starter script byte-for-byte.
11. The template's `meditation_array` is exactly three elements with this structure (sequence added at persist time):
    ```
    { id: 1, text: "Welcome. Close your eyes.", sequence: 1 }
    { id: 2, pause_duration: "2",               sequence: 2 }
    { id: 3, sound_file: <filename>,            sequence: 3 }
    ```
    No `type` key on the persisted elements; `replaceMeditationElements`'s `deriveType` reads `text` / `pause_duration` / `sound_file` to produce the JobQueue type.
12. The template's three `JobQueue` rows have `type` values `text`, `pause`, `sound` in that sequence order.
13. The template row's `user_id` equals the benevolent system user's id.
14. Run the seed script in an environment where the `Tibetan Singing Bowl` SoundFile row is absent — seed aborts with a clear error and creates no row.
15. `createMeditationFromElements` invoked with no `stage` argument still produces a `stage='library'` row (regression check for existing callers).
16. `createMeditationFromElements` invoked with `stage: "staged"` (the `getOrCreateStagedMeditation` path) produces a `stage='staged'` row.

Access control on user-facing routes (carried):

17. As user B, `GET /meditations/:id` on user A's staged row — 404.
18. As user B, `GET /meditations/:id/stream` on user A's staged row — 404.
19. As the owner, `PATCH`, `PUT /:id/script`, `DELETE`, `POST /favorite` against own staged row — all 409/404.
20. Inspect a freshly generated staged row — `visibility = 'private'`.

Access control on admin routes (carried):

21. `DELETE /admin/meditations/:id` against the template — 409 `PROTECTED_TEMPLATE`.
22. `DELETE /admin/queuer/:id` against a template job row — 409 `PROTECTED_TEMPLATE`.
23. `POST /admin/meditations/:id/requeue` on the template — 409 `PROTECTED_TEMPLATE`.
24. `DELETE /admin/meditations/:id` on a user's staged row — succeeds, audio file removed.
25. `POST /admin/meditations/:id/requeue` on a user's stuck staged row — succeeds.
26. `DELETE /admin/users/:id` against the benevolent system user while template exists — 409 `PROTECTED_USER`.
27. `GET /admin/meditations` and `GET /admin/queuer` continue to return every row.

Concurrency (carried):

28. Two tabs as the same fresh user click Generate simultaneously — exactly one staged row exists afterward.
29. Hand-insert a second `stage='template'` row — DB rejects.
30. Hand-insert a second `stage='staged'` row for the same user — DB rejects.

Route ordering (carried):

31. `GET /meditations/staging`, `POST /meditations/staging/generate`, `POST /meditations/staging/save-to-library` reach their dedicated handlers, not the `:id` handler.

Staged regeneration concurrency (carried):

32. Double-click Generate on an existing staged row that is `complete` — second request returns `409 MEDITATION_BUSY`. One set of JobQueue rows, one new audio file, no orphaned old audio.
33. While a staged regeneration is `processing`, an additional Generate request returns 409 without modifying the row.
