# The cage that breaks when x is freed (CageBreak in src/30_stage.js): the game cuts its flying pieces (by clip-path)
# from this picture, the cage of cage_x.webp with x taken out, and the free x (xchar.webp) jumps out from where it was.
#   • x = its purple body (all of it: the two front bars split it into parts), the face inside it, the white gloves,
#     the dark arm stubs behind them, and a 2 px fringe of mixed edge pixels next to it (never the gold of a bar)
#   • the two front bars pass in front of x, so they stay. Where a glove hid a bar, the bar is filled in from just
#     above and below it (a bar is straight: each column blends its two ends)
#   • the cage's floor under x's feet is filled in smoothly from the floor round it (a Laplace fill)
#   • the rest of x's place is see-through: the back bars there were never seen, and the free x covers it while
#     the pieces fly off
# Run: ~/.cache/bj-voices/venv/bin/python tools/cut_cage_break.py [out.webp]   (Pillow + numpy + scipy; cwebp on PATH)
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'img', 'cage_x.webp')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'img', 'cage_empty.webp')
FLOOR = 188   # (px of cage_x) below this the cage's inside is its floor: solid gold, so x's feet leave no hole
GAP = 45      # a masked run this short (px) in a bar's column is a glove in front of the bar: filled in
BARS = [(46, 57), (144, 155)]  # the two front bars that pass in front of x (columns of cage_x, outline included)

A = np.array(Image.open(SRC).convert('RGBA')).astype(np.float32)
r, g, b, a = (A[..., i] for i in range(4))
h, w = a.shape
gold = (r > 140) & (g > 70) & (b < 150) & (r - b > 60) & (g > b + 25) & (a > 60)  # (the cage's gold: warm, far more green than blue)

# ---- x: every purple part (the bars cut it into pieces) and the face they enclose
purple = (b > g + 30) & (r > g + 10) & (a > 100)
lab, n = nd.label(purple)
sizes = nd.sum(purple, lab, range(1, n + 1))
body = nd.binary_fill_holes(np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 25]))
# the white gloves next to the body
white = (A[..., :3].min(-1) > 165) & (a > 120) & ~gold
lab, n = nd.label(white & ~body)
near = nd.binary_dilation(body, iterations=4)
gloves = np.isin(lab, [i for i in range(1, n + 1) if (near & (lab == i)).any() and (lab == i).sum() > 40])
gloves = nd.binary_fill_holes(nd.binary_closing(gloves, iterations=2))
# the dark arm stubs behind the gloves
dark = (A[..., :3].max(-1) < 100) & (a > 120) & ~gold
lab, n = nd.label(dark & ~body & ~gloves)
near = nd.binary_dilation(gloves, iterations=3) | nd.binary_dilation(body, iterations=2)
arms = np.isin(lab, [i for i in range(1, n + 1) if (near & (lab == i)).any() and (lab == i).sum() < 400])
X = body | gloves | arms
X |= nd.binary_dilation(X, iterations=2) & ~gold  # (the fringe of mixed pixels round it)
X |= (b > g - 5) & (a > 60) & ~gold & (np.arange(h)[:, None] > 100)  # (x's mauve shade on the floor between its feet: the cage's gold always has far less blue than green)

out = A.copy()
known = ~X
# ---- the front bars behind the gloves: short masked runs in a bar's column, between two solid cage pixels
for c in [c for lo, hi in BARS for c in range(lo, hi + 1)]:
    col = X[:, c]
    y = 0
    while y < h:
        if not col[y]:
            y += 1
            continue
        y0 = y
        while y < h and col[y]:
            y += 1
        y1 = y - 1  # the run is y0..y1
        if y1 - y0 + 1 <= GAP and y0 > 0 and y1 < h - 1 and a[y0 - 1, c] > 200 and a[y1 + 1, c] > 200:
            top, bot = A[y0 - 1, c], A[y1 + 1, c]
            for k, yy in enumerate(range(y0, y1 + 1)):
                t = (k + 1) / (y1 - y0 + 2)
                out[yy, c] = top * (1 - t) + bot * t
            known[y0:y1 + 1, c] = True

# ---- the floor under x's feet: a Laplace fill (each hole pixel becomes the mean of its neighbours, repeated)
hole = ~known & (np.arange(h)[:, None] >= FLOOR)
rgb = out[..., :3].copy()
fixed = known & (out[..., 3] > 200)  # (only the cage's own solid pixels feed the fill: never x's)
rgb[hole] = rgb[fixed & (np.arange(h)[:, None] >= FLOOR)].mean(0)  # (start from the floor's mean colour)
for _ in range(600):
    s = np.zeros_like(rgb)
    cnt = np.zeros((h, w, 1), np.float32)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        sh = np.roll(rgb, (dy, dx), (0, 1))
        ok = np.roll(fixed | hole, (dy, dx), (0, 1))[..., None].astype(np.float32)
        s += sh * ok
        cnt += ok
    rgb = np.where(hole[..., None], s / np.maximum(cnt, 1), rgb)
out[..., :3] = np.where(hole[..., None], rgb, out[..., :3])
out[..., 3] = np.where(hole, 255, out[..., 3])
known |= hole

# ---- the rest of x's place: see-through
out[..., 3] = np.where(known, out[..., 3], 0)
out[..., :3] = np.where(out[..., 3:] > 0, out[..., :3], 0)
img = np.clip(out, 0, 255).astype(np.uint8)

with tempfile.TemporaryDirectory() as td:
    png = os.path.join(td, 'cage_empty.png')
    Image.fromarray(img, 'RGBA').save(png)
    if OUT.endswith('.png'):
        Image.fromarray(img, 'RGBA').save(OUT)
    else:
        subprocess.run(['cwebp', '-quiet', '-q', '92', '-alpha_q', '100', '-exact', png, '-o', OUT], check=True)
print('wrote', OUT, w, 'x', h)
