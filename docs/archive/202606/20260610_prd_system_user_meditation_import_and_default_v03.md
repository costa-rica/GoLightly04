---
created_at: 2026-06-11
updated_at: 2026-06-11
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---

# PRD v03: System User Meditation Import and Default Meditation Management

## Version History

- `v01`: Initial Claude-authored PRD with outstanding questions.
- `v02`: Incorporated Nick's first answer set, switched source tracking to `metadata JSONB`, added multi-user credential import, removed seeded/template meditation behavior, and carried forward remaining questions.
- `v03`: Incorporates Nick's second answer set, resolves the remaining v02 questions, defines hidden-default behavior, requires one-file imports, standardizes `BENEVOLENT_MONKEY`, and is ready for plan-and-vet.

## Claude Digestion Summary

Claude reviewed Nick's v02 answers and found them sufficient for PRD v03 and plan-and-vet. No blocking ambiguity remains. Claude noted one minor edge case: if an unauthenticated visitor reaches a no-default state, the implementation should follow existing site authentication behavior if the page is gated; otherwise it should show the same graceful no-default state without exposing admin-only details.

## Why This Is One PRD

The requirements remain best handled in one PRD because they all converge on the same clean-slate bootstrap workflow:

1. Reset database and `project_resources`.
2. Nick manually registers normal users.
3. Hermes reads credentials from `/home/nick/agents_home/hermes/secrets/.env`.
4. A root-level script imports meditation markdown as the selected user.
5. Admin UI controls which normal meditation is the app default.

The admin default toggle could ship separately later, but implementing it together avoids recreating a special seeded/default pathway.

## Background and Current State

### Current benevolent user flow

`api/src/services/users/getOrCreateBenevolentUser.ts` currently creates or retrieves a hard-coded benevolent user. That user is not a normal manually registered website account and may have no login-capable password.

This PRD replaces that pattern with normal user ownership:

- `benevolent_monkey@go-lightly.love` is a real user Nick creates manually through the website.
- `nrodrig1@gmail.com` is also available as a real user for Nick-owned meditations.
- Hermes imports content by authenticating through normal HTTP login as the selected user.

### Current default meditation flow

`scripts/seedDefaultMeditation.ts` currently creates a hard-coded starter/default meditation and uses `stage: "template"` semantics.

This PRD removes that special seeded/default concept. Default status is controlled only by explicit `isDefault` state on a normal meditation row.

### External meditation source repo

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
2. Treat default meditations as normal meditations owned by the manually created `benevolent_monkey@go-lightly.love` user.
3. Let Hermes import meditations under a selected user identity using credentials stored outside the GoLightly04 repo.
4. Support both benevolent_monkey and Nick-owned meditations with the same importer.
5. Support batch directory imports and one-file imports.
6. Track import provenance in a flexible `metadata JSONB` column.
7. Let admins select the default meditation from the `/admin` Meditations table.
8. Hide the default meditation from normal meditation lists/tables while still allowing it to power the default-meditation experience.
9. Render a graceful admin-style no-default error banner for logged-in users when no default exists.
10. Support comma-separated `ADMIN_EMAIL` values for clean-slate bootstrap.
11. Avoid data migrations for this reset-based implementation while leaving a runbook placeholder for future migrations.

## Non-Goals

- No automatic creation of the benevolent/system user by the API.
- No `SYSTEM_USER_EMAIL` or `SYSTEM_USER_PASSWORD` in GoLightly04 app `.env` files.
- No permanent system-user password in `/home/limited_user`.
- No scheduled/automatic import daemon.
- No migration of old data; this work assumes a deliberate fresh reset.
- No browser-native confirmation dialogs for admin actions.
- No compatibility support for the misspelled `BENEVOLENT_MOKNEY` env var name.

## Resolved Question Sets

### First set: v02 questions answered by Nick

#### Q1: Can a private meditation still be returned and displayed as the public default?

Nick's answer: no. Make the default meditation not visible in the normal meditation table/list, but still available as the default meditation through the default-meditation experience.

Requirement: default meditation queries must be separate from normal list/table visibility. Normal user-visible meditation lists should not show the default meditation unless a later product decision changes that.

#### Q2: Should the no-default state be a quiet empty state, a visible user-facing message, or an operational/admin-style error banner?

Nick's answer: no default meditation should be visible to all logged-in users; if no default exists, show an admin-style error banner.

Requirement: when no default exists, logged-in users should see a page that still renders and includes a clear admin-style banner/error state. There is no hard-coded fallback meditation.

#### Q3: Should `scripts/importMeditations.ts` support `--file` for one-off Hermes-created meditation imports, in addition to `--dir`?

Nick's answer: yes, unless this is complex and moderately/significantly increases implementation burden; it appears aligned, so support one-off Hermes-created meditations.

Requirement: support both `--dir <path>` and `--file <path>` unless implementation investigation proves `--file` materially increases risk. If it does, implementer must document the alternative before proceeding.

#### Q4: Should the implementation temporarily tolerate the misspelled `BENEVOLENT_MOKNEY` env var from Nick's example, or fail fast and require corrected `BENEVOLENT_MONKEY` spelling?

Nick's answer: fix the spelling.

Requirement: canonical spelling is `BENEVOLENT_MONKEY`. If the misspelled `BENEVOLENT_MOKNEY` env var is present, fail fast with a clear message telling the operator to rename it.

### Second set: Claude follow-up

Claude found no blocking new questions. The only implementation clarification is non-blocking:

- If an unauthenticated visitor reaches the no-default page state, follow existing site authentication behavior if the page is gated; otherwise show the same graceful no-default state without exposing admin-only details.

## Core Decisions

### Import transport

Use HTTP authentication and HTTP/API calls for imports. The API must be running. Direct database import fallback is out of scope.

### Credential storage

Credentials live only in:

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

The GoLightly04 app must not store or reference `SYSTEM_USER_EMAIL` or `SYSTEM_USER_PASSWORD`. The app repo must not contain real credentials.

### Missing credential behavior

If Hermes is asked to create/import a meditation under a user whose credentials are missing, Hermes must not attempt creation. It should report that credentials for the specific user key are missing, without printing any secret values.

### Default meditation semantics

- Default selection is not tied to `stage: "template"`.
- A normal meditation row can be marked `isDefault = true`.
- The default meditation belongs to a normal user, typically `benevolent_monkey@go-lightly.love`.
- Default meditation should be hidden from normal meditation list/table views.
- Default meditation should still be returned by the explicit default-meditation endpoint/experience.

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

`metadata.sourceFile` plus `metadata.sourceUserKey` is used for duplicate detection. `metadata.checksum` can later support update detection.

### Removing seeded/template behavior

Remove or deprecate code paths that create a hard-coded seeded meditation outside the normal meditation creation flow, including reliance on `stage: "template"` for default behavior.

`stage` may still exist if the worker uses it for normal generation status, but `template` should not be the default-selection mechanism.

## API Requirements

### Admin meditations list

Update admin meditations serialization to include:

- `isDefault`
- `metadata`
- any privacy/listing fields needed to understand whether a row is visible in normal lists

### Normal meditation lists/tables

Normal meditation lists/tables should hide the meditation marked `isDefault = true`, unless a specific admin/default-management view needs to show it.

Admin views may still show the default meditation so admins can audit or change the default. User-facing ordinary lists should not show it.

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
- Does not require the meditation to be visible in normal public/user lists.

### Default meditation endpoint

Add or update:

```http
GET /meditations/default
```

Requirements:

- Returns the meditation with `isDefault = true` even though normal list endpoints hide it.
- Does not fall back to a hard-coded meditation ID.
- If no default exists, returns a structured empty/error response that the frontend can render without crashing.
- For logged-in users, the frontend should render an admin-style error banner.
- For unauthenticated visitors, follow existing auth behavior if the page is gated; otherwise render the same graceful no-default state without exposing admin-only details.

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

### Invocation: directory import

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

### Invocation: one-file import

```bash
dotenv -f /home/nick/agents_home/hermes/secrets/.env \
  npx ts-node scripts/importMeditations.ts \
  --user-key benevolent_monkey \
  --file /home/nick/GoLightly04-meditations/benevolent_monkey/new_meditation.md
```

### User key mapping

The script maps `--user-key` to env vars:

- `nick` → `CREDENTIALS_EMAIL_NICK`, `CREDENTIALS_PASSWORD_NICK`
- `benevolent_monkey` → `CREDENTIALS_EMAIL_BENEVOLENT_MONKEY`, `CREDENTIALS_PASSWORD_BENEVOLENT_MONKEY`

If either value is missing, abort before parsing/importing and print a clear error naming the missing user key.

If `CREDENTIALS_EMAIL_BENEVOLENT_MOKNEY` or `CREDENTIALS_PASSWORD_BENEVOLENT_MOKNEY` is present, abort with a clear spelling-correction message.

### Flags

- `--user-key <key>` — required.
- `--dir <path>` — import all `.md` files in a directory.
- `--file <path>` — import exactly one `.md` file.
- Exactly one of `--dir` or `--file` is required.
- `--dry-run` — parse and validate without creating meditations.
- `--overwrite` — replace or update an existing meditation with matching `metadata.sourceFile` and `metadata.sourceUserKey`.
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

For `--file`, a parse/import failure should exit nonzero for that file.

### Hermes workflow

When Nick asks Hermes to create a new meditation, Hermes may:

1. Create or edit markdown files under `/home/nick/GoLightly04-meditations/<user-folder>/`.
2. Confirm the requested publishing user key.
3. Verify the required credentials exist in `/home/nick/agents_home/hermes/secrets/.env` without printing secrets.
4. Run `scripts/importMeditations.ts` with `--user-key` and either `--file` for one-off work or `--dir` for batch import.
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
- Show enough visibility/listing context for admins to know that the default meditation is hidden from normal lists.

## Fresh Reset Runbook

> Destructive steps require explicit operator confirmation before execution.

### Pre-reset

- Confirm all wanted data has been exported or is disposable.
- Confirm GoLightly04 code with this PRD's implementation is deployed.
- Confirm `/home/nick/GoLightly04-meditations` is current.
- Confirm `/home/nick/agents_home/hermes/secrets/.env` exists with required credential placeholders populated for users Nick manually creates.
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
11. Smoke test default display, admin table, normal meditation-list hiding, and user-owned meditation visibility.

### Future migration placeholder

Future changes after real user data exists should include migrations. This implementation intentionally avoids migration/backfill work because the database is reset fresh.

## Test Plan

### API tests

- Multiple `ADMIN_EMAIL` values create or update multiple admin users.
- Existing admin passwords are not unexpectedly overwritten.
- `POST /admin/meditations/:id/set-default` sets exactly one default.
- `GET /meditations/default` returns configured default even if normal lists hide it.
- `GET /meditations/default` returns graceful structured error when none exists.
- Normal meditation list endpoints hide the default meditation.

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
- Misspelled `BENEVOLENT_MOKNEY` variables abort with a correction message.
- Supplying both `--dir` and `--file` aborts.
- Supplying neither `--dir` nor `--file` aborts.
- `--dry-run` creates nothing.
- First directory import creates meditations.
- First file import creates exactly one meditation.
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
- Normal meditation lists do not show the default meditation.
- No-default page state renders an admin-style error banner for logged-in users.

## Security Requirements

- Never commit `/home/nick/agents_home/hermes/secrets/.env`.
- Never copy secrets into the GoLightly04 repo or `/home/limited_user`.
- Never print passwords in logs, CLI output, or chat responses.
- Import script accepts credentials only from environment loaded from the external secrets file.
- CLI examples must use placeholders.
- Admin endpoint remains admin-only.
- Hermes must check credential presence but not reveal credential values.

## Outstanding Questions

None. This PRD is ready for plan-and-vet.
