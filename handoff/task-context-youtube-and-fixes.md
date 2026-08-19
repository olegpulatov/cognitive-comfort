# Task Context: Multi-Layer Stacking, Safari/WebKit Fixes & Follow-ups

Updated 2026-08-19.

## 1. Problem Description & Root Causes

- **Platform**: macOS Safari Web Extension + WebKit rendering engine.
- **Original Symptoms**: On YouTube and media-heavy card grids, hovering over cards caused flashing/blinking where thumbnails unblurred and re-blurred as preview players or overlays mounted under the stationary cursor. Additionally, hovering one Short revealed all sibling shorts in the carousel.
- **Root Causes**:
  1. **WebKit CSS Cascade Specificity Bug**: Base blur rule and reveal rule both used `!important`. In WebKit, the base rule won in the cascade even after `data-comfort-revealed="true"` was set.
  2. **Multi-Layer Occlusion**: Content script checked `event.target` and direct ancestors, missing `<video>` or background images under transparent scrims/overlays.
  3. **Container Traversal Overshoot**: `findClusterContainer` walked up past individual cards into multi-card shelf containers (`<ytd-reel-shelf-renderer>`, `<div id="items">`, or generic `<main>`/`<section>`), sweeping all sibling thumbnails into the revealed cluster.
  4. **Transient Node Swapping**: When players replace thumbnails, transient 0x0 bounding boxes or node detachment previously dropped hover state.

---

## 2. Solutions Implemented

### A. WebKit CSS Cascade Specificity Fix (`src/entrypoints/comfort.content/styles.ts`)
- Added `:not([data-comfort-revealed="true"])` to all base blur selectors in `generateStyles()`.
- Added `cursor: pointer !important;` to base blur rules for instant reveal affordance discovery without visual DOM wrappers.
- When `data-comfort-revealed="true"` is set, the base rule immediately ceases to match, resolving computed filter to `blur(0px) brightness(1)`.

### B. Generic Multi-Layer Coordinate Penetration (`src/entrypoints/comfort.content/click-handler.ts`)
- `document.elementsFromPoint(x, y)` and shadow root coordinate queries inspect the complete visual stack under the pointer.
- `findRevealTarget()` and `collectRevealCluster()` query bounded card/player containers to discover all media under scrims or overlay controls.

### C. Generic Semantic Container Boundaries (`src/entrypoints/comfort.content/click-handler.ts`)
- `CARD_BOUNDARY_TAGS` includes: `ARTICLE`, `LI`, `FIGURE`, `YTD-REEL-ITEM-RENDERER`, `YTD-RICH-ITEM-RENDERER`, `YTD-VIDEO-RENDERER`, `YTD-GRID-VIDEO-RENDERER`, `YTD-COMPACT-VIDEO-RENDERER`, `YTD-PLAYLIST-RENDERER`, `YTD-RADIO-RENDERER`, `YTD-CHANNEL-RENDERER`, `YTD-POST-RENDERER`, `YTD-THUMBNAIL`.
- `EXCLUDED_CONTAINER_TAGS` includes: `HTML`, `BODY`, `HEAD`, `MAIN`, `HEADER`, `FOOTER`, `NAV`, `YTD-REEL-SHELF-RENDERER`, `YTD-RICH-SHELF-RENDERER`, `YTD-SHELF-RENDERER`, `YTD-RICH-GRID-RENDERER`, `YTD-GRID-RENDERER`, `YTD-EXPANDED-SHELF-CONTENTS-RENDERER`, `YTD-HORIZONTAL-CARD-LIST-RENDERER`, `YTD-VERTICAL-LIST-RENDERER`.
- Container traversal stops at card boundaries, isolating hover reveal to the hovered item only.

### D. Transient Node Swapping & Add-Only Reconciliation (`src/entrypoints/comfort.content/click-handler.ts`)
- Mutation observer triggers `reconcileAtPointer()`, performing an add-only union (`mergeHoverCluster`) when new media nodes mount under the stationary pointer.
- `clearHoverIfCursorLeft()` checks whether pointer remains inside existing hover bounding box before dropping reveal state.
- Lifecycle handlers (`pagehide`, `pageshow`, `blur`, `visibilitychange`) ensure stale reveals clear on navigation or window deactivation.

### E. Browser-Action Feedback (`src/entrypoints/background.ts`)
- Per-tab action feedback:
  - `action.setTitle`: Dynamic title reflecting effective state (`Cognitive Comfort — Paused`, `Cognitive Comfort — Media shown on <domain>`, `Cognitive Comfort — Media blurred on <domain>`).
  - `action.setBadgeText`: Single-glyph badges (`'⏸'` for paused, `'○'` for media shown/disabled, `''` for active).
  - `action.setBadgeBackgroundColor`: `#c4705a` for paused, `#8d7240` for show/disabled.
- Synchronized across `tabs.onActivated`, `tabs.onUpdated`, and `onSettingsChange`.

### F. Popup Suspension & Styling (`src/entrypoints/popup/main.ts`, `src/entrypoints/popup/style.css`)
- `renderPause()` toggles `.is-suspended` on `#globalSheet` and `#revealSheet` when paused.
- Popup HTML `html` and `body` set explicit `background-color: var(--ground)` and `overscroll-behavior: contain` to prevent Safari bounce exposure.

### G. Public Profile & Store Defaults
- `config/profiles/public.toml`: `blurScope = "all"`, `revealMode = "both"`, `blurAmount = 50`.
- HTML range sliders default to 50px with `1 / 50 / 100` scale.
- `scripts/capture-shots.mjs`: updated with `revealMode: 'both'`, `blurAmount: 50`, and robust `chrome.tabs.query` interception.

---

## 3. Testing & Verification Status

### Unit Tests (`pnpm test` / `just test`)
- 93 Vitest unit tests passing (100% pass rate).
- Tests cover storage defaults, normalization, site overrides, message parsing, styles generation, emojis, DOM readiness, and click handler clustering/isolation.

### Playwright E2E Tests (`pnpm test:e2e` / `just test-e2e`)
- 17 Playwright E2E tests passing (100% pass rate).
- **Chromium Acceptance Suite (`tests/e2e/extension.spec.ts`, 9 tests)**:
  1. Content script media blur (50px), `cursor: pointer` affordance, hover reveal, peek shortcut.
  2. Effective state ledger: global default vs site own rule attribution.
  3. Inheritance: subdomain inherits base domain rules with note and `.is-inherited`.
  4. Pause honesty: button label, ledger, stamp, `.is-suspended` policy sheets, resume.
  5. Non-web tab: site radios disabled with prompt while global controls remain operable.
  6. Global emoji rule toggling with contenteditable preservation.
  7. Options page filed rules CRUD: seeding, changing rules, removing rules, storage persistence.
  8. Keyboard traversal: Tab navigation across all controls with visible focus ring (`box-shadow`), Space activation, and Arrow key radio driving.
  9. Reduced motion: verifies `animation-duration` and `transition-duration` evaluate to `0.001s` (1ms) on `.sheet` and `.sheet-filed` under `prefers-reduced-motion: reduce`.
- **WebKit / Safari Engine Suite (`tests/e2e/webkit-safari.spec.ts`, 8 tests)**:
  1. WebKit CSS filter specificity (`:not([data-comfort-revealed="true"])` cascade override).
  2. YouTube video card hover reveal & dynamic preview player mounting reconciliation.
  3. YouTube Shorts carousel shelf isolation.
  4. Multi-layer scrim coordinate penetration.
  5. Generic multi-layer video stack on non-YouTube sites.
  6. Dynamic node replacement maintaining hover unblur without flashing.
  7. Reveal mode `"both"` (hover unblurs, click locks).
  8. Autoplay / pointer event transparency.

### Safari Native App Wrapper & Verification Boundaries
- Build & install command: `cd .. && just safari-build` (installs to `/Applications/Cognitive Comfort.app` or `~/Applications/Cognitive Comfort.app`).
- Safari launch command: `open -a Safari`.
- **Boundary Note**: Playwright WebKit tests verify WebKit rendering, CSS cascade, and DOM mutation behavior headlessly. Final end-to-end verification for Safari release requires manual activation in Safari Settings > Extensions per `docs/browser-testing.md`.
