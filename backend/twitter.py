import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from typing import Dict, Iterator, List, Optional

from backend.daterange import (
    day_end_exclusive_utc,
    day_start_utc,
    order_days,
    parse_day,
)
from backend.gallery_dl_runner import (
    MEDIA_EXTS,
    GalleryDlStats,
    apply_date_range,
    apply_gallery_dl_downloader_antirate,
    apply_twitter_extractor_antirate,
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

BOOKMARK_SUFFIX = "--bookmarks"
LIKE_SUFFIX = "--likes"
SESSION_COOKIE_NAME = ".session-cookies.txt"
COOKIE_HEADER_KEYS = ("auth_token", "ct0", "kdt", "twid", "auth_multi")


def _split_twitter_user_id(user_id: str):
    raw = (user_id or "").strip().lstrip("@")
    if raw.endswith(BOOKMARK_SUFFIX):
        return raw[: -len(BOOKMARK_SUFFIX)], "bookmarks", f"{raw[: -len(BOOKMARK_SUFFIX)]}{BOOKMARK_SUFFIX}"
    if raw.endswith(LIKE_SUFFIX):
        return raw[: -len(LIKE_SUFFIX)], "likes", f"{raw[: -len(LIKE_SUFFIX)]}{LIKE_SUFFIX}"
    return raw, "original", raw


def download_twitter_media(
    user_id: str,
    cookie: str,
    output_dir: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    concurrent: int = 3,
    naming_template: Optional[str] = None,
    include_replies: bool = False,
    replies_media_only: bool = False,
    include_quotes: bool = False,
    include_bookmarks: bool = False,
    include_likes: bool = False,
) -> Iterator[Dict]:
    """Download Twitter/X media using gallery-dl, then normalize metadata for browsing."""
    del naming_template  # gallery-dl filename template is fixed for browse compatibility
    base_user_id, archive_mode, storage_user_id = _split_twitter_user_id(user_id)
    account = base_user_id
    if archive_mode == "bookmarks":
        include_bookmarks = False
        include_likes = False
        include_replies = False
        include_quotes = False
        yield {"type": "status", "msg": f"准备缓存 X 书签（登录账号）到 {storage_user_id}…"}
    elif archive_mode == "likes":
        include_bookmarks = False
        include_likes = False
        include_replies = False
        include_quotes = False
        yield {"type": "status", "msg": f"准备缓存 X 用户 {account} 的点赞时间线…"}
    elif include_replies:
        yield {
            "type": "status",
            "msg": (
                f"准备缓存推特用户 {account} 的原创内容 + 回复时间线"
                + ("（仅带媒体）" if replies_media_only else "")
                + (" + 引用帖" if include_quotes else "")
                + (" + 书签" if include_bookmarks else "")
                + (" + 点赞" if include_likes else "")
                + "…"
            ),
        }
    elif include_quotes or include_bookmarks or include_likes:
        extras = []
        if include_quotes:
            extras.append("引用帖")
        if include_bookmarks:
            extras.append("书签")
        if include_likes:
            extras.append("点赞")
        yield {
            "type": "status",
            "msg": f"准备缓存推特用户 {account} 的原创内容 + {' + '.join(extras)}…",
        }
    else:
        yield {"type": "status", "msg": f"准备缓存推特用户 {account} 的原创内容（文字 + 图片/视频）..."}

    err = ensure_gallery_dl()
    if err:
        yield {"type": "error", "msg": err}
        return

    parsed = _parse_twitter_auth(cookie)
    if parsed["mode"] == "missing":
        yield {
            "type": "error",
            "msg": (
                "X 必须登录。请打开 x.com 后任选一种方式：\n"
                "1）点「应用内登录 X」，自动填入 auth_token 和 ct0；\n"
                "2）F12 → 应用 → Cookie → x.com，把 auth_token 和 ct0 分别粘贴到对应栏。"
            ),
        }
        return

    user_dir = os.path.join(output_dir, "twitter", storage_user_id)
    os.makedirs(user_dir, exist_ok=True)

    twitter_cfg: Dict = {
        "filename": "{tweet_id}_{num}.{extension}",
        "directory": ["twitter", storage_user_id, "{date:%Y-%m-%d}"],
        "size": "orig",
        "videos": True,
        "previews": False,
        "cards": False,
        "articles": False,
        "retweets": False,
        "quoted": bool(include_quotes),
        "replies": bool(include_replies),
        "text-tweets": True,
        "pinned": True,
        "image-filter": "extension != 'm3u8'",
        "archive": os.path.join(user_dir, ".download-archive.sqlite"),
    }
    apply_twitter_extractor_antirate(twitter_cfg)
    browser_flag = None
    cookie_file = None
    if parsed["mode"] == "browser":
        browser_flag = parsed["browser"]
        yield {
            "type": "status",
            "msg": (
                f"将尝试从本机 {browser_flag} 读取 Cookie。"
                "若失败，多半是 Edge/Chrome 新版本加密导致，请改用「应用内登录 X」。"
            ),
        }
    else:
        cookie_file, reused = _prepare_twitter_cookie_file(
            output_dir, user_dir, parsed["cookies"]
        )
        twitter_cfg["cookies"] = cookie_file
        loaded = _read_netscape_cookies(cookie_file) or parsed["cookies"]
        names = ", ".join(key for key in COOKIE_HEADER_KEYS if key in loaded)
        if reused:
            yield {
                "type": "status",
                "msg": "沿用上次缓存刷新后的 X Cookie（ct0 可能已更新），避免换账号后仍用旧登录态。",
            }
        yield {"type": "status", "msg": f"已加载推特 Cookie：{names}"}
        if "auth_token" not in loaded:
            yield {
                "type": "error",
                "msg": "Cookie 里没有 auth_token。请从 x.com（不是 twitter.com 旧站）复制登录后的 Cookie。",
            }
            return
        if "ct0" not in loaded:
            yield {"type": "status", "msg": "未发现 ct0，若失败请把完整 Cookie 一并粘贴。"}
    if start_date or end_date:
        swapped = apply_date_range(twitter_cfg, start_date, end_date)
        if swapped:
            yield {"type": "status", "msg": swapped}

    postprocessors = [
        {
            "name": "metadata",
            "mode": "json",
            "event": "post",
            "filename": "{tweet_id}.json",
        }
    ]
    config = build_gallery_dl_config(output_dir, "twitter", twitter_cfg, concurrent, postprocessors)
    apply_gallery_dl_downloader_antirate(config, concurrent)
    config_path = write_gallery_dl_config(config)

    if archive_mode == "bookmarks":
        url = "https://x.com/i/bookmarks"
    elif archive_mode == "likes":
        url = (
            f"https://x.com/id:{account}/likes"
            if account.isdigit()
            else f"https://x.com/{account}/likes"
        )
    elif include_replies:
        url = (
            f"https://x.com/id:{account}/with_replies"
            if account.isdigit()
            else f"https://x.com/{account}/with_replies"
        )
    else:
        url = (
            f"https://x.com/id:{account}/tweets"
            if account.isdigit()
            else f"https://x.com/{account}/tweets"
        )
    cmd = gallery_dl_cmd("-c", config_path)
    if browser_flag:
        cmd.extend(["--cookies-from-browser", f"{browser_flag}/.x.com"])
    cmd.append(url)
    yield {"type": "status", "msg": f"启动 gallery-dl 处理 {url}"}
    range_msg = date_range_status(start_date, end_date)
    if range_msg:
        yield {"type": "status", "msg": range_msg}

    stats = GalleryDlStats()
    try:
        yield from iter_gallery_dl_download(
            cmd,
            stats,
            _map_gallery_dl_error,
            "请重新登录 X，或确认 auth_token / ct0 仍然有效。",
        )
    except Exception as e:
        yield {"type": "error", "msg": str(e)}
        return
    finally:
        remove_gallery_dl_config(config_path)

    yield from _yield_refreshed_twitter_cookie(
        cookie_file if parsed["mode"] == "values" else None,
        user_dir,
    )

    if stats.fatal_msg:
        return

    if archive_mode == "original":
        yield from _fetch_twitter_avatar(
            os.path.join(output_dir, "twitter"), storage_user_id, account, twitter_cfg.get("cookies"), browser_flag
        )

    forced_kind = None
    profile_name = None
    profile_extra: Dict = {}
    if archive_mode == "bookmarks":
        forced_kind = "bookmark"
        profile_name = "书签"
        profile_extra = {"archiveKind": "bookmarks", "baseUserId": base_user_id}
    elif archive_mode == "likes":
        forced_kind = "like"
        profile_name = "点赞"
        profile_extra = {"archiveKind": "likes", "baseUserId": base_user_id}

    written = _normalize_twitter_archive(
        os.path.join(output_dir, "twitter"),
        storage_user_id,
        replies_media_only=replies_media_only,
        include_quotes=include_quotes,
        forced_kind=forced_kind,
    )
    profile_patch = {
        "includeReplies": bool(include_replies),
        "repliesMediaOnly": bool(replies_media_only),
        "includeQuotes": bool(include_quotes),
        "includeBookmarks": bool(include_bookmarks),
        "includeLikes": bool(include_likes),
    }
    if profile_name:
        profile_patch["name"] = profile_name
    profile_patch.update(profile_extra)
    save_profile(os.path.join(output_dir, "twitter"), storage_user_id, profile_patch)
    avatar = existing_avatar(user_dir)
    if archive_mode == "bookmarks":
        done_msg = f"已缓存 {written} 条书签"
    elif archive_mode == "likes":
        done_msg = f"已缓存 {written} 条点赞"
    elif include_replies:
        done_msg = f"已缓存 {written} 条帖子（含回复时间线）"
    else:
        done_msg = f"已缓存 {written} 条原创帖子"
    if avatar:
        yield {"type": "status", "msg": f"{done_msg}，并保存了头像。"}
    else:
        yield {"type": "status", "msg": f"{done_msg}，可在浏览页查看。未找到头像。"}

    if archive_mode == "original" and include_bookmarks:
        yield from _download_twitter_supplementary(
            output_dir=output_dir,
            base_user_id=base_user_id,
            suffix=BOOKMARK_SUFFIX,
            url="https://x.com/i/bookmarks",
            label="书签",
            forced_kind="bookmark",
            archive_kind="bookmarks",
            profile_name="书签",
            parsed=parsed,
            concurrent=concurrent,
            browser_flag=browser_flag,
            start_date=start_date,
            end_date=end_date,
        )
    if archive_mode == "original" and include_likes:
        likes_url = (
            f"https://x.com/id:{account}/likes"
            if account.isdigit()
            else f"https://x.com/{account}/likes"
        )
        yield from _download_twitter_supplementary(
            output_dir=output_dir,
            base_user_id=base_user_id,
            suffix=LIKE_SUFFIX,
            url=likes_url,
            label="点赞",
            forced_kind="like",
            archive_kind="likes",
            profile_name="点赞",
            parsed=parsed,
            concurrent=concurrent,
            browser_flag=browser_flag,
            start_date=start_date,
            end_date=end_date,
        )

    done_event = {
        "type": "done",
        "count": stats.total,
        "skipped": stats.skipped,
        "posts": written,
        "output_dir": os.path.join(output_dir, "twitter", storage_user_id),
    }
    header = _cookie_header_from_file(cookie_file)
    if header:
        done_event["cookie"] = header
    yield done_event


def _fetch_twitter_avatar(
    output_dir: str,
    user_id: str,
    account: str,
    cookie_file: Optional[str],
    browser_flag: Optional[str],
) -> Iterator[Dict]:
    user_dir = os.path.join(output_dir, user_id)
    if existing_avatar(user_dir):
        return
    photo_url = (
        f"https://x.com/id:{account}/photo"
        if account.isdigit()
        else f"https://x.com/{account}/photo"
    )
    twitter_cfg: Dict = {
        "filename": "_avatar.{extension}",
        "directory": [user_id],
        "sleep-request": "0.5-1.0",
    }
    if cookie_file:
        twitter_cfg["cookies"] = cookie_file
    config = {
        "extractor": {
            "base-directory": output_dir,
            "twitter": twitter_cfg,
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
    cmd = gallery_dl_cmd("-c", config_path)
    if browser_flag:
        cmd.extend(["--cookies-from-browser", f"{browser_flag}/.x.com"])
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


def _download_twitter_supplementary(
    *,
    output_dir: str,
    base_user_id: str,
    suffix: str,
    url: str,
    label: str,
    forced_kind: str,
    archive_kind: str,
    profile_name: str,
    parsed: Dict,
    concurrent: int,
    browser_flag: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
) -> Iterator[Dict]:
    storage_user_id = f"{base_user_id}{suffix}"
    user_dir = os.path.join(output_dir, "twitter", storage_user_id)
    os.makedirs(user_dir, exist_ok=True)
    yield {"type": "status", "msg": f"开始缓存 X {label} 到 {storage_user_id}…"}

    twitter_cfg: Dict = {
        "filename": "{tweet_id}_{num}.{extension}",
        "directory": ["twitter", storage_user_id, "{date:%Y-%m-%d}"],
        "size": "orig",
        "videos": True,
        "previews": False,
        "cards": False,
        "articles": False,
        "retweets": False,
        "quoted": False,
        "replies": False,
        "text-tweets": True,
        "pinned": False,
        "image-filter": "extension != 'm3u8'",
        "archive": os.path.join(user_dir, ".download-archive.sqlite"),
    }
    apply_twitter_extractor_antirate(twitter_cfg)
    cookie_file = None
    if parsed["mode"] == "values":
        cookie_file, _reused = _prepare_twitter_cookie_file(
            output_dir, user_dir, parsed["cookies"]
        )
        twitter_cfg["cookies"] = cookie_file
    if start_date or end_date:
        swapped = apply_date_range(twitter_cfg, start_date, end_date)
        if swapped:
            yield {"type": "status", "msg": swapped}
    postprocessors = [
        {
            "name": "metadata",
            "mode": "json",
            "event": "post",
            "filename": "{tweet_id}.json",
        }
    ]
    config = build_gallery_dl_config(output_dir, "twitter", twitter_cfg, concurrent, postprocessors)
    apply_gallery_dl_downloader_antirate(config, concurrent)
    config_path = write_gallery_dl_config(config)
    cmd = gallery_dl_cmd("-c", config_path)
    if browser_flag:
        cmd.extend(["--cookies-from-browser", f"{browser_flag}/.x.com"])
    cmd.append(url)
    yield {"type": "status", "msg": f"启动 gallery-dl 处理 {url}"}
    stats = GalleryDlStats()
    try:
        yield from iter_gallery_dl_download(
            cmd,
            stats,
            _map_gallery_dl_error,
            f"X {label} 缓存失败。请重新登录 X，或确认 auth_token / ct0 仍然有效。",
        )
    except Exception as e:
        yield {"type": "error", "msg": str(e)}
        return
    finally:
        remove_gallery_dl_config(config_path)
    yield from _yield_refreshed_twitter_cookie(cookie_file, user_dir)
    if stats.fatal_msg:
        return
    written = _normalize_twitter_archive(
        os.path.join(output_dir, "twitter"),
        storage_user_id,
        forced_kind=forced_kind,
    )
    save_profile(os.path.join(output_dir, "twitter"), storage_user_id, {
        "name": profile_name,
        "archiveKind": archive_kind,
        "baseUserId": base_user_id,
    })
    yield {"type": "status", "msg": f"已缓存 {written} 条{label}。"}


def _parse_twitter_auth(cookie: str) -> Dict:
    cookie = (cookie or "").strip()
    if not cookie:
        return {"mode": "missing"}

    lowered = cookie.lower()
    if lowered in {"browser:chrome", "browser:edge", "browser:firefox", "browser:chromium"}:
        return {"mode": "browser", "browser": cookie.split(":", 1)[1].lower()}

    cookies = _parse_twitter_cookies(cookie)
    if not cookies:
        return {"mode": "missing"}
    return {"mode": "values", "cookies": cookies}


def _parse_twitter_cookies(cookie: str) -> Dict[str, str]:
    cookie = (cookie or "").strip()
    if not cookie:
        return {}
    if "=" not in cookie and ";" not in cookie and "\t" not in cookie:
        return {"auth_token": cookie}

    result: Dict[str, str] = {}
    wanted = {"auth_token", "ct0", "kdt", "twid", "auth_multi"}

    if "\t" in cookie:
        for line in cookie.splitlines():
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) >= 7:
                name, value = parts[-2], parts[-1]
                if name in wanted and value:
                    result[name] = value.strip()

    for part in re.split(r"[;\n]", cookie):
        part = part.strip()
        if "=" not in part or part.startswith("#"):
            continue
        key, value = part.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"')
        if key in wanted and value:
            result[key] = value
    return result


def _write_netscape_cookies(path: str, cookies: Dict[str, str]) -> None:
    lines = ["# Netscape HTTP Cookie File", "# generated by social-archiver"]
    for domain in (".x.com", ".twitter.com"):
        for name, value in cookies.items():
            if not name or value is None or value == "":
                continue
            lines.append(f"{domain}\tTRUE\t/\tTRUE\t2147483647\t{name}\t{value}")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")


def _twitter_session_cookie_path(output_dir: str) -> str:
    return os.path.join(output_dir, "twitter", SESSION_COOKIE_NAME)


def _read_netscape_cookies(path: Optional[str]) -> Dict[str, str]:
    if not path or not os.path.isfile(path):
        return {}
    result: Dict[str, str] = {}
    x_com: Dict[str, str] = {}
    try:
        with open(path, encoding="utf-8") as handle:
            lines = handle.readlines()
    except OSError:
        return {}
    for raw in lines:
        line = raw.strip()
        if line.startswith("#HttpOnly_"):
            line = line[len("#HttpOnly_"):]
        elif not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 7:
            continue
        domain, name, value = parts[0], parts[-2], parts[-1]
        if not name or not value:
            continue
        if domain.endswith("x.com"):
            x_com[name] = value
        else:
            result.setdefault(name, value)
    result.update(x_com)
    return result


def _cookie_header_from_map(cookies: Dict[str, str]) -> str:
    parts: List[str] = []
    seen = set()
    for key in COOKIE_HEADER_KEYS:
        value = cookies.get(key)
        if value:
            parts.append(f"{key}={value}")
            seen.add(key)
    return "; ".join(parts)


def _cookie_header_from_file(path: Optional[str]) -> str:
    return _cookie_header_from_map(_read_netscape_cookies(path))


def _prepare_twitter_cookie_file(
    output_dir: str,
    user_dir: str,
    parsed_cookies: Dict[str, str],
):
    session_path = _twitter_session_cookie_path(output_dir)
    os.makedirs(os.path.dirname(session_path), exist_ok=True)
    existing = _read_netscape_cookies(session_path)
    reuse = bool(
        existing.get("auth_token")
        and existing.get("auth_token") == parsed_cookies.get("auth_token")
        and existing.get("ct0")
    )
    if not reuse:
        _write_netscape_cookies(session_path, parsed_cookies)
    os.makedirs(user_dir, exist_ok=True)
    try:
        shutil.copy2(session_path, os.path.join(user_dir, ".twitter-cookies.txt"))
    except OSError:
        _write_netscape_cookies(os.path.join(user_dir, ".twitter-cookies.txt"), parsed_cookies)
    return session_path, reuse


def _yield_refreshed_twitter_cookie(
    session_path: Optional[str],
    user_dir: Optional[str] = None,
) -> Iterator[Dict]:
    header = _cookie_header_from_file(session_path)
    if not header:
        return
    if session_path and user_dir:
        try:
            shutil.copy2(session_path, os.path.join(user_dir, ".twitter-cookies.txt"))
        except OSError:
            pass
    yield {
        "type": "status",
        "msg": "已写回更新后的 X Cookie，换账号缓存将沿用同一登录态。",
        "cookie": header,
    }


def _map_gallery_dl_error(line: str) -> Optional[str]:
    lowered = line.lower()
    if "authrequired" in lowered or "authenticated cookies needed" in lowered:
        return (
            "推特拒绝了这次访问。可能原因：\n"
            "1）auth_token 已过期，请重新登录；\n"
            "2）目标为私密账号且你未关注它。\n"
            "请点「应用内登录 X」刷新 Cookie，或确认已关注该账号。"
        )
    if "could not authenticate" in lowered or "authorizationerror" in lowered:
        return (
            "X 拒绝了当前登录态（常见于换账号后仍用已刷新过的旧 ct0）。\n"
            "请点「应用内登录 X」刷新 Cookie，或从 x.com 重新复制 auth_token 和 ct0。"
        )
    if "account temporarily locked" in lowered:
        return "当前 X 账号被临时锁定。请在浏览器打开 x.com 按提示解锁后再缓存。"
    if "unable to retrieve tweets" in lowered:
        return "无法读取该用户时间线。可能是限流、私密账号或登录态失效，请稍后再试或重新登录 X。"
    if "login rejected" in lowered:
        return "推特把这次登录判定为异常。请在应用内重新登录 X，或手动粘贴新的 auth_token。"
    if "could not find" in lowered and "cookies" in lowered:
        return "无法从 Edge/Chrome 读取 Cookie。请改用「应用内登录 X」，或手动粘贴 auth_token。"
    if (
        "failed to decrypt" in lowered
        or "cookie database is locked" in lowered
        or "aes-gcm" in lowered
        or "dpapi" in lowered
        or "app-bound" in lowered
        or "v20" in lowered
    ):
        return (
            "Edge/Chrome 新版本加密了 Cookie，外部程序读不出来。这不是你操作错了。\n"
            "请点「应用内登录 X」，或从开发者工具手动复制 auth_token 和 ct0。"
        )
    return None


def _normalize_twitter_archive(
    output_dir: str,
    user_id: str,
    replies_media_only: bool = False,
    include_quotes: bool = False,
    forced_kind: Optional[str] = None,
) -> int:
    user_dir = os.path.join(output_dir, user_id)
    if not os.path.isdir(user_dir):
        return 0

    posts: Dict[str, Dict] = {}
    json_by_id: Dict[str, Dict] = {}

    for root, _dirs, files in os.walk(user_dir):
        rel_root = os.path.relpath(root, user_dir)
        if rel_root.split(os.sep)[0] == "_posts":
            continue
        date_folder = rel_root if rel_root != "." else "unknown"
        for name in files:
            if name.startswith("_") or name.startswith("."):
                continue
            path = os.path.join(root, name)
            if name.endswith(".json"):
                payload = _read_json(path)
                tweet_id = _tweet_id_from_meta(payload) or os.path.splitext(name)[0]
                if tweet_id and not str(tweet_id).startswith("_"):
                    json_by_id[str(tweet_id)] = payload
                continue

            ext = os.path.splitext(name)[1].lower()
            if ext not in MEDIA_EXTS:
                continue
            if not _media_file_ok(path):
                continue
            tweet_id, index = _parse_media_filename(name)
            if not tweet_id:
                continue
            post = posts.setdefault(tweet_id, {
                "id": tweet_id,
                "platform": "twitter",
                "user_id": user_id,
                "user_name": user_id,
                "screen_name": user_id,
                "text": "",
                "created_at": date_folder,
                "date": date_folder if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_folder) else "unknown",
                "url": f"https://x.com/{user_id}/status/{tweet_id}",
                "pics": [],
            })
            kind = "video" if ext in {".mp4", ".mov", ".webm", ".mkv"} else "image"
            post["pics"].append({
                "index": index,
                "filename": name,
                "date_folder": post["date"] if post["date"] != "unknown" else date_folder,
                "original_url": "",
                "type": kind,
            })
            if post["date"] == "unknown" and re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_folder):
                post["date"] = date_folder
                post["created_at"] = date_folder

    quote_parents, drop_ids = _build_quote_parent_map(json_by_id, user_id) if include_quotes else ({}, set())

    profile_saved = False
    for tweet_id, payload in json_by_id.items():
        if str(tweet_id) in drop_ids:
            posts.pop(tweet_id, None)
            continue
        post = posts.setdefault(tweet_id, {
            "id": tweet_id,
            "platform": "twitter",
            "user_id": user_id,
            "user_name": user_id,
            "screen_name": user_id,
            "text": "",
            "created_at": "",
            "date": "unknown",
            "url": f"https://x.com/{user_id}/status/{tweet_id}",
            "pics": [],
        })
        text = payload.get("content") or payload.get("description") or payload.get("tweet") or ""
        if isinstance(text, dict):
            text = text.get("content") or ""
        if text:
            post["text"] = str(text)
        date_value = payload.get("date") or payload.get("date_twitter")
        formatted = _format_twitter_date(date_value)
        if formatted:
            post["created_at"] = str(date_value)
            post["date"] = formatted
            for pic in post["pics"]:
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(pic.get("date_folder") or "")):
                    pic["date_folder"] = formatted
        for src, dest in (
            ("favorite_count", "likes"),
            ("like_count", "likes"),
            ("retweet_count", "reposts"),
            ("repost_count", "reposts"),
            ("reply_count", "comments"),
        ):
            if payload.get(src) is not None:
                try:
                    post[dest] = int(payload[src])
                except (TypeError, ValueError):
                    pass
        author = payload.get("author") or payload.get("user") or {}
        if payload.get("retweet_id") or payload.get("retweeted_id") or payload.get("retweet_id_str"):
            posts.pop(tweet_id, None)
            continue
        _apply_twitter_post_kind(post, payload)
        if forced_kind:
            post["original"] = False
            post["kind"] = forced_kind
        if payload.get("pinned"):
            post["pinned"] = True
        quote_info = quote_parents.get(str(tweet_id))
        if quote_info:
            post["original"] = False
            post["kind"] = "quote"
            post["quoted_from_user"] = quote_info.get("quoted_from_user") or ""
            if quote_info.get("quoted_from_id"):
                post["quoted_from_id"] = quote_info["quoted_from_id"]
        elif post.get("kind") not in ("reply",):
            _maybe_mark_quote_from_text(post)
        if isinstance(author, dict):
            handle = str(author.get("name") or user_id).lstrip("@")
            nick = str(author.get("nick") or author.get("display_name") or handle)
            post["screen_name"] = handle
            post["user_name"] = nick
            if not profile_saved:
                save_profile(output_dir, user_id, {
                    "platform": "twitter",
                    "user_id": user_id,
                    "name": nick,
                    "screen_name": handle,
                })
                profile_saved = True

    if not profile_saved:
        save_profile(output_dir, user_id, {
            "platform": "twitter",
            "user_id": user_id,
            "name": user_id,
            "screen_name": user_id,
        })

    found = existing_avatar(user_dir)
    if found:
        save_profile(output_dir, user_id, {"avatar": os.path.basename(found)})

    for post in list(posts.values()):
        if replies_media_only and post.get("kind") == "reply" and not post.get("pics"):
            posts.pop(str(post.get("id")), None)
            continue
        if "kind" not in post:
            post["original"] = True if not forced_kind else False
            post["kind"] = forced_kind or ("media" if post.get("pics") else "text")
        post["pics"].sort(key=lambda item: int(item.get("index") or 0))
        save_post_metadata(output_dir, user_id, post)
    return len(posts)


def _apply_twitter_post_kind(post: Dict, payload: Dict) -> None:
    reply_id = payload.get("reply_id")
    if reply_id:
        post["original"] = False
        post["kind"] = "reply"
        post["in_reply_to_id"] = str(reply_id)
        reply_to = payload.get("reply_to")
        if reply_to:
            post["in_reply_to_user"] = str(reply_to).lstrip("@")
        return
    post["original"] = True
    post["kind"] = "media" if post.get("pics") else "text"


_QUOTE_STATUS_URL = re.compile(
    r"https?://(?:x\.com|twitter\.com)/([A-Za-z0-9_]+)/status/(\d+)",
    re.I,
)


def _quote_target_from_text(text: str):
    match = _QUOTE_STATUS_URL.search(text or "")
    if not match:
        return "", ""
    return match.group(1), match.group(2)


def _maybe_mark_quote_from_text(post: Dict) -> None:
    user, tweet_id = _quote_target_from_text(post.get("text") or "")
    if not user:
        return
    post["original"] = False
    post["kind"] = "quote"
    post["quoted_from_user"] = user
    if tweet_id:
        post["quoted_from_id"] = tweet_id


def _build_quote_parent_map(json_by_id: Dict[str, Dict], user_id: str):
    parents: Dict[str, Dict] = {}
    drop_ids = set()
    target = str(user_id or "").lstrip("@").lower()
    for tweet_id, payload in json_by_id.items():
        quote_by = str(payload.get("quote_by") or "").lstrip("@").lower()
        parent_id = payload.get("quote_id")
        if not quote_by or not parent_id or quote_by != target:
            continue
        author = payload.get("author") or {}
        quoted_handle = ""
        if isinstance(author, dict):
            quoted_handle = str(author.get("name") or "").lstrip("@")
        parents[str(parent_id)] = {
            "quoted_from_user": quoted_handle,
            "quoted_from_id": str(tweet_id),
        }
        drop_ids.add(str(tweet_id))
    return parents, drop_ids


def _read_json(path: str) -> Dict:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _tweet_id_from_meta(payload: Dict) -> str:
    for key in ("tweet_id", "id", "display_id"):
        value = payload.get(key)
        if value:
            return str(value)
    return ""


def _parse_media_filename(name: str):
    stem = os.path.splitext(name)[0]
    match = re.match(r"^(\d+)_(\d+)$", stem)
    if match:
        return match.group(1), int(match.group(2))
    match = re.match(r"^(\d+)$", stem)
    if match:
        return match.group(1), 1
    return "", 1


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


def _format_twitter_date(value) -> str:
    if not value:
        return ""
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value).strftime("%Y-%m-%d")
        except Exception:
            return ""
    text = str(value)
    match = re.search(r"(\d{4}-\d{2}-\d{2})", text)
    if match:
        return match.group(1)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%a %b %d %H:%M:%S %z %Y"):
        try:
            return datetime.strptime(text[:26], fmt).strftime("%Y-%m-%d")
        except Exception:
            continue
    return ""
