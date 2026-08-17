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

## 5. Identity: icon and name

Deliberately not touched this session. Recorded so the decision is not lost:

- The shipped icon (`icon_large.png`, raster only, no vector master) is a glossy pale cyan/lilac eye with sparkles. It has three separate problems: it does not survive 16px (sparkles and inner contours compress into mush), it has no editable source, and it now clashes with the panel world, which is warm ink and brass.
- Wanting a lavender-free identity is a reasonable instinct: pale lilac gradients read as generated because they are the default of every image model. That is a reason to redraw, not a reason to panic.
- Minimum viable fix, if a full rebrand is not wanted: an authored vector master, one silhouette that reads at 16px, a monochrome variant, and a warm palette that agrees with the UI. Test at 16/32/128 on light and dark toolbars before shipping.
- The name "Cognitive Comfort" is recorded as binding in `PRODUCT.md`. It is descriptive, unusual enough to be searchable, and free of medical claims. If it is ever revisited, the technical identities in the handoff's rename map stay frozen regardless.

## 6. Store assets

`../product/screenshots2/` cannot ship as-is: some concepts label before/after backwards, several claim availability on stores that are not verified live, all are raster-only so renamed copy means recreating art, and they contain third-party YouTube UI whose rights are unreviewed.

Build a reproducible template instead: a real page in a real browser, the new popup beside it, one honest caption per shot, and a script that regenerates all sizes so copy changes cost nothing. Add per-store size sets from the checklist. Never claim a store before the listing is live.

## 7. Options page reachability

The popup links to options via `browser.runtime.openOptionsPage()`. Verify that link works in Firefox and Safari, not only Chromium, and that the options page renders correctly as a Firefox embedded options page (it may render inside `about:addons` at a constrained width, which is why the layout collapses at 560px).
