"""Archive integrity verification: missing or corrupt media referenced by post JSON."""
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


def verify_user_dir(user_dir: str) -> Iterator[Dict]:
    """Yield issue dicts, then a summary dict with type=summary."""
    issues: List[Dict] = []
    post_count = 0
    parent_name = os.path.basename(os.path.dirname(user_dir))
    platform = parent_name if parent_name in ("weibo", "twitter", "instagram") else ""
    user_id = os.path.basename(user_dir)
    for meta_path in _iter_post_json_files(user_dir):
        post_count += 1
        try:
            with open(meta_path, encoding="utf-8") as handle:
                meta = json.load(handle) or {}
        except Exception as e:
            issues.append({
                "type": "bad_json",
                "post_id": os.path.splitext(os.path.basename(meta_path))[0],
                "path": meta_path,
                "user_dir": user_dir,
                "platform": platform,
                "user_id": user_id,
                "message": str(e),
            })
            continue
        post_id = str(meta.get("id") or os.path.splitext(os.path.basename(meta_path))[0])
        date_folder = meta.get("date") or os.path.basename(os.path.dirname(meta_path))
        for item in meta.get("pics") or []:
            folder = item.get("date_folder") or date_folder
            name = item.get("filename") or ""
            if name:
                media_path = os.path.join(user_dir, folder, name)
                if not os.path.isfile(media_path):
                    issues.append({
                        "type": "missing_media",
                        "post_id": post_id,
                        "file": name,
                        "path": media_path,
                        "user_dir": user_dir,
                        "platform": platform,
                        "user_id": user_id,
                        "message": "媒体文件缺失",
                    })
                elif not _media_file_ok(media_path):
                    issues.append({
                        "type": "corrupt_media",
                        "post_id": post_id,
                        "file": name,
                        "path": media_path,
                        "user_dir": user_dir,
                        "platform": platform,
                        "user_id": user_id,
                        "message": "媒体文件损坏或过小",
                    })
            video_name = item.get("video_filename") or ""
            if video_name:
                video_path = os.path.join(user_dir, folder, video_name)
                if not os.path.isfile(video_path):
                    issues.append({
                        "type": "missing_media",
                        "post_id": post_id,
                        "file": video_name,
                        "path": video_path,
                        "user_dir": user_dir,
                        "platform": platform,
                        "user_id": user_id,
                        "message": "实况/视频文件缺失",
                    })
                elif not _media_file_ok(video_path):
                    issues.append({
                        "type": "corrupt_media",
                        "post_id": post_id,
                        "file": video_name,
                        "path": video_path,
                        "user_dir": user_dir,
                        "platform": platform,
                        "user_id": user_id,
                        "message": "实况/视频文件损坏或过小",
                    })

    for issue in issues:
        yield issue
    yield {
        "type": "summary",
        "user_dir": user_dir,
        "post_count": post_count,
        "issue_count": len(issues),
        "ok": len(issues) == 0,
    }


def verify_output_dir(
    output_dir: str,
    platform: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Iterator[Dict]:
    """Verify one user or every archived user under output_dir."""
    if platform and user_id:
        user_dir = os.path.join(output_dir, platform, user_id)
        if not os.path.isdir(user_dir):
            yield {"type": "error", "msg": f"目录不存在: {user_dir}"}
            return
        yield from verify_user_dir(user_dir)
        return

    if not os.path.isdir(output_dir):
        yield {"type": "error", "msg": f"目录不存在: {output_dir}"}
        return

    platform_dirs = ["weibo", "twitter", "instagram"]
    found = False
    for entry in os.listdir(output_dir):
        entry_path = os.path.join(output_dir, entry)
        if not os.path.isdir(entry_path):
            continue
        if entry in platform_dirs:
            for user_name in os.listdir(entry_path):
                user_dir = os.path.join(entry_path, user_name)
                if os.path.isdir(user_dir) and os.path.isdir(os.path.join(user_dir, "_posts")):
                    found = True
                    yield {"type": "status", "msg": f"正在校验 {entry}/{user_name}…"}
                    yield from verify_user_dir(user_dir)
        elif os.path.isdir(os.path.join(entry_path, "_posts")):
            found = True
            yield {"type": "status", "msg": f"正在校验 {entry}…"}
            yield from verify_user_dir(entry_path)
    if not found:
        yield {"type": "summary", "post_count": 0, "issue_count": 0, "ok": True, "msg": "没有找到存档"}
