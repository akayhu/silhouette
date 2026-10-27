---
name: 片刻剪趣
description: 繁體中文瀏覽器短影音剪輯工具。行銷頁是明亮、以產品為主角的創作者軟體官網，品牌紅是唯一的行動色。
colors:
  site-red: "#d42c22"
  site-red-deep: "#a8201a"
  site-red-soft: "#fdecea"
  site-sun: "#ffc94a"
  site-ink: "#16171b"
  site-soft: "#4b4e57"
  site-mute: "#6b6f78"
  site-line: "#e3e5e9"
  site-band: "#f4f5f7"
  site-bg: "#ffffff"
typography:
  hero:
    fontFamily: "'Noto Sans TC', 'Plus Jakarta Sans', system-ui, sans-serif"
    fontSize: "clamp(40px, 6vw, 84px)"
    fontWeight: 900
    lineHeight: 1.12
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Noto Sans TC', 'Plus Jakarta Sans', system-ui, sans-serif"
    fontSize: "clamp(30px, 3.6vw, 48px)"
    fontWeight: 900
    lineHeight: 1.2
  title:
    fontFamily: "'Noto Sans TC', 'Plus Jakarta Sans', system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 900
    lineHeight: 1.3
  lede:
    fontFamily: "'Noto Sans TC', 'Plus Jakarta Sans', system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.8
  body:
    fontFamily: "'Noto Sans TC', 'Plus Jakarta Sans', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.8
  small:
    fontFamily: "'Noto Sans TC', 'Plus Jakarta Sans', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  figure:
    fontFamily: "'Plus Jakarta Sans', 'Noto Sans TC', sans-serif"
    fontSize: "clamp(44px, 5vw, 68px)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
rounded:
  pill: "9999px"
  card: "24px"
  panel: "28px"
  band: "32px"
  window: "22px"
spacing:
  gutter-sm: "16px"
  gutter: "32px"
  section: "96px"
  container: "1180px"
components:
  button-red:
    backgroundColor: "{colors.site-red}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-red-hover:
    backgroundColor: "{colors.site-red-deep}"
  button-outline:
    backgroundColor: "#ffffff"
    textColor: "{colors.site-ink}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-white:
    backgroundColor: "#ffffff"
    textColor: "{colors.site-red-deep}"
    rounded: "{rounded.pill}"
    padding: "0 32px"
    height: "56px"
  pro-badge:
    backgroundColor: "{colors.site-red-soft}"
    textColor: "{colors.site-red-deep}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
---
# Design System: 片刻剪趣

## Overview

**Creative North Star: "Studio Bright"（明亮的創作者軟體官網）**

The marketing surfaces (homepage, pricing, 404, and the login/sign-up side panel) are a bright, product-forward software site. The owner pointed to a commercial video-editor site for its rhythm (big centred headline over a huge product window, feature tabs, a numbers band, three steps, a closing band) but asked for a different look: everything stays light, the brand red from the app is the only action colour, and nothing claims reviews, awards or usage numbers the product does not have.

The first viewport is a centred headline with one phrase in red, the lede, a red pill CTA, then the real editor screenshot in a browser-window frame with floating chips (「剪掉空拍 4 段 −11.6 秒」, 「自動字幕 6 句」, 「影片留在你的電腦」). The signature interaction is the AI tab panel: five tabs (自動剪輯, AI 字幕, 文字剪輯, 智能模板, 雙語字幕), each with its own live demo built from the product (phone demo with clickable effects, karaoke caption, transcript with struck-out words, template swatches, bilingual caption).

**Scope.** `.mk` in `MarketingLayout` covers homepage, pricing and 404. The auth pages use app components (`Field`, `Button`, brand red) with a light side panel in the same world. The app itself (editor, dashboard, account, admin) keeps its Operate grammar (Plus Jakarta Sans / Noto Sans TC, rounded-xl, `--shadow-card`). Logo is shared: ink square, white play mark, red dot.

**Key Characteristics:**
- White ground with light grey bands (`#f4f5f7`); no dark sections.
- Brand red for every action, the key phrase, check marks and figures; sun yellow only as a highlighter mark under one phrase.
- Noto Sans TC 900 headings; Plus Jakarta Sans for numerals.
- Rounded panels (22 to 32px), pill buttons and tabs, one soft shadow (`--shadow-site`).
- Section headings centred with a short sub; product visuals carry the persuasion.

## Colors

- **Brand Red** (`site-red`): primary buttons, the red phrase in the hero, check bullets, numbers band figures, featured plan border and badge, closing band.
- **Deep Red** (`site-red-deep`): button hover, badge text. **Red Wash** (`site-red-soft`): pro badges, icon circles, struck-out words in the transcript demo.
- **Sun** (`site-sun`): the `.marker` highlighter under one phrase per section at most; karaoke demo lit words.
- **Ink / Soft / Mute** (`site-ink`, `site-soft`, `site-mute`): headings, body, metadata. Mute is for small print on white only.
- **Band** (`site-band`): alternating sections, footer, local-first panel, cards on white. **Line** (`site-line`): 1px borders.

**The One Action Colour Rule.** Red always means act or emphasise; no second accent hue (the template swatches are product data).

## Typography

- **Hero** (900, clamp 40 to 84px, -0.02em): H1 only, centred, max 15em.
- **Headline** (900, clamp 30 to 48px): `SectionTitle`, centred, with a 17px sub.
- **Title** (900, 19 to 22px): card and tab-panel titles.
- **Lede/Body** (400, 15 to 18px, 1.8): prose.
- **Figure** (Plus Jakarta Sans 800, tabular via `.num`): prices, numbers band, durations.

## Layout

1180px content width (1240 for header/footer), 16px gutters (32px from `sm`). Sections 96px vertical, alternating white and band. Hero window max 1100px with chips hanging off its edges at `lg`. AI tabs: pill tablist above a white 28px panel split text/visual at `lg`. Feature groups: 3 columns of bordered cards. Use cases: 4 band cards. Plans: two cards, featured with 2px red border and a pill badge. FAQ: stacked rounded `details`. Closing: a red 32px-radius band inside the container.

## Elevation & Depth

One shadow, `--shadow-site` (2px contact plus a long soft drop), used on the hero window, chips, featured plan, phone, open FAQ items and 404 card. Primary buttons carry a red-tinted glow under them. Everything else is flat with 1px lines.

## Components

- **Buttons:** `mkButton('red' | 'outline' | 'white', 'md' | 'lg')`, all pills.
- **SectionTitle:** centred headline plus sub.
- **Chip:** white pill with a red-wash icon circle, used only around the hero window.
- **Tabs:** pill tablist (active = ink fill, white text).
- **ProBadge:** red-wash pill 「專業版」.

## Do's and Don'ts

- Do show the real product (editor screenshot, demos built from product code); label demo numbers 示範.
- Don't add dark hero sections (owner requirement: no black backgrounds), a second accent colour, testimonials, awards or invented stats.
- Don't put eyebrow labels above headings or use unicode glyphs as icons.
