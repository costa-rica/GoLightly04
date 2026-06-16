---
created_at: 2026-06-12
updated_at: 2026-06-16
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: codex (gpt-5)
---

# System User Meditation Import Rollout Runbook

This runbook covers the non-reset rollout path for the changes on `dev_13_system_user_meditation_import_prd`.

It intentionally does **not** include the database/resource reset sequence. If a fresh reset is explicitly approved later, use the separate reset-oriented runbook and get operator authorization before any destructive action.

## Scope

This rollout introduces:

- `meditations.is_default` and `meditations.metadata` model fields.
- `GET /meditations/default` for the default-meditation surface.
- Admin `POST /admin/meditations/:id/set-default`.
- Authenticated meditation import lookup/create/overwrite APIs.
- Root importer command `npm run import:meditations`.
- Retirement of the seeded/template default meditation path.
- Comma-separated `ADMIN_EMAIL` bootstrap support.
- Default-meditation API support and default-prefill behavior in the create form.

## Preconditions

- The operator has approved deploying branch `dev_13_system_user_meditation_import_prd` to the target environment.
- The target environment is not being reset as part of this runbook.
- The API, web, and worker services can be stopped and started with the approved service-management path.
- Import credentials, if imports will be run, are present only in `/home/nick/agents_home/hermes/secrets/.env` and are not committed to this repo.
- The normal users that imports authenticate as already exist, are verified local-login users, and match the credentials file.
- Required prerecorded sound rows/files already exist if imported scripts reference bracketed sounds such as `[Tibetan Singing Bowl]`.

## Steps

### 1. Operator: approve non-reset deployment scope

Confirm the deployment is a normal code rollout and not a destructive refresh. The operator should explicitly decide whether imports and default selection are in scope for this deployment window.

Do not run database drop, schema reset, `project_resources` deletion, or any reset helper from this runbook.

### 2. Server Agent: fetch and check out the deployment branch

From the GoLightly04 repository root:

```bash
git fetch origin --prune
git checkout dev_13_system_user_meditation_import_prd
git pull --ff-only origin dev_13_system_user_meditation_import_prd
git status --short --branch
```

Expected result: the working tree is clean and the local branch is aligned with `origin/dev_13_system_user_meditation_import_prd`.

### 3. Server Agent: install dependencies

Run a root install so the workspace packages and new root script dependencies are present:

```bash
npm install
```

If `npm install` changes package metadata unexpectedly, stop and inspect before continuing.

### 4. Server Agent: run build and typecheck gates

Run the relevant validation commands before touching services:

```bash
npm run typecheck:shared
npm run typecheck:scripts
npm run build:shared
npm run typecheck -w api
npm test -w api -- --runInBand
npm run build -w api
npm run typecheck -w web
npm run build -w web
npm run typecheck -w worker-node
npm test -w worker-node -- --runInBand
```

If a command is unavailable in the target checkout, record the exact missing script and run the nearest package-specific check from that workspace before proceeding.

### 5. Operator: confirm environment variables and importer credentials

For application bootstrap, confirm `ADMIN_EMAIL` can contain the complete comma-separated admin list needed for the environment. Keep `ADMIN_PASSWORD` configured only through the environment manager, not in repository files.

For imports, confirm `/home/nick/agents_home/hermes/secrets/.env` contains the expected keys without printing values:

```dotenv
CREDENTIALS_EMAIL_NICK=...
CREDENTIALS_PASSWORD_NICK=...
CREDENTIALS_EMAIL_BENEVOLENT_MONKEY=...
CREDENTIALS_PASSWORD_BENEVOLENT_MONKEY=...
```

The importer intentionally fails if any `BENEVOLENT_MOKNEY` typo variables are present.

### 6. Server Agent: restart services in dependency order

Use the exact service names approved for the environment. On the dev server the known service units are:

```bash
sudo -n /usr/bin/systemctl stop golightly04-web.service
sudo -n /usr/bin/systemctl stop golightly04-worker-node.service
sudo -n /usr/bin/systemctl stop golightly04-api.service

sudo -n /usr/bin/systemctl start golightly04-api.service
sudo -n /usr/bin/systemctl start golightly04-worker-node.service
sudo -n /usr/bin/systemctl start golightly04-web.service
```

If `restart` is not permitted but `stop` and `start` are, use the stop/start sequence above rather than retrying restart.

### 7. Server Agent: verify services and local ports

Check service state and startup logs:

```bash
systemctl is-active golightly04-api.service golightly04-worker-node.service golightly04-web.service
systemctl status golightly04-api.service --lines=40 --no-pager
systemctl status golightly04-worker-node.service --lines=40 --no-pager
systemctl status golightly04-web.service --lines=40 --no-pager
ss -ltnp | grep -E ':(8001|8002|8003)\b' || true
```

Expected result: API, worker, and web are active; API listens on `8001`, web on `8002`, and worker health/control service on `8003` where applicable.

### 8. Server Agent: smoke-test default endpoint and normal list behavior

Use a low-impact API probe against the target API base:

```bash
API_BASE=http://localhost:8001
curl -sS -i "$API_BASE/meditations/default" | sed -n '1,40p'
curl -sS -i "$API_BASE/meditations/all" | sed -n '1,40p'
```

Acceptable outcomes before a default is selected:

- `/meditations/default` returns the structured no-default state.
- `/meditations/all` responds normally and does not require a seeded/template default meditation.

After a default is selected, verify the default endpoint returns that meditation while ordinary lists do not include it as a normal list row.

### 9. Operator: verify real importer users exist

Before imports, confirm the owner accounts exist as real, verified users in the app:

- `benevolent_monkey@go-lightly.love`
- Nick's configured account from `CREDENTIALS_EMAIL_NICK`

If either owner cannot log in through the app, create or repair that user through approved app/admin flows before running imports. Do not restore the old phantom-user creation path.

### 10. Server Agent: run importer dry-run for each source owner

Run dry-runs first and use owner folders, not the whole source repo:

```bash
npm run import:meditations -- --user-key benevolent_monkey --dir /home/nick/GoLightly04-meditations/benevolent_monkey --api-base http://localhost:8001 --dry-run
npm run import:meditations -- --user-key nick --dir /home/nick/GoLightly04-meditations/nick --api-base http://localhost:8001 --dry-run
```

Expected result: markdown files parse successfully, `## Nick Description` is ignored for published content, and no credentials are printed.

### 11. Operator: approve live import mode

Choose one import mode:

- Skip duplicates: run without `--overwrite`.
- Replace owner-scoped duplicate imports: run with `--overwrite`, understanding that matching imported meditations are deleted through the API cascade path and recreated with new meditation IDs.

This approval is required because import and overwrite mutate live meditation data.

### 12. Server Agent: run approved imports

For duplicate-skip mode:

```bash
npm run import:meditations -- --user-key benevolent_monkey --dir /home/nick/GoLightly04-meditations/benevolent_monkey --api-base http://localhost:8001
npm run import:meditations -- --user-key nick --dir /home/nick/GoLightly04-meditations/nick --api-base http://localhost:8001
```

For overwrite mode, add `--overwrite` to the approved owner command only:

```bash
npm run import:meditations -- --user-key benevolent_monkey --dir /home/nick/GoLightly04-meditations/benevolent_monkey --api-base http://localhost:8001 --overwrite
```

The importer polls created meditations for completion. Do not treat command start as success; wait for the final summary.

### 13. Server Agent: verify imported meditation completion and provenance

Verify the import results through API/admin UI or read-only database checks appropriate to the environment. Confirm:

- Imported rows are owned by the intended user.
- Imported rows are private script-mode meditations unless intentionally changed later.
- `metadata` includes `sourceUserKey`, `sourceFile`, `sourceRoot`, `importedAt`, and `checksum`.
- Created meditations reach `status=complete`.
- The worker queue has no unexpected pending or stuck import-generated jobs.
- No meditation element text is exactly a stray markdown fence such as `three backticks`.

### 14. Operator: select the app default meditation in `/admin`

Open `/admin`, expand the Meditations table, and choose `Set Default` on the intended meditation.

The selected default is expected to be hidden from ordinary meditation lists but visible through `GET /meditations/default`.

### 15. Server Agent: verify default playback and create-form prefill

After default selection, verify:

- `GET /meditations/default` returns the selected default meditation.
- The default meditation can stream/play even if it is private, provided it is complete and marked default.
- Admin stream-token playback still works for private non-owned meditations.
- `GET /meditations/staging` returning `NO_STAGED_MEDITATION` is treated as an empty draft state, not a UI error.
- The Create New Meditation form can prefill from the default meditation when no staged draft exists.

### 16. Operator: smoke-test user-visible web behavior

In a browser, confirm:

- The home page loads without rendering a default meditation section or no-default banner.
- The ordinary meditation table/list does not show the selected default as a regular list item.
- The admin Meditations table shows a Default badge and disables `Set Default` for the current default.
- Delete-user preservation messaging refers to reassignment to the existing `benevolent_monkey` account and does not create a phantom benevolent user.

### 17. Server Agent: capture final deployment evidence

Record the branch, commit, service state, and relevant validation commands in the deployment notes:

```bash
git status --short --branch
git rev-parse HEAD
systemctl is-active golightly04-api.service golightly04-worker-node.service golightly04-web.service
```

Include any skipped import/default steps and who chose to skip them.

### 18. Operator: rollback decision if verification fails

If verification fails and cannot be fixed immediately, the operator chooses between:

- Roll back to the previously deployed branch/commit and restart services.
- Keep the branch deployed while the server agent applies a targeted fix on the feature branch.

Do not run the reset sequence as a rollback unless the operator explicitly approves a destructive refresh.

## Rollback Notes

A normal code rollback should check out the previously deployed commit, install/build if needed, and stop/start API, worker, and web in the same dependency order. Imported meditations and selected default flags are live data changes; rolling back code does not automatically undo those data changes.

If import overwrite was used, old meditation IDs may have been deleted and recreated by design. Treat any data repair as a separate operator-approved live-data task.
