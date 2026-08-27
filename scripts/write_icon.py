"""Write a small Social Archiver .ico (saffron disc on dark)."""
from __future__ import annotations

import struct
import zlib
from pathlib import Path


def png_rgba(width: int, height: int, pixels: bytes) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    raw = b""
    stride = width * 4
    for y in range(height):
        raw += b"\x00" + pixels[y * stride : (y + 1) * stride]
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def disc_pixels(size: int) -> bytes:
    cx = cy = (size - 1) / 2
    radius = size * 0.38
    out = bytearray()
    for y in range(size):
        for x in range(size):
            dx = x - cx
            dy = y - cy
            if dx * dx + dy * dy <= radius * radius:
                out.extend((255, 130, 0, 255))
            else:
                out.extend((17, 17, 17, 255))
    return bytes(out)


def ico_from_pngs(pngs: list[tuple[int, bytes]]) -> bytes:
    count = len(pngs)
    offset = 6 + 16 * count
    entries = b""
    payload = b""
    for size, data in pngs:
        entries += struct.pack(
            "<BBBBHHII",
            size if size < 256 else 0,
            size if size < 256 else 0,
            0,
            0,
            1,
            32,
            len(data),
            offset,
        )
        payload += data
        offset += len(data)
    return struct.pack("<HHH", 0, 1, count) + entries + payload


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    dest = root / "icons" / "icon.ico"
    dest.parent.mkdir(parents=True, exist_ok=True)
    pngs = []
    for size in (16, 32, 48, 256):
        pngs.append((size, png_rgba(size, size, disc_pixels(size))))
    dest.write_bytes(ico_from_pngs(pngs))
    print(dest)


if __name__ == "__main__":
    main()
