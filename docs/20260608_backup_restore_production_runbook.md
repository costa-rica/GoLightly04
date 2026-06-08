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

Restore needs two classes of runtime DB privileges:

1. `TRUNCATE` on restored tables because the restore flow clears existing rows
   with `TRUNCATE TABLE ... CASCADE` before importing CSV data.
2. `UPDATE` on table `id` sequences because the restore flow resets sequences
   with `setval(...)`; `USAGE`/`SELECT` alone is not enough.

Run this as a DB owner or superuser, replacing `golightly04_app` if production
uses a different runtime app role. Confirm the role from the production API
`.env` value `PG_APP_ROLE` before running these grants.

```sql
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.users,
  public.sound_files,
  public.meditations,
  public.jobs_queue,
  public.contract_user_meditations
TO golightly04_app;

GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO golightly04_app;
```

If you want the narrower explicit sequence form instead:

```sql
GRANT USAGE, SELECT, UPDATE ON SEQUENCE
  public.users_id_seq,
  public.sound_files_id_seq,
  public.meditations_id_seq,
  public.jobs_queue_id_seq,
  public.contract_user_meditations_id_seq
TO golightly04_app;
```

Verify the grants from the app role if possible:

```sql
SELECT
  has_table_privilege('golightly04_app', 'public.users', 'TRUNCATE') AS users_truncate,
  has_table_privilege('golightly04_app', 'public.sound_files', 'TRUNCATE') AS sound_files_truncate,
  has_table_privilege('golightly04_app', 'public.meditations', 'TRUNCATE') AS meditations_truncate,
  has_table_privilege('golightly04_app', 'public.jobs_queue', 'TRUNCATE') AS jobs_queue_truncate,
  has_table_privilege('golightly04_app', 'public.contract_user_meditations', 'TRUNCATE') AS contract_user_meditations_truncate,
  has_sequence_privilege('golightly04_app', 'public.users_id_seq', 'UPDATE') AS users_sequence_update,
  has_sequence_privilege('golightly04_app', 'public.sound_files_id_seq', 'UPDATE') AS sound_files_sequence_update,
  has_sequence_privilege('golightly04_app', 'public.meditations_id_seq', 'UPDATE') AS meditations_sequence_update,
  has_sequence_privilege('golightly04_app', 'public.jobs_queue_id_seq', 'UPDATE') AS jobs_queue_sequence_update,
  has_sequence_privilege('golightly04_app', 'public.contract_user_meditations_id_seq', 'UPDATE') AS contract_user_meditations_sequence_update;
```

All columns should return `t`. If restore returns Postgres SQLSTATE `42501` on
`TRUNCATE TABLE`, the table `TRUNCATE` grant is missing for the runtime app role.

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
