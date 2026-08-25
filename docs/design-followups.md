# Design follow-ups

Written 2026-08-17, updated 2026-08-19 with Safari/WebKit iteration, browser-action feedback, cursor reveal affordances, and expanded automated acceptance coverage.

## 1. Acceptance coverage for rebuilt surfaces (done 2026-08-19)

The Playwright e2e suite (`tests/e2e/extension.spec.ts` and `tests/e2e/webkit-safari.spec.ts`) provides automated test coverage across real Chromium and WebKit rendering engines:

1. **Effective state ledger** - verified in `tests/e2e/extension.spec.ts` (test 2): initial state attributes to global default (`Media is blurred on 127.0.0.1. From the global default.`); setting site rule to `disabled` immediately reflects site own rule attribution (`Media is shown on 127.0.0.1. From this site’s own rule.`) and unblurs fixture media.
2. **Inheritance** - verified in `tests/e2e/extension.spec.ts` (test 3): base domain `example.com` rule is inherited on subdomain `blog.example.com`; note confirms `Following the rule filed for example.com.` and `#siteMediaSegments` carries `.is-inherited`.
3. **Pause honesty** - verified in `tests/e2e/extension.spec.ts` (test 4): while paused, `#pauseBtn` renders `Resume`, the ledger reads `Paused everywhere.`, `#siteSheet` renders `.stamp` ("Paused"), and controls remain operable without being visually disabled.
4. **Non-web tab** - verified in `tests/e2e/extension.spec.ts` (test 5): active tab without a web domain disables site radios with note `Open a website to file a rule for it.`; global controls remain operable.
5. **Global emoji rule** - verified in `tests/e2e/extension.spec.ts` (test 6): toggling `#emojiGlobalEnabled` hides `.comfort-emoji` while preserving contenteditable text.
6. **Options filed rules** - verified in `tests/e2e/extension.spec.ts` (test 7): filed site rules table renders filed domains (`alpha.com`, `beta.com`) and persists setting changes.
7. **Keyboard traversal** - verified in `tests/e2e/extension.spec.ts` (test 8): Tab focus lands on interactive controls; Space toggles buttons and radio choices persist natively.
8. **Reduced motion** - verified in `tests/e2e/extension.spec.ts` (test 9): emulated `prefers-reduced-motion: reduce` renders and operates without error.

Acceptance: `pnpm test:e2e` runs 21 automated tests (10 Chromium + 11 WebKit).

## 2. Browser-action feedback (done 2026-08-19)

The toolbar action keeps the icon visually quiet and uses only its title to report the effective state of the active tab (`src/entrypoints/background.ts`):

- `action.setTitle`: dynamic title reflecting effective state (`Cognitive Comfort — Paused`, `Cognitive Comfort — Media shown on <domain>`, `Cognitive Comfort — Media blurred on <domain>`).
- Synchronized on tab activation (`tabs.onActivated`), navigation/updates (`tabs.onUpdated`), and storage changes (`onSettingsChange`); Chromium acceptance test 10 covers action title transitions, while `tests/browser-action.test.ts` covers per-domain presentation.

## 3. On-page reveal affordance (done 2026-08-19)

Blurred media has clear, lightweight interactive discovery (`src/entrypoints/comfort.content/styles.ts`):
- Added `cursor: pointer !important;` to base blur rules so hovered media immediately signals click/hover reveal affordance without injecting visual DOM noise or overlay wrappers.
- Revealed media (`:root [data-comfort-revealed="true"]`) automatically returns to default cursor rules.
- Scenarios 2–6 in designer handoff pass unchanged.

## 4. Content-script blur treatment review (done 2026-08-19)

Review Decision:
- Blur treatment is set to `blur(50px) brightness(0.3)` with a 0.2s transition.
- Scoped with `:not([data-comfort-revealed="true"])` to resolve WebKit cascade specificity bugs, ensuring immediate transition to `blur(0px) brightness(1)` upon reveal.
- Multi-layer stack coordinate penetration (`document.elementsFromPoint()`) and generic card boundary detection (`ARTICLE`, `LI`, `FIGURE`, and YouTube containers) ensure clean hover/click behavior across both video players and thumbnail grids without flashing or sibling unblurring.

## 5. Identity: icon and name

The icon was redrawn. Masters are `brand/icon/icon.svg` (toolbar and store), `brand/icon/icon-macos.svg` (Safari containing app on Apple's 1024 grid), and `brand/icon/icon-mono.svg` (single-colour, `currentColor`). `scripts/generate-icons.sh` renders shipped rasters; `just icons` is the entry point.

Still open on identity:
- The name "Cognitive Comfort" stays binding (`PRODUCT.md`).
- Store listings update on next submission.

## 6. Store assets

Shipped set: Chrome marquee 1400×560, Chrome small tile 440×280, five 1280×800 screenshots, Edge store logo 300×300 in `brand/store/out/`. Rebuilt with `just brand`.

## 7. Options page reachability

The popup links to options via `browser.runtime.openOptionsPage()`. Layout handles constrained widths down to 372px and options page collapses at 560px for embedded Firefox/Safari options rendering.
