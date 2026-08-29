"""Repair helpers: remove corrupt Weibo live-photo media so the next cache run can re-fetch."""
import json
import os
from typing import Dict, Iterator, List, Optional

from backend.weibo import _media_file_ok


def _iter_post_json_files(user_dir: str) -> List[str]:
    posts_root = os.path.join(user_dir, "_posts")
    if not os.path.isdir(posts_root):
        return []
    paths: List[str] = []
    for date_name in os.listdir(posts_root):
        date_dir = os.path.join(posts_root, date_name)
        if not os.path.isdir(date_dir):
            continue
        for fname in os.listdir(date_dir):
            if fname.endswith(".json"):
                paths.append(os.path.join(date_dir, fname))
    return paths


def _repair_user_dir(user_dir: str) -> Iterator[Dict]:
    removed: List[Dict] = []
    for meta_path in _iter_post_json_files(user_dir):
        try:
            with open(meta_path, encoding="utf-8") as handle:
                meta = json.load(handle) or {}
        except Exception:
            continue
        post_id = str(meta.get("id") or os.path.splitext(os.path.basename(meta_path))[0])
        date_folder = meta.get("date") or os.path.basename(os.path.dirname(meta_path))
        for item in meta.get("pics") or []:
            folder = item.get("date_folder") or date_folder
            for key in ("filename", "video_filename"):
                name = item.get(key) or ""
                if not name or not name.lower().endswith(".mp4"):
                    continue
                media_path = os.path.join(user_dir, folder, name)
                if not os.path.isfile(media_path):
                    continue
                if _media_file_ok(media_path):
                    continue
                try:
                    os.remove(media_path)
                    removed.append({
                        "type": "removed",
                        "post_id": post_id,
                        "file": name,
                        "path": media_path,
                    })
                    yield {
                        "type": "status",
                        "msg": f"已删除损坏实况视频：{name}（帖 {post_id}）",
                    }
                except OSError as e:
                    yield {
                        "type": "error",
                        "msg": f"无法删除 {name}: {e}",
                    }
    yield {
        "type": "summary",
        "user_dir": user_dir,
        "removed_count": len(removed),
        "ok": True,
    }


def repair_output_dir(
    output_dir: str,
    platform: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Iterator[Dict]:
    if platform and user_id:
        user_dir = os.path.join(output_dir, platform, user_id)
        if not os.path.isdir(user_dir):
            yield {"type": "error", "msg": f"目录不存在: {user_dir}"}
            return
        yield from _repair_user_dir(user_dir)
        return

    if not os.path.isdir(output_dir):
        yield {"type": "error", "msg": f"目录不存在: {output_dir}"}
        return

    found = False
    for entry in os.listdir(output_dir):
        entry_path = os.path.join(output_dir, entry)
        if not os.path.isdir(entry_path):
            continue
        if entry != "weibo":
            continue
        for user_name in os.listdir(entry_path):
            user_dir = os.path.join(entry_path, user_name)
            if not os.path.isdir(user_dir) or not os.path.isdir(os.path.join(user_dir, "_posts")):
                continue
            found = True
            yield {"type": "status", "msg": f"正在修复 weibo/{user_name}…"}
            yield from _repair_user_dir(user_dir)
    if not found:
        yield {"type": "summary", "removed_count": 0, "ok": True, "msg": "没有找到微博存档"}
