# Uncommitted Changes Review — Cognitive Comfort

Reviewed: 2026-08-19. Scope: the 21 files of commit `5da9663` ("safari stacked fixes and more", +2468/−445), which is HEAD of branch `dev`. Read-only review at the time; follow-up fixes from these findings landed separately — see `handoff/fix-review-and-tests.md`.

## Evidence collected

- `pnpm compile` (wxt prepare + `tsc --noEmit`): passes.
- `pnpm test` (vitest): 93/93 pass across 7 files at review time (suite is now 101/101 after the follow-up fixes).
- Last e2e run (`test-results/.last-run.json`): passed (9 Chromium + 8 WebKit per docs).
- Static review of every changed source, script, config, doc, and test file; two independent review agents (tests + repo-general); headline claims re-verified against source.

## Summary

| Severity | Count | Theme |
| --- | --- | --- |
| High | 1 | Over-broad media selector can swallow legitimate first clicks |
| Medium | 4 | Perf, click-button guard, doc drift, boundary-geometry risk |
| Low | 4 | Minor semantics / hygiene |
| Test gaps | 6 P1 | Untested swallow contract, WebKit gate, shadow DOM, reconcile merge, zero-size branch, storage messaging path |

---

## High

### H1 — `[style*="background:"]` in `MEDIA_SELECTORS` makes plain colored divs "media" and swallows first clicks
- `src/entrypoints/comfort.content/click-handler.ts:2`
- `MEDIA_SELECTORS` now ends with `[style*="background:"]`. Any element with an inline `background:` value — including a plain color such as `<div style="background: #fff">`, no image — matches.
- Consequence in `click` mode: `findRevealTarget` (`click-handler.ts:467`) resolves `target.closest(MEDIA_SELECTORS)`, so a click anywhere inside such a div (or on a link/button descendant, via the ancestor walk) finds a non-empty cluster; `handlePointerDown` (`:137-155`) then `preventDefault`s the click (swallowed), and `handleClick` (`:106-127`) re-swallows it. Result: the first click on links/buttons inside inline-`background:` containers never reaches the page — a navigation/interaction regression on sites that use inline background shorthand (common in CMS themes, dark-mode toggles, cards).
- Also `[style*="background-image"]` matches `background-image: none` inline resets (framework placeholder pattern), same false-positive path.
- Suggested fix: require an image reference — `[style*="background-image:url"]` / `[style*="background:url("]` — or drop the `background:` arm and rely on the detector's `[data-comfort-bg-image]` mark (`bg-image-detector.ts`).
- Verification: selector semantics certain; impact site-dependent. No existing test exercises the click-swallow path on a non-media div (see T1).

---

## Medium

### M1 — No throttling on pointermove cluster resolution
- `src/entrypoints/comfort.content/click-handler.ts:161-173` (`handlePointerMove`), `:522-565` (`findRevealCluster`), `:175-199` (`clearHoverIfCursorLeft`)
- Every `pointermove` runs `document.elementsFromPoint` + per-stack-element `querySelectorAll(MEDIA_SELECTORS)` (up to 6 ancestor levels via `findRevealTarget`/`findBestDescendantMedia`) + `getComputedStyle` per blurred ancestor (`hasBlurFilter`, `:669`). When nothing is hovered, `clearHoverIfCursorLeft` re-runs the whole resolution. On YouTube hover stacks this is dozens of DOM queries per event at 60+ events/s.
- MutationObserver reconcile is debounced (`scheduleReconcile`), but the pointer path is not.
- Suggested fix: rAF-coalesce `handlePointerMove`; skip the `clearHoverIfCursorLeft` full-resolution when no cluster is active (short-circuit on `hoverCluster.size === 0` and a cheap `elementFromPoint` probe).

### M2 — `handlePointerDown` swallows non-primary clicks
- `src/entrypoints/comfort.content/click-handler.ts:137-155`
- No `event.button === 0` / modifier-key guard: middle-click or ⌘/Ctrl+click ("open in new tab") on blurred media is `preventDefault`ed in `click` mode, so the new-tab gesture dies. First-click-swallow is intended for plain left clicks only.
- Suggested fix: return early unless `event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey` (or treat modifiers as "real click").

### M3 — Reviewed handoff doc is stale on the Shorts bug and test counts
- `handoff/task-context-youtube-and-fixes.md` §3.2 still lists the YouTube Shorts multi-card reveal as **Open — Fix Needed** ("constrain container traversal so it stops at `ytd-reel-item-renderer`").
- The reviewed code (commit `5da9663`) already implements it: `CARD_BOUNDARY_TAGS` includes `YTD-REEL-ITEM-RENDERER` (+`YTD-THUMBNAIL`, etc.) and `EXCLUDED_CONTAINER_TAGS` includes `YTD-REEL-SHELF-RENDERER` and `id="items"` (`click-handler.ts:36-75`); `tests/e2e/webkit-safari.spec.ts:192-273` has a real-geometry shelf-isolation test.
- §3 also claims "81 passing" unit tests; the suite was 93 at review time (now 101). Update the doc or mark §3.2 done to avoid the next reader chasing a fixed bug.

### M4 — Boundary break can fall back to an oversized cluster when the card is not "sized like media"
- `src/entrypoints/comfort.content/click-handler.ts:578-596` (`findClusterContainer`)
- `best` is set by `isContainerSizedLikeMedia` (≤72px delta); the `CARD_BOUNDARY_TAGS` check sets `best = current` and breaks — but if the boundary card itself is *not* sized like the media rect (tall reel cards: 180×320 thumb vs ~400px card with title text), `best` remains whatever ancestor *was* sized like media, which may sit above the boundary and pull in sibling media. The WebKit Shorts test uses exact-fit geometry (`ytd-reel-item-renderer` == thumb size), so it cannot catch a mismatch. [INFERENCE: real-YouTube geometry risk, not proven]
- Suggested fix: on boundary hit, prefer the boundary element unconditionally (or stop the walk at the boundary instead of keeping `best`); add a WebKit fixture where the card is taller than the thumb.

---

## Low

### L1 — `handleClick` pass-through when the cluster was never locked
- `src/entrypoints/comfort.content/click-handler.ts:106-127`
- If pointerdown lands outside a cluster and the click lands on media (drag onto a thumb), the click neither locks nor swallows and passes straight through. Inconsistent with press-then-release-in-place; acceptable but undocumented. Guard with a tiny pointerdown/click target-delta check if in-place-only semantics are wanted.

### L2 — Stale element references in lock/hover sets
- `click-handler.ts:43-45` — `lockedCluster`/`swallowedClickCluster` retain elements removed from the DOM until the next clear (pagehide, mode change, or clicking empty space). Harmless (`syncRevealState` on detached nodes is a no-op visually) but keeps a bounded leak on long-lived pages.

### L3 — `scripts/iterate-safari-youtube.mjs` — diagnostics-only rough edges
- `send()` never checks HTTP status (`:10-18`); non-JSON driver error bodies throw confusing errors. Hardcoded 1s sleep polls instead of driver waits; `finally` DELETE can throw and mask the real error. Acceptable for a diagnostic tool; add `try/catch` around the final DELETE and surface driver error text.

### L4 — `scripts/capture-shots.mjs` hover capture depends on `revealMode` default
- `capture-shots.mjs:126-134` — `hero.hover()` + `waitForFunction(... blur(0px))` works only because the public profile is now `both`/`all`/50. If defaults ever regress to `click`, the reveal shot fails. Also `setSettings` targets `chrome.storage` only (`:85-90`) — fine for the Chromium-only build it drives (`build:chrome`).

---

## Test-side findings (P1)

Verified claims from the changed-tests review; anchors in current working tree.

### T1 — Click-mode swallow contract has zero automated coverage
- `tests/click-handler.test.ts` never dispatches a `MouseEvent('click')` (the first test was rewritten to two pointerdowns, `:39-63`); e2e runs only in `both` mode, where hover makes the first click pass through. The documented contract "first activation reveals without navigation; second navigates" (`docs/browser-testing.md`, "Linked media" row) is asserted nowhere.
- Add: unit test dispatching pointerdown+click asserting preventDefault on first click and pass-through on second; e2e with `revealMode: 'click'`.

### T2 — `pnpm test:e2e` is now WebKit-dependent with no skip guard
- `playwright.config.ts` `testMatch` changed `'extension.spec.ts'` → `'*.spec.ts'`; `webkit-safari.spec.ts` calls `webkit.launch({headless:true})` 8 times with no skip/probe (verified: zero `skip` references). Without a WebKit executable the entire Playwright gate fails instead of skipping Chromium tests.
- Fix: `beforeAll` probe-launch → `test.skip`, or document `npx playwright install webkit` as a `test:e2e` prerequisite (also add to `docs/browser-testing.md`).

### T3 — Shadow DOM handling untested
- `getElementsUnderPoint` shadowRoot branch (`click-handler.ts:395-414`) and `collectBoundedMediaCandidates` shadow query (`:444-449`) — a headline feature of the rework (real YouTube mounts shadow roots) — have zero coverage (`attachShadow` absent from all tests; WebKit fixtures use light-DOM `ytd-*` elements).

### T4 — Reconcile/merge partial-stack path untested (and one test is misnamed)
- The test "does not re-blur an existing hover layer when reconcile sees a partial cluster" (`tests/click-handler.test.ts:205-247`) dispatches `pointermove` → `syncHoverCluster`; it never triggers the MutationObserver → `scheduleReconcile` → `reconcileAtPointer` → `mergeHoverCluster` add-only path (`click-handler.ts:270-276`, `:306-313`). The add-only merge against a partial `elementsFromPoint` result during a mutation is the untested half of the transient-swap fix.

### T5 — Zero-size media during swap untestable in current harnesses
- `isUnderCursorInStack` 0×0 branch (`click-handler.ts:620-625`) is dead in unit tests (uniform 240×160 rect mock, `tests/click-handler.test.ts:24-33`) and the WebKit spec mounts the preview video fully sized. The documented "transient 0×0 during mount" behavior is unpinned.

### T6 — `tests/storage.test.ts` churn removed the serialization and messaging-path tests
- Verified: zero `sendMessage` / `ok: false` / window-stubbing references remain. The concurrent-write serialization tests (defended `writeQueue` read-modify-write atomicity, `src/utils/storage.ts:102-118`) and the only `trySaveViaBackground` messaging-path test (popup/content contexts, `:126-153`) are gone — a lost-update or broken messaging fallback now passes silently. Re-add: `Promise.all` double-override test, and a stubbed-window test asserting `{ok:false}` → `PERSISTENCE_ERROR_MESSAGE` → local-write fallback.

---

## P2 test gaps (condensed)

- Mode `both` lock interplay at unit level (lock A → hover B; click B while A locked; second click on locked media).
- Window `blur` / `pageshow` lifecycle handlers untested (`click-handler.ts:201-219`).
- WebKit spec: redundant `goto` to the fixture server (`:61`) that discards its content — removing it decouples the spec from server/4177; hardcoded sleeps `:66`, `:477`; no test with non-default settings proving the stub path (`:27-58`); no friendly guard when `.output/chrome-mv3` bundle is missing.
- Storage message-guard edge cases dropped: invalid `key`, empty `domain`, extra-keys guard, missing `settings` key; `onSettingsChange` call-count assertion weakened.
- Duplication between the two e2e specs (blur/reveal/leave patterns) — extract shared helpers to prevent drift when defaults change.
- `tests/styles.test.ts` local fixture still names old values (`content`/`click`/40) as `baseSettings` — not drift (pure `generateStyles` inputs) but confusing; rename.

## Clean

- **Defaults**: `all`/`both`/50 consistent everywhere — `config/profiles/public.toml`, `tests/setup.ts`, `tests/storage.test.ts` expectations, bundle inlined defaults, popup/options HTML (`value="50"`), both e2e specs. No drift found.
- **background.ts** browser-action feedback: `action`/`browserAction` fallback correct for MV2/MV3; `tabs.onActivated`/`onUpdated`/`onSettingsChange` wiring sound; all `setTitle`/`setBadgeText` calls `.catch()`ed.
- **styles.ts** `:not([data-comfort-revealed="true"])` base-selector fix is correct (revealed elements can no longer match the blur rule in WebKit); `cursor: pointer` scoped to the base rule only, so revealed media reverts to default cursor as documented.
- **iterate-safari-youtube.mjs** offscreen window + session DELETE in `finally` — solid driver hygiene.
- Docs (`design-followups.md`, `browser-testing.md`) match the implemented behavior (badge glyphs/colors, 17-test acceptance claim consistent with last e2e run).

## Suggested order of work

1. H1 selector narrowing (click regression).
2. M2 button/modifier guard (new-tab gesture).
3. T2 WebKit skip guard (CI/onboarding gate).
4. T1 + T6 test restoration (contracts currently unprotected).
5. M1 throttle, M4 boundary-geometry fixture, M3 doc update.
