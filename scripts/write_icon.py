"""Build icons/icon.ico from icons/social-archiver-icon-1024.png."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image


def prepare_icon(img: Image.Image) -> Image.Image:
    """Strip AI-generated white canvas and crop to the glyph."""
    img = img.convert("RGBA")
    data = np.array(img)
    r, g, b = data[:, :, 0], data[:, :, 1], data[:, :, 2]
    light = (r > 220) & (g > 220) & (b > 220)
    data[light, 3] = 0
    img = Image.fromarray(data)
    bbox = img.getbbox()
    if not bbox:
        return img
    cropped = img.crop(bbox)
    side = max(cropped.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(cropped, ((side - cropped.width) // 2, (side - cropped.height) // 2))
    return square.resize((1024, 1024), Image.Resampling.LANCZOS)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    icons_dir = root / "icons"
    src = icons_dir / "social-archiver-icon-1024.png"
    dest = icons_dir / "icon.ico"

    if not src.is_file():
        raise SystemExit(f"Missing icon source: {src}")

    img = prepare_icon(Image.open(src))
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    resized = [img.resize(size, Image.Resampling.LANCZOS) for size in sizes]
    resized[-1].save(dest, format="ICO", sizes=sizes)
    print(dest)


if __name__ == "__main__":
    main()
