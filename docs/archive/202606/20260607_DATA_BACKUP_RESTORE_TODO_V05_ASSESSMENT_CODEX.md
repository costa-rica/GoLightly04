---
created_at: 2026-06-07
updated_at: 2026-06-07
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Assessment: Data Backup Restore TODO V05

## Qualifying Concerns

### 1. Phase 5a tells implementers to use `file.originalname` in a disk filename

TODO V05 Phase 5a adds `uploadLarge` with disk storage and this filename
callback:

```typescript
filename: (_req, file, cb) => cb(null,
`golightly04_upload_${Date.now()}_${file.originalname}`)
```

That client-controlled value is used by multer before the restore handler runs.
Multer disk storage joins the returned filename with the destination path, so a
crafted multipart filename containing path separators or `..` segments can
write the uploaded zip outside `os.tmpdir()` before `safeExtractZip` validates
archive entries. The later `finally` cleanup also removes `req.file.path`, which
could now point somewhere the server never intended to write.

This is a qualifying implementation risk because Phase 5 is specifically
hardening restore uploads and archive handling, but the checklist leaves an
unvalidated filesystem write at the new disk-upload step.

Recommended TODO correction:

- Change Phase 5a to generate a server-controlled filename only. Do not include
  `file.originalname`.
- For example, import `crypto` and use:

```typescript
filename: (_req, _file, cb) =>
  cb(null, `golightly04_upload_${Date.now()}_${crypto.randomUUID()}.zip`)
```

- Add a Phase 5f test or checklist item for a crafted multipart filename such
  as `../../evil.zip`, asserting the upload path remains under `os.tmpdir()` and
  no file is created at the traversal target.
