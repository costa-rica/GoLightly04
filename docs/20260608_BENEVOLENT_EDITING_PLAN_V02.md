---
created_at: 2026-06-08
updated_at: 2026-06-08
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# Benevolent Meditation Editing — Architecture and Implementation Plan V02

## 1. Scope and Changes from V01

This revision supersedes V01 in four areas identified by the Codex assessment:

1. **Unknown request fields must be rejected**, not silently ignored.
2. **Rejected owner/stage attempts must be warn-logged** in the handler itself; the existing error middleware does not do this.
3. **`GET /admin/meditations` returns raw Sequelize instances** with `userId`, not the mapped `Meditation` shape with `ownerUserId` — the route must be updated.
4. **The benevolent-owner eligibility predicate must not duplicate the backend-only email constant** — a server-driven `isBenevolentOwned` flag on the admin meditation list eliminates the contradiction in V01.

Background, scope, and all other architectural decisions from V01 remain unchanged and are not restated here.

---

## 2. Architecture Changes

### 2.1 Request body validation — reject unknown fields

The `PATCH /admin/meditations/:id/metadata` handler iterates the keys of `req.body` before any field-level validation. Any key outside the allowed set `{ title, description, visibility }` causes an immediate `400 BAD_REQUEST` with code `UNKNOWN_FIELD`. The error message names the first unexpected key found.

This is a deliberate departure from the user-facing `PATCH /meditations/update/:id` handler, which silently ignores extra keys. The admin endpoint is operator-only, audited, and must be unambiguous about what it accepts. Silently ignoring an unrecognized field on an audited path makes client bugs invisible and reduces auditability.

The blocked-field list from the PRD (`userId`, `meditationArray`, `scriptSource`, `sourceMode`, `filename`, `filePath`, `status`, `stage`, `listenCount`, timestamps) is not a separate allow-list: any key not in `{ title, description, visibility }` is rejected, which subsumes all blocked fields without enumerating them in code. The rejection message does not need to name the blocked list — `UNKNOWN_FIELD` with the key name is sufficient.

### 2.2 Warn-level logging for rejected owner/stage attempts

The existing `errorHandler.ts` (lines 15–18) only logs `AppError` when `status >= 500`. Four-hundred-class application errors are not logged. The plan's V01 assertion that rejected attempts are implicitly warned is incorrect.

The handler must call `logger.warn(...)` explicitly, before throwing the `AppError`, for each of the two expected rejection conditions:

```
logger.warn("admin.benevolent_meditation_metadata_update.rejected", {
  reason: "BENEVOLENT_OWNER_REQUIRED",   // or "STAGE_NOT_ELIGIBLE"
  actorId: req.user!.id,
  meditationId: meditation.id,
  actualOwnerUserId: meditation.userId,
  // do NOT log actualOwnerEmail — not needed for auditing and may not be benevolent
});
```

The warn entry is emitted on the handler's happy-path branches for the guard checks. It does not surface to the HTTP response. No PII beyond the actor ID (from the verified JWT) and the meditation ID (from the path param) is included.

The success audit log (emitted after `.save()`) is unchanged from V01.

### 2.3 Admin meditation list — explicit response mapping

`GET /admin/meditations` currently calls `Meditation.findAll()` and returns the raw Sequelize instances as `{ meditations }`. Sequelize model instances serialize `userId` (the raw DB column), not `ownerUserId`. The shared type `GetAllAdminMeditationsResponse` declares `meditations: Meditation[]`, and `Meditation` has `ownerUserId?: number` — meaning the declared type does not match the runtime shape. TypeScript does not catch this because the route is not explicitly typed at the response boundary.

**Resolution:** `GET /admin/meditations` is updated to serialize each row explicitly, following the same pattern used by `GET /users` in the same file. The route also resolves the benevolent user once per request (via `getOrCreateBenevolentUser()`, already imported) to compute `isBenevolentOwned` per row.

The serialized shape per meditation row includes at minimum:

| Field | Source |
|-------|--------|
| `id` | `meditation.id` |
| `title` | `meditation.title` |
| `description` | `meditation.description ?? null` |
| `visibility` | `meditation.visibility` |
| `status` | `meditation.status` |
| `stage` | `meditation.stage ?? "library"` |
| `ownerUserId` | `meditation.userId` |
| `isBenevolentOwned` | `meditation.userId === benevolentUser.id` |
| `filename` | `meditation.filename` |
| `filePath` | `meditation.filePath ?? null` |
| `listenCount` | `meditation.listenCount` |
| `createdAt` | `meditation.createdAt.toISOString()` |
| `updatedAt` | `meditation.updatedAt.toISOString()` |

Other fields (`meditationArray`, `scriptSource`, `sourceMode`, `durationSeconds`) are included if and only if they are already part of the current response — this plan does not add or remove fields beyond the explicit serialization boundary.

The null-coalescing of `stage` (`?? "library"`) is applied here, matching the convention used throughout the codebase. UI code can trust that `row.stage` is never null.

### 2.4 Shared-types: `AdminMeditation` and updated response type

Because `isBenevolentOwned` is an admin-only computed field with no meaning in the user-facing `Meditation` type, it must not be added to `Meditation`. Instead, a new admin-specific type is introduced in `shared-types/src/admin.ts`:

```ts
import type { Meditation } from "./meditation";

export type AdminMeditation = Meditation & {
  isBenevolentOwned: boolean;
};
```

`GetAllAdminMeditationsResponse` is updated from `meditations: Meditation[]` to `meditations: AdminMeditation[]`. This is a non-breaking change for existing consumers that do not access `isBenevolentOwned` — the `&` intersection is purely additive.

### 2.5 Frontend eligibility predicate — server-driven, no email constant

V01 correctly stated that `BENEVOLENT_USER_EMAIL` must not be duplicated in the frontend, then immediately proposed `users.find(u => u.email === "benevolent.system@golightly.local")`, contradicting itself. V02 eliminates this contradiction entirely.

The `isBenevolentOwned` flag on each `AdminMeditation` row is the single source of truth for eligibility display in the UI. The frontend predicate becomes:

```ts
const isEligibleForEdit = (row: AdminMeditation): boolean =>
  row.isBenevolentOwned && row.stage === "library";
```

No email constant appears in frontend code. No cross-reference against the user list is needed. The benevolent user identity is a backend concern resolved at the admin list endpoint.

The admin page no longer needs to derive a benevolent user ID from the user list. The `benevolentUserId` state variable and `users.find(...)` derivation described in V01 §2.9 are removed. The `GET /admin/users` call and the `users` state remain unchanged because they serve the existing user-management UI.

The `isBenevolentOwned?: (meditation: AdminMeditation) => boolean` prop on `TableAdminMeditations` from V01 §2.7 is replaced by a simpler inline check using `row.isBenevolentOwned` directly. This eliminates the prop-drilling of a predicate function.

---

## 3. Files Likely to Change

| File | Change |
|------|--------|
| `api/src/routes/admin.ts` | (a) Explicit serialization in `GET /admin/meditations` including `ownerUserId`, `isBenevolentOwned`, normalized `stage`; (b) New `PATCH /admin/meditations/:id/metadata` handler with field rejection, warn-log guards, and success audit log |
| `shared-types/src/admin.ts` | Add `AdminMeditation` type; update `GetAllAdminMeditationsResponse` to use `AdminMeditation[]`; add `AdminUpdateMeditationMetadataRequest`, `AdminUpdateMeditationMetadataResponse` |
| `shared-types/src/index.ts` | Export `AdminMeditation` and new admin request/response types |
| `web/src/lib/api/admin.ts` | Update `getAdminMeditations` return type to `AdminMeditation[]`; add `adminUpdateMeditationMetadata` helper |
| `web/src/components/tables/TableAdminMeditations.tsx` | Update prop types to use `AdminMeditation`; add optional `onEdit` prop; conditional Edit button based on `row.isBenevolentOwned && row.stage === "library"` |
| `web/src/app/admin/page.tsx` | Update meditation state type to `AdminMeditation[]`; add `meditationEditTarget` state; add save handler; add modal render |
| `web/src/components/modals/ModalAdminEditBenevolentMeditation.tsx` | New component (unchanged from V01) |
| `api/tests/admin/admin.routes.test.ts` | Tests for new endpoint plus updated `GET /admin/meditations` serialization assertions |

No database schema changes. No new Sequelize models. No migration files.

---

## 4. Validation Contract Details (revised)

### 4.1 Field rejection order

The handler applies checks in this order, short-circuiting on the first failure:

1. Parse `id` from path params (non-numeric → 400).
2. Reject unknown body keys (any key outside `title`, `description`, `visibility` → 400 `UNKNOWN_FIELD`).
3. Load meditation or throw 404.
4. Warn-log and throw 409 `BENEVOLENT_OWNER_REQUIRED` if owner mismatch.
5. Warn-log and throw 409 `STAGE_NOT_ELIGIBLE` if stage is not library.
6. Per-field validation (only for fields present in body): `title` non-empty after trim, `visibility` enum check.
7. Apply mutations, save, emit success audit log, return 200.

Unknown-field rejection (step 2) occurs before the database lookup (step 3). This avoids an unnecessary query when a caller is sending an obviously malformed request.

### 4.2 Field rules

Unchanged from V01 §5.2.

### 4.3 Owner and stage checks

Unchanged from V01 §5.3, except that both now emit a warn-level log entry (see §2.2) before throwing.

---

## 5. Compatibility and Non-Regression

All compatibility notes from V01 §6 apply. Additional notes for V02:

- **`GET /admin/meditations` shape change**: existing callers in `web/src/lib/api/admin.ts` and `web/src/app/admin/page.tsx` consume the response through the shared type. Updating `GetAllAdminMeditationsResponse` to `AdminMeditation[]` will surface any type errors in existing frontend code that must be resolved. The `isBenevolentOwned` field is additive; no existing field is removed or renamed, except that `ownerUserId` is now present where it was previously absent at runtime (the declared type already included it as optional). This is a bug fix, not a breaking change.
- **`TableAdminMeditations` prop type**: the existing `meditations: Meditation[]` prop becomes `meditations: AdminMeditation[]`. Because `AdminMeditation` extends `Meditation`, existing render code that accesses `Meditation` fields continues to compile. Any code that passes a plain `Meditation[]` to the table will surface a type error, which is the correct outcome — those callers must be updated to pass the admin-specific type.

---

## 6. Risks and Mitigations

All risks from V01 §7 apply. Additions:

**Risk: `GET /admin/meditations` serialization regression.**
Mitigation: The explicit mapping added in §2.3 mirrors the pattern used by the `/users` handler in the same file. The test file should include assertions on the serialized response shape (presence of `ownerUserId`, `stage`, `isBenevolentOwned`) rather than trusting raw model pass-through.

**Risk: benevolent user `getOrCreateBenevolentUser()` called per admin-list request.**
Mitigation: This is the same idempotent call already made by the user-delete path. At operator scale, one extra DB read per admin-list page load is negligible. If this becomes a concern, the resolved benevolent user ID can be cached in module scope after the first successful resolution, since the email and resulting ID are stable.

**Risk: `isBenevolentOwned` flag drifts from backend authorization.**
Mitigation: Both the `GET /admin/meditations` flag and the `PATCH` endpoint's guard resolve the benevolent user via the same `getOrCreateBenevolentUser()` call. There is no separate constant or hardcoded ID. If the benevolent user is re-created with a new ID (e.g., after a database reset), both the flag and the guard automatically reflect the current ID.

---

## 7. Assumptions

All assumptions from V01 §8 apply, with the following corrections:

- ~~`GET /admin/meditations` returns `ownerUserId`~~ — it currently returns raw Sequelize instances with `userId`. This is fixed in §2.3.
- ~~The UI derives benevolent user ID from the `GET /admin/users` user list~~ — the UI now reads `isBenevolentOwned` from the meditation row directly. No user-list cross-reference is needed for the eligibility predicate.
- `BENEVOLENT_USER_EMAIL` remains a backend-only constant in `api/src/services/users/getOrCreateBenevolentUser.ts`. It is not exported to `shared-types`. The frontend has no reference to it.
