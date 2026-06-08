---
created_at: 2026-06-07
updated_at: 2026-06-07
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Assessment: Data Backup Restore Plan V05

## Qualifying Concerns

### 1. Disk-upload filename still trusts client-controlled `originalname`

Plan V05 correctly hardens zip extraction and resource restore, but the new
`uploadLarge` multer export still builds the temp filename from
`file.originalname`:

```typescript
filename: (_req, file, cb) =>
  cb(null, `golightly04_upload_${Date.now()}_${file.originalname}`),
```

Multer's disk storage uses the returned filename directly in
`path.join(destination, filename)` before the route handler or `safeExtractZip`
runs. A crafted multipart upload can provide an original filename containing
path separators or traversal segments, causing the uploaded zip itself to be
written outside `os.tmpdir()` during the multer write step. This reintroduces
an extraction-before-validation style filesystem-write risk at the upload layer,
despite the later archive-entry safety checks.

This is qualifying because the restore endpoint is explicitly being changed to
accept large arbitrary zip uploads from the admin UI, and V05's safety model
depends on no untrusted path being written before validation.

Recommended plan correction:

- Do not include `file.originalname` in the disk-storage filename.
- Use a server-generated basename only, for example:

```typescript
filename: (_req, _file, cb) =>
  cb(null, `golightly04_upload_${Date.now()}_${crypto.randomUUID()}.zip`)
```

- Or use multer's default random disk filename with `dest: os.tmpdir()` and do
  not preserve the client filename at all.
- Add a test or explicit validation note that a multipart filename such as
  `../../evil.zip` cannot place the upload outside the configured temp
  directory.
