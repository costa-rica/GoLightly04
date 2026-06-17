---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Plan: Admin page split + meditation taxonomy (PRD 3)

## Overview

Two related admin-facing changes:

1. **Admin page split** — break the single `/admin` monolith
   (`web/src/app/admin/page.tsx`, ~1080 lines, five expandable sections) into
   per-feature pages, and replace the single sidebar "Admin" link with an
   expandable Admin section that links to each page.
2. **Meditation taxonomy** — introduce an admin-managed vocabulary of meditation
   `type` and `subtype` values, let admins assign a `type`/`subtype` to any
   meditation, and add an admin page to add/remove/edit the vocabulary.

This is the third of three PRDs:

- **PRD 1** — usernames + meditation API
  ([20260616_prd1_usernames_plan_v01.md](20260616_prd1_usernames_plan_v01.md)).
- **PRD 2** — home meditation table modernization
  ([20260616_prd2_meditation_tables_plan_v01.md](20260616_prd2_meditation_tables_plan_v01.md)).
- **PRD 3 (this plan)** — admin split + taxonomy.

Affected packages: `db-models`, `api`, `shared-types`, `web`. Largely
independent of PRD 1/2; the only coupling is that the modernized table component
from PRD 2 (`DataTable`) is the natural base for the per-page admin tables, and
admin meditation rows may show a `type` column.

### Operator-confirmed decisions

- `type`/`subtype` are a **predefined, admin-editable set** (not free text).
- Assigning `type`/`subtype` to meditations is **admin-only for now** — it does
  NOT appear in the user-facing edit modal (`ModalMeditationDetails`).
- Seed `type` values: `sounds`, `guided`, `affirmations`, `guided-beginner`.
  `subtype` vocabulary starts **empty** but the structure must support it.

### In scope

- Per-feature admin routes + sidebar Admin dropdown/expandable section.
- Taxonomy vocabulary storage (`db-models` + migration, seeded types).
- Admin CRUD API for taxonomy + assignment of `type`/`subtype` on meditations.
- Admin taxonomy management page (add/remove/edit types and subtypes).
- `type`/`subtype` columns + edit controls in the admin meditations table/modal.

### Out of scope

- User-facing assignment or display of `type`/`subtype`.
- Showing `type`/`subtype` on the home `TableMeditation` (PRD 2 explicitly omits
  it).
- Filtering/browsing the public library by type (future).

---

## Part A — Admin page split

### Current state

`web/src/app/admin/page.tsx` holds all state, fetches, handlers, and modals for
five sections rendered as collapsible panels: **Users**, **Sound Files**,
**Meditations**, **Jobs Queue**, **Database**. The sidebar
(`web/src/components/Navigation.tsx`) links to a single `/admin` (admin-only,
already gated by `user?.isAdmin`).

### Approach

- Create a route per feature under `web/src/app/admin/`:
  - `/admin/users`, `/admin/sounds`, `/admin/meditations`, `/admin/queue`,
    `/admin/database`, plus `/admin/taxonomy` (Part B).
  - Decide the `/admin` index behavior: redirect to `/admin/users` or render a
    small landing/overview (open decision).
- Each page wraps `ProtectedRoute requireAdmin` and owns only its own section's
  state/fetch/handlers/modals — extracted verbatim from the monolith to keep
  behavior identical. Shared header/shell can move to an `admin/layout.tsx`.
- Sidebar: replace the single Admin `MenuLink` with an **expandable Admin
  group** (disclosure) listing the sub-pages, shown only when `user?.isAdmin`.
  Follow the existing `MenuLink`/`menuRowClass` styling and `closeMenu()`
  pattern; reuse the chevron pattern already in `Navigation`/admin sections.

### Notes

- This is primarily a mechanical decomposition; the risk is dropping behavior
  (modals, toasts, polling, loading/error states) during extraction.
- Admin tables already use the shared TanStack table; once PRD 2 lands they
  should consume `DataTable`. If PRD 3 is built before PRD 2, keep `AdminTable`
  and migrate later — no hard dependency.

---

## Part B — Meditation taxonomy

### Data model (`db-models`)

Goal: a managed vocabulary that is editable over time, with `subtype` optionally
related to `type`, and meditations referencing chosen values.

**Vocabulary storage** — proposed: two tables (open decision vs. a single
self-referencing table):

- `meditation_types` — `id`, `name` (unique), `created_at`, `updated_at`.
- `meditation_subtypes` — `id`, `name`, `type_id` (FK → `meditation_types`,
  nullable to allow standalone subtypes), unique on (`type_id`, `name`),
  timestamps.

**Meditation columns** — add nullable `type` and `subtype` to `meditations`.
Open decision on representation:

- (a) Foreign keys `type_id` / `subtype_id` referencing the vocabulary tables
  (referential integrity; renames propagate), or
- (b) plain nullable strings validated against the vocabulary at write time
  (simpler payloads; matches how `visibility`/`stage` are stored).

Recommendation: **(a) FK columns** for integrity, exposed in the API as
resolved `type`/`subtype` name strings so the web payload stays simple. Flagged
for assessment.

**Migration** `db-models/migrations/20260616_add_meditation_taxonomy.sql`:

- create the two vocabulary tables,
- seed `meditation_types` with `sounds`, `guided`, `affirmations`,
  `guided-beginner`,
- add nullable `type`/`subtype` (or `type_id`/`subtype_id`) to `meditations`.

Models: new `MeditationType` / `MeditationSubtype` in `db-models/src/models`,
associations in `associations.ts`, plus the new attributes on `Meditation.ts`.

### shared-types

- New `MeditationType` / `MeditationSubtype` types and CRUD request/response
  shapes.
- Add `type?: string | null` and `subtype?: string | null` to `Meditation`.
- Extend `AdminUpdateMeditationMetadataRequest` (in `shared-types/src/admin.ts`)
  to accept `type`/`subtype`.

### API (`api`)

- New admin taxonomy router (e.g. `api/src/routes/admin` taxonomy endpoints):
  `GET /admin/taxonomy` (list types + subtypes), `POST`/`PATCH`/`DELETE` for
  types and subtypes. Admin-guarded like existing admin routes. Deleting a value
  in use is an open decision (block vs. null out references).
- Extend the existing admin meditation metadata update
  (`PATCH /admin/meditations/:id/metadata`, currently limited to
  `ADMIN_MEDITATION_METADATA_FIELDS = ["title","description","visibility"]`) to
  accept and validate `type`/`subtype` against the vocabulary.
- Serialize `type`/`subtype` (resolved names) in `mapMeditationRecord` and the
  admin meditation serializer.

### Web (`web`)

- **Taxonomy management page** `/admin/taxonomy`: list current types/subtypes
  with add/edit/delete controls (a simple form + table). New API wrappers in
  `web/src/lib/api/admin.ts`.
- **Admin meditations**: add a `type` (and `subtype`) column to
  `TableAdminMeditations`, and add `type`/`subtype` selects (sourced from the
  vocabulary) to `ModalEditAdminMeditation`, wired through the extended metadata
  update. The admin meditations table already sorts/searches via the shared
  table.

## Key files

| File | Change |
| --- | --- |
| `db-models/migrations/20260616_add_meditation_taxonomy.sql` | vocabulary tables + seed + meditation columns |
| `db-models/src/models/MeditationType.ts`, `MeditationSubtype.ts` | new models |
| `db-models/src/models/Meditation.ts`, `associations.ts` | new columns + associations |
| `shared-types/src/meditation.ts`, `admin.ts` | taxonomy types; `type`/`subtype`; extend admin update req |
| `api/src/routes/admin.ts` (+ services) | taxonomy CRUD; extend metadata fields/validation |
| `api/src/routes/meditations.ts` | serialize `type`/`subtype` |
| `web/src/app/admin/{users,sounds,meditations,queue,database,taxonomy}/page.tsx` | split pages + new taxonomy page |
| `web/src/app/admin/layout.tsx` | shared admin shell (optional) |
| `web/src/components/Navigation.tsx` | expandable Admin section |
| `web/src/components/tables/TableAdminMeditations.tsx` | `type`/`subtype` column |
| `web/src/components/modals/ModalEditAdminMeditation.tsx` | `type`/`subtype` selects |
| `web/src/lib/api/admin.ts` | taxonomy + extended metadata wrappers |

## Risks / edge cases

- **Behavior loss during split**: the monolith's modals, toasts, polling, and
  loading/error states must survive extraction — highest risk in Part A.
- **Deleting in-use taxonomy values**: must define behavior (block deletion vs.
  set referencing meditations' value to null). Recommend block-with-message.
- **FK vs. string** choice affects migrations, validation, and serialization —
  settle before the todo.
- **Seed idempotency**: seeding types must be safe to re-run (`ON CONFLICT DO
  NOTHING` on unique `name`).
- **Sidebar UX**: the expandable Admin group must remain keyboard accessible and
  match the existing sidebar focus/close behavior.

## Open decisions for the operator

1. `type`/`subtype` as FK columns (recommended) vs. validated strings.
2. Vocabulary storage: two tables (recommended) vs. one self-referencing table.
3. `/admin` index: redirect to first sub-page vs. overview landing page.
4. Deleting a taxonomy value that is in use: block vs. null-out.
5. Subtype model: standalone vs. always parented to a type.

## Verification (per phase, during the todo)

- `shared-types`: build.
- `db-models`: run migration on dev DB + smoke; confirm seeded types and
  nullable meditation columns.
- `api`: `npm test` (taxonomy CRUD, admin metadata accepts/validates
  `type`/`subtype`, serialization).
- `web`: lint + typecheck + build; manual: each split admin page works as before,
  sidebar Admin expansion navigates correctly, taxonomy page add/edit/delete,
  admin can assign type/subtype to a meditation and see it persist.
