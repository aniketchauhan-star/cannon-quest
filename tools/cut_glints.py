# The start screen's glints (20 Nov, user: once the cannon and the cage have come in they stay put, "only give some
# animations"): a light sweeps over their gold now and then (Title.glint in src/35_title.js). These are the GOLD
# parts of the start-screen art, brightened (their own colour and shading, lifted), the same size as the piece:
#
#   t_cannon_glint.png  the cannon's gold only (the muzzle ring, the barrel bands and the arch over its base),
#                       found by colour; the sunlit wood, the leaves, the teal band and the iron stay out
#   t_cage_glint.png    the gold of x's cage on the start screen. Since 23 Nov 2026 that is x crying in its cage, the
#                       user's art (x_cry.webp, as in the game; design review: "give the title X the same eyes and a
#                       sad idle animation"): its cage where it shows round x (cage_crack.webp, cut by
#                       tools/cut_x_sprites.py), all gold, so x itself is never lit
#
# Usage (a Python with cv2, numpy and PIL), from the project folder:
#   python tools/cut_glints.py OUTDIR          both
#   python tools/cut_glints.py OUTDIR cage     only the cage (needs no cv2)
# then cwebp -q 82 -alpha_q 90 each PNG into assets/img/ (as .webp).
import sys, numpy as np
from PIL import Image

OUT = sys.argv[1]
ONLY_CAGE = len(sys.argv) > 2 and sys.argv[2] == 'cage'


def wash(rgba, alpha):  # the gold under a bright light: the same gold, its shading kept, lifted towards a hot yellow-white
    out = rgba.copy()
    out[..., :3] = np.clip(rgba[..., :3].astype(float) * 1.45 + 48, 0, 255).astype(np.uint8)
    out[..., 3] = alpha
    return out


# the cage: the crying frames' cage as it shows round x (all of it gold)
ce = np.array(Image.open('assets/img/cage_empty.webp').convert('RGBA'))
mk = np.array(Image.open('assets/img/cage_crack.webp').convert('RGBA').resize((ce.shape[1], ce.shape[0]), Image.LANCZOS))
Image.fromarray(wash(ce, np.minimum(ce[..., 3], mk[..., 3]))).save(f'{OUT}/t_cage_glint.png')
print('saved', f'{OUT}/t_cage_glint.png')
if ONLY_CAGE:
    sys.exit(0)

import cv2  # (the cannon's gold is found by colour)
# the cannon: gold = yellow-orange, saturated and bright, in pieces big enough to be a ring or a band
cn = np.array(Image.open('assets/img/t_cannon.webp').convert('RGBA'))
hsv = cv2.cvtColor(cn[..., :3], cv2.COLOR_RGB2HSV_FULL).astype(float)
h, s, v = hsv[..., 0] * 360 / 256, hsv[..., 1] / 255, hsv[..., 2] / 255
m = ((h >= 30) & (h <= 58) & (s > 0.45) & (v > 0.6) & (cn[..., 3] > 200)).astype(np.uint8) * 255
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))  # (specks)
n, lab, st, cen = cv2.connectedComponentsWithStats(m)
keep = np.zeros_like(m)
k = cn.shape[1] / 779  # (the places below were measured on the 779 px wide cannon; t_cannon is HD now: tools/hd_upscale.py)
for i in range(1, n):
    x, y, w, hh, area = st[i]
    if area < 400 * k * k: continue
    if 360 * k <= cen[i][0] <= 490 * k and 160 * k <= cen[i][1] <= 260 * k: continue  # sunlit wood on top of the barrel
    if y >= 570 * k and hh < 40 * k: continue                                          # the lit top edge of the wooden base
    keep[lab == i] = 255
keep = cv2.GaussianBlur(keep, (3, 3), 0)
Image.fromarray(wash(cn, np.minimum(cn[..., 3], keep))).save(f'{OUT}/t_cannon_glint.png')
print('saved', f'{OUT}/t_cannon_glint.png')
