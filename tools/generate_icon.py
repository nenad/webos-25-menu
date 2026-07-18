#!/usr/bin/env python3
"""Generate the dependency-free neutral application icon."""

from __future__ import annotations

import binascii
import struct
import zlib
from pathlib import Path

SIZE = 256
OUTPUT = Path(__file__).resolve().parents[1] / "app" / "assets" / "icon.png"


def inside_polygon(x: int, y: int, points: list[tuple[int, int]]) -> bool:
    inside = False
    previous = points[-1]
    for current in points:
        x1, y1 = previous
        x2, y2 = current
        if (y1 > y) != (y2 > y):
            crossing = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < crossing:
                inside = not inside
        previous = current
    return inside


def chunk(kind: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", binascii.crc32(kind + data) & 0xFFFFFFFF)
    )


def main() -> None:
    roof = [(47, 126), (128, 53), (209, 126), (191, 145), (128, 88), (65, 145)]
    body = [(72, 128), (184, 128), (184, 207), (146, 207), (146, 158), (110, 158), (110, 207), (72, 207)]
    rows = []

    for y in range(SIZE):
        row = bytearray([0])
        for x in range(SIZE):
            distance = ((x - 62) ** 2 + (y - 52) ** 2) ** 0.5
            glow = max(0.0, 1.0 - distance / 270.0)
            red = int(12 + 22 * glow)
            green = int(27 + 68 * glow)
            blue = int(48 + 96 * glow)

            if inside_polygon(x, y, roof) or inside_polygon(x, y, body):
                red, green, blue = 235, 247, 255

            row.extend((red, green, blue, 255))
        rows.append(bytes(row))

    header = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
        + chunk(b"IEND", b"")
    )
    OUTPUT.write_bytes(png)


if __name__ == "__main__":
    main()
