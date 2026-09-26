---
name: FNS (Fleet Naming Service)
description: A light, ENS Manager family product (a landing page and a playbook editor) that shows one agent fleet mounted under many .eth names, verified live from chain.
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
  hero-display:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(40px, 4.6vw, 60px)"
    fontWeight: 900
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  section-title:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(30px, 3vw, 40px)"
    fontWeight: 900
    lineHeight: 1.08
    letterSpacing: "-0.02em"
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
  step-title:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.25
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
  button-primary:
    backgroundColor: "{colors.blue-strong}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "42px"
  button-primary-hover:
    backgroundColor: "color-mix(in srgb, #1a5fd0 86%, #1e1e21)"
  button-primary-lg:
    backgroundColor: "{colors.blue-strong}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "50px"
  button-run:
    backgroundColor: "{colors.blue-strong}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    height: "48px"
    width: "100%"
  wallet-pill:
    backgroundColor: "{colors.blue-strong}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  wallet-pill-connected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
  tool-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.tag}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "36px"
  icon-button:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    size: "32px"
  insert-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    size: "28px"
  popover:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.ctl}"
    padding: "6px"
  menu-item:
    rounded: "{rounded.ctl}"
    padding: "9px 10px"
  step-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "14px 12px 14px 8px"
  step-card-trigger:
    backgroundColor: "{colors.surface-2}"
  step-icon:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.ctl}"
    size: "32px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.ctl}"
    padding: "0 12px"
    height: "40px"
  playbook-column:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    width: "420px"
  mech-figure:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "28px"
  close-band:
    backgroundColor: "{colors.blue-tint}"
    rounded: "{rounded.card}"
    padding: "48px"
  preset-link:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.ctl}"
    padding: "12px 16px"
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

# Design System: FNS (Fleet Naming Service)

## Overview

**Creative North Star: "The ENS Manager, Extended"**

FNS plays the category standard straight. It is meant to sit beside the ENS Manager app (app.ens.domains) on a projector and read as the same family: a flat neutral grey canvas, white rounded panels with hairline borders, one blue for everything you can press or select, and Satoshi for every word. Nothing is invented for novelty; the craft is in restraint, density that holds up from three metres, and state that is legible without reading.

The product has two surfaces in one family. The landing page (`/`) explains the mechanism with a live preview and three mechanism figures, and hands off to the editor with one solid blue button. The playbook editor (`/editor`) replaces the old single-route dashboard: a sticky playbook column on the left where kill switches are now steps you compose and run, and a workspace on the right where the fleet map is the largest surface and everything else explains what the map just did. It is a product, not a stats dashboard. Colour is spent on meaning: blue marks action and selection, and the verdict colours (green, red, orange, grey) mark state. Surfaces carry no shadow; depth comes from white on grey plus a 1px border.

The system is light-first and pinned light for the projected demo. Dark tokens exist, but only as an opt-in override that nothing in the build sets.

**Key Characteristics:**
- Neutral grey canvas (#f6f6f6), white panels, 1px cool hairline borders, no shadows at rest; floating menus are the one exception.
- One radius scale: 16px panels, 10px controls, full pill for tags, buttons and status pills.
- ENS blue is the only action and selection colour; one solid Blue Deep button per page, everything else is a wash or white pill. Verdict colours are for state only.
- Satoshi throughout, heavy weights (700 and 900) for structure, tabular numerals for block numbers and counts, mono only for addresses and hashes.
- Phosphor icons in two weights with fixed jobs: fill for status and verdict, bold for action and UI.
- Dead or removed things are drawn as dashed and grey, never faded.

## Colors

A neutral light palette with one blue accent and four verdict hues, each verdict hue paired with a pale tint of itself.

### Primary
- **ENS Blue** (`blue`): the brand wordmark, focus outlines, field focus borders and their halos, hovered map nodes, the map node a playbook step touches (3px outline), the active step card's border, the selected coverage cell, and the fleet registry node's 2px outline. It never carries white text: white on it measures only about 3.4:1.
- **ENS Blue Deep** (`blue-strong`): text and icons on blue surfaces (secondary button labels, the fleet node's labels, focused table headers, the pending and running lines, the "Local fork" tag, footer and nav link hover), and the one solid fill in the system: the page's primary button and the disconnected wallet pill, with white text at about 5.9:1. Hover darkens it toward Ink (86% Blue Deep).
- **ENS Blue Wash** (`blue-tint`): the fill of secondary action buttons (including "Add a step"), the fleet registry node and its landing token, blue tags, the Check step's icon tile, the account-switch prompt in the playbook foot, and the landing's closing band.

### Verdict (state colours)
- **Endorsed Green** (`green`) on **Mint Wash** (`green-tint`): the Verified verdict, passing checks, Active agents, clean settlement, successful outcomes. **Signal Green** (`green-line`) is the brighter stroke for endorsed map edges, the legend swatch and the live-block dot.
- **Counterfeit Red** (`red`) on **Blush Wash** (`red-tint`): the Counterfeit verdict, failing checks, counterfeit doorway nodes and edges, undeclared doorway headers, input errors.
- **Flag Orange** (`orange`) on **Apricot Wash** (`orange-tint`): the Flagged verdict (endorsed doorway, flagged settlement address), warning-step icons, and chain warnings such as an unreachable RPC or an unmounted canonical name (the editor's banner notice).
- **Not-live Grey** (`grey`) on **Pewter Wash** (`grey-tint`): the Not live verdict, Fired and Unmounted tags, the unknown-screening notice.

### Neutral
- **Neutral Canvas** (`bg`): the page and the translucent sticky top bar. A true neutral grey that matches the ENS Manager reference, not a cool grey.
- **Panel White** (`surface`): cards, the playbook column, step cards, fields, menus, the search field, the block pill, map nodes, neutral and tool buttons.
- **Recessed Grey** (`surface-2`): chips, check-row and menu-item hover, the trigger card at the top of a playbook, neutral step icon tiles, disabled fields, and the fill of dead or fired nodes.
- **Hairline** (`border`) and **Hairline Strong** (`border-strong`): card and control borders; the strong step is the hover border and the stroke of map nodes and structural map edges.
- **Ink** (`text`): primary text. **Slate** (`text-2`): secondary text, section labels, lede, dead node names. **Mist** (`text-3`): placeholders, carets, and resting icons. Mist measures about 3.4:1 on white, so it is not a text colour for anything a judge must read.
- **Dead Line** (`dead-line`): dashed strokes and arrowheads for edges that no longer carry a live mount.

### Named Rules
**The One Blue Rule.** ENS blue is the only colour for action and selection: buttons, focus, hover, the selected cell, the active step. No verdict colour ever fills a button.

**The One Solid Button Rule.** A page has one solid blue button, its single most important action (Open editor on the landing, Run playbook in the editor), filled with Blue Deep and white text. The disconnected wallet pill shares the fill because connecting is the prerequisite for Run. Everything else is a Blue Wash secondary or a white neutral pill. Never put white text on the light ENS Blue.

**The Verdict Is State Rule.** Green, red, orange and grey mark state only: verdicts first, then the plain status readouts that share their meaning (live block, RPC down, a transaction's outcome, Active or Fired). They are never decoration, section colour, or action colour.

**The Risk On The Icon Rule.** Kill switches are now playbook steps (Unmount, Fire, Use a flagged address, Counterfeit). Their risk shows only on the glyph: a red (destructive) or orange (warning) icon over a neutral Recessed Grey tile, and the same coloured bold icon in the insert menu. The tile, card and button around it stay neutral or blue. Restore and Reset steps are neutral; Check keeps a Blue Wash tile because it reads, it does not act.

**The Pinned Light Rule.** The demo renders light. Dark tokens live only behind the opt-in `:root[data-theme="dark"]` selector and nothing sets that attribute; `color-scheme` and the viewport theme colour are pinned light. Do not add a system-preference dark switch.

## Typography

**Display Font:** Satoshi (with ui-sans-serif, system-ui, sans-serif), self-hosted at 400, 500, 700 and 900 only
**Body Font:** Satoshi
**Label/Mono Font:** ui-monospace stack (SF Mono, Menlo, Consolas), for addresses and hashes only

**Character:** One geometric grotesk at heavy weights does all the structural work, the way the ENS app does. Hierarchy comes from weight and size, never from uppercase or tracking.

### Hierarchy
- **Hero Display** (900, clamp(40px, 4.6vw, 60px), 1.02, -0.03em, balanced wrap): the landing headline only.
- **Section Title** (900, clamp(30px, 3vw, 40px), 1.08, -0.02em, max 22ch): landing section heads and the closing band. Mechanism titles step down to 900 at 24px.
- **Display** (900, 34px, 1.1, -0.02em; 28px under 820px): the editor's page title, which is the fleet's canonical name.
- **Headline** (900, 22px, -0.01em): the inspected name at the top of the verifier panel, and the editable playbook title.
- **Title** (700, 20px, -0.01em): card titles.
- **Lede** (500, 19px; 17px under 820px, max 68ch): the one-sentence fleet summary in Slate, with counts in bold Ink and verdict counts in their verdict colour. The landing hero lede uses the same step at 1.5 line height and 46ch; section ledes and mechanism copy step to 18px and 17px in Slate, with names in bold Ink.
- **Step Title** (700, 16px, 1.25): playbook step and preview-card titles; the signer line under it is Meta in Slate.
- **Body** (400, 16px, 1.45): base text.
- **Label** (700, 15px): section labels within cards (Slate), button and chip text, menu items, table headers, activity lines. Tool pills step down to 14px.
- **Tag** (700, 14px): tags, coverage cells, legend.
- **Meta** (500, 13px): activity block and time lines, check IDs, input errors, field labels (700), menu headings (700), step signers.
- **Map type** (map-name 22, map-label 18, map-sub 18.5, map-mono 17.5, map-tag 17): SVG user units inside the fleet map viewBox, which renders at about 0.83x on a 1440 screen, so labels land near 15px and tags near 14px for a room 3 m away. The stacked phone map uses the HTML ramp (label 15/17).
- **Wordmark** (900, 24px), **Input** (500, 17px) and **Display on phones** (900, 28px) are single-use steps.
- **Mono** (0.92em, -0.01em): shortened addresses and transaction hashes, check evidence.

### Named Rules
**The Sentence Case Rule.** All labels are sentence case at normal tracking. No uppercase, no letter-spaced labels.

**The Tabular Numbers Rule.** Block numbers and counts use tabular numerals so live updates do not jitter.

**The Four Weights Rule.** Only 400, 500, 700 and 900 exist. A weight between them renders as its nearest shipped neighbour, so do not specify one.

**The Mono Is For Hex Rule.** Mono appears only on addresses, hashes and raw check detail. Names such as `support.shopa.eth` are set in Satoshi.

## Layout

Two routes share the top chrome but not the grid.

**Editor (`/editor`).** The sticky top bar is 76px tall with three columns: the wordmark left, a search field up to 560px wide in the centre, and on the right the wallet pill beside the block pill. Under 820px the search drops to its own full-width row and the wordmark subtitle hides. Below it, a grid capped at 1640px (16px top, 32px side gutters) puts the 420px playbook column beside a fluid workspace with a 24px gap. The playbook column is sticky 92px from the top and never taller than the viewport minus 108px; its step list scrolls inside it and Run stays pinned in its foot. The workspace stacks, 20px apart: an optional banner notice, the title row, the fleet map, then Coverage full width with the verifier below it (side by side at 1.3fr / 1fr from 1680px), then Activity. Under 1100px the playbook column stops being sticky and sits above the workspace; under 820px gutters drop to 16px and step fields lose their 26px indent.

**Landing (`/`).** A slim sticky nav (72px, the same translucent canvas as the top bar) over a 1240px column with 32px gutters. The hero splits 4.6fr text to 7.4fr preview with a 56px gap. Mechanism rows split 5fr text to 7fr figure with 56px gaps and 56px vertical padding, separated by hairlines. The closing band splits 7fr to 5fr. Everything goes to one column under 1040px; under 720px gutters drop to 16px, the nav links hide leaving the brand and the primary button, and the preview's scaled SVG map is replaced by stacked full-size rows.

Spacing rhythm: 20px between cards, 22/24px card padding (18/16px on mobile), 16px between grouped sections inside a card with a hairline between groups, 8px between buttons, chips, fields and list items, 10px for small stacks. Under 720px the SVG fleet map is replaced by a vertical stack of the same nodes joined by down arrows.

## Elevation & Depth

Flat. Cards and controls have no shadow at rest; depth is white on grey plus a 1px hairline border. The top bar and landing nav use a translucent canvas with a saturated backdrop blur so content passes beneath them. Shadows appear as rings that show state, with one exception: popover menus, which genuinely float over other content, carry a single soft shadow.

### Shadow Vocabulary
- **Focus halo** (`box-shadow: 0 0 0 4px color-mix(in srgb, var(--blue) 18%, transparent)`): the focused search field.
- **Selection ring** (`box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 18%, transparent)`): with a blue border, the selected coverage cell, the active or running step card, the focused playbook title and fields, and a highlighted row in the phone preview.
- **Menu float** (`box-shadow: 0 12px 32px -8px rgb(24 24 32 / 0.18), 0 2px 6px rgb(24 24 32 / 0.06)`): popover menus only.
- **Drop line** (`box-shadow: 0 -3px 0 0 var(--blue)`): a 3px blue line above the step a dragged step will land before. It reads as a rule, not as lift.
- **Live dot ring** (`box-shadow: 0 0 0 3px color-mix(in srgb, var(--green-line) 22%, transparent)`): the block pill's live indicator.

### Named Rules
**The No-Lift Rule.** Nothing on the page floats. A shadow is a zero-offset ring that shows focus, selection or liveness. The only soft shadow belongs to popover menus, which are the one layer that truly sits above the page; cards, step cards and figures never get it.

## Shapes

One radius scale, and nothing off it: 16px for cards and card-scale pieces (the playbook column, step cards, the preview card, mechanism figures, the closing band, the fleet token), 10px for controls (search, fields, chips, coverage cells, check lists, notices, menus and menu items, icon tiles, preview step chips, preset links, mechanism rows), and full pills for tags, buttons, tool pills, the wallet and block pills, and round icon buttons (32px) and insert buttons (28px). Borders are 1px hairlines. Map nodes use a 1.5px stroke, and the fleet registry node uses 2px blue. Edges are round-capped 3px curves (2px for the thin agent-to-resolver links) with small filled arrowheads.

### Named Rules
**The Dashed Means Dead Rule.** Dead state (an unmounted doorway or a fired agent) is shown by a dashed outline, a Recessed Grey fill, the name in Slate, a grey tag (Unmounted, Fired, Not live), a dashed Dead Line edge, and a greyscale avatar. It is never shown by lowering opacity. Opacity is reserved for temporary focus dimming of unrelated map nodes and edges, disabled buttons, and loading.

## Components

### Buttons
Pill-shaped, bold and quiet: the ENS secondary style, with one solid primary per page.
- **Shape:** full pill (999px), 42px tall, 16px horizontal padding, 8px icon gap, 18px bold icon. Large is 50px with 22px padding and 16px text (landing hero); Run is full width at 48px and 16px text.
- **Primary (solid):** white text on Blue Deep with no border; hover mixes 14% Ink into the fill. Only the page's single most important action (Open editor, Run playbook). See The One Solid Button Rule.
- **Action (secondary):** Blue Deep text on Blue Wash; on hover the wash deepens to 20% blue. Used for "Add a step" at the foot of the spine and the account-switch action.
- **Neutral:** Ink text on white with a Hairline border; on hover the border strengthens and the fill becomes Recessed Grey.
- **Tool pill:** a 36px neutral pill, 12px padding, 14px bold text with an icon (Playbooks, Save, Share). The Playbooks pill opens a menu of presets and saved playbooks; Save and Share act directly.
- **Icon button:** a 32px round white button with a Hairline border (preview pause, saved-playbook actions, where the border is dropped).
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
- **Search:** 48px tall, white, with a 1px Hairline border, 10px radius, 17px medium text, and a bold magnifier inset at 15px. Focus turns the border ENS Blue with the 4px focus halo.
- **Inline step fields:** selects and inputs 40px tall, white, 1px Hairline, 10px radius, 12px padding, bold 15px text, a 13px bold Slate label above. Selects carry a bold Phosphor caret at 14px, 10px from the right. Hover strengthens the border; focus turns it ENS Blue with the 3px selection ring; disabled fills Recessed Grey with Slate text.
- **Editable title:** the playbook title is a borderless Headline field that shows a Hairline on hover and the blue border plus ring on focus.
- **Error:** a 13px red line appears just below the field.

### Navigation
- **Editor top bar:** the FNS wordmark in ENS Blue at 900 (a link home), the "Fleet Naming Service" subtitle in Slate, the central search, then the wallet pill and a pill that shows the live block (green dot with tabular block number). When the RPC fails, the block pill turns orange on Apricot Wash.
- **Wallet pill:** 40px, bold 15px. Disconnected it is the solid Blue Deep fill with white text; connected it becomes a white neutral pill with a Hairline border that strengthens on hover. Its focus state is a 4px blue halo.
- **Landing nav:** the wordmark left; on the right, bold 15px Ink text links that turn Blue Deep on hover, then the primary Open editor button. On phones only the brand and the button remain.
- **Footer:** a hairline-topped row of 14px Slate text with bold Blue Deep links that underline on hover.

### Popover Menu
A white panel with a 1px Hairline, 10px radius, 6px padding and the menu float shadow, at least 250px wide (300px under tool pills). It is fixed-positioned from its trigger so no scrolling list can clip it, opens toward the side with more room (between 160px and 520px tall), stays at least 8px below the sticky top bar, and follows its trigger on scroll. It fades in from 4px above over 160ms. Items are 10px-radius rows (9px by 10px padding, bold 15px, an 18px bold icon in its risk colour) with a Recessed Grey hover; the step-insert menu uses two-line items (32px icon tile, bold title, Slate blurb). Headings are bold 13px Slate; separators are 1px hairlines.

### Playbook Column (signature)
A sticky 420px white card in three bands separated by hairlines. The head holds the editable title and a row of tool pills, with a short green saved note. The body is a vertical spine: a 2px Hairline Strong line runs between steps and carries a round 28px + insert button (white, Slate icon; blue border, Blue Deep icon and Blue Wash on hover or while its menu is open), ending in the "Add a step" secondary button. The foot pins the solid Run button, with a Slate hint below it, and an account-switch prompt (Blue Deep text on Blue Wash, 10px radius) above it when the step needs another signer.

### Workflow Canvas (signature)
The centre of the editor is a node canvas on Recessed Grey with a 24-unit dot grid (Hairline Strong dots) that pans and scales with the view. A segmented control in its header switches between Workflow and Fleet map; the header legend names the three wire kinds. Nodes are white 16px cards with a Hairline Strong border and 12px padding: a fixed 40-unit head (32px icon tile, title, signer line, status icon, ⋯ menu) and, below, the step's own fields (36px selects and inputs) and its run result. The trigger ("When you press Run") is a narrower card at the far left. Ports are 14px circles: the input on the left edge at the head's centre, outputs on the right edge; check nodes have two outputs labelled "As expected" (Signal Green) and "Otherwise" in small white pills. Wires are 2.5px bezier curves: Mist for Then, Signal Green for As expected, dashed for Otherwise; a selected wire is ENS Blue with a round × to remove it, and the path the run follows turns ENS Blue with a slow dash flow. Selected and running nodes take the blue border and selection ring; done nodes a green-tinted border, failed a red-tinted one; a drop target is Blue Wash; a wire that would loop marks its target with a dashed red border and a short red note. A pill toolbar (zoom out, %, zoom in, fit, Tidy) sits bottom-left and the live fleet mini map (300px white card) bottom-right, hideable. Fit never goes below 70%; the canvas pans to keep the running node in view. Nodes move by drag (8-unit snap) or arrow keys, and connect by dragging from an output or from the node menu.

### Editor Workbench
The editor is three panels sized to the viewport, so the page itself never scrolls on desktop: the playbook column (380px; 340px under 1520px), the canvas, and the details panel (380px; 320px under 1520px), with 20px gaps. The canvas holds the notice, a compact title row (28px title, 17px lede) and the fleet map card, which takes all remaining height; the diagram scales to fit it. The details panel is a white 16px card: a pill segmented control (Verifier, Coverage, Activity; the selected tab is white with a Blue Deep label and a hairline ring; icons drop under 1520px) and a collapse button, over a body that scrolls on its own. Cards shown inside it lose their frame and title, and coverage cells go icon-only. Picking a name anywhere opens the Verifier tab. Both side panels collapse to 64px rails (`[` and `]`), remembered per browser. Under 1100px the three panels stack and the page scrolls.

### Block Palette
The playbook column now holds the block palette under its head: a short Slate hint, then one bordered white row per block (icon tile, bold title, a Slate line saying who signs and what it does). Rows drag onto the canvas or, pressed, add the block after the selected node, spliced into the main wire when that output is taken. The foot keeps Run and a hint counting the nodes on the run path.

### Playbook Rail
The playbook column collapses to a 64px rail so the workspace, and the fleet map with it, takes the width (the map is capped at 72vh tall). The rail holds, top to bottom: a 40px round expand button, one 44px button per step showing its icon tile with a 10px run-state dot (grey queued, blue running, Signal Green done, red failed, grey not run), and the 44px round solid Run (or white Cancel) at the foot. Hovering a rail step outlines its target on the map, as in the full column; clicking it expands the column. The column's title row carries the collapse button. `[` toggles it outside text fields, the state is remembered per browser, and a step waiting for an account switch expands the column so its prompt is visible. Under 1100px the rail lies flat as a horizontal strip above the workspace. The column width animates over 260ms, off under reduced motion.

### Step Card
- **Shape:** 16px radius, white, 1px Hairline, 14px padding; the trigger card at the top of the spine uses Recessed Grey.
- **Head:** a Mist drag grip, a 32px icon tile (see The Risk On The Icon Rule), the Step Title with a Slate signer line, and a round 32px overflow button.
- **Body:** inline fields indented 26px, wrapping with an 8px gap.
- **Result:** below a hairline, a 14px Slate message (Blue Deep while running, red when failed), then a verdict tag followed by a bold "As expected" in green or "Expected X" in red.
- **States:** hover strengthens the border; the active or running step gets a blue border and the selection ring, and its target node on the fleet map gets a 3px blue outline; a failed step gets a red-tinted border (45% red into the hairline). Queued steps show a 12px hollow ring.

### Landing Preview (signature)
A white 16px card labelled "Preview" in its bar, with a Slate note and a pause/play icon button. Inside, three 10px-radius step chips (32px icon tile, title, one-line Slate detail) run in a row; the running chip gets the blue border and ring, and its verdict line fades in beneath it over 300ms. Below them a mini fleet map replays the demo on a loop, highlighting the node the running step touches. Under 720px the chips stack and the map becomes stacked full-size rows that keep the same states (dashed dead rows, red counterfeit rows, blue highlighted row). Under prefers-reduced-motion the replay does not run and the finished state is shown.

### Mechanism Figure
Each landing mechanism row pairs text with a white 16px figure card (28px padding, 18px on phones), drawn from the product's own parts: a fan of Recessed Grey name rows joined by Signal Green curves into one fleet token (Blue Wash, 2px blue, 16px radius); two kill-switch columns of 42px rows where dead rows are dashed Dead Line on Recessed Grey in Slate; and a verifier check list in the Check List style.

### Closing Band
A Blue Wash 16px band (48px padding, 28px by 20px on phones) with a Section Title, a lede in Blue Deep mixed toward Ink, and a stack of preset links: white 10px-radius rows with a 22% blue border and bold Ink text that turn to a full blue border and Blue Deep on hover, each opening the editor with that preset.

### Fleet Map (signature)
An SVG diagram with doorways on the left, the fleet registry node (Blue Wash, 2px blue) in the centre, agents with gradient avatars, and the shared resolver on the right. Edges are coloured by mount state: Signal Green for endorsed, red for counterfeit, dashed Dead Line for not live. A counterfeit doorway gets a red stroke over a 60% Blush Wash. Hovering or focusing a node gives it a blue 2px stroke and dims unrelated nodes and edges. Tags inside nodes follow the Tags spec.

### Coverage Cell (signature)
A 46px, 10px-radius cell per agent and doorway, filled with its verdict tint, with the verdict colour for text and a filled icon. Hover shows a 45% tone border; selection shows a blue border plus the selection ring. When a verdict changes, the cell pulses once (a scale plus an expanding tone ring over 1.4s). Under 820px the label hides and only the icon remains.

### Activity Row
A 32px, 10px-radius icon tile in the event's tone over its tint, a bold 15px event line, and a meta line with a tabular block number. The newest row slides in from 6px above. The list uses two columns on wide screens.

### Check List
A bordered list with a 10px radius and hairline dividers. Each row has a filled 20px status icon, a bold title, a Mist check ID and a bold caret that rotates 180 degrees when the row opens to show mono evidence.

### Icons
Phosphor only. Use **fill** for status and verdict glyphs: verdict tags, coverage cells, check results, and verdicts on doorway chips. Use **bold** for action and UI glyphs: button icons, the search magnifier, carets, arrows, activity event icons, and warning icons in the top bar. Sizes are 14px in tags and chips, 16px in activity tiles, 18px in buttons and cells, and 20px for check results and stack arrows.

### Motion
One easing curve, `cubic-bezier(0.22, 1, 0.36, 1)`: 160ms for hover and border changes and the menu fade-in, 300ms for verdict colour changes on cells, map strokes and the preview's verdict reveal, 200ms for dimming, caret rotation and step ring changes. Motion is disabled completely under prefers-reduced-motion.

## Do's and Don'ts

### Do:
- **Do** set the page on the neutral canvas (#f6f6f6) with white 16px-radius cards and 1px hairlines, as the ENS Manager does.
- **Do** keep ENS Blue as the only action and selection colour, with exactly one solid Blue Deep button per page for its most important action.
- **Do** show a step's risk only on its icon: red (destructive) or orange (warning) over a neutral tile.
- **Do** mark the step being hovered or run with a blue border and selection ring, and outline the map node it touches in 3px blue.
- **Do** use Phosphor fill for status and verdict glyphs and Phosphor bold for action and UI glyphs.
- **Do** show dead doorways and fired agents with a dashed outline, a Recessed Grey fill, the name in Slate, a grey tag and a dashed edge.
- **Do** pair every verdict colour with its own tint, and lead verdict tags and cells with the filled verdict icon.
- **Do** use tabular numerals for block numbers and counts, and mono only for addresses and hashes.
- **Do** keep the theme pinned light; dark tokens stay behind `:root[data-theme="dark"]`, which nothing sets.

### Don't:
- **Don't** fill a button with green, red or orange, or use a verdict colour for decoration or section identity.
- **Don't** show dead or removed state by lowering opacity.
- **Don't** add drop shadows or lifted cards; outside popover menus, shadows are zero-offset state rings only.
- **Don't** put white text on the light ENS Blue (about 3.4:1), or add a second solid blue button to a page.
- **Don't** use a radius off the 16px / 10px / pill scale.
- **Don't** switch the canvas to a cool grey or add a system-preference dark mode.
- **Don't** use uppercase or letter-spaced labels, or small labels stacked above headings.
- **Don't** specify font weight 600 or any weight Satoshi is not shipped in.
- **Don't** mix icon sets or add a third Phosphor weight.
- **Don't** set text a judge must read in Mist (`text-3`); it is below 4.5:1 on white.
