---
created_at: 2026-05-20
updated_at: 2026-05-20
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Assessment for Staged Default Meditation V09

## Findings

1. Create mode state can become stale across script and spreadsheet editors

   The plan describes the frontend flow as if there is one Create form state, with the returned staging meditation stored as the initial state and dirty-checked by mode. In the current frontend, `CreateMeditationModeSwitcher` mounts both `ScriptMeditationEditor` and `CreateMeditationForm` at the same time and hides one with `hidden`. If each child independently loads and stores `GET /meditations/staging`, the hidden editor can keep an old template or staged snapshot after the visible editor generates or saves.

   This materially threatens correctness because the feature has exactly one staged row per user. A user could generate from script mode, switch to spreadsheet mode, and see or submit stale template-derived state that overwrites the staged row. Similarly, after Save to Library in one mode, the other hidden mode may still think a staged row exists and expose invalid controls. That risks data loss in the in-progress draft and makes the staged row lifecycle hard to reason about.

   Relevant sections:

   1. `Frontend Flow`
   2. `Staging Endpoints`
   3. `Unified Staged Generate Service`
   4. `Critical Files`, especially `CreateMeditationModeSwitcher`, `CreateMeditationForm`, and `ScriptMeditationEditor`

   Mitigation:

   1. Move staging load, current staged/template meditation, dirty baseline, polling state, and refresh/reset actions into `CreateMeditationModeSwitcher` or a shared hook/context owned above both editors.
   2. Pass the current staging state and callbacks into both script and spreadsheet editors.
   3. After Generate and Save to Library, refresh the shared staging state once and propagate it to both modes.
   4. Add verification for switching modes after Generate and after Save to Library so stale hidden component state cannot overwrite or expose the wrong staged row.

2. Save to Library needs explicit concurrency control against Generate

   The plan says `save-to-library` validates that the caller owns a staged row with `status='complete'` and atomically flips it to `library`, while the staged Generate service locks and mutates the same row during regeneration. It does not explicitly require Save to Library to lock the staged row and re-check state inside the same transaction using the same concurrency discipline as Generate.

   This materially threatens existing behavior because Save and Generate can target the same staged row from different tabs or stale UI states. Without a row lock or conditional update that includes `stage='staged'` and `status='complete'`, Save could race with Generate and produce a library row whose audio/jobs are being replaced, or Generate could continue mutating a row that has just been promoted to the library. That would blur the intended boundary between editable staged rows and stable library rows.

   Relevant sections:

   1. `POST /meditations/staging/save-to-library`
   2. `Unified Staged Generate Service`
   3. `Concurrency`
   4. `Staging flow`

   Mitigation:

   1. Implement `saveStagedToLibrary` as a transaction that loads the user's staged row with `FOR UPDATE`.
   2. Re-check `stage === "staged"` and `status === "complete"` after acquiring the lock.
   3. Check that no JobQueue row for the staged meditation is `pending` or `processing`; return `409 MEDITATION_BUSY` if work is active.
   4. Flip to `library` and apply metadata in the same transaction.
   5. Add a concurrency test where Save and Generate are issued together; the result should be either one clean library save with no regeneration mutation, or a `409 MEDITATION_BUSY`/stale-state response for one request.
