# AGENTS.md — marketing/

Guidance for agents and engineers working in `marketing/`.

## Purpose

`marketing/` holds the **context and intent** for Go Lightly marketing media — not
the heavy media files themselves. The goal is curated, brand-aligned material:
each flyer (and later, social posts, decks, email headers, etc.) is documented
here so anyone — human or agent — can understand what a piece is for and produce
new versions that stay on-brand.

What lives in this directory (committed to git):

- **Reference markdown** — one document per asset / flyer type, describing the
  goal, audience, and design intent. See the naming convention below.
- **AGENTS.md** — this file.
- **`.env`** — machine-local pointer to the external media store (gitignored).

What does **not** live here: rendered flyers, PDFs, exported images, logo
binaries, and old versions. Those are large and churn often, so committing them
would bloat git history (deleting them later does **not** reclaim space without a
disruptive history rewrite). They live in the external store instead.

## Media storage (external)

The single source of truth for media files and version history is the
**OneDrive-synced folder** referenced by `marketing/.env`. It lives **outside the
repo**, on the machine identified by `DEVICE_NAME`:

- `DEVICE_NAME` — the workstation that holds the media. Currently
  **`NicksMacBookAir.local`**.
- `PATH_TO_MARKETING` — absolute path to the OneDrive `marketing` root.
- `PATH_TO_FLYERS` — `…/marketing/flyers` — flyer HTML sources and exported PDFs.
- `PATH_TO_IMAGES` — `…/marketing/images` — shared image assets (e.g. the logo).
- `PATH_TO_QRCODES` — `…/marketing/qrCodes` — generated QR codes.

External store layout:

```
marketing/                 ← PATH_TO_MARKETING
  flyers/                  ← PATH_TO_FLYERS   (go_lightly_flyer_v0N*.html / .pdf)
  images/                  ← PATH_TO_IMAGES   (golightlyLogo02.png, …)
  qrCodes/                 ← PATH_TO_QRCODES  (go-lightly-qr.png, …)
```

There is no second copy: the previous scratch directory has been removed, so the
OneDrive folder is authoritative. Do not reintroduce a duplicate media folder
inside the repo or elsewhere on disk. When building a flyer, pull the logo from
`PATH_TO_IMAGES` and the QR from `PATH_TO_QRCODES`, and write output to
`PATH_TO_FLYERS`.

`marketing/.env` is gitignored (the root `.gitignore` ignores `.env` in any
directory), because the path is machine-specific. Reference markdown files point
at media using paths **relative to `PATH_TO_FLYERS`** (e.g.
`go_lightly_flyer_v04_wLogo.html`) so they stay valid regardless of where the
store is mounted. Do not repeat the `20260125goLightly/flyers` segment — that is
already part of `PATH_TO_FLYERS`.

If you are an agent running on a different machine, the media files may not be
present locally — rely on the reference markdown for context, and ask before
assuming a path exists.

## Reference markdown convention

- **Filename:** `YYYYMMDD_descriptive_name.md` — date prefix, lowercase,
  underscores for spaces. (This differs from the all-caps `docs/` convention;
  marketing reference docs stay lowercase.)
- **No YAML frontmatter** is required (unlike `docs/`).
- One document may describe a family of related assets, with **one section per
  file/version**. Each section should cover, at minimum:
  - the file path (relative to `PATH_TO_FLYERS`),
  - format and dimensions,
  - status (draft / print-ready / published),
  - **what it is** — the goal, audience, and the action it drives,
  - **design notes** — colors, constraints, gotchas worth preserving.

See `20260606_go_lightly_marketing_flyers.md` for the established pattern and an
entry template.

## Brand alignment

Keep media consistent with the live product. Brand sources of truth in this repo:

- Colors: `web/tailwind.config.js`
- Logo: `web/public/images/golightlyLogo02.png`
- Canonical URL: `go-lightly.love`

When creating a new asset, match these rather than introducing new colors, logos,
or URLs.
