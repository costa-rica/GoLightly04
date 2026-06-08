---
created_at: 2026-06-08
updated_at: 2026-06-08
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# Benevolent Meditation Editing — Architecture and Implementation Plan V05

## 1. Scope and Changes from V04

This revision supersedes V04 in one area identified by the Codex assessment of V04:

1. **The `PATCH /admin/meditations/:id/metadata` handler must reject non-object request bodies with `400 VALIDATION_ERROR` before calling `Object.keys`.** V04 inherited V02's unknown-field rejection logic unchanged. That logic assumes `req.body` is a plain object. Because `express.json()` can parse valid JSON values that are not objects — `null`, arrays, strings, numbers — a `null` body causes `Object.keys(null)` to throw a `TypeError` (resulting in a 500), and an array body causes `Object.keys([])` to return `[]`, allowing the request to bypass unknown-field checking and succeed as a no-op.

All V04 fixes (explicit import of both `Meditation` and `MeditationVisibility` in `shared-types/src/admin.ts`, `AdminUpdateMeditationMetadataResponse` returns `AdminMeditation`, admin serializer uses `undefined`/omission for optional string fields, shared `serializeAdminMeditationRow` helper, `AdminMeditation` type, server-driven `isBenevolentOwned`, no email constant in frontend, unknown-field rejection, warn-log guards) remain unchanged and are not restated unless a specific clause is corrected here.

---

## 2. Architecture Changes

All architecture changes from V04 §2 apply without modification. They are:

- **§2.1** — `AdminUpdateMeditationMetadataResponse` returns `AdminMeditation`, not `Meditation`.
- **§2.2** — Admin serializer uses `undefined`/omission (not `null`) for absent optional string fields, following `mapMeditationRecord` exactly.

The PATCH handler serializer helper (`serializeAdminMeditationRow`) and the frontend state replacement pattern are unchanged from V04.

---

## 3. Revised Shared-Types Definitions

Unchanged from V04 §3. Both `Meditation` and `MeditationVisibility` are imported explicitly in `shared-types/src/admin.ts`:

```ts
import type { Meditation, MeditationVisibility } from "./meditation";

export type AdminMeditation = Meditation & {
  isBenevolentOwned: boolean;
};

export type AdminUpdateMeditationMetadataRequest = {
  title?: string;
  description?: string;
  visibility?: MeditationVisibility;
};

export type AdminUpdateMeditationMetadataResponse = {
  message: string;
  meditation: AdminMeditation;
};
```

---

## 4. Files Likely to Change (updated)

All files from V04 §4 apply. No new files are added by V05.

| File | Change vs V04 |
|------|--------------|
| `api/src/routes/admin.ts` | Non-object body guard added as the first body check in the PATCH handler, before the existing `Object.keys` enumeration |
| `api/src/routes/admin.test.ts` (or equivalent test file) | New test cases for null body, array body, and non-object scalar body |

---

## 5. Validation Contract (revised, supersedes V04 §5 and V02 §4)

### 5.1 Field rejection order

The PATCH handler applies checks in this order. Steps are unchanged from V02 except for the new step 2a:

1. Parse `id` from path params (non-numeric → 400).
2. **[NEW] Non-object body guard** — verify `req.body` is a plain, non-null object. If `req.body === null`, is an array, or is not of type `"object"` → `400 VALIDATION_ERROR`. See §5.2 for details.
3. Reject unknown body keys (any key outside `{ title, description, visibility }` → 400 `UNKNOWN_FIELD`).
4. Load the `Meditation` row by `id` (not found → 404).
5. Owner guard: `meditation.userId !== benevolentUser.id` → 403 `FORBIDDEN` with `logger.warn(...)`.
6. Stage guard: `meditation.stage !== "library"` → 403 `FORBIDDEN` with `logger.warn(...)`.
7. Per-field validation (only for fields present in body): `title` non-empty after trim; `visibility` enum check.
8. Apply updates and call `.save()`.
9. Serialize and return `200` with `AdminMeditation`.

Steps 1 and 2 are both pre-database. Step 2 must precede step 3 because `Object.keys` throws on a `null` argument.

### 5.2 Non-object body guard — specification

The guard is the very first body inspection in the handler, before any other use of `req.body`. The test is:

```
typeof req.body !== "object" || req.body === null || Array.isArray(req.body)
```

When this condition is true, the handler responds immediately:

- HTTP status: `400`
- Response body: `{ error: "VALIDATION_ERROR", message: "Request body must be a JSON object" }`

The guard uses `Array.isArray` in addition to the `null` check because `typeof null === "object"` and `typeof [] === "object"` in JavaScript; neither is a plain object.

No `logger.warn` is required for the non-object guard. Malformed-body rejections are routine input-boundary errors, not admin policy violations, and do not need the audit trail that owner/stage rejections require.

### 5.3 Compatibility with express.json()

`api/src/app.ts` line 19 registers `express.json({ limit: "10mb" })`. When the middleware successfully parses the request body, `req.body` is set to the parsed JavaScript value — which may be `null` (for JSON `null`), an array (for a JSON array), a primitive (for a JSON string or number), or a plain object. The guard is necessary because none of these cases are excluded by the middleware itself.

If the `Content-Type` is absent or not `application/json`, Express sets `req.body` to `undefined` by default (without the guard failing). The allowed-key check in step 3 (`Object.keys(req.body)`) would return an empty array for `undefined`, not throw — but the guard also catches `typeof undefined !== "object"`, so `undefined` is rejected at step 2 with the same `400 VALIDATION_ERROR`. This is the correct behavior: a PATCH with no JSON body is not a valid partial-update request.

---

## 6. Test Contract (new in V05)

### 6.1 Non-object body test cases

The following cases must be covered in the test suite for `PATCH /admin/meditations/:id/metadata`. All are sent with `Content-Type: application/json` to ensure Express parses the body.

| Case | Request body literal | Expected status | Expected error code |
|------|---------------------|----------------|---------------------|
| JSON null | `null` | 400 | `VALIDATION_ERROR` |
| JSON array (empty) | `[]` | 400 | `VALIDATION_ERROR` |
| JSON array (non-empty) | `[{"title":"x"}]` | 400 | `VALIDATION_ERROR` |
| JSON string | `"hello"` | 400 | `VALIDATION_ERROR` |
| JSON number | `42` | 400 | `VALIDATION_ERROR` |
| JSON boolean | `true` | 400 | `VALIDATION_ERROR` |

These cases must be tested at the handler level (not just unit-tested), because the behaviour depends on `express.json()` parsing the wire bytes into a JavaScript value that then reaches the handler. Integration or supertest-style tests against the mounted router are appropriate.

### 6.2 Existing unknown-field tests

The unknown-field tests inherited from V02 (rejecting keys outside `{ title, description, visibility }`) are unaffected by the guard and continue to apply. They assume a valid plain-object body and test step 3.

### 6.3 Existing field-level validation tests

Per-field validation tests (non-empty `title`, valid `visibility` enum) are unaffected by the guard. They assume a valid plain-object body and test step 7.

---

## 7. Compatibility and Non-Regression

All notes from V04 §6 apply without addition. The non-object body guard is a strictly additive input-boundary check: it produces a `400` for inputs that previously either crashed (null body → 500) or silently succeeded (array body → 200 no-op). No existing valid requests are affected.

---

## 8. Risks and Mitigations

All risks and mitigations from V04 §7 apply without addition.

The non-object body guard introduces no new risks. The only observable behavior change is:
- `null` body: 500 TypeError → 400 VALIDATION_ERROR
- Array body: 200 (no-op) → 400 VALIDATION_ERROR

Both changes move toward the documented contract.

---

## 9. Assumptions

All assumptions from V02 §7 apply without correction.

Additional assumption for V05: the Express `json()` middleware remains in place at `api/src/app.ts` line 19 and is not replaced by a middleware that enforces object-only bodies natively. If a future middleware upgrade adds built-in object enforcement, the inline guard can be removed.
