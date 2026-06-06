---
created_at: 2026-05-14
updated_at: 2026-05-14
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Script-mode meditation creation

## Context

Today a meditation is built only through the spreadsheet-style grid in [CreateMeditationForm.tsx](../web/src/components/forms/CreateMeditationForm.tsx) — each row is `text | pause | sound` and is submitted as a `MeditationElement[]` to `POST /meditations/create`. The worker reads the JobQueue rows and stitches audio with ElevenLabs + ffmpeg.

We want to add a parallel **"script" mode** alongside the existing spreadsheet mode, toggled by a slider on the create page (default = script). In script mode the user writes a free-form meditation in a single textarea using a small subset of ElevenLabs-style markup:

- plain text → spoken segment
- `<break time="3.5s" />` → pause
- `[Tibetan Singing Bowl]` → sound effect (case-insensitive match on `SoundFile.name`)
- `{speed=0.9}…{/speed}` → per-segment TTS speed override

Tokens are visually highlighted in the editor. The script source is persisted on the meditation row so future LLM pipelines can read, generate, and iterate on Go-Lightly-style scripts.

User-confirmed design choices:

- New dedicated endpoint `POST /meditations/create/script` (existing route untouched)
- Persist `scriptSource` + `sourceMode` on `Meditation`
- Sound brackets resolve via case-insensitive match on `SoundFile.name`
- v1 syntax includes `<break>`, `[Sound]`, **and** `{speed=…}…{/speed}`

## Out of scope (v1)

- Editing an existing meditation's script (read-only after create — same as today's spreadsheet)
- Aliases / multi-name sound lookup (single canonical name only)
- Full ElevenLabs SSML (only the three tokens above)
- LLM generation endpoint itself — this change enables it but does not ship it
- Bidirectional sync between the two editors — switching modes does not translate content

---

## Step 1 — Script parser (shared module)

Create `shared-types/src/scriptParser.ts` exporting:

```ts
export type ScriptParseError = { message: string; index: number };
export type ScriptParseResult =
  | { ok: true; elements: MeditationElement[] }
  | { ok: false; errors: ScriptParseError[] };

export function parseMeditationScript(
  script: string,
  soundLookup: (bracketText: string) => SoundFile | null,
): ScriptParseResult;
```

Grammar (single forward pass, regex-based):

| Token | Pattern | Produces |
|---|---|---|
| Pause | `<break\s+time="(\d+(?:\.\d+)?)s"\s*/>` | `{ pause_duration: "<seconds>" }` |
| Sound | `\[([^\]\n]+)\]` | `{ sound_file: <SoundFile.filename> }` after lookup |
| Speed open/close | `\{speed=(\d+(?:\.\d+)?)\}` … `\{/speed\}` | wraps inner text segments with `speed` field |
| Text | everything else, trimmed; collapse internal whitespace; split across tokens | `{ text, speed?, voice_id? (omitted, defaults applied later) }` |

Rules:

- Empty/whitespace-only text between tokens is skipped (no zero-length speech elements).
- Sounds not found in `soundLookup` yield a `ScriptParseError` with the offending bracket index — do not silently drop.
- Unclosed `{speed=…}` block, malformed `<break>`, or out-of-range speed (0.7–1.3) / pause (>0 ≤ 300) are errors. Reuse range constants from [web/src/lib/utils/validation.ts](../web/src/lib/utils/validation.ts) — extract to `shared-types` to share with both web and api.
- `id` on each `MeditationElement` is assigned by index (1-based).

Why in `shared-types`: both [web](../web/src/components/forms/CreateMeditationForm.tsx) (for live preview / inline error highlighting) and [api](../api/src/routes/meditations.ts) (as source of truth before queueing) consume it. Today `shared-types` only contains types, so this is a small expansion of its remit — keep the dist build untouched (already compiles `src/**`).

Add unit tests at `shared-types/tests/scriptParser.test.ts` (mirror the jest config the api/worker use; or just add jest to shared-types). Cover: pure text, leading/trailing pause, sound + pause + sound, unknown bracket, malformed break, nested/unclosed speed block, speed/pause out of range, multi-line input, unicode.

---

## Step 2 — DB model + types

**Update `Meditation` model** ([db-models/src/models/Meditation.ts](../db-models/src/models/Meditation.ts)):

Add two columns:

- `sourceMode: ENUM("spreadsheet", "script") NOT NULL DEFAULT 'spreadsheet'` (field: `source_mode`)
- `scriptSource: TEXT NULL` (field: `script_source`)

The DB uses `sequelize.sync()` (no migrations folder — see [db-models/src/index.ts](../db-models/src/index.ts) line 18), so dev environments will pick up the new columns automatically. For shared/staging DBs, run:

```sql
ALTER TABLE meditations
  ADD COLUMN source_mode VARCHAR(16) NOT NULL DEFAULT 'spreadsheet',
  ADD COLUMN script_source TEXT NULL;
```

**Update shared types** ([shared-types/src/meditation.ts](../shared-types/src/meditation.ts)):

- Add `SourceMode = "spreadsheet" | "script"`.
- Add optional `sourceMode?: SourceMode` and `scriptSource?: string | null` to `Meditation`.
- Add new request type:

```ts
export type CreateMeditationScriptRequest = {
  title: string;
  description?: string;
  visibility: MeditationVisibility;
  script: string;
};
// reuses CreateMeditationResponse
```

**Update mapper** at [api/src/routes/meditations.ts](../api/src/routes/meditations.ts) line 25 (`mapMeditationRecord`) to surface `sourceMode` and `scriptSource` on GET responses so the web can render the script back in detail views (future-friendly; not strictly required by v1 UI).

---

## Step 3 — API: new endpoint `POST /meditations/create/script`

Add to [api/src/routes/meditations.ts](../api/src/routes/meditations.ts), mirroring the existing `/create` handler:

1. `requireAuth`, validate `{ title, description?, visibility, script }`. Script must be non-empty after trim, ≤ 20 KB (documented cap to avoid abuse).
2. Load all `SoundFile` rows once, build a `Map<string, SoundFile>` keyed by `name.trim().toLowerCase()`.
3. Call `parseMeditationScript(script, lookup)`. On `ok: false`, throw `AppError(400, "SCRIPT_PARSE_ERROR", …)` returning the structured errors (message + index) so the web can highlight them.
4. With `elements`, run the **same transaction** as `/create`: insert `Meditation` (with `sourceMode: "script"`, `scriptSource: rawScript`) and one `JobQueue` row per element, using the existing `deriveType` + per-type `inputData`/`filePath` logic. Factor the shared body into a helper:

```ts
// api/src/services/meditations/createMeditationFromElements.ts
async function createMeditationFromElements(opts: {
  userId: number;
  title: string;
  description: string | null;
  visibility: "public" | "private";
  elements: MeditationElement[];
  sourceMode: SourceMode;
  scriptSource: string | null;
}): Promise<Meditation>;
```

Then both `/create` and `/create/script` are thin wrappers around it. This avoids two divergent copies of the queueing logic.

5. `void notifyWorker(meditation.id, "intake")` and return `201` with `{ message, queueId, filePath: "" }` — identical to today.

**No worker changes are needed.** The worker consumes JobQueue rows, which are identical regardless of source mode.

Add a route test `api/tests/meditations/createScript.routes.test.ts` mirroring [api/tests/meditations/meditations.routes.test.ts](../api/tests/meditations/meditations.routes.test.ts). Cover: happy path, unknown sound name, malformed break, missing fields, auth required, and that `JobQueue.create` is called the same way as the spreadsheet route for an equivalent script.

---

## Step 4 — Web: API client

In [web/src/lib/api/meditations.ts](../web/src/lib/api/meditations.ts), add `createMeditationScript(payload: CreateMeditationScriptRequest)` modeled on the existing `createMeditation` helper. Surface backend parse errors (the structured `{ message, index }[]`) to the caller.

---

## Step 5 — Web: script editor component

New component `web/src/components/forms/ScriptMeditationEditor.tsx`.

Layout:

- Title + description + visibility fields (reuse the same form atoms as `CreateMeditationForm`)
- Main textarea: **mirror-overlay highlighting pattern** — a `<textarea>` (transparent text, real input) layered over a `<pre aria-hidden>` that re-renders the same string with `<span>`-wrapped tokens. Synchronize scroll and dimensions. This is the standard React approach for highlight-in-place and avoids contenteditable foot-guns (selection, IME, copy-paste).
  - Token CSS (Tailwind): break → `font-mono text-primary-600 bg-primary-50 rounded px-1`; sound → `font-mono text-emerald-700 bg-emerald-50 rounded px-1`; speed block markers → `font-mono text-amber-700`; speech text inside a speed block → italic.
  - All highlight spans use a single sans/serif body font for unchanged speech and a `font-mono` variant for tokens so the visual change is obvious but legible (matches the user's "noticeably different but still pleasant" ask).
- Sidebar / helper region: list of available sound names fetched from `getSoundFiles()` (already exists), each clickable to insert `[Name]` at the cursor.
- Live parse: run `parseMeditationScript` on every change (debounced ~150 ms) and render any errors inline below the textarea with the offending substring underlined in the overlay.
- Submit button disabled while there are parse errors.

On submit: call `createMeditationScript`. On `SCRIPT_PARSE_ERROR` from the server, surface the same way as client-side errors (server is source of truth).

---

## Step 6 — Web: mode toggle on the create page

In [web/src/app/page.tsx](../web/src/app/page.tsx), wrap `CreateMeditationForm` and the new `ScriptMeditationEditor` in a sibling toggle:

- Tailwind segmented control (two-segment pill, no new library). Labels: **Script** (default) / **Spreadsheet**.
- Persist the user's last choice in `localStorage` so refreshes keep their mode (the toggle remembers, default stays **Script** for first-time users).
- Render only the active editor; both editors maintain their own local state — switching modes preserves each side independently within a session, but does **not** translate content between modes.

No changes to `TableMeditation` — meditations created either way display identically.

---

## Step 7 — Verification

End-to-end:

1. Run `npm install` from repo root if shared-types gained a `jest` dep.
2. `npm run build` for `shared-types`, `db-models`, `api`, `worker-node`, `web` (existing scripts).
3. Start the api + worker + web. Sign in, open the create page.
4. **Script mode (happy path):** Paste:

   ```
   Welcome. Close your eyes.
   <break time="2s" />
   [Tibetan Singing Bowl]
   <break time="1s" />
   {speed=0.9}Take a slow breath in.{/speed}
   ```

   Submit. Confirm the meditation row has `source_mode='script'` and `script_source` set, JobQueue has 5 rows in correct sequence (text, pause, sound, pause, text), and the worker renders a playable mp3.
5. **Script mode (errors):** Use `[Made Up Sound]` — submit blocked client-side; force-submit via curl confirms server returns 400 `SCRIPT_PARSE_ERROR` with bracket index.
6. **Spreadsheet mode (regression):** Build a meditation the old way — should be byte-identical behavior to today (route, payload, DB, worker output). `source_mode` should be `'spreadsheet'`.
7. **Tests:** `npm test -w shared-types`, `npm test -w api`, `npm test -w worker-node` all green.

---

## Critical files

### To modify

- [shared-types/src/meditation.ts](../shared-types/src/meditation.ts) — add types
- `shared-types/src/scriptParser.ts` (new) + tests
- [db-models/src/models/Meditation.ts](../db-models/src/models/Meditation.ts) — add columns
- [api/src/routes/meditations.ts](../api/src/routes/meditations.ts) — add `/create/script`
- `api/src/services/meditations/createMeditationFromElements.ts` (new) — extract shared queueing logic
- `api/tests/meditations/createScript.routes.test.ts` (new)
- [web/src/lib/api/meditations.ts](../web/src/lib/api/meditations.ts) — add client
- `web/src/components/forms/ScriptMeditationEditor.tsx` (new)
- [web/src/app/page.tsx](../web/src/app/page.tsx) — mount the mode toggle

### Reused (no changes)

- [worker-node/src/processor/processMeditation.ts](../worker-node/src/processor/processMeditation.ts) — consumes JobQueue, agnostic to source mode
- [worker-node/src/services/elevenLabs.ts](../worker-node/src/services/elevenLabs.ts), [concatenator.ts](../worker-node/src/services/concatenator.ts) — no change
- [api/src/services/workerClient.ts](../api/src/services/workerClient.ts) — no change
- [db-models/src/models/JobQueue.ts](../db-models/src/models/JobQueue.ts), [SoundFile.ts](../db-models/src/models/SoundFile.ts) — no change
