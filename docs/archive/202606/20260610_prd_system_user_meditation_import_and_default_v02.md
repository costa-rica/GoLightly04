---
created_at: 2026-06-10
updated_at: 2026-06-10
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---

# PRD v02: System User Meditation Import and Default Meditation Management

## Version History

- `v01`: Initial Claude-authored PRD with outstanding questions.
- `v02`: Incorporates Nick's answers, removes resolved questions, switches source tracking to `metadata JSONB`, adds multi-user credential import, removes seeded/template meditation behavior, and adds new outstanding questions only where requirements still need confirmation.

## Claude Digestion Summary

Claude reviewed Nick's answers and found the core flow coherent: fresh reset, manual user registration, credentials stored outside the app repo, HTTP-based import per selected credential identity, metadata-backed source tracking, and admin-controlled default meditation. Claude identified no blocking contradictions, but recommended carrying forward a few implementation questions about private default visibility, null default UI behavior, multi-admin bootstrap order, and the import script's user-selection interface.

## Why This Is Still One PRD

The requirements remain best handled in one PRD because they all converge on the same clean-slate bootstrap workflow:

1. The database and `project_resources` directory are reset.
2. Nick manually registers one or more content-owning users.
3. Hermes reads credentials from `/home/nick/agents_home/hermes/secrets/.env`.
4. A root-level import script creates meditations as the selected user.
5. Admin UI controls which completed meditation is the default.

The admin default toggle could be split later, but implementing it with the importer avoids recreating a special seeded/template pathway.

## Background and Current State

### Current Benevolent User Flow

`api/src/services/users/getOrCreateBenevolentUser.ts` currently creates or retrieves a hard-coded benevolent user. That user is not a normal manually registered website account and may have no login-capable password.

This PRD replaces that pattern with normal user ownership:

- `benevolent_monkey@go-lightly.love` is a real user Nick creates manually through the website.
- `nrodrig1@gmail.com` is also available as a real user for Nick-owned meditations.
- Hermes imports content by authenticating through normal HTTP login as the chosen user.

### Current Default Meditation Flow

`scripts/seedDefaultMeditation.ts` currently creates a hard-coded starter/default meditation and uses `stage: "template"` semantics.

This PRD removes that special seeded/default concept. Default status is controlled only by an explicit `isDefault` field on a normal meditation row.

### External Meditation Source Repo

Meditation source markdown files live outside the app repo:

- `/home/nick/GoLightly04-meditations/benevolent_monkey/`
- `/home/nick/GoLightly04-meditations/nick/`

Each file can include:

- `## Nick Description` — internal creation notes, not published.
- `## Title` — published meditation title.
- `## Description` — published meditation description.
- `## Meditation Script` — script-mode content used to create audio.

## Goals

1. Remove the hard-coded seeded/default meditation flow.
2. Treat system/default meditations as normal meditations owned by the manually created `benevolent_monkey@go-lightly.love` user.
3. Let Hermes import meditations under a selected user identity using credentials stored outside the GoLightly04 repo.
4. Support both benevolent_monkey and Nick-owned meditations with the same importer.
5. Track import provenance in a flexible `metadata JSONB` column.
6. Let admins select the default meditation from the `/admin` Meditations table.
7. Allow the public default meditation page/endpoint to render a graceful error state if no default exists.
8. Support comma-separated `ADMIN_EMAIL` values for clean-slate bootstrap.
9. Avoid data migrations for this reset-based implementation while leaving a runbook placeholder for future migrations.

## Non-Goals

- No automatic creation of the benevolent/system user by the API.
- No `SYSTEM_USER_EMAIL` or `SYSTEM_USER_PASSWORD` in GoLightly04 app `.env` files.
- No permanent system-user password in `/home/limited_user`.
- No scheduled/automatic import daemon.
- No migration of old data; this work assumes a deliberate fresh reset.
- No browser-native confirmation dialogs for admin actions.

## Core Decisions from Nick's Answers

### Import transport

Use HTTP authentication and HTTP/API calls for imports. The API must be running.

Direct database import fallback is removed from scope.

### Credential storage

Credentials live in:

```text
/home/nick/agents_home/hermes/secrets/.env
```

Example shape, with placeholders only:

```dotenv
CREDENTIALS_EMAIL_NICK=<nick-email>
CREDENTIALS_PASSWORD_NICK=<nick-password>
CREDENTIALS_EMAIL_BENEVOLENT_MONKEY=<benevolent-monkey-email>
CREDENTIALS_PASSWORD_BENEVOLENT_MONKEY=<benevolent-monkey-password>
```

Nick's draft used `MOKNEY`; implementation should use the corrected `MONKEY` spelling. The script may optionally detect the misspelled variable and emit a warning, but the documented variable name is `CREDENTIALS_*_BENEVOLENT_MONKEY`.

### Missing credential behavior

If Hermes is asked to create/import a meditation under a user whose credentials are missing, Hermes must not attempt the creation. It should report that credentials for that specific user key are missing.

### Default meditation semantics

- Default selection is not tied to `stage: "template"`.
- A normal meditation row can be marked `isDefault = true`.
- The default meditation should be able to belong to `benevolent_monkey@go-lightly.love`.
- Nick would like the default meditation to remain usable as the default even if it is private and therefore absent from normal public meditation lists, if this is architecturally possible.

### Null default behavior

If no meditation is currently default, the page should still render and display an error/empty state. There should be no hard-coded fallback meditation.

### Import timeout

Each meditation import/generation may wait up to 5 minutes. The script should not retry automatically.

### Admin confirmation UI

Use a modal consistent with the existing UI. Avoid `window.confirm()`.

## Data Model

### Meditation `isDefault`

Add an `isDefault` boolean to the meditation model/schema.

Fresh schema target:

```typescript
isDefault: {
  type: DataTypes.BOOLEAN,
  allowNull: false,
  defaultValue: false,
}
```

Enforce one default meditation at a time in a service-layer transaction:

1. Set all meditations to `isDefault = false`.
2. Set the requested meditation to `isDefault = true`.

Because this is a fresh reset, no production data backfill is required.

Optional database guard, if compatible with the current DB setup:

```sql
CREATE UNIQUE INDEX meditations_single_default
  ON meditations ("isDefault")
  WHERE "isDefault" = TRUE;
```

### Meditation `metadata JSONB`

Use a flexible `metadata JSONB` field instead of `sourceFile TEXT`.

Fresh schema target:

```typescript
metadata: {
  type: DataTypes.JSONB,
  allowNull: false,
  defaultValue: {},
}
```

For imported meditations, store at least:

```json
{
  "sourceFile": "benevolent_monkey/tb_10_2.md",
  "sourceRoot": "/home/nick/GoLightly04-meditations",
  "sourceUserKey": "benevolent_monkey",
  "importedAt": "2026-06-10T00:00:00.000Z",
  "checksum": "sha256-placeholder"
}
```

`metadata.sourceFile` is used for duplicate detection. `metadata.checksum` can later support update detection.

### Removing seeded/template behavior

Remove or deprecate code paths that create a hard-coded seeded meditation outside the normal meditation creation flow, including reliance on `stage: "template"` for default behavior.

`stage` may still exist if the worker uses it for normal generation status, but `template` should not be the default-selection mechanism.

## API Requirements

### Admin meditations list

Update admin meditations serialization to include:

- `isDefault`
- `metadata`
- privacy/listing fields needed to understand whether the default is public/private

### Set default endpoint

Add:

```http
POST /admin/meditations/:id/set-default
```

Requirements:

- Admin-only.
- Runs in a transaction.
- Makes exactly one meditation default.
- Returns the updated meditation or `{ id, isDefault: true }`.
- Returns `404` for missing meditation.
- Does not require the meditation to be public unless the outstanding question resolves that way.

### Default meditation endpoint

Add or update:

```http
GET /meditations/default
```

Requirements:

- Public endpoint unless existing auth design requires otherwise.
- Returns the meditation with `isDefault = true`.
- If no default exists, returns a structured empty/error response that the frontend can render without crashing.
- Must not fall back to a hard-coded meditation ID.

Potential response when no default exists:

```json
{
  "error": "No default meditation configured",
  "code": "NO_DEFAULT_MEDITATION"
}
```

## Admin Bootstrap Requirement

Support comma-separated admin emails:

```dotenv
ADMIN_EMAIL=nrodrig1@gmail.com,benevolent_monkey@go-lightly.love
ADMIN_PASSWORD=<initial-admin-password>
```

Startup behavior:

1. Split `ADMIN_EMAIL` on commas.
2. Trim whitespace.
3. Ignore empty entries.
4. For each email:
   - create admin user if missing, using `ADMIN_PASSWORD` as the initial password;
   - ensure existing user has `isAdmin = true`;
   - do not overwrite an existing password unless current admin-bootstrap behavior already does so intentionally.
5. Both users may later reset their passwords independently.

Because this is a fresh-reset flow, this can be implemented directly in startup code without a data migration.

## Import Script Requirements

### Location

Use a root-level script:

```text
scripts/importMeditations.ts
```

### Invocation

The script must accept a selected user key and a directory:

```bash
dotenv -f /home/nick/agents_home/hermes/secrets/.env \
  npx ts-node scripts/importMeditations.ts \
  --user-key benevolent_monkey \
  --dir /home/nick/GoLightly04-meditations/benevolent_monkey
```

Nick import example:

```bash
dotenv -f /home/nick/agents_home/hermes/secrets/.env \
  npx ts-node scripts/importMeditations.ts \
  --user-key nick \
  --dir /home/nick/GoLightly04-meditations/nick
```

### User key mapping

The script maps `--user-key` to env vars:

- `nick` → `CREDENTIALS_EMAIL_NICK`, `CREDENTIALS_PASSWORD_NICK`
- `benevolent_monkey` → `CREDENTIALS_EMAIL_BENEVOLENT_MONKEY`, `CREDENTIALS_PASSWORD_BENEVOLENT_MONKEY`

If either value is missing, abort before parsing/importing and print a clear error naming the missing user key.

### Flags

- `--user-key <key>` — required.
- `--dir <path>` — required source directory.
- `--dry-run` — parse and validate without creating meditations.
- `--overwrite` — replace an existing meditation with matching `metadata.sourceFile`.
- `--api-url <url>` — optional; default to local API config or `http://127.0.0.1:8001` if that matches current app conventions.

### HTTP login

The script authenticates through the existing login endpoint as the selected user. It should then create meditations through the same API path used by normal website meditation creation, or through a purpose-built authenticated API endpoint if the existing endpoint cannot accept parsed script elements plus metadata.

The script must not connect directly to the database for creation.

### Duplicate detection

Duplicate detection should use `metadata.sourceFile` and `metadata.sourceUserKey`.

Behavior:

- Existing match and no `--overwrite`: skip.
- Existing match and `--overwrite`: delete/recreate or update according to implementation feasibility.
- No match: create.

### Markdown parsing

For each `.md` file:

- Extract `## Title` as published title.
- Extract `## Description` as published description.
- Ignore `## Nick Description` for publication.
- Parse `## Meditation Script` into meditation elements.

Script-mode syntax must support:

- plain spoken text;
- `<break time="Ns" />`, with or without a space before `/>`;
- `{speed=N}...{/speed}`;
- bracketed sound names:
  - `[Tibetan Singing Bowl]`
  - `[Double Tibetan Singing Bowl]`
  - `[Inhale]`
  - `[Exhale]`

Unknown sound names or missing required sections should fail that file and continue to the next file.

### Hermes workflow

When Nick asks Hermes to create a new meditation, Hermes may:

1. Create or edit markdown files under `/home/nick/GoLightly04-meditations/<user-folder>/`.
2. Confirm the requested publishing user key.
3. Verify the required credentials exist in `/home/nick/agents_home/hermes/secrets/.env` without printing secrets.
4. Run `scripts/importMeditations.ts` with the appropriate `--user-key` and `--dir` or file-targeting option if implemented.
5. Report created/skipped/failed meditations.

## Admin UI Requirements

Update `/admin` Meditations table:

- Add a `Default` column.
- Show a clear badge/check for the current default.
- Add a row action: `Set as Default`.
- Disable the action on the current default row.
- Use a UI-consistent modal before changing the default.
- After success, update table state so exactly one row shows as default.
- If the API call fails, show an error and preserve/reload prior state.

If privacy/listing state exists, show enough context for admins to know whether the default meditation is public/private.

## Fresh Reset Runbook

> Destructive steps require explicit operator confirmation before execution.

### Pre-reset

- Confirm all wanted data has been exported or is disposable.
- Confirm GoLightly04 code with this PRD's implementation is deployed.
- Confirm `/home/nick/GoLightly04-meditations` is current.
- Confirm `/home/nick/agents_home/hermes/secrets/.env` exists with required credential placeholders populated for the users Nick manually creates.
- Confirm no secrets are committed to git.

### Reset steps

1. Stop GoLightly04 services.
2. Destructively drop/recreate the database.
3. Destructively clear `project_resources` after verifying the exact path.
4. Apply fresh schema setup. Do not migrate old data for this effort.
5. Start API and web services.
6. Register required users through the website:
   - `nrodrig1@gmail.com`
   - `benevolent_monkey@go-lightly.love`
7. Ensure intended admin users are admins via comma-separated `ADMIN_EMAIL` bootstrap or admin tooling.
8. Run importer for benevolent_monkey meditations.
9. Optionally run importer for Nick meditations.
10. Mark the desired meditation as default in `/admin`.
11. Smoke test website default display, admin table, and user-owned meditation visibility.

### Future migration placeholder

Future changes after real user data exists should include migrations. This implementation intentionally avoids migration/backfill work because the database is reset fresh.

## Test Plan

### API tests

- Multiple `ADMIN_EMAIL` values create or update multiple admin users.
- Existing admin passwords are not unexpectedly overwritten.
- `POST /admin/meditations/:id/set-default` sets exactly one default.
- `GET /meditations/default` returns configured default.
- `GET /meditations/default` returns graceful structured error when none exists.
- Private default behavior is covered after outstanding question resolution.

### Import parser tests

- Valid markdown with title, description, and script parses correctly.
- `Nick Description` is ignored.
- Fenced script blocks are stripped correctly.
- Break tags parse with and without space before `/>`.
- Speed blocks parse correctly.
- Known sound names map correctly.
- Unknown sound name fails only that file.
- Missing title or script fails only that file.

### Import script tests/manual checks

- Missing `--user-key` aborts.
- Missing credentials for selected user key aborts before import.
- `--dry-run` creates nothing.
- First import creates meditations.
- Second import skips existing metadata matches.
- `--overwrite` replaces or updates existing matches according to final implementation.
- Timeout after 5 minutes marks the file failed; no automatic retry.

### Admin UI tests

- Default column appears.
- Modal appears for Set as Default.
- Native browser confirm is not used.
- Current default action is disabled.
- Success updates one and only one visible row.
- API failure shows a user-facing error.

## Security Requirements

- Never commit `/home/nick/agents_home/hermes/secrets/.env`.
- Never copy secrets into the GoLightly04 repo or `/home/limited_user`.
- Never print passwords in logs, CLI output, or chat responses.
- Import script accepts credentials only from environment loaded from the external secrets file.
- CLI examples must use placeholders.
- Admin endpoint remains admin-only.
- Hermes must check credential presence but not reveal credential values.

## Outstanding Questions

### Q1: Can a private meditation be the public default?

Nick wants the benevolent_monkey default meditation to be able to stay private so it does not appear in normal meditation lists, while still being returned/displayed as the default. Implementation must confirm whether current visibility filters allow `GET /meditations/default` to bypass public-list filtering for the one default meditation.

#### Nick response

*(blank)*

---

### Q2: Should missing default be a soft empty state or an operational error banner?

Nick said the page should still display if no default meditation exists, with an error on the page. Confirm whether this should be a quiet empty state, a visible admin/operator-facing error banner, or a user-facing message.

#### Nick response

*(blank)*

---

### Q3: What exact CLI interface should Hermes use for one-file imports?

The PRD defines `--user-key` and `--dir`. If Hermes creates one new markdown file, should the script also support `--file /path/to/file.md` to avoid importing/skipping the whole directory each time?

#### Nick response

*(blank)*

---

### Q4: Should the misspelled `BENEVOLENT_MOKNEY` env vars be tolerated temporarily?

Nick's example used `CREDENTIALS_EMAIL_BENEVOLENT_MOKNEY` / `CREDENTIALS_PASSWORD_BENEVOLENT_MOKNEY`. The PRD standardizes on `BENEVOLENT_MONKEY`. Confirm whether implementation should fail fast on the misspelling or warn and accept it temporarily.

#### Nick response

*(blank)*
