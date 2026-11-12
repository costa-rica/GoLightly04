---
created_at: 2026-11-12T22:55:15Z
updated_at: 2026-11-12T22:55:32Z
created_by: codex (gpt-6) nicksmacbookair
modified_by: codex (gpt-6) nicksmacbookair
---

# Assessment: Admin page breakout plan v01

## Outcome

- Reviewed `docs/20261112_admin_breakout_plan_v01.md` against its source PRD and the current admin page, access guard, application shell, tables, and navigation.
- One concern meets the plan-and-vet criterion of risk to existing functionality.
- Recommend revising the plan before creating the phased todo list.

## 1. Keep expanded navigation reachable

- Priority: P2.
- Plan references: Sidebar Admin group, lines 172–181; Verification, lines 210–215.
- The plan adds five submenu links using `menuRowClass` and preserves body scroll lock, but does not provide scrolling inside the sidebar.

Evidence from the current implementation:

1. `web/src/components/Navigation.tsx:202` locks body scrolling while the menu is open.
2. `web/src/components/Navigation.tsx:303` gives the sidebar the viewport height through its fixed parent and `h-full`, without vertical overflow handling.
3. `web/src/components/Navigation.tsx:347` renders the navigation without a scrollable region.
4. `menuRowClass` gives each link a minimum height of three rem. Logout follows the Admin group at line 381.

Expected failure:

- Expanding the group adds at least fifteen rem of link height before spacing. On short phone screens or landscape viewports, lower admin links and the existing Logout button can extend below the viewport.
- With neither a sidebar scroll region nor body scrolling, those controls can become unreachable by touch or pointer. This is inferred from the layout; no browser reproduction was performed.

Recommended revision:

1. Require vertical scrolling within the sidebar when its contents exceed the available height. A scrollable navigation region can use `min-h-0`, `overflow-y-auto`, and appropriate flex sizing while keeping the header accessible.
2. Preserve Escape handling, focus return, and body scroll lock.
3. Verify the expanded group at a short viewport, such as 375 × 568, and in landscape. Confirm every admin link and Logout can be reached by scrolling and keyboard navigation.

## Next step

- The planner should address this concern in a new plan version.
- After the plan passes assessment, a phased todo list remains necessary for the five-page extraction and shared navigation changes.
