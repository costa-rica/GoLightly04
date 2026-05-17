---
created_at: 2026-05-14
updated_at: 2026-05-14
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Script-mode deploy runbook

## Order

1. Run the duplicate sound-name preflight query.
2. Resolve any duplicate normalized names before creating the index.
3. Apply the meditation column changes.
4. Create the normalized sound-name unique index.
5. Deploy the API and worker.
6. Deploy the web app.

## Preflight

```sql
SELECT LOWER(BTRIM(name)) AS normalized_name,
       COUNT(*) AS row_count,
       array_agg(id ORDER BY id) AS ids
FROM sound_files
GROUP BY 1
HAVING COUNT(*) > 1;
```

If rows are returned, pick one canonical sound for each normalized name, re-point any stored meditation references that should use the survivor's filename, and delete the duplicate sound rows before continuing.

## Schema SQL

```sql
ALTER TABLE meditations
  ADD COLUMN IF NOT EXISTS source_mode VARCHAR(16) NOT NULL DEFAULT 'spreadsheet',
  ADD COLUMN IF NOT EXISTS script_source TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sound_files_name_normalized_idx
  ON sound_files (LOWER(BTRIM(name)));
```

## Risk Note

The API writes `source_mode` and `script_source` during meditation creation. Deploying the API before the SQL is applied can make every meditation insert fail.
