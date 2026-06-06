# Go Lightly — Marketing Material Reference

A living document describing marketing assets. Add a new section per file.

## Flyer v04 (with logo)

- File: `go_lightly_flyer_v04_wLogo.html` (relative to `PATH_TO_FLYERS`)
- Format: single-page HTML flyer (8.5in x 11in), white low-ink print theme
- Status: print-ready (PDF export)

### What it is
A one-page flyer for the Go Lightly meditation platform. It works as a dual-purpose piece:

1. Sharing the app: it presents the Go Lightly logo, the tagline for free lightly-guided meditations, a QR code, and the `go-lightly.love` URL so anyone can scan and try it immediately.
2. Asking for advice: a highlighted call-out invites coaches, therapists, and yoga and meditation teachers to help shape what the platform becomes, with Nick's email and phone for direct contact.

So the top half does outreach to end users, while the bottom call-out does practitioner discovery and feedback gathering.

### Design notes
- White background, dark green and amber accents chosen to minimize ink.
- Logo renders correctly in PDF (no CSS image filters, which can drop images on export).

---

## Flyer v05 (quarter-page, 4-up)

- File: `go_lightly_flyer_v05.html` (relative to `PATH_TO_FLYERS`)
- Format: portrait 8.5in x 11in sheet holding a 2x2 grid of four identical
  quarter-page cards (4.25in x 5.5in each); white low-ink print theme
- Status: print-ready (PDF export `go_lightly_flyer_v05.pdf`)

### What it is
A space-efficient version of v04: four flyers per sheet so one print yields four
hand-outs. Cut along the dashed guides into four 4.25in x 5.5in portrait flyers.
Each card carries the same dual-purpose message as v04 — logo, "free,
lightly-guided meditations" headline, QR to `go-lightly.love`, and the
practitioner call-out with Nick's contact — at roughly half the linear scale.

### Design notes
- Same brand palette and fonts (Fraunces / Hanken Grotesk) as v04.
- Built from `images/golightlyLogo02.png` and `qrCodes/go-lightly-qr.png`.
- Each embedded image is declared once as a CSS background and reused by all four
  cards, so the file stays ~560 KB instead of carrying four copies.
- `@page size:8.5in 11in; margin:0` with a CSS grid of exact 4.25in x 5.5in cells,
  so the four cards tile the sheet edge-to-edge with faint dashed cut guides.

---

<!-- Template for new entries:

## [Asset name]

- File: `path/to/file`
- Format:
- Status:

### What it is

### Design notes

-->
