---
created_at: 2026-06-08
updated_at: 2026-06-08
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# Assessment: Benevolent Meditation Editing Plan V01

I found qualifying concerns that should be resolved before implementation.

## 1. Unknown request fields are planned to be silently ignored, but the PRD requires rejection

The plan says unknown keys in the body are silently ignored and states that the PRD allows either ignoring or rejecting unknown fields. The requirements source is stricter in its API requirements: "Reject unknown mutable fields." It also says the endpoint must not allow `userId`, `meditationArray`, `scriptSource`, `sourceMode`, `filename`, `filePath`, `status`, `stage`, `listenCount`, or timestamps in the request body.

This matters because silently ignoring blocked fields can make an invalid or suspicious admin request look successful. That weakens auditability and can hide client bugs or attempted over-posting. The endpoint should reject any key outside `title`, `description`, and `visibility`, or at minimum explicitly reject the blocked mutation fields named by the PRD.

Relevant references:

- Plan: `docs/20260608_BENEVOLENT_EDITING_PLAN_V01.md` lines 43-47
- Requirements source: `/home/nick/NickVault/20260607_golightly04_delegated_editing_benevolent_meditations.md` lines 95-106 and 118-122

## 2. Rejected owner/stage attempts are not currently logged by the error middleware

The plan says no explicit warn-level logging is needed for wrong-owner and wrong-stage attempts because the existing `AppError` pathway already logs at warn in the error middleware. That is not true in the current repository. `api/src/middleware/errorHandler.ts` only logs `AppError` instances when `status >= 500`, and does not warn-log 4xx application errors.

The PRD explicitly requires rejected attempts to be logged at warning level without leaking sensitive data. If the implementation follows the plan as written, successful updates will be audit logged, but rejected owner/stage attempts will not be logged.

Relevant references:

- Plan: `docs/20260608_BENEVOLENT_EDITING_PLAN_V01.md` lines 49-66
- Requirements source: `/home/nick/NickVault/20260607_golightly04_delegated_editing_benevolent_meditations.md` lines 123-130
- Current code: `api/src/middleware/errorHandler.ts` lines 15-18

## 3. The admin meditation list does not currently return the `Meditation` API shape assumed by the UI plan

The plan relies on `GET /admin/meditations` returning rows with `ownerUserId` and normalized `stage`, and says this is confirmed through `mapMeditationRecord`. The current admin route does not use `mapMeditationRecord`; it returns raw Sequelize meditation instances from `Meditation.findAll()`.

This is already visible in the current admin API docs: the sample `GET /admin/meditations` response contains `userId`, not `ownerUserId`. The Sequelize model also declares `userId`, not `ownerUserId`. As a result, the proposed UI predicate `row.ownerUserId === benevolentUser.id` can fail because `ownerUserId` may be absent on admin-list rows. The stage default assumption is also weaker than stated because the mapped API defaulting is not applied by this route.

The plan should either include an API change to map `GET /admin/meditations` through the same public `Meditation` response shape, or update the web/admin shared type and UI predicate to use the actual admin list shape (`userId`) intentionally. Without that correction, the edit action may be hidden for eligible benevolent rows, or TypeScript may mask a runtime shape mismatch.

Relevant references:

- Plan: `docs/20260608_BENEVOLENT_EDITING_PLAN_V01.md` lines 106-115 and assumption near the end that `GET /admin/meditations` returns `ownerUserId`
- Current code: `api/src/routes/admin.ts` lines 78-84
- Current docs: `docs/api-documentation/endpoints/admin.md` `GET /admin/meditations` sample response
- Current model: `node_modules/@golightly/db-models/src/models/Meditation.ts` declares `userId`

## 4. The frontend benevolent-owner lookup duplicates a backend-only constant

The plan correctly says `BENEVOLENT_USER_EMAIL` is a backend constant and should not be duplicated in the frontend, but the admin page wiring then proposes `users.find(u => u.email === "benevolent.system@golightly.local")`. That hardcodes the same identity in web code without moving the constant into a shared package or exposing it through an API response.

This is not a blocker if accepted deliberately, but as written the plan contradicts itself and creates a drift risk between backend authorization and frontend eligibility display. A safer plan would either export a shared constant from `shared-types`, add an admin config/capabilities response, or explicitly document the frontend duplication as an accepted temporary tradeoff.

Relevant reference:

- Plan: `docs/20260608_BENEVOLENT_EDITING_PLAN_V01.md` lines 113 and 137-139
