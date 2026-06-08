---
created_at: 2026-06-08
updated_at: 2026-06-08
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# Benevolent Meditation Editing — Architecture and Implementation Plan V08

## 1. Scope and Changes from V07

This revision supersedes V07 in one area identified by the Codex assessment of V07:

**V07 §5.4 incorrectly stated that an empty `application/json` body reaches the handler as `req.body === undefined`.** The installed `body-parser` JSON parser (`node_modules/body-parser/lib/types/json.js` lines 54–58) special-cases empty bodies: when the request carries `Content-Type: application/json` and the payload is absent or an empty string, it sets `req.body = {}` rather than leaving it `undefined`. Consequently, an empty-body JSON request passes the Content-Type guard (it is `application/json`), passes the non-object guard (`{}` is not `undefined` and is not an array), passes unknown-field validation (no keys to reject), loads the meditation row, and would execute a no-op `.save()`. The V07 test case asserting `400` for "Empty body with JSON content type" would fail against the real middleware stack.

V08 resolves this by treating empty JSON bodies and literal `{}` bodies as equivalent no-op requests and rejecting them. Because both arrive at route code as `{}` — indistinguishable from each other — the chosen contract is: **reject any PATCH where no allowed metadata field is present**. A field-presence guard is inserted after unknown-field validation and before the DB load. It throws `AppError(400, "VALIDATION_ERROR", "At least one metadata field must be provided")`.

All other V07 fixes remain valid and unchanged.

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

All files from V04 §4 apply. No new files are added by V08.

| File | Change vs V07 |
|------|--------------|
| `api/src/routes/admin.ts` | Field-presence guard added after unknown-field validation and before DB load |
| `api/src/routes/admin.test.ts` (or equivalent test file) | Middleware matrix row for "empty `application/json`" corrected: body arrives as `{}`, rejected by field-presence guard; empty `{}` test case added; existing test for "Empty body with JSON content type" updated to reflect correct guard |

---

## 5. Validation Contract (revised, supersedes V07 §5)

### 5.1 Field rejection order

The PATCH handler applies checks in this order, short-circuiting on the first failure:

1. Parse `id` from path params (non-numeric → 400).
2. **[from V07] Content-Type guard** — if the request carries a `Content-Type` header whose value does not match `application/json`, throw `AppError(400, "VALIDATION_ERROR", "Request body must be JSON")`. A request with no `Content-Type` header passes this check.
3. **[from V07] Non-object body guard** — if `req.body === undefined` or `Array.isArray(req.body)`, throw `AppError(400, "VALIDATION_ERROR", "Request body must be a JSON object")`. This covers no-body/no-Content-Type requests and JSON arrays.
4. Reject unknown body keys (any key outside `{ title, description, visibility }` → `400 UNKNOWN_FIELD`).
5. **[new in V08] Field-presence guard** — if none of `title`, `description`, `visibility` is present as a key in `req.body`, throw `AppError(400, "VALIDATION_ERROR", "At least one metadata field must be provided")`. This rejects both wire-empty `application/json` bodies (which arrive as `{}`) and explicit `{}` bodies, which are indistinguishable at this point.
6. Load the `Meditation` row by `id` (not found → 404).
7. **[restored from V02]** Warn-log and throw `409 BENEVOLENT_OWNER_REQUIRED` if `meditation.userId !== benevolentUser.id`.
8. **[restored from V02]** Warn-log and throw `409 STAGE_NOT_ELIGIBLE` if `meditation.stage !== "library"`.
9. Per-field validation (only for fields present in body): `title` non-empty after trim; `visibility` enum check.
10. Apply updates and call `.save()`.
11. Serialize and return `200` with `AdminMeditation`.

The field-presence guard (step 5) must be placed after unknown-field validation (step 4) so that a body like `{ unknownKey: "x" }` is rejected as `UNKNOWN_FIELD` rather than `VALIDATION_ERROR`. The DB load (step 6) is deferred until after all body checks so that no DB round-trip is wasted on a body that will be rejected.

### 5.2 Content-Type guard — specification

Unchanged from V07 §5.2:

```ts
const contentType = req.headers['content-type'];
if (contentType && !req.is('application/json')) {
  throw new AppError(400, "VALIDATION_ERROR", "Request body must be JSON");
}
```

### 5.3 Non-object body guard — specification

Unchanged from V07 §5.3:

```ts
if (req.body === undefined || Array.isArray(req.body)) {
  throw new AppError(400, "VALIDATION_ERROR", "Request body must be a JSON object");
}
```

### 5.4 Field-presence guard — specification

```ts
const ALLOWED_FIELDS = ["title", "description", "visibility"] as const;
const hasAtLeastOneField = ALLOWED_FIELDS.some((key) => key in req.body);
if (!hasAtLeastOneField) {
  throw new AppError(400, "VALIDATION_ERROR", "At least one metadata field must be provided");
}
```

`key in req.body` tests for key presence regardless of value, so a body of `{ title: "" }` passes this guard (the empty-string title is caught by per-field validation in step 9) while `{}` does not.

### 5.5 Middleware contract and reachability under current app.ts

`api/src/app.ts` registers two body-parsing middleware in order:

- Line 19: `express.json({ limit: "10mb" })` — parses `application/json` bodies; strict mode by default (only objects and arrays accepted as top-level values); empty body is set to `{}`.
- Line 20: `express.urlencoded({ extended: true })` — parses `application/x-www-form-urlencoded` bodies into plain objects.

| Wire input | `req.body` value reaching handler | Guard that fires | Response |
|------------|----------------------------------|-------------------|----------|
| JSON object with allowed field(s), `application/json` | Plain object with key(s) | None | Proceeds normally |
| JSON object `{}` (explicit), `application/json` | `{}` | Field-presence guard (step 5) | 400 VALIDATION_ERROR |
| Empty body, `Content-Type: application/json` | `{}` (body-parser special case) | Field-presence guard (step 5) | 400 VALIDATION_ERROR |
| JSON array (empty or non-empty), `application/json` | Array | Non-object guard (step 3) | 400 VALIDATION_ERROR |
| `application/x-www-form-urlencoded` body (e.g. `title=New+Title`) | Plain object (parsed by `express.urlencoded()`) | Content-Type guard (step 2) | 400 VALIDATION_ERROR |
| Any body with `Content-Type: text/plain` | `undefined` (neither middleware parses it) | Content-Type guard (step 2) | 400 VALIDATION_ERROR |
| No body, no `Content-Type` header | `undefined` | Non-object guard (step 3) | 400 VALIDATION_ERROR |
| JSON `null`, string, number, boolean with `application/json` | Never reaches handler | `express.json()` strict-mode parser emits `SyntaxError` at parser layer | 500 INTERNAL_ERROR (unless `errorHandler.ts` remaps `SyntaxError` to 400 — outside this plan's scope) |

The key correction from V07: **empty `application/json` bodies arrive as `{}`, not `undefined`**, so they are caught by the field-presence guard (step 5), not the non-object guard (step 3).

---

## 6. Test Contract (revised, supersedes V07 §6)

### 6.1 Body rejection test cases

The following cases are feasible at the handler level under the current middleware and must be covered in the test suite for `PATCH /admin/meditations/:id/metadata`:

| Case | Request body / Content-Type | Expected status | Expected `response.body.error.code` | Guard |
|------|-----------------------------|----------------|--------------------------------------|-------|
| URL-encoded body | `title=New+Title` with `application/x-www-form-urlencoded` | 400 | `VALIDATION_ERROR` | Content-Type |
| Non-JSON content type | Any body with `Content-Type: text/plain` | 400 | `VALIDATION_ERROR` | Content-Type |
| JSON array (empty) | `[]` with `application/json` | 400 | `VALIDATION_ERROR` | Non-object |
| JSON array (non-empty) | `[{"title":"x"}]` with `application/json` | 400 | `VALIDATION_ERROR` | Non-object |
| No body, no Content-Type | No body, no `Content-Type` header | 400 | `VALIDATION_ERROR` | Non-object |
| Empty body with JSON content type | Empty body, `Content-Type: application/json` | 400 | `VALIDATION_ERROR` | Field-presence |
| Explicit empty object | `{}` with `application/json` | 400 | `VALIDATION_ERROR` | Field-presence |

Tests must use supertest or equivalent integration-layer tooling that exercises the full middleware stack.

The "Empty body with JSON content type" row is corrected from V07: `req.body` arrives as `{}` (not `undefined`), so the non-object guard does not fire — the field-presence guard fires instead. Explicit `{}` and wire-empty bodies produce identical `req.body` values and are tested as a single logical case, though both cases may be included for documentation clarity.

### 6.2 Owner and stage guard test cases

Unchanged from V06 §6.2. Both must assert `409`:

| Case | Expected status | Expected `response.body.error.code` |
|------|----------------|--------------------------------------|
| Meditation is not benevolent-owned | 409 | `BENEVOLENT_OWNER_REQUIRED` |
| Meditation is benevolent-owned but stage is not `"library"` | 409 | `STAGE_NOT_ELIGIBLE` |

### 6.3 Existing unknown-field and field-level validation tests

Unchanged from V05 §6.2–6.3. These assume a valid `application/json` plain-object body with at least one allowed field, and test steps 4 and 9 respectively.

---

## 7. Compatibility and Non-Regression

All notes from V04 §6 apply. The V08 field-presence guard is additive: it rejects `{}` and empty-body JSON requests that V07 would have allowed through to a no-op DB save. No well-formed client should send a PATCH with no fields — the endpoint exists to update metadata, so at least one field must be provided. Enforcing this is a tightening with no impact on correct callers.

---

## 8. Risks and Mitigations

All risks and mitigations from V04 §7 apply.

**Risk carried from V07**: A client sending urlencoded bodies receives `400 VALIDATION_ERROR` from the Content-Type guard after deployment. Mitigation: the endpoint is internal admin-only with no known non-JSON clients.

**Risk introduced by V08**: A client explicitly sending `{}` to the admin PATCH endpoint and relying on the no-op behavior (e.g., to confirm the endpoint is reachable without changing data) will begin receiving `400 VALIDATION_ERROR`. Mitigation: this is not a documented or intentional use of a PATCH endpoint; no such client is expected. If discovered, it should be updated to send a meaningful field.

---

## 9. Assumptions

All assumptions from V02 §7 apply.

From V07: `express.urlencoded()` remains registered at `api/src/app.ts` line 20; the Content-Type guard handles urlencoded requests regardless.

From V07: strict-mode parsing in `express.json()` / `body-parser` remains enabled. If strict mode is disabled, the non-object guard must widen from `req.body === undefined || Array.isArray(req.body)` to `req.body == null || Array.isArray(req.body)`.

New for V08: the installed `body-parser` JSON parser continues to set `req.body = {}` for empty-body `application/json` requests. If a future upgrade changes this behavior (e.g., body-parser begins emitting `undefined` for empty bodies), the field-presence guard still correctly rejects empty bodies, because `{}` and `undefined` both produce no allowed fields — though `undefined` would now be caught by the non-object guard first. The field-presence guard remains correct either way.
