"""Shared gallery-dl process helpers for Twitter / Instagram downloaders."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import timedelta
from typing import Callable, Dict, Iterator, List, Optional

from backend.daterange import (
    day_end_exclusive_utc,
    day_start_utc,
    order_days,
    parse_day,
)

MEDIA_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".webm", ".mkv"}


def gallery_dl_cmd(*extra: str) -> List[str]:
    system_gallery_dl = shutil.which("gallery-dl")
    if system_gallery_dl:
        return [system_gallery_dl, *extra]
    if getattr(sys, "frozen", False):
        return [sys.executable, "--run-gallery-dl", *extra]
    return [sys.executable, "-m", "gallery_dl", *extra]


def looks_like_path(line: str) -> bool:
    if line.startswith("#") or " " in line and not os.path.sep in line and "\\" not in line:
        return False
    ext = os.path.splitext(line.split("?", 1)[0])[1].lower()
    if ext == ".json":
        return False
    return ext in MEDIA_EXTS or os.path.sep in line or "\\" in line


def ensure_gallery_dl() -> Optional[str]:
    try:
        subprocess.run(gallery_dl_cmd("--version"), capture_output=True, check=True)
    except FileNotFoundError:
        return "无法启动 gallery-dl。开发环境请执行: pip install gallery-dl"
    except subprocess.CalledProcessError as e:
        return f"gallery-dl 无法运行: {e}"
    return None


def apply_date_range(
    extractor_cfg: Dict,
    start_date: Optional[str],
    end_date: Optional[str],
) -> Optional[str]:
    if not start_date and not end_date:
        return None
    start_day, end_day, swapped = order_days(parse_day(start_date), parse_day(end_date))
    status = None
    if swapped:
        status = "起始日晚于结束日，已按从早到晚对调。"
    if start_day:
        after = day_start_utc(start_day) - timedelta(seconds=1)
        extractor_cfg["date-after"] = after.strftime("%Y-%m-%dT%H:%M:%S")
    if end_day:
        before = day_end_exclusive_utc(end_day)
        extractor_cfg["date-before"] = before.strftime("%Y-%m-%dT%H:%M:%S")
    return status


def date_range_status(start_date: Optional[str], end_date: Optional[str]) -> Optional[str]:
    if not start_date and not end_date:
        return None
    start_day, end_day, _ = order_days(parse_day(start_date), parse_day(end_date))
    return f"日期范围: {start_day or '不限'} ~ {end_day or '不限'}（含首尾）"


def build_gallery_dl_config(
    output_dir: str,
    platform: str,
    platform_cfg: Dict,
    concurrent: int,
    postprocessors: Optional[List[Dict]] = None,
) -> Dict:
    config = {
        "extractor": {
            "base-directory": output_dir,
            platform: platform_cfg,
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
    if postprocessors:
        config["postprocessors"] = postprocessors
    return config


def write_gallery_dl_config(config: Dict, prefix: str = "social-archiver-gdl-") -> str:
    fd, config_path = tempfile.mkstemp(prefix=prefix, suffix=".json")
    os.close(fd)
    with open(config_path, "w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2)
    return config_path


def remove_gallery_dl_config(config_path: Optional[str]) -> None:
    if not config_path:
        return
    try:
        os.remove(config_path)
    except OSError:
        pass


@dataclass
class GalleryDlStats:
    total: int = 0
    skipped: int = 0
    fatal_msg: Optional[str] = None


def iter_gallery_dl_download(
    cmd: List[str],
    stats: GalleryDlStats,
    map_error: Callable[[str], Optional[str]],
    fatal_empty_msg: str,
) -> Iterator[Dict]:
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    assert process.stdout is not None
    try:
        for raw in process.stdout:
            line = raw.strip()
            if not line:
                continue
            lowered = line.lower()
            if "skipping" in lowered or "# skip" in lowered:
                stats.skipped += 1
                yield {"type": "status", "msg": line}
                continue
            if looks_like_path(line):
                stats.total += 1
                filename = os.path.basename(line.replace("\\", "/"))
                yield {
                    "type": "progress",
                    "file": filename,
                    "current": stats.total,
                    "total": stats.total,
                    "percent": 100.0,
                }
                yield {"type": "status", "msg": f"已下载: {filename}"}
                continue
            mapped = map_error(line)
            if mapped:
                stats.fatal_msg = mapped
                yield {"type": "error", "msg": mapped}
                process.kill()
                break
            yield {"type": "status", "msg": line}

        process.wait()
        if not stats.fatal_msg and process.returncode not in (0, None) and stats.total == 0:
            stats.fatal_msg = fatal_empty_msg
            yield {"type": "error", "msg": fatal_empty_msg}
        elif process.returncode not in (0, None) and stats.total > 0:
            yield {
                "type": "status",
                "msg": f"gallery-dl 退出码 {process.returncode}，将整理已下载文件。",
            }
    except Exception as e:
        stats.fatal_msg = str(e)
        yield {"type": "error", "msg": str(e)}
