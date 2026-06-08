---
created_at: 2026-06-08
updated_at: 2026-06-08
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# Benevolent Meditation Editing — Architecture and Implementation Plan V10

## 1. Scope and Changes from V09

This revision supersedes V09 in one area identified by the Codex assessment of V09:

**V09's audit-log code block (§5.5) references an undefined identifier `meditationBeforeSave`.** The surrounding prose correctly states that `previous` should be captured from the in-memory Sequelize instance before mutation, but the concrete snippet assigns `previous` from `meditationBeforeSave.title`, `meditationBeforeSave.description`, and `meditationBeforeSave.visibility` — a variable that is never declared in the handler order or anywhere else in the plan. Implemented literally, this fails TypeScript compilation. Fixed casually by assigning `meditationBeforeSave = meditation` before mutation, it would capture an object reference rather than an immutable snapshot, so `previous` would reflect the post-mutation state if Sequelize mutates the instance in-place.

V10 corrects the snippet to capture scalar values directly from the live `meditation` instance before any field assignment, matching the stated contract:

```ts
const previous = {
  title: meditation.title,
  description: meditation.description ?? null,
  visibility: meditation.visibility,
};
```

All other V09 fixes remain valid and unchanged. No other sections are altered.

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

All files from V04 §4 apply. No new files are added by V10.

| File | Change vs V09 |
|------|--------------|
| `api/src/routes/admin.ts` | Audit-log `previous` snapshot uses direct scalar fields from `meditation` instance; `meditationBeforeSave` removed entirely |
| `api/src/routes/admin.test.ts` (or equivalent test file) | No change from V09; success-path assertions remain as specified in §6.4 |

---

## 5. Validation and Handler Contract (revised, supersedes V09 §5)

### 5.1 Field rejection and handler order

The PATCH handler applies checks and operations in this order, short-circuiting on the first failure:

1. Parse `id` from path params (non-numeric → 400).
2. **[from V07] Content-Type guard** — if the request carries a `Content-Type` header whose value does not match `application/json`, throw `AppError(400, "VALIDATION_ERROR", "Request body must be JSON")`. A request with no `Content-Type` header passes this check.
3. **[from V07] Non-object body guard** — if `req.body === undefined` or `Array.isArray(req.body)`, throw `AppError(400, "VALIDATION_ERROR", "Request body must be a JSON object")`. This covers no-body/no-Content-Type requests and JSON arrays.
4. Reject unknown body keys (any key outside `{ title, description, visibility }` → `400 UNKNOWN_FIELD`).
5. **[from V08] Field-presence guard** — if none of `title`, `description`, `visibility` is present as a key in `req.body`, throw `AppError(400, "VALIDATION_ERROR", "At least one metadata field must be provided")`. This rejects both wire-empty `application/json` bodies (which arrive as `{}`) and explicit `{}` bodies, which are indistinguishable at this point.
6. Load the `Meditation` row by `id` (not found → 404).
7. **[restored from V02]** Warn-log and throw `409 BENEVOLENT_OWNER_REQUIRED` if `meditation.userId !== benevolentUser.id`.
8. **[restored from V02]** Warn-log and throw `409 STAGE_NOT_ELIGIBLE` if `meditation.stage !== "library"`.
9. Per-field validation (only for fields present in body): `title` non-empty after trim; `visibility` enum check.
10. **[V10 fix]** Capture `previous` metadata snapshot before mutation: `{ title: meditation.title, description: meditation.description ?? null, visibility: meditation.visibility }`.
11. Apply the allowed updates to the Sequelize instance for each field present in the body.
12. Call `.save()`.
13. **[explicitly restored — the V09 fix]** Emit `logger.info("admin.benevolent_meditation_metadata_update", ...)` with the full structured payload (see §5.5).
14. Serialize the updated row as `AdminMeditation` and return `200` with `{ message, meditation }`.

Steps 10–14 are entirely within the success path; steps 2–9 only throw. The DB load (step 6) is deferred until after all body checks so that no DB round-trip is wasted on a body that will be rejected.

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

Unchanged from V08 §5.4:

```ts
const ALLOWED_FIELDS = ["title", "description", "visibility"] as const;
const hasAtLeastOneField = ALLOWED_FIELDS.some((key) => key in req.body);
if (!hasAtLeastOneField) {
  throw new AppError(400, "VALIDATION_ERROR", "At least one metadata field must be provided");
}
```

`key in req.body` tests for key presence regardless of value, so a body of `{ title: "" }` passes this guard (the empty-string title is caught by per-field validation in step 9) while `{}` does not.

### 5.5 Success audit log — specification

After `.save()` completes (step 12), before serializing the response (step 14). The `previous` snapshot is captured at step 10, before any field assignment:

```ts
// Step 10: capture scalar values from the live instance before any mutation
const previous = {
  title: meditation.title,
  description: meditation.description ?? null,
  visibility: meditation.visibility,
};

// Step 11: apply allowed updates to the Sequelize instance
// Step 12: await meditation.save();

// Step 13: emit structured audit log
logger.info("admin.benevolent_meditation_metadata_update", {
  actorId: req.user!.id,
  actorEmail: req.user!.email,
  actorIsAdmin: req.user!.isAdmin,
  meditationId: meditation.id,
  targetOwnerUserId: meditation.userId,
  targetOwnerEmail: BENEVOLENT_USER_EMAIL,
  previous,
  next: {
    title: meditation.title,
    description: meditation.description ?? null,
    visibility: meditation.visibility,
  },
  request: {
    ip: req.ip,
    userAgent: req.headers["user-agent"] ?? null,
  },
  timestamp: new Date().toISOString(),
});
```

`previous` is captured by reading scalar fields off the Sequelize instance before the mutation block — not by saving an object reference. After `.save()`, the same instance fields hold the committed next values. `BENEVOLENT_USER_EMAIL` is the backend constant from `getOrCreateBenevolentUser.ts`; it is already imported in `admin.ts` for the owner guard. No user-supplied value is written to the log.

### 5.6 Middleware contract and reachability under current app.ts

Unchanged from V08 §5.5. The table below is reproduced for completeness:

| Wire input | `req.body` value reaching handler | Guard that fires | Response |
|------------|----------------------------------|-------------------|----------|
| JSON object with allowed field(s), `application/json` | Plain object with key(s) | None | Proceeds normally |
| JSON object `{}` (explicit), `application/json` | `{}` | Field-presence guard (step 5) | 400 VALIDATION_ERROR |
| Empty body, `Content-Type: application/json` | `{}` (body-parser special case) | Field-presence guard (step 5) | 400 VALIDATION_ERROR |
| JSON array (empty or non-empty), `application/json` | Array | Non-object guard (step 3) | 400 VALIDATION_ERROR |
| `application/x-www-form-urlencoded` body | Plain object (parsed by `express.urlencoded()`) | Content-Type guard (step 2) | 400 VALIDATION_ERROR |
| Any body with `Content-Type: text/plain` | `undefined` | Content-Type guard (step 2) | 400 VALIDATION_ERROR |
| No body, no `Content-Type` header | `undefined` | Non-object guard (step 3) | 400 VALIDATION_ERROR |
| JSON `null`, string, number, boolean with `application/json` | Never reaches handler | `express.json()` strict-mode parser emits `SyntaxError` at parser layer | 500 INTERNAL_ERROR (unless `errorHandler.ts` remaps `SyntaxError` to 400 — outside this plan's scope) |

---

## 6. Test Contract (unchanged from V09 §6)

### 6.1 Body rejection test cases

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

### 6.2 Owner and stage guard test cases

| Case | Expected status | Expected `response.body.error.code` |
|------|----------------|--------------------------------------|
| Meditation is not benevolent-owned | 409 | `BENEVOLENT_OWNER_REQUIRED` |
| Meditation is benevolent-owned but stage is not `"library"` | 409 | `STAGE_NOT_ELIGIBLE` |

### 6.3 Existing unknown-field and field-level validation tests

Unchanged from V05 §6.2–6.3. These assume a valid `application/json` plain-object body with at least one allowed field, and test steps 4 and 9 respectively.

### 6.4 Success audit log test cases

The following assertions are required in the success-path test case(s) for `PATCH /admin/meditations/:id/metadata`:

1. **Logger called on success.** When the request is well-formed, the meditation is benevolent-owned and library-staged, and the update succeeds, `logger.info` must be called exactly once with message `"admin.benevolent_meditation_metadata_update"`.

2. **Payload contains actor identity.** The logged payload must include `actorId`, `actorEmail`, and `actorIsAdmin` matching the authenticated user in the test fixture.

3. **Payload contains target meditation identity.** The logged payload must include `meditationId` matching the meditation fixture ID, and `targetOwnerUserId` matching the benevolent user's ID.

4. **Payload contains `previous` values captured before mutation.** `previous.title`, `previous.description`, and `previous.visibility` must equal the field values from the meditation fixture before the update was applied.

5. **Payload contains `next` values reflecting the committed update.** `next.title`, `next.description`, and `next.visibility` must equal the values sent in the request body (for fields present) and the original fixture values (for fields not present in the body).

6. **Payload contains request metadata.** The logged payload must include a `request` object with `ip` and `userAgent` fields (values may be null in the test harness; presence is required).

7. **Payload contains `timestamp`.** The logged payload must include a `timestamp` field that is a non-empty ISO 8601 string.

8. **Logger not called on rejection.** When any guard throws (wrong owner, wrong stage, body validation failure), `logger.info` with message `"admin.benevolent_meditation_metadata_update"` must not be called. (The warn-log for owner/stage rejections uses a different message and is asserted separately per §6.2.)

The logger mock follows the existing pattern: jest replaces `logger` with a spy/mock before each test and the mock is verified per test case.

---

## 7. Compatibility and Non-Regression

All notes from V04 §6 apply. The V10 change is a specification correction only: it aligns the code snippet in §5.5 with the prose contract that V09 already stated correctly. No guard behavior, error codes, response shapes, DB semantics, or observable runtime behavior are changed.

---

## 8. Risks and Mitigations

All risks and mitigations from V04 §7 apply.

**Risk carried from V07**: A client sending urlencoded bodies receives `400 VALIDATION_ERROR` from the Content-Type guard after deployment. Mitigation: the endpoint is internal admin-only with no known non-JSON clients.

**Risk carried from V08**: A client explicitly sending `{}` to the admin PATCH endpoint and relying on the no-op behavior will begin receiving `400 VALIDATION_ERROR`. Mitigation: this is not a documented or intentional use of a PATCH endpoint; no such client is expected.

**Risk from V09 (retained, now fully mitigated)**: The `previous` snapshot must be taken from the in-memory instance fields before any field assignment. If the capture is placed after a partial field assignment, `previous` will reflect a partially-mutated state and the log will be inaccurate. Mitigation: the §5.5 snippet now reads scalar values (`meditation.title`, `meditation.description`, `meditation.visibility`) directly from the instance before the mutation block, not from a separate variable or object reference. This is the sole change from V09.

---

## 9. Assumptions

All assumptions from V02 §7 apply.

From V07: `express.urlencoded()` remains registered at `api/src/app.ts` line 20; the Content-Type guard handles urlencoded requests regardless.

From V07: strict-mode parsing in `express.json()` / `body-parser` remains enabled.

From V08: the installed `body-parser` JSON parser continues to set `req.body = {}` for empty-body `application/json` requests.

From V09: `req.ip` is set by Express and reflects the client IP as resolved by any trust-proxy configuration in `api/src/app.ts`. If `trust proxy` is not configured and the app is behind a reverse proxy, `req.ip` may reflect the proxy address rather than the originating IP. This is acceptable for audit purposes in the current deployment topology; adjusting `trust proxy` is outside this plan's scope.
