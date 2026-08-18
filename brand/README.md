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
`brand/store/out/edge-store-logo-300.png`, and the Safari app icon set when
`../safari/` is present. Requires `rsvg-convert` (`brew install librsvg`).

Check any icon change at 16px on both a light and a dark toolbar before shipping — that
is the size that kills detail, and it is why the mark has no interior linework.

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
