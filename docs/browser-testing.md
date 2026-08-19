# Stable Browser Test Matrix

Use `tests/e2e/fixture.html` through its local server for every browser. Record browser and OS versions, pass/fail rows, console output, and screenshots outside this public repository.

## Prepare artifacts and fixture

```fish
env BUILD_PROFILE=public just build-all
node tests/e2e/server.mjs
```

Open `http://127.0.0.1:4177/fixture.html` after loading the artifact:

- Chrome stable: `.output/chrome-mv3`
- Edge stable: `.output/edge-mv3`
- Firefox stable 140 or newer: `.output/firefox-mv2/manifest.json` as a temporary add-on
- macOS Safari: generated Xcode project from `env BUILD_PROFILE=public just safari-project`, or the operator's signed wrapper build

## Required checks

Repeat every row in Chrome, Edge, Firefox, and Safari.

| Behavior | Expected result |
| --- | --- |
| Normal image | Computed filter contains `blur(50px)` under the public profile. |
| CSS backgrounds | Initial and dynamically inserted background fixtures receive `data-comfort-bg-image` and blur. |
| Small bare SVG | Blurs under the public all-media scope; remains visible after switching to content scope. |
| Linked media | Under Hover + Click Lock, hover reveals and activation follows the link. Under Click Only, the first activation reveals without navigation and the second follows the link. |
| Pause / Resume | Pause removes media blur; Resume restores it. |
| Per-site media override | Show disables blur for `127.0.0.1`; Global restores inherited behavior. |
| Emoji controls | Enabling emoji hiding changes emoji presentation but not media state; editable emoji text remains visible. |
| Reveal modes | Click, Hover, and Hover + Click Lock each match their labels and clear stale reveal state when changed. |
| Peek | The browser's current Peek assignment reveals media while held, then restores blur after release. The suggested default is Control+Shift+A and may be changed or unset. |
| Shortcut settings | Popup Edit control opens the browser's extension-shortcut settings or shows the documented manual path. |
| Persistence | Global defaults and site overrides survive browser restart. |
| Diagnostics | Fixture, popup, background, and browser consoles contain no errors. |
| UI regression | Popup/options labels, control order, and layout remain unchanged. |

Also inspect normal/small/linked images, video, canvas, iframe, SVG, nested media, editable text, and dynamic mutations. Confirm Firefox manifest v2 uses `cognitive-comfort@olegpulatov.github.io`; Chrome and Edge manifests v3 contain no Gecko block.

## Browser-specific evidence

- Chrome stable: load the Chrome MV3 directory and complete the full matrix.
- Edge stable: validate the Edge artifact with `just validate-release edge`, load its MV3 directory in real Edge, and complete the full matrix.
- Firefox stable: validate with `just validate-release firefox`, complete the matrix in real desktop Firefox, then run Mozilla add-on lint/signing preflight without submitting. The manifest intentionally omits `gecko_android` and targets desktop Firefox; current `web-ext lint` reports one Android-only minimum-version warning while desktop validation remains clean.
- macOS Safari: generate/update the project, compile it with Xcode, enable the extension, and complete the matrix. If signing is unavailable, record unsigned project generation plus Xcode compile as partial evidence and mark Safari not release-ready.

## Automation boundary

`just test-e2e` builds the public Chrome artifact, runs 10 Chromium extension acceptance tests, and runs 11 complementary WebKit engine regressions. Chrome receives this automated smoke plus a real stable-browser pass. Edge receives the same artifact assertions plus a real Edge smoke. Playwright does not load the Firefox or Safari extension artifacts, so both require real-browser manual smoke. No automated result is evidence of a store submission.
