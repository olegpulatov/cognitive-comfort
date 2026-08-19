# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: knowledge workers, students, researchers, and writers reading text on media-dense pages (article sites, video platforms, feeds, docs) who want to read first and look at an image only when they decide to.

Also confirmed audiences: people distracted by dense imagery, autoplay surfaces, thumbnails, and colorful emoji; people who prefer deliberate reveal over permanent blocking.

Job: reduce visual competition on a page without permanently removing information — read first, reveal one item when needed, briefly peek at the whole page, or exempt a site.

## Product Purpose

Cognitive Comfort is a cross-browser extension (Chrome, Edge, desktop Firefox 140+, macOS Safari target) that makes browsing text-first: supported media is darkened and heavily blurred until the user intentionally reveals it. It can additionally hide emoji presentation.

Public promise: "Cognitive Comfort blurs distracting web media until the user intentionally reveals it." Success: a user reads a media-heavy page comfortably, reveals exactly what they need, and never loses access to content.

## Positioning

Deliberate reveal instead of blocking. Media is never removed — it is blurred/darkened in place with a CSS filter and restored on the user's own gesture (click, hover, hover+lock, held peek), per site or globally, entirely locally.

Not, and never marketed as: ad blocker, parental control, content filter, productivity tracker, security/privacy shield, medical treatment, or a guarantee that every visual is hidden.

## Operating Context

- Toolbar popup is the frequent-use surface (372px wide; browser-owned height and scrolling, with a Safari popover-specific viewport fix).
- Options is the wider advanced-settings surface for global policy, per-site rules, shortcuts, and diagnostics.
- Effects run in the page content script; state lives in one browser-local key `comfortSettings`.
- Keyboard shortcuts are browser-native assignments, editable only through browser UI (`chrome://extensions/shortcuts`, `about:addons`, Safari > Settings > Extensions). Assignments can be unset or user-changed.
- Safari ships inside a containing app with its own status screen.
- Store presentation (Chrome listing live; other stores unverified) plus README, PRIVACY.md, TRADEMARKS.md.

Reference package for current behavior, code pointers, and acceptance scenarios: `../product/designer-handoff.md`.

## Capabilities and Constraints

Confirmed behavior that must be preserved unless the owner changes it:

- Hiding = `filter: blur(1–100px) brightness(0.3)` with 0.2s transition; reveal = `blur(0) brightness(1)`; peek also restores saturation. No overlay, label, or placeholder; a pointer cursor provides the reveal affordance.
- Emoji hiding is a different mechanism: matched emoji text is wrapped in `.comfort-emoji` spans and `display: none`; original text is restored on disable.
- Scope: "content media" (images except 1×1, `picture`/`video`/`canvas`, known video iframes, eligible CSS background images) vs "content + small UI media" (adds SVG and small media inside buttons/links/role-buttons/aria-labelled elements).
- Reveal modes: Click Only (first activation reveals and swallows the click so linked images do not navigate; second passes through), Hover Only, Hover + Click Lock. Reveal applies to a geometric "cluster" of sibling/ancestor media.
- Peek: held shortcut reveals supported media and emoji; command-API delivery gives a ~350ms pulse because key release is not exposed.
- State precedence: pause > exact-domain override > base-domain override > global default. Emoji follows the same precedence but inherits its own Emoji Default, not global media.
- Public first-install defaults: enabled, not paused, content + small UI media scope, hover + click lock reveal, 50px blur, emoji hiding off. The local profile differs only by enabling emoji hiding and using a local Safari identity.
- Fully local: no analytics, tracking SDK, account, server, or extension-originated network requests. Settings and domain overrides stay in browser-local storage.

Technical constraints:

- Stack: WXT + TypeScript, vanilla HTML/CSS UI (no framework), Vitest + Playwright.
- Stable identities must not change without an explicit engineering migration plan: Chrome extension ID, Firefox Gecko ID, Safari bundle IDs, repo/support URLs, storage key `comfortSettings`, command IDs (`toggle-pause`, `toggle-site`, `peek-show`, `toggle-global`), DOM names `data-comfort-*` / `.comfort-emoji` / injected style IDs.
- Generated artifacts are never edited as sources: `.output/**`, `../safari/**/Shared (Extension)/**`, ZIPs.
- Popup must work within real browser popup bounds; no important state or action may be clipped.

Decided in this session:

- Name "Cognitive Comfort" is binding.
- The options page becomes a real advanced-settings surface (global policy, per-site rule management, shortcuts, diagnostics) rather than a popup duplicate. It must not depend on reading the active tab for site controls.

Explicitly undecided product facts (do not invent):

- Any pricing/business model.
- Availability on Firefox, Edge, and Apple stores; only the Chrome listing is verified live.
- Terminology fix for "Hide" (blur/dim for media vs removal for emoji) and the double meaning of "Global" (global default vs inheritance label) — the problem is confirmed, the wording is not chosen.

Remaining UX debt: terminology still overloads “Hide” and “Global”; browser-owned shortcut reassignment varies by browser; and the popup still exposes some policy controls that also appear in the advanced options surface.

## Brand Commitments

- Product name: Cognitive Comfort (binding). Current subtitle: "Calm browsing by default."
- Message hierarchy: calm browsing by default → reveal on your terms → adapt per site → local operation → cross-browser only where release evidence supports it.
- Voice: plain, precise, non-clinical. Claim guardrails are binding: no medical/therapeutic/neurodivergence-treatment or productivity-outcome claims, no "100% private"/"zero data", no claim that page content is never rewritten (emoji mode wraps text nodes), no claim that every visual is hidden, no unverified store/price availability.
- Icon masters are authored vectors in `brand/icon/`: `icon.svg` (toolbar and store), `icon-macos.svg` (Safari containing app), `icon-mono.svg` (single-colour). The mark is four media cells on an ink-umber plate — three quieted, the fourth revealed in parchment — in the shipped panel palette, so identity and UI now agree. The old lavender-eye raster (`icon_large.png`) is deleted; it remains on the live Chrome listing until the next submission.
- Reserved name/artwork policy in `TRADEMARKS.md`.

## Evidence on Hand

- Behavior/code/acceptance reference: `../product/designer-handoff.md` (2026-08-10 snapshot).
- Positioning and claim guardrails: `../product/positioning.md`; store copy: `../product/store-listings.md`, `../product/store-front.md`; privacy: `PRIVACY.md`.
- Browser evidence: `../product/release-evidence/2026-07-18-browser-matrix.md` (visible/stable checks incomplete; Safari not release-ready). Manual matrix: `docs/browser-testing.md`.
- Automated coverage: `tests/e2e/extension.spec.ts` (first-run blur, background images, bare SVG, linked click, pause/resume, shortcut rows, emoji toggle, held peek, console errors).
- Icon masters `brand/icon/*.svg` + generated `public/icon-{16,32,48,96,128}.png` via `scripts/generate-icons.sh` (`just icons`). Unreferenced exploratory PNGs in `../internal-docs/` are exploration, not source of truth.
- Store assets are generated in-repo: `brand/store/demo/` (own demonstration page and photography), `scripts/capture-shots.mjs` (real extension in a real browser), `brand/store/copy.json` + `brand/store/templates/asset.html` + `scripts/render-store-assets.mjs` (exact store sizes into `brand/store/out/`). See `brand/README.md`. The older `../product/screenshots/` and `../product/screenshots2/` sets are superseded and must not ship: raster-only, partly mislabeled before/after, third-party YouTube UI, unverified store-availability badges. Two docs still point at a nonexistent `product/assets/screenshots/` path.
- No customers, testimonials, benchmarks, user counts, or pricing exist. Do not fabricate any.

## Product Principles

1. Reveal, never delete. Every hiding effect is reversible in place, and the user's gesture is the only trigger.
2. Effective state must be legible. What is actually happening right now (paused, global show, site override, inherited) outranks showing stored configuration.
3. Frequent actions and policy are different jobs. The popup serves the current page; advanced defaults, per-site rules, shortcuts, and diagnostics belong on the options surface.
4. Say only what the evidence supports. Precise mechanism language beats comforting absolutes.
5. Local by construction. No account, server, telemetry, or remote code — ever.

## Accessibility & Inclusion

Target: WCAG 2.2 AA plus complete keyboard and screen-reader semantics — visible focus on every control including the slider, programmatic name/role/state (`aria-pressed` or radio groups instead of `.active`-only styling), grouped controls with real headings/fieldsets/legends, associated labels, and announced errors. Active, inherited, and paused meaning must never depend on color, border style, hover, or `title` alone.

Keyboard layout independence is a confirmed requirement: shortcuts and any in-page key affordances must work for at least QWERTY and Dvorak users. Never assume physical key positions, never draw fixed keycaps as immutable, and always display the browser's current assignment (including "Not set") with a route to change it.
