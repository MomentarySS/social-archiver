import json
import os
import random
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape
from typing import Dict, Iterator, List, Optional, Tuple
from urllib.parse import parse_qs, quote, unquote, urlparse

import requests

from backend.gallery_dl_runner import normalize_concurrent
from backend.daterange import order_days, parse_day, parse_weibo_created_at
from backend.metadata import download_avatar, save_post_metadata, save_profile

MAX_PAGES = 200
# Page-turn delay: m.weibo.cn is sensitive to rapid pagination (see RSSHub #20512).
REQUEST_SLEEP = 8.0
REQUEST_SLEEP_JITTER = (2.0, 5.0)
PAGE_BURST_EVERY = 3
PAGE_BURST_SLEEP = (45.0, 75.0)
WEIBO_MEDIA_WORKERS_MAX = 2
EXISTING_STREAK_STOP = 5
PAGE_RETRIES = 4
PAGE_RETRY_SLEEP = (3.0, 8.0, 15.0)
PAGE_RETRY_SLEEP_DEEP = (30.0, 60.0, 90.0)
# One in-session cooldown, then save checkpoint — come back after 30–60 minutes.
PAGE_COOLDOWN_RETRY = (180.0,)
PAGE_FAIL_SWITCH_THRESHOLD = 2


def _checkpoint_date_range(profile: Dict) -> Tuple[str, str]:
    return (
        str(profile.get("checkpointStartDate") or ""),
        str(profile.get("checkpointEndDate") or ""),
    )


def _date_range_changed(profile: Dict, start_date: Optional[str], end_date: Optional[str]) -> bool:
    current = (start_date or "", end_date or "")
    if current == ("", ""):
        return False
    return _checkpoint_date_range(profile) != current


def _yield_countdown(seconds: float) -> Iterator[Dict]:
    remaining = max(0.0, float(seconds))
    while remaining > 0:
        chunk = min(15.0, remaining)
        time.sleep(chunk)
        remaining -= chunk
        if remaining >= 1:
            yield {"type": "status", "msg": f"等待中…剩余约 {int(remaining)} 秒"}


def _as_dict(value) -> Dict:
    return value if isinstance(value, dict) else {}


def _as_list(value) -> list:
    return value if isinstance(value, list) else []


def _safe_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _response_data(payload: Optional[Dict]) -> Dict:
    if not isinstance(payload, dict):
        return {}
    return _as_dict(payload.get("data"))


def _cardlist_info(payload: Optional[Dict]) -> Dict:
    return _as_dict(_response_data(payload).get("cardlistInfo"))


def _read_user_profile(user_dir: str) -> Dict:
    path = os.path.join(user_dir, "_profile.json")
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle) or {}
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def download_weibo_media(
    user_id: str,
    cookie: str,
    output_dir: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    concurrent: int = 3,
    naming_template: Optional[str] = None,
    deep_backtrack: bool = False,
    include_quoted: bool = False,
) -> Iterator[Dict]:
    """Download a Weibo user's timeline media via the m.weibo.cn API."""
    if include_quoted:
        yield {"type": "status", "msg": f"准备缓存微博用户 {user_id} 的原创内容 + 带评论转发（标注引用）…"}
    else:
        yield {"type": "status", "msg": f"准备缓存微博用户 {user_id} 的原创内容（文字 + 图片/视频）..."}
    start_dt, end_dt, swapped = order_days(parse_day(start_date), parse_day(end_date))
    if start_dt or end_dt:
        yield {
            "type": "status",
            "msg": f"日期范围: {start_dt or '不限'} ~ {end_dt or '不限'}（含首尾）",
        }
        if swapped:
            yield {"type": "status", "msg": "起始日晚于结束日，已按从早到晚对调。"}
        yield {
            "type": "status",
            "msg": (
                "微博翻页风控较严：时间线从新到旧翻，早年内容通常要翻很多页。"
                "单次任务可能只推进几页，请多次「深度回溯」并间隔 30–60 分钟续跑。"
            ),
        }

    cookie = _normalize_cookie(cookie)
    if not cookie:
        yield {"type": "error", "msg": "微博需要 Cookie 才能完整访问。请在 m.weibo.cn 登录后，从开发者工具复制完整 Cookie（至少包含 SUB）。"}
        return
    if "SUB=" not in cookie:
        yield {"type": "status", "msg": "Cookie 中未发现 SUB 字段，接口可能返回不完整数据。"}

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 "
            "Mobile/15E148 Safari/604.1"
        ),
        "Referer": f"https://m.weibo.cn/u/{user_id}",
        "X-Requested-With": "XMLHttpRequest",
        "MWeibo-Pwa": "1",
        "Accept": "application/json, text/plain, */*",
    }
    session = _cookie_session(cookie)
    logged_in = _ensure_weibo_logged_in(session, headers, user_id)
    if not logged_in:
        yield {
            "type": "error",
            "msg": (
                "微博 Cookie 未处于登录状态，无法翻页拉取完整时间线。"
                "若刚被翻页风控打断，请等 30–60 分钟再试，不必立刻重新登录。"
                "仍失败时再到设置页检测 Cookie 或应用内重新登录。"
            ),
        }
        return

    os.makedirs(os.path.join(output_dir, "weibo"), exist_ok=True)
    workers = max(1, min(normalize_concurrent(concurrent), WEIBO_MEDIA_WORKERS_MAX))
    template = naming_template or "{post_id}_{index}"
    user_dir = os.path.join(output_dir, "weibo", str(user_id))
    profile = _read_user_profile(user_dir)

    page = 1
    since_id = ""
    pagination_mode = "since_id"
    page_fail_count = _safe_int(profile.get("lastPageFailCount"), 0)
    last_fail_page = _safe_int(profile.get("lastFailPage"), 0)
    range_changed = _date_range_changed(profile, start_date, end_date)
    if range_changed:
        yield {
            "type": "status",
            "msg": (
                "日期范围已更新，继续从当前翻页进度扫描（只收录范围内的帖文）。"
                "换月份不必重新登录。"
            ),
        }
    elif profile.get("fetchStatus") in ("partial", "page_limit") and not deep_backtrack:
        deep_backtrack = True
        yield {"type": "status", "msg": "检测到上次未拉完，自动从断点继续。"}
    if not range_changed and deep_backtrack and profile.get("fetchStatus") in ("partial", "page_limit"):
        page = max(1, _safe_int(profile.get("lastPage"), 1))
        pagination_mode = str(profile.get("paginationMode") or "since_id")
        if page == last_fail_page and page_fail_count >= 1:
            since_id = ""
            pagination_mode = "page"
            yield {
                "type": "status",
                "msg": (
                    f"第 {page} 页上次失败，已自动改用页码翻页重试。"
                    "若仍卡住，请隔 10–30 分钟再跑。"
                ),
            }
        elif (
            pagination_mode == "since_id"
            and page_fail_count >= PAGE_FAIL_SWITCH_THRESHOLD
            and page == last_fail_page
        ):
            since_id = ""
            pagination_mode = "page"
            yield {
                "type": "status",
                "msg": (
                    f"第 {page} 页 since_id 多次失败，已自动改用页码翻页。"
                    "若仍卡住，可在日期范围里按年份分段缓存。"
                ),
            }
        elif pagination_mode == "since_id" and profile.get("lastSinceId"):
            since_id = str(profile.get("lastSinceId") or "")
            sid_hint = f"{since_id[:12]}…" if len(since_id) > 12 else since_id
            yield {
                "type": "status",
                "msg": f"深度回溯：从第 {page} 页断点继续（since_id={sid_hint}）",
            }
        else:
            since_id = ""
            yield {
                "type": "status",
                "msg": f"深度回溯：从第 {page} 页断点继续（页码模式）",
            }
    elif deep_backtrack:
        yield {"type": "status", "msg": "深度回溯：将忽略「连续已缓存即停」，直至无更多页或达到页数上限。"}
    total_downloaded = 0
    total_skipped = 0
    total_posts = 0
    total_text = 0
    skipped_existing = 0
    reached_start = False
    reached_existing = False
    failed = False
    seen_ids = set()
    existing_streak = 0
    hit_page_limit = False
    natural_end = False
    api_total = 0
    rate_limited = False
    pages_since_burst = 0
    profile_was_partial = profile.get("fetchStatus") in ("partial", "page_limit")

    while page <= MAX_PAGES and not reached_start and not reached_existing:
        params = _build_weibo_page_params(user_id, page, since_id)

        yield {"type": "status", "msg": f"正在获取微博第 {page} 页..."}

        if page > 1 and pages_since_burst >= PAGE_BURST_EVERY:
            burst = random.uniform(*PAGE_BURST_SLEEP)
            yield {
                "type": "status",
                "msg": f"已连续翻页 {PAGE_BURST_EVERY} 次，暂停 {int(burst)} 秒以降低风控…",
            }
            yield from _yield_countdown(burst)
            pages_since_burst = 0

        if page > 1 or not headers.get("X-XSRF-TOKEN"):
            _refresh_weibo_st(session, headers)
        data, page_error = _fetch_weibo_page(
            session, headers, params, page=page, max_retries=2,
            profile_was_partial=profile_was_partial,
        )
        if page_error and since_id and page > 1:
            yield {
                "type": "status",
                "msg": f"since_id 翻页受阻，改用第 {page} 页页码重试…",
            }
            fallback_params = _build_weibo_page_params(user_id, page, "")
            data, page_error = _fetch_weibo_page(
                session, headers, fallback_params, page=page, max_retries=2,
                profile_was_partial=profile_was_partial,
            )
            if not page_error:
                since_id = ""
                pagination_mode = "page"

        if page_error and page > 1:
            for cooldown_index, wait_secs in enumerate(PAGE_COOLDOWN_RETRY, start=1):
                minutes = max(1, int(wait_secs // 60))
                yield {
                    "type": "status",
                    "msg": (
                        f"第 {page} 页暂时失败，等待约 {minutes} 分钟后"
                        f"第 {cooldown_index} 次重试…"
                    ),
                }
                yield from _yield_countdown(wait_secs)
                _refresh_weibo_st(session, headers)
                data, page_error = _fetch_weibo_page(
                    session, headers, params, page=page, max_retries=1,
                    profile_was_partial=profile_was_partial,
                )
                if not page_error:
                    break
                if since_id:
                    fallback_params = _build_weibo_page_params(user_id, page, "")
                    data, page_error = _fetch_weibo_page(
                        session, headers, fallback_params, page=page, max_retries=1,
                        profile_was_partial=profile_was_partial,
                    )
                    if not page_error:
                        since_id = ""
                        pagination_mode = "page"
                        break

        if page_error:
            if page > 1:
                rate_limited = True
                if page == last_fail_page:
                    page_fail_count += 1
                else:
                    page_fail_count = 1
                    last_fail_page = page
                yield {
                    "type": "status",
                    "msg": (
                        f"第 {page} 页仍拉不到（微博翻页风控，Cookie 多半仍有效）。"
                        "已保存断点；请隔 30–60 分钟再勾「深度回溯」续跑。"
                        "拉 2019 年内容通常要翻几十上百页，分多次完成是正常的。"
                    ),
                }
                break
            yield {"type": "error", "msg": page_error}
            failed = True
            break

        page_fail_count = 0
        last_fail_page = 0

        cardlist_info = _cardlist_info(data)
        if not api_total:
            api_total = _safe_int(cardlist_info.get("total"), 0)

        cards = _iter_mblog_cards(_response_data(data).get("cards"))
        if not cards:
            yield {"type": "status", "msg": "没有更多内容了。"}
            natural_end = True
            break

        download_jobs: List[Tuple[str, str, Dict[str, str]]] = []
        new_on_page = 0

        for card in cards:
            try:
                mblog = _as_dict(card.get("mblog"))
                created_at = mblog.get("created_at", "unknown")
                post_id = str(mblog.get("id") or mblog.get("mid") or "")
                if post_id:
                    if post_id in seen_ids:
                        continue
                    seen_ids.add(post_id)
                    new_on_page += 1

                if not _should_include_mblog(mblog, user_id, include_quoted):
                    continue

                post_kind = _mblog_kind(mblog, user_id, include_quoted)

                post_dt = parse_weibo_created_at(created_at)
                post_day = post_dt.date() if post_dt else None
                pinned = _is_pinned(mblog)

                if end_dt and post_day and post_day > end_dt:
                    continue
                if start_dt and post_day and post_day < start_dt:
                    if not pinned:
                        reached_start = True
                    continue

                date_folder = _format_date(created_at)
                if post_id and _archive_post_complete(user_dir, date_folder, post_id):
                    skipped_existing += 1
                    if not deep_backtrack and not start_dt and not pinned:
                        existing_streak += 1
                        if existing_streak >= EXISTING_STREAK_STOP:
                            reached_existing = True
                            break
                    continue
                if not pinned:
                    existing_streak = 0

                if mblog.get("isLongText") or _safe_int(mblog.get("textLength")) > 140:
                    long_text = _fetch_long_text(session, post_id, headers)
                    if long_text:
                        mblog["text"] = long_text

                user = _as_dict(mblog.get("user"))
                if user:
                    avatar_dest = os.path.join(output_dir, "weibo", user_id, "_avatar.jpg")
                    avatar_url = user.get("profile_image_url") or user.get("avatar_hd") or ""
                    if avatar_url:
                        download_avatar(avatar_url.replace("/orj48/", "/orj180/"), avatar_dest, headers)
                    save_profile(os.path.join(output_dir, "weibo"), user_id, {
                        "platform": "weibo",
                        "user_id": user_id,
                        "name": user.get("screen_name") or user.get("name") or user_id,
                        "screen_name": user.get("screen_name") or user_id,
                        "verified": bool(user.get("verified")),
                        "avatar": "_avatar.jpg" if os.path.exists(avatar_dest) else "",
                    })

                media_items = _collect_media(mblog)
                if not media_items and not _plain_text(mblog.get("text") or ""):
                    continue

                metadata = _build_metadata(
                    mblog, user_id, media_items, date_folder, template, post_kind, pinned=pinned,
                )
                save_post_metadata(os.path.join(output_dir, "weibo"), user_id, metadata)
                total_posts += 1
                if not media_items:
                    total_text += 1
                    continue

                save_dir = os.path.join(output_dir, "weibo", user_id, date_folder)
                os.makedirs(save_dir, exist_ok=True)

                for item in _as_list(metadata.get("pics")):
                    item = _as_dict(item)
                    filename = item.get("filename") or ""
                    if not filename:
                        continue
                    filepath = os.path.join(save_dir, filename)
                    if _media_file_ok(filepath):
                        total_skipped += 1
                        yield {"type": "status", "msg": f"已存在，跳过: {filename}"}
                    else:
                        download_jobs.append((item.get("original_url") or "", filepath, headers))
                    video_name = item.get("video_filename") or ""
                    video_url = item.get("video_url") or ""
                    if video_name and video_url:
                        video_path = os.path.join(save_dir, video_name)
                        if _media_file_ok(video_path):
                            total_skipped += 1
                            yield {"type": "status", "msg": f"已存在，跳过: {video_name}"}
                        else:
                            download_jobs.append((video_url, video_path, headers))
            except Exception as e:
                yield {"type": "status", "msg": f"跳过一条异常微博：{e}"}
                continue

        if download_jobs:
            _sync_cookie_header(session, headers)
            for event in _download_jobs(download_jobs, workers):
                if event.get("type") == "downloaded":
                    total_downloaded += 1
                    yield {
                        "type": "progress",
                        "file": event["file"],
                        "current": total_downloaded,
                        "total": total_downloaded + len(download_jobs),
                        "percent": 100.0,
                    }
                    yield {"type": "status", "msg": f"已下载: {event['file']}"}
                elif event.get("type") == "failed":
                    yield {"type": "status", "msg": f"下载失败 {event['file']}: {event['msg']}"}

        if reached_start:
            yield {"type": "status", "msg": "已到达起始日期，停止翻页。"}
            break

        if reached_existing:
            yield {"type": "status", "msg": "已遇到连续已缓存帖子，停止翻页。"}
            break

        if new_on_page == 0:
            yield {"type": "status", "msg": "没有更多内容了。"}
            natural_end = True
            break

        next_since, next_page, has_more = _pagination_cursor(data, page, since_id)
        if not has_more:
            if api_total and len(seen_ids) < api_total:
                yield {
                    "type": "status",
                    "msg": (
                        f"接口显示该用户约有 {api_total} 条微博，但当前只能读到 {len(seen_ids)} 条。"
                        "请确认 Cookie 已登录，或稍后重试。"
                    ),
                }
            else:
                yield {"type": "status", "msg": "没有更多内容了。"}
            natural_end = True
            break

        since_id = next_since
        page = next_page
        pagination_mode = "since_id" if since_id else "page"
        checkpoint = {
            "lastPage": page,
            "paginationMode": pagination_mode,
            "fetchStatus": "partial",
            "deepBacktrack": True,
            "lastSinceId": since_id if since_id else "",
            "lastPageFailCount": 0,
            "lastFailPage": 0,
            "checkpointStartDate": start_date or "",
            "checkpointEndDate": end_date or "",
        }
        save_profile(os.path.join(output_dir, "weibo"), user_id, checkpoint)
        yield {
            "type": "status",
            "msg": f"已缓存 {total_posts} 条原创（文字 {total_text}，含媒体 {total_posts - total_text}）",
        }
        pages_since_burst += 1
        time.sleep(_page_sleep())

    if failed:
        return

    if page > MAX_PAGES and not reached_start and not reached_existing:
        hit_page_limit = True
        yield {
            "type": "status",
            "msg": (
                f"已翻到 {MAX_PAGES} 页上限，更早的微博未拉到。"
                "可开启深度回溯并再次运行以从断点继续，或设起始日期分段缓存。"
            ),
        }

    history_incomplete = bool(
        api_total
        and len(seen_ids) < api_total
        and not reached_start
        and not reached_existing
    )
    if hit_page_limit:
        fetch_status = "page_limit"
    elif rate_limited or history_incomplete or (deep_backtrack and not natural_end and not reached_start):
        fetch_status = "partial"
    elif natural_end or reached_start or (reached_existing and not deep_backtrack):
        fetch_status = "complete"
    elif deep_backtrack:
        fetch_status = "partial"
    else:
        fetch_status = "complete"

    profile_patch = {
        "fetchStatus": fetch_status,
        "deepBacktrack": bool(deep_backtrack),
        "includeQuoted": bool(include_quoted),
        "paginationMode": pagination_mode,
        "checkpointStartDate": start_date or "",
        "checkpointEndDate": end_date or "",
    }
    if fetch_status == "complete":
        profile_patch["lastSinceId"] = ""
        profile_patch["lastPage"] = 0
        profile_patch["paginationMode"] = ""
        profile_patch["lastPageFailCount"] = 0
        profile_patch["lastFailPage"] = 0
    elif fetch_status == "partial":
        profile_patch["lastPage"] = page
        profile_patch["lastSinceId"] = since_id if pagination_mode == "since_id" else ""
        profile_patch["lastPageFailCount"] = page_fail_count
        profile_patch["lastFailPage"] = last_fail_page if rate_limited else 0
    save_profile(os.path.join(output_dir, "weibo"), user_id, profile_patch)

    extra = f"，跳过已有 {skipped_existing} 条" if skipped_existing else ""
    yield {
        "type": "status",
        "msg": f"完成：共缓存 {total_posts} 条原创微博（文字 {total_text}，媒体文件 {total_downloaded}）{extra}",
    }
    _sync_cookie_header(session, headers)
    done_event = {
        "type": "done",
        "count": total_downloaded,
        "skipped": total_skipped,
        "posts": total_posts,
        "fetch_status": fetch_status,
        "output_dir": os.path.join(output_dir, "weibo", user_id),
    }
    refreshed_cookie = _session_cookie_string(session)
    if refreshed_cookie and "SUB=" in refreshed_cookie:
        done_event["cookie"] = refreshed_cookie
    yield done_event


def _archive_post_complete(user_dir: str, date_folder: str, post_id: str) -> bool:
    """True when this post's JSON exists and every media file on disk looks valid."""
    if not post_id:
        return False
    meta_path = os.path.join(user_dir, "_posts", date_folder, f"{post_id}.json")
    if not os.path.isfile(meta_path):
        return False
    try:
        with open(meta_path, encoding="utf-8") as handle:
            metadata = json.load(handle) or {}
    except Exception:
        return False
    if not isinstance(metadata, dict):
        return False
    for item in _as_list(metadata.get("pics")):
        item = _as_dict(item)
        if not item:
            continue
        folder = item.get("date_folder") or date_folder
        name = item.get("filename") or ""
        if name and not _media_file_ok(os.path.join(user_dir, folder, name)):
            return False
        video_name = item.get("video_filename") or ""
        if video_name and not _media_file_ok(os.path.join(user_dir, folder, video_name)):
            return False
    return True


def _iter_mblog_cards(cards) -> List[Dict]:
    found: List[Dict] = []
    for card in _as_list(cards):
        card = _as_dict(card)
        if not card:
            continue
        if card.get("mblog") and str(card.get("card_type") or "") == "9":
            found.append(card)
        for nested in _as_list(card.get("card_group")):
            nested = _as_dict(nested)
            if nested.get("mblog") and str(nested.get("card_type") or "") == "9":
                found.append(nested)
    return found


def _page_sleep() -> float:
    delay = REQUEST_SLEEP + random.uniform(*REQUEST_SLEEP_JITTER)
    return max(1.0, delay)


def _format_weibo_api_error(
    resp: requests.Response,
    data: Optional[Dict],
    page: int,
    profile_was_partial: bool = False,
) -> str:
    msg = ""
    ok = None
    if isinstance(data, dict):
        msg = (data.get("msg") or data.get("message") or "").strip()
        ok = data.get("ok")
    errno = data.get("errno") if isinstance(data, dict) else None
    parts = []
    if msg:
        parts.append(msg)
    if ok not in (None, "", 1):
        parts.append(f"ok={ok}")
    if errno not in (None, "", 0):
        parts.append(f"errno={errno}")
    if resp.status_code != 200:
        parts.append(f"HTTP {resp.status_code}")
    hint = f"（{'；'.join(parts)}）" if parts else ""
    if ok == -100:
        if page > 1 or profile_was_partial:
            return (
                f"微博第 {page} 页暂时失败{hint}。"
                "多半是翻页风控，稍后用深度回溯从断点继续即可。"
            )
        return (
            f"微博第 {page} 页接口返回错误{hint}。"
            "若刚换过日期范围或刚被风控打断，请等 30–60 分钟再试。"
            "仍失败再重新登录微博。"
        )
    return (
        f"微博第 {page} 页接口返回错误{hint}。"
        "可先在设置页检测 Cookie；若开了代理，微博缓存会自动直连。"
    )


def _ensure_weibo_logged_in(
    session: requests.Session,
    headers: Dict[str, str],
    user_id: str,
    retries: int = 2,
) -> bool:
    for attempt in range(retries):
        _warmup_weibo_profile(session, headers, user_id)
        if _refresh_weibo_st(session, headers):
            return True
        if attempt + 1 < retries:
            time.sleep(15.0 * (attempt + 1))
    return False


def _cookie_session(cookie: str) -> requests.Session:
    session = requests.Session()
    for part in cookie.split(";"):
        part = part.strip()
        if "=" not in part:
            continue
        name, value = part.split("=", 1)
        name = name.strip()
        value = value.strip()
        if not name:
            continue
        session.cookies.set(name, value)
    return session


def _sync_cookie_header(session: requests.Session, headers: Dict[str, str]) -> None:
    parts = [f"{item.name}={item.value}" for item in session.cookies]
    if parts:
        headers["Cookie"] = "; ".join(parts)


def _session_cookie_string(session: requests.Session) -> str:
    parts: List[str] = []
    seen = set()
    for item in session.cookies:
        name = (item.name or "").strip()
        value = (item.value or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        parts.append(f"{name}={value}")
    return "; ".join(parts)


def _refresh_weibo_st(session: requests.Session, headers: Dict[str, str]) -> bool:
    try:
        resp = session.get(
            "https://m.weibo.cn/api/config",
            headers={key: value for key, value in headers.items() if key.lower() != "cookie"},
            timeout=15,
        )
        data = resp.json() if resp.content else {}
        inner = _as_dict(data.get("data") if isinstance(data, dict) else None)
        st = inner.get("st")
        if st:
            headers["X-XSRF-TOKEN"] = str(st)
        _sync_cookie_header(session, headers)
        return bool(inner.get("login"))
    except Exception:
        return False


def _build_weibo_page_params(user_id: str, page: int, since_id: str) -> Dict[str, str]:
    params = {
        "type": "uid",
        "value": str(user_id),
        "containerid": f"107603{user_id}",
    }
    if since_id:
        params["since_id"] = since_id
    elif page > 1:
        params["page"] = str(page)
    return params


def _page_retry_sleep(page: int, attempt: int) -> float:
    sleeps = PAGE_RETRY_SLEEP if page <= 1 else PAGE_RETRY_SLEEP_DEEP
    return sleeps[min(attempt, len(sleeps) - 1)]


def _warmup_weibo_profile(session: requests.Session, headers: Dict[str, str], user_id: str) -> None:
    try:
        session.get(
            f"https://m.weibo.cn/u/{user_id}",
            headers={key: value for key, value in headers.items() if key.lower() != "cookie"},
            timeout=20,
        )
        _sync_cookie_header(session, headers)
    except Exception:
        pass


def _fetch_weibo_page(
    session: requests.Session,
    headers: Dict[str, str],
    params: Dict[str, str],
    page: int = 1,
    max_retries: Optional[int] = None,
    profile_was_partial: bool = False,
) -> Tuple[Optional[Dict], Optional[str]]:
    url = "https://m.weibo.cn/api/container/getIndex"
    last_error = ""
    retries = max_retries if max_retries is not None else (PAGE_RETRIES if page > 1 else 2)
    for attempt in range(retries):
        try:
            resp = session.get(
                url,
                headers={key: value for key, value in headers.items() if key.lower() != "cookie"},
                params=params,
                timeout=30,
            )
        except requests.exceptions.RequestException as e:
            last_error = f"获取第 {page} 页失败: {e}"
            if attempt + 1 < retries:
                time.sleep(_page_retry_sleep(page, attempt))
                continue
            return None, last_error

        _sync_cookie_header(session, headers)

        try:
            data = resp.json()
        except ValueError:
            snippet = (resp.text or "")[:500] or "(empty)"
            return None, (
                f"微博接口返回了非 JSON 内容（状态码 {resp.status_code}）。\n"
                f"内容预览: {snippet}\n"
                "请检查 Cookie 是否有效（需含 SUB），以及用户 ID 是否正确。"
            )

        if not isinstance(data, dict):
            last_error = f"微博第 {page} 页返回了非对象 JSON。"
            if attempt + 1 < retries:
                time.sleep(_page_retry_sleep(page, attempt))
                continue
            return None, last_error

        if data.get("ok") == 1:
            return data, None

        last_error = _format_weibo_api_error(resp, data, page, profile_was_partial)
        if attempt + 1 < retries:
            if data.get("ok") == -100:
                _refresh_weibo_st(session, headers)
            time.sleep(_page_retry_sleep(page, attempt))
            continue
        return None, last_error

    return None, last_error or f"获取第 {page} 页失败"


def _pagination_cursor(payload: Dict, page: int, since_id: str) -> Tuple[str, int, bool]:
    """Return the next (since_id, page, has_more) for timeline pagination."""
    info = _cardlist_info(payload)
    raw_since = info.get("since_id") if info.get("since_id") not in (None, "", 0, "0") else info.get("max_id")
    if raw_since not in (None, "", 0, "0"):
        next_since = str(raw_since).strip()
        if next_since and next_since != since_id:
            return next_since, page + 1, True
        return "", page, False

    api_page = _safe_int(info.get("page"), 0)
    if api_page > page:
        return "", api_page, True
    return "", page, False


def _is_pinned(mblog: Dict) -> bool:
    if str(mblog.get("isTop") or "").lower() in {"1", "true"}:
        return True
    title = mblog.get("title")
    if isinstance(title, dict):
        title = title.get("text") or ""
    return "置顶" in str(title or "")


def _is_original(mblog: Dict, user_id: str) -> bool:
    if mblog.get("retweeted_status"):
        return False
    owner = str(
        _as_dict(mblog.get("user")).get("id")
        or _as_dict(mblog.get("user")).get("idstr")
        or ""
    )
    return not owner or owner == str(user_id)


def _forward_has_comment(mblog: Dict) -> bool:
    text = _plain_text(mblog.get("text") or "")
    inner = _as_dict(mblog.get("retweeted_status"))
    inner_text = _plain_text(inner.get("text") or "")
    if not inner_text:
        return bool(text.strip())
    if text.strip() == inner_text.strip():
        return False
    if text.strip().startswith("转发微博") and len(text.strip()) <= len(inner_text.strip()) + 8:
        return False
    return True


def _should_include_mblog(mblog: Dict, user_id: str, include_quoted: bool) -> bool:
    if _is_original(mblog, user_id):
        return True
    return include_quoted and bool(mblog.get("retweeted_status")) and _forward_has_comment(mblog)


def _mblog_kind(mblog: Dict, user_id: str, include_quoted: bool) -> str:
    if _is_original(mblog, user_id):
        return "original"
    if include_quoted and mblog.get("retweeted_status") and _forward_has_comment(mblog):
        return "quote"
    return "original"


def _quoted_from_weibo(mblog: Dict) -> str:
    inner = _as_dict(mblog.get("retweeted_status"))
    user = _as_dict(inner.get("user"))
    return str(user.get("screen_name") or user.get("name") or "")


def _plain_text(html: str) -> str:
    if not isinstance(html, str):
        html = "" if html is None else str(html)
    text = re.sub(r"<br\s*/?>", "\n", html or "", flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return unescape(text).replace("\xa0", " ").strip()


def _normalize_cookie(cookie: str) -> str:
    cookie = (cookie or "").strip()
    if not cookie:
        return ""
    if "=" not in cookie and ";" not in cookie:
        return f"SUB={cookie}"
    return cookie


def _fetch_long_text(session: requests.Session, post_id: str, headers: Dict[str, str]) -> Optional[str]:
    if not post_id:
        return None
    try:
        resp = session.get(
            "https://m.weibo.cn/statuses/extend",
            headers={key: value for key, value in headers.items() if key.lower() != "cookie"},
            params={"id": post_id},
            timeout=20,
        )
        data = resp.json()
        if not isinstance(data, dict):
            return None
        text = _as_dict(data.get("data")).get("longTextContent") or ""
        return text or None
    except Exception:
        return None


def _collect_media(mblog: Dict) -> List[Dict]:
    items: List[Dict] = []
    seen = set()

    def add(kind: str, url: str, video_url: str = "") -> None:
        url = _upgrade_media_url("image" if kind != "video" else "video", url)
        video_url = (video_url or "").strip().replace("http://", "https://")
        if kind == "livephoto" and not url and video_url:
            kind = "video"
            url = _livephoto_play_url(video_url) or video_url
            video_url = ""
        if not url or url in seen:
            return
        seen.add(url)
        if video_url:
            seen.add(video_url)
            kind = "livephoto"
        items.append({"type": kind, "url": url, "video_url": video_url})

    pic_infos = _as_dict(mblog.get("pic_infos"))
    for pid in _as_list(mblog.get("pic_ids")):
        add(*_pic_as_media(pic_infos.get(pid)))

    for pic in _as_list(mblog.get("pics")):
        add(*_pic_as_media(pic))

    for raw in _as_list(_as_dict(mblog.get("mix_media_info")).get("items")):
        data = _as_dict(raw.get("data") if isinstance(raw, dict) else None)
        kind = raw.get("type") if isinstance(raw, dict) else None
        if kind == "pic":
            add(*_pic_as_media(data))
        elif kind == "video":
            media = _as_dict(data.get("media_info")) or data
            add("video", media.get("stream_url_hd") or media.get("stream_url") or "")

    page_info = _as_dict(mblog.get("page_info"))
    page_type = str(page_info.get("type") or page_info.get("object_type") or "")
    if "video" in page_type or page_info.get("media_info"):
        media = _as_dict(page_info.get("media_info"))
        urls = _as_dict(page_info.get("urls"))
        add(
            "video",
            media.get("stream_url_hd")
            or media.get("stream_url")
            or urls.get("mp4_720p_mp4")
            or urls.get("mp4_hd_mp4")
            or urls.get("mp4_ld_mp4")
            or "",
        )

    return items


def _pic_as_media(pic) -> Tuple[str, str, str]:
    if not isinstance(pic, dict):
        url = str(pic or "").strip()
        return ("image", url, "") if url else ("image", "", "")
    still = _pic_source_url(pic)
    pic_type = str(pic.get("type") or "").lower()
    live = (
        pic.get("videoSrc")
        or pic.get("video_src")
        or (pic.get("video") if pic_type == "livephoto" else "")
        or ""
    )
    live = str(live or "")
    if pic_type == "livephoto" or "livephoto" in live.lower():
        return "livephoto", still, live
    return "image", still, ""


def _is_livephoto_motion_url(raw: str) -> bool:
    raw = (raw or "").strip().replace("http://", "https://")
    if not raw:
        return False
    inner = _livephoto_inner_url(raw)
    if not inner:
        return False
    lowered = inner.lower()
    path = urlparse(inner).path.lower()
    return "livephoto" in lowered or path.endswith(".mov")


def _livephoto_inner_url(raw: str) -> str:
    raw = (raw or "").strip().replace("http://", "https://")
    if not raw:
        return ""
    live = (parse_qs(urlparse(raw).query).get("livephoto") or [""])[0]
    if live:
        return unquote(live).replace("http://", "https://")
    return raw


def _livephoto_play_url(raw: str) -> str:
    """Weibo live motion must be fetched via the play wrapper; the .mov CDN 403s."""
    inner = _livephoto_inner_url(raw)
    if not inner:
        return ""
    if _is_livephoto_motion_url(inner):
        return "https://video.weibo.com/media/play?livephoto=" + quote(inner, safe="")
    return inner


def _livephoto_video_url(raw: str) -> str:
    return _livephoto_play_url(raw)


def _pic_source_url(pic: Dict) -> str:
    if not isinstance(pic, dict):
        return str(pic or "").strip()
    for key in ("original", "largest", "large"):
        value = pic.get(key)
        if isinstance(value, dict) and value.get("url"):
            return str(value.get("url") or "")
        if isinstance(value, str) and value.startswith("http"):
            return value
    return str(pic.get("url") or "")


def _upgrade_media_url(kind: str, url: str) -> str:
    url = (url or "").strip().replace("http://", "https://")
    if not url:
        return ""
    if kind == "image":
        url = re.sub(
            r"/(thumb180|orj\d+|mw\d+|bmiddle|small|wap\d+)/",
            "/large/",
            url,
        )
    return url


def _image_url_candidates(url: str) -> List[str]:
    url = _upgrade_media_url("image", url)
    if not url:
        return []
    found: List[str] = []
    for size in ("large", "original", "mw2000"):
        candidate = re.sub(
            r"/(thumb180|orj\d+|mw\d+|bmiddle|small|wap\d+|large|original)/",
            f"/{size}/",
            url,
        )
        if candidate not in found:
            found.append(candidate)
    if url not in found:
        found.insert(0, url)
    extras: List[str] = []
    for candidate in found:
        for host in ("wx1", "wx2", "wx3", "wx4"):
            alt = re.sub(r"wx\d\.sinaimg\.cn", f"{host}.sinaimg.cn", candidate)
            if alt not in found and alt not in extras:
                extras.append(alt)
    return found + extras


def _headers_for_media(url: str, api_headers: Dict[str, str], *, include_cookie: bool = False) -> Dict[str, str]:
    ua = api_headers.get("User-Agent") or (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    )
    lowered = (url or "").lower()
    if (
        "sinaimg" in lowered
        or "livephoto" in lowered
        or "video.weibo.com" in lowered
        or re.search(r"\.(jpg|jpeg|png|gif|webp|mov)(\?|$)", lowered)
    ):
        headers = {
            "User-Agent": ua,
            "Referer": "https://weibo.com/",
            "Accept": "image/avif,image/webp,image/apng,image/*,video/*,*/*;q=0.8",
        }
        if include_cookie and api_headers.get("Cookie"):
            headers["Cookie"] = api_headers["Cookie"]
        return headers
    headers = {
        "User-Agent": ua,
        "Referer": "https://m.weibo.cn/",
        "Accept": "*/*",
    }
    if api_headers.get("Cookie"):
        headers["Cookie"] = api_headers["Cookie"]
    return headers


def _build_metadata(
    mblog: Dict,
    user_id: str,
    media_items: List[Dict],
    date_folder: str,
    template: str,
    post_kind: str = "original",
    pinned: bool = False,
) -> Dict:
    pics = []
    post_id = str(mblog.get("id") or "")
    for idx, item in enumerate(media_items, start=1):
        kind = item.get("type") or "image"
        ext = _get_ext(item["url"], "video" if kind == "video" else "image")
        filename = _format_filename(template, user_id, date_folder, idx, post_id, ext)
        entry = {
            "index": idx,
            "filename": filename,
            "date_folder": date_folder,
            "original_url": item["url"],
            "type": kind,
        }
        if item.get("video_url"):
            video_ext = _get_ext(item["video_url"], "video")
            entry["video_filename"] = _format_filename(
                template, user_id, date_folder, idx, post_id, video_ext,
            )
            entry["video_url"] = item["video_url"]
            entry["type"] = "livephoto"
        pics.append(entry)

    user = _as_dict(mblog.get("user"))
    text = mblog.get("text", "") or ""
    page_info = _as_dict(mblog.get("page_info"))
    page_type = str(page_info.get("type") or page_info.get("object_type") or "").lower()
    if page_info and "video" not in page_type:
        card_title = (page_info.get("page_title") or page_info.get("content1") or "").strip()
        if card_title and card_title not in text:
            text = f"{text}\n{card_title}" if text else card_title
    meta = {
        "id": post_id,
        "platform": "weibo",
        "user_id": user_id,
        "user_name": user.get("screen_name") or user.get("name") or user_id,
        "screen_name": user.get("screen_name") or user_id,
        "text": text,
        "created_at": mblog.get("created_at", ""),
        "date": date_folder,
        "url": f"https://weibo.com/{user_id}/{mblog.get('mblogid', post_id)}",
        "source": mblog.get("source", ""),
        "verified": bool(user.get("verified")),
        "original": post_kind != "quote",
        "kind": "media" if pics else "text",
        "reposts": _safe_int(mblog.get("reposts_count")),
        "comments": _safe_int(mblog.get("comments_count")),
        "likes": _safe_int(mblog.get("attitudes_count")),
        "pics": pics,
    }
    if pinned:
        meta["pinned"] = True
    if post_kind == "quote":
        meta["kind"] = "quote"
        meta["original"] = False
        meta["quoted_from_user"] = _quoted_from_weibo(mblog)
        inner = _as_dict(mblog.get("retweeted_status"))
        quoted_id = str(inner.get("id") or inner.get("mid") or "")
        if quoted_id:
            meta["quoted_from_id"] = quoted_id
    return meta


def _download_jobs(
    jobs: List[Tuple[str, str, Dict[str, str]]],
    workers: int,
) -> Iterator[Dict]:
    if workers <= 1:
        for url, filepath, headers in jobs:
            yield _download_one(url, filepath, headers)
        return

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [
            pool.submit(_download_one, url, filepath, headers)
            for url, filepath, headers in jobs
        ]
        for future in as_completed(futures):
            yield future.result()


def _download_one(url: str, filepath: str, headers: Dict[str, str]) -> Dict:
    filename = os.path.basename(filepath)
    is_image = filename.lower().endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")) or (
        "sinaimg" in url and "livephoto" not in url
    )
    candidates = _image_url_candidates(url) if is_image else _video_url_candidates(url)
    last_err = "下载失败"
    is_livephoto = not is_image and _is_livephoto_motion_url(url)
    header_modes = (False, True) if is_livephoto else (False,)
    for candidate in candidates[:8]:
        for include_cookie in header_modes:
            wrote = False
            try:
                resp = requests.get(
                    candidate,
                    headers=_headers_for_media(candidate, headers, include_cookie=include_cookie),
                    timeout=60,
                    stream=True,
                )
                if resp.status_code != 200:
                    last_err = f"HTTP {resp.status_code}"
                    continue
                content_type = (resp.headers.get("Content-Type") or "").lower()
                if "text/html" in content_type or "application/json" in content_type:
                    last_err = "接口返回了非媒体内容"
                    continue
                os.makedirs(os.path.dirname(filepath), exist_ok=True)
                with open(filepath, "wb") as handle:
                    for chunk in resp.iter_content(65536):
                        if not chunk:
                            continue
                        if not wrote and not _looks_like_media(chunk):
                            last_err = "接口返回了非媒体内容"
                            wrote = False
                            break
                        handle.write(chunk)
                        wrote = True
                if wrote and _media_file_ok(filepath):
                    return {"type": "downloaded", "file": filename}
                if wrote:
                    last_err = "空文件或损坏"
                _remove_if_invalid(filepath)
            except Exception as e:
                last_err = str(e)
                _remove_if_invalid(filepath)
    return {"type": "failed", "file": filename, "msg": last_err}


def _looks_like_media(head: bytes) -> bool:
    if not head:
        return False
    if head[:1] in (b"{", b"<", b"["):
        return False
    if head.startswith(b"#EXTM3U") or head.startswith(b"#EXT-X-"):
        return False
    if head.startswith(b"\xff\xd8\xff") or head.startswith(b"\x89PNG") or head.startswith(b"GIF8"):
        return True
    if head.startswith(b"RIFF") and b"WEBP" in head[:16]:
        return True
    return len(head) >= 12 and head[4:8] == b"ftyp"


def _remove_if_invalid(filepath: str) -> None:
    if filepath and os.path.exists(filepath) and not _media_file_ok(filepath):
        try:
            os.remove(filepath)
        except OSError:
            pass


def _media_file_ok(filepath: str) -> bool:
    if not filepath or not os.path.exists(filepath):
        return False
    try:
        size = os.path.getsize(filepath)
    except OSError:
        return False
    if size < 64:
        return False
    try:
        with open(filepath, "rb") as handle:
            head = handle.read(32)
    except OSError:
        return False
    return _looks_like_media(head)


def _video_url_candidates(url: str) -> List[str]:
    found: List[str] = []
    direct = (url or "").strip().replace("http://", "https://")
    inner = _livephoto_inner_url(url).replace("http://", "https://") if url else ""
    play = _livephoto_play_url(url)
    for candidate in (play, inner, direct):
        if candidate and candidate not in found:
            found.append(candidate)
    return found


def _format_filename(template: str, user_id: str, date: str, index: int, post_id: str, ext: str) -> str:
    name = (
        (template or "{post_id}_{index}")
        .replace("{user_id}", user_id)
        .replace("{date}", date)
        .replace("{index}", str(index))
        .replace("{post_id}", post_id)
    )
    name = re.sub(r'[<>:"/\\|?*]', "_", name).strip(" .")
    if not name:
        name = f"{post_id}_{index}"
    if not name.lower().endswith(ext.lower()):
        name += ext
    return name


def _format_date(created_at: str) -> str:
    dt = parse_weibo_created_at(created_at)
    if dt:
        return dt.strftime("%Y-%m-%d")
    return (created_at or "unknown").replace("/", "-").replace(":", "-")[:10]


def _get_ext(url: str, kind: str = "image") -> str:
    direct = _livephoto_inner_url(url) if kind == "video" else url
    lowered = (direct or "").lower().split("?", 1)[0]
    if kind == "video":
        if lowered.endswith(".m3u8"):
            return ".mp4"
        for ext in (".mov", ".mp4", ".webm"):
            if lowered.endswith(ext) or ext in lowered:
                return ext
        return ".mp4"
    for ext in (".png", ".gif", ".webp", ".jpeg", ".jpg"):
        if ext in lowered:
            return ".jpg" if ext == ".jpeg" else ext
    return ".jpg"
