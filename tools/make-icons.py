#!/usr/bin/env python3
"""Generate the app icons for Brush: the pixel tooth mascot on an orange tile.

Development-only: run it once, commit the PNGs, forget about it. The app
itself never touches this file.

Neither Pillow nor cairosvg nor Node is installed on this machine, so the
PNGs are written by hand with zlib and struct from the standard library.
The tooth is drawn at a whole number of screen pixels per sprite pixel so it
stays crisp; only the rounded corners are smoothed, by 3x supersampling.

    python3 tools/make-icons.py
"""

import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")

BACKGROUND = (0xFF, 0x85, 0x52)   # the orange of the Start button

# The same sprite as TOOTH in app.js. O outline, W tooth, K eyes and mouth, P blush.
TOOTH = [
    "................",
    "..OOOO....OOOO..",
    ".OWWWWO..OWWWWO.",
    "OWWWWWWOOWWWWWWO",
    "OWWWWWWWWWWWWWWO",
    "OWWKKWWWWWWKKWWO",
    "OWWKKWWWWWWKKWWO",
    "OWPPWWKWWKWWPPWO",
    "OWPPWWWKKWWWPPWO",
    "OWWWWWWWWWWWWWWO",
    ".OWWWWWWWWWWWWO.",
    ".OWWWWWWWWWWWWO.",
    ".OWWWWOOOOWWWWO.",
    ".OWWWO....OWWWO.",
    "..OWWO....OWWO..",
    "...OO......OO...",
]

COLOURS = {
    "O": (0x14, 0x11, 0x0F),
    "K": (0x14, 0x11, 0x0F),
    "W": (0xFF, 0xF6, 0xE9),
    "P": (0xFF, 0x7D, 0xC2),
}

SS = 3                            # supersampling factor per axis, for the corners


def rounded_rect(x, y, x0, y0, x1, y1, r):
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def sprite_box():
    """Rows and columns the tooth actually occupies, so it can be centred."""
    rows = [y for y, row in enumerate(TOOTH) if row.strip(".")]
    cols = [x for row in TOOTH for x, ch in enumerate(row) if ch != "."]
    return min(cols), min(rows), max(cols) + 1, max(rows) + 1


def render(size, rounded, fill):
    """Return RGBA bytes for one icon. fill is the tooth's share of the width."""
    bx0, by0, bx1, by1 = sprite_box()
    cell = max(1, round(size * fill / (bx1 - bx0)))       # screen px per sprite px
    ox = (size - (bx1 - bx0) * cell) // 2 - bx0 * cell
    oy = (size - (by1 - by0) * cell) // 2 - by0 * cell

    buf = bytearray(size * size * 4)
    corner = 0.22
    inv = 1.0 / (size * SS)

    for py in range(size):
        sy_cell = (py - oy) // cell
        for px in range(size):
            sx_cell = (px - ox) // cell
            colour = BACKGROUND
            if 0 <= sy_cell < len(TOOTH) and 0 <= sx_cell < len(TOOTH[0]):
                colour = COLOURS.get(TOOTH[sy_cell][sx_cell], BACKGROUND)

            if rounded:
                hits = 0
                for sy in range(SS):
                    y = (py * SS + sy + 0.5) * inv
                    for sx in range(SS):
                        x = (px * SS + sx + 0.5) * inv
                        if rounded_rect(x, y, 0.0, 0.0, 1.0, 1.0, corner):
                            hits += 1
                alpha = hits / (SS * SS)
            else:
                alpha = 1.0

            i = (py * size + px) * 4
            buf[i], buf[i + 1], buf[i + 2] = colour
            buf[i + 3] = int(round(alpha * 255))

    return bytes(buf)


# ── Minimal PNG encoder ──────────────────────────────────────────────────

def write_png(path, size, rgba):
    stride = size * 4
    raw = b"".join(b"\x00" + rgba[y * stride:(y + 1) * stride] for y in range(size))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))

    with open(path, "wb") as fh:
        fh.write(png)


# iOS composites transparency onto black and applies its own squircle mask, so
# apple-touch-icon must be a full opaque square. Maskable icons must be
# full-bleed too, with the artwork kept inside the central safe zone.
SPECS = [
    ("icon-180.png",          180, False, 0.72),   # apple-touch-icon
    ("icon-192.png",          192, True,  0.72),
    ("icon-512.png",          512, True,  0.72),
    ("icon-512-maskable.png", 512, False, 0.50),
]

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, size, rounded, fill in SPECS:
        path = os.path.join(OUT, name)
        write_png(path, size, render(size, rounded, fill))
        print("%-24s %4dpx  %6.1f kB" % (name, size, os.path.getsize(path) / 1024))
