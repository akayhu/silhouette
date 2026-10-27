---
name: 片刻剪趣
description: 繁體中文瀏覽器短影音剪輯工具。行銷頁是一本台灣生活雜誌《片刻剪趣》的創刊號：封面、編輯室報告、特輯、索引、跨頁、問與答、封底。
colors:
  mag-blue: "#2343c8"
  mag-blue-deep: "#1a33a1"
  mag-blue-soft: "#e2e7fa"
  mag-ink: "#1b1b19"
  mag-soft: "#45453f"
  mag-mute: "#67675f"
  mag-rule: "#d6d7d1"
  mag-paper: "#f5f6f3"
  mag-white: "#fcfcfa"
  brand-red: "#d42c22"
typography:
  cover:
    fontFamily: "'Noto Serif TC', 'Songti TC', serif"
    fontSize: "clamp(42px, 5.4vw, 80px)"
    fontWeight: 900
    lineHeight: 1.22
    letterSpacing: "0.04em"
  headline:
    fontFamily: "'Noto Serif TC', 'Songti TC', serif"
    fontSize: "clamp(32px, 3.8vw, 52px)"
    fontWeight: 900
    lineHeight: 1.2
  title:
    fontFamily: "'Noto Serif TC', 'Songti TC', serif"
    fontSize: "22px"
    fontWeight: 900
    lineHeight: 1.3
  deck:
    fontFamily: "'Chiron Hei HK', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.85
  body:
    fontFamily: "'Chiron Hei HK', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.85
  note:
    fontFamily: "'LXGW WenKai TC', 'Kaiti TC', serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.7
  folio:
    fontFamily: "'Noto Serif TC', 'Songti TC', serif"
    fontSize: "13px"
    fontWeight: 500
    letterSpacing: "0.12em"
  small:
    fontFamily: "'Chiron Hei HK', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  figure:
    fontFamily: "'Noto Serif TC', 'Songti TC', serif"
    fontSize: "76px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.03em"
rounded:
  none: "0"
  phone: "34px"
  phone-screen: "27px"
spacing:
  gutter-sm: "16px"
  gutter: "32px"
  section-top: "64px"
  section-bottom: "96px"
  container: "1240px"
components:
  button-ink:
    backgroundColor: "{colors.mag-ink}"
    textColor: "{colors.mag-white}"
    rounded: "{rounded.none}"
    padding: "0 20px"
    height: "44px"
  button-ink-hover:
    backgroundColor: "{colors.mag-blue}"
  button-line:
    backgroundColor: "transparent"
    textColor: "{colors.mag-ink}"
    rounded: "{rounded.none}"
    padding: "0 20px"
    height: "44px"
  button-paper:
    backgroundColor: "{colors.mag-white}"
    textColor: "{colors.mag-blue-deep}"
    rounded: "{rounded.none}"
    padding: "0 28px"
    height: "56px"
  pro-tag:
    backgroundColor: "{colors.mag-blue-soft}"
    textColor: "{colors.mag-blue-deep}"
    rounded: "{rounded.none}"
    padding: "0 6px"
---
# Design System: 片刻剪趣

## Overview

**Creative North Star: "創刊號"（a lifestyle-magazine first issue）**

The marketing surfaces read as the first issue of a Taiwanese lifestyle magazine about "剪一支短影音的一天". The homepage is paged like a printed issue: a cover with a vertically set 明體 title, a cobalt colour block holding the product demo and cover lines; then 編輯室報告 (local-first editing, including the honest downside), a template lookbook (特輯), a multi-column feature index, a full-width editor spread, four reader profiles (marked 示範), plans, a Q&A column and a cobalt back cover with a barcode.

Every unit opens with a running head (刊名 left, page number and section right) on a hairline; it is structure, not an eyebrow. Headings sit left-aligned on a 12-column grid with the deck to the right, never centred.

**Scope.** The magazine world lives under the `.mk` wrapper in `MarketingLayout` and covers the homepage, pricing and 404. The app (editor, dashboard, account, admin, auth) keeps its own Operate grammar (Plus Jakarta Sans / Noto Sans TC, rounded-xl surfaces, soft card shadows, brand red `#d42c22`). The shared brand mark is the logo: ink square, white play mark, red dot.

**Key Characteristics:**
- Uncoated magazine paper (`#f5f6f3`, deliberately not cream) with ink type and one committed issue colour, cobalt.
- 明體 (Noto Serif TC 900) for cover, headings, folios and figures; 黑體 (Chiron Hei HK) for prose; 霞鶩文楷 for handwritten notes, captions and sign-offs.
- Vertical (直排) cover and section titles on desktop, horizontal on mobile.
- Hairline rules and column dividers instead of cards; square corners everywhere except the phone.
- No gradients, no glass, no card shadows, no monospace.

## Colors

Restrained paper and ink with one committed issue colour that owns whole regions: the cover's demo block, the featured plan header and the back cover.

- **Issue Cobalt** (`mag-blue`): cover demo block, the back cover band, featured plan header, the active cover line, figures in the people section, focus ring and selection.
- **Deep Cobalt** (`mag-blue-deep`): text on blue-soft tags; paper button text on the back cover.
- **Cobalt Wash** (`mag-blue-soft`): the 專業版 tag background.
- **Ink** (`mag-ink`): headings, body emphasis, primary buttons, heavy rules (2px under the cover masthead and above index groups).
- **Soft Ink** (`mag-soft`): decks and body prose. **Mute Ink** (`mag-mute`): metadata, notes, page numbers in the nav.
- **Paper** (`mag-paper`): page ground. **White Paper** (`mag-white`): alternating sections (編輯室報告, index, people, Q&A) and the footer.
- **Brand Red** (`brand-red`): only the logo dot. It never appears elsewhere on marketing pages.

**The One Issue Colour Rule.** Cobalt is the only chromatic colour on the page apart from the logo dot and the template swatches (which are product data). Actions are ink, not colour.

## Typography

- **Cover** (Noto Serif TC 900, clamp 42 to 80px, tracking 0.04em): the H1 only, set `writing-mode: vertical-rl` from `lg`; one phrase in cobalt.
- **Headline** (Noto Serif TC 900, clamp 32 to 52px): section titles, left column of the 12-col grid; deck (17px Chiron Hei, 1.85) sits in columns 8 to 12.
- **Title** (Noto Serif TC 900, 20 to 24px): group heads, template and profile names, plan names.
- **Body** (Chiron Hei HK, 15 to 16px, 1.85 to 1.9).
- **Note** (LXGW WenKai TC, 17 to 19px): pull quote on the cover, figure captions, profile subtitles, editor sign-off.
- **Folio** (Noto Serif TC 500, 13px, tracking 0.12em): running heads, cover masthead line, page numbers in the nav.
- **Figure** (Noto Serif TC 900, tabular lining numerals via `.num`): prices, durations, 404.

## Layout

1240px container, 16px gutters (32px from `sm`). Sections: 64px top, 96px bottom, alternating paper and white paper, closing on the full-bleed cobalt back cover. The cover is a 3/5/4 split at `lg` (vertical title, cobalt demo block, deck and CTA). Templates are a five-column lookbook with every other column dropped 48px at `lg`. The feature index uses CSS columns (2 at `md`, 3 at `lg`). People are four columns divided by hairlines. Plans are two columns between a top and bottom ink rule with a vertical divider. Q&A pins its title in a 4-column sticky aside beside an 8-column list.

## Elevation & Depth

Flat print. The only shadow is under the phone mockup on the cobalt block (`0 24px 40px -24px` deep blue). Everything else separates by rules, colour regions and whitespace.

## Shapes

Square corners for buttons, tags, plan headers and images. The 9:16 phone (34px bezel, 27px screen) is the only rounded object. Rules: 1px ink at 10 to 20% for rows and dividers, 1px ink for section frames, 2px ink for the cover masthead and index group heads.

## Components

- **Buttons:** `mkButton('ink')` solid ink, hover turns cobalt; `mkButton('line')` 1px ink outline, hover fills ink; `mkButton('paper')` white on the back cover. Square, 44px (md) or 56px (lg).
- **RunningHead:** hairline + 刊名 left, page number and section right; `tone="blue"` on the back cover.
- **Cover lines:** the interactive demo list, two columns of rows with a hairline under each; the active row is cobalt with a 2px underline; pause and replay as square icon buttons.
- **ProTag:** cobalt wash label 「專業版」.
- **Plan columns, FAQ (問 marker in cobalt 明體), feature index groups** as described in Layout.

## Do's and Don'ts

- Do keep headings left-aligned with a deck to the right; don't centre section headings.
- Do use folios and page numbers that link to real anchors; don't add eyebrow labels above headings.
- Do keep demonstration content labelled 示範; don't invent testimonials, numbers or media mentions.
- Don't introduce a second chromatic accent, gradients, card shadows or monospace on marketing pages.
- Don't use the warm cream ground; the paper stays neutral `#f5f6f3`.
