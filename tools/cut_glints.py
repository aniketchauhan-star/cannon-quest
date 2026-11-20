# The start screen's glints (20 Nov, user: once the cannon and the cage have come in they stay put, "only give some
# animations"): a light sweeps over their gold now and then (Title.glint in src/35_title.js). These are the GOLD
# parts of the start-screen art, brightened (their own colour and shading, lifted), the same size as the piece:
#
#   t_cannon_glint.png  the cannon's gold only (the muzzle ring, the barrel bands and the arch over its base),
#                       found by colour; the sunlit wood, the leaves, the teal band and the iron stay out
#   t_cage_glint.png    the cage's front (t_cage_front: dome, top ring, front bars, base lip), all gold, so x behind
#                       the bars is never lit
#
# Usage (a Python with cv2, numpy and PIL), from the project folder:
#   python tools/cut_glints.py OUTDIR
# then cwebp -q 82 -alpha_q 90 each PNG into assets/img/ (as .webp).
import sys, numpy as np, cv2
from PIL import Image

OUT = sys.argv[1]


def wash(rgba, alpha):  # the gold under a bright light: the same gold, its shading kept, lifted towards a hot yellow-white
    out = rgba.copy()
    out[..., :3] = np.clip(rgba[..., :3].astype(float) * 1.45 + 48, 0, 255).astype(np.uint8)
    out[..., 3] = alpha
    return out


# the cannon: gold = yellow-orange, saturated and bright, in pieces big enough to be a ring or a band
cn = np.array(Image.open('assets/img/t_cannon.webp').convert('RGBA'))
hsv = cv2.cvtColor(cn[..., :3], cv2.COLOR_RGB2HSV_FULL).astype(float)
h, s, v = hsv[..., 0] * 360 / 256, hsv[..., 1] / 255, hsv[..., 2] / 255
m = ((h >= 30) & (h <= 58) & (s > 0.45) & (v > 0.6) & (cn[..., 3] > 200)).astype(np.uint8) * 255
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, lab, st, cen = cv2.connectedComponentsWithStats(m)
keep = np.zeros_like(m)
for i in range(1, n):
    x, y, w, hh, area = st[i]
    if area < 400: continue
    if 360 <= cen[i][0] <= 490 and 160 <= cen[i][1] <= 260: continue  # sunlit wood on top of the barrel
    if y >= 570 and hh < 40: continue                                    # the lit top edge of the wooden base
    keep[lab == i] = 255
keep = cv2.GaussianBlur(keep, (3, 3), 0)
Image.fromarray(wash(cn, np.minimum(cn[..., 3], keep))).save(f'{OUT}/t_cannon_glint.png')

# the cage's front: it is all gold
cf = np.array(Image.open('assets/img/t_cage_front.webp').convert('RGBA'))
Image.fromarray(wash(cf, cf[..., 3])).save(f'{OUT}/t_cage_glint.png')
print('saved', f'{OUT}/t_cannon_glint.png', f'{OUT}/t_cage_glint.png')
