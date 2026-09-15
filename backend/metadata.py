import json
import os
import tempfile
from typing import Dict, Optional

AVATAR_STEM = "_avatar"
AVATAR_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif")


def _atomic_json_write(path: str, value: Dict) -> None:
    """Write JSON beside the target, then atomically replace it."""
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(prefix=f".{os.path.basename(path)}.", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    except Exception:
        try:
            os.remove(temp_path)
        except OSError:
            pass
        raise


def save_post_metadata(output_dir: str, user_id: str, metadata: Dict) -> None:
    """Save normalized post metadata to _posts/{date}/{id}.json."""
    date = metadata.get("date") or "unknown"
    post_id = str(metadata.get("id") or "unknown")
    posts_dir = os.path.join(output_dir, user_id, "_posts", date)
    os.makedirs(posts_dir, exist_ok=True)
    meta_path = os.path.join(posts_dir, f"{post_id}.json")
    _atomic_json_write(meta_path, metadata)


def save_profile(output_dir: str, user_id: str, profile: Dict) -> None:
    os.makedirs(os.path.join(output_dir, user_id), exist_ok=True)
    path = os.path.join(output_dir, user_id, "_profile.json")
    existing: Dict = {}
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as handle:
                existing = json.load(handle) or {}
        except Exception:
            existing = {}
    existing.update({k: v for k, v in profile.items() if v not in (None, "")})
    _atomic_json_write(path, existing)


def existing_avatar(user_dir: str) -> str:
    for ext in AVATAR_EXTS:
        path = os.path.join(user_dir, AVATAR_STEM + ext)
        if os.path.exists(path) and os.path.getsize(path) > 0:
            return path
    return ""


def _image_ext_from_bytes(data: bytes) -> str:
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG"):
        return ".png"
    if data.startswith(b"GIF8"):
        return ".gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return ".jpg"


def download_avatar(url: Optional[str], dest: str, headers: Optional[Dict] = None) -> bool:
    user_dir = os.path.dirname(dest) if dest else ""
    if user_dir and existing_avatar(user_dir):
        return True
    if not url or not dest:
        return False
    try:
        import requests
        resp = requests.get(url, headers=headers or {}, timeout=20)
        if resp.status_code != 200 or not resp.content or len(resp.content) < 64:
            return False
        if resp.content[:1] in (b"{", b"<", b"["):
            return False
        ext = _image_ext_from_bytes(resp.content)
        out = os.path.join(user_dir, AVATAR_STEM + ext)
        os.makedirs(user_dir, exist_ok=True)
        with open(out, "wb") as handle:
            handle.write(resp.content)
        return True
    except Exception:
        return False
