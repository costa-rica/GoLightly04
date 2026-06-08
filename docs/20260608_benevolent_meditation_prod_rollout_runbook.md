---
created_at: 2026-06-08
updated_at: 2026-06-08
created_by: hermes nws-go-lightly-dev (gpt-5.5)
modified_by: hermes nws-go-lightly-dev (gpt-5.5)
---

# Benevolent meditation editing production rollout runbook

## Decision

This rollout is **more than the basic pull/install/build/restart** because production also needs live meditation data operations after the code deploy:

- repeat the final singing-bowl replacement/regeneration on production benevolent meditations;
- rename the library meditation from `Silent Tibetan Bell 2 Minute Intervals` to `Tibetan Bell 2 Minute Intervals`;
- repair `@ffprobe-installer/linux-x64/ffprobe` group execute permission after `npm install` if it regresses, because that has previously broken GoLightly04 worker concatenation.

No schema migration, new environment variable, or permanent system permission change is expected from the code diff.

## Preconditions

- The implementation branch has been committed and pushed, or merged to the branch production will pull.
- The production agent is in the GoLightly04 repo root.
- Production `.env` files already contain the existing runtime settings; do not edit them for this rollout.
- The production services are expected to be the GoLightly04 API, worker, and web services. Verify names before stopping services.

## 1. Inspect production state

```bash
git status --short --branch
git remote -v
git fetch origin --prune
git branch --show-current
```

If the working tree is dirty, stop and decide whether to stash, commit, or discard local changes before deploying.

## 2. Pull the implementation

Use the production deployment branch or main, depending on the chosen rollout path:

```bash
git checkout <deployment-branch>
git pull --ff-only origin <deployment-branch>
```

For a direct feature-branch production test, `<deployment-branch>` can be `dev_10_benevolent_meditation_editing` after it is pushed.

## 3. Install and build

```bash
npm install

# Known GoLightly04 npm-install pitfall: this binary can lose group execute permission.
if [ -f node_modules/@ffprobe-installer/linux-x64/ffprobe ]; then
  chmod g+x node_modules/@ffprobe-installer/linux-x64/ffprobe
fi

npm run build:shared
npm run build -w @golightly/api
npm run build -w @golightly/worker-node
npm run build -w @golightly/web
npm run typecheck:scripts
```

Optional stronger verification if time allows:

```bash
npm test -w @golightly/api -- --runInBand
npm run typecheck -w @golightly/api
npm run typecheck -w @golightly/web
npm run typecheck -w @golightly/worker-node
```

## 4. Restart services

Prefer the exact sudoers-allowed commands. On GoLightly04 hosts, `restart` may not be allowed while `stop` and `start` are.

```bash
sudo -n /usr/bin/systemctl stop golightly04-api golightly04-worker-node golightly04-web
sudo -n /usr/bin/systemctl start golightly04-api golightly04-worker-node golightly04-web
```

If service names differ on production, use the production names instead.

## 5. Verify deployment

```bash
systemctl is-active golightly04-api golightly04-worker-node golightly04-web
systemctl status golightly04-api --no-pager --lines=20
systemctl status golightly04-worker-node --no-pager --lines=20
systemctl status golightly04-web --no-pager --lines=20
ss -ltnp | grep -E ':(8001|8002|8003)\b' || true
curl -i http://127.0.0.1:8001/ | head
curl -i http://127.0.0.1:8002/ | head
```

Expected: services active, API port listening, web root returning HTTP 200. The API root may return 404 while still proving Express is listening.

## 6. Production live data operations

Prefer the deployed admin API for scalar metadata edits. Avoid direct SQL for title/description/visibility because the endpoint enforces admin auth, benevolent-owner scope, library-stage scope, validation, and audit logging.

### 6.1 Rename the library meditation

Use the app JWT payload shape from `api/src/lib/authTokens.ts`; never print the token.

```bash
node - <<'NODE'
require('dotenv').config({ path: 'api/.env' });
const jwt = require('jsonwebtoken');

async function main() {
  const token = jwt.sign(
    { kind: 'access', id: 1, email: process.env.ADMIN_EMAIL, isAdmin: true, authProvider: 'local' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' },
  );

  const listRes = await fetch('http://127.0.0.1:8001/admin/meditations', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) throw new Error(`list failed ${listRes.status}: ${await listRes.text()}`);
  const list = await listRes.json();
  const target = list.meditations.find(
    (m) => m.title === 'Silent Tibetan Bell 2 Minute Intervals' && m.isBenevolentOwned && m.stage === 'library',
  );
  if (!target) throw new Error('target library meditation not found or not benevolent-owned');

  const updateRes = await fetch(`http://127.0.0.1:8001/admin/meditations/${target.id}/metadata`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Tibetan Bell 2 Minute Intervals' }),
  });
  if (!updateRes.ok) throw new Error(`rename failed ${updateRes.status}: ${await updateRes.text()}`);
  const payload = await updateRes.json();
  console.log(JSON.stringify({ id: payload.meditation.id, title: payload.meditation.title }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exit(1); });
NODE
```

### 6.2 Replace the final Tibetan singing bowl and regenerate

Production should repeat the dev data operation against production rows. Limit scope to benevolent-owned meditations whose final sound element is the old Tibetan singing bowl. The replacement filename is:

```text
1780899573201_TibetanBowlDouble.mp3
```

Important notes:

- Query the production admin list first and print the candidate IDs/titles/stages before mutating.
- For library rows, prefer the existing admin/worker requeue route where it is suitable.
- Template-stage rows are intentionally protected from some admin routes; if a template row needs the final-bowl replacement, the production agent should use the same bounded internal maintenance script pattern used on dev, not a broad manual SQL update.
- After mutation, regenerate/requeue affected meditations and wait for each row to reach `status: complete`.
- Verify each regenerated audio file exists under production `meditation_soundfiles/<YYYYMMDD>/meditation_<id>.mp3` or the row's returned `filePath`.

## 7. Final verification report

Report:

- branch/commit deployed;
- build commands that passed;
- services restarted and active;
- any `chmod g+x` repair applied to ffprobe;
- production meditation IDs modified;
- final title verification;
- regenerated audio file paths verified.

## Rollback

Code rollback:

```bash
git checkout <previous-known-good-branch-or-sha>
npm install
npm run build:shared
npm run build -w @golightly/api
npm run build -w @golightly/worker-node
npm run build -w @golightly/web
sudo -n /usr/bin/systemctl stop golightly04-api golightly04-worker-node golightly04-web
sudo -n /usr/bin/systemctl start golightly04-api golightly04-worker-node golightly04-web
```

Data rollback is manual: use the admin metadata endpoint to restore the old title if desired and restore previous meditation arrays/audio artifacts from backup if the bowl replacement must be undone.
