---
created_at: 2026-06-07
updated_at: 2026-06-07
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Assessment: Data Backup Restore TODO V02

## Qualifying Concerns

### 1. Phase 5c leaves zip extraction outside the archive-safety contract

TODO V02 adds good tasks for `isValidManifest` and `safeRestoreResources`, but
Phase 5c still tells implementers to extract the uploaded archive first and then
run safety checks while copying from `tempDir/resources` to
`PATH_PROJECT_RESOURCES`.

That leaves an implementation-success gap: the archive extraction step itself is
the first filesystem write. If an uploaded zip contains unsafe entry names, the
post-extraction copy helper runs too late to prevent extraction-time writes.
The existing `api/src/routes/database.ts` uses `unzipper.Extract({ path:
tempDir })`; carrying that approach forward does not fully satisfy the V02
archive-safety intent.

Recommended TODO correction:

- Add a Phase 5c task for a safe zip extraction helper, or change the restore
  task to stream entries from the zip rather than extracting everything first.
- Require entry-name validation before writing any archive member: reject
  absolute paths, empty paths, drive-prefixed paths, and paths with `..`
  segments after POSIX normalization.
- Limit extraction to expected root-level CSVs, optional `manifest.json`, and
  allowed `resources/**` regular-file entries.
- Add API tests with crafted traversal entries that assert no file is written
  outside the intended temp directory or `PATH_PROJECT_RESOURCES`.
