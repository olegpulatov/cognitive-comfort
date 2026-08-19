# Repo General Review — Cognitive Comfort

Reviewed: 2026-08-19, against commit `5da9663` (HEAD of branch `dev`), whose change-set is covered in `handoff/uncommitted-changes-review.md`; this document covers the repo as a whole, with depth on unchanged code. Read-only review at the time; follow-up fixes from these findings landed separately — see `handoff/fix-review-and-tests.md`.

Method: full static review of `src/`, `scripts/`, `config/`, `docs/`, `brand/`, `.github/`, configs, plus a dedicated review agent pass; headline findings re-verified against source. Compile + unit tests pass (93/93 at review time; now 101/101 after the follow-up fixes); last e2e run passed (17 tests).

## Summary

| Severity | Count | Theme |
| --- | --- | --- |
| Critical | 0 | — |
| High | 1 | bg-image marks go stale on dynamic pages |
| Medium | 6 | Emoji live-text, docs drift, stylesheet-driven backgrounds, peek failsafe |
| Low | 11 | Dead code, races, error-handling nits |
| Info | 8 | Architecture notes, no CI, shadow-DOM limits |

---

## High

### H1 — Background-image marks go stale: parents never re-evaluated on `childList` mutations
- `src/entrypoints/comfort.content/bg-image-detector.ts:114-139`
- `observeChanges` enqueues only `mutation.addedNodes` (`:119-122`); `mutation.target` — the container that gained or lost children — is never re-synced. `shouldIgnoreBackgroundElement` (`:99-107`) decides "crowded" (`childElementCount > 3`), text+children, or interactive-descendant predicates **once** at mark time. A marked container that later gains a 4th child or a `<button>` keeps its blur mark forever; a skipped (crowded) container that loses children is never reconsidered. On feeds/YouTube re-renders the mark set drifts in both directions.
- Verified against source. `tests/bg-image-detector.test.ts` covers added-node marking and attribute changes only — this path untested.
- Fix: for `childList` mutations also enqueue `mutation.target` (and parents of removed nodes, bounded depth); add tests for both drift directions.

---

## Medium

### M1 — Emoji blocker misses in-place text changes (no `characterData`)
- `src/entrypoints/comfort.content/emoji-blocker.ts:110-113` — observer watches `{ childList: true, subtree: true }` only. `node.textContent = '…🎉'` (live tickers, chat, counters) never triggers processing; new emoji stays visible. Only *node replacement* is caught.
- Fix: add `characterData: true`; process `mutation.target` as Text in `handleMutations`, skipping nodes inside `.comfort-emoji` spans. Test gap in `tests/emoji-blocker.test.ts`.

### M2 — README/PRODUCT still document the old public defaults
- `README.md:24` ("content scope, click reveal, 40px blur"), `PRODUCT.md:50` — public profile is now `all`/`both`/50 (`config/profiles/public.toml`). Release-facing docs predict the wrong first-run behavior.

### M3 — README pins artifact names to version 0.3.0
- `README.md:55-60` — "Version 0.3.0 produces: `.output/cognitive-comfort-0.3.0-*.zip`"; `package.json:9` is `0.3.1`. Documented filenames will not exist after a build. Describe the naming pattern instead of a pinned version.

### M4 — PRODUCT.md describes pre-redesign surfaces
- `PRODUCT.md:32` ("Options page … currently a duplicate of the popup") and `:71` ("Known UX debt" list) contradict the redesigned popup/options (panel.css, DESIGN.md) — the options page now has its own defaults/coverage/reveal/blur/rules/shortcuts sheets. Rewrite both bullets; DESIGN.md codifies the opposite of some debt items (e.g. pause button deliberately has no `aria-pressed`).

### M5 — Stylesheet-driven background-image changes are never re-scanned
- `bg-image-detector.ts:133-138` — `attributeFilter: ['style','class','src','srcset','poster']`; a `background-image` change caused by an injected stylesheet, media-query flip, or `:hover` rule is invisible to the observer. The initial `scanDocument()` is the only full pass. Elements stay unmarked (unblurred) or stay marked after the background is removed. [INFERENCE: impact site-dependent]
- Fix: watch added `<style>`/`<link rel="stylesheet">` nodes and re-scan pending elements after rAF; or periodic cheap diff of the marked set.

### M6 — Held-peek failsafe is a hard 5s cap, never re-armed
- `src/entrypoints/comfort.content/index.ts:75-79` — first keydown arms `schedulePeekEnd(5000)` (`:52`); repeat keydowns hit `if (event.repeat && peekShortcutActive) return;` and never re-arm. Holding Ctrl+Shift+A > 5s ends the peek while the key is still held — contradicts "Peek while held" (README shortcut table).
- Fix: re-schedule the failsafe on repeat events while active (or arm once, cancel on keyup).

---

## Low

### L1 — `migrate()` is a no-op placeholder
- `src/utils/storage.ts:70-75` (+ comment at `scripts/profile-config.mjs:29-31`) — returns input unchanged; creates a false migration contract. `normalizeSettings` already validates everything. Delete or implement.

### L2 — `toggleSiteOverride` decides from a snapshot outside the write queue
- `src/utils/storage.ts:263-273` — reads `settings` outside `writeQueue`; only the write is serialized. Two rapid toggles can both compute the same `next` from the same snapshot → second toggle lost. Move read+decide inside the queued update.

### L3 — `startPeek()` skips container re-sync while a peek is already active
- `index.ts:111-121` — `if (document.documentElement.hasAttribute('data-comfort-peek')) return;` exits before `syncPeekContainers()`; media appearing mid-peek (infinite scroll while holding the shortcut) stays blurred. `syncPeekContainers` is idempotent — call it even when the attribute is set.

### L4 — Inline-filter restore can clobber page-side filter changes made during a peek
- `index.ts:172-186` — `restoreInlineFilter` writes back the snapshot from peek start; if the page mutates the element's inline filter mid-peek, restore overwrites it. On restore, only remove the peek-installed override if the current inline value still equals it. [INFERENCE: rare on player sites]

### L5 — Incomplete multipart-TLD list yields wrong base domains
- `src/utils/domain.ts:4-16` — misses `co.in`, `com.cn`, `net.cn`, `com.vn`, `com.my`, `com.ph`, `com.ng`, `co.th`, … For `example.co.in`, `getBaseDomain` returns `co.in` (`:38-43`), so override inheritance for deeper subdomains silently fails (exact rule for `example.co.in` itself still matches). `tests/domain.test.ts` covers only listed suffixes. Use a public-suffix list or extend the set.

### L6 — Options page: unchecked element lookups, unhandled init rejection
- `src/entrypoints/options/main.ts:13-31` (`as HTML…` casts, no null checks), `:290-294` (`init()` awaits `getSettings()` with no try/catch) — storage failure or id drift leaves a blank page with no notice, despite the `saveNotice` channel existing for save failures.

### L7 — Coverage config: untested module included, peek logic excluded
- `vitest.config.ts:18,22` — `browser-support.ts` in coverage `include` with zero tests; the entire peek state machine (`comfort.content/index.ts`) in `exclude` with no unit tests (only the e2e held-shortcut smoke). Coverage thresholds (75/75/75/65) are computed over a skewed set. Add a `browser-support` test or drop it; consider extracting peek into a testable module.

### L8 — Dead CSS: `.field-note-inherited`
- `src/entrypoints/shared/panel.css:271-273` — no consumer anywhere (verified by grep across src/tests/scripts/brand + built CSS). Delete.

### L9 — `defaultSettings` exported but only used internally
- `src/utils/storage.ts:11` — no other module or test imports it. Drop `export` or document it as the runtime mirror of `__COMFORT_DEFAULTS__`.

### L10 — `tag:minor` / `tag:major` npm scripts duplicate `just tag minor|major`
- `package.json:40-41` vs `justfile` `tag` — same `scripts/tag-release.sh`, nothing references the npm variants. Delete or document.

### L11 — `DEBUG_PORT` parsing and hard-coded browser paths in wxt config
- `wxt.config.ts:7` — `parseInt` yields `NaN` → `--remote-debugging-port=NaN` for a malformed env value; `:39-45` hard-codes macOS `/Applications/...` paths for all browsers. DX nit on non-macOS dev machines.

---

## Info

### I1 — No CI at all
- `.github/` has only PR template + issue templates; no `workflows/`. All gates (`compile`, `test`, `coverage`, `test-e2e`, `validate-release`) run locally only; `tag-release.sh` blocks on clean tree/branch but not on checks (justfile `tag` runs `verify` first, so the local gate exists — nothing forces it).

### I2 — Shadow-DOM media/emoji not processed
- All DOM walks/observers are light-DOM only (bg-image-detector, emoji-blocker, peek sync). Media/emoji inside web components (e.g. `yt-live-chat`) are neither blurred nor hidden. Documented limitation — should be a conscious product decision.

### I3 — Brief unblurred flash on page load (FOUC)
- `index.ts:35-37` — `document_start` script awaits `getSettings()` before injecting blur styles. Inherent trade-off (never blur when the user disabled the extension); a synchronous default-seeded style could close the window.

### I4 — Emoji regex splits ZWJ sequences, misses flags
- `emoji-blocker.ts:3` — `/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu` matches single code points: ZWJ families wrap per-component (ligature may render inconsistently); flag emoji (regional-indicator pairs) never match. Cosmetic; hiding still works for common cases.

### I5 — Local profile has lost its "aggressive testing" distinctiveness
- `config/profiles/local.toml` vs `public.toml` — after the defaults change they differ only in `blockEmojis` (and Safari bundle id); README still frames `local` as aggressive-testing defaults. Decide whether two profiles still earn their keep.

### I6 — Config wiring: no drift found
- `wxt.config.ts` ↔ `scripts/profile-config.mjs` ↔ `config/profiles/*.toml` ↔ `profile-config.d.mts` all consistent; justfile targets ↔ package.json scripts ↔ README command table consistent; `validate-release.mjs` allowlist matches `zip.includeSources` exactly. The only drift is *documentation about* defaults (M2/M3/M4, I5).

### I7 — Unused dependencies: none
- All seven devDependencies exercised; no runtime `dependencies` at all — matches the no-network design.

### I8 — Dead-code sweep otherwise clean
- All exported functions/constants in unchanged files have consumers; CSS tokens/selectors/keyframes in `panel.css`/`options/style.css` all referenced; no orphan fixtures (`fixture.html`, `brand/store/demo/*`, `brand/store/textures/paper-ink.jpg` consumed). Dead-code inventory beyond L1/L8/L9/L10: empty.

---

## Cross-cutting integration notes (from working-tree review, complements the uncommitted doc)

- **Storage write queue** (`src/utils/storage.ts:27,102-118`): sound design — read-modify-write serialized, failure can't poison the chain. The L2 toggle-decision race is the only gap.
- **Content entrypoint wiring** (`comfort.content/index.ts` `applySettings`): handler lifecycle (setup/teardown/`updateRevealMode`) matches click-handler's exported API; double `clearAllRevealed` on teardown is harmless.
- **Background badge state machine** (`background.ts`): correct `action`/`browserAction` fallback, all API calls guarded; badge glyphs/colors match docs.
- **Peek shortcut**: `keydown` fallback + runtime-message pulse are complementary; M6 failsafe gap is the only defect found.
- **Fixture server** (`tests/e2e/server.mjs`): `HOST` env now binds 0.0.0.0 — loopback clients unaffected; needed for non-loopback WebDriver harnesses. Playwright webServer auto-start covers both specs (port 4177 consistent).

## Suggested order of work

1. H1 bg-image mark re-sync (visible mis-blur on dynamic sites).
2. M6 peek failsafe re-arm, M1 `characterData` (user-facing behavior).
3. M2/M3/M4 docs drift (release-facing correctness).
4. L2 toggle race, L5 TLD list (correctness).
5. L1/L8/L9/L10 dead-code removal; L7 coverage-config honesty.
