import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape
from typing import Dict, Iterator, List, Optional, Tuple
from urllib.parse import parse_qs, quote, unquote, urlparse

import requests

from backend.daterange import order_days, parse_day, parse_weibo_created_at
from backend.metadata import download_avatar, save_post_metadata, save_profile

MAX_PAGES = 200
REQUEST_SLEEP = 1.2


def download_weibo_media(
    user_id: str,
    cookie: str,
    output_dir: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    concurrent: int = 3,
    naming_template: Optional[str] = None,
) -> Iterator[Dict]:
    """Download a Weibo user's timeline media via the m.weibo.cn API."""
    yield {"type": "status", "msg": f"准备缓存微博用户 {user_id} 的原创内容（文字 + 图片/视频）..."}
    start_dt, end_dt, swapped = order_days(parse_day(start_date), parse_day(end_date))
    if start_dt or end_dt:
        yield {
            "type": "status",
            "msg": f"日期范围: {start_dt or '不限'} ~ {end_dt or '不限'}（含首尾）",
        }
        if swapped:
            yield {"type": "status", "msg": "起始日晚于结束日，已按从早到晚对调。"}

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
        "Cookie": cookie,
        "Referer": f"https://m.weibo.cn/u/{user_id}",
        "X-Requested-With": "XMLHttpRequest",
        "MWeibo-Pwa": "1",
        "Accept": "application/json, text/plain, */*",
    }

    os.makedirs(os.path.join(output_dir, "weibo"), exist_ok=True)
    workers = max(1, min(int(concurrent or 3), 10))
    template = naming_template or "{post_id}_{index}"

    page = 1
    since_id = ""
    total_downloaded = 0
    total_skipped = 0
    total_posts = 0
    total_text = 0
    reached_start = False
    failed = False
    seen_ids = set()

    while page <= MAX_PAGES and not reached_start:
        params = {
            "type": "uid",
            "value": str(user_id),
            "containerid": f"107603{user_id}",
        }
        if since_id:
            params["since_id"] = since_id
        elif page > 1:
            params["page"] = page

        yield {"type": "status", "msg": f"正在获取微博第 {page} 页..."}

        try:
            resp = requests.get(
                "https://m.weibo.cn/api/container/getIndex",
                headers=headers,
                params=params,
                timeout=30,
            )
        except requests.exceptions.RequestException as e:
            yield {"type": "error", "msg": f"获取第 {page} 页失败: {e}"}
            failed = True
            break

        try:
            data = resp.json()
        except ValueError:
            snippet = (resp.text or "")[:500] or "(empty)"
            yield {
                "type": "error",
                "msg": (
                    f"微博接口返回了非 JSON 内容（状态码 {resp.status_code}）。\n"
                    f"内容预览: {snippet}\n"
                    "请检查 Cookie 是否有效（需含 SUB），以及用户 ID 是否正确。"
                ),
            }
            failed = True
            break

        if data.get("ok") != 1:
            msg = (data.get("msg") or data.get("message") or "").strip()
            hint = f"（{msg}）" if msg else ""
            yield {"type": "error", "msg": f"微博接口返回错误{hint}，请检查 Cookie 或用户 ID。"}
            failed = True
            break

        cards = _iter_mblog_cards((data.get("data") or {}).get("cards") or [])
        if not cards:
            yield {"type": "status", "msg": "没有更多内容了。"}
            break

        download_jobs: List[Tuple[str, str, Dict[str, str]]] = []
        last_mblog_id = ""
        new_on_page = 0

        for card in cards:
            mblog = card.get("mblog") or {}
            created_at = mblog.get("created_at", "unknown")
            post_id = str(mblog.get("id") or mblog.get("mid") or "")
            if post_id:
                last_mblog_id = post_id
                if post_id in seen_ids:
                    continue
                seen_ids.add(post_id)
                new_on_page += 1

            if not _is_original(mblog, user_id):
                continue

            post_dt = parse_weibo_created_at(created_at)
            post_day = post_dt.date() if post_dt else None
            pinned = _is_pinned(mblog)

            if end_dt and post_day and post_day > end_dt:
                continue
            if start_dt and post_day and post_day < start_dt:
                if not pinned:
                    reached_start = True
                continue

            if mblog.get("isLongText") or int(mblog.get("textLength") or 0) > 140:
                long_text = _fetch_long_text(post_id, headers)
                if long_text:
                    mblog["text"] = long_text

            user = mblog.get("user") or {}
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

            date_folder = _format_date(created_at)
            media_items = _collect_media(mblog)
            if not media_items and not _plain_text(mblog.get("text") or ""):
                continue

            metadata = _build_metadata(mblog, user_id, media_items, date_folder, template)
            save_post_metadata(os.path.join(output_dir, "weibo"), user_id, metadata)
            total_posts += 1
            if not media_items:
                total_text += 1
                continue

            save_dir = os.path.join(output_dir, "weibo", user_id, date_folder)
            os.makedirs(save_dir, exist_ok=True)

            for item in metadata["pics"]:
                filepath = os.path.join(save_dir, item["filename"])
                if _media_file_ok(filepath):
                    total_skipped += 1
                    yield {"type": "status", "msg": f"已存在，跳过: {item['filename']}"}
                else:
                    download_jobs.append((item["original_url"], filepath, headers))
                video_name = item.get("video_filename") or ""
                video_url = item.get("video_url") or ""
                if video_name and video_url:
                    video_path = os.path.join(save_dir, video_name)
                    if _media_file_ok(video_path):
                        total_skipped += 1
                        yield {"type": "status", "msg": f"已存在，跳过: {video_name}"}
                    else:
                        download_jobs.append((video_url, video_path, headers))

        if download_jobs:
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

        if new_on_page == 0:
            yield {"type": "status", "msg": "没有更多内容了。"}
            break

        next_since = _next_since_id(data, last_mblog_id)
        if not next_since or next_since == since_id:
            yield {"type": "status", "msg": "没有更多内容了。"}
            break

        since_id = next_since
        page += 1
        yield {
            "type": "status",
            "msg": f"已缓存 {total_posts} 条原创（文字 {total_text}，含媒体 {total_posts - total_text}）",
        }
        time.sleep(REQUEST_SLEEP)

    if failed:
        return

    yield {
        "type": "status",
        "msg": f"完成：共缓存 {total_posts} 条原创微博（文字 {total_text}，媒体文件 {total_downloaded}）",
    }
    yield {
        "type": "done",
        "count": total_downloaded,
        "skipped": total_skipped,
        "posts": total_posts,
        "output_dir": os.path.join(output_dir, "weibo", user_id),
    }


def _iter_mblog_cards(cards: List[Dict]) -> List[Dict]:
    found: List[Dict] = []
    for card in cards or []:
        if card.get("mblog") and str(card.get("card_type") or "") == "9":
            found.append(card)
        for nested in card.get("card_group") or []:
            if nested.get("mblog") and str(nested.get("card_type") or "") == "9":
                found.append(nested)
    return found


def _next_since_id(payload: Dict, last_mblog_id: str) -> str:
    info = ((payload.get("data") or {}).get("cardlistInfo") or {})
    raw = info.get("since_id") or info.get("max_id") or last_mblog_id
    if raw in (None, "", 0, "0"):
        raw = last_mblog_id
    text = str(raw or "").strip()
    return "" if text in {"", "0", "None"} else text


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
        (mblog.get("user") or {}).get("id")
        or (mblog.get("user") or {}).get("idstr")
        or ""
    )
    return not owner or owner == str(user_id)


def _plain_text(html: str) -> str:
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


def _fetch_long_text(post_id: str, headers: Dict[str, str]) -> Optional[str]:
    if not post_id:
        return None
    try:
        resp = requests.get(
            "https://m.weibo.cn/statuses/extend",
            headers=headers,
            params={"id": post_id},
            timeout=20,
        )
        data = resp.json()
        text = (data.get("data") or {}).get("longTextContent") or ""
        return text or None
    except Exception:
        return None


def _collect_media(mblog: Dict) -> List[Dict]:
    items: List[Dict] = []
    seen = set()

    def add(kind: str, url: str, video_url: str = "") -> None:
        url = _upgrade_media_url("image" if kind != "video" else "video", url)
        video_url = _livephoto_play_url(video_url)
        if kind == "livephoto" and not url and video_url:
            kind = "video"
            url = video_url
            video_url = ""
        if not url or url in seen:
            return
        seen.add(url)
        if video_url:
            seen.add(video_url)
            kind = "livephoto"
        items.append({"type": kind, "url": url, "video_url": video_url})

    pic_infos = mblog.get("pic_infos") or {}
    for pid in mblog.get("pic_ids") or []:
        info = pic_infos.get(pid) or {}
        add(*_pic_as_media(info))

    for pic in mblog.get("pics") or []:
        add(*_pic_as_media(pic))

    for raw in (mblog.get("mix_media_info") or {}).get("items") or []:
        data = raw.get("data") or {}
        kind = raw.get("type")
        if kind == "pic":
            add(*_pic_as_media(data))
        elif kind == "video":
            media = data.get("media_info") or data
            add("video", media.get("stream_url_hd") or media.get("stream_url") or "")

    page_info = mblog.get("page_info") or {}
    page_type = str(page_info.get("type") or page_info.get("object_type") or "")
    if "video" in page_type or page_info.get("media_info"):
        media = page_info.get("media_info") or {}
        urls = page_info.get("urls") or {}
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


def _pic_as_media(pic: Dict) -> Tuple[str, str, str]:
    still = _pic_source_url(pic)
    pic_type = str((pic or {}).get("type") or "").lower()
    live = (
        (pic or {}).get("videoSrc")
        or (pic or {}).get("video_src")
        or ((pic or {}).get("video") if pic_type == "livephoto" else "")
        or ""
    )
    live = str(live or "")
    if pic_type == "livephoto" or "livephoto" in live.lower():
        return "livephoto", still, live
    return "image", still, ""


def _livephoto_inner_url(raw: str) -> str:
    raw = (raw or "").strip().replace("http://", "https://")
    if not raw:
        return ""
    live = (parse_qs(urlparse(raw).query).get("livephoto") or [""])[0]
    if live:
        return unquote(live).replace("http://", "https://").split("?", 1)[0]
    return raw.split("?", 1)[0]


def _livephoto_play_url(raw: str) -> str:
    """Weibo live motion must be fetched via the play wrapper; the .mov CDN 403s."""
    inner = _livephoto_inner_url(raw)
    if not inner:
        return ""
    lowered = inner.lower()
    if "livephoto" in lowered or lowered.endswith(".mov"):
        return "https://video.weibo.com/media/play?livephoto=" + quote(inner, safe="")
    return (raw or "").strip().replace("http://", "https://")


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


def _headers_for_media(url: str, api_headers: Dict[str, str]) -> Dict[str, str]:
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
        return {
            "User-Agent": ua,
            "Referer": "https://weibo.com/",
            "Accept": "image/avif,image/webp,image/apng,image/*,video/*,*/*;q=0.8",
        }
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

    user = mblog.get("user") or {}
    text = mblog.get("text", "") or ""
    page_info = mblog.get("page_info") or {}
    page_type = str(page_info.get("type") or page_info.get("object_type") or "").lower()
    if page_info and "video" not in page_type:
        card_title = (page_info.get("page_title") or page_info.get("content1") or "").strip()
        if card_title and card_title not in text:
            text = f"{text}\n{card_title}" if text else card_title
    return {
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
        "original": True,
        "kind": "media" if pics else "text",
        "reposts": int(mblog.get("reposts_count") or 0),
        "comments": int(mblog.get("comments_count") or 0),
        "likes": int(mblog.get("attitudes_count") or 0),
        "pics": pics,
    }


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
    for candidate in candidates[:8]:
        wrote = False
        try:
            resp = requests.get(
                candidate,
                headers=_headers_for_media(candidate, headers),
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
    play = _livephoto_play_url(url)
    for candidate in (play, (url or "").replace("http://", "https://")):
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
