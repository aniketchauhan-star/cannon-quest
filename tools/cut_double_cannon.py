#!/usr/bin/env python3
"""
The game's 2-socket cannon, cut from the user's double-cannon art art/sprite_sheets/double_cannon.png (23 Nov 2026,
user: "use this double cannon … replace this double cannon"): the wooden cannon with leaves, teal barrel and gold
bands, two big sockets joined by a gold arrow (1 → 2), and its own red FIRE pill.

  cannon2.png        the cannon on the cannons' shared canvas (1226×898 px = CANNON.src 613×449 at 2 px each). The
                     user's single and double cannons are drawn at the same scale on the same 1448×1086 canvas, so
                     both are cut with one mapping: SCALE canvas px per art px, the body's centre line (art x 717) on
                     the canvas's centre (x 613, so it stands on CANNON.x), and the lowest opaque row on canvas row 894
                     (the ground). The round's morph from one cannon to the other then swaps only the top. Its FIRE
                     pill is replaced by a dark recess: the game's FIRE button sits there (pressed, the recess shows)
  cannon2_front.png  only its two gold socket rings, drawn above the loaded balls (a ball's edge tucks under the ring)
  fire2.png          its FIRE pill with the word erased: the game writes T('btnFire') on it

The art is ~3 px per game px, so it is only scaled down (Lanczos on premultiplied alpha): no hd_upscale.py pass.

    PY tools/cut_double_cannon.py art/sprite_sheets/double_cannon.png OUTDIR [--scale 0.84 --centre 717 --ground 894]
then cwebp -m 6 -q 90 -alpha_q 100 each PNG into assets/img/. It prints the numbers for CANNON.holes[2],
CANNON.foot[2] and CANNON.fire[2] at the top of src/30_stage.js.
PY = a Python with NumPy, SciPy and Pillow (~/.cache/bj-voices/venv/bin/python on this Mac).
"""
import argparse
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd, sparse
from scipy.sparse.linalg import splu

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('out')
ap.add_argument('--scale', type=float, default=0.84)    # canvas px per art px (the same for both cannons)
ap.add_argument('--centre', type=float, default=717.0)  # the body's centre line in the art (x, px)
ap.add_argument('--ground', type=int, default=894)      # the canvas row the lowest opaque art row lands on
ap.add_argument('--debug', action='store_true')         # also save debug_fill.png (green: erased, blue: kept gloss)
args = ap.parse_args()
S, CW, CH = args.scale, 1226, 898
SEAT, TUCK = 1.015, 1.8  # CANNON.seat; how far (canvas px) a loaded orb's edge reaches under the ring, at its tightest

A = np.asarray(Image.open(args.src).convert('RGBA')).astype(np.float32)
H, W = A.shape[:2]
r, g, b, a = (A[..., i] for i in range(4))
L = A[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
gold = (r > 170) & (g > 110) & (b < 110) & (r - b > 90)

# the mapping, in edge coordinates (art pixel i spans [i, i+1]): canvas = (art − (U0, V0)) × S
bot = int(np.nonzero((a > 128).any(1))[0].max())
U0 = args.centre - (CW / 2) / S
V0 = (bot + 1) - (args.ground + 1) / S
to_c = lambda x, y: ((x - U0) * S, (y - V0) * S)  # (edge coordinates; a pixel index i is at i + 0.5)


def resample(arr, box, size):
    """arr (H×W×4, straight alpha) → `size` px covering `box` (art edge coordinates): Lanczos on premultiplied
    colour, so no fringe at the edge"""
    P = 64
    pad = np.zeros((arr.shape[0] + 2 * P, arr.shape[1] + 2 * P, 4), np.float32); pad[P:-P, P:-P] = arr
    al = pad[..., 3] / 255; bx = tuple(float(v) + P for v in box)
    o = np.dstack([np.asarray(Image.fromarray(pad[..., c] * (al if c < 3 else 1), 'F').resize(size, Image.LANCZOS, box=bx))
                   for c in range(4)])
    oa = np.clip(o[..., 3], 0, 255)
    o[..., :3] = np.where(oa[..., None] > 0.5, o[..., :3] / np.maximum(oa[..., None], 1e-3) * 255, 0)
    o[..., 3] = oa
    return np.clip(o, 0, 255)


def stadium(shape, box, ss=8):
    """anti-aliased pill mask (0..1) for box (x0, y0, x1, y1) in edge coordinates of an image `shape`"""
    h, w = shape; x0, y0, x1, y1 = box
    mk = Image.new('L', (w * ss, h * ss), 0)
    ImageDraw.Draw(mk).rounded_rectangle((x0 * ss, y0 * ss, x1 * ss - 1, y1 * ss - 1), radius=(y1 - y0) / 2 * ss, fill=255)
    return np.asarray(mk.resize((w, h), Image.BOX)).astype(np.float32) / 255


def save(arr, name):
    Image.fromarray(np.clip(arr + 0.5, 0, 255).astype(np.uint8), 'RGBA').save(f'{args.out}/{name}', optimize=True)


# =====================================================================================================
# the two sockets: each dark hole, then the inner edge of its gold ring (where the gold starts, sub-pixel, on 240
# rays) fitted with an ellipse (the art's holes are ~2 % taller than wide), and the ring's outer edge
# =====================================================================================================
dark = (L < 110) & (a > 200); dark[:int(H * 0.3)] = False; dark[int(H * 0.68):] = False
dark = nd.binary_opening(dark, iterations=3)
lab, n = nd.label(dark); sizes = nd.sum(dark, lab, range(1, n + 1))
seeds = []
for k in np.argsort(sizes)[::-1][:2] + 1:
    m = nd.binary_fill_holes(lab == k); ys, xs = np.nonzero(m)
    seeds.append((xs.mean(), ys.mean(), np.sqrt(m.sum() / np.pi)))
seeds.sort()


def ring(cx, cy, r0):
    rad = np.arange(r0 * 0.8, r0 * 1.7, 0.25); pts, outs = [], []
    for t in np.radians(np.arange(0, 360, 1.5)):
        px, py = cx + rad * np.cos(t), cy + rad * np.sin(t)
        R = nd.map_coordinates(r, [py, px], order=1)
        up = np.nonzero((R[1:] >= 120) & (R[:-1] < 120))[0]  # dark hole / outline (R ≤ 65) → gold (R ≥ 150)
        if not len(up): continue
        i = up[0]; ri = rad[i] + (120 - R[i]) / (R[i + 1] - R[i]) * 0.25
        pts.append((cx + ri * np.cos(t), cy + ri * np.sin(t)))
        dn = np.nonzero((R[1:] < 110) & (R[:-1] >= 110) & (rad[1:] > ri + 25))[0]  # the ring's dark outer outline
        if len(dn): outs.append(rad[dn[0] + 1] - ri)
    P = np.array(pts) + 0.5; x, y = P[:, 0], P[:, 1]  # (edge coordinates)
    Aq, Cq, Dq, Eq = np.linalg.lstsq(np.c_[x * x, y * y, x, y], np.ones(len(x)), rcond=None)[0]
    ex, ey = -Dq / (2 * Aq), -Eq / (2 * Cq); k = 1 + Dq * Dq / (4 * Aq) + Eq * Eq / (4 * Cq)
    ea, eb = np.sqrt(k / Aq), np.sqrt(k / Cq)
    res = np.hypot(x - ex, y - ey) - 1 / np.sqrt(((x - ex) / np.hypot(x - ex, y - ey) / ea) ** 2 + ((y - ey) / np.hypot(x - ex, y - ey) / eb) ** 2)
    return dict(x=ex, y=ey, a=ea, b=eb, width=float(np.median(outs)), rms=float(np.sqrt(np.mean(res ** 2))), rays=len(pts))


rings = [ring(*s_) for s_ in seeds]

# =====================================================================================================
# the FIRE pill, whatever its colour (red on the first double cannon, yellow on the second, both 23 Nov): find the
# white word in the lower middle, flood the pill from just left of it up to the pill's dark outline (darker than
# the pill, it parts the pill from the gold bezel), grow over that outline; its bounding box gives a stadium
# =====================================================================================================
wht = (r > 200) & (g > 200) & (b > 200) & (a > 200)
wht[:int(H * 0.65)] = False; wht[int(H * 0.95):] = False; wht[:, :int(W * 0.25)] = False; wht[:, int(W * 0.75):] = False
lab, n = nd.label(wht); objs = nd.find_objects(lab)
lt = [k for k in range(n) if objs[k][0].stop - objs[k][0].start >= 60]  # the letters (≈110 px tall)
sy, sx = (min(objs[k][0].start for k in lt) + max(objs[k][0].stop for k in lt)) // 2, min(objs[k][1].start for k in lt) - 30
Lpill = float(np.median(L[sy - 4:sy + 5, sx - 4:sx + 5]))
lab, n = nd.label(~((L < 0.6 * Lpill) | (a < 200)))  # (the outline is under 0.6 × the pill's brightness)
grow = nd.binary_fill_holes(lab == lab[sy, sx])
for _ in range(5): grow |= nd.binary_dilation(grow) & (L < 0.85 * Lpill) & (a > 200)  # over the outline, to the bezel
grow = nd.binary_fill_holes(grow)
ys, xs = np.nonzero(grow); pbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
px0, py0, px1, py1 = pbox
st = stadium((H, W), pbox)
iou = float(((st > 0.5) & grow).sum() / ((st > 0.5) | grow).sum())

# fire2: the word erased. The letters are the tall white blobs (+ the "!" dot) in one band; with them go their dark-red
# outline (~12 px round them) and their drop shadow (~26 px below them, down to the pill's thin bottom rim light). All
# that is filled with the smooth surface solved from the clean pill round it. The gloss highlights (top left, top
# streak) and the rim light stay as drawn and take no part in the solve, so their brightness never bleeds into it
M_ = 8
P = A[py0 - M_:py1 + M_, px0 - M_:px1 + M_].astype(np.float64); Lp = L[py0 - M_:py1 + M_, px0 - M_:px1 + M_]
NR = P.shape[0]; rr = np.arange(NR)[:, None]
sp = stadium(P.shape[:2], (M_, M_, M_ + px1 - px0, M_ + py1 - py0)) > 0.5
white = (P[..., :3] > 215).all(-1) & nd.binary_erosion(sp, iterations=6)  # pure white (the yellow pill's light top band is cream)
lab, n = nd.label(white); objs = nd.find_objects(lab); area = nd.sum(white, lab, range(1, n + 1))
tall = [k for k in range(n) if objs[k][0].stop - objs[k][0].start >= 60]  # the letters (gloss blobs are ≤ 45 px tall)
y0w, y1w = min(objs[k][0].start for k in tall), max(objs[k][0].stop for k in tall)
x0w, x1w = min(objs[k][1].start for k in tall), max(objs[k][1].stop for k in tall)
word = np.zeros_like(white)
for k in range(n):
    ys_, xs_ = objs[k]
    if area[k] > 80 and y0w <= (ys_.start + ys_.stop) / 2 <= y1w and x0w <= (xs_.start + xs_.stop) / 2 <= x1w:
        word |= lab == k + 1
dist = lambda m: nd.distance_transform_edt(~m)  # (round growth: iterated dilation grows a diamond, leaving gaps)
near = dist(word) <= 8  # small white bits next to a letter are the letter's, not gloss
for k in range(n):
    if (near & (lab == k + 1)).any(): word |= lab == k + 1
gloss = dist(white & ~word) <= 4
drop = word.copy()  # (the shadow falls down and a little to the right)
for dy in range(1, 33): drop[dy:, dy // 4:] |= word[:-dy, :word.shape[1] - dy // 4]
halo = (dist(word) <= 21) | (dist(drop) <= 7)
# …but never into the rim light: in each column, stop just above the first bright row under the letters
below = (rr >= y1w + 14) & sp  # (+14: past the letters' own bright bottom edge and the shadow's core)
rim = (Lp > np.median(Lp[below & (rr < y1w + 24)]) + 15) & below  # (the light line near the pill's bottom)
halo &= rr < (np.where(rim.any(0), rim.argmax(0), NR) - 1)[None, :]
fill = nd.binary_fill_holes(halo & nd.binary_erosion(sp, iterations=6)) & ~gloss  # (+ any pocket it encloses)


def laplace_fill(img, mask, keep):
    """solve ∇²f = 0 over mask, f = img on the pixels round it, except `keep` pixels (no flux across them)"""
    ys, xs = np.nonzero(mask); n_ = len(ys); idx = -np.ones(mask.shape, int); idx[ys, xs] = np.arange(n_)
    rows, cols, vals = [], [], []; diag = np.full(n_, 1e-6); rhs = img[ys, xs] * 1e-6
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = ys + dy, xs + dx; inm = mask[ny, nx]; fix = ~inm & ~keep[ny, nx]
        rows.append(np.nonzero(inm)[0]); cols.append(idx[ny[inm], nx[inm]]); vals.append(-np.ones(int(inm.sum())))
        diag += inm | fix
        np.add.at(rhs, np.nonzero(fix)[0], img[ny[fix], nx[fix]])
    rows.append(np.arange(n_)); cols.append(np.arange(n_)); vals.append(diag)
    Mx = sparse.csc_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(n_, n_))
    out = img.copy(); out[ys, xs] = splu(Mx).solve(rhs)
    return out


E = P.copy(); E[..., :3] = laplace_fill(P[..., :3], fill, gloss | (rr >= (np.where(rim.any(0), rim.argmax(0), NR) - 1)[None, :]))
# a light blur deep inside the fill (none at its edge), so no faint point of a leftover shadow pixel survives
wdeep = np.clip(nd.distance_transform_edt(fill) / 8, 0, 1)[..., None]
E[..., :3] = E[..., :3] * (1 - wdeep) + nd.gaussian_filter(E[..., :3], (2.5, 2.5, 0)) * wdeep
if args.debug:
    dbg = P[..., :3].copy(); dbg[fill] = dbg[fill] * 0.4 + np.array([0, 255, 0]) * 0.6; dbg[gloss & sp] = dbg[gloss & sp] * 0.4 + np.array([0, 0, 255]) * 0.6
    Image.fromarray(np.clip(dbg, 0, 255).astype(np.uint8)).save(f'{args.out}/debug_fill.png')
band = (int(y0w), int(y1w))
blank = A.copy(); blank[py0 - M_:py1 + M_, px0 - M_:px1 + M_] = E.astype(np.float32)

# the pill on its own picture at the canvas's density, centred exactly (CSS centres the button on the recess)
pcx, pcy = (px0 + px1) / 2, (py0 + py1) / 2
pw, ph = (px1 - px0) * S, (py1 - py0) * S
FW, FH = int(np.ceil(pw)) + 4, int(np.ceil(ph)) + 4
F = resample(blank, (pcx - FW / 2 / S, pcy - FH / 2 / S, pcx + FW / 2 / S, pcy + FH / 2 / S), (FW, FH))
F[..., 3] = stadium((FH, FW), ((FW - pw) / 2, (FH - ph) / 2, (FW + pw) / 2, (FH + ph) / 2)) * 255
save(F, 'fire2.png')

# =====================================================================================================
# cannon2: the pill replaced by a dark recess inside the gold bezel, then onto the canvas
# =====================================================================================================
body = A.copy(); sm = np.clip(nd.gaussian_filter(st, 0.6) * 1.15, 0, 1)[..., None]
v = np.clip((np.arange(H, dtype=np.float32)[:, None] - py0) / (py1 - py0), 0, 1)[..., None]
recess = np.array([40, 12, 4], np.float32) * (1 - v) + np.array([92, 30, 10], np.float32) * v
body[..., :3] = body[..., :3] * (1 - sm) + recess * sm
C = resample(body, (U0, V0, U0 + CW / S, V0 + CH / S), (CW, CH))
save(C, 'cannon2.png')

# cannon2_front: the two rings only, from the gold's inner edge (half-covered there, solid half a px further out) to
# just past their dark outer outline
gy, gx = np.mgrid[0:CH, 0:CW] + 0.5
fm = np.zeros((CH, CW), np.float32); holes = []
for R_ in rings:
    ex, ey = to_c(R_['x'], R_['y']); ea, eb = R_['a'] * S, R_['b'] * S
    d = np.hypot(gx - ex, gy - ey)
    din = (np.sqrt(((gx - ex) / ea) ** 2 + ((gy - ey) / eb) ** 2) - 1) * np.sqrt(ea * eb)  # px past the inner edge
    rout = np.sqrt(ea * eb) + (R_['width'] + 3) * S
    fm = np.maximum(fm, np.clip(np.minimum(din + 0.5, rout - d + 0.5), 0, 1))
    # the hole's radius for the game: a loaded orb (SEAT × it) reaches TUCK px under the ring where the hole is widest
    hr = (max(ea, eb) + TUCK) / SEAT
    holes.append([round(ex / CW, 4), round(ey / CH, 4), round(hr / CW, 4)])
Fr = C.copy(); Fr[..., 3] *= fm
save(Fr, 'cannon2_front.png')

# the base's footprint: its widest opaque run just above the ground
low = C[args.ground - 11:args.ground - 1, :, 3] > 128; cols = np.nonzero(low.any(0))[0]
fx, fy = to_c(pcx, pcy)
geo = dict(holes=holes, foot_w=round((cols.max() - cols.min() + 1) / CW, 4),
           fire=dict(cx=round(fx / 2, 1), cy=round(fy / 2, 1), w=round(pw / 2, 1), h=round(ph / 2, 1),
                     art=[FW / 2, FH / 2, round(pw / 2, 1), round(ph / 2, 1)]),
           debug=dict(mapping=dict(U0=round(U0, 2), V0=round(V0, 2), scale=S, art_bottom_row=bot),
                      rings=[{k: round(float(v_), 2) for k, v_ in R_.items()} for R_ in rings],
                      pill_box=pbox, pill_iou=round(iou, 4), word_band=band, word_px=int(word.sum()), fill_px=int(fill.sum())))
print(json.dumps(geo, default=lambda o_: o_.item() if hasattr(o_, 'item') else str(o_)))
