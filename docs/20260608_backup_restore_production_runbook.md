---
created_at: 2026-06-08
updated_at: 2026-06-08
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---

# GoLightly04 Backup/Restore Production Rollout Runbook

## Scope

Deploy branch `prod/backup-restore-rollout` to production without merging to
`main`. This branch includes the admin backup/restore workflow plus follow-up
restore fixes:

- resource-inclusive backup creation from the worker-node;
- admin restore upload for DB-only and DB+resources packages;
- safe zip extraction and safe resource restore into `PATH_PROJECT_RESOURCES`;
- multiline CSV parsing for quoted spreadsheet/script fields;
- explicit restore errors for manifest, DB, resource, and cleanup failures.

## Pre-flight

1. Confirm production has a recent backup before deploying.
2. Confirm the production git working tree is clean:

   ```bash
   cd /home/limited_user/applications/GoLightly04
   git status --short --branch
   ```

3. Confirm the production app DB role. On current GoLightly04 hosts this is
   expected to be `golightly04_prod`, but verify against the production API
   `.env` before running the SQL grant below.

## Fetch and check out the deployment branch

```bash
cd /home/limited_user/applications/GoLightly04
git fetch origin prod/backup-restore-rollout
git checkout -B prod/backup-restore-rollout origin/prod/backup-restore-rollout
git status --short --branch
```

## Install and build

```bash
cd /home/limited_user/applications/GoLightly04
npm install
npm run build:shared
npm run build -w @golightly/api
npm run build -w @golightly/worker-node
npm run build -w @golightly/web
```

## Production DB privilege fix

Restore resets table `id` sequences with `setval(...)`. PostgreSQL requires
`UPDATE` on those sequences for the runtime app role; `USAGE`/`SELECT` alone is
not enough.

Run this as a DB owner or superuser, replacing `golightly04_prod` if production
uses a different runtime role:

```sql
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO golightly04_prod;
```

If you want the narrower explicit form instead:

```sql
GRANT USAGE, SELECT, UPDATE ON SEQUENCE
  public.users_id_seq,
  public.sound_files_id_seq,
  public.meditations_id_seq,
  public.jobs_queue_id_seq,
  public.contract_user_meditations_id_seq
TO golightly04_prod;
```

Verify the grant from the app role if possible:

```sql
SELECT
  has_sequence_privilege('golightly04_prod', 'public.users_id_seq', 'UPDATE') AS users_update,
  has_sequence_privilege('golightly04_prod', 'public.sound_files_id_seq', 'UPDATE') AS sound_files_update,
  has_sequence_privilege('golightly04_prod', 'public.meditations_id_seq', 'UPDATE') AS meditations_update,
  has_sequence_privilege('golightly04_prod', 'public.jobs_queue_id_seq', 'UPDATE') AS jobs_queue_update,
  has_sequence_privilege('golightly04_prod', 'public.contract_user_meditations_id_seq', 'UPDATE') AS contract_user_meditations_update;
```

All columns should return `t`.

## Restart services

Use the permitted production service manager. With systemd:

```bash
sudo /usr/bin/systemctl stop golightly04-worker-node.service
sudo /usr/bin/systemctl stop golightly04-web.service
sudo /usr/bin/systemctl stop golightly04-api.service
sudo /usr/bin/systemctl start golightly04-api.service
sudo /usr/bin/systemctl start golightly04-worker-node.service
sudo /usr/bin/systemctl start golightly04-web.service
```

## Verify after restart

```bash
systemctl is-active golightly04-api.service
systemctl is-active golightly04-worker-node.service
systemctl is-active golightly04-web.service
systemctl status golightly04-api.service --no-pager --lines=30
systemctl status golightly04-worker-node.service --no-pager --lines=30
systemctl status golightly04-web.service --no-pager --lines=30
```

Then verify the admin Database page in the browser:

1. create a DB-only backup;
2. create a backup with sound/resource files included;
3. download the generated zip;
4. perform a restore with a known-good backup package;
5. confirm no `RESOURCE_RESTORE_ERROR`, `DATABASE_RESTORE_ERROR`, or manifest
   errors appear in API logs.

## Rollback

If the feature breaks production behavior, check out the previous production
commit or branch, rebuild the same workspaces, restart the three services, and
leave the DB sequence grants in place. The grants are safe to keep and only allow
the app role to reset sequences it already depends on for restore/import paths.
