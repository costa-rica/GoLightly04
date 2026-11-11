---
created_at: 2026-11-11T00:44:13+00:00
updated_at: 2026-11-11T00:47:15+00:00
created_by: hermes nws-go-lightly-dev (gpt-6.1-sol)
modified_by: hermes nws-go-lightly-dev (gpt-6.1-sol)
---

# GoLightly04 dev deployment: read-only diagnostic report

## Scope and executive findings

Host: `nws-go-lightly-dev`. Repository: `/home/limited_user/applications/GoLightly04`. Inspection began at **2026-11-11 00:37:44 UTC**. All timestamps below are UTC. The final two-hour log window and complete redacted journal tails are included below.

No services were stopped, started, or restarted; no application configuration, database contents/schema, resource permissions, or restore jobs were changed. Database inspection used `PGOPTIONS='-c default_transaction_read_only=on'` (with a statement timeout for the initial queries). HTTP probes were GET/OPTIONS only. The two local `/meditations/all` GET probes generated the two current API error entries identified below. Browser navigation used a fresh unauthenticated session, not operator credentials. Only this report is intended for commit; the existing `package-lock.json` modification is deliberately excluded.

**Confirmed:** shared packages were rebuilt today, the expected code is checked out, and all three systemd services are running. However, the configured local database has **no application tables at all**, not merely a missing username column. The local library endpoint returns 500 / PostgreSQL `42P01`. Public HTTPS connections time out from this host. There is no local nginx configuration/log directory or running nginx service; remote proxy inspection is blocked by connectivity/access. The uploaded backup's arrival or execution is **not evidenced** by current logs or staging files.

**Important frontend distinction:** all admin sections start collapsed and fetch only when expanded. Zero table API calls on initial `/admin` load is intentional in this HEAD. A genuinely unresponsive expansion requires separate authenticated browser evidence; it is not proven by zero initial API calls.

## 1. Deployed code and build artifacts

- Branch: `dev_09_med_table_mod`.
- Initial HEAD and locally recorded tracking branch: `dd5f7522e32cdd9744b86b43635c2f9566166aae`, `fix: unblock failed meditation generation retries`.
- `git merge-base --is-ancestor ad66d69 HEAD` succeeded: this HEAD includes `ad66d69`, `feat: add usernames and meditation tables`.
- Existing working-tree change before this investigation: `package-lock.json` (1 insertion / 19 deletions). It was not edited or staged by this investigation.
- `shared-types/dist`: all 20 files have modification times between **00:00:58.726993 and 00:00:58.844999 today**.
- `db-models/dist`: all 18 files have modification times between **00:01:03.999240 and 00:01:04.109246 today**.
- `db-models/dist/models/User.d.ts`: modified **00:01:04.082244**, and **contains `username`**.
- `web/.next/BUILD_ID`: modified **00:01:57.838767 today**.

The parent dist directories retain older directory mtimes; rewriting existing files does not necessarily update the directory mtime. File mtimes, not directory mtimes, confirm fresh emitted artifacts. These observations support a rebuild today, although mtimes alone do not cryptographically establish the build inputs.

## 2. Processes, uptime, stdout/stderr, and application logs

The deployment uses **systemd**, not PM2 for these processes. Each unit runs as `limited_user:limited_user`, loads its workspace `.env` via `EnvironmentFile`, and has `StandardOutput=journal`, `StandardError=inherit`. Thus stdout and stderr are combined in journald rather than separate PM2 files.

- `golightly04-web.service`: `active/running`, main PID **847** (`npm start`), Next server child **1173**, workspace `web`, port **8002**. Active since **00:06:29**; elapsed **2,174 seconds** for main process at the uptime sample (approximately 36 minutes). Next reported ready at **00:06:41**.
- `golightly04-api.service`: `active/running`, PID **837**, `node dist/server.js`, workspace `api`, port **8001**. Active since **00:06:29**; elapsed **2,174 seconds** at the same sample. Listening log at **00:06:46.107**.
- `golightly04-worker-node.service`: `active/running`, PID **848**, `node dist/server.js`, workspace `worker-node`, port **8003**. Active since **00:06:29**; elapsed **2,173 seconds** at the same sample. Listening log at **00:06:45.014**.

`ss -ltnp` confirms listening sockets on 8001, 8002, and 8003. The complete last 100 journal lines per unit, including redacted historical errors, follow in the appendix. Sparse API/worker output means those tails extend back months; those historical errors are **not** current two-hour failures.

`PATH_TO_LOGS=/home/limited_user/logs` for API and worker. Latest files:

- `GoLightly04API-2026-11-11.log`.
- `GoLightly04WorkerNode-2026-11-11.log`.

Current errors/warnings, exhaustively enumerated in the final-window appendix:

- API at **00:41:19.153Z**, `Unhandled error`, `SequelizeDatabaseError`, SQLSTATE **42P01** (`undefined_table`), while selecting from `public.meditations` and joining `public.users`.
- API at **00:41:19.172Z**, identical error from the second diagnostic GET.
- No worker error/warn entries in the window. No API warnings or additional pre-probe errors found.

The logger's serialized PostgreSQL error contains code, severity, parser routine and SQL, but **does not contain a stack trace or the original PostgreSQL message**. Consequently no unavailable stack/message is invented. Direct read-only psql separately reports `relation "users" does not exist`, and catalog checks confirm both joined tables are absent. The full serialized current errors are retained below, rather than treating a generic HTTP 500 as the only evidence.

Startup at **00:06:45.896** logged `Database provisioned`, and **00:06:46.080** logged successful admin bootstrap (configured 1, created 0, promoted 0). These are historical startup observations, not proof the schema still exists now. The discrepancy with the current missing tables suggests an intervening schema/database change or target/environment discrepancy; this inspection cannot attribute who/what caused it or when.

## 3. Database schema and username migration history

The service environment and unit identify the dev-host database as:

- Host/port: `127.0.0.1:5432`.
- Database: **`golightly04_prod`** (despite being the dev deployment).
- Bootstrap connection user: `golightly04_boot`; runtime role configuration: `golightly04_app`.
- Schema: `public`.

`SELECT current_database(), current_user, inet_server_addr(), inet_server_port()` confirmed this exact connection. `pg_tables` returned **zero non-system tables across all schemas**, so this is not merely a search-path mistake. Catalog `to_regclass` checks returned NULL for all five application tables.

Executed both `\d users` and `\d public.users` against this target:

```text
Did not find any relation named "users".
Did not find any relation named "public.users".
```

Current answers:

- Is there a username column? **No users table exists, so no username column exists in the inspected database.**
- Is username NOT NULL? **Not applicable: table/column absent.**
- Does `users_username_lower_idx` exist? **No**; `pg_indexes` returned zero users indexes.
- Is there a migration ledger? No table matching migration/Sequelize metadata was found; indeed no application tables exist.
- Has `db-models/migrations/20260616_add_user_username.sql` **ever** been applied? **Yes, historical session evidence proves it was applied successfully on this dev host on June 19, 2026.** Retrieved session `20260619_040401_7e30ee0e`, tool message **7495**, records exit code 0 for the actual migration invocation and `ALTER TABLE`, `DO`, `DO`, `ALTER TABLE`, `CREATE INDEX`, followed by the verified index definition:

```sql
CREATE UNIQUE INDEX users_username_lower_idx
ON public.users USING btree (lower(username));
```

That historical record does **not** mean it is applied to the current schema. Its effects are absent now, and no current database migration ledger can supply a later history. Do not conflate “not present now” with “never applied.” The file adds/backfills username, validates it, sets NOT NULL, and creates the case-insensitive unique index. Running it alone now would fail because `users` is missing.

## 4. Database contents: aggregate-only inspection

No user/meditation records, emails, or password values were selected. The requested aggregate SQL was attempted, but absent relations mean the results are **unavailable, not zero**:

- `users` count: unavailable — relation absent.
- `meditations` count: unavailable — relation absent.
- `jobs_queue` count: unavailable — relation absent.
- `sound_files` count: unavailable — relation absent.
- `contract_user_meditations` count: unavailable — relation absent.
- `max(users.updated_at)`: unavailable — relation absent.
- `max(meditations.updated_at)`: unavailable — relation absent.
- `SELECT count(*) FROM meditations WHERE file_path LIKE '/Users/%'`: unavailable — relation absent.

The combined count query aborted at its first missing relation. Independent catalog checks verified each named relation is absent. No substitute counts or fabricated NULL timestamps are supplied. This schema is not a successfully restored, usable application dataset at inspection time. Aggregate data cannot establish whether an earlier restore ran and was subsequently undone.

## 5. API and web health

Status probes used the requested `curl -s -o /dev/null -w '%{http_code}'` shape with a maximum duration to avoid hanging indefinitely.

- `https://api.dev.go-lightly.love/meditations/all`: **000**, meaning **no HTTP response**, not an actual HTTP status. TCP/TLS connection never completed; repeated verbose probe reports curl exit **28**, connection timeout. There is **no response body** to report.
- `http://127.0.0.1:8001/meditations/all`: **500**. Exact response body:

```json
{"error":{"code":"INTERNAL_ERROR","message":"Internal server error","status":500}}
```

- `http://127.0.0.1:8001/healthz`: **200**. This liveness result does not establish database health, as shown by the failing library query.
- `http://127.0.0.1:8002/admin`: **200**.
- Public `https://dev.go-lightly.love/admin`: timeout from server curl and browser navigation.

Both public names resolve on this host to **69.207.163.8**. Repeated connections to port 443 time out before any response headers arrive. This may be an internal-to-public/NAT-hairpin or routing/firewall problem; it does not prove that an operator outside this network sees the same timeout. The operator's observation that the page loads is compatible with a host-specific reachability issue.

## 6. Upload path and reverse-proxy evidence / access limits

This app host has **no `/etc/nginx` or `/var/log/nginx`**, no nginx/caddy/apache service in the service inventory, and no listener on 80/443. `/etc/apache2` contains only `conf-available/javascript-common.conf`; no app vhosts were found. An attempted `sudo -n nginx -T` was refused (`a password is required`); no privilege or configuration changes were attempted.

The local infrastructure reference `/home/nick/agents_home/context_resources/_DataCenterInfrastructure.md` identifies **maestro06** as the Rochester nginx ingress at the public address above. This is a topology reference, not a freshly verified vhost dump. SSH attempt using `maestro06` could not resolve that name, and a read-only SSH connection attempt to `nick@69.207.163.8` timed out on port 22.

Therefore, for **both** `dev.go-lightly.love` and `api.dev.go-lightly.love`:

- Actual server/location configuration and upstream routing: **not retrievable from this host/session**.
- Effective `client_max_body_size`: **unknown**.
- Effective `client_body_timeout`, `proxy_connect_timeout`, `proxy_send_timeout`, `proxy_read_timeout`, `send_timeout`: **unknown**.
- Nginx access/error lines for **413/499/502/504** in the last two hours, especially `/database/replenish-database`: **not accessible**, not “none found.” Proxy-host inspection is still required.

Do not assume nginx's default upload cap is the actual cap. A default-like low cap could reject a 4.6 MB upload, but there is no observed 413 here to support that diagnosis.

Application-side upload handling is independently inspectable:

- `api/src/routes/database.ts:64,143–189` requires admin authorization, accepts multipart field **`file`**, moves the temporary ZIP into `db_replenish`, requests worker replenish, and returns **202** on acceptance.
- `api/src/middleware/upload.ts:12–18`: disk-based Multer limit **`500 * 1024 * 1024` bytes**. The reported 4.6 MB ZIP is below this limit.
- `express.json({ limit: "10mb" })` is a JSON limit, not the multipart ZIP limit.
- `web/src/lib/api/client.ts:13`: Axios timeout **30000 ms**; this is not an nginx timeout.
- No upload or replenish POST was attempted during diagnosis.

## 7. Replenish receipt and staged files

`PATH_PROJECT_RESOURCES=/home/limited_user/project_resources/GoLightly` in both API and worker configuration. The directory `/home/limited_user/project_resources/GoLightly/db_replenish` exists, but the `replenish_*.zip` listing is **empty**.

The latest worker log contains only its **00:06:45.014** listening entry. There is **no `Replenish job` entry during the inspection window**, and no API replenish failure/acceptance evidence in the latest file. Historical journal tails contain June replenish events; those are unrelated to the reported November upload.

Conclusion: **no evidence that the current attempt reached or started on the worker**. The absence of a staged file alone is not definitive: API error paths and worker cleanup may remove staged files. The named input `backup_w_sound_files_20261111_002822.zip`, reported 4.6 MB / `package_type=db_and_resources`, was not replayed, extracted, or validated. The reported package metadata remains operator-provided context, not independently verified archive contents. It cannot establish whether an upload was rejected at ingress, never sent by the browser, or failed earlier in the app path.

## 8. Web build environment, CORS, and no-initial-requests behavior

**Actual emitted client build**, not merely current `.env`:

- `NEXT_PUBLIC_API_BASE_URL=https://api.dev.go-lightly.love`.
- `NEXT_PUBLIC_MODE=testing`.

Both literals are embedded in `web/.next/static/chunks/0knn3-ffg26s9.js`; the API URL is also present in the API-client chunk `0vsii9dwc00w~.js`. Fresh local browser execution logged `Go Lightly application started` with `mode: testing` and the expected API URL. Current web env agrees. No full environment files or other identifiers are included here.

CORS: source `api/src/app.ts:18` uses `cors({ exposedHeaders: ["Content-Disposition"] })` without an origin restriction. A live local preflight with `Origin: https://dev.go-lightly.love`, method GET, and requested header authorization returned:

```text
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE
Access-Control-Allow-Headers: authorization
Access-Control-Expose-Headers: Content-Disposition
```

Thus **the running local API permits that origin for the app's bearer-token requests**. The client does not enable cookie credentials in its axios setup. Public-response CORS cannot be verified because ingress times out; an unseen proxy override remains untested. No CORS change is warranted by the local evidence.

Frontend behavior at this HEAD:

- `web/src/app/admin/page.tsx:56,66,78,91,98`: Users, Sounds, Meditations, Queue, and Database all start collapsed.
- Effects beginning at lines 223 onward call each fetch only when its section is expanded. Commits `5135d30` and `3617ab2` intentionally reduced initial loading; both precede this HEAD.
- `ProtectedRoute.tsx` redirects unauthenticated/non-admin sessions to `/` without fetching admin tables. A fresh local browser followed exactly that path, loaded the client chunks, and produced **no uncaught JavaScript errors**. This proves basic local hydration works; it does not reproduce the operator's authenticated admin session.
- `NEXT_PUBLIC_MODE=testing` suppresses `logger.debug` output because `web/src/lib/logger.ts:24` enables development logging only in development. Absence of “API Request” console debug messages is not proof of absence in the browser Network panel.
- Earlier report `docs/20260630_admin_table_over_rendering_report.md` describes a historical Firefox/TanStack slow-render hypothesis. That is relevant prior context, **not current reproduction evidence**, and should not outrank the directly observed missing database schema.

Authenticated public admin interaction, expansion responsiveness, and the original upload's Network-panel status remain unverified. No credentials or persisted user/session state were retrieved or forged for this test.

## Evidence appendix: final log window and last 100 journal lines

The following appendix is populated at final capture. Logs are redacted for email addresses, password hashes, tokens, and secret assignments. Historical failures in journal tails are preserved for completeness but are explicitly outside the current incident window unless their timestamps fall inside it.



### Final application-log window

**2026-11-10T22:47:15.524751+00:00 through 2026-11-11T00:47:15.524751+00:00**, inclusive. Every error/warn entry in the retained API/worker files intersecting this interval is included below.

#### GoLightly04API- error/warn entries: 2

`GoLightly04API-2026-11-11.log:5`

```json
{"app":"GoLightly04API","error":{"name":"SequelizeDatabaseError","original":{"code":"42P01","file":"parse_relation.c","length":118,"line":"1428","name":"error","position":"914","routine":"parserOpenTable","severity":"ERROR","sql":"SELECT \"Meditation\".\"id\", \"Meditation\".\"user_id\" AS \"userId\", \"Meditation\".\"title\", \"Meditation\".\"description\", \"Meditation\".\"meditation_array\" AS \"meditationArray\", \"Meditation\".\"filename\", \"Meditation\".\"file_path\" AS \"filePath\", \"Meditation\".\"visibility\", \"Meditation\".\"stage\", \"Meditation\".\"source_mode\" AS \"sourceMode\", \"Meditation\".\"script_source\" AS \"scriptSource\", \"Meditation\".\"is_default\" AS \"isDefault\", \"Meditation\".\"metadata\", \"Meditation\".\"status\", \"Meditation\".\"listen_count\" AS \"listenCount\", \"Meditation\".\"duration_seconds\" AS \"durationSeconds\", \"Meditation\".\"duration_seconds_talking\" AS \"durationSecondsTalking\", \"Meditation\".\"duration_seconds_pause\" AS \"durationSecondsPause\", \"Meditation\".\"duration_seconds_sound\" AS \"durationSecondsSound\", \"Meditation\".\"created_at\" AS \"createdAt\", \"Meditation\".\"updated_at\" AS \"updatedAt\", \"User\".\"id\" AS \"User.id\", \"User\".\"username\" AS \"User.username\" FROM \"public\".\"meditations\" AS \"Meditation\" LEFT OUTER JOIN \"public\".\"users\" AS \"User\" ON \"Meditation\".\"user_id\" = \"User\".\"id\" WHERE \"Meditation\".\"stage\" = 'library' AND \"Meditation\".\"visibility\" = 'public' AND \"Meditation\".\"status\" = 'complete' AND \"Meditation\".\"is_default\" = false ORDER BY \"createdAt\" DESC;"},"parameters":{},"parent":{"code":"42P01","file":"parse_relation.c","length":118,"line":"1428","name":"error","position":"914","routine":"parserOpenTable","severity":"ERROR","sql":"SELECT \"Meditation\".\"id\", \"Meditation\".\"user_id\" AS \"userId\", \"Meditation\".\"title\", \"Meditation\".\"description\", \"Meditation\".\"meditation_array\" AS \"meditationArray\", \"Meditation\".\"filename\", \"Meditation\".\"file_path\" AS \"filePath\", \"Meditation\".\"visibility\", \"Meditation\".\"stage\", \"Meditation\".\"source_mode\" AS \"sourceMode\", \"Meditation\".\"script_source\" AS \"scriptSource\", \"Meditation\".\"is_default\" AS \"isDefault\", \"Meditation\".\"metadata\", \"Meditation\".\"status\", \"Meditation\".\"listen_count\" AS \"listenCount\", \"Meditation\".\"duration_seconds\" AS \"durationSeconds\", \"Meditation\".\"duration_seconds_talking\" AS \"durationSecondsTalking\", \"Meditation\".\"duration_seconds_pause\" AS \"durationSecondsPause\", \"Meditation\".\"duration_seconds_sound\" AS \"durationSecondsSound\", \"Meditation\".\"created_at\" AS \"createdAt\", \"Meditation\".\"updated_at\" AS \"updatedAt\", \"User\".\"id\" AS \"User.id\", \"User\".\"username\" AS \"User.username\" FROM \"public\".\"meditations\" AS \"Meditation\" LEFT OUTER JOIN \"public\".\"users\" AS \"User\" ON \"Meditation\".\"user_id\" = \"User\".\"id\" WHERE \"Meditation\".\"stage\" = 'library' AND \"Meditation\".\"visibility\" = 'public' AND \"Meditation\".\"status\" = 'complete' AND \"Meditation\".\"is_default\" = false ORDER BY \"createdAt\" DESC;"},"sql":"SELECT \"Meditation\".\"id\", \"Meditation\".\"user_id\" AS \"userId\", \"Meditation\".\"title\", \"Meditation\".\"description\", \"Meditation\".\"meditation_array\" AS \"meditationArray\", \"Meditation\".\"filename\", \"Meditation\".\"file_path\" AS \"filePath\", \"Meditation\".\"visibility\", \"Meditation\".\"stage\", \"Meditation\".\"source_mode\" AS \"sourceMode\", \"Meditation\".\"script_source\" AS \"scriptSource\", \"Meditation\".\"is_default\" AS \"isDefault\", \"Meditation\".\"metadata\", \"Meditation\".\"status\", \"Meditation\".\"listen_count\" AS \"listenCount\", \"Meditation\".\"duration_seconds\" AS \"durationSeconds\", \"Meditation\".\"duration_seconds_talking\" AS \"durationSecondsTalking\", \"Meditation\".\"duration_seconds_pause\" AS \"durationSecondsPause\", \"Meditation\".\"duration_seconds_sound\" AS \"durationSecondsSound\", \"Meditation\".\"created_at\" AS \"createdAt\", \"Meditation\".\"updated_at\" AS \"updatedAt\", \"User\".\"id\" AS \"User.id\", \"User\".\"username\" AS \"User.username\" FROM \"public\".\"meditations\" AS \"Meditation\" LEFT OUTER JOIN \"public\".\"users\" AS \"User\" ON \"Meditation\".\"user_id\" = \"User\".\"id\" WHERE \"Meditation\".\"stage\" = 'library' AND \"Meditation\".\"visibility\" = 'public' AND \"Meditation\".\"status\" = 'complete' AND \"Meditation\".\"is_default\" = false ORDER BY \"createdAt\" DESC;"},"level":"error","message":"Unhandled error","timestamp":"2026-11-11T00:41:19.153Z"}
```

`GoLightly04API-2026-11-11.log:6`

```json
{"app":"GoLightly04API","error":{"name":"SequelizeDatabaseError","original":{"code":"42P01","file":"parse_relation.c","length":118,"line":"1428","name":"error","position":"914","routine":"parserOpenTable","severity":"ERROR","sql":"SELECT \"Meditation\".\"id\", \"Meditation\".\"user_id\" AS \"userId\", \"Meditation\".\"title\", \"Meditation\".\"description\", \"Meditation\".\"meditation_array\" AS \"meditationArray\", \"Meditation\".\"filename\", \"Meditation\".\"file_path\" AS \"filePath\", \"Meditation\".\"visibility\", \"Meditation\".\"stage\", \"Meditation\".\"source_mode\" AS \"sourceMode\", \"Meditation\".\"script_source\" AS \"scriptSource\", \"Meditation\".\"is_default\" AS \"isDefault\", \"Meditation\".\"metadata\", \"Meditation\".\"status\", \"Meditation\".\"listen_count\" AS \"listenCount\", \"Meditation\".\"duration_seconds\" AS \"durationSeconds\", \"Meditation\".\"duration_seconds_talking\" AS \"durationSecondsTalking\", \"Meditation\".\"duration_seconds_pause\" AS \"durationSecondsPause\", \"Meditation\".\"duration_seconds_sound\" AS \"durationSecondsSound\", \"Meditation\".\"created_at\" AS \"createdAt\", \"Meditation\".\"updated_at\" AS \"updatedAt\", \"User\".\"id\" AS \"User.id\", \"User\".\"username\" AS \"User.username\" FROM \"public\".\"meditations\" AS \"Meditation\" LEFT OUTER JOIN \"public\".\"users\" AS \"User\" ON \"Meditation\".\"user_id\" = \"User\".\"id\" WHERE \"Meditation\".\"stage\" = 'library' AND \"Meditation\".\"visibility\" = 'public' AND \"Meditation\".\"status\" = 'complete' AND \"Meditation\".\"is_default\" = false ORDER BY \"createdAt\" DESC;"},"parameters":{},"parent":{"code":"42P01","file":"parse_relation.c","length":118,"line":"1428","name":"error","position":"914","routine":"parserOpenTable","severity":"ERROR","sql":"SELECT \"Meditation\".\"id\", \"Meditation\".\"user_id\" AS \"userId\", \"Meditation\".\"title\", \"Meditation\".\"description\", \"Meditation\".\"meditation_array\" AS \"meditationArray\", \"Meditation\".\"filename\", \"Meditation\".\"file_path\" AS \"filePath\", \"Meditation\".\"visibility\", \"Meditation\".\"stage\", \"Meditation\".\"source_mode\" AS \"sourceMode\", \"Meditation\".\"script_source\" AS \"scriptSource\", \"Meditation\".\"is_default\" AS \"isDefault\", \"Meditation\".\"metadata\", \"Meditation\".\"status\", \"Meditation\".\"listen_count\" AS \"listenCount\", \"Meditation\".\"duration_seconds\" AS \"durationSeconds\", \"Meditation\".\"duration_seconds_talking\" AS \"durationSecondsTalking\", \"Meditation\".\"duration_seconds_pause\" AS \"durationSecondsPause\", \"Meditation\".\"duration_seconds_sound\" AS \"durationSecondsSound\", \"Meditation\".\"created_at\" AS \"createdAt\", \"Meditation\".\"updated_at\" AS \"updatedAt\", \"User\".\"id\" AS \"User.id\", \"User\".\"username\" AS \"User.username\" FROM \"public\".\"meditations\" AS \"Meditation\" LEFT OUTER JOIN \"public\".\"users\" AS \"User\" ON \"Meditation\".\"user_id\" = \"User\".\"id\" WHERE \"Meditation\".\"stage\" = 'library' AND \"Meditation\".\"visibility\" = 'public' AND \"Meditation\".\"status\" = 'complete' AND \"Meditation\".\"is_default\" = false ORDER BY \"createdAt\" DESC;"},"sql":"SELECT \"Meditation\".\"id\", \"Meditation\".\"user_id\" AS \"userId\", \"Meditation\".\"title\", \"Meditation\".\"description\", \"Meditation\".\"meditation_array\" AS \"meditationArray\", \"Meditation\".\"filename\", \"Meditation\".\"file_path\" AS \"filePath\", \"Meditation\".\"visibility\", \"Meditation\".\"stage\", \"Meditation\".\"source_mode\" AS \"sourceMode\", \"Meditation\".\"script_source\" AS \"scriptSource\", \"Meditation\".\"is_default\" AS \"isDefault\", \"Meditation\".\"metadata\", \"Meditation\".\"status\", \"Meditation\".\"listen_count\" AS \"listenCount\", \"Meditation\".\"duration_seconds\" AS \"durationSeconds\", \"Meditation\".\"duration_seconds_talking\" AS \"durationSecondsTalking\", \"Meditation\".\"duration_seconds_pause\" AS \"durationSecondsPause\", \"Meditation\".\"duration_seconds_sound\" AS \"durationSecondsSound\", \"Meditation\".\"created_at\" AS \"createdAt\", \"Meditation\".\"updated_at\" AS \"updatedAt\", \"User\".\"id\" AS \"User.id\", \"User\".\"username\" AS \"User.username\" FROM \"public\".\"meditations\" AS \"Meditation\" LEFT OUTER JOIN \"public\".\"users\" AS \"User\" ON \"Meditation\".\"user_id\" = \"User\".\"id\" WHERE \"Meditation\".\"stage\" = 'library' AND \"Meditation\".\"visibility\" = 'public' AND \"Meditation\".\"status\" = 'complete' AND \"Meditation\".\"is_default\" = false ORDER BY \"createdAt\" DESC;"},"level":"error","message":"Unhandled error","timestamp":"2026-11-11T00:41:19.172Z"}
```

#### GoLightly04WorkerNode- error/warn entries: 0

### Last 100 combined stdout/stderr journal lines: web

```text
2026-10-29T12:13:40+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-10-29T12:13:40+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-10-29T12:13:40+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action. This request might be from an older or newer deployment.
2026-10-29T12:13:40+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-10-29T12:13:40+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-10-29T12:13:40+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "edca28d317bfc82c221dc4734ad2ff333afb377b". This request might be from an older or newer deployment.
2026-10-29T12:13:40+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-10-29T12:13:40+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-10-30T05:46:57+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
2026-10-30T05:46:57+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-10-30T05:46:57+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-10-30T05:46:57+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
2026-10-30T05:46:57+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-10-30T05:46:57+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-10-30T05:46:58+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
2026-10-30T05:46:58+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-10-30T05:46:58+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-10-30T05:46:59+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
2026-10-30T05:46:59+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-10-30T05:46:59+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-10-30T05:46:59+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
2026-10-30T05:46:59+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-10-30T05:46:59+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-10-30T05:47:00+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
2026-10-30T05:47:00+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-10-30T05:47:00+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-10-31T19:49:02+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
2026-10-31T19:49:02+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-10-31T19:49:02+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-10-31T19:49:03+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
2026-10-31T19:49:03+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-10-31T19:49:03+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-10-31T19:49:03+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
2026-10-31T19:49:03+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-10-31T19:49:03+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-02T10:02:12+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "y". This request might be from an older or newer deployment.
2026-11-02T10:02:12+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-02T10:02:12+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-06T12:22:44+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
2026-11-06T12:22:44+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-06T12:22:44+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-06T12:22:44+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
2026-11-06T12:22:44+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-06T12:22:44+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-06T12:22:44+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
2026-11-06T12:22:44+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-06T12:22:44+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "b5b31c489206168ff7f9608377452afc60ecc6ad". This request might be from an older or newer deployment.
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action. This request might be from an older or newer deployment.
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action. This request might be from an older or newer deployment.
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action. This request might be from an older or newer deployment.
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action. This request might be from an older or newer deployment.
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action. This request might be from an older or newer deployment.
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-08T00:11:34+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-08T00:11:35+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action. This request might be from an older or newer deployment.
2026-11-08T00:11:35+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-08T00:11:35+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-08T00:11:35+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action. This request might be from an older or newer deployment.
2026-11-08T00:11:35+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-08T00:11:35+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-08T00:11:35+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action. This request might be from an older or newer deployment.
2026-11-08T00:11:35+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-08T00:11:35+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-08T00:11:35+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "ab0e0baea82fe7d90fcfa921efa004b86491a815". This request might be from an older or newer deployment.
2026-11-08T00:11:35+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-08T00:11:35+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-09T00:43:38+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
2026-11-09T00:43:38+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-09T00:43:38+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-09T00:43:38+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
2026-11-09T00:43:38+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-09T00:43:38+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-09T00:43:38+00:00 nws-go-lightly-dev npm[1347]: Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
2026-11-09T00:43:38+00:00 nws-go-lightly-dev npm[1347]: Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
2026-11-09T00:43:38+00:00 nws-go-lightly-dev npm[1347]:     at ignore-listed frames
2026-11-11T00:05:56+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-web.service - GoLightly04 NextJS Application...
2026-11-11T00:06:02+00:00 nws-go-lightly-dev npm[309941]: > @golightly/web@0.1.0 start
2026-11-11T00:06:02+00:00 nws-go-lightly-dev npm[309941]: > next start -p ${PORT:-3001}
2026-11-11T00:06:05+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-web.service - GoLightly04 NextJS Application...
2026-11-11T00:06:05+00:00 nws-go-lightly-dev systemd[1]: golightly04-web.service: Deactivated successfully.
2026-11-11T00:06:05+00:00 nws-go-lightly-dev systemd[1]: Stopped golightly04-web.service - GoLightly04 NextJS Application.
2026-11-11T00:06:05+00:00 nws-go-lightly-dev systemd[1]: golightly04-web.service: Consumed 1.307s CPU time.
-- Boot 0dcfcb789246482bb340b12436c26694 --
2026-11-11T00:06:29+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-web.service - GoLightly04 NextJS Application.
2026-11-11T00:06:38+00:00 nws-go-lightly-dev npm[847]: > @golightly/web@0.1.0 start
2026-11-11T00:06:38+00:00 nws-go-lightly-dev npm[847]: > next start -p ${PORT:-3001}
2026-11-11T00:06:41+00:00 nws-go-lightly-dev npm[1173]: ▲ Next.js 16.2.6
2026-11-11T00:06:41+00:00 nws-go-lightly-dev npm[1173]: - Local:         http://localhost:8002
2026-11-11T00:06:41+00:00 nws-go-lightly-dev npm[1173]: - Network:       http://192.168.100.214:8002
2026-11-11T00:06:41+00:00 nws-go-lightly-dev npm[1173]: ✓ Ready in 2.0s

```

### Last 100 combined stdout/stderr journal lines: api

```text
2026-06-16T19:37:56+00:00 nws-go-lightly-dev systemd[1]: golightly04-api.service: Consumed 1.181s CPU time, 53.9M memory peak, 0B memory swap peak.
2026-06-16T19:37:56+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-api.service - GoLightly04 ExpressJS API Application.
2026-06-16T19:37:56+00:00 nws-go-lightly-dev node[15123]: ◇ injected env (0) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
2026-06-16T19:37:59+00:00 nws-go-lightly-dev node[15123]: {"app":"GoLightly04API","level":"info","message":"Database provisioned","timestamp":"2026-06-16T19:37:59.532Z"}
2026-06-16T19:37:59+00:00 nws-go-lightly-dev node[15123]: {"app":"GoLightly04API","level":"info","message":"Project resource directories ensured","timestamp":"2026-06-16T19:37:59.543Z"}
2026-06-16T19:37:59+00:00 nws-go-lightly-dev node[15123]: {"app":"GoLightly04API","configuredCount":1,"createdCount":0,"level":"info","message":"Admin bootstrap complete","promotedCount":0,"timestamp":"2026-06-16T19:37:59.838Z"}
2026-06-16T19:37:59+00:00 nws-go-lightly-dev node[15123]: {"app":"GoLightly04API","level":"info","message":"API server listening","port":8001,"timestamp":"2026-06-16T19:37:59.858Z"}
2026-06-16T19:55:16+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-api.service - GoLightly04 ExpressJS API Application...
2026-06-16T19:55:16+00:00 nws-go-lightly-dev systemd[1]: golightly04-api.service: Deactivated successfully.
2026-06-16T19:55:16+00:00 nws-go-lightly-dev systemd[1]: Stopped golightly04-api.service - GoLightly04 ExpressJS API Application.
2026-06-16T19:55:16+00:00 nws-go-lightly-dev systemd[1]: golightly04-api.service: Consumed 1.170s CPU time, 52.5M memory peak, 0B memory swap peak.
2026-06-16T19:55:16+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-api.service - GoLightly04 ExpressJS API Application.
2026-06-16T19:55:16+00:00 nws-go-lightly-dev node[15580]: ◇ injected env (0) from .env // tip: ⌘ override existing { override: true }
2026-06-16T19:55:19+00:00 nws-go-lightly-dev node[15580]: {"app":"GoLightly04API","level":"info","message":"Database provisioned","timestamp":"2026-06-16T19:55:19.516Z"}
2026-06-16T19:55:19+00:00 nws-go-lightly-dev node[15580]: {"app":"GoLightly04API","level":"info","message":"Project resource directories ensured","timestamp":"2026-06-16T19:55:19.526Z"}
2026-06-16T19:55:19+00:00 nws-go-lightly-dev node[15580]: {"app":"GoLightly04API","configuredCount":1,"createdCount":0,"level":"info","message":"Admin bootstrap complete","promotedCount":0,"timestamp":"2026-06-16T19:55:19.851Z"}
2026-06-16T19:55:19+00:00 nws-go-lightly-dev node[15580]: {"app":"GoLightly04API","level":"info","message":"API server listening","port":8001,"timestamp":"2026-06-16T19:55:19.887Z"}
-- Boot f9949e4084944c7fa535f4b05722f4ba --
2026-06-19T01:53:03+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-api.service - GoLightly04 ExpressJS API Application.
2026-06-19T01:53:23+00:00 nws-go-lightly-dev node[906]: ◇ injected env (0) from .env // tip: ⌘ override existing { override: true }
2026-06-19T01:54:47+00:00 nws-go-lightly-dev node[906]: {"app":"GoLightly04API","level":"info","message":"Database provisioned","timestamp":"2026-06-19T01:54:47.690Z"}
2026-06-19T01:54:47+00:00 nws-go-lightly-dev node[906]: {"app":"GoLightly04API","level":"info","message":"Project resource directories ensured","timestamp":"2026-06-19T01:54:47.694Z"}
2026-06-19T01:54:47+00:00 nws-go-lightly-dev node[906]: {"app":"GoLightly04API","error":{"name":"SequelizeDatabaseError","original":{"code":"42703","file":"parse_relation.c","length":108,"line":"3722","name":"error","position":"23","routine":"errorMissingColumn","severity":"ERROR","sql":"SELECT \"id\", \"email\", \"username\", \"password\", \"auth_provider\" AS \"authProvider\", \"is_email_verified\" AS \"isEmailVerified\", \"email_verified_at\" AS \"emailVerifiedAt\", \"is_admin\" AS \"isAdmin\", \"show_script_mode_for_creating_meditations\" AS \"showScriptModeForCreatingMeditations\", \"created_at\" AS \"createdAt\", \"updated_at\" AS \"updatedAt\" FROM \"public\".\"users\" AS \"User\" WHERE \"User\".\"email\" = '[REDACTED_EMAIL]';"},"parameters":{},"parent":{"code":"42703","file":"parse_relation.c","length":108,"line":"3722","name":"error","position":"23","routine":"errorMissingColumn","severity":"ERROR","sql":"SELECT \"id\", \"email\", \"username\", \"password\", \"auth_provider\" AS \"authProvider\", \"is_email_verified\" AS \"isEmailVerified\", \"email_verified_at\" AS \"emailVerifiedAt\", \"is_admin\" AS \"isAdmin\", \"show_script_mode_for_creating_meditations\" AS \"showScriptModeForCreatingMeditations\", \"created_at\" AS \"createdAt\", \"updated_at\" AS \"updatedAt\" FROM \"public\".\"users\" AS \"User\" WHERE \"User\".\"email\" = '[REDACTED_EMAIL]';"},"sql":"SELECT \"id\", \"email\", \"username\", \"password\", \"auth_provider\" AS \"authProvider\", \"is_email_verified\" AS \"isEmailVerified\", \"email_verified_at\" AS \"emailVerifiedAt\", \"is_admin\" AS \"isAdmin\", \"show_script_mode_for_creating_meditations\" AS \"showScriptModeForCreatingMeditations\", \"created_at\" AS \"createdAt\", \"updated_at\" AS \"updatedAt\" FROM \"public\".\"users\" AS \"User\" WHERE \"User\".\"email\" = '[REDACTED_EMAIL]';"},"level":"error","message":"API startup failed","timestamp":"2026-06-19T01:54:47.814Z"}
2026-06-19T01:54:47+00:00 nws-go-lightly-dev node[906]: API startup failed
2026-06-19T01:54:47+00:00 nws-go-lightly-dev systemd[1]: golightly04-api.service: Main process exited, code=exited, status=1/FAILURE
2026-06-19T01:54:47+00:00 nws-go-lightly-dev systemd[1]: golightly04-api.service: Failed with result 'exit-code'.
2026-06-19T01:54:47+00:00 nws-go-lightly-dev systemd[1]: golightly04-api.service: Consumed 1.340s CPU time.
2026-06-19T04:07:45+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-api.service - GoLightly04 ExpressJS API Application.
2026-06-19T04:07:45+00:00 nws-go-lightly-dev node[2964]: ◇ injected env (0) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
2026-06-19T04:07:48+00:00 nws-go-lightly-dev node[2964]: {"app":"GoLightly04API","level":"info","message":"Database provisioned","timestamp":"2026-06-19T04:07:48.680Z"}
2026-06-19T04:07:48+00:00 nws-go-lightly-dev node[2964]: {"app":"GoLightly04API","level":"info","message":"Project resource directories ensured","timestamp":"2026-06-19T04:07:48.689Z"}
2026-06-19T04:07:48+00:00 nws-go-lightly-dev node[2964]: {"app":"GoLightly04API","error":{"name":"SequelizeDatabaseError","original":{"code":"42501","file":"aclchk.c","length":93,"line":"2812","name":"error","routine":"aclcheck_error","severity":"ERROR","sql":"SELECT \"id\", \"email\", \"username\", \"password\", \"auth_provider\" AS \"authProvider\", \"is_email_verified\" AS \"isEmailVerified\", \"email_verified_at\" AS \"emailVerifiedAt\", \"is_admin\" AS \"isAdmin\", \"show_script_mode_for_creating_meditations\" AS \"showScriptModeForCreatingMeditations\", \"created_at\" AS \"createdAt\", \"updated_at\" AS \"updatedAt\" FROM \"public\".\"users\" AS \"User\" WHERE \"User\".\"email\" = '[REDACTED_EMAIL]';"},"parameters":{},"parent":{"code":"42501","file":"aclchk.c","length":93,"line":"2812","name":"error","routine":"aclcheck_error","severity":"ERROR","sql":"SELECT \"id\", \"email\", \"username\", \"password\", \"auth_provider\" AS \"authProvider\", \"is_email_verified\" AS \"isEmailVerified\", \"email_verified_at\" AS \"emailVerifiedAt\", \"is_admin\" AS \"isAdmin\", \"show_script_mode_for_creating_meditations\" AS \"showScriptModeForCreatingMeditations\", \"created_at\" AS \"createdAt\", \"updated_at\" AS \"updatedAt\" FROM \"public\".\"users\" AS \"User\" WHERE \"User\".\"email\" = '[REDACTED_EMAIL]';"},"sql":"SELECT \"id\", \"email\", \"username\", \"password\", \"auth_provider\" AS \"authProvider\", \"is_email_verified\" AS \"isEmailVerified\", \"email_verified_at\" AS \"emailVerifiedAt\", \"is_admin\" AS \"isAdmin\", \"show_script_mode_for_creating_meditations\" AS \"showScriptModeForCreatingMeditations\", \"created_at\" AS \"createdAt\", \"updated_at\" AS \"updatedAt\" FROM \"public\".\"users\" AS \"User\" WHERE \"User\".\"email\" = '[REDACTED_EMAIL]';"},"level":"error","message":"API startup failed","timestamp":"2026-06-19T04:07:48.819Z"}
2026-06-19T04:07:48+00:00 nws-go-lightly-dev node[2964]: API startup failed
2026-06-19T04:07:48+00:00 nws-go-lightly-dev systemd[1]: golightly04-api.service: Main process exited, code=exited, status=1/FAILURE
2026-06-19T04:07:48+00:00 nws-go-lightly-dev systemd[1]: golightly04-api.service: Failed with result 'exit-code'.
2026-06-19T04:07:48+00:00 nws-go-lightly-dev systemd[1]: golightly04-api.service: Consumed 1.049s CPU time.
2026-06-19T04:08:58+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-api.service - GoLightly04 ExpressJS API Application.
2026-06-19T04:08:58+00:00 nws-go-lightly-dev node[3160]: ◇ injected env (0) from .env // tip: ⌘ override existing { override: true }
2026-06-19T04:09:01+00:00 nws-go-lightly-dev node[3160]: {"app":"GoLightly04API","level":"info","message":"Database provisioned","timestamp":"2026-06-19T04:09:01.212Z"}
2026-06-19T04:09:01+00:00 nws-go-lightly-dev node[3160]: {"app":"GoLightly04API","level":"info","message":"Project resource directories ensured","timestamp":"2026-06-19T04:09:01.224Z"}
2026-06-19T04:09:01+00:00 nws-go-lightly-dev node[3160]: {"app":"GoLightly04API","configuredCount":1,"createdCount":1,"level":"info","message":"Admin bootstrap complete","promotedCount":0,"timestamp":"2026-06-19T04:09:01.625Z"}
2026-06-19T04:09:01+00:00 nws-go-lightly-dev node[3160]: {"app":"GoLightly04API","level":"info","message":"API server listening","port":8001,"timestamp":"2026-06-19T04:09:01.665Z"}
-- Boot daf597a9ebec4955b57ce1cd57302a8d --
2026-06-19T19:04:29+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-api.service - GoLightly04 ExpressJS API Application.
2026-06-19T19:04:53+00:00 nws-go-lightly-dev node[905]: ◇ injected env (0) from .env // tip: ⌁ auth for agents [www.vestauth.com]
2026-06-19T19:05:44+00:00 nws-go-lightly-dev node[905]: {"app":"GoLightly04API","level":"info","message":"Database provisioned","timestamp":"2026-06-19T19:05:44.347Z"}
2026-06-19T19:05:44+00:00 nws-go-lightly-dev node[905]: {"app":"GoLightly04API","level":"info","message":"Project resource directories ensured","timestamp":"2026-06-19T19:05:44.351Z"}
2026-06-19T19:05:44+00:00 nws-go-lightly-dev node[905]: {"app":"GoLightly04API","configuredCount":1,"createdCount":0,"level":"info","message":"Admin bootstrap complete","promotedCount":0,"timestamp":"2026-06-19T19:05:44.616Z"}
2026-06-19T19:05:44+00:00 nws-go-lightly-dev node[905]: {"app":"GoLightly04API","level":"info","message":"API server listening","port":8001,"timestamp":"2026-06-19T19:05:44.634Z"}
-- Boot 9285f7344f43405fb4c5fcb41034049c --
2026-07-19T02:56:49+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-api.service - GoLightly04 ExpressJS API Application.
2026-07-19T02:57:38+00:00 nws-go-lightly-dev node[909]: ◇ injected env (0) from .env // tip: ⌁ auth for agents [www.vestauth.com]
2026-07-19T02:59:04+00:00 nws-go-lightly-dev node[909]: {"app":"GoLightly04API","level":"info","message":"Database provisioned","timestamp":"2026-07-19T02:59:04.327Z"}
2026-07-19T02:59:04+00:00 nws-go-lightly-dev node[909]: {"app":"GoLightly04API","level":"info","message":"Project resource directories ensured","timestamp":"2026-07-19T02:59:04.332Z"}
2026-07-19T02:59:04+00:00 nws-go-lightly-dev node[909]: {"app":"GoLightly04API","configuredCount":1,"createdCount":0,"level":"info","message":"Admin bootstrap complete","promotedCount":0,"timestamp":"2026-07-19T02:59:04.558Z"}
2026-07-19T02:59:04+00:00 nws-go-lightly-dev node[909]: {"app":"GoLightly04API","level":"info","message":"API server listening","port":8001,"timestamp":"2026-07-19T02:59:04.576Z"}
-- Boot bae980894d884a1987b724ba33681553 --
2026-07-21T22:24:45+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-api.service - GoLightly04 ExpressJS API Application.
2026-07-21T22:25:11+00:00 nws-go-lightly-dev node[903]: ◇ injected env (0) from .env // tip: ⌘ multiple files { path: ['.env.local', '.env'] }
2026-07-21T22:26:15+00:00 nws-go-lightly-dev node[903]: {"app":"GoLightly04API","level":"info","message":"Database provisioned","timestamp":"2026-07-21T22:26:15.985Z"}
2026-07-21T22:26:15+00:00 nws-go-lightly-dev node[903]: {"app":"GoLightly04API","level":"info","message":"Project resource directories ensured","timestamp":"2026-07-21T22:26:15.990Z"}
2026-07-21T22:26:16+00:00 nws-go-lightly-dev node[903]: {"app":"GoLightly04API","configuredCount":1,"createdCount":0,"level":"info","message":"Admin bootstrap complete","promotedCount":0,"timestamp":"2026-07-21T22:26:16.212Z"}
2026-07-21T22:26:16+00:00 nws-go-lightly-dev node[903]: {"app":"GoLightly04API","level":"info","message":"API server listening","port":8001,"timestamp":"2026-07-21T22:26:16.232Z"}
2026-07-28T06:21:27+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-api.service - GoLightly04 ExpressJS API Application...
2026-07-28T06:21:29+00:00 nws-go-lightly-dev node[47592]: ◇ injected env (0) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
2026-07-28T06:21:36+00:00 nws-go-lightly-dev node[47592]: {"app":"GoLightly04API","level":"info","message":"Database provisioned","timestamp":"2026-07-28T06:21:36.033Z"}
2026-07-28T06:21:36+00:00 nws-go-lightly-dev node[47592]: {"app":"GoLightly04API","level":"info","message":"Project resource directories ensured","timestamp":"2026-07-28T06:21:36.063Z"}
2026-07-28T06:21:36+00:00 nws-go-lightly-dev node[47592]: {"app":"GoLightly04API","configuredCount":1,"createdCount":0,"level":"info","message":"Admin bootstrap complete","promotedCount":0,"timestamp":"2026-07-28T06:21:36.567Z"}
2026-07-28T06:21:36+00:00 nws-go-lightly-dev node[47592]: {"app":"GoLightly04API","level":"info","message":"API server listening","port":8001,"timestamp":"2026-07-28T06:21:36.632Z"}
-- Boot 9024f6a016b14c2e84f2b48cca9004bc --
2026-08-14T11:43:58+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-api.service - GoLightly04 ExpressJS API Application.
2026-08-14T11:44:19+00:00 nws-go-lightly-dev node[911]: ◇ injected env (0) from .env // tip: ⌘ suppress logs { quiet: true }
2026-08-14T11:45:02+00:00 nws-go-lightly-dev node[911]: {"app":"GoLightly04API","level":"info","message":"Database provisioned","timestamp":"2026-08-14T11:45:02.834Z"}
2026-08-14T11:45:02+00:00 nws-go-lightly-dev node[911]: {"app":"GoLightly04API","level":"info","message":"Project resource directories ensured","timestamp":"2026-08-14T11:45:02.839Z"}
2026-08-14T11:45:03+00:00 nws-go-lightly-dev node[911]: {"app":"GoLightly04API","configuredCount":1,"createdCount":0,"level":"info","message":"Admin bootstrap complete","promotedCount":0,"timestamp":"2026-08-14T11:45:03.144Z"}
2026-08-14T11:45:03+00:00 nws-go-lightly-dev node[911]: {"app":"GoLightly04API","level":"info","message":"API server listening","port":8001,"timestamp":"2026-08-14T11:45:03.161Z"}
2026-09-11T06:55:28+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-api.service - GoLightly04 ExpressJS API Application...
2026-09-11T06:55:28+00:00 nws-go-lightly-dev systemd[1]: golightly04-api.service: Deactivated successfully.
2026-09-11T06:55:28+00:00 nws-go-lightly-dev systemd[1]: Stopped golightly04-api.service - GoLightly04 ExpressJS API Application.
2026-09-11T06:55:28+00:00 nws-go-lightly-dev systemd[1]: golightly04-api.service: Consumed 10.115s CPU time, 81.2M memory peak, 0B memory swap peak.
2026-09-11T06:55:28+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-api.service - GoLightly04 ExpressJS API Application.
2026-09-11T06:55:30+00:00 nws-go-lightly-dev node[211923]: ◇ injected env (0) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
2026-09-11T06:55:37+00:00 nws-go-lightly-dev node[211923]: {"app":"GoLightly04API","level":"info","message":"Database provisioned","timestamp":"2026-09-11T06:55:37.493Z"}
2026-09-11T06:55:37+00:00 nws-go-lightly-dev node[211923]: {"app":"GoLightly04API","level":"info","message":"Project resource directories ensured","timestamp":"2026-09-11T06:55:37.505Z"}
2026-09-11T06:55:37+00:00 nws-go-lightly-dev node[211923]: {"app":"GoLightly04API","configuredCount":1,"createdCount":0,"level":"info","message":"Admin bootstrap complete","promotedCount":0,"timestamp":"2026-09-11T06:55:37.884Z"}
2026-09-11T06:55:37+00:00 nws-go-lightly-dev node[211923]: {"app":"GoLightly04API","level":"info","message":"API server listening","port":8001,"timestamp":"2026-09-11T06:55:37.961Z"}
-- Boot b5f21f3f290d49a5b0d402cf2f789c82 --
2026-10-05T21:40:09+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-api.service - GoLightly04 ExpressJS API Application.
2026-10-05T21:40:46+00:00 nws-go-lightly-dev node[906]: ◇ injected env (0) from .env // tip: ⌘ suppress logs { quiet: true }
2026-10-05T21:41:52+00:00 nws-go-lightly-dev node[906]: {"app":"GoLightly04API","level":"info","message":"Database provisioned","timestamp":"2026-10-05T21:41:52.922Z"}
2026-10-05T21:41:52+00:00 nws-go-lightly-dev node[906]: {"app":"GoLightly04API","level":"info","message":"Project resource directories ensured","timestamp":"2026-10-05T21:41:52.927Z"}
2026-10-05T21:41:53+00:00 nws-go-lightly-dev node[906]: {"app":"GoLightly04API","configuredCount":1,"createdCount":0,"level":"info","message":"Admin bootstrap complete","promotedCount":0,"timestamp":"2026-10-05T21:41:53.113Z"}
2026-10-05T21:41:53+00:00 nws-go-lightly-dev node[906]: {"app":"GoLightly04API","level":"info","message":"API server listening","port":8001,"timestamp":"2026-10-05T21:41:53.133Z"}
2026-11-11T00:05:56+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-api.service - GoLightly04 ExpressJS API Application...
2026-11-11T00:05:58+00:00 nws-go-lightly-dev node[309928]: ◇ injected env (0) from .env // tip: ⌘ suppress logs { quiet: true }
2026-11-11T00:06:05+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-api.service - GoLightly04 ExpressJS API Application...
2026-11-11T00:06:05+00:00 nws-go-lightly-dev systemd[1]: golightly04-api.service: Deactivated successfully.
2026-11-11T00:06:05+00:00 nws-go-lightly-dev systemd[1]: Stopped golightly04-api.service - GoLightly04 ExpressJS API Application.
-- Boot 0dcfcb789246482bb340b12436c26694 --
2026-11-11T00:06:29+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-api.service - GoLightly04 ExpressJS API Application.
2026-11-11T00:06:35+00:00 nws-go-lightly-dev node[837]: ◇ injected env (0) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
2026-11-11T00:06:45+00:00 nws-go-lightly-dev node[837]: {"app":"GoLightly04API","level":"info","message":"Database provisioned","timestamp":"2026-11-11T00:06:45.896Z"}
2026-11-11T00:06:45+00:00 nws-go-lightly-dev node[837]: {"app":"GoLightly04API","level":"info","message":"Project resource directories ensured","timestamp":"2026-11-11T00:06:45.900Z"}
2026-11-11T00:06:46+00:00 nws-go-lightly-dev node[837]: {"app":"GoLightly04API","configuredCount":1,"createdCount":0,"level":"info","message":"Admin bootstrap complete","promotedCount":0,"timestamp":"2026-11-11T00:06:46.080Z"}
2026-11-11T00:06:46+00:00 nws-go-lightly-dev node[837]: {"app":"GoLightly04API","level":"info","message":"API server listening","port":8001,"timestamp":"2026-11-11T00:06:46.107Z"}
2026-11-11T00:41:19+00:00 nws-go-lightly-dev node[837]: {"app":"GoLightly04API","error":{"name":"SequelizeDatabaseError","original":{"code":"42P01","file":"parse_relation.c","length":118,"line":"1428","name":"error","position":"914","routine":"parserOpenTable","severity":"ERROR","sql":"SELECT \"Meditation\".\"id\", \"Meditation\".\"user_id\" AS \"userId\", \"Meditation\".\"title\", \"Meditation\".\"description\", \"Meditation\".\"meditation_array\" AS \"meditationArray\", \"Meditation\".\"filename\", \"Meditation\".\"file_path\" AS \"filePath\", \"Meditation\".\"visibility\", \"Meditation\".\"stage\", \"Meditation\".\"source_mode\" AS \"sourceMode\", \"Meditation\".\"script_source\" AS \"scriptSource\", \"Meditation\".\"is_default\" AS \"isDefault\", \"Meditation\".\"metadata\", \"Meditation\".\"status\", \"Meditation\".\"listen_count\" AS \"listenCount\", \"Meditation\".\"duration_seconds\" AS \"durationSeconds\", \"Meditation\".\"duration_seconds_talking\" AS \"durationSecondsTalking\", \"Meditation\".\"duration_seconds_pause\" AS \"durationSecondsPause\", \"Meditation\".\"duration_seconds_sound\" AS \"durationSecondsSound\", \"Meditation\".\"created_at\" AS \"createdAt\", \"Meditation\".\"updated_at\" AS \"updatedAt\", \"User\".\"id\" AS \"User.id\", \"User\".\"username\" AS \"User.username\" FROM \"public\".\"meditations\" AS \"Meditation\" LEFT OUTER JOIN \"public\".\"users\" AS \"User\" ON \"Meditation\".\"user_id\" = \"User\".\"id\" WHERE \"Meditation\".\"stage\" = 'library' AND \"Meditation\".\"visibility\" = 'public' AND \"Meditation\".\"status\" = 'complete' AND \"Meditation\".\"is_default\" = false ORDER BY \"createdAt\" DESC;"},"parameters":{},"parent":{"code":"42P01","file":"parse_relation.c","length":118,"line":"1428","name":"error","position":"914","routine":"parserOpenTable","severity":"ERROR","sql":"SELECT \"Meditation\".\"id\", \"Meditation\".\"user_id\" AS \"userId\", \"Meditation\".\"title\", \"Meditation\".\"description\", \"Meditation\".\"meditation_array\" AS \"meditationArray\", \"Meditation\".\"filename\", \"Meditation\".\"file_path\" AS \"filePath\", \"Meditation\".\"visibility\", \"Meditation\".\"stage\", \"Meditation\".\"source_mode\" AS \"sourceMode\", \"Meditation\".\"script_source\" AS \"scriptSource\", \"Meditation\".\"is_default\" AS \"isDefault\", \"Meditation\".\"metadata\", \"Meditation\".\"status\", \"Meditation\".\"listen_count\" AS \"listenCount\", \"Meditation\".\"duration_seconds\" AS \"durationSeconds\", \"Meditation\".\"duration_seconds_talking\" AS \"durationSecondsTalking\", \"Meditation\".\"duration_seconds_pause\" AS \"durationSecondsPause\", \"Meditation\".\"duration_seconds_sound\" AS \"durationSecondsSound\", \"Meditation\".\"created_at\" AS \"createdAt\", \"Meditation\".\"updated_at\" AS \"updatedAt\", \"User\".\"id\" AS \"User.id\", \"User\".\"username\" AS \"User.username\" FROM \"public\".\"meditations\" AS \"Meditation\" LEFT OUTER JOIN \"public\".\"users\" AS \"User\" ON \"Meditation\".\"user_id\" = \"User\".\"id\" WHERE \"Meditation\".\"stage\" = 'library' AND \"Meditation\".\"visibility\" = 'public' AND \"Meditation\".\"status\" = 'complete' AND \"Meditation\".\"is_default\" = false ORDER BY \"createdAt\" DESC;"},"sql":"SELECT \"Meditation\".\"id\", \"Meditation\".\"user_id\" AS \"userId\", \"Meditation\".\"title\", \"Meditation\".\"description\", \"Meditation\".\"meditation_array\" AS \"meditationArray\", \"Meditation\".\"filename\", \"Meditation\".\"file_path\" AS \"filePath\", \"Meditation\".\"visibility\", \"Meditation\".\"stage\", \"Meditation\".\"source_mode\" AS \"sourceMode\", \"Meditation\".\"script_source\" AS \"scriptSource\", \"Meditation\".\"is_default\" AS \"isDefault\", \"Meditation\".\"metadata\", \"Meditation\".\"status\", \"Meditation\".\"listen_count\" AS \"listenCount\", \"Meditation\".\"duration_seconds\" AS \"durationSeconds\", \"Meditation\".\"duration_seconds_talking\" AS \"durationSecondsTalking\", \"Meditation\".\"duration_seconds_pause\" AS \"durationSecondsPause\", \"Meditation\".\"duration_seconds_sound\" AS \"durationSecondsSound\", \"Meditation\".\"created_at\" AS \"createdAt\", \"Meditation\".\"updated_at\" AS \"updatedAt\", \"User\".\"id\" AS \"User.id\", \"User\".\"username\" AS \"User.username\" FROM \"public\".\"meditations\" AS \"Meditation\" LEFT OUTER JOIN \"public\".\"users\" AS \"User\" ON \"Meditation\".\"user_id\" = \"User\".\"id\" WHERE \"Meditation\".\"stage\" = 'library' AND \"Meditation\".\"visibility\" = 'public' AND \"Meditation\".\"status\" = 'complete' AND \"Meditation\".\"is_default\" = false ORDER BY \"createdAt\" DESC;"},"level":"error","message":"Unhandled error","timestamp":"2026-11-11T00:41:19.153Z"}
2026-11-11T00:41:19+00:00 nws-go-lightly-dev node[837]: {"app":"GoLightly04API","error":{"name":"SequelizeDatabaseError","original":{"code":"42P01","file":"parse_relation.c","length":118,"line":"1428","name":"error","position":"914","routine":"parserOpenTable","severity":"ERROR","sql":"SELECT \"Meditation\".\"id\", \"Meditation\".\"user_id\" AS \"userId\", \"Meditation\".\"title\", \"Meditation\".\"description\", \"Meditation\".\"meditation_array\" AS \"meditationArray\", \"Meditation\".\"filename\", \"Meditation\".\"file_path\" AS \"filePath\", \"Meditation\".\"visibility\", \"Meditation\".\"stage\", \"Meditation\".\"source_mode\" AS \"sourceMode\", \"Meditation\".\"script_source\" AS \"scriptSource\", \"Meditation\".\"is_default\" AS \"isDefault\", \"Meditation\".\"metadata\", \"Meditation\".\"status\", \"Meditation\".\"listen_count\" AS \"listenCount\", \"Meditation\".\"duration_seconds\" AS \"durationSeconds\", \"Meditation\".\"duration_seconds_talking\" AS \"durationSecondsTalking\", \"Meditation\".\"duration_seconds_pause\" AS \"durationSecondsPause\", \"Meditation\".\"duration_seconds_sound\" AS \"durationSecondsSound\", \"Meditation\".\"created_at\" AS \"createdAt\", \"Meditation\".\"updated_at\" AS \"updatedAt\", \"User\".\"id\" AS \"User.id\", \"User\".\"username\" AS \"User.username\" FROM \"public\".\"meditations\" AS \"Meditation\" LEFT OUTER JOIN \"public\".\"users\" AS \"User\" ON \"Meditation\".\"user_id\" = \"User\".\"id\" WHERE \"Meditation\".\"stage\" = 'library' AND \"Meditation\".\"visibility\" = 'public' AND \"Meditation\".\"status\" = 'complete' AND \"Meditation\".\"is_default\" = false ORDER BY \"createdAt\" DESC;"},"parameters":{},"parent":{"code":"42P01","file":"parse_relation.c","length":118,"line":"1428","name":"error","position":"914","routine":"parserOpenTable","severity":"ERROR","sql":"SELECT \"Meditation\".\"id\", \"Meditation\".\"user_id\" AS \"userId\", \"Meditation\".\"title\", \"Meditation\".\"description\", \"Meditation\".\"meditation_array\" AS \"meditationArray\", \"Meditation\".\"filename\", \"Meditation\".\"file_path\" AS \"filePath\", \"Meditation\".\"visibility\", \"Meditation\".\"stage\", \"Meditation\".\"source_mode\" AS \"sourceMode\", \"Meditation\".\"script_source\" AS \"scriptSource\", \"Meditation\".\"is_default\" AS \"isDefault\", \"Meditation\".\"metadata\", \"Meditation\".\"status\", \"Meditation\".\"listen_count\" AS \"listenCount\", \"Meditation\".\"duration_seconds\" AS \"durationSeconds\", \"Meditation\".\"duration_seconds_talking\" AS \"durationSecondsTalking\", \"Meditation\".\"duration_seconds_pause\" AS \"durationSecondsPause\", \"Meditation\".\"duration_seconds_sound\" AS \"durationSecondsSound\", \"Meditation\".\"created_at\" AS \"createdAt\", \"Meditation\".\"updated_at\" AS \"updatedAt\", \"User\".\"id\" AS \"User.id\", \"User\".\"username\" AS \"User.username\" FROM \"public\".\"meditations\" AS \"Meditation\" LEFT OUTER JOIN \"public\".\"users\" AS \"User\" ON \"Meditation\".\"user_id\" = \"User\".\"id\" WHERE \"Meditation\".\"stage\" = 'library' AND \"Meditation\".\"visibility\" = 'public' AND \"Meditation\".\"status\" = 'complete' AND \"Meditation\".\"is_default\" = false ORDER BY \"createdAt\" DESC;"},"sql":"SELECT \"Meditation\".\"id\", \"Meditation\".\"user_id\" AS \"userId\", \"Meditation\".\"title\", \"Meditation\".\"description\", \"Meditation\".\"meditation_array\" AS \"meditationArray\", \"Meditation\".\"filename\", \"Meditation\".\"file_path\" AS \"filePath\", \"Meditation\".\"visibility\", \"Meditation\".\"stage\", \"Meditation\".\"source_mode\" AS \"sourceMode\", \"Meditation\".\"script_source\" AS \"scriptSource\", \"Meditation\".\"is_default\" AS \"isDefault\", \"Meditation\".\"metadata\", \"Meditation\".\"status\", \"Meditation\".\"listen_count\" AS \"listenCount\", \"Meditation\".\"duration_seconds\" AS \"durationSeconds\", \"Meditation\".\"duration_seconds_talking\" AS \"durationSecondsTalking\", \"Meditation\".\"duration_seconds_pause\" AS \"durationSecondsPause\", \"Meditation\".\"duration_seconds_sound\" AS \"durationSecondsSound\", \"Meditation\".\"created_at\" AS \"createdAt\", \"Meditation\".\"updated_at\" AS \"updatedAt\", \"User\".\"id\" AS \"User.id\", \"User\".\"username\" AS \"User.username\" FROM \"public\".\"meditations\" AS \"Meditation\" LEFT OUTER JOIN \"public\".\"users\" AS \"User\" ON \"Meditation\".\"user_id\" = \"User\".\"id\" WHERE \"Meditation\".\"stage\" = 'library' AND \"Meditation\".\"visibility\" = 'public' AND \"Meditation\".\"status\" = 'complete' AND \"Meditation\".\"is_default\" = false ORDER BY \"createdAt\" DESC;"},"level":"error","message":"Unhandled error","timestamp":"2026-11-11T00:41:19.172Z"}

```

### Last 100 combined stdout/stderr journal lines: worker-node

```text
2026-06-11T17:51:41+00:00 nws-go-lightly-dev node[29000]: {"app":"GoLightly04WorkerNode","level":"info","message":"Meditation 6 job 39 sequence 7 complete","timestamp":"2026-06-11T17:51:41.223Z"}
2026-06-11T17:51:42+00:00 nws-go-lightly-dev node[29000]: {"app":"GoLightly04WorkerNode","level":"info","message":"Meditation 6 job 41 sequence 9 complete","timestamp":"2026-06-11T17:51:42.108Z"}
2026-06-11T17:51:43+00:00 nws-go-lightly-dev node[29000]: {"app":"GoLightly04WorkerNode","level":"info","message":"Meditation 6 job 43 sequence 11 complete","timestamp":"2026-06-11T17:51:43.155Z"}
2026-06-11T17:51:44+00:00 nws-go-lightly-dev node[29000]: {"app":"GoLightly04WorkerNode","level":"info","message":"Meditation 6 job 47 sequence 15 complete","timestamp":"2026-06-11T17:51:44.640Z"}
2026-06-11T17:51:45+00:00 nws-go-lightly-dev node[29000]: {"app":"GoLightly04WorkerNode","level":"info","message":"Meditation 6 job 49 sequence 17 complete","timestamp":"2026-06-11T17:51:45.508Z"}
2026-06-11T17:51:46+00:00 nws-go-lightly-dev node[29000]: {"app":"GoLightly04WorkerNode","level":"info","message":"Meditation 6 job 51 sequence 19 complete","timestamp":"2026-06-11T17:51:46.387Z"}
2026-06-11T17:51:47+00:00 nws-go-lightly-dev node[29000]: {"app":"GoLightly04WorkerNode","level":"info","message":"Meditation 6 job 53 sequence 21 complete","timestamp":"2026-06-11T17:51:47.266Z"}
2026-06-11T17:51:48+00:00 nws-go-lightly-dev node[29000]: {"app":"GoLightly04WorkerNode","level":"info","message":"Meditation 6 job 55 sequence 23 complete","timestamp":"2026-06-11T17:51:48.176Z"}
2026-06-11T17:51:48+00:00 nws-go-lightly-dev node[29000]: {"app":"GoLightly04WorkerNode","level":"info","message":"Meditation 6 all jobs complete — starting concatenation","timestamp":"2026-06-11T17:51:48.179Z"}
2026-06-11T17:51:57+00:00 nws-go-lightly-dev node[29000]: {"app":"GoLightly04WorkerNode","level":"info","message":"Meditation 6 complete","timestamp":"2026-06-11T17:51:57.874Z"}
2026-06-11T23:18:48+00:00 nws-go-lightly-dev node[29000]: {"app":"GoLightly04WorkerNode","level":"info","message":"Starting backup job includeResources=true","timestamp":"2026-06-11T23:18:48.366Z"}
2026-06-11T23:18:48+00:00 nws-go-lightly-dev node[29000]: {"app":"GoLightly04WorkerNode","level":"info","message":"Backup job completed: /home/limited_user/project_resources/GoLightly/backups_db_and_data/backup_w_sound_files_20260611_231848.zip","timestamp":"2026-06-11T23:18:48.909Z"}
2026-06-12T18:59:27+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-worker-node.service - GoLightly04 ExpressJS API Application...
2026-06-12T18:59:27+00:00 nws-go-lightly-dev systemd[1]: golightly04-worker-node.service: Deactivated successfully.
2026-06-12T18:59:27+00:00 nws-go-lightly-dev systemd[1]: Stopped golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-06-12T18:59:27+00:00 nws-go-lightly-dev systemd[1]: golightly04-worker-node.service: Consumed 1min 4.914s CPU time, 127.2M memory peak, 23.3M memory swap peak.
2026-06-12T18:59:27+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-06-12T18:59:30+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","level":"info","message":"GoLightly04WorkerNode listening on port 8003","timestamp":"2026-06-12T18:59:30.679Z"}
2026-06-12T19:04:13+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","filename":"backup_w_sound_files_20260611_231848-dev-fully-populated.zip","level":"info","message":"Replenish job started","timestamp":"2026-06-12T19:04:13.727Z"}
2026-06-12T19:04:13+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","level":"warn","message":"safeExtractZip: rejecting unexpected entry \"resources/\"","timestamp":"2026-06-12T19:04:13.811Z"}
2026-06-12T19:04:14+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","durationMs":937,"error":{"name":"SequelizeDatabaseError","original":{"code":"42501","file":"aclchk.c","length":113,"line":"2812","name":"error","routine":"aclcheck_error","severity":"ERROR","sql":"TRUNCATE TABLE \"public\".\"contract_user_meditations\", \"public\".\"jobs_queue\", \"public\".\"meditations\", \"public\".\"sound_files\", \"public\".\"users\" CASCADE"},"parameters":{},"parent":{"code":"42501","file":"aclchk.c","length":113,"line":"2812","name":"error","routine":"aclcheck_error","severity":"ERROR","sql":"TRUNCATE TABLE \"public\".\"contract_user_meditations\", \"public\".\"jobs_queue\", \"public\".\"meditations\", \"public\".\"sound_files\", \"public\".\"users\" CASCADE"},"sql":"TRUNCATE TABLE \"public\".\"contract_user_meditations\", \"public\".\"jobs_queue\", \"public\".\"meditations\", \"public\".\"sound_files\", \"public\".\"users\" CASCADE"},"filename":"backup_w_sound_files_20260611_231848-dev-fully-populated.zip","level":"error","message":"Replenish job failed","timestamp":"2026-06-12T19:04:14.662Z"}
2026-06-12T19:04:14+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","error":{"name":"SequelizeDatabaseError","original":{"code":"42501","file":"aclchk.c","length":113,"line":"2812","name":"error","routine":"aclcheck_error","severity":"ERROR","sql":"TRUNCATE TABLE \"public\".\"contract_user_meditations\", \"public\".\"jobs_queue\", \"public\".\"meditations\", \"public\".\"sound_files\", \"public\".\"users\" CASCADE"},"parameters":{},"parent":{"code":"42501","file":"aclchk.c","length":113,"line":"2812","name":"error","routine":"aclcheck_error","severity":"ERROR","sql":"TRUNCATE TABLE \"public\".\"contract_user_meditations\", \"public\".\"jobs_queue\", \"public\".\"meditations\", \"public\".\"sound_files\", \"public\".\"users\" CASCADE"},"sql":"TRUNCATE TABLE \"public\".\"contract_user_meditations\", \"public\".\"jobs_queue\", \"public\".\"meditations\", \"public\".\"sound_files\", \"public\".\"users\" CASCADE"},"filename":"backup_w_sound_files_20260611_231848-dev-fully-populated.zip","level":"error","message":"Background replenish failed","timestamp":"2026-06-12T19:04:14.675Z"}
2026-06-12T19:11:19+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","filename":"backup_w_sound_files_20260611_231848-dev-fully-populated.zip","level":"info","message":"Replenish job started","timestamp":"2026-06-12T19:11:19.310Z"}
2026-06-12T19:11:19+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","level":"warn","message":"safeExtractZip: rejecting unexpected entry \"resources/\"","timestamp":"2026-06-12T19:11:19.345Z"}
2026-06-12T19:11:20+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","durationMs":1520,"filename":"backup_w_sound_files_20260611_231848-dev-fully-populated.zip","level":"info","message":"Replenish job completed","resourceFilesRestored":22,"resourcesRestored":true,"rowsImported":{"contract_user_meditations":0,"jobs_queue":58,"meditations":6,"sound_files":2,"users":2},"tablesImported":5,"timestamp":"2026-06-12T19:11:20.830Z","totalRows":68}
2026-06-12T19:14:35+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","filename":"replenish_20260612_191435615_1d335c2d-beb7-4baf-86bf-0afa0ad1cee4.zip","level":"info","message":"Replenish job started","timestamp":"2026-06-12T19:14:35.765Z"}
2026-06-12T19:14:35+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","level":"warn","message":"safeExtractZip: rejecting unexpected entry \"resources/\"","timestamp":"2026-06-12T19:14:35.796Z"}
2026-06-12T19:14:37+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","durationMs":1874,"filename":"replenish_20260612_191435615_1d335c2d-beb7-4baf-86bf-0afa0ad1cee4.zip","level":"info","message":"Replenish job completed","resourceFilesRestored":44,"resourcesRestored":true,"rowsImported":{"contract_user_meditations":0,"jobs_queue":58,"meditations":6,"sound_files":2,"users":2},"tablesImported":5,"timestamp":"2026-06-12T19:14:37.639Z","totalRows":68}
2026-06-12T19:21:39+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","filename":"replenish_20260612_192139150_9bcfad2f-82c9-49fa-b17c-98c4effc9272.zip","level":"info","message":"Replenish job started","timestamp":"2026-06-12T19:21:39.159Z"}
2026-06-12T19:21:39+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","level":"warn","message":"safeExtractZip: rejecting unexpected entry \"resources/\"","timestamp":"2026-06-12T19:21:39.179Z"}
2026-06-12T19:21:40+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","durationMs":1103,"filename":"replenish_20260612_192139150_9bcfad2f-82c9-49fa-b17c-98c4effc9272.zip","level":"info","message":"Replenish job completed","resourceFilesRestored":24,"resourcesRestored":true,"rowsImported":{"contract_user_meditations":0,"jobs_queue":53,"meditations":5,"sound_files":2,"users":3},"tablesImported":5,"timestamp":"2026-06-12T19:21:40.262Z","totalRows":63}
2026-06-12T19:41:57+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","filename":"replenish_20260612_194157288_c43e5cd3-d346-48fc-a1f7-49ec53d8c474.zip","level":"info","message":"Replenish job started","timestamp":"2026-06-12T19:41:57.301Z"}
2026-06-12T19:41:57+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","level":"warn","message":"safeExtractZip: rejecting unexpected entry \"resources/\"","timestamp":"2026-06-12T19:41:57.323Z"}
2026-06-12T19:41:59+00:00 nws-go-lightly-dev node[54927]: {"app":"GoLightly04WorkerNode","durationMs":1852,"filename":"replenish_20260612_194157288_c43e5cd3-d346-48fc-a1f7-49ec53d8c474.zip","level":"info","message":"Replenish job completed","resourceFilesRestored":44,"resourcesRestored":true,"rowsImported":{"contract_user_meditations":0,"jobs_queue":58,"meditations":6,"sound_files":2,"users":2},"tablesImported":5,"timestamp":"2026-06-12T19:41:59.153Z","totalRows":68}
-- Boot bf598e6ac9c543069980cc9a6212219e --
2026-06-14T22:33:52+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-06-14T22:34:37+00:00 nws-go-lightly-dev node[922]: {"app":"GoLightly04WorkerNode","level":"info","message":"GoLightly04WorkerNode listening on port 8003","timestamp":"2026-06-14T22:34:37.761Z"}
2026-06-16T18:14:13+00:00 nws-go-lightly-dev node[922]: {"app":"GoLightly04WorkerNode","level":"info","message":"POST /process received meditationId=7 mode=intake","timestamp":"2026-06-16T18:14:13.316Z"}
2026-06-16T18:14:13+00:00 nws-go-lightly-dev node[922]: {"app":"GoLightly04WorkerNode","level":"info","message":"Meditation 7 accepted for processing","timestamp":"2026-06-16T18:14:13.343Z"}
2026-06-16T18:14:13+00:00 nws-go-lightly-dev node[922]: {"app":"GoLightly04WorkerNode","level":"info","message":"Meditation 7 processing started (mode=intake)","timestamp":"2026-06-16T18:14:13.354Z"}
2026-06-16T18:14:13+00:00 nws-go-lightly-dev node[922]: {"app":"GoLightly04WorkerNode","level":"info","message":"Meditation 7 all jobs complete — starting concatenation","timestamp":"2026-06-16T18:14:13.378Z"}
2026-06-16T18:14:14+00:00 nws-go-lightly-dev node[922]: {"app":"GoLightly04WorkerNode","level":"info","message":"Meditation 7 complete","timestamp":"2026-06-16T18:14:14.737Z"}
2026-06-16T18:27:03+00:00 nws-go-lightly-dev node[922]: {"app":"GoLightly04WorkerNode","filename":"replenish_20260616_182703849_53d62896-2b56-4f74-ae24-0503d4a2dd42.zip","level":"info","message":"Replenish job started","timestamp":"2026-06-16T18:27:03.859Z"}
2026-06-16T18:27:03+00:00 nws-go-lightly-dev node[922]: {"app":"GoLightly04WorkerNode","level":"warn","message":"safeExtractZip: rejecting unexpected entry \"resources/\"","timestamp":"2026-06-16T18:27:03.903Z"}
2026-06-16T18:27:06+00:00 nws-go-lightly-dev node[922]: {"app":"GoLightly04WorkerNode","durationMs":2510,"filename":"replenish_20260616_182703849_53d62896-2b56-4f74-ae24-0503d4a2dd42.zip","level":"info","message":"Replenish job completed","resourceFilesRestored":69,"resourcesRestored":true,"rowsImported":{"contract_user_meditations":0,"jobs_queue":67,"meditations":7,"sound_files":4,"users":2},"tablesImported":5,"timestamp":"2026-06-16T18:27:06.370Z","totalRows":80}
2026-06-16T19:26:19+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-worker-node.service - GoLightly04 ExpressJS API Application...
2026-06-16T19:26:19+00:00 nws-go-lightly-dev systemd[1]: golightly04-worker-node.service: Deactivated successfully.
2026-06-16T19:26:19+00:00 nws-go-lightly-dev systemd[1]: Stopped golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-06-16T19:26:19+00:00 nws-go-lightly-dev systemd[1]: golightly04-worker-node.service: Consumed 4.323s CPU time, 219.2M memory peak, 0B memory swap peak.
2026-06-16T19:26:19+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-06-16T19:26:22+00:00 nws-go-lightly-dev node[14562]: {"app":"GoLightly04WorkerNode","level":"info","message":"GoLightly04WorkerNode listening on port 8003","timestamp":"2026-06-16T19:26:22.211Z"}
2026-06-16T19:37:56+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-worker-node.service - GoLightly04 ExpressJS API Application...
2026-06-16T19:37:56+00:00 nws-go-lightly-dev systemd[1]: golightly04-worker-node.service: Deactivated successfully.
2026-06-16T19:37:56+00:00 nws-go-lightly-dev systemd[1]: Stopped golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-06-16T19:37:56+00:00 nws-go-lightly-dev systemd[1]: golightly04-worker-node.service: Consumed 1.150s CPU time, 54.3M memory peak, 0B memory swap peak.
2026-06-16T19:37:56+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-06-16T19:37:59+00:00 nws-go-lightly-dev node[15115]: {"app":"GoLightly04WorkerNode","level":"info","message":"GoLightly04WorkerNode listening on port 8003","timestamp":"2026-06-16T19:37:59.487Z"}
2026-06-16T19:55:16+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-worker-node.service - GoLightly04 ExpressJS API Application...
2026-06-16T19:55:16+00:00 nws-go-lightly-dev systemd[1]: golightly04-worker-node.service: Deactivated successfully.
2026-06-16T19:55:16+00:00 nws-go-lightly-dev systemd[1]: Stopped golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-06-16T19:55:16+00:00 nws-go-lightly-dev systemd[1]: golightly04-worker-node.service: Consumed 1.149s CPU time, 53.8M memory peak, 0B memory swap peak.
2026-06-16T19:55:16+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-06-16T19:55:19+00:00 nws-go-lightly-dev node[15572]: {"app":"GoLightly04WorkerNode","level":"info","message":"GoLightly04WorkerNode listening on port 8003","timestamp":"2026-06-16T19:55:19.518Z"}
-- Boot f9949e4084944c7fa535f4b05722f4ba --
2026-06-19T01:53:03+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-06-19T01:54:41+00:00 nws-go-lightly-dev node[923]: {"app":"GoLightly04WorkerNode","level":"info","message":"GoLightly04WorkerNode listening on port 8003","timestamp":"2026-06-19T01:54:41.650Z"}
2026-06-19T04:05:27+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-worker-node.service - GoLightly04 ExpressJS API Application...
2026-06-19T04:05:27+00:00 nws-go-lightly-dev systemd[1]: golightly04-worker-node.service: Deactivated successfully.
2026-06-19T04:05:27+00:00 nws-go-lightly-dev systemd[1]: Stopped golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-06-19T04:05:27+00:00 nws-go-lightly-dev systemd[1]: golightly04-worker-node.service: Consumed 1.498s CPU time.
2026-06-19T04:07:45+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-06-19T04:07:48+00:00 nws-go-lightly-dev node[2975]: {"app":"GoLightly04WorkerNode","level":"info","message":"GoLightly04WorkerNode listening on port 8003","timestamp":"2026-06-19T04:07:48.437Z"}
2026-06-19T04:07:48+00:00 nws-go-lightly-dev node[2975]: {"app":"GoLightly04WorkerNode","level":"error","message":"Startup reconciliation failed: permission denied for table meditations","timestamp":"2026-06-19T04:07:48.620Z"}
2026-06-19T04:08:58+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-worker-node.service - GoLightly04 ExpressJS API Application...
2026-06-19T04:08:58+00:00 nws-go-lightly-dev systemd[1]: golightly04-worker-node.service: Deactivated successfully.
2026-06-19T04:08:58+00:00 nws-go-lightly-dev systemd[1]: Stopped golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-06-19T04:08:58+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-06-19T04:09:01+00:00 nws-go-lightly-dev node[3171]: {"app":"GoLightly04WorkerNode","level":"info","message":"GoLightly04WorkerNode listening on port 8003","timestamp":"2026-06-19T04:09:01.386Z"}
-- Boot daf597a9ebec4955b57ce1cd57302a8d --
2026-06-19T19:04:29+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-06-19T19:05:43+00:00 nws-go-lightly-dev node[907]: {"app":"GoLightly04WorkerNode","level":"info","message":"GoLightly04WorkerNode listening on port 8003","timestamp":"2026-06-19T19:05:43.392Z"}
-- Boot 9285f7344f43405fb4c5fcb41034049c --
2026-07-19T02:56:49+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-07-19T02:58:56+00:00 nws-go-lightly-dev node[911]: {"app":"GoLightly04WorkerNode","level":"info","message":"GoLightly04WorkerNode listening on port 8003","timestamp":"2026-07-19T02:58:56.694Z"}
-- Boot bae980894d884a1987b724ba33681553 --
2026-07-21T22:24:45+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-07-21T22:26:13+00:00 nws-go-lightly-dev node[905]: {"app":"GoLightly04WorkerNode","level":"info","message":"GoLightly04WorkerNode listening on port 8003","timestamp":"2026-07-21T22:26:13.020Z"}
2026-07-28T06:21:27+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-worker-node.service - GoLightly04 ExpressJS API Application...
2026-07-28T06:21:36+00:00 nws-go-lightly-dev node[47598]: {"app":"GoLightly04WorkerNode","level":"info","message":"GoLightly04WorkerNode listening on port 8003","timestamp":"2026-07-28T06:21:36.127Z"}
-- Boot 9024f6a016b14c2e84f2b48cca9004bc --
2026-08-14T11:43:58+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-08-14T11:44:59+00:00 nws-go-lightly-dev node[913]: {"app":"GoLightly04WorkerNode","level":"info","message":"GoLightly04WorkerNode listening on port 8003","timestamp":"2026-08-14T11:44:59.834Z"}
2026-09-11T06:55:28+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-worker-node.service - GoLightly04 ExpressJS API Application...
2026-09-11T06:55:28+00:00 nws-go-lightly-dev systemd[1]: golightly04-worker-node.service: Deactivated successfully.
2026-09-11T06:55:28+00:00 nws-go-lightly-dev systemd[1]: Stopped golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-09-11T06:55:28+00:00 nws-go-lightly-dev systemd[1]: golightly04-worker-node.service: Consumed 8.557s CPU time, 75.0M memory peak, 0B memory swap peak.
2026-09-11T06:55:28+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-09-11T06:55:37+00:00 nws-go-lightly-dev node[211924]: {"app":"GoLightly04WorkerNode","level":"info","message":"GoLightly04WorkerNode listening on port 8003","timestamp":"2026-09-11T06:55:37.212Z"}
-- Boot b5f21f3f290d49a5b0d402cf2f789c82 --
2026-10-05T21:40:09+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-10-05T21:41:50+00:00 nws-go-lightly-dev node[908]: {"app":"GoLightly04WorkerNode","level":"info","message":"GoLightly04WorkerNode listening on port 8003","timestamp":"2026-10-05T21:41:50.850Z"}
2026-11-11T00:05:56+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-worker-node.service - GoLightly04 ExpressJS API Application...
2026-11-11T00:06:05+00:00 nws-go-lightly-dev systemd[1]: Stopping golightly04-worker-node.service - GoLightly04 ExpressJS API Application...
2026-11-11T00:06:05+00:00 nws-go-lightly-dev systemd[1]: golightly04-worker-node.service: Deactivated successfully.
2026-11-11T00:06:05+00:00 nws-go-lightly-dev systemd[1]: Stopped golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
-- Boot 0dcfcb789246482bb340b12436c26694 --
2026-11-11T00:06:29+00:00 nws-go-lightly-dev systemd[1]: Started golightly04-worker-node.service - GoLightly04 ExpressJS API Application.
2026-11-11T00:06:45+00:00 nws-go-lightly-dev node[848]: {"app":"GoLightly04WorkerNode","level":"info","message":"GoLightly04WorkerNode listening on port 8003","timestamp":"2026-11-11T00:06:45.014Z"}

```

## Most likely root cause (ranked) and proposed fixes — NOT RUN

1. **Confirmed backend failure: the configured dev database's application schema is absent.** This explains the local library 500 and prevents database-backed administration from working. It is more severe than an unapplied username migration. Successful bootstrap logs at 00:06 versus absent tables later indicate state changed or targets diverged; the actor/cause of disappearance is not established. **First preserve/confirm the target and arrange separately authorized data recovery.** Do not blindly run a restore, schema reset, or username migration against missing tables. No safe exact data-restoration command can be specified without choosing and verifying the recovery artifact and receiving approval; this report does not invent one.

2. **“No API calls on initial admin load” is expected lazy loading, not evidence by itself of a broken deployment.** If clicks truly do nothing, the operator's authenticated browser session/console and chunk responses need inspection. Local fresh hydration did not reproduce a JavaScript failure. Proposed first browser actions: hard refresh with Network “Disable cache” enabled, open an admin section, and record request status plus any console exception, without sharing tokens or user records. A blind rebuild is not the first proposed fix: fresh artifacts and correct embedded public env were verified.

3. **Possible separate ingress/network or upload problem — unresolved.** Public domains time out from this host; remote proxy config/logs are unavailable, and there is no current worker replenish evidence. NAT-hairpin/routing/firewall behavior may be host-specific. A low body cap could explain an upload rejection, but a 413 was not observed. Inspect the actual ingress before proposing a concrete cap/timeout change. The app's 500 MiB multipart limit is not the apparent size constraint. No nginx change or reload is justified yet.

### Proposed operator sequence and exact commands

**These commands are proposals only, not executed by this diagnostic.** Reconfirm the dev host and the misleadingly named `golightly04_prod` database before approving any mutation. Recovering the original data and recreating a fresh empty schema are different outcomes; the latter does not solve missing data.

Read-only confirmation on the app host:

```bash
cd /home/limited_user/applications/GoLightly04
hostname
# Explicit target and read-only mode; do not print or source dotenv files.
env -u PGPASSWORD PGOPTIONS='-c default_transaction_read_only=on' \
  psql -X -w -h 127.0.0.1 -p 5432 -U golightly04_boot \
  -d golightly04_prod -v ON_ERROR_STOP=1 -P pager=off \
  -c "SELECT current_database(),current_user; SELECT to_regclass('public.users'),to_regclass('public.meditations');"
```

**Only if an operator explicitly approves fresh schema provisioning** rather than original-data recovery: API startup calls `provisionDatabase()` / `sequelize.sync()` and applies additive updates (`db-models/src/index.ts:19–56`). An exact proposed maintenance sequence is below. This creates schema/bootstrap data; it **does not restore the backup's dataset**. If any command fails, stop and investigate rather than continuing the sequence. Before any such step, preserve a database snapshot using the established backup procedure and resolve why tables disappeared.

```bash
# MUTATING MAINTENANCE PROPOSAL — DO NOT RUN WITHOUT NEW APPROVAL.
set -euo pipefail
cd /home/limited_user/applications/GoLightly04
sudo -n systemctl stop golightly04-web.service
sudo -n systemctl stop golightly04-worker-node.service
sudo -n systemctl stop golightly04-api.service
sudo -n systemctl start golightly04-api.service
# Confirm provisioning has completed successfully before the migration.
# Do not rely on /healthz alone: inspect users schema below.
journalctl -u golightly04-api.service --since '2 minutes ago' --no-pager \
  --grep='Database provisioned|API server listening|Failed|failed'
env -u PGPASSWORD psql -X -w -h 127.0.0.1 -p 5432 \
  -U golightly04_boot -d golightly04_prod -v ON_ERROR_STOP=1 \
  -c '\d public.users'
# Proceed only once the new/restored base tables are confirmed present.
env -u PGPASSWORD PGOPTIONS='-c search_path=public' \
  psql -X -w -h 127.0.0.1 -p 5432 -U golightly04_boot \
  -d golightly04_prod -v ON_ERROR_STOP=1 --single-transaction \
  -f db-models/migrations/20260616_add_user_username.sql
```

After approved schema/data recovery and migration, validate runtime privileges before opening writers. Prior schema-recreation incidents needed grants; do not assume bootstrap-role access proves app-role access. This validation is read-only:

```bash
env -u PGPASSWORD PGOPTIONS='-c default_transaction_read_only=on' \
  psql -X -w -h 127.0.0.1 -p 5432 -U golightly04_boot \
  -d golightly04_prod -v ON_ERROR_STOP=1 -P pager=off \
  -c "SELECT column_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='username'; SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='users_username_lower_idx'; SELECT has_table_privilege('golightly04_app','public.users','SELECT'),has_table_privilege('golightly04_app','public.meditations','SELECT');"
```

If missing privileges are confirmed after recovery, have the database owner approve the established schema/table/sequence/default-privilege repair; no unconditional broad GRANT is proposed on speculation. Once privileges and the recovered data are verified, the exact proposed service reopening commands are:

```bash
# MUTATING MAINTENANCE PROPOSAL — only after approved recovery/validation.
sudo -n systemctl start golightly04-worker-node.service
sudo -n systemctl start golightly04-web.service
systemctl is-active golightly04-api.service golightly04-web.service golightly04-worker-node.service
curl --max-time 20 -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8001/meditations/all
curl --max-time 20 -s -o /dev/null -w '%{http_code}\n' https://api.dev.go-lightly.love/meditations/all
```

On **maestro06**, once an operator has a working authenticated connection, proposed read-only ingress checks are below. Set `START_UTC`/`END_UTC` to the final two-hour window recorded in this report. Inspect the effective http/server/location inheritance for both domains, not merely a similarly named vhost file. Keep output local and redact secret/auth/header/query/email values before sharing any config/log excerpt.

```bash
# Proxy host only; read-only. Do not reload nginx or change limits yet.
sudo nginx -T 2>&1 | less
# Inspect server_name, matching locations, proxy_pass, client_max_body_size,
# client_body_timeout, proxy_connect_timeout, proxy_send_timeout,
# proxy_read_timeout, send_timeout, access_log and error_log.
# Read the actual access/error log paths discovered above, including rotations.
# Correlate the incident interval and /database/replenish-database requests,
# especially 413 / 499 / 502 / 504; do not publish unredacted request lines.
```

There is deliberately no restore rerun command, unconditional rebuild, CORS change, or speculative nginx edit in this proposal. Original-data recovery and any ingress modification need a new, evidence-based approval.
