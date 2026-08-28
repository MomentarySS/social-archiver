"""Build icons/icon.ico from icons/social-archiver-icon-1024.png."""
from __future__ import annotations

from pathlib import Path

from PIL import Image


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    icons_dir = root / "icons"
    src = icons_dir / "social-archiver-icon-1024.png"
    dest = icons_dir / "icon.ico"

    if not src.is_file():
        raise SystemExit(f"Missing icon source: {src}")

    img = Image.open(src).convert("RGBA")
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    resized = [img.resize(size, Image.Resampling.LANCZOS) for size in sizes]
    resized[-1].save(dest, format="ICO", sizes=sizes)
    print(dest)


if __name__ == "__main__":
    main()
