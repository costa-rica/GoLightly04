---
created_at: 2026-06-07
updated_at: 2026-06-07
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Assessment: Data Backup Restore TODO V04

## Qualifying Concerns

### 1. Phase 5 tells implementers to call `safeRestoreResources` without creating it

TODO V04 Phase 5d says that combined-package restore should call
`safeRestoreResources(tempDir, env.PATH_PROJECT_RESOURCES)` and use its return
count, but no Phase 5 task creates that helper or defines its safety rules.
`api/src/routes/database.ts` has no existing `safeRestoreResources` function, so
following the TODO literally leaves an undefined symbol and fails
`cd api && npm run typecheck`.

This also weakens the archive-safety fix from prior Codex assessments. The new
`safeExtractZip` helper protects extraction-time writes, but the restore still
needs the second containment layer when copying `tempDir/resources` into the live
`PATH_PROJECT_RESOURCES` tree.

Recommended TODO correction:

- Add an explicit Phase 5 task to implement `safeRestoreResources` before it is
  called from `POST /database/replenish-database`.
- Specify the required behavior: use `lstat`; copy only regular files; skip
  symlinks and non-regular entries; verify resolved source paths stay under
  `tempDir/resources`; verify resolved destination paths stay under
  `PATH_PROJECT_RESOURCES`; reject top-level `backups_db` and
  `backups_db_and_data`; return the restored file count.
- Add or retain direct tests for the helper, including symlink skipping,
  traversal containment, backup-directory rejection, and returned file count.
