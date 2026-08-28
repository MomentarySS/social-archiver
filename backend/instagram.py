import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta
from typing import Any, Dict, Iterator, List, Optional

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


def download_instagram_media(
    user_id: str,
    cookie: str,
    output_dir: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    concurrent: int = 3,
    naming_template: Optional[str] = None,
) -> Iterator[Dict]:
    """Download Instagram posts via gallery-dl, then normalize metadata for browsing."""
    del naming_template
    yield {"type": "status", "msg": f"准备缓存 Instagram 用户 {user_id} 的原创内容（文字 + 图片/视频）..."}

    try:
        subprocess.run(_gallery_dl_cmd("--version"), capture_output=True, check=True)
    except FileNotFoundError:
        yield {"type": "error", "msg": "无法启动 gallery-dl。开发环境请执行: pip install gallery-dl"}
        return
    except subprocess.CalledProcessError as e:
        yield {"type": "error", "msg": f"gallery-dl 无法运行: {e}"}
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

    user_dir = os.path.join(output_dir, "instagram", user_id)
    os.makedirs(user_dir, exist_ok=True)

    account = (user_id or "").strip().lstrip("@")
    instagram_cfg: Dict = {
        "filename": "{media_id}.{extension}",
        "directory": ["instagram", user_id, "{date:%Y-%m-%d}"],
        "size": "orig",
        "videos": True,
        "sleep-request": "6.0-12.0",
        "cookies": {"sessionid": sessionid},
        "archive": os.path.join(user_dir, ".download-archive.sqlite"),
    }

    if start_date or end_date:
        start_day, end_day, swapped = order_days(parse_day(start_date), parse_day(end_date))
        if swapped:
            yield {"type": "status", "msg": "起始日晚于结束日，已按从早到晚对调。"}
        if start_day:
            after = day_start_utc(start_day) - timedelta(seconds=1)
            instagram_cfg["date-after"] = after.strftime("%Y-%m-%dT%H:%M:%S")
        if end_day:
            before = day_end_exclusive_utc(end_day)
            instagram_cfg["date-before"] = before.strftime("%Y-%m-%dT%H:%M:%S")

    config = {
        "extractor": {
            "base-directory": output_dir,
            "instagram": instagram_cfg,
        },
        "downloader": {
            "retries": 3,
            "timeout": 30.0,
            "threads": max(1, min(int(concurrent or 3), 8)),
        },
        "output": {
            "skip": True,
        },
    }

    fd, config_path = tempfile.mkstemp(prefix="social-archiver-gdl-", suffix=".json")
    os.close(fd)
    with open(config_path, "w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2)

    url = (
        f"https://www.instagram.com/id:{account}/"
        if account.isdigit()
        else f"https://www.instagram.com/{account}/"
    )
    cmd = _gallery_dl_cmd("-c", config_path)
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
            fatal_msg = f"gallery-dl 失败（退出码 {process.returncode}）。Instagram 需要有效的 sessionid Cookie。"
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

    yield from _fetch_instagram_avatar(os.path.join(output_dir, "instagram"), user_id, account, sessionid)

    written = _normalize_instagram_archive(os.path.join(output_dir, "instagram"), user_id)
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
        "output_dir": os.path.join(output_dir, "instagram", user_id),
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
    cmd = _gallery_dl_cmd("-c", config_path)
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


def _map_gallery_dl_error(line: str) -> Optional[str]:
    lowered = line.lower()
    if "authrequired" in lowered or "authenticated cookies needed" in lowered:
        return (
            "Instagram 拒绝了这次访问。sessionid 可能已过期或无效。\n"
            "请重新登录 Instagram，或粘贴新的 sessionid。"
        )
    if "login rejected" in lowered:
        return "Instagram 把这次登录判定为异常。请重新登录并获取新的 sessionid。"
    if "private" in lowered:
        return "该账号为私密账号，且登录用户未关注它。无法缓存私密账号的内容。"
    if "not found" in lowered or "404" in lowered:
        return "Instagram 找不到该用户。请检查用户名是否正确。"
    if "challenge" in lowered or "checkpoint" in lowered:
        return "Instagram 要求额外验证（Challenge/Checkpoint）。请在浏览器中完成验证后重试。"
    if "rate" in lowered or "too many requests" in lowered or "429" in lowered:
        return "Instagram 请求过于频繁，已被限流。请稍后再试。"
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


def _looks_like_path(line: str) -> bool:
    if line.startswith("#") or " " in line and not os.path.sep in line and "\\" not in line:
        return False
    ext = os.path.splitext(line.split("?", 1)[0])[1].lower()
    if ext == ".json":
        return False
    return ext in MEDIA_EXTS or os.path.sep in line or "\\" in line


def _normalize_instagram_archive(output_dir: str, user_id: str) -> int:
    user_dir = os.path.join(output_dir, user_id)
    if not os.path.isdir(user_dir):
        return 0

    posts: Dict[str, Dict[str, Any]] = {}
    json_files: List[str] = []

    for root, _dirs, files in os.walk(user_dir):
        rel_root = os.path.relpath(root, user_dir)
        if rel_root.split(os.sep)[0] == "_posts":
            continue
        date_folder = rel_root if rel_root != "." else "unknown"
        for name in files:
            if name.startswith("_") or name.startswith("."):
                continue
            if not name.endswith(".json"):
                continue
            path = os.path.join(root, name)
            json_files.append(path)

    for path in json_files:
        try:
            payload = _read_json(path)
            post_id = _instagram_post_id(payload) or os.path.splitext(os.path.basename(path))[0]
            if not post_id:
                continue

            text = payload.get("description") or payload.get("caption") or ""
            if isinstance(text, dict):
                text = text.get("text") or text.get("content") or ""

            date_value = payload.get("date") or payload.get("post_date") or payload.get("taken_at") or ""
            formatted = _format_instagram_date(date_value)
            if not formatted:
                formatted = "unknown"

            post = posts.setdefault(str(post_id), {
                "id": str(post_id),
                "platform": "instagram",
                "user_id": user_id,
                "user_name": payload.get("fullname") or payload.get("owner") or user_id,
                "screen_name": payload.get("username") or user_id,
                "text": str(text),
                "created_at": str(date_value) if date_value else formatted,
                "date": formatted,
                "url": payload.get("url") or f"https://www.instagram.com/p/{post_id}/",
                "pics": [],
            })

            for count, file_path in enumerate(payload.get("_files", []), start=1):
                filename = os.path.basename(file_path.replace("\\", "/"))
                ext = os.path.splitext(filename)[1].lower()
                kind = "video" if ext in {".mp4", ".mov", ".webm", ".mkv"} else "image"
                post["pics"].append({
                    "index": count,
                    "filename": filename,
                    "date_folder": formatted if formatted != "unknown" else date_folder,
                    "original_url": payload.get(f"_files[{count-1}]", {}).get("url") or file_path,
                    "type": kind,
                })
        except Exception:
            continue

    saved = 0
    for post_id, post in posts.items():
        save_post_metadata(output_dir, user_id, post)
        saved += 1

    if posts:
        first = next(iter(posts.values()))
        save_profile(output_dir, user_id, {
            "platform": "instagram",
            "user_id": user_id,
            "name": first.get("user_name") or user_id,
            "screen_name": first.get("screen_name") or user_id,
        })
    else:
        save_profile(output_dir, user_id, {
            "platform": "instagram",
            "user_id": user_id,
            "name": user_id,
            "screen_name": user_id,
        })
    avatar = existing_avatar(user_dir)
    if avatar:
        save_profile(output_dir, user_id, {"avatar": os.path.basename(avatar)})
    return saved


def _read_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle) or {}


def _instagram_post_id(payload: Dict[str, Any]) -> Optional[str]:
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
