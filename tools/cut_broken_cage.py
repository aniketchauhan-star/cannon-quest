# The broken cage that stands behind the dancing x on the end screen, cut from the user's own picture of x free by
# its broken cage (art/sprite_sheets/x_moods/free.png, made in ChatGPT on 23 Nov 2026) → assets/img/cage_broken.webp.
# (The user, 25 Nov 2026: "X should be dancing in the between, and the cage behind of the X. And cage is in broken".)
#
# In the picture x stands right of the cage, its glove reaching in front of the cage's middle, its body over the
# cage's right edge. Here x is taken out (its body, outline, arm and glove: the one big blob of not-gold colour) and
# what it hid is put back:
#   • the dome and the middle ring: the right half is the left half, mirrored (x's body hid the right edge; the two
#     halves differ by up to 10 px, so a patchwork of both would show seams)
#   • the base ring's end, hidden by x's body: the left end, mirrored
#   • between the rings (the cage's front is broken open there): NOT mirrored (the bars differ each side: two are
#     bent and broken). A bar seen above and below the glove or arm is joined top to bottom; the rest is the hole
#   • the loose bars and the bolt on the floor stay, as drawn
# ChatGPT's alpha is never quite solid (250–254) and leaves a faint haze: solid becomes solid, the haze goes.
# It prints the picture's size and where its foot is (the base ring's bottom and the floor pieces), for EndX.
# Run: ~/.cache/bj-voices/venv/bin/python tools/cut_broken_cage.py [--debug DIR]   (Pillow + numpy + scipy; cwebp)
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'sprite_sheets', 'x_moods', 'free.png')
OUT = os.path.join(ROOT, 'assets', 'img', 'cage_broken.webp')
DEBUG = sys.argv[sys.argv.index('--debug') + 1] if '--debug' in sys.argv else None

ROI = (0, 330, 470, 1100)        # x0, y0, x1, y1: the cage and the bits on the floor (source px)
CX = 216.5                       # the cage's middle: its dome's ball (columns 169–264)
RING = (540, 600)                # rows of the middle ring (its lower edge is found column by column below 600 + 20)
RING_MID = 570                   # a row through the middle ring all along it
BASE = 870                       # the base ring's top: from here down, what the body hid is mirrored
FLOOR = 962                      # below this row nothing is mirrored (the loose bars on the floor differ each side)


def clean(a):
    out = a.copy()
    out[..., 3] = np.clip((a[..., 3] - 6) / (238 - 6), 0, 1) * 255
    out[..., :3] = np.where(out[..., 3:] > 0, out[..., :3], 0)
    return out


def main():
    A = clean(np.array(Image.open(SRC).convert('RGBA')).astype(np.float32))
    h, w = A.shape[:2]
    R, G, B, al = A[..., 0], A[..., 1], A[..., 2], A[..., 3]
    opaque = al > 0
    warm = opaque & (R - B > 40)                       # gold, its shading and its brown outline
    # x: the big blob of not-gold colour (purple body, its dark outline, the black arm, the white glove)
    lab, _ = nd.label(opaque & ~warm)
    xm = lab == lab[600, 700]                          # (a point in x's body)
    xm = nd.binary_dilation(xm, iterations=4) & opaque  # (and the blended rim where it met the gold)
    x0, y0, x1, y1 = ROI
    roi = np.zeros((h, w), bool); roi[y0:y1, x0:x1] = True
    hid = xm & roi
    pm = A.copy(); pm[..., :3] *= pm[..., 3:] / 255      # (premultiplied: blends keep clean edges)
    pm[~roi] = 0; pm[hid] = 0
    src = pm.copy()                                       # what x left visible
    known = ~hid
    mir = lambda x: int(round(2 * CX - x))
    # 1) the dome and the middle ring: the right half is the left half, mirrored (the two halves differ by up to
    #    10 px, so a patchwork of the two would show seams); down to the ring's lower edge, column by column
    # (the ring's lower edge: measured where a gap shows under it on the left, then a smooth curve, the same both
    # sides; where a bar hangs from it the ring and the bar are one run of gold, so it can't be measured there)
    warmv = (A[..., 0] - A[..., 2] > 40) & (A[..., 3] > 120) & ~hid
    us, bs = [], []
    for x in range(12, int(CX) - 14):
        col = warmv[:, x]
        if not col[RING_MID]: continue
        e = RING_MID
        while col[e + 1]: e += 1                    # (the end of the run of gold through the ring's middle row…)
        if e < RING[1] + 20 and not col[e + 1:e + 6].any():  # (…with a gap under it, not a bar)
            us.append(x - CX); bs.append(e)
    c2, c0 = np.polyfit(np.square(us), bs, 1)
    ringbot = {x: int(round(c0 + c2 * (x - CX) ** 2)) + 1 for x in range(x0, x1)}
    print(f'ring edge: {len(us)} columns, row {c0:.1f} at the middle, {c0 + c2 * 190 ** 2:.1f} at 190 px out')
    for x in range(int(CX) + 1, x1):
        xs = mir(x)
        if xs < 0: continue
        rb = ringbot[x]
        ok = known[y0:rb + 1, xs]
        pm[y0:rb + 1, x] = np.where(ok[:, None], src[y0:rb + 1, xs], 0)
        known[y0:rb + 1, x] = ok
    # (left of the middle, under the thumb: the other side, where it shows)
    for y, x in zip(*np.nonzero(hid[:RING[1] + 20, : int(CX) + 1])):
        if known[y, mir(x)] and not hid[y, mir(x)]:
            pm[y, x] = src[y, mir(x)]; known[y, x] = True
    # 2) the base ring: what the body hid is the left end, mirrored (it is the same both sides), blended into the
    #    right end over 12 px, so no seam shows where they meet
    zone = np.zeros((h, w), bool); zone[BASE:FLOOR, int(CX) + 1:x1] = True
    near = nd.distance_transform_edt(~(hid & zone))
    for y, x in zip(*np.nonzero(zone & (near < 12))):
        xs = mir(x)
        if not (0 <= xs < w) or hid[y, xs]: continue
        if hid[y, x]:
            pm[y, x] = src[y, xs]; known[y, x] = True
        else:
            k = near[y, x] / 12
            pm[y, x] = src[y, x] * k + src[y, xs] * (1 - k)
    known[zone & hid] = True
    pm[zone & hid & (near == 0) & (pm[..., 3] == 0)] = 0
    # 3) the bars between the rings: a bar seen above and below what x hid is joined top to bottom (they run
    #    straight down); anything else there is the open hole where the bars broke (a bar whose top x hid right up to
    #    the ring stays broken off: the bent one under the glove)
    for x in range(x0, x1):
        y = ringbot[x] + 1
        while y < BASE:
            if known[y, x]:
                y += 1; continue
            ya = y
            while y < BASE and not known[y, x]: y += 1
            top, bot = pm[ya - 1, x], pm[y, x]
            if top[3] > 200 and bot[3] > 200 and ya - 1 > ringbot[x] + 3:
                k = ((np.arange(ya, y) - (ya - 1)) / (y - ya + 1))[:, None]
                pm[ya:y, x] = top * (1 - k) + bot * k
            else:
                pm[ya:y, x] = 0
            known[ya:y, x] = True
    # 4) what is left (the ring's lower edge under the thumb): joined across, row by row
    for y in range(RING[0], RING[1] + 20):
        x = x0
        while x < x1:
            if known[y, x]:
                x += 1; continue
            xa = x
            while x < x1 and not known[y, x]: x += 1
            le, ri = pm[y, xa - 1], pm[y, min(x, w - 1)]
            k = ((np.arange(xa, x) - (xa - 1)) / (x - xa + 1))[:, None]
            pm[y, xa:x] = le * (1 - k) + ri * k if le[3] > 200 and ri[3] > 200 else 0
            known[y, xa:x] = True
    pm[hid & ~known] = 0
    a = pm[..., 3:]
    out = np.concatenate([np.where(a > 0, pm[..., :3] * 255 / np.maximum(a, 1e-3), 0), a], axis=2)
    # only the cage and its pieces: drop specks
    lab, n = nd.label(out[..., 3] > 40)
    sizes = nd.sum(np.ones_like(lab), lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 200])
    keep = nd.binary_dilation(keep, iterations=2)
    out[~keep] = 0
    # trim, with a little clear space round it
    ys, xs = np.nonzero(out[..., 3] > 8)
    pad = 6
    t, b, l, r = ys.min() - pad, ys.max() + 1 + pad, xs.min() - pad, xs.max() + 1 + pad
    out = out[t:b, l:r]
    # its foot: the base ring's lowest row, and the floor pieces' (they lie in front, lower down)
    al = out[..., 3] > 128
    cage_rows = np.nonzero(al[:, : int(CX - l + 120)].any(axis=1))[0]
    lab, n = nd.label(al)
    big = max(range(1, n + 1), key=lambda i: (lab == i).sum())
    cy, cx_ = np.nonzero(lab == big)
    print(f'cage_broken.webp {out.shape[1]}x{out.shape[0]}; cage body: x {cx_.min()}–{cx_.max()}, '
          f'top {cy.min()}, foot {cy.max()}; middle (dome ball) at x {CX - l:.1f}; lowest piece {cage_rows.max()}')
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA')
    with tempfile.TemporaryDirectory() as td:
        png = os.path.join(td, 'c.png'); img.save(png)
        subprocess.run(['cwebp', '-quiet', '-q', '90', '-alpha_q', '100', '-m', '6', '-sharp_yuv', png, '-o', OUT], check=True)
    if DEBUG:
        img.save(os.path.join(DEBUG, 'cage_broken.png'))
        bg = Image.new('RGBA', img.size, (40, 200, 90, 255)); bg.alpha_composite(img)
        bg.convert('RGB').save(os.path.join(DEBUG, 'cage_broken_on_green.png'))
    print(f'{os.path.getsize(OUT) // 1024} KB → {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
