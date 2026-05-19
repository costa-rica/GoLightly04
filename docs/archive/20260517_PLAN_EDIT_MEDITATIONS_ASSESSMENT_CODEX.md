---
created_at: 2026-05-17
updated_at: 2026-05-17
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Plan assessment: edit meditations

The plan is directionally sound and fits the current architecture. The main idea of displaying `script_source` with a serializer fallback from `meditation_array`, then replacing job rows and re-running the worker, should work.

There is one race condition that is serious enough to address before implementation, plus a few smaller adjustments that would materially improve the chance of a clean build.

## 1. Recheck status inside the transaction

The regenerate service plan checks `status === "processing"` before parsing and before opening the transaction. That leaves a race:

1. The API loads a meditation while it is `pending` or `complete`.
2. The worker starts and changes the meditation to `processing`.
3. The API finishes parsing and enters the transaction.
4. The API replaces `meditation_array`, destroys job rows, resets `status` to `pending`, and deletes files while the worker may already be using the old job list or writing audio.

This can create orphaned audio files, lost job progress, or a meditation whose DB state no longer matches worker activity.

Recommended change:

1. Keep the early status check as a fast path.
2. In the transaction, reload the meditation with a row lock.
3. Recheck `status` after the lock is acquired.
4. Reject if the locked row is `processing`.
5. Also reject if any existing `JobQueue` row for that meditation has `status = "processing"`.

This keeps the existing approach, but makes the critical replace operation atomic from the API's perspective.

## 2. Consider allowing regeneration only from complete or failed

The UI plan disables editing while `pending` or `processing`, but the API plan only rejects `processing`. That means a direct API call can regenerate a meditation while it is already `pending`.

Safer API behavior:

1. Allow regenerate from `complete` and `failed`.
2. Reject `pending` and `processing` with `MEDITATION_BUSY`.

This matches the intended UI and avoids editing a meditation that is already queued but not yet claimed by the worker.

If product intentionally wants editing of `pending` meditations, the transaction must be especially strict about locks and existing job states.

## 3. Fix the worker voice key mismatch while touching replacement logic

The current create service writes text job input as:

```json
{ "voice_id": "..." }
```

The worker reads:

```ts
inputData.voiceId
```

So per-element voices appear to be ignored today. The edit feature intentionally drops `voice_id` when saving script, but the extracted `replaceMeditationElements` helper should not preserve the existing mismatch.

Recommended change:

1. Either write `voiceId` in `createMeditationFromElements` and `replaceMeditationElements`.
2. Or update the worker to accept both `voiceId` and `voice_id`.

The second option is lower risk because it preserves compatibility with any existing queued rows.

## 4. Make serializer fallback explicit about lossy text formatting

The parser collapses whitespace through `collapseSpeech`, so a script shown from spreadsheet data can round-trip semantically, but not necessarily textually. That is okay, but the serializer tests should compare parsed elements or normalized script output, not raw text equality.

Recommended serializer test shape:

1. Serialize elements.
2. Parse the serialized script.
3. Assert equivalent element types, order, text content, sounds, pauses, and speed values.

## 5. Keep sound lookup centralized

The plan says every route that maps meditations should fetch `SoundFile.findAll()`. That works, but it spreads lookup construction through the router.

A cleaner approach:

1. Add a small helper, for example `buildSoundFilenameToNameLookup()`.
2. Use it in `GET /all`, `GET /:id`, `PATCH /update/:id`, and `PUT /:id/script`.
3. Skip it in create routes unless those routes start returning a full mapped meditation.

This reduces repeated code and avoids unnecessary sound queries in routes that do not need `scriptSource` in their response.

## Suggested implementation adjustment

Use the existing plan with these changes:

1. Implement `replaceMeditationElements` as planned.
2. Implement regeneration as a single locked transaction for status validation and DB replacement.
3. Delete old audio after the transaction commits and before notifying the worker.
4. Notify the worker only after cleanup completes.
5. Add tests for the race guard: locked `processing`, pending meditation rejection, and existing processing job rejection.

With those changes, the plan should be much safer to implement without changing the overall feature design.
