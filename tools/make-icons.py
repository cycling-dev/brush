#!/usr/bin/env python3
"""Generate the app icons for Brush.

Development-only: run it once, commit the PNGs, forget about it. The app
itself never touches this file.

Neither Pillow nor cairosvg nor Node is installed on this machine, so the
PNGs are written by hand with zlib and struct from the standard library.
Edges are smoothed by 3x supersampling.

    python3 tools/make-icons.py
"""

import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")

TOP = (0x14, 0x6E, 0x74)      # deep teal, top of the gradient
BOTTOM = (0x0B, 0x3F, 0x55)   # deep blue, bottom
TOOTH = (0xFF, 0xFF, 0xFF)

SS = 3                        # supersampling factor per axis


# ── Shapes, all in normalised 0..1 icon coordinates ──────────────────────

def rounded_rect(x, y, x0, y0, x1, y1, r):
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def tooth(u, v):
    """Tooth silhouette in its own 0..1 box: domed crown over two tapered roots.

    The crown is rounded hard at the top and only slightly at the bottom, so
    its sides run vertically into the roots with no visible step.
    """
    crown_bottom, r_top, r_bot = 0.58, 0.34, 0.08

    if v < crown_bottom:
        if v < r_top:
            cx, cy, r = min(max(u, r_top), 1.0 - r_top), r_top, r_top
        elif v > crown_bottom - r_bot:
            cx, cy, r = min(max(u, r_bot), 1.0 - r_bot), crown_bottom - r_bot, r_bot
        else:
            return 0.0 <= u <= 1.0
        if (u - cx) ** 2 + (v - cy) ** 2 <= r * r:
            return True

    if v >= 0.50:
        t = (v - 0.50) / 0.50
        inner = 0.02 + 0.21 * (t ** 0.75)
        outer = 0.50 - 0.16 * (t ** 1.4)
        d = abs(u - 0.5)
        return inner <= d <= outer
    return False


def render(size, rounded, tooth_scale):
    """Return RGBA bytes for one icon."""
    n = size * SS
    inv = 1.0 / n
    corner = 0.22

    # Tooth bounding box, scaled about the icon centre.
    bw, bh = 0.48 * tooth_scale, 0.62 * tooth_scale
    bx0, by0 = 0.5 - bw / 2, 0.5 - bh / 2

    # Pre-compute the background gradient per output row.
    grad = []
    for py in range(size):
        f = (py + 0.5) / size
        grad.append(tuple(int(TOP[c] + (BOTTOM[c] - TOP[c]) * f) for c in range(3)))

    buf = bytearray(size * size * 4)
    tr, tg, tb = TOOTH

    for py in range(size):
        gr, gg, gb = grad[py]
        row = py * size * 4
        for px in range(size):
            bg_hits = 0
            fg_hits = 0
            for sy in range(SS):
                y = (py * SS + sy + 0.5) * inv
                for sx in range(SS):
                    x = (px * SS + sx + 0.5) * inv
                    if rounded and not rounded_rect(x, y, 0.0, 0.0, 1.0, 1.0, corner):
                        continue
                    bg_hits += 1
                    if tooth((x - bx0) / bw, (y - by0) / bh):
                        fg_hits += 1

            i = row + px * 4
            if bg_hits == 0:
                continue                                  # fully transparent corner

            total = SS * SS
            alpha = bg_hits / total
            mix = fg_hits / bg_hits                       # tooth share of the covered area
            buf[i]     = int(gr + (tr - gr) * mix)
            buf[i + 1] = int(gg + (tg - gg) * mix)
            buf[i + 2] = int(gb + (tb - gb) * mix)
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
    ("icon-180.png",          180, False, 1.00),   # apple-touch-icon
    ("icon-192.png",          192, True,  1.00),
    ("icon-512.png",          512, True,  1.00),
    ("icon-512-maskable.png", 512, False, 0.68),
]

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, size, rounded, scale in SPECS:
        path = os.path.join(OUT, name)
        write_png(path, size, render(size, rounded, scale))
        print("%-24s %4dpx  %6.1f kB" % (name, size, os.path.getsize(path) / 1024))
