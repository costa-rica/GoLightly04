---
created_at: 2026-06-08
updated_at: 2026-06-08
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# Benevolent Meditation Editing — Architecture and Implementation Plan V07

## 1. Scope and Changes from V06

This revision supersedes V06 in one area identified by the Codex assessment of V06:

**The middleware contract in V06 §5.3 incorrectly claimed that `Content-Type: application/x-www-form-urlencoded` requests arrive at the handler as `undefined`.** `api/src/app.ts` registers both `express.json({ limit: "10mb" })` (line 19) and `express.urlencoded({ extended: true })` (line 20). A request with `Content-Type: application/x-www-form-urlencoded` is parsed by `express.urlencoded()` and arrives at the handler as a plain object — for example, `title=New+Title` becomes `{ title: "New Title" }`. V06's non-object body guard (`req.body === undefined || Array.isArray(req.body)`) does not catch this case: the urlencoded request passes the guard and proceeds to field validation, silently accepting a content type the plan contract says it should reject.

V07 resolves this by designating the endpoint as **JSON-only**: a Content-Type guard is inserted before the non-object body guard. For any request that carries a `Content-Type` header whose value is not `application/json`, the handler throws `AppError(400, "VALIDATION_ERROR", "Request body must be JSON")` before any field access.

All other V06 fixes remain valid and unchanged. They are not restated.

---

## 2. Architecture Changes

All architecture changes from V04 §2 apply without modification:

- **§2.1** — `AdminUpdateMeditationMetadataResponse` returns `AdminMeditation`, not `Meditation`.
- **§2.2** — Admin serializer uses `undefined`/omission (not `null`) for absent optional string fields.

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

## 4. Files Likely to Change

All files from V04 §4 apply. No new files are added by V07.

| File | Change vs V06 |
|------|--------------|
| `api/src/routes/admin.ts` | Content-Type guard added as the first body check, before the non-object body guard from V06 |
| `api/src/routes/admin.test.ts` (or equivalent test file) | `application/x-www-form-urlencoded` test case added; existing body-rejection tests updated to reflect which guard fires (Content-Type guard vs. non-object guard); no test asserts that non-JSON bodies always arrive as `undefined` |

---

## 5. Validation Contract (revised, supersedes V06 §5)

### 5.1 Field rejection order

The PATCH handler applies checks in this order, short-circuiting on the first failure:

1. Parse `id` from path params (non-numeric → 400).
2. **[new in V07] Content-Type guard** — if the request carries a `Content-Type` header whose value does not match `application/json`, throw `AppError(400, "VALIDATION_ERROR", "Request body must be JSON")`. A request with no `Content-Type` header passes this check and is handled downstream by step 3.
3. **[from V06] Non-object body guard** — if `req.body === undefined` or `Array.isArray(req.body)`, throw `AppError(400, "VALIDATION_ERROR", "Request body must be a JSON object")`. This covers no-body/no-Content-Type requests (where neither middleware populates `req.body`) and JSON arrays (which `express.json()` parses and passes through).
4. Reject unknown body keys (any key outside `{ title, description, visibility }` → `400 UNKNOWN_FIELD`).
5. Load the `Meditation` row by `id` (not found → 404).
6. **[restored from V02]** Warn-log and throw `409 BENEVOLENT_OWNER_REQUIRED` if `meditation.userId !== benevolentUser.id`.
7. **[restored from V02]** Warn-log and throw `409 STAGE_NOT_ELIGIBLE` if `meditation.stage !== "library"`.
8. Per-field validation (only for fields present in body): `title` non-empty after trim; `visibility` enum check.
9. Apply updates and call `.save()`.
10. Serialize and return `200` with `AdminMeditation`.

Step 2 must precede step 3 because `express.urlencoded()` delivers urlencoded bodies to the handler as plain objects. Without the Content-Type guard, a urlencoded request with valid-looking keys would pass the non-object guard and proceed to field validation, violating the JSON-only contract.

### 5.2 Content-Type guard — specification

The Content-Type guard is the first body check in the handler, before any access to `req.body`:

```ts
const contentType = req.headers['content-type'];
if (contentType && !req.is('application/json')) {
  throw new AppError(400, "VALIDATION_ERROR", "Request body must be JSON");
}
```

`req.is('application/json')` returns a truthy string when the request's `Content-Type` matches `application/json`, including variants with parameters such as `; charset=utf-8`. It returns `false` for all non-JSON content types: `application/x-www-form-urlencoded`, `text/plain`, `multipart/form-data`, and others. The guard only fires when a `Content-Type` header is present; requests with no Content-Type header (typically empty-body requests) pass this check and are handled by the non-object guard in step 3.

Both error messages use the same code `VALIDATION_ERROR` and are serialized by `errorHandler.ts` as `{ error: { code: "VALIDATION_ERROR", message: "...", status: 400 } }`, consistent with all other API error responses.

### 5.3 Non-object body guard — specification

Unchanged from V06 §5.2. The condition to reject:

```ts
req.body === undefined || Array.isArray(req.body)
```

When true, the handler throws:

```ts
throw new AppError(400, "VALIDATION_ERROR", "Request body must be a JSON object");
```

### 5.4 Middleware contract and reachability under current app.ts

`api/src/app.ts` registers two body-parsing middleware in order:

- Line 19: `express.json({ limit: "10mb" })` — parses `application/json` bodies; strict mode by default (only objects and arrays accepted as top-level values).
- Line 20: `express.urlencoded({ extended: true })` — parses `application/x-www-form-urlencoded` bodies into plain objects.

| Wire input | `req.body` value reaching handler | Guard that fires | Response |
|------------|----------------------------------|-------------------|----------|
| JSON object with `application/json` | Plain object | None | Proceeds normally |
| JSON array with `application/json` | Array | Non-object guard (step 3) | 400 VALIDATION_ERROR |
| `application/x-www-form-urlencoded` body (e.g. `title=New+Title`) | Plain object (parsed by `express.urlencoded()`) | Content-Type guard (step 2) | 400 VALIDATION_ERROR |
| Any body with `Content-Type: text/plain` | `undefined` (neither middleware parses it) | Content-Type guard (step 2) | 400 VALIDATION_ERROR |
| No body, no `Content-Type` header | `undefined` | Non-object guard (step 3) | 400 VALIDATION_ERROR |
| `application/json` with empty body | `undefined` | Non-object guard (step 3) | 400 VALIDATION_ERROR |
| JSON `null`, string, number, boolean with `application/json` | Never reaches handler | `express.json()` strict-mode parser emits `SyntaxError` at parser layer | 500 INTERNAL_ERROR (unless `errorHandler.ts` is extended to remap `SyntaxError` to 400 — outside this plan's scope) |

The `null` edge case from V06 §5.3 remains: if strict mode were ever disabled, `null` would arrive at the handler and the guard `req.body === undefined` would not catch it (because `typeof null === "object"`). The guard would need to widen to `req.body == null`. See §9.

---

## 6. Test Contract (revised, supersedes V06 §6)

### 6.1 Body rejection test cases

The following cases are feasible at the handler level under the current middleware and must be covered in the test suite for `PATCH /admin/meditations/:id/metadata`:

| Case | Request body / Content-Type | Expected status | Expected `response.body.error.code` | Guard |
|------|-----------------------------|----------------|--------------------------------------|-------|
| URL-encoded body | `title=New+Title` with `application/x-www-form-urlencoded` | 400 | `VALIDATION_ERROR` | Content-Type |
| Non-JSON content type | Any body with `Content-Type: text/plain` | 400 | `VALIDATION_ERROR` | Content-Type |
| JSON array (empty) | `[]` with `application/json` | 400 | `VALIDATION_ERROR` | Non-object |
| JSON array (non-empty) | `[{"title":"x"}]` with `application/json` | 400 | `VALIDATION_ERROR` | Non-object |
| No body, no Content-Type | No body, no `Content-Type` header | 400 | `VALIDATION_ERROR` | Non-object |
| Empty body with JSON content type | Empty body, `Content-Type: application/json` | 400 | `VALIDATION_ERROR` | Non-object |

Tests must use supertest or equivalent integration-layer tooling that exercises the full middleware stack. Tests must not assert that `application/x-www-form-urlencoded` bodies arrive as `undefined` — they arrive as plain objects at the handler and are caught by the Content-Type guard, not the non-object guard.

JSON `null`, strings, numbers, and booleans are not tested at the handler level; `express.json()` strict-mode parsing rejects them before the handler runs.

### 6.2 Owner and stage guard test cases

Unchanged from V06 §6.2. Both must assert `409`:

| Case | Expected status | Expected `response.body.error.code` |
|------|----------------|--------------------------------------|
| Meditation is not benevolent-owned | 409 | `BENEVOLENT_OWNER_REQUIRED` |
| Meditation is benevolent-owned but stage is not `"library"` | 409 | `STAGE_NOT_ELIGIBLE` |

### 6.3 Existing unknown-field and field-level validation tests

Unchanged from V05 §6.2–6.3. These assume a valid `application/json` plain-object body and test steps 4 and 8 respectively.

---

## 7. Compatibility and Non-Regression

All notes from V04 §6 apply. The V07 Content-Type guard is additive: it rejects requests that V06 would have silently accepted (urlencoded bodies with valid-looking keys), but no correct client of a JSON API endpoint should be sending urlencoded bodies. Enforcing `Content-Type: application/json` is a tightening, not a breaking change for any well-formed client.

---

## 8. Risks and Mitigations

All risks and mitigations from V04 §7 apply.

**Risk introduced by V07**: A client that was sending urlencoded bodies to the admin PATCH endpoint and receiving valid `200` responses (because unknown-field validation happened not to reject the fields) will begin receiving `400 VALIDATION_ERROR` after the Content-Type guard is deployed.

**Mitigation**: The endpoint is an internal admin-only route with no known clients that send urlencoded bodies. If such a client is discovered, it must be updated to send `Content-Type: application/json` with a JSON body.

---

## 9. Assumptions

All assumptions from V02 §7 apply.

From V05/V06: the Express `json()` middleware remains at `api/src/app.ts` line 19 and is not replaced by middleware that enforces object-only bodies natively.

From V06: strict-mode parsing in `express.json()` / `body-parser` remains enabled. If strict mode is disabled, the non-object guard must widen from `req.body === undefined || Array.isArray(req.body)` to `req.body == null || Array.isArray(req.body)`.

New for V07: `express.urlencoded()` remains registered at `api/src/app.ts` line 20. If this middleware is removed, the Content-Type guard still correctly rejects urlencoded requests (Content-Type is present and not `application/json`), so removing `express.urlencoded()` does not invalidate the guard — but the behavioral path changes from "urlencoded body arrives as plain object, Content-Type guard fires" to "urlencoded body arrives as `undefined`, Content-Type guard fires."
