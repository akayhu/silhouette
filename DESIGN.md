---
name: 片刻剪趣
description: 繁體中文瀏覽器短影音剪輯工具。行銷頁是一張逐項列出「剪掉什麼、加了什麼」的熱感應剪輯明細單。
colors:
  invoice: "#d42c22"
  invoice-deep: "#a8201a"
  invoice-soft: "#f8dcd8"
  receipt: "#18191d"
  receipt-soft: "#474a52"
  receipt-mute: "#676b74"
  paper: "#f8f9f6"
  steel: "#e3e7ea"
  steel-deep: "#cdd3d8"
typography:
  display:
    fontFamily: "'Chiron Hei HK', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "clamp(42px, 5.4vw, 78px)"
    fontWeight: 900
    lineHeight: 1.06
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Chiron Hei HK', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "clamp(30px, 3.6vw, 46px)"
    fontWeight: 900
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Chiron Hei HK', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 900
    lineHeight: 1.3
  body:
    fontFamily: "'Chiron Hei HK', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.75
  lede:
    fontFamily: "'Chiron Hei HK', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.75
  figure:
    fontFamily: "'Martian Mono', 'Chiron Hei HK', ui-monospace, monospace"
    fontSize: "64px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontVariation: "'wdth' 80"
  label:
    fontFamily: "'Martian Mono', 'Chiron Hei HK', ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
    fontFeature: "'tnum' 1"
rounded:
  stamp: "3px"
  row: "4px"
  button: "6px"
  phone: "36px"
  phone-screen: "28px"
spacing:
  gutter-sm: "16px"
  gutter: "32px"
  slip-x: "28px"
  section-top: "96px"
  section-bottom: "112px"
  container: "1240px"
components:
  button-red:
    backgroundColor: "{colors.invoice}"
    textColor: "#ffffff"
    rounded: "{rounded.button}"
    padding: "0 20px"
    height: "44px"
  button-red-hover:
    backgroundColor: "{colors.invoice-deep}"
  button-red-lg:
    backgroundColor: "{colors.invoice}"
    textColor: "#ffffff"
    rounded: "{rounded.button}"
    padding: "0 28px"
    height: "56px"
  button-ink:
    backgroundColor: "transparent"
    textColor: "{colors.receipt}"
    rounded: "{rounded.button}"
    padding: "0 20px"
    height: "44px"
  button-ink-hover:
    backgroundColor: "{colors.receipt}"
    textColor: "{colors.paper}"
  button-paper:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.invoice-deep}"
    rounded: "{rounded.button}"
    padding: "0 28px"
    height: "56px"
  receipt-slip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.receipt}"
    rounded: "0"
    padding: "24px 28px 32px"
  receipt-line-active:
    backgroundColor: "{colors.invoice}"
    textColor: "#ffffff"
    rounded: "{rounded.row}"
    height: "40px"
  pro-stamp:
    backgroundColor: "transparent"
    textColor: "{colors.invoice}"
    rounded: "{rounded.stamp}"
    padding: "1px 6px"
---

# Design System: 片刻剪趣

## Overview

**Creative North Star: "The Edit Receipt"（剪輯明細單）**

The marketing surfaces read as a convenience-store checkout counter in Taiwan: a brushed stainless-steel ground, long strips of thermal paper laid on it, carbon-black print, and invoice red reserved for the action and the total. The product promise ("drop in a video, get back an itemized slip of what was cut and what was added") is told in the slip's own grammar: line items with dotted leaders to a quantity, dashed tear rules between header, body and total, a zigzag torn edge, a barcode at the foot, and a rotated red rubber stamp for 專業版 and 示範.

Density is receipt-dense inside the slip (40px line rows, 13px tabular numerals) and generous outside it (96 to 112px section padding on the steel). Slips sit slightly crooked (1 to 1.6 degrees) as if dropped on the counter. Motion is the printer: lines clip in top-down one at a time, and nothing else drifts or floats.

**Scope.** The full receipt world (slips, torn edges, leaders, Chiron Hei HK + Martian Mono) is scoped by the `.mk` wrapper in `MarketingLayout` and applies to the homepage, pricing and 404. The app (editor, dashboard, account, admin, auth) shares the brand but not the receipt devices: the owner decided to unify the brand, so the app's tokens now use the same ink and invoice red (`--color-brand` / `--color-coral` `#d42c22`, hover `#a8201a`, soft `#fbe4e2`; ink `#18191d` / `#474a52` / `#676b74`; cool neutrals canvas `#eef0f2`, sunken `#e8ebee`, line `#dce0e4`), the same logo (ink square, white play mark, red dot, all-ink wordmark), favicon and theme-color `#d42c22`. The app keeps its own Operate grammar: Plus Jakarta Sans / Noto Sans TC, rounded-xl surfaces, soft card shadows. Exceptions that stay as they are: sticker artwork colours, user-pickable caption/shadow swatches, and the admin chart palette (validated categorical palette, paid `#5b4cf5`).

**Key Characteristics:**
- Steel ground, thermal-paper slips, carbon print, invoice-red action and totals.
- Two faces only: Chiron Hei HK for Chinese and prose, Martian Mono for every number, code and quantity.
- Receipt devices carry structure: dotted leaders, dashed tear rules, zigzag torn edges, barcodes, rotated stamps.
- One soft drop shadow (the slip resting on steel); no stacked card shadows, no gradients, no emoji.
- Square slips, small button radii (6px); the only large radius is the phone mockup.

## Colors

A cool steel-and-paper neutral field with one loud, warm red that only ever means "act" or "total".

### Primary
- **Invoice Red** (`invoice`): primary buttons, the active line on the demo slip, the featured plan's header band, the full-bleed closing band, red totals (成品長度, 404), the 專業版/示範 stamps, negative time amounts, focus ring and text selection.
- **Deep Invoice Red** (`invoice-deep`): hover state of red buttons; text colour of the paper button on the red band.
- **Invoice Blush** (`invoice-soft`): defined token, reserved for soft red fills; not yet used on shipped surfaces.

### Neutral
- **Carbon Print** (`receipt`): all headings and body on paper and steel; ink-outline buttons; the phone bezel; kept segments on the demo timeline.
- **Faded Print** (`receipt-soft`): supporting prose, sub-headings, nav links at rest.
- **Ghost Print** (`receipt-mute`): metadata and fine print on paper (dates, file names, item notes, 示範 tags).
- **Thermal Paper** (`paper`): every slip, the mobile nav drawer, the screenshot mat, the paper button.
- **Counter Steel** (`steel`): page ground, sticky header (90% with blur), row hover on slips.
- **Deep Steel** (`steel-deep`): footer ground; at 60% it bands alternating sections (features, orders, FAQ); cut segments' hatch.

### Named Rules
**The Red Means Money Rule.** Invoice red marks only the action, the total, the stamp and the active line. Never use it for decoration, section tints or icons that are not an action (the FAQ plus is the one sanctioned exception, as an open/close control).

**The Ink On Paper Rule.** Ghost Print (`receipt-mute`) is for text on Thermal Paper only (5.05:1). On steel or deep steel it falls below 4.5:1 for small text; use Faded Print (`receipt-soft`) there instead.

## Typography

**Display Font:** Chiron Hei HK (with Noto Sans TC, system-ui)
**Body Font:** Chiron Hei HK (with Noto Sans TC, system-ui)
**Label/Mono Font:** Martian Mono (with Chiron Hei HK, ui-monospace), tabular numerals, width axis condensed for big figures

**Character:** A heavy Hong Kong-style hei at weight 900 shouts the headline like a shop sign; Martian Mono prints numbers the way a receipt printer does, condensed and tabular.

### Hierarchy
- **Display** (900, clamp 42 to 78px, 1.06, -0.02em): the hero headline only; one word may turn Invoice Red. Closing band uses the same voice at clamp 36 to 68px.
- **Headline** (900, clamp 30 to 46px, 1.15, -0.01em, balanced): centred section headings, max width 2xl, with a 17px Faded Print sub.
- **Title** (900, 19 to 22px): slip names, group heads (group heads sit on a 2px Carbon rule with a mono item count at right).
- **Lede** (400, 18px, 1.75, max 30em): hero and pricing intro.
- **Body** (400 to 500, 15px, 1.75 to 1.8): line items, FAQ answers, slip notes. FAQ questions 17px bold.
- **Figure** (Martian Mono 800, 30 to 104px, line-height 0.9 to 1, tight negative tracking, `font-stretch` 76 to 85%): prices, totals, 404, invoice number.
- **Label** (Martian Mono 600, 11 to 13px, tabular): quantities after leaders, dates, durations, copyright.

### Named Rules
**The Numbers Are Printed Rule.** Every numeral that is a quantity, price, time or code is set in Martian Mono with tabular figures (`.num`); Chinese words around it stay in Chiron Hei HK.

## Layout

A 1240px container with 16px gutters (32px from `sm`). Sections sit on steel with 96px top and 112px bottom padding, alternating plain steel and 60% deep steel bands, ending in a full-bleed Invoice Red band. Headings are centred above a single slip or a grid of slips.

The hero is a 12-column split at `lg`: 5 columns of copy, 7 of demo (phone plus a slip tilted 1.6deg overlapping its right). Below `lg` it stacks; below `sm` the phone stacks above the slip. Slip grids: the features slip is one wide slip with a two-column list inside (max 1040px); orders are 1/2/4 columns with alternate slips dropped 40px and rotated ±1deg at `lg`; pricing is two slips (max 960px), the featured one lifted 12px at `md`. Inside slips, rows run 12 to 14px vertical rhythm.

## Elevation & Depth

Flat paper on a flat counter. There is exactly one shadow, the slip shadow: a hairline contact shadow plus a long, soft, negatively spread drop that reads as paper lifted a millimetre off steel. Depth beyond that comes from colour bands (steel vs. deep steel vs. paper) and from slight rotation, not from stacked elevations.

### Shadow Vocabulary
- **Slip** (`box-shadow: 0 1px 1px rgb(24 25 29 / 0.06), 0 18px 32px -18px rgb(24 25 29 / 0.35)`): every paper slip, the screenshot mat and the phone mockup. Nothing else.

### Named Rules
**The One Shadow Rule.** Only paper objects cast the slip shadow; buttons, stamps, rows and the header are shadowless.

## Shapes

Slips are square-cornered rectangles whose top and/or bottom edges are torn into a 7px zigzag by a CSS mask (bottom only for plan slips and the 404 slip; both edges for the demo, features, orders and FAQ slips). Internal divisions are drawn, not boxed: 2px dashed rules at 25% Carbon between header, body and total; 1px dashed rules at 20 to 25% between list rows; a 2px dotted leader at 30% Carbon running from item name to quantity; a solid 2px Carbon rule under group titles. Corners elsewhere are small: 6px buttons and icon buttons, 4px slip rows and the timeline, 3px stamps. The 9:16 phone (36px bezel, 28px screen) is the only rounded object.

## Components

### Buttons
Square-ish rubber-stamp blocks, bold and plain.
- **Shape:** gently squared (6px).
- **Red (primary):** Invoice Red, white bold text; 44px tall, 15px text (md) or 56px tall, 17px text (lg). Optional trailing arrow icon.
- **Ink (secondary):** 2px Carbon outline, Carbon text; fills Carbon with paper text on hover.
- **Paper:** Thermal Paper with Deep Invoice Red text; used only on the red closing band.
- **Hover / Focus / Active:** colour swap only (red to deep red); 1px press-down on active; focus is a 2px Invoice Red outline at 3px offset (all of `.mk`).
- **Text link CTA:** bold, 2px underline at 6px offset, turns red on hover.

### Cards / Containers (Receipt Slip)
- **Corner Style:** square, with 7px zigzag torn edges.
- **Background:** Thermal Paper on steel.
- **Shadow Strategy:** the Slip shadow only.
- **Border:** none outside; dashed tear rules inside.
- **Internal Padding:** 20 to 28px horizontal, 24px header top; long-form slips 40 to 48px.
- **Header band variant:** the featured plan's header is a solid Invoice Red band with white title.

### Line Item
Name, dotted leader, mono quantity, optional red mono amount. On the interactive demo slip each line is a 40px button: rest state plain, hover steel fill, active Invoice Red fill with white text and the leader hidden. New lines print in with a top-down clip (0.38s, `cubic-bezier(0.16, 1, 0.3, 1)`); reduced motion prints the whole slip at once and stops autoplay.

### Stamp
Rotated -6deg, 2px Invoice Red border, 3px radius, red 900-weight text at 11 to 12px. Marks 專業版 items and 示範 content.

### Barcode
Deterministic SVG bars generated from a string (same value, same bars), in Carbon on paper or white at 85% on red. Sits at the foot of the demo slip and on the closing band.

### Navigation
Sticky 64px header on 90% steel with a light blur and a 10% Carbon hairline. Printed logo left (Carbon rounded square, paper play triangle, red dot), three bold 15px Faded Print links that darken and underline on hover, login text link and a red button right. Mobile: a menu icon opens a paper drawer with dashed-rule rows and a full-width red button.

### Footer
Deep Steel ground, logo and one-line description, three link columns with 900-weight titles, then a 2px dotted rule above copyright (mono) and the Unsplash photo credit.

### FAQ
Native disclosure rows on a single slip, dashed separators, 17px bold question, red plus that rotates 45deg when open.

## Do's and Don'ts

### Do:
- **Do** put every list of features, plans or results on a Thermal Paper slip with leaders and mono quantities.
- **Do** reserve Invoice Red for the primary action, totals, stamps and the active line.
- **Do** set every number in Martian Mono with tabular figures; condense large figures with `font-stretch` 76 to 85%.
- **Do** separate slip regions with 2px dashed rules and rows with 1px dashed rules, never with boxes.
- **Do** label demonstration content with the red 示範 stamp or a mono 示範 tag.
- **Do** give motion a printer's logic (top-down line print, typed captions) and honour reduced motion by showing the finished state.

### Don't:
- **Don't** use gradients, glows, emoji or stacked card shadows; the slip shadow is the only shadow.
- **Don't** use a black page background (owner requirement); steel is the ground and Carbon appears only as print, bezel and button fill.
- **Don't** use Ghost Print for small text on steel or deep steel; it fails contrast there.
- **Don't** bring the app's Plus Jakarta Sans or rounded-xl surfaces into `.mk`, and don't put receipt devices (torn edges, leaders, stamps, Martian Mono) into the app; the two share only the brand colours and logo.
- **Don't** round slips; their edges are square or torn.
