# Safari Automation & Iteration Workflow

Updated 2026-08-19.

## 1. Safari Extension Architecture on macOS

The project contains a Safari Web Extension built with WXT and packaged into a native macOS host application:
- Extension bundle: `safari/` Xcode project generated via `wxt`.
- Build and installation command:
  ```fish
  cd .. && just safari-build
  ```
- Target installed app location:
  `/Applications/Cognitive Comfort.app` (or `~/Applications/Cognitive Comfort.app` if non-root)
- **Build Promotion & Launch Rule**:
  - If Safari is running while building, macOS cannot overwrite the active bundle in `/Applications/` and instead stages it at `/Applications/Cognitive Comfort.app.pending`.
  - Quit Safari normally before running `just safari-build` so the bundle installs directly and opens the wrapper app.
  - Launch Safari normally via `open -a Safari`.

---

## 2. User Constraints & Automation Boundaries

- **User Constraint**: **Do NOT script Safari via `osascript tell application "Safari"` or synthetic AppleScript automation.** Use normal Safari UI and standard `open -a Safari` actions.
- **Verification Boundary**:
  - **Vitest Unit Suite (`pnpm test` / `just test`)**: 93 unit tests covering storage, domain logic, styles generation, emoji blocking, and click handler clustering/isolation.
  - **Playwright Chromium Suite (`tests/e2e/extension.spec.ts`)**: 9 automated acceptance tests in a headless persistent extension context covering effective state ledger, base-domain inheritance, pause honesty, non-web tab detection, emoji rules, options page filed rules management, keyboard traversal, and reduced-motion emulation.
  - **Playwright WebKit Engine Suite (`tests/e2e/webkit-safari.spec.ts`)**: 8 automated WebKit rendering engine tests verifying WebKit CSS cascade specificity (`:not([data-comfort-revealed="true"])`), YouTube card hover reveal & dynamic preview player mounting reconciliation, YouTube Shorts shelf isolation, multi-layer scrim coordinate penetration, generic video stacks, dynamic node replacement, and reveal modes.
  - **Native Safari Runtime**: Building the wrapper app via `just safari-build` and launching Safari verifies artifact compilation, signing, and macOS bundle installation. Per `docs/browser-testing.md`, final release verification for Safari requires manual smoke testing in the native browser (enabling the extension in Safari Settings > Extensions).
- **User Settings Rule**: Never mutate user storage/preferences directly during automated runs; test with configured profile defaults.
