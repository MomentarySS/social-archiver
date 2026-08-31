import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime
from typing import Any, Dict, Iterator, List, Optional

from backend.gallery_dl_runner import (
    MEDIA_EXTS,
    GalleryDlStats,
    apply_date_range,
    build_gallery_dl_config,
    date_range_status,
    ensure_gallery_dl,
    gallery_dl_cmd,
    iter_gallery_dl_download,
    looks_like_path,
    remove_gallery_dl_config,
    write_gallery_dl_config,
)
from backend.metadata import existing_avatar, save_post_metadata, save_profile

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv"}
INSTAGRAM_RATE_LIMIT_MSG = "Instagram 请求过于频繁，已被限流。请稍后再试。"


def download_instagram_media(
    user_id: str,
    cookie: str,
    output_dir: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    concurrent: int = 3,
    naming_template: Optional[str] = None,
    include_reels: bool = False,
    include_stories: bool = False,
) -> Iterator[Dict]:
    """Download Instagram posts via gallery-dl, then normalize metadata for browsing."""
    del naming_template, concurrent
    scope_parts = ["帖文"]
    if include_reels:
        scope_parts.append("Reels")
    if include_stories:
        scope_parts.append("Stories")
    yield {
        "type": "status",
        "msg": f"准备缓存 Instagram 用户 {user_id} 的原创内容（{' + '.join(scope_parts)}）...",
    }
    if include_stories:
        yield {
            "type": "status",
            "msg": "Stories 为时效内容，平台约 24 小时后可能失效；请尽快缓存。",
        }

    account = (user_id or "").strip().lstrip("@")
    if not account or re.search(r"\s", account):
        yield {
            "type": "error",
            "msg": (
                f"Instagram 用户名不能含空格：{account!r}。"
                "请使用下划线，例如 taeyeon_ss。"
            ),
        }
        return

    err = ensure_gallery_dl()
    if err:
        yield {"type": "error", "msg": err}
        return

    sessionid = _parse_sessionid(cookie)
    if not sessionid:
        yield {
            "type": "error",
            "msg": (
                "Instagram 需要 sessionid Cookie。请打开 instagram.com 后：\n"
                "1）点「应用内登录 Instagram」，自动填入 sessionid；\n"
                "2）或 F12 → 应用 → Cookie → instagram.com，复制 sessionid 的值。"
            ),
        }
        return

    user_dir = os.path.join(output_dir, "instagram", account)
    os.makedirs(user_dir, exist_ok=True)

    instagram_cfg: Dict = {
        "filename": "{sidecar_media_id:?/_/}{media_id}.{extension}",
        "directory": ["instagram", account, "{date:%Y-%m-%d}"],
        "size": "orig",
        "videos": True,
        "sleep-request": "12.0-24.0",
        "cookies": {"sessionid": sessionid},
        "archive": os.path.join(user_dir, ".download-archive.sqlite"),
    }
    include = ["posts"]
    if include_reels:
        include.append("reels")
    if include_stories:
        include.append("stories")
    instagram_cfg["include"] = ",".join(include)

    if start_date or end_date:
        swapped = apply_date_range(instagram_cfg, start_date, end_date)
        if swapped:
            yield {"type": "status", "msg": swapped}

    postprocessors = [
        {
            "name": "metadata",
            "mode": "json",
            "event": "post",
            "filename": "{post_id}.json",
        }
    ]
    config = build_gallery_dl_config(output_dir, "instagram", instagram_cfg, 1, postprocessors)
    config_path = write_gallery_dl_config(config)

    url = (
        f"https://www.instagram.com/id:{account}/"
        if account.isdigit()
        else f"https://www.instagram.com/{account}/"
    )
    cmd = gallery_dl_cmd("-c", config_path)
    cmd.append(url)
    yield {"type": "status", "msg": f"启动 gallery-dl 处理 {url}"}
    range_msg = date_range_status(start_date, end_date)
    if range_msg:
        yield {"type": "status", "msg": range_msg}

    stats = GalleryDlStats()
    dl_state = {"rate_limited": False}

    def map_gallery_dl_line(line: str) -> Optional[str]:
        return _map_gallery_dl_line(line, dl_state)

    try:
        yield from iter_gallery_dl_download(
            cmd,
            stats,
            map_gallery_dl_line,
            "gallery-dl 失败。Instagram 需要有效的 sessionid Cookie。",
        )
    except Exception as e:
        yield {"type": "error", "msg": str(e)}
        return
    finally:
        remove_gallery_dl_config(config_path)

    if stats.fatal_msg and stats.total > 0:
        yield {
            "type": "status",
            "msg": (
                f"下载过程中出现警告：{stats.fatal_msg}"
                f"（已下载 {stats.total} 个文件，将继续整理。）"
            ),
        }
        stats.fatal_msg = None

    if not stats.fatal_msg and stats.total == 0 and dl_state["rate_limited"]:
        stats.fatal_msg = INSTAGRAM_RATE_LIMIT_MSG
        yield {"type": "error", "msg": INSTAGRAM_RATE_LIMIT_MSG}

    if stats.fatal_msg:
        return

    yield from _fetch_instagram_avatar(os.path.join(output_dir, "instagram"), account, account, sessionid)

    written = _normalize_instagram_archive(os.path.join(output_dir, "instagram"), account)
    save_profile(os.path.join(output_dir, "instagram"), account, {
        "includeReels": bool(include_reels),
        "includeStories": bool(include_stories),
    })
    avatar = existing_avatar(user_dir)
    if avatar:
        yield {"type": "status", "msg": f"已缓存 {written} 条原创帖子，并保存了头像。"}
    else:
        yield {"type": "status", "msg": f"已缓存 {written} 条原创帖子，可在浏览页查看。未找到头像。"}
    yield {
        "type": "done",
        "count": stats.total,
        "skipped": stats.skipped,
        "posts": written,
        "output_dir": os.path.join(output_dir, "instagram", account),
    }


def _fetch_instagram_avatar(
    output_dir: str,
    user_id: str,
    account: str,
    sessionid: str,
) -> Iterator[Dict]:
    user_dir = os.path.join(output_dir, user_id)
    if existing_avatar(user_dir):
        return

    instagram_cfg: Dict = {
        "filename": "_avatar.{extension}",
        "directory": [user_id],
        "sleep-request": "0.5-1.0",
        "cookies": {"sessionid": sessionid},
    }
    config = {
        "extractor": {
            "base-directory": output_dir,
            "instagram": instagram_cfg,
        },
        "downloader": {
            "retries": 1,
            "timeout": 15.0,
            "threads": 1,
        },
        "output": {
            "skip": True,
        },
    }
    fd, config_path = tempfile.mkstemp(prefix="social-archiver-gdl-avatar-", suffix=".json")
    os.close(fd)
    with open(config_path, "w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2)

    photo_url = (
        f"https://www.instagram.com/id:{account}/"
        if account.isdigit()
        else f"https://www.instagram.com/{account}/"
    )
    cmd = gallery_dl_cmd("-c", config_path)
    cmd.append(photo_url)
    yield {"type": "status", "msg": "正在保存头像…"}
    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=45,
        )
        output = (completed.stdout or "") + (completed.stderr or "")
        got = False
        for line in output.splitlines():
            line = line.strip()
            if not line:
                continue
            if looks_like_path(line):
                got = True
                yield {"type": "status", "msg": f"已下载头像: {os.path.basename(line.replace(chr(92), '/'))}"}
            elif "error" in line.lower() or "unable" in line.lower():
                yield {"type": "status", "msg": line}
        if not got and not existing_avatar(user_dir):
            yield {"type": "status", "msg": "头像未保存，浏览页会先显示首字母。"}
    except subprocess.TimeoutExpired:
        yield {"type": "status", "msg": "头像下载超时，浏览页会先显示首字母。可稍后点更新再试。"}
    except Exception as e:
        yield {"type": "status", "msg": f"头像下载失败: {e}"}
    finally:
        try:
            os.remove(config_path)
        except OSError:
            pass


def _parse_sessionid(cookie: str) -> str:
    cookie = (cookie or "").strip()
    if not cookie:
        return ""
    if "sessionid" in cookie:
        match = re.search(r"sessionid=([^;]+)", cookie)
        if match:
            return match.group(1).strip()
    if "=" not in cookie and ";" not in cookie:
        return cookie
    return ""


def _is_instagram_rate_limit(line: str) -> bool:
    lowered = line.lower()
    return (
        "429" in lowered
        or "too many requests" in lowered
        or "rate limit" in lowered
        or "rate-limit" in lowered
    )


def _map_gallery_dl_line(line: str, state: Dict[str, bool]) -> Optional[str]:
    if _is_instagram_rate_limit(line):
        state["rate_limited"] = True
        return None
    return _map_gallery_dl_error(line)


def _map_gallery_dl_error(line: str) -> Optional[str]:
    lowered = line.lower()
    if "authrequired" in lowered or "authenticated cookies needed" in lowered:
        return (
            "Instagram 拒绝了这次访问。sessionid 可能已过期或无效。\n"
            "请重新登录 Instagram，或粘贴新的 sessionid。"
        )
    if "login rejected" in lowered:
        return "Instagram 把这次登录判定为异常。请重新登录并获取新的 sessionid。"
    if "redirect to home" in lowered or "redirect to login" in lowered:
        return (
            "Instagram 拒绝了这次访问（sessionid 可能已过期、无效，或被临时限流）。\n"
            "请先在浏览器登录 instagram.com 完成验证，再重新获取 sessionid。"
        )
    if "private" in lowered:
        return "该账号为私密账号，且登录用户未关注它。无法缓存私密账号的内容。"
    if "requested" in lowered and "could not be found" in lowered:
        if "user" in lowered:
            return "Instagram 找不到该用户。请检查用户名是否正确。"
        # Reels / Stories / 单帖等资源缺失不应中断整次缓存
        return None
    if any(
        marker in lowered
        for marker in (
            "requested user could not be found",
            "unknown user",
            "user does not exist",
        )
    ):
        return "Instagram 找不到该用户。请检查用户名是否正确。"
    if "challenge" in lowered or "checkpoint" in lowered:
        return "Instagram 要求额外验证（Challenge/Checkpoint）。请在浏览器中完成验证后重试。"
    if "empty" in lowered or "no items" in lowered or "no posts" in lowered:
        return "该账号没有可下载的内容。"
    if "could not find" in lowered and "cookies" in lowered:
        return "无法读取 Instagram Cookie。请使用应用内登录，或手动粘贴 sessionid。"
    if "failed to decrypt" in lowered or "aes-gcm" in lowered or "app-bound" in lowered:
        return (
            "浏览器新版本加密了 Cookie，外部程序读不出来。\n"
            "请点「应用内登录 Instagram」，或手动粘贴 sessionid。"
        )
    return None


_FLAT_SIDECAR_MEDIA_RE = re.compile(r"^(\d+)_(\d+)$")


def _parse_flat_sidecar_media(stem: str) -> Optional[tuple]:
    """Parse gallery-dl flat carousel filenames like {sidecar}_{slide}."""
    match = _FLAT_SIDECAR_MEDIA_RE.match(stem)
    if not match:
        return None
    return match.group(1), match.group(2)


def _instagram_media_keys(name: str, sidecar_folder: str) -> tuple:
    """Return (post_key, media_id, rel_filename) for a media file in a date folder."""
    media_stem = os.path.splitext(name)[0]
    if sidecar_folder:
        return sidecar_folder, media_stem, f"{sidecar_folder}/{name}"
    flat = _parse_flat_sidecar_media(media_stem)
    if flat:
        sidecar_id, slide_id = flat
        return sidecar_id, slide_id, name
    return media_stem, media_stem, name


def _cleanup_stale_instagram_posts(user_dir: str, saved_ids_by_date: Dict[str, set]) -> None:
    """Remove per-slide _posts JSON left over from older normalization runs."""
    posts_root = os.path.join(user_dir, "_posts")
    if not os.path.isdir(posts_root):
        return
    for date_name in os.listdir(posts_root):
        date_posts_dir = os.path.join(posts_root, date_name)
        if not os.path.isdir(date_posts_dir):
            continue
        keep = saved_ids_by_date.get(date_name, set())
        for name in os.listdir(date_posts_dir):
            if not name.endswith(".json"):
                continue
            post_id = os.path.splitext(name)[0]
            if post_id in keep:
                continue
            flat = _parse_flat_sidecar_media(post_id)
            if flat and flat[0] in keep:
                try:
                    os.remove(os.path.join(date_posts_dir, name))
                except OSError:
                    pass


def _normalize_instagram_archive(output_dir: str, user_id: str) -> int:
    user_dir = os.path.join(output_dir, user_id)
    if not os.path.isdir(user_dir):
        return 0

    posts: Dict[str, Dict[str, Any]] = {}
    json_by_id: Dict[str, Dict[str, Any]] = {}
    media_by_post: Dict[str, List[Dict[str, Any]]] = {}

    for root, _dirs, files in os.walk(user_dir):
        rel_root = os.path.relpath(root, user_dir)
        if rel_root.split(os.sep)[0] == "_posts":
            continue
        parts = [] if rel_root == "." else rel_root.split(os.sep)
        date_folder = parts[0] if parts and re.fullmatch(r"\d{4}-\d{2}-\d{2}", parts[0]) else ""
        sidecar_folder = parts[1] if len(parts) > 1 and date_folder else ""

        for name in files:
            if name.startswith("_") or name.startswith("."):
                continue
            path = os.path.join(root, name)
            if name.endswith(".json"):
                payload = _read_json(path)
                post_id = _instagram_archive_post_id(payload) or os.path.splitext(name)[0]
                if post_id:
                    json_by_id[str(post_id)] = payload
                continue

            ext = os.path.splitext(name)[1].lower()
            if ext not in MEDIA_EXTS or not _media_file_ok(path):
                continue
            if not date_folder:
                continue

            post_key, media_id, rel_filename = _instagram_media_keys(name, sidecar_folder)
            kind = "video" if ext in VIDEO_EXTS else "image"
            media_by_post.setdefault(str(post_key), []).append({
                "media_id": media_id,
                "filename": rel_filename.replace("\\", "/"),
                "date_folder": date_folder,
                "type": kind,
                "original_url": "",
            })

    profile_saved = False
    for post_id, payload in json_by_id.items():
        archive_id = _instagram_archive_post_id(payload) or post_id
        post = posts.setdefault(str(archive_id), _empty_instagram_post(
            archive_id, user_id, payload,
        ))
        _apply_instagram_payload(post, payload, user_id)
        if not profile_saved:
            save_profile(output_dir, user_id, {
                "platform": "instagram",
                "user_id": user_id,
                "name": post.get("user_name") or user_id,
                "screen_name": post.get("screen_name") or user_id,
            })
            profile_saved = True

    for post_id, items in media_by_post.items():
        post = posts.setdefault(str(post_id), _empty_instagram_post(post_id, user_id))
        payload = json_by_id.get(str(post_id), {})
        if payload:
            _apply_instagram_payload(post, payload, user_id)
        for item in items:
            if not any(pic.get("filename") == item["filename"] for pic in post["pics"]):
                post["pics"].append(dict(item))
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(post.get("date") or "")):
            post["date"] = items[0]["date_folder"]
            post["created_at"] = items[0]["date_folder"]

    for post_id, payload in json_by_id.items():
        archive_id = _instagram_archive_post_id(payload) or post_id
        post = posts.setdefault(str(archive_id), _empty_instagram_post(archive_id, user_id, payload))
        _apply_instagram_payload(post, payload, user_id)
        post["_user_dir"] = user_dir
        _merge_instagram_files_from_payload(post, payload)

    if not profile_saved:
        save_profile(output_dir, user_id, {
            "platform": "instagram",
            "user_id": user_id,
            "name": user_id,
            "screen_name": user_id,
        })

    avatar = existing_avatar(user_dir)
    if avatar:
        save_profile(output_dir, user_id, {"avatar": os.path.basename(avatar)})

    saved = 0
    saved_ids_by_date: Dict[str, set] = {}
    for post in posts.values():
        _finalize_instagram_post(post)
        if post.get("pics") or post.get("text"):
            save_post_metadata(output_dir, user_id, post)
            date_key = str(post.get("date") or "unknown")
            saved_ids_by_date.setdefault(date_key, set()).add(str(post.get("id") or ""))
            saved += 1
    _cleanup_stale_instagram_posts(user_dir, saved_ids_by_date)
    return saved


def _empty_instagram_post(
    post_id: str,
    user_id: str,
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload = payload or {}
    shortcode = payload.get("post_shortcode") or payload.get("shortcode") or ""
    return {
        "id": str(post_id),
        "platform": "instagram",
        "user_id": user_id,
        "user_name": payload.get("fullname") or payload.get("owner") or user_id,
        "screen_name": payload.get("username") or user_id,
        "text": "",
        "created_at": "",
        "date": "unknown",
        "url": payload.get("post_url") or (
            f"https://www.instagram.com/p/{shortcode}/" if shortcode
            else f"https://www.instagram.com/p/{post_id}/"
        ),
        "original": True,
        "pics": [],
    }


def _apply_instagram_payload(post: Dict[str, Any], payload: Dict[str, Any], user_id: str) -> None:
    text = payload.get("description") or payload.get("caption") or ""
    if isinstance(text, dict):
        text = text.get("text") or text.get("content") or ""
    if text:
        post["text"] = str(text)

    date_value = payload.get("date") or payload.get("post_date") or payload.get("taken_at") or ""
    formatted = _format_instagram_date(date_value)
    if formatted and formatted != "unknown":
        post["created_at"] = str(date_value) if date_value else formatted
        post["date"] = formatted
        for pic in post["pics"]:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(pic.get("date_folder") or "")):
                pic["date_folder"] = formatted

    shortcode = payload.get("post_shortcode") or payload.get("shortcode")
    if shortcode:
        post["post_shortcode"] = str(shortcode)
        post["url"] = payload.get("post_url") or f"https://www.instagram.com/p/{shortcode}/"
    elif payload.get("post_url"):
        post["url"] = payload["post_url"]

    for src, dest in (("likes", "likes"), ("like_count", "likes")):
        if payload.get(src) is not None:
            try:
                post[dest] = int(payload[src])
            except (TypeError, ValueError):
                pass

    handle = payload.get("username") or user_id
    name = payload.get("fullname") or handle
    post["screen_name"] = str(handle)
    post["user_name"] = str(name)

    ig_type = payload.get("type")
    if ig_type == "story":
        post["kind"] = "story"
    elif ig_type == "reel":
        post["kind"] = "reel"
    elif payload.get("count") and int(payload["count"]) > 1:
        post["kind"] = "carousel"
        post["carousel_count"] = int(payload["count"])


def _merge_instagram_files_from_payload(post: Dict[str, Any], payload: Dict[str, Any]) -> None:
    files = payload.get("_files")
    if not isinstance(files, list):
        return
    date_folder = post.get("date") if re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(post.get("date") or "")) else "unknown"
    sidecar_id = str(payload.get("sidecar_media_id") or post.get("id") or "")
    for file_info in files:
        if not isinstance(file_info, dict):
            continue
        num = int(file_info.get("num") or 0) or (len(post["pics"]) + 1)
        media_id = str(file_info.get("media_id") or "")
        filename = _resolve_instagram_filename(post, date_folder, media_id, sidecar_id)
        if not filename:
            continue
        ext = os.path.splitext(filename)[1].lower()
        kind = "video" if ext in VIDEO_EXTS or file_info.get("video_url") else "image"
        entry = {
            "index": num,
            "filename": filename,
            "date_folder": date_folder,
            "media_id": media_id,
            "original_url": file_info.get("display_url") or file_info.get("video_url") or "",
            "type": kind,
        }
        if not any(pic.get("filename") == filename for pic in post["pics"]):
            post["pics"].append(entry)


def _resolve_instagram_filename(
    post: Dict[str, Any],
    date_folder: str,
    media_id: str,
    sidecar_id: str,
) -> str:
    if not media_id:
        return ""
    for pic in post.get("pics") or []:
        if pic.get("media_id") == media_id and pic.get("filename"):
            return pic["filename"]
    user_dir_hint = post.get("_user_dir")
    if user_dir_hint and date_folder != "unknown":
        candidate_names = [f"{sidecar_id}/{media_id}", media_id]
        if sidecar_id and sidecar_id != media_id:
            candidate_names.insert(0, f"{sidecar_id}_{media_id}")
        for name in candidate_names:
            for ext in MEDIA_EXTS:
                candidate = os.path.join(user_dir_hint, date_folder, f"{name}{ext}")
                if os.path.isfile(candidate) and _media_file_ok(candidate):
                    if "/" in name:
                        rel = f"{sidecar_id}/{media_id}{ext}"
                    elif name.startswith(f"{sidecar_id}_"):
                        rel = f"{name}{ext}"
                    else:
                        rel = f"{media_id}{ext}"
                    return rel.replace("\\", "/")
    if sidecar_id and sidecar_id != media_id:
        return f"{sidecar_id}/{media_id}.jpg"
    return f"{media_id}.jpg"


def _finalize_instagram_post(post: Dict[str, Any]) -> None:
    post.pop("_user_dir", None)
    pics = post.get("pics") or []
    if not pics:
        if post.get("text"):
            post["kind"] = post.get("kind") or "text"
        return

    pics.sort(key=lambda item: (
        int(item.get("index") or item.get("carousel_index") or 0),
        str(item.get("media_id") or item.get("filename") or ""),
    ))
    total = len(pics)
    if post.get("carousel_count"):
        try:
            total = max(total, int(post["carousel_count"]))
        except (TypeError, ValueError):
            pass
    for index, pic in enumerate(pics, start=1):
        pic["index"] = index
        pic["carousel_index"] = index
        pic["carousel_total"] = total
        if pic.get("media_id"):
            pic["media_id"] = str(pic["media_id"])

    post["carousel_count"] = total
    if total > 1:
        post["kind"] = "carousel"
    elif post.get("kind") not in ("reel",):
        post["kind"] = "media" if pics else "text"
    post["original"] = True


def _media_file_ok(filepath: str) -> bool:
    if not filepath or not os.path.exists(filepath):
        return False
    try:
        size = os.path.getsize(filepath)
        if size < 64:
            return False
        with open(filepath, "rb") as handle:
            head = handle.read(32)
    except OSError:
        return False
    if not head or head[:1] in (b"{", b"<", b"[") or head.startswith(b"#EXTM3U"):
        return False
    if head.startswith((b"\xff\xd8\xff", b"\x89PNG", b"GIF8")):
        return True
    if head.startswith(b"RIFF") and b"WEBP" in head[:16]:
        return True
    return len(head) >= 12 and head[4:8] == b"ftyp"


def _read_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle) or {}


def _instagram_archive_post_id(payload: Dict[str, Any]) -> Optional[str]:
    sidecar = payload.get("sidecar_media_id")
    if sidecar:
        return str(sidecar)
    for key in ("post_id", "media_id", "id", "pk"):
        value = payload.get(key)
        if value:
            return str(value)
    return None


def _format_instagram_date(value: Any) -> str:
    if value is None:
        return "unknown"
    text = str(value).strip()
    if not text:
        return "unknown"
    try:
        timestamp = float(text)
        if timestamp > 1e12:
            timestamp = timestamp / 1000
        dt = datetime.fromtimestamp(timestamp)
        return dt.strftime("%Y-%m-%d")
    except (TypeError, ValueError):
        pass
    try:
        dt = datetime.strptime(text[:10], "%Y-%m-%d")
        return dt.strftime("%Y-%m-%d")
    except (TypeError, ValueError):
        return "unknown"
