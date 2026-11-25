# The equation cloud (assets/img/cloud.webp), painted in the style of the clouds in the user's deck picture
# (art/background/new_background.png), so it reads as a cloud of that world and not a sticker laid on top.
# Repainted 25 Nov 2026 (user: "fix the cloud… it should look good"): the old one was a stack of airbrushed round
# balls on a flat plate. This one follows the deck clouds closely:
#   • shape: one big dome (a little wider than tall) just right of the middle, puffs of different sizes stepping down
#     on each side, a flat underside that runs out into long thin wisps with pointed tips at both ends
#   • colour: two-tone, like the deck clouds: a bright white cap on each puff where the sun hits (top right, the
#     game's SUN in src/32_scenery.js), a soft sky-blue below it, a clean soft step between the two (not airbrushed)
#   • depth: the puffs overlap, back to front; each front puff casts a soft blue shade on the puff behind it, so its
#     edge shows as a light scallop on blue, as in the deck clouds. The lower front puffs are blue with a light lip
#   • no outline; a clean edge; the shade keeps a touch of the sky's own blue (it is far away)
# Its body is sized for the equation: in #cloud box px the equation's box (EqUI.maxW × maxH = 440 × 124, centred on
# #eqBox 328,178) sits inside the cloud; tools check: it prints the solid span of each row.
# The puffs' list is mirrored (as circles) by CLOUD_PUFFS in src/30_stage.js, which cuts the cloudburst's pieces.
# Then re-run tools/cloud_rim.py on the new picture (its warm rim light is laid exactly over it).
# Run: ~/.cache/bj-voices/venv/bin/python tools/paint_cloud.py [out.webp]   (Pillow + numpy + scipy; cwebp on PATH)
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'img', 'cloud.webp')

W, H = 760, 281      # the art's box (#cloud .cl in src/00_head.html), in art px
S = 2                # saved at 2× (sharp on retina)
SS = 3               # supersampling for clean edges
K = S * SS
BASE = 262           # the flat underside (art px from the top of the box)

# the deck clouds' colours (sampled from art/background/new_background_2x.png)
LIGHT = np.array([255, 255, 255], np.float32)   # sunlit white
CAP = np.array([244, 250, 255], np.float32)     # the white cap away from its brightest spot
LOWCAP = np.array([216, 238, 253], np.float32)  # the cap of a puff low in the cloud (it gets less sun)
SHADE = np.array([196, 230, 252], np.float32)   # the soft blue of the shaded side
DEEP = np.array([168, 214, 248], np.float32)    # tucked in under a puff in front
SKY = np.array([30, 172, 253], np.float32)      # the sky behind it (bg_sky near the cloud)
SUN = np.array([0.30, -0.78, 0.55]); SUN /= np.linalg.norm(SUN)  # from the top right, toward the viewer (y down)

# puffs, back to front: centre x, y, half width, half height (art px). The dome is at the back; each later puff sits
# in front of the ones before it.
PUFFS = [
    (392, 122, 120, 110),                         # the dome
    (250, 164, 94, 86), (536, 160, 92, 88),       # the big puffs either side of it
    (166, 206, 64, 56), (636, 212, 58, 50),       # the shoulders
    (112, 244, 32, 26), (682, 246, 28, 22),       # small puffs where the wisps begin
    (236, 256, 56, 42), (398, 252, 78, 50),       # low puffs in front, sunk in the body: only their tops show
    (560, 258, 58, 40),
]
# the wisps along the flat underside: from x0 to x1, how thick in the middle; they lie behind the puffs
WISPS = [(2, 330, 17), (430, 758, 16), (120, 640, 24)]

h, w = H * K, W * K
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
X = (xx + 0.5) / K; Y = (yy + 0.5) / K  # art px
del xx, yy
# a gentle wave on the flat underside, so it is not ruler-straight
base_y = BASE + 1.2 * np.sin(X / 41.0) + 0.6 * np.sin(X / 15.0 + 1.3)
EDGE = 1.3  # anti-alias width (art px)


def smooth(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def over(col, cov, c2, a2):  # paint colour c2 with coverage a2 over (col, cov)
    col += (c2 - col) * a2[..., None]
    cov += (1 - cov) * a2
    return col, cov


col = np.zeros((h, w, 3), np.float32) + SHADE
cov = np.zeros((h, w), np.float32)

# 1) the wisps, behind everything: a thin lens on the underside, pointed at both ends, its tips lifting a little
for (x0, x1, th) in WISPS:
    cx, hw = (x0 + x1) / 2, (x1 - x0) / 2
    u = (X - cx) / hw
    inn = np.abs(u) < 1
    prof = np.clip(1 - u * u, 0, 1) ** 1.25 * th          # thickness along it (0 at the tips)
    mid = base_y + 2.5 - 3.0 * u * u                        # its centre line (the tips curl up a touch)
    top, bot = mid - prof * 0.8, mid + prof * 0.2
    d = np.minimum(Y - top, bot - Y)
    a = np.clip(d / EDGE + 0.5, 0, 1) * inn
    tt = np.clip((Y - top) / (prof + 1e-3), 0, 1)           # 0 on its top edge, 1 at its bottom
    c = SHADE + (CAP - SHADE) * (0.75 * (1 - tt) ** 2)[..., None]
    col, cov = over(col, cov, c, a)

# 2) the puffs, back to front. A puff is round on top; below its middle its sides curve in much more gently and run
#    down into the flat underside (an egg with its bottom cut flat), so no puff shows a round bottom: under their tops
#    the puffs melt into one body, as in the deck clouds. Down that body every puff turns the same soft blue, so only
#    the tops of the puffs show, as light scallops
def body(Yv):  # the one blue of the cloud's body at height Yv: lighter higher up
    k = smooth(150, BASE, Yv)[..., None]
    return SHADE + (DEEP - SHADE) * (0.35 * k)


for i, (cx, cy, rx, ry) in enumerate(PUFFS):
    u = (X - cx) / rx
    bot = max(BASE - cy, 1) * 1.25                       # the lower half's depth (it reaches the underside)
    v = np.where(Y < cy, (Y - cy) / ry, (Y - cy) / bot)
    r2 = u * u + v * v
    rr = np.sqrt(r2)
    # signed distance to the edge, in art px (close enough for a soft edge)
    dist = (1 - rr) * np.where(Y < cy, min(rx, ry), min(rx, bot))
    a = np.clip(dist / EDGE + 0.5, 0, 1) * smooth(-EDGE, EDGE, base_y - Y)  # cut flat on the underside
    if not a.any():
        continue
    # a front puff's soft shade on what is behind it, just outside its top edge
    if i > 0:
        sh = smooth(14, 0, -dist) * (dist < 0.5) * cov * smooth(cy + 0.55 * ry, cy + 0.05 * ry, Y)
        col += (DEEP - col) * (0.38 * sh)[..., None]
    # its shading as a soft dome, lit from the top right (the lower half's normal turns down slowly)
    vv = np.where(Y < cy, v, v * 0.7)
    nz = np.sqrt(np.clip(1 - u * u - vv * vv, 0, 1)) * 1.1
    n = np.stack([u, vv, nz]); n /= np.linalg.norm(n, axis=0) + 1e-6
    lit = n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]
    # how high the puff sits in the cloud: low puffs get a paler cap
    low = np.clip((cy - 150) / 90, 0, 1)
    cap = CAP + (LOWCAP - CAP) * low
    hi = smooth(0.55, 0.95, lit)[..., None] * (1 - 0.75 * low)   # the brightest spot, toward the sun
    capc = cap + (LIGHT - cap) * hi
    # the step from the white cap to the blue, as in the deck clouds: the white runs right up to the puff's top edge,
    # the blue lies under it along a smile-shaped line (a little lower on the sun's side); soft but clear. It sits
    # higher on puffs low in the cloud
    nz0 = np.sqrt(np.clip(1 - u * u - vv * vv, 0, 1))
    score = 0.7 * (-vv) + 0.2 * u + 0.35 * nz0 - 0.12 - 0.12 * low
    t = smooth(-0.06, 0.06, score)
    c = body(Y) + (capc - body(Y)) * t[..., None]
    # a thin light lip on the edge that faces the sun (the deck clouds' scallops read by it)
    lip = smooth(4, 0, dist) * (dist > -0.5) * smooth(0.0, 0.5, n[0] * 0.55 - n[1] * 0.85) * (Y < cy)
    c += (LIGHT - c) * ((0.3 - 0.18 * low) * lip)[..., None]
    col, cov = over(col, cov, c, a)

# 3) the flat underside: a soft blue band the last few px above it, so the bottom of every puff reads as one base
band = smooth(BASE - 16, BASE - 1, Y) * cov
col += (SHADE - col) * (0.55 * band)[..., None]

# far away: a touch of the sky's blue in the shade
lum = (col.mean(-1, keepdims=True) - 170) / 85
col += (SKY - col) * (0.045 * (1 - np.clip(lum, 0, 1)))

# downsample (premultiplied) to the saved size
pm = np.concatenate([col * cov[..., None], cov[..., None] * 255], -1)
pm = pm.reshape(H * S, SS, W * S, SS, 4).mean((1, 3))
a = pm[..., 3:] / 255
rgb = np.where(a > 1e-4, pm[..., :3] / np.maximum(a, 1e-4), 0)
img = np.concatenate([np.clip(rgb, 0, 255), np.clip(pm[..., 3:], 0, 255)], -1).astype(np.uint8)

# where the equation goes: the solid span of each row (art px), to check against #eqBox / EqUI.maxW, maxH
al = img[..., 3] / 255.0
for y in range(90, 261, 20):
    xs = np.where(al[int(y * S)] > 0.98)[0]
    print('row', y, 'solid', (round(xs.min() / S), round(xs.max() / S)) if len(xs) else None)

with tempfile.TemporaryDirectory() as td:
    png = os.path.join(td, 'cloud.png')
    Image.fromarray(img, 'RGBA').save(png)
    if OUT.endswith('.png'):
        Image.fromarray(img, 'RGBA').save(OUT)
    else:
        subprocess.run(['cwebp', '-quiet', '-q', '90', '-alpha_q', '100', '-exact', png, '-o', OUT], check=True)
print('wrote', OUT, img.shape[1], 'x', img.shape[0])
