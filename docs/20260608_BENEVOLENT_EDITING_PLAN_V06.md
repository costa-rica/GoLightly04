---
created_at: 2026-06-08
updated_at: 2026-06-08
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# Benevolent Meditation Editing — Architecture and Implementation Plan V06

## 1. Scope and Changes from V05

This revision supersedes V05 in three areas identified by the Codex assessment of V05:

1. **Owner/stage guard responses must be `409`, not `403`.** V05 §5.1 steps 5–6 regressed these to `403 FORBIDDEN`. V02 §4.1 corrected them to warn-log and throw `409 BENEVOLENT_OWNER_REQUIRED` / `409 STAGE_NOT_ELIGIBLE`. That correction is restored here.

2. **The non-object body guard must be scoped to values that can actually reach the handler** under the current `express.json()` middleware (`express` 5.2.1 / `body-parser` 2.2.2). Those middleware use strict parsing by default: JSON primitives (`null`, strings, numbers, booleans) are rejected by the parser as `SyntaxError` before the route handler runs and never reach handler code. JSON arrays do reach the handler. A missing or non-`application/json` body results in `req.body === undefined`. V05 §5.2–5.3 described a guard and tests as if all JSON values were parsed and forwarded, which is incorrect under current defaults.

3. **The non-object body guard must throw `AppError`, not return a direct flat response.** V05 §5.2 specified `{ error: "VALIDATION_ERROR", message: "..." }`. The repository's error handler (`api/src/middleware/errorHandler.ts` lines 15–26) serializes `AppError` instances as `{ error: { code, message, status, details } }`, and existing test suites assert `response.body.error.code`. A direct flat response creates an inconsistent error shape on the admin endpoint.

All V04 and V05 fixes remain valid and unchanged except where a specific clause is corrected below. They are not restated.

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

All files from V04 §4 apply. No new files are added by V06.

| File | Change vs V05 |
|------|--------------|
| `api/src/routes/admin.ts` | Non-object body guard throws `AppError(400, "VALIDATION_ERROR", ...)` instead of returning a flat response; guard condition scoped to `undefined` and array values only |
| `api/src/routes/admin.test.ts` (or equivalent test file) | Test cases limited to feasible handler-level scenarios; primitive/null cases removed; owner/stage failure assertions corrected to 409 |

---

## 5. Validation Contract (revised, supersedes V05 §5)

### 5.1 Field rejection order

The PATCH handler applies checks in this order, short-circuiting on the first failure:

1. Parse `id` from path params (non-numeric → 400).
2. **[from V05] Non-object body guard** — if `req.body` is `undefined` or an array, throw `AppError(400, "VALIDATION_ERROR", "Request body must be a JSON object")`. See §5.2 for the precise condition and middleware contract.
3. Reject unknown body keys (any key outside `{ title, description, visibility }` → `400 UNKNOWN_FIELD`).
4. Load the `Meditation` row by `id` (not found → 404).
5. **[restored from V02]** Warn-log and throw `409 BENEVOLENT_OWNER_REQUIRED` if `meditation.userId !== benevolentUser.id`.
6. **[restored from V02]** Warn-log and throw `409 STAGE_NOT_ELIGIBLE` if `meditation.stage !== "library"`.
7. Per-field validation (only for fields present in body): `title` non-empty after trim; `visibility` enum check.
8. Apply updates and call `.save()`.
9. Serialize and return `200` with `AdminMeditation`.

Steps 1 and 2 are both pre-database. Step 2 must precede step 3 because `Object.keys` on `undefined` throws a `TypeError`.

### 5.2 Non-object body guard — specification

The guard is the very first body inspection in the handler, before any other use of `req.body`. The condition to reject is:

```ts
req.body === undefined || Array.isArray(req.body)
```

When this condition is true, the handler throws:

```ts
throw new AppError(400, "VALIDATION_ERROR", "Request body must be a JSON object");
```

The error is serialized by `errorHandler.ts` as `{ error: { code: "VALIDATION_ERROR", message: "...", status: 400 } }`, consistent with all other API error responses.

No `logger.warn` is required for this guard. Malformed-body rejections are routine input-boundary errors, not admin policy violations, and do not need the audit trail that owner/stage rejections require.

### 5.3 Middleware contract and reachability under current defaults

`api/src/app.ts` line 19 registers `express.json({ limit: "10mb" })` (`express` 5.2.1 / `body-parser` 2.2.2). These middleware use **strict parsing by default**, which accepts only JSON objects and arrays as top-level values:

| Wire input | `req.body` value reaching handler | Handler action |
|------------|----------------------------------|----------------|
| Valid JSON object `{"title":"x"}` | Plain object | Proceeds normally |
| JSON array `[]` or `[{"title":"x"}]` | Array value | Guard rejects: `400 VALIDATION_ERROR` |
| No body or non-`application/json` Content-Type | `undefined` | Guard rejects: `400 VALIDATION_ERROR` |
| JSON `null`, string, number, boolean | Never reaches handler | Parser emits `SyntaxError` before handler; handled by generic error handler branch (not `AppError`), producing `500 INTERNAL_ERROR` under current `errorHandler.ts` unless middleware contract is changed |

The handler guard is correctly scoped to arrays and `undefined`. Primitive and null inputs are a parser-layer concern. If the parser error response for those cases needs to change (e.g., to return `400` instead of `500`), that requires a separate change to `errorHandler.ts` to detect and re-map `SyntaxError` instances from `body-parser` — which is outside the scope of this plan.

The `null` case warrants a note: `typeof null === "object"` in JavaScript. If strict mode were ever disabled, a raw JSON `null` body would arrive at the handler as a `null` value, and the current guard `req.body === undefined || Array.isArray(req.body)` would not catch it, allowing `Object.keys(null)` to throw a TypeError. The guard would need to become `req.body == null || Array.isArray(req.body)` in that scenario. This assumption is recorded in §9.

---

## 6. Test Contract (revised, supersedes V05 §6)

### 6.1 Non-object body test cases

The following cases are feasible at the handler level under the current middleware and must be covered in the test suite for `PATCH /admin/meditations/:id/metadata`:

| Case | Request body / Content-Type | Expected status | Expected `response.body.error.code` |
|------|-----------------------------|----------------|--------------------------------------|
| JSON array (empty) | `[]` with `application/json` | 400 | `VALIDATION_ERROR` |
| JSON array (non-empty) | `[{"title":"x"}]` with `application/json` | 400 | `VALIDATION_ERROR` |
| No JSON body | No body, no `Content-Type` | 400 | `VALIDATION_ERROR` |
| No JSON body | Body present, `Content-Type: text/plain` | 400 | `VALIDATION_ERROR` |

JSON `null`, strings, numbers, and booleans are **not** tested at the handler level because strict-mode `express.json()` rejects them before the route handler runs. If test infrastructure intercepts at the raw HTTP layer and bypasses the middleware stack, those values would exercise the parser, not the handler guard. Tests must be integration or supertest-style tests that go through the full middleware stack so that the middleware/handler boundary is respected.

### 6.2 Owner and stage guard test cases

The following cases must assert `409`, not `403`, consistent with V02's correction:

| Case | Expected status | Expected `response.body.error.code` |
|------|----------------|--------------------------------------|
| Meditation is not benevolent-owned | 409 | `BENEVOLENT_OWNER_REQUIRED` |
| Meditation is benevolent-owned but stage is not `"library"` | 409 | `STAGE_NOT_ELIGIBLE` |

### 6.3 Existing unknown-field and field-level validation tests

Unchanged from V05 §6.2–6.3. These assume a valid plain-object body and test steps 3 and 7 respectively.

---

## 7. Compatibility and Non-Regression

All notes from V04 §6 apply. The corrections in V06 do not change any previously valid behavior:

- The `409` codes for owner/stage guards were the intended contract from V02 onward. V05's `403` was an accidental regression in the plan document, not in shipped code. Restoring `409` aligns the plan with the PRD and V02.
- The narrowed guard condition (`undefined` and arrays only) is strictly more correct than V05's broader condition, which described rejection of values that the middleware already prevented from reaching the handler.
- Throwing `AppError` instead of returning a direct response produces the same HTTP status and error code; only the response envelope shape changes, aligning it with the rest of the API.

---

## 8. Risks and Mitigations

All risks and mitigations from V04 §7 apply. V06 introduces no new risks.

The correction from `403` to `409` for owner/stage guards is a plan-document correction only; if V04 or earlier was implemented with `403` in code, that code must be updated to emit `409` before the tests from §6.2 can pass.

---

## 9. Assumptions

All assumptions from V02 §7 apply.

From V05: the Express `json()` middleware remains at `api/src/app.ts` line 19 and is not replaced by middleware that enforces object-only bodies natively.

New assumption for V06: strict-mode parsing in `express.json()` / `body-parser` remains enabled (i.e., the `strict` option is not set to `false`). If strict mode is disabled, JSON `null` would reach the handler as a `null` value, and the guard condition must be widened from `req.body === undefined || Array.isArray(req.body)` to `req.body == null || Array.isArray(req.body)` to defend against `Object.keys(null)`.
