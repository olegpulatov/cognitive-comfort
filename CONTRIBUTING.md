# Contributing

## Setup

```fish
pnpm install --frozen-lockfile
just compile
just test
just test-coverage
just test-e2e
```

Use `main` for reviewed changes. Build release candidates with `BUILD_PROFILE=public`; do not add machine paths, secrets, deployment, signing, or store submission to this repository.

## Change evidence

Every behavior change needs a test that fails on a plausible regression. Core media selectors, CSS, reveal geometry, background detection, emoji processing, popup/options GUI, shortcuts, and peek timing are load-bearing.

A pull request that changes core media/CSS/geometry or GUI behavior must include:

1. Behavioral regression test covering the changed contract.
2. Named browser and version evidence from the relevant rows in `docs/browser-testing.md`.
3. Before/after result and console-error status.

Do not alter blur/brightness values, transition CSS, selectors, cluster thresholds, popup/options layout, public defaults, shortcut matching, peek timing, or inline filter restoration as unrelated cleanup.

## Required checks

```fish
just --dump --dump-format json >/dev/null
just --fmt --check
just compile
just test
just test-coverage
just test-e2e
env BUILD_PROFILE=public just zip-all
just validate-release chrome
just validate-release edge
just validate-release firefox
```

Keep bundles non-minified and source packaging allowlisted. Never commit credentials, certificates, provisioning profiles, Apple team identifiers, private product material, generated browser profiles, or release evidence containing private data.
