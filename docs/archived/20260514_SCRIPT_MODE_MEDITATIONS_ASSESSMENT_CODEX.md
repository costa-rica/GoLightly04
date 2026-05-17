---
created_at: 2026-05-14
updated_at: 2026-05-14
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Script-mode meditation plan assessment

## Summary

The plan is directionally strong: keeping spreadsheet creation untouched, adding a dedicated script endpoint, persisting the raw script, and converting script input into the existing JobQueue shape are all good choices. The main success risks are around type contracts, database rollout, and parser strictness. Fixing those before implementation will significantly increase the chance this ships cleanly.

## 1. Speed overrides will likely be ignored

- Severity: high
- Current plan: `{speed=0.9}...{/speed}` produces text elements with a `speed` field.
- Existing type: `MeditationElement.speed` is a `string` in `shared-types/src/meditation.ts`.
- Existing API behavior: `/meditations/create` writes `speed: element.speed` into `JobQueue.inputData`.
- Existing worker behavior: `processMeditation.ts` only passes speed through when `typeof inputData.speed === "number"`.
- Result: if the parser emits the same string shape as the spreadsheet route, script speed overrides will silently fall back to the default ElevenLabs speed.

Recommended change:

- Normalize `speed` to a number before writing text jobs to `JobQueue.inputData`.
- Either update `MeditationElement.speed` to support `number | string`, or keep request/UI values as strings and introduce a normalized internal job input type.
- Add tests that assert `JobQueue.create` receives `inputData` with numeric speed and that the worker passes it to `generateSpeech`.
- Consider fixing spreadsheet mode at the same time, since it appears to have the same speed no-op risk.

## 2. `sequelize.sync()` will not add columns to existing tables

- Severity: high
- The plan says dev environments will pick up the new `source_mode` and `script_source` columns automatically because the project uses `sequelize.sync()`.
- In this repo, `syncAll()` calls `sequelize.sync()` without `alter: true`.
- That creates missing tables, but it does not reliably alter existing tables to add columns.
- Result: existing local/dev databases can fail when code tries to write `sourceMode` or `scriptSource`.

Recommended change:

- Treat the `ALTER TABLE meditations ...` SQL as required for every existing database, including local dev databases.
- Add a short rollout note before Step 3: run the database alteration before deploying API code that writes the new fields.
- If this project intentionally avoids migrations, add an idempotent provisioning script or documented manual SQL with `IF NOT EXISTS`.
- Prefer `VARCHAR(16)` plus an app-level union type over a Postgres enum for `source_mode`, because existing models already use Sequelize enums but manual enum alteration can become awkward later.

## 3. Regex-only parsing can accidentally speak malformed markup

- Severity: high
- The parser spec says single forward pass and regex-based.
- It also requires errors for malformed `<break>`, unclosed speed blocks, and invalid token shapes.
- A parser that only matches valid token regexes will treat many malformed tokens as ordinary text, for example:
  - `<break time="3" />`
  - `<break time="3s">`
  - `{speed=.9}hello{/speed}`
  - `[Unclosed sound`
- Result: bad markup may be sent to ElevenLabs as spoken text instead of returning `SCRIPT_PARSE_ERROR`.

Recommended change:

- Use a small scanner/lexer instead of only matching valid regexes.
- Whenever the scanner encounters reserved starts (`<break`, `[`, `{speed=`, `{/speed}`), parse that construct strictly and return an indexed error if it is malformed.
- Keep ordinary `<`, `{`, and `[` characters legal only if the plan explicitly wants them spoken; otherwise document escape rules.
- Add tests where malformed token-looking text is rejected instead of emitted as speech.

## 4. Sound name lookup needs duplicate handling

- Severity: medium
- The plan resolves `[Sound Name]` using `SoundFile.name.trim().toLowerCase()`.
- There is no uniqueness constraint on `sound_files.name`.
- Result: duplicate names can resolve unpredictably depending on query order.

Recommended change:

- Decide the v1 behavior before implementation:
  - reject duplicate normalized sound names during script creation, or
  - enforce uniqueness at upload/model level, or
  - choose a deterministic row and document it.
- The cleanest app behavior is to prevent duplicate normalized sound names when uploading sound files.

## 5. Shared parser tests need explicit package setup

- Severity: medium
- `shared-types` currently has only `build` and `typecheck` scripts and no Jest setup.
- The plan mentions mirroring Jest or adding Jest, but verification already assumes `npm test -w shared-types`.

Recommended change:

- Add a concrete Step 1 subtask:
  - add `shared-types/jest.config.ts`
  - add `shared-types/tests/tsconfig.json` if following api/worker patterns
  - add `"test"` to `shared-types/package.json`
- Include parser tests in the root verification path so the command in Step 7 actually exists.

## 6. UI parsing should distinguish loading from invalid sounds

- Severity: medium
- Live parsing depends on `getSoundFiles()`.
- If the sound list has not loaded yet, a valid script can briefly show unknown-sound errors.

Recommended change:

- Gate sound-name validation until sound files have loaded.
- Show parser syntax errors immediately, but mark sound validation as pending while the list is loading.
- Always rely on the server parse result as final authority on submit.

## Recommended implementation order

1. Add shared validation constants and normalized job input expectations.
2. Fix or codify speed typing before building the parser.
3. Add the strict scanner parser and tests.
4. Add database columns with an explicit existing-DB rollout step.
5. Extract `createMeditationFromElements` and make both endpoints use numeric speed in job input.
6. Add script endpoint tests, including numeric speed and parse-error details.
7. Build the web editor after the parser and endpoint contracts are stable.

## Bottom line

This is a good feature plan, but it should be amended before implementation. The biggest fixes are to normalize speed as a number for worker compatibility, avoid relying on plain `sequelize.sync()` for existing databases, and use a strict token scanner so malformed markup cannot slip through as spoken text.
