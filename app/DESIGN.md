---
name: ENF (Ethereum Naming Fleet)
description: A light, ENS Manager family dashboard that shows one agent fleet mounted under many .eth names, verified live from chain.
colors:
  bg: "#f6f6f6"
  surface: "#ffffff"
  surface-2: "#f6f6f8"
  border: "#e8e8ec"
  border-strong: "#d6d6dd"
  text: "#1e1e21"
  text-2: "#6b6b76"
  text-3: "#6e6e7a"
  blue: "#3889ff"
  blue-strong: "#1a5fd0"
  blue-tint: "#eaf2ff"
  green: "#0e7050"
  green-line: "#1ea77a"
  green-tint: "#e5f5ee"
  red: "#c7301b"
  red-tint: "#fcebe8"
  orange: "#984b00"
  orange-tint: "#fdf0e1"
  grey: "#6b6b76"
  grey-tint: "#efeff2"
  dead-line: "#c8c8d0"
typography:
  display:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 900
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  lede:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 500
  body:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
  tag:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
  meta:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  wordmark:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 900
    letterSpacing: "-0.02em"
  display-mobile:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 900
  input:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 500
  map-name:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
  map-label:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
  map-sub:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18.5px"
    fontWeight: 500
  map-mono:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "17.5px"
  map-tag:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
  mono:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.92em"
    letterSpacing: "-0.01em"
rounded:
  ctl: "10px"
  card: "16px"
  pill: "999px"
spacing:
  tight: "8px"
  stack: "10px"
  group: "16px"
  gap: "20px"
  card-x: "24px"
  gutter: "32px"
  gutter-mobile: "16px"
components:
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "22px 24px 24px"
  button-action:
    backgroundColor: "{colors.blue-tint}"
    textColor: "{colors.blue-strong}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "42px"
  button-neutral:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "42px"
  button-neutral-hover:
    backgroundColor: "{colors.surface-2}"
  search-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.ctl}"
    padding: "0 16px 0 44px"
    height: "48px"
  tag:
    rounded: "{rounded.pill}"
    typography: "{typography.tag}"
    padding: "0 10px"
    height: "26px"
  tag-lg:
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "34px"
  chip:
    backgroundColor: "{colors.surface-2}"
    typography: "{typography.label}"
    rounded: "{rounded.ctl}"
    padding: "0 12px"
    height: "40px"
  block-pill:
    backgroundColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  verdict-cell:
    rounded: "{rounded.ctl}"
    typography: "{typography.tag}"
    height: "46px"
---

# Design System: ENF (Ethereum Naming Fleet)

## Overview

**Creative North Star: "The ENS Manager, Extended"**

ENF plays the category standard straight. It is meant to sit beside the ENS Manager app (app.ens.domains) on a projector and read as the same family: a flat neutral grey canvas, white rounded panels with hairline borders, one blue for everything you can press or select, and Satoshi for every word. Nothing is invented for novelty; the craft is in restraint, density that holds up from three metres, and state that is legible without reading.

The page is a product page, not a stats dashboard. The fleet map is the largest surface and everything else explains what the map just did. Colour is spent on meaning: blue marks action and selection, and the verdict colours (green, red, orange, grey) mark state. Surfaces carry no shadow; depth comes from white on grey plus a 1px border.

The system is light-first and pinned light for the projected demo. Dark tokens exist, but only as an opt-in override that nothing in the build sets.

**Key Characteristics:**
- Neutral grey canvas (#f6f6f6), white panels, 1px cool hairline borders, no shadows at rest.
- One radius scale: 16px panels, 10px controls, full pill for tags, buttons and status pills.
- ENS blue is the only action and selection colour; verdict colours are for state only.
- Satoshi throughout, heavy weights (700 and 900) for structure, tabular numerals for block numbers and counts, mono only for addresses and hashes.
- Phosphor icons in two weights with fixed jobs: fill for status and verdict, bold for action and UI.
- Dead or removed things are drawn as dashed and grey, never faded.

## Colors

A neutral light palette with one blue accent and four verdict hues, each verdict hue paired with a pale tint of itself.

### Primary
- **ENS Blue** (`blue`): the brand wordmark, focus outlines, search focus border and its 4px halo, hovered map nodes, the selected coverage cell, and the fleet registry node's 2px outline.
- **ENS Blue Deep** (`blue-strong`): text and icons on blue surfaces. Secondary button labels, the fleet node's labels, focused table headers, the pending outcome line, the "Local fork" tag.
- **ENS Blue Wash** (`blue-tint`): the fill of secondary action buttons, the fleet registry node, and blue tags.

### Verdict (state colours)
- **Endorsed Green** (`green`) on **Mint Wash** (`green-tint`): the Verified verdict, passing checks, Active agents, clean settlement, successful outcomes. **Signal Green** (`green-line`) is the brighter stroke for endorsed map edges, the legend swatch and the live-block dot.
- **Counterfeit Red** (`red`) on **Blush Wash** (`red-tint`): the Counterfeit verdict, failing checks, counterfeit doorway nodes and edges, undeclared doorway headers, input errors.
- **Flag Orange** (`orange`) on **Apricot Wash** (`orange-tint`): the Flagged verdict (endorsed doorway, flagged settlement address) and chain warnings such as an unreachable RPC.
- **Not-live Grey** (`grey`) on **Pewter Wash** (`grey-tint`): the Not live verdict, Fired and Unmounted tags, the unknown-screening notice.

### Neutral
- **Neutral Canvas** (`bg`): the page and the translucent sticky top bar. A true neutral grey that matches the ENS Manager reference, not a cool grey.
- **Panel White** (`surface`): cards, the search field, the block pill, map nodes, neutral buttons.
- **Recessed Grey** (`surface-2`): chips, check-row hover, and the fill of dead or fired nodes.
- **Hairline** (`border`) and **Hairline Strong** (`border-strong`): card and control borders; the strong step is the hover border and the stroke of map nodes and structural map edges.
- **Ink** (`text`): primary text. **Slate** (`text-2`): secondary text, section labels, lede, dead node names. **Mist** (`text-3`): placeholders, carets, and resting icons. Mist measures about 3.4:1 on white, so it is not a text colour for anything a judge must read.
- **Dead Line** (`dead-line`): dashed strokes and arrowheads for edges that no longer carry a live mount.

### Named Rules
**The One Blue Rule.** ENS blue is the only colour for action and selection: buttons, focus, hover, the selected cell. No verdict colour ever fills a button.

**The Verdict Is State Rule.** Green, red, orange and grey mark state only: verdicts first, then the plain status readouts that share their meaning (live block, RPC down, a transaction's outcome, Active or Fired). They are never decoration, section colour, or action colour.

**The Blue Kill Switch Rule.** Destructive kill switches (Unmount, Fire, Use a flagged address) are blue secondary buttons. Only the leading icon carries the risk colour: red for destructive, orange for warning. Restore and Reset are neutral white buttons.

**The Pinned Light Rule.** The demo renders light. Dark tokens live only behind the opt-in `:root[data-theme="dark"]` selector and nothing sets that attribute; `color-scheme` and the viewport theme colour are pinned light. Do not add a system-preference dark switch.

## Typography

**Display Font:** Satoshi (with ui-sans-serif, system-ui, sans-serif), self-hosted at 400, 500, 700 and 900
**Body Font:** Satoshi
**Label/Mono Font:** ui-monospace stack (SF Mono, Menlo, Consolas), for addresses and hashes only

**Character:** One geometric grotesk at heavy weights does all the structural work, the way the ENS app does. Hierarchy comes from weight and size, never from uppercase or tracking.

### Hierarchy
- **Display** (900, 34px, 1.1, -0.02em; 28px under 820px): the page title, which is the fleet's canonical name.
- **Headline** (900, 22px, -0.01em): the inspected name at the top of the verifier panel.
- **Title** (700, 20px, -0.01em): card titles.
- **Lede** (500, 19px; 17px under 820px, max 68ch): the one-sentence fleet summary in Slate, with counts in bold Ink and verdict counts in their verdict colour.
- **Body** (400, 16px, 1.45): base text.
- **Label** (700, 15px): section labels within cards (Slate), button and chip text, table headers, activity lines.
- **Tag** (700, 14px): tags, coverage cells, legend.
- **Meta** (500, 13px): activity block and time lines, check IDs, input errors.
- **Map type** (map-name 22, map-label 18, map-sub 18.5, map-mono 17.5, map-tag 17): SVG user units inside the fleet map viewBox, which renders at about 0.83x on a 1440 screen, so labels land near 15px and tags near 14px for a room 3 m away. The stacked phone map uses the HTML ramp (label 15/17).
- **Wordmark** (900, 24px), **Input** (500, 17px) and **Display on phones** (900, 28px) are single-use steps.
- **Mono** (0.92em, -0.01em): shortened addresses and transaction hashes, check evidence.

### Named Rules
**The Sentence Case Rule.** All labels are sentence case at normal tracking. No uppercase, no letter-spaced labels.

**The Tabular Numbers Rule.** Block numbers and counts use tabular numerals so live updates do not jitter.

**The Mono Is For Hex Rule.** Mono appears only on addresses, hashes and raw check detail. Names such as `support.shopa.eth` are set in Satoshi.

## Layout

A centred column capped at 1360px, with 32px side gutters (16px under 820px). The sticky top bar is 76px tall and has three columns: the wordmark left, a search field up to 560px wide in the centre, the block pill right. Under 820px the search drops to its own full-width row and the wordmark subtitle hides.

Under the title row the page splits into a main column and a 400px side column with a 20px gap. The main column holds the fleet map, then Coverage and Activity. The side column holds the kill switches and the verifier. At 1180px the side column moves below the main column as two equal columns; at 820px everything is one column.

Spacing rhythm: 20px between cards, 22/24px card padding (18/16px on mobile), 16px between grouped sections inside a card with a hairline between groups, 8px between buttons, chips and list items, 10px for small stacks. Under 720px the SVG fleet map is replaced by a vertical stack of the same nodes joined by down arrows.

## Elevation & Depth

Flat. Cards and controls have no shadow at rest; depth is white on grey plus a 1px hairline border. The top bar uses a translucent canvas with a saturated backdrop blur so content passes beneath it. Shadows appear only as rings that show state, never as lift.

### Shadow Vocabulary
- **Focus halo** (`box-shadow: 0 0 0 4px color-mix(in srgb, var(--blue) 18%, transparent)`): the focused search field.
- **Selection ring** (`box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 18%, transparent)`): the selected coverage cell, together with a blue border.
- **Live dot ring** (`box-shadow: 0 0 0 3px color-mix(in srgb, var(--green-line) 22%, transparent)`): the block pill's live indicator.

### Named Rules
**The No-Lift Rule.** Nothing floats. A shadow is always a zero-offset ring that shows focus, selection or liveness.

## Shapes

One radius scale: 16px for cards, 10px for controls (search, chips, coverage cells, check lists, notices), and full pills for tags, buttons and the block pill. Borders are 1px hairlines. Map nodes use a 1.5px stroke, and the fleet registry node uses 2px blue. Edges are round-capped 3px curves (2px for the thin agent-to-resolver links) with small filled arrowheads.

### Named Rules
**The Dashed Means Dead Rule.** Dead state (an unmounted doorway or a fired agent) is shown by a dashed outline, a Recessed Grey fill, the name in Slate, a grey tag (Unmounted, Fired, Not live), a dashed Dead Line edge, and a greyscale avatar. It is never shown by lowering opacity. Opacity is reserved for temporary focus dimming of unrelated map nodes and edges, disabled buttons, and loading.

## Components

### Buttons
Pill-shaped, bold and quiet: the ENS secondary style.
- **Shape:** full pill (999px), 42px tall, 16px horizontal padding, 8px icon gap, 18px bold icon.
- **Action (secondary):** Blue Deep text on Blue Wash; on hover the wash deepens to 20% blue. Used for every kill switch.
- **Neutral:** Ink text on white with a Hairline border; on hover the border strengthens and the fill becomes Recessed Grey. Used for Restore and Reset.
- **Press / Busy / Disabled:** press scales to 0.97; busy swaps the icon for a spinning circle-notch and keeps full opacity; disabled drops to 45% opacity with a not-allowed cursor.

### Chips
- **Style:** 40px tall, 10px radius, Recessed Grey fill, Hairline border, a Mist label followed by a value (mono for hashes, tabular for blocks) and an optional 14px icon.
- **State:** a copy chip shows a green check for 1.2s after copying; hover strengthens the border; static chips (block number) show no press.

### Tags
- **Style:** full pill, 26px (34px large), a tone colour on its own tint, bold 14px (16px large). Verdict tags lead with a filled Phosphor verdict icon.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Panel White on the Neutral Canvas.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px Hairline.
- **Internal Padding:** 22px top, 24px sides and bottom; the header row is the title in Title style, with an optional aside such as a legend, count or tag.

### Inputs / Fields
- **Style:** the search field is 48px tall, white, with a 1px Hairline border, 10px radius, 17px medium text, and a bold magnifier inset at 15px.
- **Focus:** the border turns ENS Blue with the 4px focus halo.
- **Error:** a 13px red line appears just below the field.

### Navigation
The top bar is the only navigation: the ENF wordmark in ENS Blue at 900, the "Ethereum Naming Fleet" subtitle in Slate, the central search, and a pill that shows the live block (green dot with tabular block number). When the RPC fails, the pill turns orange on Apricot Wash.

### Fleet Map (signature)
An SVG diagram with doorways on the left, the fleet registry node (Blue Wash, 2px blue) in the centre, agents with gradient avatars, and the shared resolver on the right. Edges are coloured by mount state: Signal Green for endorsed, red for counterfeit, dashed Dead Line for not live. A counterfeit doorway gets a red stroke over a 60% Blush Wash. Hovering or focusing a node gives it a blue 2px stroke and dims unrelated nodes and edges. Tags inside nodes follow the Tags spec.

### Coverage Cell (signature)
A 46px, 10px-radius cell per agent and doorway, filled with its verdict tint, with the verdict colour for text and a filled icon. Hover shows a 45% tone border; selection shows a blue border plus the selection ring. When a verdict changes, the cell pulses once (a scale plus an expanding tone ring over 1.4s). Under 820px the label hides and only the icon remains.

### Activity Row
A 32px, 9px-radius icon tile in the event's tone over its tint, a bold 15px event line, and a meta line with a tabular block number. The newest row slides in from 6px above. The list uses two columns on wide screens.

### Check List
A bordered list with a 10px radius and hairline dividers. Each row has a filled 20px status icon, a bold title, a Mist check ID and a bold caret that rotates 180 degrees when the row opens to show mono evidence.

### Icons
Phosphor only. Use **fill** for status and verdict glyphs: verdict tags, coverage cells, check results, and verdicts on doorway chips. Use **bold** for action and UI glyphs: button icons, the search magnifier, carets, arrows, activity event icons, and warning icons in the top bar. Sizes are 14px in tags and chips, 16px in activity tiles, 18px in buttons and cells, and 20px for check results and stack arrows.

### Motion
One easing curve, `cubic-bezier(0.22, 1, 0.36, 1)`: 160ms for hover and border changes, 300ms for verdict colour changes on cells and map strokes, 200ms for dimming and caret rotation. Motion is disabled completely under prefers-reduced-motion.

## Do's and Don'ts

### Do:
- **Do** set the page on the neutral canvas (#f6f6f6) with white 16px-radius cards and 1px hairlines, as the ENS Manager does.
- **Do** keep ENS Blue as the only action and selection colour, and draw kill switches as blue secondary pills with a red (destructive) or orange (warning) icon.
- **Do** use Phosphor fill for status and verdict glyphs and Phosphor bold for action and UI glyphs.
- **Do** show dead doorways and fired agents with a dashed outline, a Recessed Grey fill, the name in Slate, a grey tag and a dashed edge.
- **Do** pair every verdict colour with its own tint, and lead verdict tags and cells with the filled verdict icon.
- **Do** use tabular numerals for block numbers and counts, and mono only for addresses and hashes.
- **Do** keep the theme pinned light; dark tokens stay behind `:root[data-theme="dark"]`, which nothing sets.

### Don't:
- **Don't** fill a button with green, red or orange, or use a verdict colour for decoration or section identity.
- **Don't** show dead or removed state by lowering opacity.
- **Don't** add drop shadows or lifted cards; shadows are zero-offset state rings only.
- **Don't** switch the canvas to a cool grey or add a system-preference dark mode.
- **Don't** use uppercase or letter-spaced labels, or small labels stacked above headings.
- **Don't** mix icon sets or add a third Phosphor weight.
- **Don't** set text a judge must read in Mist (`text-3`); it is below 4.5:1 on white.
