# Privacy Policy

Cognitive Comfort processes pages locally to blur distracting media and optionally hide emoji presentation.

## Data collection and transmission

Cognitive Comfort does not collect, transmit, sell, or share personal data.

- It makes no network requests of its own.
- It has no account system, analytics, advertising, or tracking SDK.
- It does not store page content, credentials, or browsing history.
- It does not send inspected page data anywhere.

Normal page and browser network activity continues independently of the extension.

## Local page processing

The content script runs on matching web pages and locally inspects:

- DOM elements needed to identify images, video, canvases, supported embeds, SVG, and CSS background media.
- Computed styles and element geometry needed to apply blur and reveal behavior.
- Text nodes needed for optional emoji presentation control.

When emoji hiding is enabled, matching emoji text is temporarily wrapped in local `<span>` elements so CSS can hide it. Disabling the feature restores visible text. This processing remains in the page and is never persisted or transmitted.

## Stored data

The extension stores only preferences in `browser.storage.local` under `comfortSettings`:

- Enabled and paused state.
- Blur amount, scope, and reveal mode.
- Emoji default.
- Domain names with explicit media or emoji overrides.
- Schema version used for compatible settings updates.

No page content is stored. Browser-local settings persist across restarts and extension updates and are removed when extension storage is cleared or the extension is uninstalled.

## Permissions

- `storage` saves settings and explicit domain overrides locally.
- `activeTab` lets popup and command actions identify the active tab and apply current-site controls.
- `<all_urls>` content-script matching is required to apply the single-purpose media and emoji presentation behavior on pages the user visits.
- Keyboard commands provide pause, site toggle, global toggle, and peek controls.

Permissions are not used to observe, collect, or transmit activity.

## Third parties

Cognitive Comfort does not load third-party scripts, embed trackers, or communicate with an extension-operated server.

## Children's privacy

The extension collects no data from anyone, regardless of age.

## Changes

Policy changes are reflected in this source repository.

## Contact

Open a repository issue for privacy questions that do not expose sensitive information. Use GitHub private vulnerability reporting for security concerns.
