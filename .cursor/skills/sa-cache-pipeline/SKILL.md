---
name: sa-cache-pipeline
description: >-
  Social Archiver cache pipeline for Weibo, X, and Instagram: original-only
  incremental archives, Cookie requirements, gallery-dl session reuse, Weibo
  page-turn stops and rate limits. Use when changing backend downloaders,
  cookie_check, browser_cookies, gallery_dl_runner, CookieInput, UserIdInput,
  download IPC, or cache/login behavior.
---

# Cache pipeline

Disk folder is the archive. Re-run deepens `{root}/{platform}/{user_id}/`; do not fork a new folder. Originals only (no 转发/retweets as the target user's work). Details: `交接文档.md`.

## Cookie (three copies of the same rules)

Must stay in sync: `src/utils/session.js`, `electron/cookie-rules.js`, `backend/cookie_check.py`.

| Platform | Required | Notes |
|----------|----------|--------|
| Weibo | `SUB=` from **m.weibo.cn** | Desktop weibo.com Cookie is wrong. Guest / `login: false` only sees a few posts. |
| X | `auth_token` **and** `ct0` | Guest token is not enough. |
| Instagram | `sessionid` | No username/password. Private accounts need follow. |

Lookup: `per_user["platform:userId"]` then platform key (`twitter` / `weibo` / `instagram`). Batch jobs must re-read Cookie at **task start**, not from the enqueue snapshot. **Edge import** (`applyBrowserCookieImports`) writes the platform global key only; existing `per_user` keys stay (v1.2.2). User id fields accept profile URLs (`x.com/…`, `instagram.com/…`, `weibo.com/u/…`) via `normalizeUserId`. Weibo IDs must be numeric UIDs; nickname / custom-domain URLs are rejected.

## X session Cookie (v1.2.1)

gallery-dl refreshes `ct0`. Persist Netscape cookies at `{root}/twitter/.session-cookies.txt`.

- Reuse when `auth_token` matches and `ct0` exists; do **not** overwrite with the UI's stale Cookie.
- Copy to `{user}/.twitter-cookies.txt` for that account.
- On job end, emit `cookie` on a status event so the main process writes settings + cache-page input.

Do not use `x.com/{handle}/media`. URLs: handle → `/tweets`; numeric → `/id:{id}/tweets`.

## Weibo paging

- `EXISTING_STREAK_STOP = 5`: consecutive complete cached originals (not pinned) stop paging, unless deep backtrack or a start date is set.
- `MAX_PAGES = 200`; hitting the cap is **not** "all history done".
- Sleep ~8–13s per page; extra 45–75s every 3 pages. After in-session cooldown, save checkpoint; tell the user to wait 30–60 minutes before deep backtrack.
- Changing date range filters only; do not reset `lastSinceId` / `lastPage`.
- Live photos: GET `video.weibo.com/media/play?livephoto=…` (Referer `https://weibo.com/`). Never GET bare `livephoto.us.sinaimg.cn`. Files `<64B` or starting with `{` `<` `[` are fake.

## Instagram

- Incremental via `.download-archive.sqlite`. Do not disable it for large accounts.
- Trust a usable cached `sessionid`. Sync from `persist:instagram-login` only when the cache is empty or unusable (`resolveInstagramJobCookie`).
- Stories are 24h; keep the existing warning.

## gallery-dl

Prefer `shutil.which("gallery-dl")`; frozen `--run-gallery-dl` is fallback. Keep antirate (`sleep` / `sleep-429` / threads ≤ 2). `normalize_concurrent(0)` must clamp to 1. Fatal errors must include the real exit code and stderr lines.

## Tests

Python: `tests/test_weibo.py`, `test_twitter.py`, `test_instagram.py`, `test_gallery_dl_runner.py`, `test_cookie_check.py`, `test_browser_cookies.py`. Frontend: `src/utils/session.test.ts`, `userId.test.ts`.
