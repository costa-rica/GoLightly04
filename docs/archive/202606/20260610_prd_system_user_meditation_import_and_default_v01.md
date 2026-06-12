---
created_at: 2026-06-10
updated_at: 2026-06-10
created_by: claude (sonnet-4)
modified_by: claude (sonnet-4)
---

# System User Meditation Import and Default Meditation Management

## Table of Contents

1. [Why One PRD](#why-one-prd)
2. [Background and Current State](#background-and-current-state)
3. [Goals](#goals)
4. [Non-Goals](#non-goals)
5. [Data Model](#data-model)
6. [API Changes](#api-changes)
7. [Markdown Parsing Specification](#markdown-parsing-specification)
8. [Import Script](#import-script)
9. [Admin UI](#admin-ui)
10. [Tests](#tests)
11. [Security Considerations](#security-considerations)
12. [Fresh Reset Runbook](#fresh-reset-runbook)
13. [Rollout Plan](#rollout-plan)
14. [Outstanding Questions](#outstanding-questions)

---

## Why One PRD

These three capabilities — system user bootstrap, meditation import, and default-meditation management — are bundled into one document for the following reasons:

- **Sequential dependency**: the import script requires the system user to exist with valid credentials; the system user must exist before any import run produces correct ownership attribution.
- **Single reset moment**: both features land after a deliberate database wipe. Splitting them would require coordinating two reset runbooks. One reset, one PRD.
- **Shared data model change**: the `isDefault` column is most useful immediately after import populates the database; shipping it separately would leave the admin with no way to designate a default until a second deploy.

**How to split later if needed**: The default-meditation toggle (data model + admin UI + `POST /admin/meditations/:id/set-default`) has zero dependency on the import script. If import work slips, the admin toggle can ship independently starting at the [Data Model](#data-model) section. The import script and system user bootstrap are co-dependent and must stay together.

---

## Background and Current State

### System User (Benevolent User)

`api/src/services/users/getOrCreateBenevolentUser.ts` hard-codes:

```
BENEVOLENT_USER_EMAIL = "benevolent.system@golightly.local"
```

It creates a `User` row with `password: null`, `authProvider: "local"`, `isEmailVerified: true`, `isAdmin: false`. Because the normal login flow rejects users with no password hash, this user cannot authenticate through the website. The account is effectively a phantom — it owns meditations but has no real identity or audit trail.

### Default Meditation Seeding

`scripts/seedDefaultMeditation.ts` calls `getOrCreateBenevolentUser()` then constructs a single hard-coded meditation using a `STARTER_SCRIPT` constant, calls `createMeditationFromElements()`, calls `notifyWorker()`, and polls for `status == "complete"`. It short-circuits if `Meditation.findOne({ where: { stage: "template" } })` already exists. This means adding or updating system meditations requires code changes and redeployment.

### Admin User Bootstrap

`api/src/startup/onStartUp.ts` reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the API `.env`, bcrypt-hashes the password, and upserts an admin user. This pattern works because the admin credentials are intentionally stored in the server environment. The system user should **not** follow this pattern (see Goals).

### GoLightly04-Meditations Repository

Source files live outside the application repo at `/home/nick/GoLightly04-meditations/`. Folder names correspond to the user who will publish the meditations:

- `benevolent_monkey/` — conventional/system meditations published under the system user.
- `nick/` — Nick's personal meditations published under Nick's account.

Each markdown file follows the filename convention `{sound_code}_{total_minutes}_{interval}.md` (e.g., `tb_10_2.md` = Tibetan Singing Bowl, 10-minute meditation, 2-minute intervals). The filename is metadata only; the markdown content is authoritative.

---

## Goals

1. Replace the phantom benevolent user with a conventional, manually registered user whose credentials Nick controls and stores outside the repository.
2. Ensure the application never creates, stores, or hard-codes the system user's password in any tracked file or API `.env`.
3. Provide a standalone import script that reads meditation markdown files from the GoLightly04-meditations repository and creates meditations owned by the system user.
4. Allow an admin to mark any meditation as the application default from the `/admin` UI without code changes.
5. Produce a clear runbook for the fresh database reset that must precede these features going live.

---

## Non-Goals

- Automated or scheduled re-import (manual trigger only for now).
- Migration tooling for existing benevolent-user meditations (fresh reset covers this; old rows are dropped).
- Multi-default or per-user default meditations.
- Changes to the registration or authentication flow beyond what is needed to support manual system user registration.
- TTS audio generation changes.

---

## Data Model

### 1. Meditations Table — `isDefault` Column

Add a boolean column to track which meditation is the application default.

**Migration (Sequelize or raw SQL):**

```sql
ALTER TABLE meditations ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT FALSE;
```

**Backfill:** The single meditation currently carrying `stage = 'template'` is the natural default. Backfill `isDefault = TRUE` for that row only.

**Constraints:**

- Only one row may have `isDefault = TRUE` at any time. This is enforced at the **service layer** in a single transaction: set all rows to `FALSE`, then set the target row to `TRUE`. A database-level partial unique index can be added as a belt-and-suspenders guard:

```sql
CREATE UNIQUE INDEX meditations_single_default
  ON meditations ("isDefault")
  WHERE "isDefault" = TRUE;
```

**Sequelize model update** (`api/src/models/Meditation.ts` or equivalent):

```typescript
isDefault: {
  type: DataTypes.BOOLEAN,
  allowNull: false,
  defaultValue: false,
},
```

**Relationship to `stage` field:** The existing `stage` field tracks generation lifecycle (`pending`, `processing`, `complete`, `template`). `isDefault` is orthogonal — it marks which complete meditation the application surfaces by default. A meditation can be `stage: "complete"` with `isDefault: true` or `false`. The old `stage: "template"` value is a naming artifact from the seed script; after reset it will no longer be assigned to new meditations.

### 2. Meditation Source File Metadata

The import script needs to detect whether a file has already been imported to avoid duplicates. Store the relative source path as a string field on the Meditation row.

Add column:

```sql
ALTER TABLE meditations ADD COLUMN "sourceFile" TEXT;
```

This is nullable; meditations created through the website UI will have `NULL`. Meditations created by the import script will store the relative path (e.g., `benevolent_monkey/tb_10_2.md`).

**Sequelize model update:**

```typescript
sourceFile: {
  type: DataTypes.TEXT,
  allowNull: true,
  defaultValue: null,
},
```

### 3. System User

No schema change. The system user is a normal `User` row created through the standard `/register` endpoint by Nick manually. The application must not reference `SYSTEM_USER_EMAIL` or any system user password in `api/.env` or any tracked config file.

---

## API Changes

### Existing: `GET /admin/meditations` (serialize update)

In `api/src/routes/admin.ts`, add `isDefault` and `sourceFile` to the serialized meditation row returned in the admin meditations list. No route logic change required; only the serialization shape.

**Before:**

```typescript
{ id, title, description, stage, userId, createdAt, ... }
```

**After:**

```typescript
{ id, title, description, stage, isDefault, sourceFile, userId, createdAt, ... }
```

### New: `POST /admin/meditations/:id/set-default`

**Auth:** existing `requireAdmin` middleware (same as all `/admin` routes).

**Path parameter:** `id` — the primary key of the meditation to designate as default.

**Handler logic:**

```typescript
// Within a single transaction:
await Meditation.update({ isDefault: false }, { where: {} });
const [count] = await Meditation.update(
	{ isDefault: true },
	{ where: { id: req.params.id } },
);
if (count === 0) return res.status(404).json({ error: "Meditation not found" });
res.json({ id: req.params.id, isDefault: true });
```

**Response codes:**

- `200` — success, returns `{ id, isDefault: true }`.
- `404` — meditation with that ID does not exist.
- `403` — caller is not an admin (handled by middleware).
- `500` — transaction failure.

### New (Optional): `GET /meditations/default`

**Auth:** none (public).

**Handler logic:** `Meditation.findOne({ where: { isDefault: true } })`. Returns the full meditation object or `404` if none is set.

**Deferral condition:** only implement if the front-end landing page needs to fetch the default meditation without knowing its ID. If the home page already has a hard-coded ID or fetches by other means, skip for now and revisit. See Outstanding Questions Q5.

---

## Markdown Parsing Specification

### Source Directories

| User                       | Directory                                               |
| -------------------------- | ------------------------------------------------------- |
| System (benevolent_monkey) | `/home/nick/GoLightly04-meditations/benevolent_monkey/` |
| Nick                       | `/home/nick/GoLightly04-meditations/nick/`              |

### File Format

Each `.md` file contains H2 sections delimited by `## ` headings:

```
## Nick Description
(internal notes — NOT published)

## Title
Tibetan Bell 2 Minute Intervals

## Description
A 10-minute silent meditation with the Tibetan Singing Bowl marking each two-minute interval.

## Meditation Script
[Tibetan Singing Bowl]
<break time="114.408s"/>
[Tibetan Singing Bowl]
...
[Double Tibetan Singing Bowl]
```

### Section Handling

| Section header             | Action                                                                   |
| -------------------------- | ------------------------------------------------------------------------ |
| `## Nick Description`      | Skip entirely — never published.                                         |
| `## Title`                 | Extract trimmed single-line string → `meditation.title`.                 |
| `## Description`           | Extract trimmed (possibly multi-line) string → `meditation.description`. |
| `## Meditation Script`     | Parse into ordered element list (see below).                             |
| Any other `## ...` heading | Ignore with a `WARN` log.                                                |

A file missing `## Title` or `## Meditation Script` is invalid. The parser must return an error for that file; the import script will skip it and continue.

### Script Element Parsing

The body of `## Meditation Script` is parsed line-by-line into an element list compatible with `createMeditationFromElements()`. Fenced code blocks (` ``` ` delimiters) are stripped before parsing; the content inside is treated as raw script text.

**Token recognition rules (evaluated in order per line):**

| Pattern                                       | Element type           | Mapping                                                                                      |
| --------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| `[Sound Name]`                                | `sound`                | Strip `[` and `]`; look up sound by name in registry.                                        |
| `<break time="Ns" />`                         | `break`                | Extract N as float seconds. Accept `<break time="N.Ms"/>` with or without space before `/>`. |
| `{speed=N}...{/speed}` (single or multi-line) | `spoken` with rate `N` | N is a float. Content between tags is the spoken text, trimmed.                              |
| Non-empty line with no recognized markup      | `spoken`               | Trimmed line text, default rate.                                                             |
| Empty or whitespace-only line                 | _(skip)_               | —                                                                                            |

**Multi-line speed blocks:** if `{speed=N}` and `{/speed}` appear on different lines, accumulate all lines between them as a single spoken element.

### Sound Name Registry

The following names must be matched exactly (case-sensitive) against the bracketed token:

- `Tibetan Singing Bowl`
- `Double Tibetan Singing Bowl`
- `Inhale`
- `Exhale`

If a sound name is not in the registry, log an error identifying the file and line number, skip the entire file, and continue to the next.

### Filename Convention (Informational)

`{sound_code}_{total_minutes}_{interval}.md`

| Segment         | Meaning                                                          |
| --------------- | ---------------------------------------------------------------- |
| `sound_code`    | Short code for primary sound (e.g., `tb` = Tibetan Singing Bowl) |
| `total_minutes` | Integer total meditation duration in minutes                     |
| `interval`      | Integer interval in minutes between sound cues                   |

The import script records the filename (as a relative path) in `sourceFile` but does not derive behavior from the filename segments.

### Duplicate Detection

Before creating a meditation, the import script queries:

```typescript
Meditation.findOne({ where: { sourceFile: relativeFilePath } });
```

- If a match exists and `--overwrite` flag is NOT set: log `SKIP <file>` and continue.
- If a match exists and `--overwrite` IS set: delete the existing meditation row (and associated audio files if applicable), then re-create.
- If no match exists: proceed with creation.

---

## Import Script

### File Location

`scripts/importMeditations.ts`

### Invocation

Credentials are injected via environment variables, never as positional arguments (shell history safety):

```bash
# Using dotenv-cli to load secrets file:
dotenv -f /home/nick/agents_home/hermes/secrets/.env \
  npx ts-node scripts/importMeditations.ts \
  --dir /home/nick/GoLightly04-meditations/benevolent_monkey

# Or export manually before running:
export SYSTEM_USER_EMAIL="..."
export SYSTEM_USER_PASSWORD="..."
npx ts-node scripts/importMeditations.ts \
  --dir /home/nick/GoLightly04-meditations/benevolent_monkey \
  [--overwrite] \
  [--dry-run]
```

**Flags:**

| Flag           | Behavior                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------- |
| `--dir <path>` | Required. Directory of `.md` files to import.                                               |
| `--overwrite`  | Delete and re-create meditations that already have a matching `sourceFile`.                 |
| `--dry-run`    | Parse all files and report what would be created/skipped; no DB writes or audio generation. |

### Secrets File

Location (outside repo, outside `/home/limited_user`):

```
/home/nick/agents_home/hermes/secrets/.env
```

Contents template (no real values):

```
SYSTEM_USER_EMAIL=<manually registered email>
SYSTEM_USER_PASSWORD=<manually registered password>
```

File permissions must be `0600`. This file is never committed to the repository and must not be symlinked or bind-mounted into any tracked directory.

### Authentication Strategy

The script authenticates as the system user using the existing `POST /auth/login` endpoint to obtain a session token or cookie. This treats the script as a normal API client subject to the same session lifecycle and rate limiting as the web UI.

**Direct DB fallback (Option B):** If the HTTP API is not reachable at import time (e.g., running migrations in an offline environment), the script can connect to the database directly, look up the user by email, and call `createMeditationFromElements()` in-process. See Outstanding Questions Q1.

### Script Logic

```
1. Validate env: SYSTEM_USER_EMAIL and SYSTEM_USER_PASSWORD must be set. Abort with clear error if missing.
2. Authenticate via POST /auth/login. Store session token/cookie. Abort on auth failure (wrong credentials, server unreachable).
3. Collect all *.md files in --dir, sorted alphabetically.
4. For each file:
   a. Parse sections: extract Title, Description, Meditation Script. On parse error: log ERROR, increment failed counter, continue.
   b. Check duplicate: query Meditation by sourceFile.
      - If exists and --overwrite not set: log SKIP, increment skipped counter, continue.
      - If exists and --overwrite set: delete existing row, continue to creation.
      - If --dry-run: log WOULD CREATE or WOULD SKIP, continue without writing.
   c. Call createMeditationFromElements() or POST /meditations with parsed elements and sourceFile metadata.
   d. Poll for meditation status == "complete" with exponential backoff, max 5 minutes.
      - On timeout: log ERROR, increment failed counter, continue.
   e. Log SUCCESS with meditation ID and title. Increment created counter.
5. Print final summary:
   Created: N  |  Skipped: M  |  Failed: K
6. Exit code 0 if K == 0; exit code 1 if any failures.
```

### Error Handling Policy

| Condition                                             | Behavior                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| Missing `SYSTEM_USER_EMAIL` or `SYSTEM_USER_PASSWORD` | Abort immediately with error message.                         |
| Auth failure (401/403)                                | Abort immediately — all subsequent requests would fail.       |
| Parse error in a single file                          | Log error with filename and reason, skip file, continue.      |
| Unknown sound name in script                          | Log error with filename and line number, skip file, continue. |
| Meditation generation timeout (> 5 min)               | Log error, mark file as failed, continue.                     |
| Network error during single meditation creation       | Log error, mark file as failed, continue.                     |

---

## Admin UI

### File Targets

- `web/src/app/admin/page.tsx` — page component
- Admin meditations table component (wherever the column definitions live)

### Default Column

Add an `isDefault` column to the Meditations table in the admin UI:

- **Header:** `Default`
- **Cell content:** A checkmark badge/indicator if `isDefault === true`; empty cell otherwise.
- **Sort:** not required.

### Set as Default Action

Add a **Set as Default** button or row-action menu item per meditation row:

- **Disabled state:** the button is disabled (greyed out) on the row that is already the current default.
- **Confirmation:** before calling the API, display a confirmation dialog: `"Set '[Meditation Title]' as the application default? The current default will be replaced."` See Outstanding Questions Q6 for dialog style.
- **API call:** `POST /admin/meditations/:id/set-default`.
- **Optimistic UI update on success:** remove the default indicator from all other rows; add it to the newly selected row. If the API call fails, revert the optimistic update and display an error.

### No New Page Required

The toggle lives inline in the existing `/admin` Meditations table. No new route or admin sub-page is needed.

---

## Tests

### Unit Tests

**Markdown parser (`scripts/importMeditations.test.ts` or `__tests__/markdownParser.test.ts`):**

- Parses `## Title`, `## Description`, `## Meditation Script` correctly.
- Ignores `## Nick Description` section.
- Strips fenced code blocks before element parsing.
- Correctly identifies each element type: sound, break, spoken (plain), spoken with speed modifier.
- Multi-line speed blocks accumulate correctly.
- Returns error for file missing `## Title`.
- Returns error for file missing `## Meditation Script`.
- Returns error for unknown sound name; identifies the offending line.
- Handles empty lines (no spurious empty elements).
- Handles `<break>` with and without space before `/>`.

**`setDefault` service function:**

- After calling `setDefault(idA)`, exactly one row has `isDefault = true` and it is `idA`.
- After calling `setDefault(idB)` following `setDefault(idA)`, `idA` is `false` and `idB` is `true`.
- Calling `setDefault` with a non-existent ID returns a not-found error without modifying any rows.

### Integration Tests

**`POST /admin/meditations/:id/set-default`:**

- Returns `200` and `{ id, isDefault: true }` for a valid admin request.
- After the call, exactly one `Meditation` row has `isDefault = true`.
- Returns `404` for an unknown ID.
- Returns `403` when called without admin credentials.
- Two rapid sequential calls for different IDs result in only the second ID being default (no race window leaving two defaults).

**`GET /meditations/default` (if implemented):**

- Returns `200` with the correct meditation after a `set-default` call.
- Returns `404` when no meditation has `isDefault = true`.

### Import Script Smoke Tests (manual)

Run against a fixture directory containing two known `.md` files:

1. First run: both meditations created, exit code 0.
2. Second run without `--overwrite`: both skipped, exit code 0, no duplicates in DB.
3. Second run with `--overwrite`: both deleted and re-created, exit code 0.
4. `--dry-run` on a fresh DB: logs `WOULD CREATE` for both files, zero DB rows created.
5. File with unknown sound name: that file failed, other file succeeded, exit code 1.
6. File missing `## Title`: that file failed, other file succeeded, exit code 1.

### Admin UI Tests (manual)

1. Open `/admin`, confirm the `Default` column is visible in the Meditations table.
2. Click **Set as Default** on a meditation that is not the current default.
3. Confirm the dialog appears with the correct meditation title.
4. Confirm after acceptance: the selected row shows the default indicator; the previous default row does not.
5. Refresh the page; confirm the default state persists (backed by DB).
6. Confirm the **Set as Default** button is disabled on the row that is already the default.

---

## Security Considerations

1. **Credential storage location:** `SYSTEM_USER_EMAIL` and `SYSTEM_USER_PASSWORD` are stored only in `/home/nick/agents_home/hermes/secrets/.env`. This path is outside the repository and outside `/home/limited_user`. Set permissions to `0600` (owner read/write only).

2. **No password in API config:** The API `.env` must never contain `SYSTEM_USER_EMAIL` or `SYSTEM_USER_PASSWORD`. The application must not auto-create, auto-update, or reference the system user's password at startup or runtime. Violating this would re-introduce the phantom-user anti-pattern under a different name.

3. **Nick manually registers the system user:** The system user account is created by Nick through the standard website registration flow (`/register`). The API has no knowledge of and no role in creating this user's password. This is the fundamental separation of concerns this PRD enforces.

4. **CLI credential safety:** The import script reads credentials from environment variables, not positional arguments. Positional arguments appear in `ps` output and shell history; environment variables set in the process do not persist in shell history when loaded from a secrets file via `dotenv` or equivalent.

5. **Admin endpoint protection:** `POST /admin/meditations/:id/set-default` must be gated by the existing `requireAdmin` middleware, consistent with all other admin routes.

6. **No symlinks or bind mounts of secrets directory into repo:** Confirm that `/home/nick/agents_home/hermes/secrets/` is not accessible from within the repository directory tree. No `.gitignore` entry is required because the path is already outside the repo, but verify that no Docker volume mount or symlink bridges the gap.

7. **Audit trail:** Because the system user is a real registered account, meditations they own carry a real `userId` and creation timestamp. This makes it possible to query or audit the system user's content through normal admin queries.

---

## Fresh Reset Runbook

> **All steps marked ⚠️ DESTRUCTIVE require explicit operator confirmation before execution. These operations are irreversible and will permanently destroy data.**

### Pre-Reset Checklist

- [ ] Confirm no production or user-generated data needs to be preserved.
- [ ] Confirm all developers and stakeholders are aware of the reset.
- [ ] Export any meditations or user data you wish to retain (admin UI export, `pg_dump`, or manual backup).
- [ ] Confirm the GoLightly04-meditations repository is up to date locally (`git pull`).
- [ ] Confirm `/home/nick/agents_home/hermes/secrets/.env` is populated with the intended system user credentials.

### Reset Steps

**Step 1 — Stop all services**

Stop the API, audio worker, and web dev server. Confirm no processes hold a database connection.

**Step 2 — ⚠️ DESTRUCTIVE: Drop the database**

Requires explicit confirmation before execution.

```bash
dropdb <database_name>
```

**Step 3 — ⚠️ DESTRUCTIVE: Clear project_resources**

Requires explicit confirmation before execution.

```bash
rm -rf <project_resources_path>/*
```

Confirm the path before executing. Do not use a wildcard without verifying the directory.

**Step 4 — Re-create and migrate**

```bash
createdb <database_name>
# Run migrations:
npm run migrate   # or equivalent for this project
```

**Step 5 — Start the API**

```bash
npm run dev   # or equivalent
```

Confirm the API starts without errors and the admin user is created by `onStartUp.ts` (using `ADMIN_EMAIL` / `ADMIN_PASSWORD` from the API `.env`).

**Step 6 — Manually register the system user**

Navigate to the website registration page (`/register`). Register using the email and password stored in `/home/nick/agents_home/hermes/secrets/.env`. The application will not do this automatically. Confirm the account is active by logging in.

**Step 7 — (If needed) Promote system user**

If the system user requires any special role or flag (other than a normal user account), apply it via a direct database update or the admin UI. This step is only needed if the import script requires elevated permissions beyond normal user access.

**Step 8 — Run the import script**

```bash
dotenv -f /home/nick/agents_home/hermes/secrets/.env \
  npx ts-node scripts/importMeditations.ts \
  --dir /home/nick/GoLightly04-meditations/benevolent_monkey
```

Review the summary output. Address any failures before proceeding.

**Step 9 — (Optional) Import Nick's personal meditations**

```bash
# Use Nick's own registered credentials, not the system user credentials:
SYSTEM_USER_EMAIL=<nick-email> SYSTEM_USER_PASSWORD=<nick-password> \
  npx ts-node scripts/importMeditations.ts \
  --dir /home/nick/GoLightly04-meditations/nick
```

See Outstanding Questions Q3 for how to handle credential management for this step.

**Step 10 — Set the default meditation**

Open `/admin`, navigate to the Meditations table, and click **Set as Default** on the intended default meditation.

**Step 11 — Smoke test**

- Verify the landing page surfaces the expected default meditation.
- Log in as the system user and confirm their meditations are visible and correct.
- Log in as the admin and confirm the admin Meditations table shows `isDefault` correctly.

---

## Rollout Plan

Tasks in dependency order. Steps 1–3 can be done before the reset; steps 4 onwards require a clean database.

| #   | Task                                                                            | Dependencies          |
| --- | ------------------------------------------------------------------------------- | --------------------- |
| 1   | Add `isDefault` and `sourceFile` columns (migration + model)                    | —                     |
| 2   | Implement `POST /admin/meditations/:id/set-default` endpoint                    | 1                     |
| 3   | Update admin meditations serializer to include `isDefault`, `sourceFile`        | 1                     |
| 4   | Implement admin UI Default column and Set as Default button                     | 3                     |
| 5   | Implement markdown parser module with unit tests                                | —                     |
| 6   | Implement `scripts/importMeditations.ts`                                        | 5, system user exists |
| 7   | Perform fresh DB reset (per runbook)                                            | All code merged       |
| 8   | Nick manually registers system user through website                             | 7                     |
| 9   | Run import script for `benevolent_monkey` meditations                           | 6, 8                  |
| 10  | Run import script for `nick` meditations (optional)                             | 6                     |
| 11  | Set default meditation from `/admin`                                            | 4, 9                  |
| 12  | Deprecate `scripts/seedDefaultMeditation.ts` and `getOrCreateBenevolentUser.ts` | 9 validated           |

---

## Outstanding Questions

### Q1: Should the import script authenticate via HTTP (Option A) or connect directly to the database (Option B)?

Option A (HTTP login) treats the script as a normal client and requires the API to be running. Option B (direct DB) works offline but tightly couples the script to internal service code. The recommendation is Option A.

#### Nick response

Let's do option A

---

### Q2: Where should source-file metadata be stored — the new `sourceFile TEXT` column described here, a `notes` text field, or a JSON `metadata` column?

The PRD proposes a dedicated `sourceFile TEXT` column for query clarity. A `metadata JSONB` column is more flexible if additional import attributes (e.g., `importedAt`, `checksum`) are anticipated.

#### Nick response

use a metadata JSONB column

---

### Q3: Should Nick's personal meditations (`nick/` folder) be imported by the same script using Nick's personal registered credentials, or should there be a separate secrets file or invocation alias?

The PRD's current assumption is the same script, separate invocation, with Nick's own credentials passed via env. Confirm whether a second secrets file is preferred or whether Nick will supply credentials interactively for the `nick/` folder.

#### Nick response

The /home/nick/agents_home/hermes/secrets/.env file will have nick credentials also:
Example:

```
CREDENTIALS_EMAIL_NICK=nrodrig1@gmail.com
CREDENTIALS_PASSWORD_NICK=test
CREDENTIALS_EMAIL_BENEVOLENT_MOKNEY=benevolent_monkey@go-lightly.love
CREDENTIALS_PASSWORD_BENEVOLENT_MOKNEY=test
```

## If hermes is requested to create a meditaiton under a user whose credentials are missing the hermes agent will not attempt the creation of a meditaiton and respond to me that it cannot do it becuase of missing credentials for the specific user.

### Q4: Should the `stage: "template"` value on the existing seeded meditation be preserved after reset, deprecated, or removed from the codebase entirely?

With `isDefault` now handling the "which meditation is the default" concern, `stage: "template"` appears to be an artifact. Confirm whether `stage` carries any other semantics (e.g., is it displayed in the UI or used by the worker) before removing it.

#### Nick response

Let's remove anything having to do with a seeded meditaiton that isn't part of the normal meditaiton creation flow. I want this to be idempotent and belonging to the benevolent_monkey so if we make it private it won't show up on the lists of meditations but can still display as the default - if this is not possible bring this up in hte next prd unanswered questions.

---

### Q5: What should `GET /meditations/default` return when no meditation has `isDefault = true`?

Options: (a) `404`, (b) the most recently created meditation, (c) a hard-coded fallback ID, (d) defer the endpoint entirely until the home page needs it. Confirm whether the public landing page currently requires a default meditation endpoint or fetches by ID.

#### Nick response

If there is no default meditation let's just make an error on the page but the page should be able to display. The meditaiton creation will occur prior to accessing the page so we should be able to avoid this. If my answer does not align with the rest of the PRD, bring this up in the next prd version.

---

### Q6: Should the Set as Default confirmation dialog use the browser's native `window.confirm()` or a modal component consistent with the existing admin UI?

Native `confirm()` is trivial to implement but inconsistent with any design system in use. A modal is more work but avoids mixing interaction patterns. Check whether other destructive actions in the admin UI already use a modal.

#### Nick response

Make a modal consistent with the existing UI. Let's avoid browser native dialogs as much as possible.

---

### Q7: What is the acceptable maximum wait time per meditation during import, and should the script retry on timeout or skip and continue?

The PRD currently proposes a 5-minute timeout per meditation with skip-and-continue on timeout. Confirm whether this is acceptable or if a retry (up to N attempts) is preferred before marking a file as failed.

#### Nick response

The script should not retry automatically. 5 minutes is acceptable timeout per meditation.

---

### Q8: Is there any existing index or foreign key on the benevolent user's `userId` in the `meditations` table that would need to be dropped or updated as part of retiring `getOrCreateBenevolentUser.ts`?

After the fresh reset the old user row will not exist, so this may be moot. Confirm before removing the function to avoid breaking any startup code that still calls it.

#### Nick response

Everything will be dropped an erased on this prd adn the result of it.

## Other Nick comments

I want to confirm this prd does the following:

1. allow the server hermes ai agent to make meditations using the manully created "system user" (I.e. benevolent_monkey@go-lightly.love)
2. when the script is run can we pick which user creates it. So the script will need to make meditations under the benevolent_monkey@go-lightly.love and the nrodrig1@gmail.com user.
3. I will store the nrodrig1@gmail.com and benevolent_monkey@go-lightly.love credentials in /home/nick/agents_home/hermes/secrets/.env. Then if the I ask hermes to create meditations it will invoke the required credentials for the user it will make it under then run `scripts/importMeditations.ts` in the most efficient way. But the GoLightly04 will not have `SYSTEM_USER_EMAIL` or `SYSTEM_USER_PASSWORD` stored or referenced.
   - The hermes agent can create markdown files and store them in the /home/nick/GoLightly04-meditations/ directory if I request it to make a new meditation.

## Revisions

1. let's make the `ADMIN_EMAIL` a list of emails separated by commas. so the next version will look like `ADMIN_EMAIL=nrodrig1@gmail.com,benevolent_monkey@go-lightly.love` and both will get the same `ADMIN_PASSWORD` value that can then be reset to different values.
2. Let's avoid migrations for this effort. We will start fresh with a new database. Whatever db schema changes we need to make, let's make them now and not worry about the migration of data. However, for the runbook we can keep a section for where migrations should occur, because future modifications may require migrations.
