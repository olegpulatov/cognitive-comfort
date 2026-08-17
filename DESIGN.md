---
name: Cognitive Comfort
description: A dim reading-room catalog system for the extension's popup and options surfaces.
colors:
  ground: "#14110e"
  ground-lift: "#1a1713"
  sheet: "#201c17"
  sheet-raised: "#262019"
  sheet-hover: "#2d251c"
  rule: "#332c23"
  rule-strong: "#4a4032"
  ink: "#eee6d8"
  ink-quiet: "#b0a390"
  ink-faint: "#96897a"
  brass: "#cba463"
  brass-quiet: "#8d7240"
  brass-wash: "rgba(203, 164, 99, 0.13)"
  stamp: "#c4705a"
  stamp-ink: "#f0cfc4"
  stamp-wash: "rgba(196, 112, 90, 0.12)"
typography:
  body:
    fontFamily: "Literata, Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    fontVariation: "'opsz' 14"
  wordmark:
    fontFamily: "Literata, Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.01em"
    fontVariation: "'opsz' 18"
  sheet-subject:
    fontFamily: "Literata, Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif"
    fontSize: "17px"
    fontVariation: "'opsz' 18"
  label:
    fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Cascadia Mono, Menlo, monospace"
    fontSize: "11px"
    letterSpacing: "0.11em"
  ledger:
    fontFamily: "Literata, Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif"
    fontSize: "15px"
    fontVariation: "'opsz' 16"
rounded:
  crisp: "3px"
spacing:
  hair: "4px"
  tight: "8px"
  standard: "12px"
  wide: "18px"
  section: "24px"
components:
  sheet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.crisp}"
    padding: "18px 18px 12px"
  press:
    backgroundColor: "{colors.sheet-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.crisp}"
    padding: "6px 12px"
  segment-checked:
    backgroundColor: "{colors.brass-wash}"
    textColor: "{colors.ink}"
  notice:
    backgroundColor: "{colors.stamp-wash}"
    textColor: "{colors.stamp-ink}"
    rounded: "{rounded.crisp}"
    padding: "8px 12px"
---

# Design System: Cognitive Comfort

## Overview

**Creative North Star: "The Reading Room Card Catalog"**

The system is a reading room's card catalog rather than a generated dark-app dashboard: an ink-umber ground, dim parchment sheets, hairline rules, one brass accent, Literata catalog lettering, system mono for measured information, and near-crisp paper forms. It refuses translucent gradient cards, radial glows, glass effects, and equal-weight pills.

The popup leads with the effective state of the current page. Filing a rule settles its sheet with a brass filing mark; pausing stamps the record instead of washing live controls gray. The warm parchment world still does not match the product's lavender logo; do not smooth over that open identity mismatch.

**Key Characteristics:**
- Flat, layered paper surfaces on an ink-umber ground.
- Serif content paired with mono uppercase catalog legends and measurements.
- Brass reserved for selection, focus, inheritance, and filing feedback.
- Near-crisp corners and visible hairline structure.
- State expressed with words and semantics, never color alone.

## Colors

The palette separates dark environmental layers, parchment text, brass interaction cues, and a muted red-orange pause/error stamp.

### Primary
- **Filing Brass** (`brass`): checked-segment underline and inheritance dot, slider thumb and value, links, focus ring, and active ledger mark.
- **Quiet Brass** (`brass-quiet`): hover borders, link underlines, scrollbar hover, shortcut-help rule, and text-selection fill.
- **Brass Wash** (`brass-wash`): low-contrast fill behind checked segments; never the only selected-state cue.

### Secondary
- **Cancellation Stamp** (`stamp`): paused ledger mark, engaged pause border, “Not set” assignments, failure border, and physical pause stamp.
- **Stamp Ink** (`stamp-ink`): readable text on engaged-pause and failure washes.
- **Stamp Wash** (`stamp-wash`): engaged pause and failure background.

### Neutral
- **Ink-Umber Ground** (`ground`): page base, segment wells, scrollbar track, focus-ring separator, selection text, and stamp backing.
- **Lifted Ground** (`ground-lift`): upper stop of the fixed body gradient.
- **Dim Parchment Sheet** (`sheet`): standard sheet surface.
- **Raised Parchment Sheet** (`sheet-raised`): resting press surface and segment hover surface.
- **Hovered Parchment Sheet** (`sheet-hover`): darker press hover surface.
- **Hairline Rule** (`rule`): sheet outlines and internal separators.
- **Strong Rule** (`rule-strong`): masthead divider, segment frame/dividers, inactive ledger ring, slider track, and press border.
- **Primary Parchment Ink** (`ink`): body copy, subjects, labels, buttons, active segments, and shortcut assignments.
- **Quiet Parchment Ink** (`ink-quiet`): supporting copy, legends, inactive segments, and ledger explanations.
- **Faint Parchment Ink** (`ink-faint`): metadata, empty subjects, disabled controls, scale labels, and secondary segment details. At `#96897a` it clears WCAG AA for small text against the darkest through raised system surfaces: 5.51:1 on `ground`, 5.24:1 on `ground-lift`, 4.97:1 on `sheet`, and 4.72:1 on `sheet-raised`. This is the system floor for small text; never introduce a dimmer small-text foreground. It does not clear 4.5:1 on `sheet-hover` (4.42:1), so faint small text must not be placed on that transient surface.

**The One Brass Rule.** Brass marks interaction, focus, inheritance, and filing; it is not a decorative second foreground.

**The Small-Text Floor Rule.** `ink-faint` is the dimmest permitted foreground for small text on resting system surfaces. Never lower its contrast or invent a fainter metadata color.

**The Parchment, Not Glass Rule.** Surfaces are opaque dark parchment with rules. Do not introduce transparency effects, radial glows, or glass cards.

## Typography

**Display Font:** Literata, self-hosted as `literata-latin-var.woff2`, with old-style serif fallbacks.
**Body Font:** Literata, with the same fallback stack.
**Label/Mono Font:** `ui-monospace`, SFMono-Regular, SF Mono, Cascadia Mono, Menlo, monospace.

The bundled variable face declares weights 400–600. Body content uses optical size `opsz` 14; ledger text uses `opsz` 16; wordmarks and sheet subjects use `opsz` 18. Content and action copy remain serif. Catalog legends, metadata, measured values, scales, shortcut assignments, and the pause stamp use mono.

### Hierarchy
- **Sheet Subject** (17px, `opsz` 18): domain or primary record subject; empty state drops to 15px italic. Long domains use `overflow-wrap: anywhere`, never character-by-character `word-break`.
- **Wordmark** (600, 15px, 1.2, `opsz` 18): surface identity.
- **Ledger Text** (15px, `opsz` 16): effective-state sentence, capped at `max-width: 64ch`.
- **Body / Control** (13px, 1.45, `opsz` 14): body copy, field legends, actions, links, and segments.
- **Catalog Label** (11px, 0.11em tracking, uppercase): sheet legends and compact filed-rule legends.
- **Metadata / Note** (11px): supporting notes, segment details, scales, imprint, and stamp. Field notes are capped at `max-width: 64ch`; shortcut assignments are a 12px exception with 0.08em tracking.

**The Catalog Voice Rule.** Legends are mono uppercase with tracked spacing; content and actions are serif. Do not turn ordinary content into catalog caps.

**The Reading Measure Rule.** Ledger sentences and field notes stop at 64 characters to protect comprehension on wide settings surfaces.

## Layout

Spacing has five reusable steps: hair (4px), tight (8px), standard (12px), wide (18px), and section (24px). Sheets use wide horizontal/top padding with standard bottom padding. Shared sheet siblings use standard separation; options increases major sheet separation to section spacing.

The popup shell is exactly `html { width: 372px }`. The browser owns popup height and scrolling; `body.popup-shell` only contains overscroll. Content sits within 16px side/top and 14px bottom padding. Do not add a fixed/max height or an internal overflow scroller.

The options surface is a centered full-width column capped at 720px, padded 40px 20px 56px. At 560px and below its padding becomes 28px 14px 40px. Filed-rule rows use a two-column grid: a flexible subject and a control column of at least 300px at a 1:1.5 ratio, separated by 18px; at 560px they collapse to one column with 12px separation.

**The Surface Density Rule.** Use standard sheet gaps in the compact popup and section gaps in options. Do not impose options-page breathing room on the popup.

## Elevation & Depth

The system is flat and layered: ground, lifted ground, sheet, raised sheet, and hover sheet establish depth through tone and hairline rules. There are no resting drop shadows. The shared focus ring is a 2px ground separator plus a 4px brass outer ring; filing briefly uses an inset brass edge.

**The Flat Record Rule.** A sheet is defined by tonal layering and a one-pixel rule, not elevation shadow.

**The Forced-Colors Focus Rule.** Every new press-like control must pair `outline: 2px solid transparent` and `outline-offset: 2px` with the shared box-shadow ring on `:focus-visible`. Forced-colors mode can drop box shadows and reveal the transparent outline, so the outline is required even when visually redundant. Native radios retain a solid inset outline, and the range thumb retains its dedicated ring.

## Shapes

The core radius is near-crisp (3px) for sheets, segment frames, presses, and notices. The pause stamp and focused text link use 2px; the slider thumb uses 1px. Ledger/inheritance marks are circular and the scrollbar thumb is 5px.

Rules are structural: solid hairlines define sheets and controls; dotted rules separate shortcut rows. Avoid pill silhouettes for equal-weight choices.

## Components

### Masthead
Use a flex masthead with a wordmark and optional mono uppercase note; pair it with a standard press action when needed.

### Status Ledger and Paused State
The ledger contains a redundant state mark followed by a sentence; an optional explanation follows within that sentence block. Default uses brass, off uses an outlined faint ring, and paused uses stamp color. Dynamic ledgers use `aria-live="polite"`.

**The Live Controls Stay Live Rule.** A paused or otherwise out-of-effect state is expressed by the ledger sentence plus the visible `.stamp` element, never by reducing opacity of live controls or their sheet subject. Controls still work while paused, and newly saved rules must remain legible even when not currently in effect. There is no suspended-sheet variant; do not recreate one.

### Sheets
A sheet is the standard bordered parchment container. Give every section an accessible heading using `.sheet-legend`; a right-side `.sheet-subject` may identify the current record. Both surfaces title the blur-strength sheet **Blur**.

Use `.sheet-filed` after a successful change to replay the 220ms, 3px filing settle. It is wired per changed sheet on both surfaces and per filed-rule row in options. Never animate a failed save. Reduced motion compresses animations and transitions to 1ms.

A new sheet therefore needs: a `.sheet` section; an accessible heading linked with `aria-labelledby`; fields built from the patterns below; a clear status/error route; and its own element passed to the successful persistence path so filing feedback lands on the changed record.

### Fields
Use a real `<fieldset class="field">` with `<legend class="field-legend">` for grouped choices. Adjacent fields receive 18px separation. A field note follows its control and is capped at 64ch; inherited notes use brass only when their text also names the inheritance source. A single non-grouped control uses a `.field` container with an associated `<label class="field-legend">`; the blur-strength label on both surfaces follows this rule.

### Segmented Radio Groups
Use native radio inputs inside labels, with the visible `span` immediately after each input. Checked, hover, focus, and disabled styling depends on `input + span`; do not substitute buttons or class-only state. Add `.is-stacked` for vertical descriptive choices and place optional detail text inside the visible span. An inherited checked choice gets a brass dot plus explanatory text naming the source.

### Presses and Links
A press is a bordered serif action with raised-sheet fill; hover uses `sheet-hover` and a brass-shifted border. Text actions are brass and underlined. Both apply the Forced-Colors Focus Rule.

The pause button changes its visible label between **Pause** and **Resume** and may use `.is-engaged` for visual emphasis. The changing label carries the state; it has no `aria-pressed` because pausing is a command/state transition rather than a persistent toggle-button contract.

### Fader
The fader head aligns an associated `.field-legend` label and mono value. The range input is followed by an aria-hidden scale and optional field note. The track is a 2px strong rule, the thumb is a 4×18px brass filing tab, and keyboard focus rings the thumb in WebKit and Gecko.

### Shortcut Register
Shortcut rows pair a plain name with the browser's current mono assignment. Add the unavailable style only when the displayed value is “Not set.” Assignments are browser-owned strings, not decorative keycaps; provide the browser-specific route to change them.

### Filed Site Rules
Each options filed-rule row is an `<article>` labeled through `aria-labelledby` by its domain `<h3 class="sheet-subject">`. The subject wraps anywhere for long domains. Controls use the standard fieldset/segment patterns, and the Remove action has a domain-specific accessible name; removal is announced through the existing status element. When the domain set is unchanged, update radios in place. Rebuild only after a domain is added or removed, then restore focus by control id.

### Notice and Imprint
A notice is an announced save/removal status using stamp border, wash, and explicit text; toggle the native `hidden` attribute. The imprint is a wrapping mono metadata row with two spans: release/version and hash, then build time and profile.

## Do's and Don'ts

### Do:
- **Do** build new sheets from the existing sheet, legend, field, spacing, and color patterns.
- **Do** use native headings, fieldsets, legends, labels, radios, buttons, and ranges with explicit accessible relationships.
- **Do** apply the Forced-Colors Focus Rule to every new press-like control.
- **Do** keep small text at `ink-faint` or brighter and keep ledger/field-note prose within 64ch.
- **Do** express paused/out-of-effect state with the ledger sentence and stamp while keeping controls fully legible.
- **Do** replay filing feedback only after successful persistence, on the specific sheet or filed-rule row that changed.

### Don't:
- **Don't** invent colors, spacing, radii, or component aliases; use the complete root token inventory.
- **Don't** build segmented choices from buttons, spans alone, or `.active` classes.
- **Don't** use immutable keycap illustrations or assume physical key positions.
- **Don't** introduce translucent cards, radial glows, glass effects, resting drop shadows, or equal-weight pills.
- **Don't** add a suspended-sheet opacity state or `aria-pressed` to the pause command.
- **Don't** constrain the popup's height or create an internal popup scroller; the browser owns both.
