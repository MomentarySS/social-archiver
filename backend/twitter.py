import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta
from typing import Dict, Iterator, List, Optional

from backend.daterange import (
    day_end_exclusive_utc,
    day_start_utc,
    order_days,
    parse_day,
)
from backend.metadata import existing_avatar, save_post_metadata, save_profile

MEDIA_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".webm", ".mkv"}


def _gallery_dl_cmd(*extra: str) -> List[str]:
    # Priority: system gallery-dl (always latest) > frozen bundled gallery-dl > dev mode
    system_gallery_dl = shutil.which("gallery-dl")
    if system_gallery_dl:
        return [system_gallery_dl, *extra]
    if getattr(sys, "frozen", False):
        return [sys.executable, "--run-gallery-dl", *extra]
    return [sys.executable, "-m", "gallery_dl", *extra]


def download_twitter_media(
    user_id: str,
    cookie: str,
    output_dir: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    concurrent: int = 3,
    naming_template: Optional[str] = None,
) -> Iterator[Dict]:
    """Download Twitter/X media using gallery-dl, then normalize metadata for browsing."""
    del naming_template  # gallery-dl filename template is fixed for browse compatibility
    yield {"type": "status", "msg": f"准备缓存推特用户 {user_id} 的原创内容（文字 + 图片/视频）..."}

    try:
        subprocess.run(_gallery_dl_cmd("--version"), capture_output=True, check=True)
    except FileNotFoundError:
        yield {"type": "error", "msg": "无法启动 gallery-dl。开发环境请执行: pip install gallery-dl"}
        return
    except subprocess.CalledProcessError as e:
        yield {"type": "error", "msg": f"gallery-dl 无法运行: {e}"}
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

    user_dir = os.path.join(output_dir, "twitter", user_id)
    os.makedirs(user_dir, exist_ok=True)

    account = (user_id or "").strip().lstrip("@")
    twitter_cfg: Dict = {
        "filename": "{tweet_id}_{num}.{extension}",
        "directory": ["twitter", user_id, "{date:%Y-%m-%d}"],
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
        "sleep-request": "1.0-2.0",
        "image-filter": "extension != 'm3u8'",
        "archive": os.path.join(user_dir, ".download-archive.sqlite"),
    }
    browser_flag = None
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
        cookie_file = os.path.join(user_dir, ".twitter-cookies.txt")
        _write_netscape_cookies(cookie_file, parsed["cookies"])
        twitter_cfg["cookies"] = cookie_file
        names = ", ".join(parsed["cookies"].keys())
        yield {"type": "status", "msg": f"已加载推特 Cookie：{names}"}
        if "auth_token" not in parsed["cookies"]:
            yield {
                "type": "error",
                "msg": "Cookie 里没有 auth_token。请从 x.com（不是 twitter.com 旧站）复制登录后的 Cookie。",
            }
            return
        if "ct0" not in parsed["cookies"]:
            yield {"type": "status", "msg": "未发现 ct0，若失败请把完整 Cookie 一并粘贴。"}
    if start_date or end_date:
        start_day, end_day, swapped = order_days(parse_day(start_date), parse_day(end_date))
        if swapped:
            yield {"type": "status", "msg": "起始日晚于结束日，已按从早到晚对调。"}
        if start_day:
            after = day_start_utc(start_day) - timedelta(seconds=1)
            twitter_cfg["date-after"] = after.strftime("%Y-%m-%dT%H:%M:%S")
        if end_day:
            before = day_end_exclusive_utc(end_day)
            twitter_cfg["date-before"] = before.strftime("%Y-%m-%dT%H:%M:%S")

    config = {
        "extractor": {
            "base-directory": output_dir,
            "twitter": twitter_cfg,
        },
        "downloader": {
            "retries": 3,
            "timeout": 30.0,
            "threads": max(1, min(int(concurrent or 3), 8)),
        },
        "output": {
            "skip": True,
        },
        "postprocessors": [
            {
                "name": "metadata",
                "mode": "json",
                "event": "post",
                "filename": "{tweet_id}.json",
            }
        ],
    }

    fd, config_path = tempfile.mkstemp(prefix="social-archiver-gdl-", suffix=".json")
    os.close(fd)
    with open(config_path, "w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2)

    url = (
        f"https://x.com/id:{account}/tweets"
        if account.isdigit()
        else f"https://x.com/{account}/tweets"
    )
    cmd = _gallery_dl_cmd("-c", config_path)
    if browser_flag:
        cmd.extend(["--cookies-from-browser", f"{browser_flag}/.x.com"])
    cmd.append(url)
    yield {"type": "status", "msg": f"启动 gallery-dl 处理 {url}"}
    if start_date or end_date:
        start_day, end_day, _ = order_days(parse_day(start_date), parse_day(end_date))
        yield {
            "type": "status",
            "msg": f"日期范围: {start_day or '不限'} ~ {end_day or '不限'}（含首尾）",
        }

    total = 0
    skipped = 0
    fatal_msg = None
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        assert process.stdout is not None
        for raw in process.stdout:
            line = raw.strip()
            if not line:
                continue
            lowered = line.lower()
            if "skipping" in lowered or "# skip" in lowered:
                skipped += 1
                yield {"type": "status", "msg": line}
                continue
            if _looks_like_path(line):
                total += 1
                filename = os.path.basename(line.replace("\\", "/"))
                yield {
                    "type": "progress",
                    "file": filename,
                    "current": total,
                    "total": total,
                    "percent": 100.0,
                }
                yield {"type": "status", "msg": f"已下载: {filename}"}
            else:
                mapped = _map_gallery_dl_error(line)
                if mapped:
                    fatal_msg = mapped
                    yield {"type": "error", "msg": mapped}
                    process.kill()
                    break
                yield {"type": "status", "msg": line}

        process.wait()
        if not fatal_msg and process.returncode not in (0, None) and total == 0:
            fatal_msg = f"gallery-dl 失败（退出码 {process.returncode}）。推特需要有效的 auth_token Cookie。"
            yield {"type": "error", "msg": fatal_msg}
        elif process.returncode not in (0, None) and total > 0:
            yield {"type": "status", "msg": f"gallery-dl 退出码 {process.returncode}，将整理已下载文件。"}
    except Exception as e:
        yield {"type": "error", "msg": str(e)}
        return
    finally:
        try:
            os.remove(config_path)
        except OSError:
            pass

    if fatal_msg:
        return

    yield from _fetch_twitter_avatar(
        os.path.join(output_dir, "twitter"), user_id, account, twitter_cfg.get("cookies"), browser_flag
    )

    written = _normalize_twitter_archive(os.path.join(output_dir, "twitter"), user_id)
    avatar = existing_avatar(user_dir)
    if avatar:
        yield {"type": "status", "msg": f"已缓存 {written} 条原创帖子，并保存了头像。"}
    else:
        yield {"type": "status", "msg": f"已缓存 {written} 条原创帖子，可在浏览页查看。未找到头像。"}
    yield {
        "type": "done",
        "count": total,
        "skipped": skipped,
        "posts": written,
        "output_dir": os.path.join(output_dir, "twitter", user_id),
    }


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
    cmd = _gallery_dl_cmd("-c", config_path)
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
            if _looks_like_path(line):
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
            lines.append(f"{domain}\tTRUE\t/\tTRUE\t2147483647\t{name}\t{value}")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")


def _map_gallery_dl_error(line: str) -> Optional[str]:
    lowered = line.lower()
    if "authrequired" in lowered or "authenticated cookies needed" in lowered:
        return (
            "推特拒绝了这次访问。可能原因：\n"
            "1）auth_token 已过期，请重新登录；\n"
            "2）目标为私密账号且你未关注它。\n"
            "请点「应用内登录 X」刷新 Cookie，或确认已关注该账号。"
        )
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


def _looks_like_path(line: str) -> bool:
    if line.startswith("#") or " " in line and not os.path.sep in line and "\\" not in line:
        return False
    ext = os.path.splitext(line.split("?", 1)[0])[1].lower()
    if ext == ".json":
        return False
    return ext in MEDIA_EXTS or os.path.sep in line or "\\" in line


def _normalize_twitter_archive(output_dir: str, user_id: str) -> int:
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

    profile_saved = False
    for tweet_id, payload in json_by_id.items():
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

    for post in posts.values():
        post["pics"].sort(key=lambda item: int(item.get("index") or 0))
        post["original"] = True
        post["kind"] = "media" if post.get("pics") else "text"
        save_post_metadata(output_dir, user_id, post)
    return len(posts)


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
