# Product

<!-- impeccable:product-schema 1 -->
<!-- 启动和开发说明在 README.md / 交接文档.md，本文件只写产品边界。 -->

## Platform

web

## Users

Primary user is the owner of this machine: a person locally archiving Weibo, X, and Instagram accounts they care about. The job is to get original posts onto disk, read them offline like the source timelines, and come back later to incrementally update the same folders. This is not a multi-user or hosted product.

## Product Purpose

Social Archiver (社交存档) is a Windows desktop app that caches a chosen user's original posts—text as well as images and video—from Weibo, X, and Instagram. Success is a complete, updatable local archive that can be browsed in-app or as an offline `index.html`, without depending on the live site remaining available.

## Positioning

The archive lives on the user's disk as the source of truth: same output directory and user ID accumulate new original posts, skip files already present, and refresh the offline page. Neighboring downloaders that only grab media, or that write a new folder every run, cannot claim this.

## Operating Context

Used on Windows as an Electron shell around a Vue UI, with a Python backend. The person logs into Weibo (`m.weibo.cn` Cookie / SUB), X (`auth_token` + `ct0`), and Instagram (`sessionid`) inside the app or by paste. They pick one download root; each account is `{root}/{platform}/{user_id}/`. Daily use is: cache → browse the native-like timeline tab, or open `index.html` in a browser → later re-cache the same user into the same folder. Date range filters are optional. GPU is disabled in the packaged Electron launch because of past WebGL crashes.

Distribution is a Windows zip (not an NSIS installer): unzip and run `Social Archiver.exe` with a bundled `backend.exe` (PyInstaller onedir + gallery-dl). Recipients do not install Python. The whole `win-unpacked` folder must stay together; copying only the exe breaks caching. Cache progress logs are UTF-8 end-to-end in the packaged build.

## Capabilities and Constraints

Confirmed now:

- Platforms in use: Weibo, X, and Instagram. All three have been cached and browsed from real local archives on this machine.
- Original posts only (no 转发 / retweets); text-only posts are first-class, not skipped.
- Incremental writes into the existing user folder; media that already exists is skipped; metadata and `index.html` are refreshed.
- In-app browse mimics the source timeline (Weibo light, X dark, Instagram light). Offline HTML is written to the user folder after a successful cache and can be regenerated from Browse.
- Cookie-gated access; X guest tokens are not sufficient.
- Weibo live photos are one grid cell (still + hover motion), not a still plus a separate video cell.
- Videos play in the window when Chromium can decode them. Files that only the OS player can decode (often HEVC live motion) stay on disk and open via the system player from the card.
- Profile avatars are cached next to the archive (`_avatar.jpg` / `_avatar.png` / `_avatar.webp` / `_avatar.gif`) and shown on the profile header and each post.
- Packaged Windows zip ships a frozen backend (Weibo fetcher + gallery-dl for X and Instagram); no separate Python install for end users.

Undecided, do not lock:

- Additional social platforms may be added later; current UI and copy may treat Weibo + X + Instagram as the present set without encoding a three-platform forever product.

Not this product:

- Cloud sync, accounts, or a public website.
- Archiving other people's media from quotes/retweets as if it were the target user's original work.

## Brand Commitments

Product name is **Social Archiver** / **社交存档**. The installer, window title, and in-app lockup use this. Do not revive the old “Media Harvester” string. Voice is direct Chinese for an operator sitting at the machine; no marketing English unless the user adds it.

## Evidence on Hand

Real artifacts are the local archives this user creates (post JSON under `_posts/`, media by date, `_profile.json`, `_avatar.jpg` or `_avatar.png`, `index.html`). There are no testimonials, customer logos, usage metrics, or press. Future surfaces must not invent social proof, download counts, or supported-platform claims beyond what is listed above.

## Product Principles

1. The disk folder is the archive; re-running a cache must deepen it, not fork it.
2. Original words count as much as original media.
3. Reading should feel like the source timeline, including the offline HTML.
4. Auth and files stay on this machine; do not add a network product around them.
5. Weibo, X, and Instagram are the current set, not a ceiling to bake into the architecture.
