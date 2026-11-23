# The equation cloud (assets/img/cloud.webp), painted in the style of the clouds in the user's deck picture
# (art/background/new_background.png), so it reads as a cloud of that world and not a sticker laid on top:
#   • the deck's cloud shape: one big dome in the middle, rounder puffs stepping down on each side, a flat base that
#     runs out into thin wisps at both ends
#   • the deck's colours, sampled from its clouds: white where the sun hits, a soft sky-blue (182,227,253) in the
#     shade, and the base all in that blue
#   • lit from the game's sun (top right, SUN in src/32_scenery.js): each puff is shaded as a soft sphere, and a puff
#     in front throws a soft blue shade on the one behind it, as in the deck clouds
#   • no outline; a clean, slightly soft edge; a touch of the sky's own blue mixed in (it is far away)
# Its body is sized for the equation: in #cloud box px the equation's box (EqUI.maxW × maxH = 470 × 126, centred on
# #eqBox 328,184) sits inside the cloud with a margin all round.
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
OX = 62              # the body is laid out in the old 636-wide box; the wisps run out 62 px past it each side
S = 2                # saved at 2× (sharp on retina)
SS = 3               # supersampling for clean edges
K = S * SS
BASE = 262           # the flat underside (art px from the top of the box)

LIGHT = np.array([253, 254, 255], np.float32)   # sunlit white
MID = np.array([232, 246, 254], np.float32)
SHADE = np.array([182, 227, 253], np.float32)   # the deck clouds' shade
DEEP = np.array([160, 212, 248], np.float32)    # where a puff is tucked behind another
SKY = np.array([30, 172, 253], np.float32)      # the sky behind it (bg_sky near the cloud)
SUN = np.array([0.62, -0.50, 0.60]); SUN /= np.linalg.norm(SUN)  # from the top right, toward the viewer

# puffs: centre x, y, radius (art px), and how far forward each sits (art px toward the viewer). The dome is at the
# back; the lower puffs sit in front of it, so where they meet there is a soft crease, as in the deck clouds.
PUFFS = [
    (330, 128, 118, 0),                             # the dome
    (200, 166, 84, 22), (462, 158, 88, 22),         # the big puffs either side of it
    (108, 206, 56, 40), (560, 204, 54, 40),         # the shoulders
    (36, 240, 24, 52), (612, 238, 22, 52),          # small puffs where the wisps begin
    (160, 230, 44, 58), (268, 224, 52, 58), (398, 222, 54, 58), (506, 228, 46, 58),  # low puffs in front
]
PUFFS = [(x + OX, y, r, z) for (x, y, r, z) in PUFFS]
# the flat base and its wisps: centre x, half width, half height (ellipses sitting on BASE)
WISPS = [(318 + OX, 330, 30), (64, 66, 15), (W - 60, 62, 15), (150, 104, 22), (W - 146, 100, 22)]

h, w = H * K, W * K
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
X = (xx + 0.5) / K; Y = (yy + 0.5) / K  # art px
# a gentle wave on the flat underside, so it is not ruler-straight
base_y = BASE + 1.4 * np.sin(X / 37.0) + 0.8 * np.sin(X / 13.0 + 1.3)
below = Y > base_y
edge = 1.5 / K  # AA width (art px)


def soft_in(d):  # d = signed distance in art px (+ inside) -> coverage 0..1
    return np.clip(d / edge + 0.5, 0, 1)


# 1) the puffs as one surface: each puff is a sphere pushed forward by its offset; the surface is their smooth
#    maximum, so puffs melt into each other with a soft crease where they meet
SOFT = 6.0
acc = np.zeros((h, w), np.float32); cov = np.zeros((h, w), np.float32)
zs = []
for (cx, cy, r, zo) in PUFFS:
    d2 = (X - cx) ** 2 + (Y - cy) ** 2
    z = np.sqrt(np.clip(r * r - d2, 0, None)) + zo
    z = np.where(d2 < r * r, z, -1e3)
    zs.append(z)
    cov = np.maximum(cov, soft_in(r - np.sqrt(d2)))
Z = np.stack(zs); zmax = Z.max(0)
Zs = zmax + SOFT * np.log(np.exp((Z - zmax) / SOFT).sum(0))
del Z, zs
inside = zmax > -1e2
Zs = np.where(inside, Zs, 0)
# normals from the surface (in art px), smoothed a little so creases stay soft
Zb = nd.gaussian_filter(Zs, 1.2 * K)
gy, gx = np.gradient(Zb, 1.0 / K)
n = np.stack([-gx, -gy, np.ones_like(gx)]); n /= np.linalg.norm(n, axis=0)
d = n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]
t = np.clip((d + 0.42) / 1.05, 0, 1); t = t * t * (3 - 2 * t)
# creases: where the surface dips between puffs, a soft blue shade (the deck clouds' tucked-in shade)
crease = np.clip((nd.gaussian_filter(Zs, 5 * K) - Zs) / 14.0, 0, 1) * inside
# lower in the cloud = more in its own shade (its underside is blue in the deck clouds)
low = np.clip((Y - (BASE - 72)) / 72, 0, 1) ** 1.2
t = t * (1 - 0.68 * low)
col = SHADE + (LIGHT - SHADE) * t[..., None]
col = col + (DEEP - col) * (0.55 * crease)[..., None]
cov = cov * (~below)

# 2) the flat base and its wisps, under the puffs: the deck clouds' light-blue band
for (cx, hw, hh) in WISPS:
    dx = (X - cx) / hw
    top = base_y - hh * np.sqrt(np.clip(1 - dx ** 2, 0, 1))
    dd = np.where(np.abs(dx) < 1, np.minimum(Y - top, base_y - Y), -1)
    c = soft_in(dd) * (np.abs(dx) < 1)
    tt = np.clip((Y - top) / (hh + 1e-3), 0, 1)
    bc = SHADE + (MID - SHADE) * (0.6 * (1 - tt))[..., None]
    fresh = c * (1 - cov)
    col = np.where(cov[..., None] > 0.5, col, col * (1 - fresh[..., None]) + bc * fresh[..., None])
    col = np.where((cov[..., None] <= 0.5) & (c[..., None] > 0), bc, col)
    cov = np.maximum(cov, c)

# far away: a touch of the sky's blue in the shade
lum = (col.mean(-1, keepdims=True) - 160) / 95
col = col + (SKY - col) * (0.05 * (1 - np.clip(lum, 0, 1)))

# downsample (premultiplied) to the saved size
pm = np.concatenate([col * cov[..., None], cov[..., None] * 255], -1)
pm = pm.reshape(H * S, SS, W * S, SS, 4).mean((1, 3))
a = pm[..., 3:] / 255
rgb = np.where(a > 1e-4, pm[..., :3] / np.maximum(a, 1e-4), 0)
img = np.concatenate([np.clip(rgb, 0, 255), np.clip(pm[..., 3:], 0, 255)], -1).astype(np.uint8)

with tempfile.TemporaryDirectory() as td:
    png = os.path.join(td, 'cloud.png')
    Image.fromarray(img, 'RGBA').save(png)
    if OUT.endswith('.png'):
        Image.fromarray(img, 'RGBA').save(OUT)
    else:
        subprocess.run(['cwebp', '-quiet', '-q', '90', '-alpha_q', '100', '-exact', png, '-o', OUT], check=True)
print('wrote', OUT, img.shape[1], 'x', img.shape[0])
