---
created_at: 2026-11-10
updated_at: 2026-11-10
created_by: claude (opus-5.5)
modified_by: claude (opus-5.5)
---

# Commands

## Stop / Start all

```bash
# Stop
sudo systemctl stop golightly04-api.service
sudo systemctl stop golightly04-worker-node.service
sudo systemctl stop golightly04-web.service

# Start
sudo systemctl start golightly04-api.service
sudo systemctl start golightly04-worker-node.service
sudo systemctl start golightly04-web.service
```

## Drop and create

### 1. Stop all services

Use the stop commands above. The API only creates tables at startup, so it must restart after the drop.

### 2. Drop, Create, Apply Privileges

Run this from any terminal:

```bash
# Drop
sudo -u postgres dropdb golightly04_prod

# Create
sudo -u postgres createdb -O golightly04_boot golightly04_prod

# Apply privileges
sudo -u postgres psql -d golightly04_prod -c "GRANT CONNECT ON DATABASE golightly04_prod TO golightly04_app;"
sudo -u postgres psql -d golightly04_prod -c "GRANT ALL ON SCHEMA public TO golightly04_boot;"
sudo -u postgres psql -d golightly04_prod -c "ALTER SCHEMA public OWNER TO golightly04_boot;"
sudo -u postgres psql -d golightly04_prod -c "GRANT USAGE ON SCHEMA public TO golightly04_app;"
sudo -u postgres psql -d golightly04_prod -c "ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO golightly04_app;"
sudo -u postgres psql -d golightly04_prod -c "ALTER DEFAULT PRIVILEGES FOR ROLE golightly04_boot IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO golightly04_app;"
```

### 3. Start services

Use the start commands above. The API creates the tables and the admin user on startup.

### 4. Add the username index

```bash
cd /home/limited_user/applications/GoLightly04
psql -h 127.0.0.1 -U golightly04_boot -d golightly04_prod -v ON_ERROR_STOP=1 -f db-models/migrations/20260616_add_user_username.sql
```

### 5. Replenish

Sign in as the admin at https://dev.go-lightly.love/admin, expand **Database**, click **Choose File**, pick the backup zip (for example `backup_w_sound_files_YYYYMMDD_HHMMSS.zip`), then click **Restore Database**.
