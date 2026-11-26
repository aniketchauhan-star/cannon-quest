# The equation cloud (assets/img/cloud.webp).
# 26 Nov 2026, the user sent the cloud they want ("make cloud like this i want": a glossy cartoon cumulus on a blue
# sky; it came only as a chat picture, so it is painted here after it). Earlier the same day: "fix the string of the
# cloud… it should blend with the background", then "the downside of the cloud is like we cut that… it should come
# properly… like the cloud is really in the sky". So, as in their picture:
#   • shape: one whole cloud, round all the way round: a big dome a little left of the middle, a smaller puff on its
#     left and one on its right, big round puffs low at both ends, two puffs in the middle, and a belly of round
#     bumps underneath (the lowest in the middle). Their places are the picture's (REF, in its pixels), drawn 1.45×
#     wider than tall (WIDE), so the equation fits in it while the cloud floats in the band of sky between the question
#     board and the far hills
#   • look: one soft white body (the puffs melt together, as in the picture), lit from above: a glossy highlight just
#     inside its upper edges, a soft sky-blue low in the cloud, deepest along its underside and the lower edge of each
#     bump; a soft blue crease along the top of a puff that sits in front of another; a clean edge, no outline
# Its body is sized for the equation: in #cloud box px the equation (EqUI.maxW × maxH, centred on #eqBox) sits inside
# the cloud; the tool prints the cloud's top and bottom and the solid span of each row to check it.
# The puffs are mirrored (as circles, back to front) by CLOUD_PUFFS in src/30_stage.js, which cuts the cloudburst's
# pieces, and CLOUD_ART.base / mid there follow its bottom / middle (the tool prints both). Then re-run
# tools/cloud_rim.py on the new picture (its warm rim light is laid exactly over it).
# Run: ~/.cache/bj-voices/venv/bin/python tools/paint_cloud.py [out.webp|out.png]   (Pillow + numpy + scipy; cwebp on PATH)
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
FEATHER = 2.5        # the edge's softness (gaussian sigma, in saved px)

# the user's picture: each puff a circle (centre x, y, radius, in its px), back to front
REF = [
    (611, 545, 272, 1.08),   # the dome (round, as in the picture; the rest are drawn WIDE)
    (315, 590, 130),   # the puff on its left
    (900, 560, 135),   # the puff on its right
    (835, 690, 112),   # (fills the body between the right puffs, as the picture's does)
    (200, 742, 155),   # the big puff low at the left end
    (1035, 745, 170),  # the big puff low at the right end
    (420, 680, 132),   # the middle puffs
    (720, 790, 138),
    (395, 830, 135),   # the belly's bumps
    (625, 835, 155),
    (850, 875, 70),
]
# how strongly each puff's upper edge shows as a soft crease on the puffs behind it (the picture shows the middle puffs'
# and the end puffs' tops; the belly's bumps hardly show above, only their round bottoms)
CREASES = [0, 0.32, 0.32, 0.16, 0.34, 0.34, 0.4, 0.4, 0.08, 0.1, 0.16]
REF_BOX = (45, 267, 1205, 990)            # the picture's cloud: left, top, right, bottom
CH, TOP, WIDE = 233, 24, 1.45             # the cloud here: its height and top (art px), and how much wider than the picture
FY = CH / (REF_BOX[3] - REF_BOX[1]); FX = FY * WIDE
PUFFS = [(380 + (p[0] - (REF_BOX[0] + REF_BOX[2]) / 2) * FX, TOP + (p[1] - REF_BOX[1]) * FY, p[2] * FY * (p[3] if len(p) > 3 else WIDE), p[2] * FY) for p in REF]
BOT = TOP + CH

WHITE = np.array([246, 250, 255], np.float32)   # the cloud's white (a breath of blue, so the gloss reads on it)
TOPW = np.array([236, 244, 254], np.float32)    # the top of a puff just inside its gloss
GLOSS = np.array([255, 255, 255], np.float32)   # the glossy highlight
SHADE = np.array([200, 226, 251], np.float32)   # the soft blue low in the cloud
DEEP = np.array([168, 207, 247], np.float32)    # its underside, the lower edge of a puff
CREASE = np.array([214, 233, 252], np.float32)  # where a puff in front meets one behind
SKY = np.array([30, 172, 253], np.float32)      # the sky behind it (bg_sky near the cloud)
LIT = np.array([-0.12, -0.80, 0.59]); LIT /= np.linalg.norm(LIT)   # from above, a little left, toward the viewer (y down)

h, w = H * K, W * K
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
X = (xx + 0.5) / K; Y = (yy + 0.5) / K  # art px
del xx, yy
EDGE = 1.2  # anti-alias width (art px)


def smooth(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def over(col, cov, c2, a2):  # paint colour c2 with coverage a2 over (col, cov)
    col += (c2 - col) * a2[..., None]
    cov += (1 - cov) * a2
    return col, cov


def puff(cx, cy, rx, ry):  # its local coordinates, signed distance to its edge (art px, near enough) and coverage
    u = (X - cx) / rx; v = (Y - cy) / ry
    dist = (1 - np.sqrt(u * u + v * v)) * min(rx, ry)
    return u, v, dist, np.clip(dist / EDGE + 0.5, 0, 1)


# the whole cloud's outline first: one body (any pocket of sky closed in by puffs is filled), and how far each point is
# from its edge, so the shading can follow the cloud's own outline, not each puff's
union = np.zeros((h, w), bool)
for (cx, cy, rx, ry) in PUFFS:
    union |= puff(cx, cy, rx, ry)[3] > 0.5
union = nd.binary_fill_holes(union)
disk = nd.generate_binary_structure(2, 1)
smooth_union = nd.binary_closing(union, disk, iterations=int(2.5 * K))  # (the joins between puffs eased, for the shading)
din = nd.distance_transform_edt(smooth_union) / K    # art px inside from the outline

col = np.zeros((h, w, 3), np.float32) + WHITE
cov = np.zeros((h, w), np.float32)
for i, (cx, cy, rx, ry) in enumerate(PUFFS):
    u, v, dist, a = puff(cx, cy, rx, ry)
    if not a.any():
        continue
    # a puff in front lays a soft blue crease on the puff behind it, along its upper edge only (as in the picture)
    if i > 0:
        sh = smooth(13, 0, -dist) * (dist < 0.5) * cov * smooth(0.15, -0.55, v) * smooth(2, 10, din)
        col += (CREASE - col) * (CREASES[i] * sh)[..., None]
    nz = np.sqrt(np.clip(1 - u * u - v * v, 0, 1))
    n = np.stack([u, v, nz]); n /= np.linalg.norm(n, axis=0) + 1e-6
    d = n[0] * LIT[0] + n[1] * LIT[1] + n[2] * LIT[2]
    c = np.zeros((h, w, 3), np.float32) + WHITE
    # low in the cloud it turns a soft blue (the whole cloud's light, not this puff's)
    c += (SHADE - c) * (0.6 * smooth(TOP + 0.5 * CH, BOT, Y))[..., None]
    # a little roundness of its own: the side away from the light a touch bluer
    c += (SHADE - c) * (0.3 * (1 - smooth(-0.25, 0.6, d)) * smooth(24, 6, din))[..., None]
    # near the cloud's outline: the edges that face down go deep blue, the edges that face up get a thin light rim
    # and, just inside it, the glossy highlight
    down = smooth(-0.15, 0.65, n[1])
    near = smooth(16, 0, din)
    c += (DEEP - c) * (0.7 * near * down)[..., None]
    c += (TOPW - c) * (0.8 * smooth(9, 3, din) * smooth(1.2, 3, din) * (1 - down))[..., None]
    gloss = smooth(3, 6.5, din) * smooth(15, 8, din) * smooth(0.25, 0.75, -n[1] * 0.9 - n[0] * 0.2)
    c += (GLOSS - c) * (0.95 * gloss)[..., None]
    c += (SHADE - c) * (0.45 * smooth(2.2, 0, din) * (1 - down))[..., None]
    col, cov = over(col, cov, c, a)
# the closed-in pockets: the cloud's own body
fill = union & (cov < 0.5)
col[fill] = (WHITE + (SHADE - WHITE) * 0.6 * smooth(TOP + 0.5 * CH, BOT, Y[fill])[..., None])
cov = np.where(union, np.maximum(cov, (din > 0.6).astype(np.float32)), cov)

# far away: a touch of the sky's blue in the shade
lum = (col.mean(-1, keepdims=True) - 170) / 85
col += (SKY - col) * (0.05 * (1 - np.clip(lum, 0, 1)))

# downsample (premultiplied) to the saved size
pm = np.concatenate([col * cov[..., None], cov[..., None] * 255], -1)
pm = pm.reshape(H * S, SS, W * S, SS, 4).mean((1, 3))
a = pm[..., 3:] / 255
rgb = np.where(a > 1e-4, pm[..., :3] / np.maximum(a, 1e-4), 0)
# the edge eased a little (the colour stays the cloud's own, so no fringe): clean, not cut out
al0 = pm[..., 3] / 255
g = nd.gaussian_filter(al0, FEATHER)
t = np.clip((g - 0.3) / 0.7, 0, 1)
al1 = al0 * (t * t * (3 - 2 * t))
img = np.concatenate([np.clip(rgb, 0, 255), np.clip(al1[..., None] * 255, 0, 255)], -1).astype(np.uint8)

al = img[..., 3] / 255.0
rows = np.where(al.max(1) > 0.5)[0]; cols = np.where(al.max(0) > 0.5)[0]
print('cloud (art px): x', round(cols.min() / S), '→', round(cols.max() / S), ' y', round(rows.min() / S), '→', round(rows.max() / S))
for y in range(100, 241, 10):
    xs = np.where(al[int(y * S)] > 0.98)[0]
    print('row', y, 'solid', (round(xs.min() / S), round(xs.max() / S)) if len(xs) else None)
print('CLOUD_PUFFS = [' + ', '.join(f'[{round(cx)}, {round(cy)}, {round(max(rx, ry))}, {i}]' for i, (cx, cy, rx, ry) in enumerate(PUFFS)) + ']', ' base', round(BOT), ' mid', [380, round(TOP + CH / 2)])

with tempfile.TemporaryDirectory() as td:
    png = os.path.join(td, 'cloud.png')
    Image.fromarray(img, 'RGBA').save(png)
    if OUT.endswith('.png'):
        Image.fromarray(img, 'RGBA').save(OUT)
    else:
        subprocess.run(['cwebp', '-quiet', '-q', '90', '-alpha_q', '100', '-exact', png, '-o', OUT], check=True)
print('wrote', OUT, img.shape[1], 'x', img.shape[0])
