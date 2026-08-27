---
name: Social Archiver
description: Local Weibo, X, and Instagram archives that read like the source timelines.
colors:
  weibo-saffron: "#ff8200"
  weibo-topic: "#eb7350"
  weibo-paper: "#f2f2f5"
  weibo-surface: "#ffffff"
  weibo-ink: "#333333"
  weibo-muted: "#939393"
  weibo-avatar: "#ffb366"
  weibo-hairline: "#f0f0f0"
  weibo-action: "#636363"
  weibo-bar-edge: "#e6e6e6"
  x-void: "#000000"
  sky-link: "#1d9bf0"
  x-text: "#e7e9ea"
  x-muted: "#71767b"
  x-hairline: "#2f3336"
  x-surface: "#16181c"
  x-banner: "#333639"
  x-avatar: "#536471"
  x-like: "#f91880"
  x-repost: "#00ba7c"
  ig-blue: "#0095f6"
  ig-paper: "#fafafa"
  ig-surface: "#ffffff"
  ig-ink: "#262626"
  ig-muted: "#8e8e8e"
  ig-hairline: "#efefef"
  ig-edge: "#dbdbdb"
  ig-danger: "#ed4956"
  ig-cover-start: "#f58529"
  ig-cover-mid: "#dd2a7b"
  ig-cover-end: "#515bd4"
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

**Creative North Star: "The Local Mirror"**

The archive should look like the site it came from. Weibo posts sit on pale paper under Weibo Saffron; X posts sit in black under Sky Link; Instagram posts sit on app paper under IG Blue. Switching accounts switches rooms. Cache, browse, and settings share that room: picking a platform on the cache page (or opening an archive) paints the whole shell.

Density is source-faithful: 15px body, 600px column, 1px hairlines, circular avatars, Weibo nine-grid, X 16px media, pill fields and actions. Offline `index.html` mirrors the same reading experience (Instagram archives currently export through the light Weibo-style layout). PRODUCT.md names the product Social Archiver; do not revive the old Media Harvester string.

**Key Characteristics:**
- One source skin at a time (Weibo light, X dark, or Instagram light)
- Source-faithful controls, not a generic dashboard
- Hairline depth instead of stacked cards
- System/CJK sans only; no display face
- Offline HTML is the same mirror, not a restyle

## Colors

Three complete palettes. Never mix Weibo Saffron onto X void, Sky Link onto Weibo paper, or IG Blue onto the wrong room.

### Primary
- **Weibo Saffron**: Active tab, primary pill, verified badge, Weibo cover wash. Rare on the feed itself; the paper and ink do the reading.
- **Sky Link**: Active tab, primary pill, @/hashtag, "打开原文". The only saturated color on X besides like/repost state.
- **IG Blue**: Active tab, primary pill, @/hashtag on Instagram. The only saturated color on the Instagram feed besides the cover gradient.

### Secondary
- **Weibo Topic** (`weibo-topic`): @ and # in Weibo body text.
- **X Like** / **X Repost**: Hover-only on action icons, matching the source network.

### Neutral
- **Weibo Paper**: Page ground and the 8px band under the profile.
- **Weibo Surface**: Feed column and posts.
- **Weibo Ink**: Names and body.
- **Weibo Muted**: Time, source, secondary profile line.
- **X Void**: Page and post ground.
- **X Text**: Names and body.
- **X Muted**: Handle, time, idle actions.
- **X Hairline**: Column edge, post dividers, media frame.
- **X Surface**: Media well and dark selects.
- **IG Paper**: Instagram page ground and the 8px band under the profile.
- **IG Surface**: Feed column and posts.
- **IG Ink**: Names and body.
- **IG Muted**: Handle, time, secondary profile line.
- **IG Hairline / IG Edge**: Post dividers, selects, ghost button borders.
- **IG Cover**: The brand gradient (amber → magenta → indigo) on the profile cover only.

### Named Rules
**The One Skin Rule.** A screen is Weibo, X, or Instagram, never mixed. Accents, selection color, and hairlines all come from the active skin.

**The Whole-Shell Rule.** Cache, browse, and settings inherit the active skin. Do not keep a third “tool” palette for operator pages.

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
**The Same-Face Rule.** One family for chrome, names, and posts. Do not pair a display face onto the mirror.

## Layout

Browse is full-bleed under a thin tab strip. The feed is a 600px column: Weibo as a white sheet on paper; X as a void column edged with hairlines. Sticky archive bar is 8px 16px with a 12px blur. Posts pad 12px 16px. Weibo media maxes near 360px with 4px gutters; X media maxes near 510px with 2px gutters and a 16px clip. Avatar is 50px on Weibo posts, 40px on X, 72px on the profile. Empty states are centered, quiet, no illustration.

## Elevation & Depth

Almost flat. Weibo’s only lift is a faint column shadow (`0 1px 3px rgba(0,0,0,0.06)`). Everything else is a 1px hairline or a cover block. X has no shadows; depth is the `#2f3336` rule and the 16px media well.

### Shadow Vocabulary
- **Weibo column** (`box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06)`): The 600px sheet only. Not on individual posts.

### Named Rules
**The Hairline Rule.** Posts separate with 1px dividers. Do not wrap each post in a card, radius, or extra shadow.

## Shapes

Circles for people (avatars, Weibo V). Pills for archive chrome (select, primary, ghost). Squares for Weibo nine-grid cells. 16px rounding only on X media frames. Posts themselves are unrounded rectangles.

## Components

Source-faithful: if Weibo or X would show it that way, so does the archive.

### Buttons
- **Shape:** Full pill (999px), 32px tall, 14px horizontal padding, 13px type.
- **Primary:** Weibo Saffron, Sky Link, or IG Blue fill, white label, no border.
- **Ghost:** Transparent; Weibo 1px bar-edge, X 1px avatar-gray (`x-avatar`).
- **Hover / Focus:** Primary pills do not grow shadows. Disabled primary is 0.6 opacity.

### Cards / Containers
- **Corner Style:** None on posts. 16px only on X media.
- **Background:** Weibo Surface or X Void.
- **Shadow Strategy:** Column only, see Elevation.
- **Border:** Weibo post bottom `#f0f0f0`; X post bottom `#2f3336`.
- **Internal Padding:** 12px 16px.

### Inputs / Fields
- **Style:** Pill select, 32px, 12px padding. Weibo white + bar-edge; X surface + hairline.
- **Focus:** Browser default on the documented skin; do not add Element glow.

### Navigation
Thin product tabs in the sticky app bar. Weibo: paper strip, Saffron underline on the active pill. X: void strip, Sky Link underline. Brand lockup is “Social Archiver” plus 社交存档.

### Signature: Timeline post
Left avatar, right body. Weibo: name + optional V, body with topic color, nine-grid, then time / 来自 / 查看原文. Live photos occupy one cell: still JPEG, hover plays the motion, `LIVE` badge bottom-left (10px/700, 18px tall, `rgba(0,0,0,0.55)`). Regular video cells are 16:9 with native controls. X: name + @handle + · time + 打开原文, body with Sky Link entities, rounded media; GIFs and videos use controls, never a LIVE badge. If the window cannot decode a file, the cell becomes a short fallback (white copy on `#111`) with a 28px primary pill — Weibo Saffron 「用系统播放器打开」 / 「打开实况」, Sky Link on X. No live 转发/评论/赞 or reply/repost/like row — those are not actionable in a local archive.

### Signature: Profile header
120px cover (Weibo Saffron→avatar wash, X banner gray, Instagram brand gradient), overlapping circular avatar from `_avatar.*` or the first letter of the display name, 20px/800 name, 13px muted id line (Weibo `微博 / id`, X and Instagram `@handle`), then an 8px paper band (Weibo, Instagram) or hairline (X).

## Do's and Don'ts

### Do:
- **Do** switch the entire app shell (ground, tabs, pills, fields, posts, selection) with the active skin.
- **Do** keep the feed at 600px and posts flush, divided by hairlines.
- **Do** use Weibo Saffron, Sky Link, and IG Blue as the only primary fills in their rooms.
- **Do** match offline HTML to the same skins.

### Don't:
- **Don't** carry the purple `#667eea–#764ba2` header or Element primary `#409eff` into cache, browse, settings, or export.
- **Don't** mix Weibo Saffron onto X Void or Sky Link onto Weibo Paper.
- **Don't** card-stack posts, add display serifs, or invent a third “product” palette for reading.
- **Don't** treat “Media Harvester” as a mark to typeset or illustrate.
