"""Optional ffmpeg transcoding for browser-incompatible videos (e.g. HEVC live motion)."""
import json
import os
import re
import shutil
import subprocess
from typing import Dict, Iterator, List, Optional, Tuple

from backend.verify import _iter_post_json_files
from backend.weibo import _media_file_ok

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".m4v"}


def find_ffmpeg() -> str:
    return shutil.which("ffmpeg") or ""


def probe_ffmpeg() -> Dict:
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        return {"available": False, "path": "", "version": ""}
    try:
        completed = subprocess.run(
            [ffmpeg, "-version"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
            check=False,
        )
        first = (completed.stdout or completed.stderr or "").splitlines()[0].strip()
        return {"available": True, "path": ffmpeg, "version": first}
    except Exception as e:
        return {"available": False, "path": ffmpeg, "version": "", "error": str(e)}


def h264_output_path(src: str) -> str:
    stem, _ext = os.path.splitext(src)
    return f"{stem}_h264.mp4"


def poster_output_path(src: str) -> str:
    stem, _ext = os.path.splitext(src)
    return f"{stem}_poster.jpg"


def _read_header(path: str, size: int = 4096) -> bytes:
    try:
        with open(path, "rb") as handle:
            return handle.read(size)
    except OSError:
        return b""


def is_hevc_file(path: str) -> bool:
    data = _read_header(path).lower()
    return b"hvc1" in data or b"hev1" in data or b"hvc " in data


def is_h264_file(path: str) -> bool:
    data = _read_header(path).lower()
    return b"avc1" in data or b"avc3" in data


def needs_transcode(path: str) -> bool:
    if not path or not os.path.isfile(path):
        return False
    ext = os.path.splitext(path)[1].lower()
    if ext not in VIDEO_EXTS:
        return False
    if not _media_file_ok(path):
        return False
    dest = h264_output_path(path)
    if os.path.isfile(dest) and _media_file_ok(dest):
        return False
    if is_h264_file(path):
        return False
    return is_hevc_file(path)


def needs_poster(path: str) -> bool:
    if not path or not os.path.isfile(path):
        return False
    ext = os.path.splitext(path)[1].lower()
    if ext not in VIDEO_EXTS:
        return False
    if not _media_file_ok(path):
        return False
    dest = poster_output_path(path)
    if os.path.isfile(dest):
        try:
            with open(dest, "rb") as handle:
                head = handle.read(8)
            if head.startswith((b"\xff\xd8\xff", b"\x89PNG")) and os.path.getsize(dest) > 64:
                return False
        except OSError:
            pass
    return True


def generate_poster(ffmpeg: str, src: str, dest: Optional[str] = None, timeout: int = 120) -> Dict:
    if not ffmpeg:
        return {"ok": False, "error": "未找到 ffmpeg"}
    if not os.path.isfile(src):
        return {"ok": False, "error": f"源文件不存在: {src}"}
    output = dest or poster_output_path(src)
    os.makedirs(os.path.dirname(output) or ".", exist_ok=True)
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        "00:00:00.5",
        "-i",
        src,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        output,
    ]
    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"生成封面超时: {os.path.basename(src)}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
    if completed.returncode != 0 or not os.path.isfile(output):
        err = (completed.stderr or completed.stdout or "生成封面失败").strip()
        err = re.sub(r"\s+", " ", err)[:240]
        try:
            if os.path.exists(output):
                os.remove(output)
        except OSError:
            pass
        return {"ok": False, "error": err or "生成封面失败"}
    try:
        with open(output, "rb") as handle:
            head = handle.read(8)
        if not head.startswith((b"\xff\xd8\xff", b"\x89PNG")) or os.path.getsize(output) < 64:
            os.remove(output)
            return {"ok": False, "error": "封面输出无效"}
    except OSError as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "src": src, "dest": output}


def transcode_file(ffmpeg: str, src: str, dest: Optional[str] = None, timeout: int = 600) -> Dict:
    if not ffmpeg:
        return {"ok": False, "error": "未找到 ffmpeg"}
    if not os.path.isfile(src):
        return {"ok": False, "error": f"源文件不存在: {src}"}
    output = dest or h264_output_path(src)
    os.makedirs(os.path.dirname(output) or ".", exist_ok=True)
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        src,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        output,
    ]
    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"转码超时: {os.path.basename(src)}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
    if completed.returncode != 0 or not _media_file_ok(output):
        err = (completed.stderr or completed.stdout or "转码失败").strip()
        err = re.sub(r"\s+", " ", err)[:240]
        try:
            if os.path.exists(output):
                os.remove(output)
        except OSError:
            pass
        return {"ok": False, "error": err or "转码失败"}
    return {"ok": True, "src": src, "dest": output}


def _collect_targets(user_dir: str) -> List[Tuple[str, int, str, str]]:
    targets: List[Tuple[str, int, str, str]] = []
    seen = set()
    for meta_path in _iter_post_json_files(user_dir):
        try:
            with open(meta_path, encoding="utf-8") as handle:
                meta = json.load(handle) or {}
        except Exception:
            continue
        date_folder = meta.get("date") or os.path.basename(os.path.dirname(meta_path))
        for index, item in enumerate(meta.get("pics") or []):
            folder = item.get("date_folder") or date_folder
            kind = str(item.get("type") or "")
            video_name = item.get("video_filename") or ""
            if video_name:
                media_path = os.path.join(user_dir, folder, video_name)
                key = ("video", media_path)
                if key not in seen:
                    seen.add(key)
                    targets.append((meta_path, index, media_path, "video"))
                continue
            if kind == "video":
                name = item.get("filename") or ""
                if not name:
                    continue
                media_path = os.path.join(user_dir, folder, name)
                key = ("filename", media_path)
                if key not in seen:
                    seen.add(key)
                    targets.append((meta_path, index, media_path, "filename"))
    return targets


def _update_post_playback(meta_path: str, pic_index: int, field_kind: str, playback_name: str) -> None:
    try:
        with open(meta_path, encoding="utf-8") as handle:
            meta = json.load(handle) or {}
        pics = meta.get("pics") or []
        if pic_index >= len(pics):
            return
        item = pics[pic_index]
        if field_kind == "video":
            item["video_playback_filename"] = playback_name
        else:
            item["playback_filename"] = playback_name
        pics[pic_index] = item
        meta["pics"] = pics
        with open(meta_path, "w", encoding="utf-8") as handle:
            json.dump(meta, handle, ensure_ascii=False, indent=2)
    except Exception:
        return


def _update_post_poster(meta_path: str, pic_index: int, poster_name: str) -> None:
    try:
        with open(meta_path, encoding="utf-8") as handle:
            meta = json.load(handle) or {}
        pics = meta.get("pics") or []
        if pic_index >= len(pics):
            return
        pics[pic_index]["poster_filename"] = poster_name
        meta["pics"] = pics
        with open(meta_path, "w", encoding="utf-8") as handle:
            json.dump(meta, handle, ensure_ascii=False, indent=2)
    except Exception:
        return


def _video_source_path(user_dir: str, folder: str, item: Dict, field_kind: str, media_path: str) -> str:
    playback_name = item.get("video_playback_filename") if field_kind == "video" else item.get("playback_filename")
    if playback_name:
        candidate = os.path.join(user_dir, folder, playback_name)
        if os.path.isfile(candidate) and _media_file_ok(candidate):
            return candidate
    h264 = h264_output_path(media_path)
    if os.path.isfile(h264) and _media_file_ok(h264):
        return h264
    return media_path


def transcode_user_dir(user_dir: str) -> Iterator[Dict]:
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        yield {"type": "error", "msg": "未找到 ffmpeg。请安装后将其加入系统 PATH，再重试。"}
        return

    targets = _collect_targets(user_dir)
    transcoded = 0
    skipped = 0
    failed = 0

    for meta_path, pic_index, media_path, field_kind in targets:
        playback_name = os.path.basename(h264_output_path(media_path))
        dest = h264_output_path(media_path)
        if os.path.isfile(dest) and _media_file_ok(dest):
            _update_post_playback(meta_path, pic_index, field_kind, playback_name)
            skipped += 1
            continue
        if not needs_transcode(media_path):
            skipped += 1
            continue
        yield {
            "type": "progress",
            "file": os.path.basename(media_path),
            "current": transcoded + failed + 1,
            "total": len(targets),
        }
        result = transcode_file(ffmpeg, media_path, dest)
        if result.get("ok"):
            _update_post_playback(meta_path, pic_index, field_kind, playback_name)
            transcoded += 1
            yield {"type": "status", "msg": f"已转码: {os.path.basename(media_path)}"}
        else:
            failed += 1
            yield {
                "type": "status",
                "msg": f"转码失败 {os.path.basename(media_path)}: {result.get('error', '未知错误')}",
            }

    yield {
        "type": "summary",
        "user_dir": user_dir,
        "target_count": len(targets),
        "transcoded": transcoded,
        "skipped": skipped,
        "failed": failed,
        "ok": failed == 0,
    }


def transcode_output_dir(
    output_dir: str,
    platform: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Iterator[Dict]:
    if platform and user_id:
        user_dir = os.path.join(output_dir, platform, user_id)
        if not os.path.isdir(user_dir):
            yield {"type": "error", "msg": f"目录不存在: {user_dir}"}
            return
        yield from transcode_user_dir(user_dir)
        return

    if not os.path.isdir(output_dir):
        yield {"type": "error", "msg": f"目录不存在: {output_dir}"}
        return

    platform_dirs = ["weibo", "twitter", "instagram"]
    found = False
    total_transcoded = 0
    total_failed = 0
    for entry in os.listdir(output_dir):
        entry_path = os.path.join(output_dir, entry)
        if not os.path.isdir(entry_path):
            continue
        if entry in platform_dirs:
            for user_name in os.listdir(entry_path):
                user_dir = os.path.join(entry_path, user_name)
                if not os.path.isdir(user_dir) or not os.path.isdir(os.path.join(user_dir, "_posts")):
                    continue
                found = True
                for event in transcode_user_dir(user_dir):
                    if event.get("type") == "summary":
                        total_transcoded += int(event.get("transcoded") or 0)
                        total_failed += int(event.get("failed") or 0)
                    yield event
        elif os.path.isdir(os.path.join(entry_path, "_posts")):
            found = True
            for event in transcode_user_dir(entry_path):
                if event.get("type") == "summary":
                    total_transcoded += int(event.get("transcoded") or 0)
                    total_failed += int(event.get("failed") or 0)
                yield event

    if not found:
        yield {"type": "error", "msg": "未找到可转码的存档目录"}
        return

    yield {
        "type": "summary",
        "output_dir": output_dir,
        "transcoded": total_transcoded,
        "failed": total_failed,
        "ok": total_failed == 0,
    }


def generate_posters_user_dir(user_dir: str) -> Iterator[Dict]:
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        yield {"type": "error", "msg": "未找到 ffmpeg。请安装后将其加入系统 PATH，再重试。"}
        return

    targets = _collect_targets(user_dir)
    generated = 0
    skipped = 0
    failed = 0

    for meta_path, pic_index, media_path, field_kind in targets:
        try:
            with open(meta_path, encoding="utf-8") as handle:
                meta = json.load(handle) or {}
            item = (meta.get("pics") or [])[pic_index]
            folder = item.get("date_folder") or meta.get("date") or ""
        except Exception:
            folder = ""
            item = {}
        source = _video_source_path(user_dir, folder, item, field_kind, media_path)
        poster_name = os.path.basename(poster_output_path(source))
        poster_path = poster_output_path(source)
        if os.path.isfile(poster_path) and not needs_poster(source):
            _update_post_poster(meta_path, pic_index, poster_name)
            skipped += 1
            continue
        if not needs_poster(source):
            skipped += 1
            continue
        yield {
            "type": "progress",
            "file": os.path.basename(source),
            "current": generated + failed + 1,
            "total": len(targets),
        }
        result = generate_poster(ffmpeg, source, poster_path)
        if result.get("ok"):
            _update_post_poster(meta_path, pic_index, poster_name)
            generated += 1
            yield {"type": "status", "msg": f"已生成封面: {os.path.basename(source)}"}
        else:
            failed += 1
            yield {
                "type": "status",
                "msg": f"封面失败 {os.path.basename(source)}: {result.get('error', '未知错误')}",
            }

    yield {
        "type": "summary",
        "user_dir": user_dir,
        "target_count": len(targets),
        "generated": generated,
        "skipped": skipped,
        "failed": failed,
        "ok": failed == 0,
    }


def generate_posters_output_dir(
    output_dir: str,
    platform: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Iterator[Dict]:
    if platform and user_id:
        user_dir = os.path.join(output_dir, platform, user_id)
        if not os.path.isdir(user_dir):
            yield {"type": "error", "msg": f"目录不存在: {user_dir}"}
            return
        yield from generate_posters_user_dir(user_dir)
        return

    if not os.path.isdir(output_dir):
        yield {"type": "error", "msg": f"目录不存在: {output_dir}"}
        return

    platform_dirs = ["weibo", "twitter", "instagram"]
    found = False
    total_generated = 0
    total_failed = 0
    for entry in os.listdir(output_dir):
        entry_path = os.path.join(output_dir, entry)
        if not os.path.isdir(entry_path):
            continue
        if entry in platform_dirs:
            for user_name in os.listdir(entry_path):
                user_dir = os.path.join(entry_path, user_name)
                if not os.path.isdir(user_dir) or not os.path.isdir(os.path.join(user_dir, "_posts")):
                    continue
                found = True
                for event in generate_posters_user_dir(user_dir):
                    if event.get("type") == "summary":
                        total_generated += int(event.get("generated") or 0)
                        total_failed += int(event.get("failed") or 0)
                    yield event
        elif os.path.isdir(os.path.join(entry_path, "_posts")):
            found = True
            for event in generate_posters_user_dir(entry_path):
                if event.get("type") == "summary":
                    total_generated += int(event.get("generated") or 0)
                    total_failed += int(event.get("failed") or 0)
                yield event

    if not found:
        yield {"type": "error", "msg": "未找到可生成封面的存档目录"}
        return

    yield {
        "type": "summary",
        "output_dir": output_dir,
        "generated": total_generated,
        "failed": total_failed,
        "ok": total_failed == 0,
    }
