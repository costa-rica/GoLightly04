---
created_at: 2026-06-10
updated_at: 2026-06-10
created_by: nick
modified_by: nick
---

# PRD: Responsive Hamburger Navigation Menu

## Overview

Replace the current top-right navigation actions with a hamburger menu that opens a slide-out sidebar. The goal is to create a cleaner, more scalable navigation pattern that works consistently for guests, authenticated users, and administrators.

This change should improve visual consistency, reduce navbar clutter, and provide a clear location for future navigation items.

---

## Goals

### Primary Goals

- Simplify the top navigation bar.
- Support guest, authenticated, and admin user experiences.
- Create a scalable navigation pattern for future features.
- Improve consistency by using icon + label navigation items.
- Move theme controls into the sidebar as an inline toggle.

### Non-Goals

- No changes to authentication behavior.
- No changes to user permissions.
- No redesign of the logo or branding.
- No changes to page routing beyond adding the About Us page link.

---

## Navigation Bar Design

### Desktop

Navbar should contain:

- Go Lightly logo (left)
- Hamburger menu button (right)

Remove the following from the navbar:

- Admin link
- Theme toggle
- Profile icon
- Logout button

These actions will live inside the sidebar.

### Mobile

Use the exact same navigation pattern.

---

## Sidebar Behavior

### Open

- Opens from the right side of the screen.
- Slides in with animation.
- Backdrop overlay appears behind sidebar.
- Clicking backdrop closes sidebar.
- Pressing Escape closes sidebar.

### Close

- Close button at top of sidebar.
- Clicking outside closes sidebar.
- Escape key closes sidebar.

---

## Navigation Item Style

### Use Icon + Label

Every menu item should use:

- Icon
- Text label

Examples:

- Profile
- About Us
- Admin
- Logout

Avoid:

- Mixed icon-only and text-only navigation
- Different visual treatment between menu items

### Consistency Requirements

All navigation rows should:

- Use the same height
- Use the same spacing
- Use the same icon alignment
- Have hover and focus states
- Be keyboard accessible

---

## Theme Control

Theme should not be a navigation link.

Instead create an inline control.

Example layout:

Theme

[ Light ○────● Dark ]

Requirements:

- Toggle updates theme immediately.
- Persist theme preference using existing theme storage mechanism.
- Control should visually match other menu rows.
- Include accessible labels.

---

# Sidebar Content

## Authenticated User

Display menu items in the following order:

1. Profile
2. Theme Toggle
3. About Us

Divider

4. Logout

Visual representation:

```text
Profile
Theme
About Us
----------------
Logout
```

---

## Administrator

Display menu items in the following order:

1. Profile
2. Theme Toggle
3. About Us

Divider

4. Admin

Divider

5. Logout

Visual representation:

```text
Profile
Theme
About Us
----------------
Admin
----------------
Logout
```

---

## Guest User

Display menu items in the following order:

1. About Us
2. Theme Toggle

Divider

3. Login

Visual representation:

```text
About Us
Theme
----------------
Login
```

---

## About Us Page

Add navigation support for an About Us page.

Requirements:

- Accessible without authentication.
- Accessible from guest navigation.
- Accessible from authenticated navigation.
- Accessible from admin navigation.

Routing should follow existing application conventions.

---

## Accessibility Requirements

### Keyboard Support

- Tab navigation supported.
- Enter activates items.
- Escape closes sidebar.
- Focus should move into sidebar when opened.
- Focus should return to hamburger button when closed.

### Screen Readers

- Hamburger button must have aria-label.
- Sidebar must have appropriate navigation role.
- Theme toggle must have accessible label.
- Menu items must expose meaningful text labels.

---

## Visual Design Requirements

### Sidebar Width

Recommended:

- Desktop: 320px
- Mobile: 85% width with reasonable max-width

### Spacing

- Generous vertical spacing
- Clear section grouping
- Consistent padding throughout

### Animation

- Smooth slide-in animation
- Duration approximately 200–300ms
- Respect reduced-motion preferences

---

## Acceptance Criteria

### General

- Hamburger menu replaces current top-right actions.
- Sidebar opens and closes correctly.
- Sidebar is responsive.

### Authenticated Users

- See Profile.
- See Theme toggle.
- See About Us.
- See Logout.
- Do not see Admin.

### Administrators

- See Profile.
- See Theme toggle.
- See About Us.
- See Admin.
- See Logout.

### Guests

- See About Us.
- See Theme toggle.
- See Login.
- Do not see Profile.
- Do not see Admin.
- Do not see Logout.

### Theme

- Theme toggle works immediately.
- Theme preference persists between sessions.

### Accessibility

- Keyboard navigation works.
- Escape closes sidebar.
- Focus management functions correctly.
- Screen reader labels are present.
