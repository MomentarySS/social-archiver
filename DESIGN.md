---
name: Social Archiver
description: Local Weibo, X, and Instagram archives with unified light/dark reading chrome and platform-faithful post layout.
colors:
  paper: "#f4f4f5"
  surface: "#ffffff"
  ink: "#1a1a1a"
  muted: "#6b6b6b"
  accent: "#2563eb"
  entity: "#2563eb"
  hairline: "#ebebeb"
  edge: "#d4d4d4"
  media-well: "#f4f4f5"
  avatar: "#a1a1aa"
  cover-start: "#e4e4e7"
  cover-end: "#d4d4d8"
  void: "#09090b"
  void-ink: "#e4e4e7"
  void-muted: "#a1a1aa"
  void-accent: "#3b82f6"
  void-hairline: "#27272a"
  void-edge: "#3f3f46"
  void-field: "#18181b"
  void-media: "#18181b"
  danger: "#dc2626"
  ok: "#16a34a"
typography:
  display:
    fontFamily: "system-ui, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "system-ui, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  title:
    fontFamily: "system-ui, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "system-ui, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "system-ui, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
  meta:
    fontFamily: "system-ui, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
  code:
    fontFamily: "ui-monospace, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  none: "0px"
  chip: "4px"
  media: "16px"
  pill: "999px"
  avatar: "50%"
spacing:
  bar: "8px 16px"
  post: "12px 16px"
  feed: "600px"
  media-weibo: "4px"
  media-x: "2px"
components:
  button-weibo-primary:
    backgroundColor: "{colors.weibo-saffron}"
    textColor: "{colors.weibo-surface}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "32px"
    typography: "{typography.label}"
  button-weibo-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.weibo-ink}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "32px"
    typography: "{typography.label}"
  button-x-primary:
    backgroundColor: "{colors.sky-link}"
    textColor: "{colors.weibo-surface}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "32px"
    typography: "{typography.label}"
  button-x-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.x-text}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "32px"
    typography: "{typography.label}"
  button-ig-primary:
    backgroundColor: "{colors.ig-blue}"
    textColor: "{colors.ig-surface}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "32px"
    typography: "{typography.label}"
  button-ig-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ig-ink}"
    borderColor: "{colors.ig-edge}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "32px"
    typography: "{typography.label}"
  select-ig:
    backgroundColor: "{colors.ig-surface}"
    textColor: "{colors.ig-ink}"
    borderColor: "{colors.ig-edge}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
    typography: "{typography.label}"
  post-ig:
    backgroundColor: "{colors.ig-surface}"
    textColor: "{colors.ig-ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.post}"
    typography: "{typography.body}"
  select-weibo:
    backgroundColor: "{colors.weibo-surface}"
    textColor: "{colors.weibo-ink}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
    typography: "{typography.label}"
  select-x:
    backgroundColor: "{colors.x-surface}"
    textColor: "{colors.x-text}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
    typography: "{typography.label}"
  post-weibo:
    backgroundColor: "{colors.weibo-surface}"
    textColor: "{colors.weibo-ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.post}"
    typography: "{typography.body}"
  post-x:
    backgroundColor: "{colors.x-void}"
    textColor: "{colors.x-text}"
    rounded: "{rounded.none}"
    padding: "{spacing.post}"
    typography: "{typography.body}"
---

# Design System: Social Archiver

## Overview

**Creative North Star: "The Local Reader"**

The archive should read calmly on this machine. The whole app shares one light or dark theme (default light), toggled from the top bar. Post layout still follows the source platform: Weibo nine-grid, X rounded media frame, Instagram header row.

Density stays source-faithful: 15px body, 600px column, 1px hairlines, circular avatars, platform-specific media grids. Offline `index.html` uses the same unified light reader theme. PRODUCT.md names the product Social Archiver; do not revive the old Media Harvester string.

**Key Characteristics:**
- Two reader themes only: light (default) and dark (browse toggle)
- Platform-faithful post structure, not platform-branded chrome
- Hairline depth instead of stacked cards
- System/CJK sans only; no display face
- Offline HTML matches the in-app reader, not a platform skin swap

## Colors

Two semantic palettes exposed as CSS variables (`--sa-*`). Browse can override them with `data-browse-theme`; the app shell defaults to light.

### Light (default)
- **Paper** (`paper`): Page ground and the 8px band under the profile.
- **Surface**: Feed column and posts.
- **Ink**: Names and body.
- **Muted**: Time, source, secondary profile line.
- **Accent**: Primary pills, active sort, verified badge, selection.
- **Entity**: @ and # in post body, “打开原文”.
- **Hairline / Edge**: Post dividers, selects, ghost button borders.
- **Media well**: Image/video placeholder ground.
- **Cover**: Neutral gray wash on the profile header only.

### Dark (browse toggle)
- **Void** ground and surface, **void-ink** text, **void-muted** meta, **void-accent** actions. Same structure as light; no platform tint.

### Named Rules
**The Two-Theme Rule.** Only light or dark chrome. Never reintroduce per-platform accent colors in browse chrome.

**The Layout-Not-Livery Rule.** Platform differences live in post structure (grid, media frame, meta row), not in toolbar or shell color.

## Typography

**Display Font:** system-ui / Segoe UI / PingFang SC / Microsoft YaHei
**Body Font:** the same stack
**Code Font:** ui-monospace / Consolas, 12px — cache log panel (UTF-8 Chinese status lines) and inline Cookie hints only

**Character:** Workhorse CJK/UI sans. Weight and size do the hierarchy; no display serif, no tracked uppercase brand type.

### Hierarchy
- **Display** (800, 20px, tight tracking): Profile name on the archive header.
- **Headline / Title** (700, 15px): Post display name.
- **Body** (400, 15px, 1.5–1.6): Post text. Weibo uses 1.6; X uses 1.5.
- **Label** (400, 13px): Toolbar, actions, “打开原文”.
- **Meta** (400, 12px, Weibo Muted): Time, 来自, brand subtitle.
- **Code** (400, 12px, ui-monospace): Cache log lines and inline field hints.

### Named Rules
**The Same-Face Rule.** One family for chrome, names, and posts. Do not pair a display face onto the reader.

## Layout

Browse is full-bleed under a thin tab strip. The feed is a 600px column on paper (light) or void (dark). Sticky archive bar is 8px 16px with a 12px blur. Theme toggle lives in the app top bar. Posts pad 12px 16px. Weibo media maxes near 360px with 4px gutters; X media maxes near 510px with 2px gutters and a 16px clip. Avatar is 50px on Weibo/IG posts, 40px on X, 72px on the profile. Empty states are centered, quiet, no illustration.

**Archive overview (Browse hub):** Default Browse right pane before any account is opened. Same 600px column, no avatars or media thumbnails. Header title + muted lede, summary strip on `--sa-field`, clickable user rows with platform pill + name + text-only stats. User mode shows a ghost **返回概览** pill in the sticky bar.

**Chrome polish (v1.1.1):** Cache and Settings use inset `sa-section` panels on `--sa-panel`. Controls share `--sa-hover`, `--sa-transition`, 12px control radius, and accent focus rings. Browse bar uses shared `sa-pill-btn` tokens. Post timeline layout unchanged.

## Elevation & Depth

Almost flat. Light mode’s only lift is a faint column shadow (`0 1px 3px rgba(0,0,0,0.06)`). Dark mode uses a 1px hairline column edge instead. Everything else is a 1px hairline or a cover block.

### Shadow Vocabulary
- **Light column** (`box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06)`): The 600px sheet only. Not on individual posts.

### Named Rules
**The Hairline Rule.** Posts separate with 1px dividers. Do not wrap each post in a card, radius, or extra shadow.

## Shapes

Circles for people (avatars, Weibo V). Pills for archive chrome (select, primary, ghost). Squares for Weibo nine-grid cells. 16px rounding only on X media frames. Posts themselves are unrounded rectangles.

## Components

Source-faithful layout: if Weibo or X would show it that way, so does the archive. Chrome color comes from the active light/dark theme only.

### Buttons
- **Shape:** Full pill (999px), 32px tall, 14px horizontal padding, 13px type.
- **Primary:** `--sa-accent` fill, white label, no border.
- **Ghost:** Transparent, 1px `--sa-edge`, `--sa-ink` label.
- **Hover / Focus:** Primary pills do not grow shadows. Disabled primary is 0.6 opacity.

### Cards / Containers
- **Corner Style:** None on posts. 16px only on X media.
- **Background:** `--sa-surface`.
- **Shadow Strategy:** Light column only, see Elevation.
- **Border:** Post bottom `--sa-hairline`.
- **Internal Padding:** 12px 16px.

### Inputs / Fields
- **Style:** Pill select, 32px, 12px padding. `--sa-field` + `--sa-edge`.
- **Focus:** Browser default on the documented theme; do not add Element glow.

Settings cookie rows are a compact name + masked value + ghost/danger pills, same 13px type as other operator fields. Do not show the raw cookie.

### Navigation
Thin product tabs in the sticky app bar. Active tab uses `--sa-accent` underline. Brand lockup is “Social Archiver” plus 社交存档. Theme toggle (“深色 / 浅色”) sits in the top bar beside the tabs.

### App icon
Rounded-square desktop mark on charcoal (`#111111`). Center motif: three isometric stacked plates in saffron, sky cyan, and magenta — layered archive, not a literal platform logo. Source PNGs live in `icons/social-archiver-icon-1024.png` (and `-512`); alternate drafts in `icons/previews/`; `scripts/write_icon.py` strips AI white margins then emits `icons/icon.ico` for Electron. No text in the glyph; readable at 16px.

### Signature: Timeline post
Left avatar, right body. Weibo: name + optional V, body with `--sa-entity` for @/# (or `#topic#` on Weibo), nine-grid, then time / 来自 / 查看原文. Live photos occupy one cell: still JPEG, hover plays the motion, `LIVE` badge bottom-left (10px/700, 18px tall, `rgba(0,0,0,0.55)`). Regular video cells are 16:9 with native controls. X: name + @handle + · time + 打开原文, body with `--sa-entity` entities, rounded media; GIFs and videos use controls, never a LIVE badge. Instagram: name + @handle + time, body with `--sa-entity` @/# entities, square grid, no LIVE badge; in-app cards and offline HTML use this header, not the Weibo meta row. If the window cannot decode a file, the cell becomes a short fallback with `color: inherit` — accent pill 「用系统播放器打开」 / 「打开实况」. No live 转发/评论/赞 or reply/repost/like row — those are not actionable in a local archive.

### Signature: Profile header
120px neutral cover (`--sa-cover`), overlapping circular avatar from `_avatar.*` or the first letter of the display name, 20px/800 name, 13px muted platform/id line (`微博 / id`, `X / id`, or `Instagram / id`), then an 8px paper band.

## Do's and Don'ts

### Do:
- **Do** switch the entire app shell (ground, tabs, pills, fields, posts, selection) with the active light/dark theme.
- **Do** keep the feed at 600px and posts flush, divided by hairlines.
- **Do** use `--sa-accent` as the only primary fill in chrome.
- **Do** match offline HTML to the same reader theme and tokens.

### Don't:
- **Don't** carry the purple `#667eea–#764ba2` header or Element primary `#409eff` into cache, browse, settings, or export.
- **Don't** reintroduce per-platform accent colors (Weibo orange, Sky Link, IG blue) in browse chrome.
- **Don't** card-stack posts, add display serifs, or invent a third “product” palette for reading.
- **Don't** treat “Media Harvester” as a mark to typeset or illustrate.
