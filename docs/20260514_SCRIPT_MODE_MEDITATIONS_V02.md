---
created_at: 2026-05-14
updated_at: 2026-05-14
created_by: claude (opus-4.7)
modified_by: claude (opus-4.7)
---

# Script-mode meditation creation — V02

Supersedes [20260514_SCRIPT_MODE_MEDITATIONS.md](20260514_SCRIPT_MODE_MEDITATIONS.md). Revised in response to [the codex assessment](20260514_SCRIPT_MODE_MEDITATIONS_ASSESSMENT_CODEX.md). The shape of the feature is unchanged; this revision tightens three high-severity correctness issues and three medium concerns the assessment surfaced.

## Changes vs. V01 (at a glance)

| # | Concern | V01 said | V02 says |
|---|---|---|---|
| 1 | TTS speed override | Parser emits string `speed` like spreadsheet does | Normalize `speed` to a **number** in `JobQueue.inputData`. Fix is applied to **both** routes so the latent spreadsheet bug is closed at the same time. |
| 2 | DB rollout | `sequelize.sync()` would auto-add columns in dev | `sync()` does not ALTER existing tables. The `ALTER TABLE` is **required everywhere** — local, dev, staging, prod — and is a hard prerequisite for Step 3. |
| 3 | Parser strictness | Regex-only, single forward pass | **Scanner-based**: any reserved start sequence (`<break`, `[`, `{speed=`, `{/speed}`) must parse strictly or yield an indexed `SCRIPT_PARSE_ERROR`. No "looks like a token, falls back to speech" path. |
| 4 | Duplicate sound names | Case-insensitive name match, undefined for duplicates | Add a Sequelize-level **unique index on `lower(trim(name))`** for `sound_files`, enforced in the upload route as well. Lookup becomes deterministic by construction. Includes a **preflight SQL query** to surface and resolve pre-existing duplicates before the index is created. |
| 5 | shared-types tests | "Mirror jest or add jest" | Concrete subtask: add `jest.config.ts`, `tests/tsconfig.json`, and a `test` script to `shared-types/package.json`. Wire `npm test -w shared-types` into Step 7. |
| 6 | UI loading vs. invalid sound | Sound list assumed loaded | Sound validation is **gated on the catalog being loaded**; syntax errors render immediately, sound errors render with a "validating…" placeholder while `getSoundFiles()` is in flight. Server is final authority on submit. |

The Context, Out-of-scope, and overall architecture sections from V01 still stand. Refer to V01 for those; this file only repeats steps where content changed.

---

## Step 0 — Prerequisite: speed-type normalization

This step did not exist in V01 and **must land first** because Steps 1 and 3 depend on it.

The bug, today: [api/src/routes/meditations.ts:106](../api/src/routes/meditations.ts) writes
```ts
JSON.stringify({ text, voice_id, speed: element.speed })
```
where `element.speed` is a string (e.g. `"1.0"`). [worker-node/src/processor/processMeditation.ts:127](../worker-node/src/processor/processMeditation.ts) then reads it back and only forwards it to ElevenLabs when `typeof inputData.speed === "number"`. The string never matches, so **every meditation today renders at the env default speed**, regardless of what the user picked in the spreadsheet.

Fix:

1. Add a helper `normalizeSpeed(raw: string | number | undefined): number | undefined` in `api/src/services/meditations/normalize.ts` (new). It:
   - returns `undefined` when input is null/empty/undefined.
   - parses strings via `Number(raw)` and rejects `NaN` with a 400 validation error.
   - clamps validation: `SPEED_MIN` ≤ value ≤ `SPEED_MAX` (constants extracted to `shared-types/src/validation.ts` — see Step 1).
2. Both `/meditations/create` (existing) and `/meditations/create/script` (new) call `normalizeSpeed` before building `inputData`, so `JobQueue.inputData.speed` is **always a number or absent**. No worker change required.
3. Update the existing route test to assert numeric speed reaches `JobQueue.create`.
4. Update `MeditationElement` in shared-types: leave the wire-level `speed?: string` alone (don't break the existing UI), but document that **on-the-wire stays string, in-storage becomes number**. Add a new `JobInputData` type co-located with the helper to make the contract explicit:
   ```ts
   export type TextJobInputData = { text: string; voice_id?: string; speed?: number };
   export type SoundJobInputData = { sound_file: string };
   export type PauseJobInputData = { pause_duration: number };
   ```
   (`pause_duration` should be normalized the same way for symmetry — quick win.)

This is a **behavior change to the existing spreadsheet flow** that an admin should be aware of: users who set speeds in the past will now actually hear them. Flag this in the commit message.

---

## Step 1 — Shared parser + validation constants

Same intent as V01, with two adjustments:

### 1a. Move validation constants into `shared-types`

New `shared-types/src/validation.ts`:
```ts
export const SPEED_MIN = 0.7;
export const SPEED_MAX = 1.3;
export const PAUSE_MIN = 0;      // exclusive lower bound enforced separately
export const PAUSE_MAX = 300;
export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 300;
export const SCRIPT_MAX_BYTES = 20_000;
```
[web/src/lib/utils/validation.ts](../web/src/lib/utils/validation.ts) is refactored to re-export these so behavior stays identical.

### 1b. Strict scanner parser (replaces the regex-only design)

`shared-types/src/scriptParser.ts` is implemented as a left-to-right scanner over the source string. At each position:

1. If the cursor sees `<break` → consume the whole token strictly with `<break\s+time="(\d+(?:\.\d+)?)s"\s*/>`. If the strict pattern fails to match starting at this position, emit `ScriptParseError("Malformed <break/> tag", index)` and advance past `<break` so we don't loop.
2. If the cursor sees `[` → require a closing `]` on the same line. If absent, emit `ScriptParseError("Unclosed sound bracket", index)`.
3. If the cursor sees `{speed=` → consume strictly with `\{speed=(\d+(?:\.\d+)?)\}`, push the speed onto a stack, validate range. If malformed → error.
4. If the cursor sees `{/speed}` → pop the stack. If empty → `ScriptParseError("Unmatched {/speed}", index)`.
5. Otherwise, accumulate one character into the current text buffer.

At end-of-input: any non-empty speed stack → `ScriptParseError("Unclosed {speed=…} block", openIndex)`.

Other rules unchanged from V01 (whitespace collapsing, skip empty text, 1-based ids, sound lookup via injected callback, all errors carry source index).

### 1c. Required malformed-token test cases (new)

The codex assessment lists examples; the unit tests must include and reject:

- `<break time="3" />` (missing `s` suffix)
- `<break time="3s">` (not self-closed)
- `<break time="abc s" />`
- `{speed=.9}hello{/speed}` (no integer part)
- `{speed=1.0}hello` (unclosed)
- `{/speed}` with no matching open
- `[Unclosed sound` (no `]`)
- `[Unknown Sound Name]` (parses fine syntactically; sound-lookup returns null → error)

None of these may appear as spoken text in the output `elements`.

### 1d. Jest setup for `shared-types`

Concrete subtask:
- Add `shared-types/jest.config.ts` (mirror api's jest config).
- Add `shared-types/tests/tsconfig.json` if api/worker have one.
- Add `"test": "jest"` to `shared-types/package.json`.
- Add `jest` + `@types/jest` + `ts-jest` to its devDependencies.

`npm test -w shared-types` becomes a real command and is wired into Step 7.

---

## Step 2 — DB model + rollout

Schema additions (unchanged from V01): `source_mode` and `script_source` on `meditations`. **Codex was right that V01's "sync() handles dev" claim was wrong** — `syncAll()` calls `sequelize.sync()` without `alter: true`, which creates missing tables but never alters existing ones.

Treat the SQL below as a hard prerequisite **on every database that already contains a `meditations` table**, including local dev:

```sql
ALTER TABLE meditations
  ADD COLUMN IF NOT EXISTS source_mode VARCHAR(16) NOT NULL DEFAULT 'spreadsheet',
  ADD COLUMN IF NOT EXISTS script_source TEXT NULL;
```

Use `VARCHAR(16)` rather than a Postgres `ENUM` (per codex's suggestion), with a TypeScript union (`"spreadsheet" | "script"`) doing the type-level enforcement. This avoids the awkward future "add a value to an enum" migration path.

Also add (new in V02):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS sound_files_name_normalized_idx
  ON sound_files (LOWER(BTRIM(name)));
```

Combined with a Sequelize-level pre-create check in [api/src/routes/sounds.ts](../api/src/routes/sounds.ts) (returning a clean 409 instead of a DB error), this makes case-insensitive name lookup deterministic by construction — no "first row wins" tie-break needed in the parser.

**Preflight for the unique index (V02 addendum):** the `CREATE UNIQUE INDEX` will fail if the table already contains duplicates under the normalized key. Run this **before** the index statement on every environment and resolve any rows it returns:

```sql
-- returns nothing on a clean DB; any row is a blocker
SELECT LOWER(BTRIM(name)) AS normalized_name,
       COUNT(*) AS row_count,
       array_agg(id ORDER BY id) AS ids
FROM sound_files
GROUP BY 1
HAVING COUNT(*) > 1;
```

If duplicates exist, the operator must merge them (re-point any `meditations.meditation_array[].sound_file` references to the surviving row's `filename`, then delete the others) before creating the index. Document this in the deploy runbook — it's the most likely cause of a failed rollout.

Rollout order:
1. Run the preflight; resolve duplicates if any.
2. Apply the `ALTER TABLE meditations …` and `CREATE UNIQUE INDEX …` statements.
3. Deploy api + worker with the new code.
4. Deploy web.

If the API is deployed before the SQL is applied, every meditation insert fails — note this in the deploy runbook section of the docs file.

---

## Step 3 — API endpoint

Same as V01, with the speed normalization from Step 0 baked into the shared helper:

```ts
// api/src/services/meditations/createMeditationFromElements.ts
async function createMeditationFromElements(opts: {
  userId: number;
  title: string;
  description: string | null;
  visibility: "public" | "private";
  elements: MeditationElement[];     // wire format (speed: string)
  sourceMode: SourceMode;
  scriptSource: string | null;
}): Promise<Meditation>;
```

Inside the helper, before writing each `JobQueue` row:
- text → `inputData = { text, voice_id, speed: normalizeSpeed(element.speed) }` (number, not string)
- pause → `inputData = { pause_duration: normalizePause(element.pause_duration) }`
- sound → unchanged

Tests cover (new):
- numeric speed reaches `JobQueue.create` for both `/create` and `/create/script` — guards against regression of the speed bug.
- a script with `{speed=1.1}…{/speed}` results in `inputData.speed === 1.1` (not `"1.1"`).
- parse errors return `{ code: "SCRIPT_PARSE_ERROR", details: ScriptParseError[] }` shape.

---

## Step 4 — Web API client

Unchanged from V01.

---

## Step 5 — Web editor

Same overlay-highlighting design as V01. Add (per codex finding #6):

- The component tracks two states: `parseDiagnostics` (syntactically valid? always shown immediately) and `soundDiagnostics` (only computed once `getSoundFiles()` resolves).
- While the sound catalog is loading, brackets render in a neutral "pending" style (e.g. dashed underline) and the submit button shows "Validating sounds…" rather than being enabled with potentially-wrong errors.
- On submit failure with `SCRIPT_PARSE_ERROR`, the server's `details[]` overrides client diagnostics — the server is the authority of record.

---

## Step 6 — Web mode toggle

Unchanged from V01.

---

## Step 7 — Verification (V02)

End-to-end:

1. **Apply DB SQL on the local dev database first**: (a) run the duplicate-name preflight from Step 2 and resolve any rows it returns, (b) `ALTER TABLE meditations …`, (c) `CREATE UNIQUE INDEX sound_files_name_normalized_idx …`. Without these, the API will 500 on every create and the index step will fail on any DB that already has duplicates.
2. `npm install` (shared-types gains jest deps).
3. `npm run build` across all packages.
4. **Speed regression check (V02-only):** create a meditation through the **existing** spreadsheet UI with speed 0.9 on one of the text rows. Inspect the resulting `JobQueue.inputData` row — `speed` must be the **number** `0.9`, not the string `"0.9"`. Listen to the rendered audio — it should sound slower than the env default. This proves Step 0 closed the latent bug.
5. **Script mode happy path:** same payload as V01 verification.
6. **Script mode malformed-token rejection (V02-only):** submit each of the eight malformed examples in Step 1c via the script editor. Each must produce an indexed parse error and **never** reach the API.
7. **Script mode unknown sound:** submit `[Made Up Sound]` → 400 `SCRIPT_PARSE_ERROR`.
8. **Sound duplicate prevention (V02-only):** attempt to upload a second sound named `"Tibetan Singing Bowl"` → 409 from `/sounds/upload`.
9. **Spreadsheet regression:** unchanged behavior except speed is now honored.
10. `npm test -w shared-types && npm test -w api && npm test -w worker-node` all green.

---

## Critical files

### To modify (changes from V01 marked ★)

- ★ [shared-types/src/validation.ts](../shared-types/src/validation.ts) (new) — shared validation constants
- ★ `shared-types/jest.config.ts`, `shared-types/tests/tsconfig.json`, `shared-types/package.json` — wire up tests
- `shared-types/src/meditation.ts` — add `SourceMode`, new request type, `JobInputData` types (★ new)
- `shared-types/src/scriptParser.ts` (new) — ★ scanner-based, not regex-only
- ★ `api/src/services/meditations/normalize.ts` (new) — speed/pause normalization
- ★ `api/src/services/meditations/createMeditationFromElements.ts` (new) — shared queueing, calls normalizers; both routes route through here
- ★ [api/src/routes/sounds.ts](../api/src/routes/sounds.ts) — reject duplicate normalized names with 409
- [db-models/src/models/Meditation.ts](../db-models/src/models/Meditation.ts) — add columns
- ★ [db-models/src/models/SoundFile.ts](../db-models/src/models/SoundFile.ts) — Sequelize-level note on the normalized-name uniqueness (index lives in DB)
- [api/src/routes/meditations.ts](../api/src/routes/meditations.ts) — add `/create/script`, refactor `/create` through the shared helper
- `api/tests/meditations/createScript.routes.test.ts` (new) — including numeric-speed assertion
- ★ Update `api/tests/meditations/meditations.routes.test.ts` — assert numeric speed in existing route
- [web/src/lib/api/meditations.ts](../web/src/lib/api/meditations.ts) — add client
- `web/src/components/forms/ScriptMeditationEditor.tsx` (new) — with loading-aware sound validation
- [web/src/app/page.tsx](../web/src/app/page.tsx) — mount toggle
- ★ [web/src/lib/utils/validation.ts](../web/src/lib/utils/validation.ts) — re-export shared constants

### Reused unchanged

- All worker-node code — the speed fix lives in the API normalization layer, not the worker.
- `api/src/services/workerClient.ts`, `db-models/src/models/JobQueue.ts`.
