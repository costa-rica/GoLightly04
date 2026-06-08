---
created_at: 2026-06-08
updated_at: 2026-06-08
created_by: claude (sonnet)
modified_by: claude (sonnet)
---

# Benevolent Meditation Editing — Architecture and Implementation Plan V01

## 1. Background and Scope

GoLightly maintains a set of library meditations owned by the system account `benevolent.system@golightly.local` (the "benevolent user"). Hermes/operator needs a durable, audited, safe-to-repeat path for updating the metadata of those meditations — specifically `title`, `description`, and `visibility` — without creating replacement rows, reassigning ownership, touching audio files, or triggering worker jobs.

The current owner-facing `PATCH /meditations/update/:id` already performs in-place metadata updates, and `assertMeditationAccess` already permits an admin to mutate any library row. However, the user-facing endpoint conflates owner edits with admin edits, is not separately audited, and the admin UI lacks any edit action. This plan describes the narrowest safe implementation: a dedicated admin metadata endpoint with hard benevolent-owner and library-stage guards, structured audit logging, and a scoped admin UI edit action.

This plan covers the Option A implementation from the PRD: `requireAdmin` plus hard benevolent-owner check. The boundary functions are designed so that a future Option B (scoped `canEditBenevolentMeditations` permission) can replace only the authorization layer without altering the endpoint contract.

---

## 2. Architecture Overview

### 2.1 New API endpoint

```
PATCH /admin/meditations/:id/metadata
```

Mounted inside `buildAdminRouter()`, which already applies `requireAdmin` to all routes via `router.use(requireAdmin)` at `api/src/routes/admin.ts:14`. No middleware changes are needed to enforce admin-only access.

The handler:
1. Parses `id` from path params.
2. Loads the meditation record or throws `404`.
3. Resolves the benevolent user via `getOrCreateBenevolentUser()` and verifies that `meditation.userId === benevolentUser.id`; otherwise throws `409 BENEVOLENT_OWNER_REQUIRED`.
4. Verifies `(meditation.stage ?? "library") === "library"`; otherwise throws `409 STAGE_NOT_ELIGIBLE`.
5. Validates and normalizes the request body: accepts only `title`, `description`, `visibility`; rejects unknown keys; applies the same normalization rules as the existing `PATCH /meditations/update/:id` handler (trim title, require non-empty, normalize blank description to `null`, validate visibility enum).
6. Captures `previousValues` (title, description, visibility) before mutation.
7. Applies mutations to the Sequelize instance and calls `.save()`.
8. Emits a structured audit log entry at `info` level using the project's existing Winston logger (`api/src/config/logger.ts`).
9. Returns `200` with `{ message, meditation }` shaped identically to the existing update response, including `ownerUserId` and `stage`.

No calls to `notifyWorker`, `deleteMeditationCascade`, `createMeditationFromElements`, `regenerateMeditationFromScript`, or any staging endpoint are made.

### 2.2 Request validation

The body validator will be inlined in the handler rather than delegating to `validateMeditationMetadata` directly, because the admin endpoint differs in one key way: all three fields are optional (a partial update is valid), while `validateMeditationMetadata` requires both `title` and `visibility` to be present. The admin handler validates each field independently only if it is present in the body, matching the existing `PATCH /meditations/update/:id` pattern. Shared helper `ensureString` from `api/src/middleware/validate.ts` is reused for type-coercion checks.

Unknown keys in the body are silently ignored. The PRD allows either ignoring or rejecting unknown fields; silent ignore is consistent with how the existing user-facing update handler works and avoids breaking callers that add forward-compatible fields. No field from the explicitly blocked list (`userId`, `meditationArray`, `scriptSource`, `sourceMode`, `filename`, `filePath`, `status`, `stage`, `listenCount`, timestamps) is ever read from the body.

### 2.3 Audit logging

The project uses Winston (configured in `api/src/config/logger.ts`). The `logger` singleton is already exported and used throughout the API. The audit entry is emitted via `logger.info` with a structured payload:

```ts
logger.info("admin.benevolent_meditation_metadata_update", {
  actorId: req.user!.id,
  actorEmail: req.user!.email,
  actorIsAdmin: req.user!.isAdmin,
  meditationId: meditation.id,
  targetOwnerUserId: meditation.userId,
  targetOwnerEmail: BENEVOLENT_USER_EMAIL,
  previous: { title, description, visibility },
  next: { title, description, visibility },
});
```

Rejected attempts (wrong owner, wrong stage) are thrown as `AppError` and surface through the existing global error handler; no additional warn-level logging is required for these because the `AppError` pathway already logs at warn in the error middleware. The audit entry is only emitted on a successful `.save()`.

### 2.4 Shared-types additions

Two new types are added to `shared-types/src/admin.ts`:

```ts
export type AdminUpdateMeditationMetadataRequest = {
  title?: string;
  description?: string;
  visibility?: MeditationVisibility;
};

export type AdminUpdateMeditationMetadataResponse = {
  message: string;
  meditation: Meditation;
};
```

These are exported from `shared-types/src/index.ts`. They mirror the shape of `UpdateMeditationRequest` / `UpdateMeditationResponse` but are typed separately so the admin and user-facing contracts can diverge in the future without a shared-types conflict.

### 2.5 Web API helper

A new exported function `adminUpdateMeditationMetadata` is added to `web/src/lib/api/admin.ts`:

```ts
export const adminUpdateMeditationMetadata = async (
  id: number,
  data: AdminUpdateMeditationMetadataRequest,
): Promise<AdminUpdateMeditationMetadataResponse> => {
  const response = await apiClient.patch<AdminUpdateMeditationMetadataResponse>(
    `/admin/meditations/${id}/metadata`,
    data,
  );
  return response.data;
};
```

The import types are added to the existing import block. No other helper file changes are required.

### 2.6 UI: eligibility predicate

A meditation row is eligible for admin metadata editing when:
- `row.ownerUserId` matches the benevolent user's numeric ID (available in the admin meditation list response via `ownerUserId`), **or** the UI can compare against a constant benevolent email only if that ID is surfaced. Since `GET /admin/meditations` returns the raw `Meditation[]` shape which includes `ownerUserId` but not owner email, the UI cannot compare by email alone. Two approaches are viable:
  1. The admin page fetches the benevolent user ID once from `GET /admin/users` (already called) and compares `row.ownerUserId === benevolentUser.id`.
  2. The API response for the new endpoint returns the benevolent user's `ownerUserId`, which can seed a constant.

The safe, no-new-endpoint approach: the admin page already calls `getUsers()` on mount and has `users` in state. A helper `isBenevolentOwned(row: Meditation, users: AdminUser[])` finds the user whose email matches `BENEVOLENT_USER_EMAIL` and compares IDs. Because `BENEVOLENT_USER_EMAIL` is a backend constant, it should not be duplicated in the frontend. Instead, the admin page derives the benevolent user ID lazily from the user list on first render and memoizes it. If the user list is empty or the benevolent user is not present, the edit action is hidden.

Additionally, `(row.stage ?? "library") === "library"` must be true. The existing `Meditation` type includes `stage`, so this check costs nothing.

### 2.7 UI: TableAdminMeditations edit action

`TableAdminMeditations` currently accepts `meditations` and `onDelete`. The `onDelete` prop pattern is extended to also accept `onEdit?: (meditation: Meditation) => void` and `isBenevolentOwned?: (meditation: Meditation) => boolean`. When `isBenevolentOwned` returns `true` for a row, a secondary "Edit" button appears next to the "Delete" button using the same styling convention as the existing primary action buttons in admin tables. The edit button is only rendered when `onEdit` is provided and `isBenevolentOwned(row)` is true, so existing callers that do not pass `onEdit` are unaffected.

### 2.8 UI: ModalAdminEditBenevolentMeditation (new modal)

A new modal component handles the admin edit flow:

**File:** `web/src/components/modals/ModalAdminEditBenevolentMeditation.tsx`

Props: `{ isOpen, meditation, onClose, onSave }` where `onSave` is `(id, data) => Promise<void>`.

The modal renders title, description, and visibility fields (same input shapes as `ModalMeditationDetails`). It does **not** render a script field, regenerate button, delete button, or any ownership controls. A prominent label displays "Benevolent system owner" or the owner ID so the operator knows which identity owns the row.

On save, the modal calls `adminUpdateMeditationMetadata` directly rather than delegating through `onSave`, or it can receive `onSave` as a prop — either approach is acceptable. Using `onSave` as a prop keeps the modal reusable and testable in isolation. The parent admin page handles the API call and surfaces success/error via the existing `Toast` component.

### 2.9 Admin page wiring

In `web/src/app/admin/page.tsx`:

1. Add `meditationEditTarget: Meditation | null` state.
2. Derive `benevolentUserId` from the `users` list (memoized, or computed inline when `users` changes): `users.find(u => u.email === "benevolent.system@golightly.local")?.id ?? null`.
3. Pass `isBenevolentOwned` and `onEdit` props to `TableAdminMeditations`.
4. Add a `handleMeditationEditSave` callback that calls `adminUpdateMeditationMetadata`, updates the `meditations` list in state with the returned meditation, and fires a success toast.
5. Render `ModalAdminEditBenevolentMeditation` alongside the existing meditation modals.

The `ModalMeditationDetails` user-facing modal is not modified. The admin edit path is entirely separate.

---

## 3. Files Likely to Change

| File | Change |
|------|--------|
| `api/src/routes/admin.ts` | Add `PATCH /admin/meditations/:id/metadata` handler |
| `shared-types/src/admin.ts` | Add `AdminUpdateMeditationMetadataRequest`, `AdminUpdateMeditationMetadataResponse` |
| `shared-types/src/index.ts` | Export new admin types |
| `web/src/lib/api/admin.ts` | Add `adminUpdateMeditationMetadata` helper |
| `web/src/components/tables/TableAdminMeditations.tsx` | Add optional `onEdit` / `isBenevolentOwned` props and conditional Edit button |
| `web/src/app/admin/page.tsx` | Wire benevolent user ID derivation, edit state, modal, and save handler |
| `web/src/components/modals/ModalAdminEditBenevolentMeditation.tsx` | New component (admin-only edit modal) |
| `api/tests/admin/admin.routes.test.ts` | Add tests for the new endpoint |

No database schema changes. No new Sequelize models. No migration files.

---

## 4. Implementation Flow

**Step 1 — Shared types.** Add and export the two new admin types. Build `shared-types` to confirm no type errors before any other package is modified.

**Step 2 — API endpoint.** In `buildAdminRouter`, add the `PATCH /admin/meditations/:id/metadata` handler after the existing `delete` handler. Import `BENEVOLENT_USER_EMAIL` and `getOrCreateBenevolentUser` (already imported in admin.ts for user-delete logic). Import `logger` from `api/src/config/logger.ts`. Import `ensureString` from the validate middleware. No new service files are required; the handler is self-contained at ~50 lines.

**Step 3 — API tests.** Add a new `describe` block in `api/tests/admin/admin.routes.test.ts` following the existing mock pattern (jest mocks for `getDb`, `deleteMeditationCascade`, `notifyWorker`). Add mock for `getOrCreateBenevolentUser` and for `logger` (to assert audit log calls without file I/O). Cover: admin success, non-admin 403, missing meditation 404, non-benevolent-owned 409, non-library stage 409, invalid visibility 400, empty title 400, update does not call `notifyWorker`, audit logger called on success.

**Step 4 — Web API helper.** Add the function to `web/src/lib/api/admin.ts`. No new file needed.

**Step 5 — New modal component.** Create `ModalAdminEditBenevolentMeditation.tsx`. Follow the structure of `ModalEditSoundFile` (simpler modal) or `ModalMeditationDetails` (richer) as a style reference. Render title input, description textarea, visibility select. Include a read-only owner identity indicator. No script or audio controls.

**Step 6 — TableAdminMeditations.** Extend props interface. Add the conditional Edit column cell. Keep the Delete column unchanged.

**Step 7 — Admin page wiring.** Add state, derive benevolent user ID, pass props, add modal, add save handler.

**Step 8 — Integration smoke-test.** Run the API server locally and confirm the new endpoint responds correctly with an admin token and a benevolent-owned library meditation. Run existing test suite to confirm no regressions.

---

## 5. Validation Contract Details

### 5.1 Request body

All three fields are optional; at least one must be present for the operation to be meaningful, but the endpoint does not enforce this — an empty update is a no-op and returns 200 with the unchanged meditation. This matches REST PATCH semantics and avoids unnecessary coupling.

### 5.2 Field rules (matching existing `PATCH /meditations/update/:id` behavior)

| Field | Rule |
|-------|------|
| `title` | `ensureString`; trim; require non-empty after trim → 400 |
| `description` | `ensureString`; trim; blank or omitted → `null` |
| `visibility` | Must be `"public"` or `"private"` → 400 if other value |

### 5.3 Owner and stage checks

Both checks use server-resolved data, never client-supplied values. The benevolent user ID is resolved fresh per request via `getOrCreateBenevolentUser()`, which is idempotent (findOrCreate). This is consistent with how the user-delete path in the existing admin routes resolves the benevolent user at request time.

The stage check uses `(meditation.stage ?? "library") === "library"` to match the null-coalescing convention used throughout the codebase. Template and staged meditations return 409.

---

## 6. Compatibility and Non-Regression

- `PATCH /meditations/update/:id`: no changes; the user-facing update path is not touched.
- `assertMeditationAccess`: no changes; the admin metadata endpoint does not call it. The new endpoint has its own explicit guards which are more restrictive (benevolent-only) than `assertMeditationAccess` (any admin, any library meditation). This is intentional.
- `assertAdminMeditationMutable`: not used by the new endpoint; that helper protects template meditations from delete/requeue. The new endpoint independently checks for the library stage and would refuse a template anyway.
- `GET /admin/meditations`: no changes; already returns all library meditations with `ownerUserId` and `stage`, which is sufficient to identify eligible rows in the UI.
- `GET /meditations/all`: no changes.
- `TableAdminMeditations`: the new props (`onEdit`, `isBenevolentOwned`) are optional, so the existing render call in `admin/page.tsx` continues to compile and render correctly until it is updated. A strict TypeScript build will not break because the props are optional.
- `ModalMeditationDetails`: no changes; the admin edit modal is a separate component.
- `meditationSlice` Redux state: the existing `Meditation` type already includes `stage` and `ownerUserId`, so no Redux changes are needed.

---

## 7. Risks and Mitigations

**Risk: benevolent user not yet created in the database.**
Mitigation: `getOrCreateBenevolentUser()` is idempotent. If the user does not exist, it is created; if it exists, the existing record is returned. The admin user-delete path already relies on this behavior. No risk of a null-pointer scenario.

**Risk: admin accidentally edits a non-benevolent meditation via the UI.**
Mitigation: The `isBenevolentOwned` predicate in the table ensures the Edit button is not rendered for non-eligible rows. The API independently enforces the benevolent-owner check and returns 409 even if the UI were bypassed. Defense in depth: both layers enforce the constraint.

**Risk: two concurrent admin edits race on the same meditation row.**
Mitigation: Sequelize `.save()` on an instance uses optimistic `UPDATE … WHERE id = ?`. The last writer wins, which is acceptable for metadata-only edits. No row-level locking is required. The audit log will show both writes with timestamps, providing after-the-fact visibility. This risk is low in practice given operator-scale usage.

**Risk: title or description validation behaves differently from user-facing endpoint.**
Mitigation: The same `ensureString` helper and the same null-coalescing logic are used. The only intentional behavioral difference is that all three fields are optional (partial update), which is the correct REST PATCH behavior.

**Risk: logging too much / exposing sensitive data in audit log.**
Mitigation: The audit log entry contains only IDs, email addresses, and metadata field values. It does not contain `meditationArray`, `scriptSource`, `filePath`, `filename`, or audio data. The email addresses logged (`BENEVOLENT_USER_EMAIL` as a constant, and actor email from the verified JWT payload) are not user-supplied and cannot be injected by a caller.

**Risk: shared-types package version mismatch between API and web.**
Mitigation: Both packages reference shared-types as a workspace dependency. Adding new exported types is additive and does not break existing consumers. The new types are only consumed by the new helper and the new modal, neither of which is referenced until Step 7 wires the admin page.

---

## 8. Assumptions

- Hermes/operator already holds a user account with `isAdmin = true`. No new user roles, permission columns, or migrations are required.
- The benevolent user email `benevolent.system@golightly.local` is stable; it is a codebase constant in `getOrCreateBenevolentUser.ts` and is not configurable at runtime.
- The existing `logger` singleton in `api/src/config/logger.ts` is the correct target for audit logging. No separate audit log transport is required; the audit entry is distinguishable by its `message` key `"admin.benevolent_meditation_metadata_update"`.
- Stage `"library"` is the only eligible stage for this endpoint. Template edits are out of scope and carry separate template-protection behavior. Staged meditations are also out of scope.
- The `GET /admin/meditations` response already returns `ownerUserId` (confirmed: the `mapMeditationRecord` function in `meditations.ts` includes `ownerUserId: meditation.userId` and this is the shape used by `GetAllAdminMeditationsResponse`). No changes to the admin list endpoint are needed.
- The admin page fetches users on mount (`fetchUsers` in `useEffect`) and holds them in `users` state. The benevolent user will appear in this list. This makes it safe to derive the benevolent user ID from the already-fetched user list without an additional API call.
- The `Meditation` shared type's `stage` field defaults to `"library"` when null at the API mapping layer (`stage: meditation.stage ?? "library"`). UI code that checks `row.stage === "library"` will work correctly for rows where the DB value is null, because the mapping normalizes it before it reaches the frontend.
- Test mocking follows the pattern in `api/tests/admin/admin.routes.test.ts`: jest mocks for `getDb`, `deleteMeditationCascade`, `notifyWorker`, and (new) `getOrCreateBenevolentUser`. The logger is mocked to a no-op for test isolation.
