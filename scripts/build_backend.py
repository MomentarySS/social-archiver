"""Freeze backend/cli.py + gallery-dl into build-backend/backend/backend.exe."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "build-backend"


def main() -> None:
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onedir",
        "--name",
        "backend",
        "--console",
        "--collect-all",
        "gallery_dl",
        "--hidden-import",
        "backend",
        "--hidden-import",
        "backend.cli",
        "--hidden-import",
        "backend.downloader",
        "--hidden-import",
        "backend.weibo",
        "--hidden-import",
        "backend.twitter",
        "--hidden-import",
        "backend.instagram",
        "--hidden-import",
        "backend.metadata",
        "--hidden-import",
        "backend.daterange",
        "--paths",
        str(ROOT),
        "--distpath",
        str(DIST),
        "--workpath",
        str(DIST / "work"),
        "--specpath",
        str(DIST),
        str(ROOT / "backend" / "cli.py"),
    ]
    print(" ".join(cmd))
    subprocess.check_call(cmd, cwd=ROOT)
    exe = DIST / "backend" / "backend.exe"
    if not exe.exists():
        raise SystemExit(f"missing {exe}")
    print(f"backend ready: {exe}")


if __name__ == "__main__":
    main()
