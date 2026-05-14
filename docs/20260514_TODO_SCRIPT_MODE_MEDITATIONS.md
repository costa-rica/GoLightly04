---
created_at: 2026-05-14
updated_at: 2026-05-14
created_by: claude (opus-4.7)
modified_by: codex (gpt-5)
---

# TODO — Script-mode meditation creation

Implementation checklist for the design in [20260514_SCRIPT_MODE_MEDITATIONS_V02.md](20260514_SCRIPT_MODE_MEDITATIONS_V02.md). Read that file first — it has the rationale, contract decisions, and the codex review that motivated V02.

## Workflow rules

- Complete phases in order. Phase 2 depends on Phase 1; Phase 5 depends on Phases 2–4; etc.
- After each phase: run the project's tests, run typecheck/build for changed packages, then check the boxes. Phase commit message references this file and the phase (e.g. `feat: script-mode phase 3 — strict scanner parser` referencing `docs/20260514_TODO_SCRIPT_MODE_MEDITATIONS.md`).
- The repo is a TypeScript workspace. The relevant per-package commands:
  - `npm run build -w shared-types`
  - `npm run build -w db-models`
  - `npm run build -w api` and `npm test -w api`
  - `npm run build -w worker-node` and `npm test -w worker-node`
  - `npm run typecheck -w web` (or `npm run build -w web`)
- Never bypass hooks. If a hook fails, fix the root cause.

---

## Phase 1 — Shared-types foundation

Goal: land all the shared types and validation constants that later phases depend on, plus a working Jest harness in `shared-types`.

- [x] Create `shared-types/src/validation.ts` exporting `SPEED_MIN=0.7`, `SPEED_MAX=1.3`, `PAUSE_MIN=0`, `PAUSE_MAX=300`, `TITLE_MAX=100`, `DESCRIPTION_MAX=300`, `SCRIPT_MAX_BYTES=20_000`.
- [x] Refactor [web/src/lib/utils/validation.ts](../web/src/lib/utils/validation.ts) to re-export these constants and remove the duplicate literals. Confirm the web build still passes and no validation message text changes.
- [x] Extend [shared-types/src/meditation.ts](../shared-types/src/meditation.ts):
  - add `export type SourceMode = "spreadsheet" | "script";`
  - add optional `sourceMode?: SourceMode` and `scriptSource?: string | null` to `Meditation`
  - add `export type CreateMeditationScriptRequest = { title: string; description?: string; visibility: MeditationVisibility; script: string };`
  - add the in-storage job input types: `TextJobInputData`, `SoundJobInputData`, `PauseJobInputData` (numeric `speed` and `pause_duration`)
  - add `export type ScriptParseError = { message: string; index: number };` and `ScriptParseResult` union (used by Phase 3)
- [x] Re-export new types from `shared-types/src/index.ts`.
- [x] Set up Jest in `shared-types`:
  - add `shared-types/jest.config.ts` mirroring `api/jest.config.ts`
  - add `shared-types/tests/tsconfig.json` if api has one
  - add `"test": "jest"` to `shared-types/package.json` and dev-deps `jest`, `@types/jest`, `ts-jest` matching the versions in `api/package.json`
  - add a trivial placeholder test `shared-types/tests/validation.test.ts` asserting the constants are exported with the expected values, to prove the harness works
- [x] **Checks**: `npm install` from repo root, `npm run build -w shared-types`, `npm test -w shared-types`, `npm run build -w web`. All pass.
- [x] **Commit**: `feat: script-mode phase 1 — shared-types foundation` referencing this TODO.

---

## Phase 2 — Speed normalization (closes latent /create bug)

Goal: numeric `speed` (and `pause_duration`) reach `JobQueue.inputData` from every code path. Today the spreadsheet route writes string speed and the worker silently drops it — see V02 Step 0.

- [x] Create `api/src/services/meditations/normalize.ts` exporting:
  - `normalizeSpeed(raw: string | number | undefined): number | undefined` — returns `undefined` on null/empty; parses string via `Number()`; rejects `NaN`; range-checks against `SPEED_MIN`/`SPEED_MAX` from shared-types/validation; throws `AppError(400, "VALIDATION_ERROR", …)` on out-of-range.
  - `normalizePauseDuration(raw: string | number | undefined): number | undefined` — same shape, range `PAUSE_MIN` (exclusive) ≤ value ≤ `PAUSE_MAX`.
- [x] Update [api/src/routes/meditations.ts](../api/src/routes/meditations.ts) `POST /meditations/create` (currently lines ~59–145) so the `inputData = JSON.stringify(...)` block for text/pause uses the normalizers:
  - text: `{ text, voice_id, speed: normalizeSpeed(element.speed) }`
  - pause: `{ pause_duration: normalizePauseDuration(element.pause_duration) }`
- [x] Add unit tests for `normalize.ts` covering: undefined → undefined; `"1.0"` → `1.0`; `1.0` → `1.0`; `""` → undefined; `"abc"` → 400; below min → 400; above max → 400.
- [x] Update [api/tests/meditations/meditations.routes.test.ts](../api/tests/meditations/meditations.routes.test.ts) so a happy-path test asserts the `JobQueue.create` call received `inputData` JSON whose parsed `speed` is the **number** `0.9` (not `"0.9"`). This guards the regression.
- [x] **Checks**: `npm test -w api`, `npm run build -w api`. All pass.
- [x] **Commit**: `fix: script-mode phase 2 — normalize JobQueue speed to number` referencing this TODO. Note in the body that this changes audible behavior of existing spreadsheet meditations (users will now hear non-default speeds they had previously set).

---

## Phase 3 — Strict scanner parser

Goal: a parser in shared-types that converts a script string into `MeditationElement[]` or a list of indexed errors, with no silent fall-through of malformed markup.

- [x] Create `shared-types/src/scriptParser.ts` exporting `parseMeditationScript(script, soundLookup)` per V02 Step 1b.
- [x] Implementation is a left-to-right scanner. At every position, if the cursor matches a reserved start sequence (`<break`, `[`, `{speed=`, `{/speed}`), the whole construct must parse strictly or emit an indexed `ScriptParseError` and advance past the start sequence so the scanner does not loop. Otherwise, accumulate the character into the current text buffer.
- [x] Speed blocks use a stack so nested/unclosed blocks are detected. Speech text inside a speed block carries `speed: <number>` on the resulting `MeditationElement` (numeric, not string — must align with the Phase 2 contract).
- [x] Sound lookup is injected so the parser is environment-agnostic. Unknown bracket → `ScriptParseError("Unknown sound: <name>", index)`. The result `MeditationElement.sound_file` is the `SoundFile.filename` (not the bracket text).
- [x] Re-export `parseMeditationScript` and types from `shared-types/src/index.ts`.
- [x] Add `shared-types/tests/scriptParser.test.ts` with these required cases (every malformed input must be rejected, never silently emitted as speech):
  - [x] pure speech (no tokens)
  - [x] leading and trailing `<break time="1s" />`
  - [x] sound + pause + sound interleaved with speech
  - [x] `{speed=0.9}slow{/speed}` produces one text element with numeric speed `0.9`
  - [x] `<break time="3" />` (missing `s`) → error
  - [x] `<break time="3s">` (not self-closed) → error
  - [x] `<break time="abc s" />` → error
  - [x] `{speed=.9}hello{/speed}` (no integer part) → error
  - [x] `{speed=1.0}hello` (unclosed) → error at the opening index
  - [x] `{/speed}` with no matching open → error
  - [x] `[Unclosed sound` (no `]`) → error
  - [x] `[Made Up Sound]` with empty sound lookup → error
  - [x] speed out of range (`{speed=2.0}…{/speed}`) → error
  - [x] pause out of range (`<break time="999s" />`) → error
  - [x] empty/whitespace-only text between tokens is skipped (no zero-length speech elements)
  - [x] multi-line input and unicode characters survive round-trip
  - [x] 1-based ids are assigned to elements in source order
- [x] **Checks**: `npm test -w shared-types`, `npm run build -w shared-types`. All pass.
- [x] **Commit**: `feat: script-mode phase 3 — strict scanner parser` referencing this TODO.

---

## Phase 4 — DB schema + sound-name uniqueness

Goal: `meditations` has the two new columns, `sound_files` has a normalized-name uniqueness index, and the upload route enforces it before the DB does.

- [x] **Preflight**: run on the local dev database and resolve any rows returned before going further:
  ```sql
  SELECT LOWER(BTRIM(name)) AS normalized_name,
         COUNT(*) AS row_count,
         array_agg(id ORDER BY id) AS ids
  FROM sound_files
  GROUP BY 1
  HAVING COUNT(*) > 1;
  ```
  If there are duplicates, merge them manually (re-point any `meditations.meditation_array[].sound_file` references to the surviving row's `filename`, delete the others). Document the resolution in the phase commit body.
- [x] Apply on the local dev DB:
  ```sql
  ALTER TABLE meditations
    ADD COLUMN IF NOT EXISTS source_mode VARCHAR(16) NOT NULL DEFAULT 'spreadsheet',
    ADD COLUMN IF NOT EXISTS script_source TEXT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS sound_files_name_normalized_idx
    ON sound_files (LOWER(BTRIM(name)));
  ```
- [x] Update [db-models/src/models/Meditation.ts](../db-models/src/models/Meditation.ts) to declare `sourceMode` and `scriptSource` with the same field names and types as the new columns (`VARCHAR(16)` mapped to the TS union, default `"spreadsheet"`; `scriptSource` nullable TEXT). Do **not** use a Postgres ENUM here.
- [x] Update [db-models/src/models/SoundFile.ts](../db-models/src/models/SoundFile.ts) — add a comment block referencing the normalized-name unique index (the index lives in raw SQL since Sequelize can't express functional indexes cleanly). No model change required, just the documentation note.
- [x] Update [api/src/routes/sounds.ts](../api/src/routes/sounds.ts) (the `POST /sounds/upload` handler): before creating the row, look for an existing `SoundFile` whose `LOWER(BTRIM(name))` matches the incoming name; if found, throw `AppError(409, "DUPLICATE_SOUND_NAME", …)` with a clear message. This returns a clean error instead of a raw DB constraint violation.
- [x] Update the `mapMeditationRecord` helper at [api/src/routes/meditations.ts:25](../api/src/routes/meditations.ts) to expose `sourceMode` and `scriptSource` on GET responses.
- [x] Add deploy-runbook section to V02 (or a new short `docs/DEPLOY_RUNBOOK_SCRIPT_MODE.md`) capturing: preflight → ALTER → CREATE INDEX → deploy api/worker → deploy web. Reuse the V02 wording.
- [x] Add an api test asserting `POST /sounds/upload` returns 409 on duplicate normalized names.
- [x] **Checks**: `npm run build -w db-models`, `npm test -w api`, `npm run build -w api`. All pass.
- [x] **Commit**: `feat: script-mode phase 4 — DB schema + sound-name uniqueness` referencing this TODO.

---

## Phase 5 — API endpoint `POST /meditations/create/script`

Goal: the new endpoint exists, both `/create` routes share one queueing helper, and route tests cover the new contract end-to-end.

- [ ] Create `api/src/services/meditations/createMeditationFromElements.ts` exporting an async function with the signature in V02 Step 3. It runs the existing `sequelize.transaction(...)` block from `meditations.ts:80–135` — Meditation insert + per-element `JobQueue.create` using `deriveType` and normalized speed/pause. Returns the created `Meditation` row.
- [ ] Refactor `POST /meditations/create` to delegate to `createMeditationFromElements` with `sourceMode: "spreadsheet"` and `scriptSource: null`. Behavior must remain identical (same response shape, same notifyWorker call, same status codes). The existing route tests should still pass without changes other than the speed assertion from Phase 2.
- [ ] Add `POST /meditations/create/script` in [api/src/routes/meditations.ts](../api/src/routes/meditations.ts):
  - `requireAuth`
  - validate `{ title, description?, visibility, script }`; reject empty trimmed script and scripts exceeding `SCRIPT_MAX_BYTES`
  - load all `SoundFile` rows once; build `Map<string, SoundFile>` keyed by `name.trim().toLowerCase()`
  - call `parseMeditationScript(script, lookup)`. On `ok: false`, throw `AppError(400, "SCRIPT_PARSE_ERROR", message)` with the structured `details: ScriptParseError[]` attached so the response body exposes them
  - call `createMeditationFromElements({ ..., elements, sourceMode: "script", scriptSource: rawScript })`
  - `void notifyWorker(meditation.id, "intake")`
  - return `201` with `{ message, queueId, filePath: "" }`
- [ ] Confirm `AppError` supports a structured `details` field (or add it minimally). Update the API error response shape if needed; document it.
- [ ] Add `api/tests/meditations/createScript.routes.test.ts` covering:
  - [ ] happy path: text + pause + sound + speed block → 201, `Meditation.create` called with `sourceMode: "script"` and `scriptSource: rawScript`, `JobQueue.create` called N times with correct sequence + types
  - [ ] numeric speed in `inputData` for the speed-block segment
  - [ ] unknown sound name → 400 `SCRIPT_PARSE_ERROR` with `details` array
  - [ ] malformed `<break>` → 400 `SCRIPT_PARSE_ERROR`
  - [ ] missing `title` / `script` / `visibility` → 400 `VALIDATION_ERROR`
  - [ ] no auth → 401
  - [ ] oversize script → 400
- [ ] **Checks**: `npm test -w api`, `npm run build -w api`. All pass.
- [ ] **Commit**: `feat: script-mode phase 5 — POST /meditations/create/script` referencing this TODO.

---

## Phase 6 — Web API client + script editor

Goal: the web can submit a script to the new endpoint, and the script editor is a usable component (even if not wired into the page yet).

- [ ] Add `createMeditationScript(payload: CreateMeditationScriptRequest)` to [web/src/lib/api/meditations.ts](../web/src/lib/api/meditations.ts), modeled on the existing `createMeditation`. Surface the structured `details: ScriptParseError[]` from a 400 response so the caller can map errors back to source indexes.
- [ ] Create `web/src/components/forms/ScriptMeditationEditor.tsx`:
  - title, description, visibility inputs reusing the same atoms as `CreateMeditationForm`
  - mirror-overlay highlighting: a transparent `<textarea>` over a `<pre aria-hidden>` that renders the same string with token spans. Synchronize scroll position (`onScroll` → set `pre.scrollTop/Left`) and ensure the `<pre>` uses the identical font, size, line-height, padding, and `white-space: pre-wrap` to keep glyph positions aligned.
  - token styling (Tailwind):
    - `<break ...>` → `font-mono text-primary-600 bg-primary-50 rounded px-1`
    - `[Sound Name]` (known) → `font-mono text-emerald-700 bg-emerald-50 rounded px-1`
    - `[Sound Name]` (still loading) → dashed underline, neutral color
    - `{speed=…}` / `{/speed}` → `font-mono text-amber-700`
    - speech text within an active speed block → italic
  - debounced (~150 ms) live parse using `parseMeditationScript` from `@golightly/shared-types`
  - render `ScriptParseError[]` below the textarea with index ranges underlined in the overlay
  - sidebar listing available sound names from `getSoundFiles()`; clicking a name inserts `[Name]` at the cursor
  - submit button disabled when (a) there are parse errors, (b) title is empty, or (c) the sound catalog is still loading and unknown brackets exist (V02 finding #6)
  - on submit failure with `SCRIPT_PARSE_ERROR`, replace local diagnostics with the server's `details[]` — server is the authority of record
- [ ] **Checks**: `npm run build -w web` (or `npm run typecheck -w web`). Passes. Component renders in isolation; verify in browser if needed (it isn't yet mounted on the page).
- [ ] **Commit**: `feat: script-mode phase 6 — web API client + script editor` referencing this TODO.

---

## Phase 7 — Mode toggle on the create page

Goal: users can switch between Script (default) and Spreadsheet modes on the home page, and the choice persists across reloads.

- [ ] In [web/src/app/page.tsx](../web/src/app/page.tsx), add a segmented control above the editor area with two segments: **Script** (default) and **Spreadsheet**. Use plain Tailwind — no new libraries.
- [ ] Persist the selected mode in `localStorage` under a stable key (e.g. `golightly.createMode`). Default for new users is `"script"`. Read on mount, write on change.
- [ ] Render only the active editor; keep each editor's local state mounted so within-session switches don't lose work. Do **not** attempt to translate content between modes — out of scope for v1.
- [ ] Confirm `TableMeditation` and the rest of the page render unchanged regardless of mode.
- [ ] **Checks**: `npm run build -w web`. Manually verify the toggle in a browser: refresh keeps the selection, both editors mount their own state.
- [ ] **Commit**: `feat: script-mode phase 7 — create-page mode toggle` referencing this TODO.

---

## Phase 8 — End-to-end verification

Goal: run the full V02 Step 7 runbook against a live stack and confirm every assertion. No new commits expected unless bugs surface; in that case fix in place, re-test, and commit fixes referencing this phase.

- [ ] Bring up api, worker, web with a real ElevenLabs key and a sound catalog containing at least "Tibetan Singing Bowl".
- [ ] **Speed regression check**: create via the spreadsheet UI with speed `0.9`; inspect `JobQueue.inputData` row and confirm `speed === 0.9` (number). Listen — should sound slower than env default.
- [ ] **Script mode happy path**: submit
  ```
  Welcome. Close your eyes.
  <break time="2s" />
  [Tibetan Singing Bowl]
  <break time="1s" />
  {speed=0.9}Take a slow breath in.{/speed}
  ```
  Confirm the `meditations` row has `source_mode='script'` and `script_source` populated; `JobQueue` has 5 rows in correct sequence (text, pause, sound, pause, text); the final mp3 plays.
- [ ] **Script mode unknown sound**: submit `[Made Up Sound]` — submit button blocked client-side; force-POST via curl returns 400 `SCRIPT_PARSE_ERROR` with bracket index in `details`.
- [ ] **Script mode malformed tokens**: submit each of the eight malformed examples from Phase 3 — each returns 400 `SCRIPT_PARSE_ERROR`. None reach the worker.
- [ ] **Spreadsheet regression**: create via the spreadsheet UI — `source_mode='spreadsheet'`, `script_source` NULL, identical render behavior to pre-change (except speed now honored).
- [ ] **Duplicate sound upload**: attempt to upload a second sound named `"tibetan singing bowl"` → 409.
- [ ] **Test sweep**: `npm test -w shared-types && npm test -w api && npm test -w worker-node` all green.
- [ ] **Commit (if needed)**: any verification fixes use `fix: script-mode phase 8 — <subject>` referencing this TODO.
