# Design follow-ups

Written 2026-08-17, after the popup and options surfaces were rebuilt on the reading-room card-catalog world (`src/entrypoints/shared/panel.css`, direction seed `1169f0a3`). Each task below is self-contained: hand one to a model or pick it up yourself without rereading this session.

Nothing here is required before shipping the current build. They are ordered by what buys the most.

## 1. Acceptance coverage for the surfaces that were just rebuilt

The e2e suite (`tests/e2e/extension.spec.ts`) still covers only content-script behavior plus pause and the four shortcut rows. The rebuilt UI has real state logic that nothing asserts.

Add Playwright cases, driven from a real web page so the popup sees a live domain (the current spec's fixture server at `http://127.0.0.1:4177/fixture.html` already provides one):

1. **Effective state ledger** - with `enabled: true` and no site rule, the ledger says media is blurred on the fixture domain and attributes it to the global default. Set a rule for that exact domain to `disabled`; the ledger says media is shown and attributes it to the site's own rule.
2. **Inheritance** - file a rule for the base domain, open the popup on a subdomain, assert the note names the base domain and the checked segment carries `.is-inherited`'s filing mark. This is currently the only channel for inheritance, and the old `title=` tooltip is gone deliberately.
3. **Pause honesty** - while paused, the ledger reads "Paused everywhere", the site sheet carries `.stamp`, the policy sheets carry `.is-suspended`, and the controls remain operable.
4. **Non-web tab** - open the popup with an extension URL as the active tab: the site radios are `disabled`, none is checked, and the note invites opening a website. Global controls still work.
5. **Save failure** - stub the persistence path to reject once and assert `#saveNotice` becomes visible and names the failure. This is the one debt item with no visual proof yet.
6. **Options filed rules** - seed two media rules and one emoji rule, open options, assert one row per domain, change one, remove the other, and assert `comfortSettings` matches.
7. **Keyboard traversal** - tab through the popup and assert every focused element has a visible focus style, then drive one radio group with arrow keys only and assert the setting persists. Native radio semantics make this work; a regression back to buttons would break it silently.
8. **Reduced motion** - with `prefers-reduced-motion: reduce` emulated, assert the filing animation does not run.

Acceptance: `pnpm test:e2e` covers items 1-7 and fails if the popup regresses to `.active`-styled buttons.

## 2. Browser-action feedback (the debt item still open)

The toolbar icon never changes for paused, global-show, or a site override, so the only way to learn the effective state is to open the popup. Implement in `src/entrypoints/background.ts`:

- `action.setTitle` reflecting effective state for the active tab, e.g. "Cognitive Comfort - paused" / "media shown on example.com".
- `action.setBadgeText` with a one-glyph badge for paused and for global-show, badge colors drawn from the brass and stamp values in `panel.css`.
- Recompute on tab activation, navigation, and every settings change; Safari and Firefox both support these APIs, but verify the badge renders in Safari before relying on it.

Acceptance: pausing changes the toolbar affordance with no popup opened; a manual matrix row per browser in `docs/browser-testing.md`.

## 3. On-page reveal affordance (design decision first, then code)

Blurred media has no cursor hint, no label, and no indication that a gesture will reveal it. New users cannot discover click-to-reveal. This is deliberately untouched here because it lives in the content script that all 18 acceptance scenarios cover.

Scope the design before coding: the affordance must not add visual noise (that is the product's whole promise), must not break linked-media first-click safety in `click-handler.ts`, and must respect the reveal mode. Cheapest honest candidate: `cursor` treatment plus a hairline brass edge on the hovered cluster in the two hover modes, and nothing at all in click-only mode except the cursor. Anything with text or an icon overlay needs a real decision, not a default.

Acceptance: reveal is discoverable without the popup, scenarios 2-6 in `../product/designer-handoff.md` still pass unchanged.

## 4. Content-script blur treatment review

Current treatment is `blur(Npx) brightness(0.3)` with a 0.2s transition (`comfort.content/styles.ts`). It works, and the darkening is what keeps media a soft shape rather than a smear. Two things worth measuring rather than assuming:

- At 40px on small thumbnails the blur radius exceeds the element, so it reads as a flat dark block; a radius proportional to the smaller element dimension (clamped) may preserve "there is an image here" better.
- `brightness(0.3)` on already-dark media leaves nothing visible; `contrast` reduction plus a smaller brightness cut may read better on both.

Acceptance: a before/after comparison on five real pages, then either a change with the tests updated or a written decision to keep it as is.

## 5. Identity: icon (done 2026-08-18) and name

The icon was redrawn. `icon_large.png` is deleted; the masters are `brand/icon/icon.svg` (toolbar and store), `brand/icon/icon-macos.svg` (Safari containing app on Apple's 1024 grid), and `brand/icon/icon-mono.svg` (single-colour, `currentColor`). `scripts/generate-icons.sh` renders every shipped raster from them with `rsvg-convert`; `just icons` is the entry point. `wxt.config.ts` and `scripts/validate-release.mjs` now allow `brand/icon/*.svg` in the Firefox sources ZIP in place of the old raster master.

The mark is four media cells on an ink-umber plate: three quieted, the fourth revealed in parchment with its form crisp. It carries the panel palette, has no interior linework, and was checked at 16/32/48/128 on light and dark toolbars before shipping. See `brand/README.md`.

Still open on identity:

- The name "Cognitive Comfort" stays binding (`PRODUCT.md`). If it is ever revisited, the technical identities in the handoff's rename map stay frozen regardless.
- Nothing has been resubmitted to any store yet, so the live Chrome listing still shows the old lavender eye until the next submission.

## 6. Store assets (done 2026-08-18)

`../product/screenshots2/` is superseded and must not ship: reversed before/after labels, unverified store-availability badges, raster-only art, and third-party YouTube UI.

The replacement is reproducible and lives in the repo:

- `brand/store/demo/` — a media-dense demonstration page ("The Marginalia Review") built from our own prose, our own generated photographs, and a locally painted canvas player. No third-party interface or imagery.
- `scripts/capture-shots.mjs` (`just captures`) — builds the extension, runs it in a real Chromium profile, serves the demo page over a routed `https://example.com/` URL, and captures the page hidden and revealed, three popup states, and the options page. `brand/store/captures/manifest.json` records sizes and the single documented harness detail: the popup's active-tab lookup is pinned to the demo URL, because a scripted tab render is always its own active tab. Settings, rules, ledger sentences, and stamps are real.
- `brand/store/copy.json` + `brand/store/templates/asset.html` + `scripts/render-store-assets.mjs` (`just store-assets`) — every headline, caption, store target, and pixel size in one JSON, rendered at exact store dimensions into `brand/store/out/`. A copy change costs a re-render.

Shipped set: Chrome marquee 1400×560, Chrome small tile 440×280, five 1280×800 screenshots, Edge store logo 300×300. Remaining before submission: confirm each vendor's current required size set from the release checklist, and add any missing sizes to `copy.json` rather than resizing exports by hand.

## 7. Options page reachability

The popup links to options via `browser.runtime.openOptionsPage()`. Verify that link works in Firefox and Safari, not only Chromium, and that the options page renders correctly as a Firefox embedded options page (it may render inside `about:addons` at a constrained width, which is why the layout collapses at 560px).
