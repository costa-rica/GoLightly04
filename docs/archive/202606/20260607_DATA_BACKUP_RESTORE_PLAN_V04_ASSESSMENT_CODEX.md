---
created_at: 2026-06-07
updated_at: 2026-06-07
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Assessment: Data Backup Restore Plan V04

## Qualifying Concerns

### 1. V04 relies on `safeRestoreResources` but no longer carries its implementation contract

Plan V04 correctly replaces unsafe whole-archive extraction with `safeExtractZip`,
and it says `safeRestoreResources(tempDir, resourcesRoot)` still runs afterward
for defense-in-depth. However, V04 does not include the helper's actual safety
contract or implementation shape; it only says to see the V02 plan for the full
implementation.

That is a qualifying risk because `safeRestoreResources` does not exist in the
current repo. The earlier Codex assessments required resource restore to use
manifest validation, regular-file-only copying, symlink skipping, source and
destination path containment, and backup-directory rejection. If an implementer
uses V04 as the current plan, the restore route can either fail typecheck by
calling an undefined helper or reimplement the resource-copy step without the
required V02 safety details.

Recommended plan correction:

- Reproduce the `safeRestoreResources` helper contract in Plan V05 instead of
  only pointing to V02.
- State where the helper should live, whether it is local to
  `api/src/routes/database.ts` or a new testable file under `api/src/lib/`.
- Preserve the required behavior: `lstat`, skip symlinks and non-regular
  entries, verify resolved source stays under `tempDir/resources`, verify
  resolved destination stays under `PATH_PROJECT_RESOURCES`, reject
  `backups_db` and `backups_db_and_data`, and return the restored file count.
