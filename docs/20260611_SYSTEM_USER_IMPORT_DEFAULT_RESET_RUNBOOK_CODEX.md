---
created_at: 2026-06-11
updated_at: 2026-06-11
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# System User Import Default Reset Runbook

This feature assumes a deliberate fresh reset. Do not run reset, import, service restart, or live mutation steps from an AI implementation session without explicit operator authorization.

## Reset Sequence

1. Reset the target database and `project_resources` in the operator-approved environment.
2. Start the API so `sequelize.sync()` provisions the fresh schema, including `meditations.is_default` and `meditations.metadata`.
3. Configure `ADMIN_EMAIL` as a comma-separated list when multiple bootstrap admins are needed, for example `nrodrig1@gmail.com,benevolent_monkey@go-lightly.love`.
4. Configure `ADMIN_PASSWORD` once for bootstrap. The startup flow creates missing local verified admin users and promotes existing matching users.
5. Register or confirm the real `benevolent_monkey@go-lightly.love` account exists before using delete-user public-meditation preservation.

## Credentials File

Importer credentials live outside this repository at:

```text
/home/nick/agents_home/hermes/secrets/.env
```

Expected variable names:

```dotenv
CREDENTIALS_EMAIL_NICK=...
CREDENTIALS_PASSWORD_NICK=...
CREDENTIALS_EMAIL_BENEVOLENT_MONKEY=...
CREDENTIALS_PASSWORD_BENEVOLENT_MONKEY=...
```

The importer fails fast if any `BENEVOLENT_MOKNEY` typo variables are present. Do not store these credentials in the GoLightly04 repo.

## Import

Run from the repository root while the API is available:

```bash
npm run import:meditations -- --user-key benevolent_monkey --dir /home/nick/GoLightly04-meditations/benevolent_monkey
npm run import:meditations -- --user-key nick --file /home/nick/GoLightly04-meditations/nick/example.md
```

Useful flags:

- `--dry-run` parses markdown and reports planned imports without login or mutation.
- `--overwrite` deletes an existing owner-scoped import through the API cascade path and recreates it with a new meditation ID.
- `--api-base http://localhost:3000` overrides the default API base.

## Select Default

After imports complete, open `/admin`, expand Meditations, and use Set Default on the intended row. The selected default is hidden from ordinary meditation lists and displayed by the home-page default meditation section through `GET /meditations/default`.

## Smoke Checks

- Comma-separated admin bootstrap creates/promotes expected admins without exposing passwords.
- `benevolent_monkey@go-lightly.love` is not auto-created by admin flows.
- Delete-user preservation fails clearly if the real benevolent account is missing.
- Importer rejects missing credentials and `BENEVOLENT_MOKNEY` typo variables.
- `--dry-run`, `--file`, `--dir`, duplicate skip, and `--overwrite` work against the live/reset environment.
- Imported meditations have expected owner, private visibility, provenance metadata, status progression, and audio output.
- Setting default leaves exactly one default.
- The default is hidden from ordinary lists but visible through the default surface and endpoint.
- No-default state renders without crashing.

## Future Migrations

This implementation intentionally avoids historical-data migrations. Future non-reset changes should add migrations before any live environment contains data that must be preserved.
