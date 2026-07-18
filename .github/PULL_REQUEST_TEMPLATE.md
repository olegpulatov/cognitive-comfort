## Change

Describe observable behavior changed and why.

## Verification

- [ ] `just compile`
- [ ] `just test`
- [ ] `just test-coverage`
- [ ] `just test-e2e`
- [ ] Relevant public artifacts pass `just validate-release <browser>`

## Core behavior / GUI evidence

Complete when media selectors, CSS, reveal geometry, background/emoji behavior, popup/options GUI, shortcuts, or peek behavior changes.

- [ ] Behavioral regression test added or updated
- [ ] Named browser/version evidence recorded
- [ ] Popup/options layout checked when relevant
- [ ] No page or extension console errors

Browser evidence:

## Privacy and release boundary

- [ ] No secrets, credentials, machine paths, signing material, private product files, or generated browser profiles
- [ ] No new data collection, transmission, permission, or store-submission behavior
- [ ] Source ZIP allowlist remains valid
