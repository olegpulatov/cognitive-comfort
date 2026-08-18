# Brand assets

Everything here is a source or a generator input. Nothing rendered into
`brand/icon/*.png`, `brand/store/captures/`, or `brand/store/out/` is edited by hand —
regenerate instead.

## Icon

| File | Role |
| --- | --- |
| `icon/icon.svg` | Master for browser toolbar and store icons. 128-unit grid on an 8-unit rhythm, so 16px lands on whole pixels. |
| `icon/icon-macos.svg` | Same mark on Apple's 1024 canvas for the Safari containing app, which is not masked by the OS. |
| `icon/icon-mono.svg` | Single-colour variant driven by `currentColor` for template, print, and docs use. |

The mark is four media cells on an ink-umber plate: three stay quieted, the fourth is
revealed in parchment with its form crisp. Nothing removed, one thing shown. Colours are
the shipped panel world (`src/entrypoints/shared/panel.css`): ground `#14110e`, dimmed
brass `#54462f`, parchment `#eee6d8`, rule `#332c23`.

```fish
just icons   # or: bash scripts/generate-icons.sh
```

That writes `public/icon-{16,32,48,96,128}.png`, `brand/icon/icon-1024.png`,
`brand/store/out/edge-store-logo-300.png`, and — when `safari/` exists, which
`scripts/prepare-safari.sh` creates and `.gitignore` excludes — the Safari containing-app
icon set. Requires `rsvg-convert` (`brew install librsvg`).

Check any icon change at 16px on both a light and a dark toolbar before shipping — that
is the size that kills detail, and it is why the mark has no interior linework.

### Which file to hand to which surface

There is one mark and three masters; you never choose between designs, only between
canvases. Everything below comes from `just icons` — do not upload a file you resized
by hand.

| Where | Upload / reference | Why this one |
| --- | --- | --- |
| Extension manifest, every Chromium browser and Firefox | `public/icon-{16,32,48,96,128}.png` | Already wired in `wxt.config.ts`; nothing to do but rebuild. |
| Chrome Web Store listing icon | `public/icon-128.png` | The store's required 128×128. |
| Chrome Web Store promo tile / marquee | `brand/store/out/chrome-tile-440x280.png`, `chrome-marquee-1400x560.png` | Composed art, not the bare icon. |
| Edge Add-ons store logo | `brand/store/out/edge-store-logo-300.png` | Edge asks for 300×300. |
| Firefox AMO listing icon | `brand/icon/icon.svg` | AMO accepts SVG; give it the vector so it stays sharp at every size AMO renders. |
| Safari containing app, App Store | generated Safari icon set from `brand/icon/icon-macos.svg` | Apple does not mask app icons, so the plate is inset on Apple's 1024 grid. |
| README, docs, a site favicon | `brand/icon/icon.svg` | Vector, ships with the repo. |
| One-colour contexts: print, a template toolbar, an inline docs mark | `brand/icon/icon-mono.svg` | Inherits `currentColor`. |

## What lives here, and what stays private

This directory is public on purpose: masters, the demonstration page, the copy, and the
generators. Anything that is an account, a credential, a listing draft, a business
decision, or a superseded experiment belongs in the private parent repository instead —
including the old `../product/screenshots*/` sets, which must never ship.

The line is simple: if a contributor needs it to rebuild an asset, it is here; if only the
publisher needs it to submit one, it is private.

## Store assets

Three inputs, one output directory, no hand-composited art:

1. `store/demo/` — a media-dense demonstration page (`The Marginalia Review`). Our prose,
   our generated photographs in `store/demo/media/`, and a canvas "player" painted in the
   page. No third-party interface or imagery appears in any capture.
2. `store/captures/` — generated. `scripts/capture-shots.mjs` builds the extension, runs it
   in a real Chromium profile, serves the demo page over a routed `https://example.com/`
   URL, and captures the demo page (hidden and revealed), three popup states, and the
   options page. `manifest.json` records sizes and the one documented harness detail: the
   popup's active-tab lookup is pinned to the demo URL because a scripted tab render is
   always its own active tab. Settings, rules, ledger text, and stamps are real.
3. `store/copy.json` — every asset's store target, size, headline, caption, and capture.
   This is the only place words live.

```fish
just captures        # refresh store/captures/ from the built extension
just store-assets    # compose store/out/ from copy.json
just brand           # icons, captures, store assets
```

`scripts/render-store-assets.mjs` renders `store/templates/asset.html` once per asset at
exact store pixel dimensions. Filter while iterating: `just store-assets marquee shot-2`.

Copy rules that are not negotiable, from `PRODUCT.md`:

- No store-availability badges or claims until a listing is verified live.
- No medical, therapeutic, neurodivergence, or productivity-outcome claims.
- No privacy absolutes. "Settings and overrides stay in browser-local storage" is the claim
  the evidence supports.
- Captions must describe what the capture actually shows.
