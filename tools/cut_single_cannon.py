"""
Cut the game's 1-socket cannon from the user's art art/sprite_sheets/single_cannon.png: the teal and gold cannon with
leaves on a wooden base and a glossy yellow FIRE pill (23 Nov 2026, the user's second single cannon, the twin of their
second double cannon; the first one had a red FIRE! pill).

  cannon1.png        the cannon; its FIRE pill is replaced by a dark recess (the game's FIRE button sits there, and
                     pressed, it sinks into it)
  cannon1_front.png  only its gold socket ring, drawn above a loaded ball
  fire.png           the pill with the painted word erased: the game writes T('btnFire') on it

The double cannon (art/sprite_sheets/double_cannon.png → cannon2*, fire2) is cut by tools/cut_double_cannon.py onto the
same canvas with the same mapping, so a round's morph from one to the other swaps only the top:
  canvas 1226×898 px (CANNON.src 613×449 at CANNON.h 360 in src/30_stage.js), 0.84 canvas px per art px,
  art x 717 → canvas x 613 (the barrel's centre on CANNON.x), the art's lowest opaque row → canvas row 894.
The art is ~3 px per game px, so it is only ever scaled down (no hd_upscale.py pass). The pill is found and its word
erased the way cut_double_cannon.py does it, so both cannons' buttons match.

Usage (a Python with numpy, scipy and PIL, e.g. ~/.cache/bj-voices/venv/bin/python):
    python tools/cut_single_cannon.py art/sprite_sheets/single_cannon.png OUTDIR [--debug]
then cwebp each PNG into assets/img/. Prints holes[1] / foot[1] / fire[1] for CANNON in src/30_stage.js, and writes
OUTDIR/preview.png (the pieces stacked as the game draws them, on a grey ground) to check the cut by eye; --debug also
writes OUTDIR/debug_fill.png (green: the word and its shadow, refilled; blue: shine and light lines, kept as drawn).
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
from scipy import sparse
from scipy.sparse.linalg import splu

SRC, OUT = sys.argv[1:3]
DEBUG = '--debug' in sys.argv[3:]
CW, CH, K, AX, CX, CROW = 1226, 898, 0.84, 717, 613, 894  # the shared canvas and mapping (see above)
SEAT = 1.015   # CANNON.seat: a loaded orb's painted edge is this much of the hole's r…
UNDER = 1.8    # …so r is set to put that edge this many canvas px under the ring, where the ring is widest

A = np.array(Image.open(SRC).convert('RGBA')).astype(np.float32)
H, W = A.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]
lum = lambda c: c[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)

# ---------------------------------------------------------------------------------------------- clean alpha
# the cannon is one opaque piece at alpha ~252 on a faint speckle (alpha < 40) all over the canvas: keep only the
# cannon and its anti-aliased edge, and make its body fully opaque
a = A[..., 3]
lab, n = nd.label(a >= 40)
body = lab == (np.argmax(nd.sum(np.ones_like(a), lab, range(1, n + 1))) + 1)
keep = nd.binary_dilation(nd.binary_fill_holes(body), iterations=2)
A[..., 3] = np.clip(np.where(keep, a, 0) * (255 / 250), 0, 255)
r, g, b, a = (A[..., i] for i in range(4))
L = lum(A)
gold = (r > 170) & (g > 110) & (b < 110) & (r - b > 90)
ys, xs = np.nonzero(a > 128)
BOT = int(ys.max())  # the lowest opaque row: where the base meets the ground


def to_canvas(x, y):
    """art px (pixel centres at integers) → canvas px (continuous: pixel i covers [i, i + 1))"""
    return CX + (x + 0.5 - AX) * K, CROW + (y + 0.5 - BOT) * K


# ---------------------------------------------------------------------------------------------- the socket
dark = (L < 110) & (a > 200) & (np.abs(r - g) < 25) & (np.abs(g - b) < 25)
dark[int(H * 0.65):] = False
dark = nd.binary_opening(dark, iterations=3)
lab, n = nd.label(dark)
hole = nd.binary_fill_holes(lab == (np.argmax(nd.sum(dark, lab, range(1, n + 1))) + 1))
ey, ex = np.nonzero(hole & ~nd.binary_erosion(hole))
cf = np.linalg.lstsq(np.c_[2 * ex, 2 * ey, np.ones(len(ex))], ex ** 2 + ey ** 2, rcond=None)[0]
hcx, hcy = cf[0], cf[1]
hr0 = np.sqrt(cf[2] + hcx ** 2 + hcy ** 2)

# where the gold starts, sub-pixel, on 240 rays: the first radius where the brightness crosses halfway from the
# hole's dark to the ring's gold (the hole art is a gradient, so each ray finds its own two levels)
ANG = np.linspace(0, 2 * np.pi, 240, endpoint=False)
RS = np.arange(hr0 * 0.85, hr0 * 1.2, 0.1)
Ls = nd.gaussian_filter(L, 0.6)
edge = []
for t in ANG:
    prof = nd.map_coordinates(Ls, [hcy + RS * np.sin(t), hcx + RS * np.cos(t)], order=1)
    lo = np.median(prof[(RS > hr0 * 0.88) & (RS < hr0 * 0.95)])
    hi = np.median(prof[(RS > hr0 * 1.04) & (RS < hr0 * 1.09)])
    k = np.nonzero(prof >= (lo + hi) / 2)[0][0]
    f = (((lo + hi) / 2) - prof[k - 1]) / max(prof[k] - prof[k - 1], 1e-3)
    edge.append(RS[k - 1] + f * 0.1)
edge = np.array(edge)
# a conic through the edge points: the ring's inner edge, centre and widest radius
ex, ey = hcx + edge * np.cos(ANG), hcy + edge * np.sin(ANG)
D = np.c_[ex * ex, ex * ey, ey * ey, ex, ey]
ca, cb, cc, cd, ce = np.linalg.lstsq(D, np.ones(len(ex)), rcond=None)[0]
den = cb * cb - 4 * ca * cc
ecx, ecy = (2 * cc * cd - cb * ce) / den, (2 * ca * ce - cb * cd) / den
er = np.hypot(ex - ecx, ey - ecy)          # each ray's inner-edge radius about the fitted centre
eth = np.arctan2(ey - ecy, ex - ecx)
order = np.argsort(eth)
eth, er = eth[order], er[order]
edge_at = lambda th: np.interp(th, eth, er, period=2 * np.pi)
r_in_max = er.max()
# the ring's outer edge, ray by ray: where its gold band ends (the ring is ~60 art px wide; its inner bevel has a
# highlight that is not "gold", so start looking well inside the band), then on over its dark outline; the widest
outer = []
goldf = nd.gaussian_filter(gold.astype(np.float32), 1.0)
for t in ANG:
    rr = np.arange(r_in_max + 40, r_in_max * 1.6, 0.25)
    pg = nd.map_coordinates(goldf, [ecy + rr * np.sin(t), ecx + rr * np.cos(t)], order=1)
    pl = nd.map_coordinates(Ls, [ecy + rr * np.sin(t), ecx + rr * np.cos(t)], order=1)
    off = np.nonzero(pg < 0.5)[0]
    if not len(off):
        continue
    j = k = off[0]
    while k < len(rr) - 1 and pl[k] < 90 and rr[k] - rr[j] < 10:  # its dark outline
        k += 1
    outer.append(rr[k] + 1)
r_out = float(np.percentile(outer, 90))  # (a few rays run on into the gold bands that touch the ring)

# ---------------------------------------------------------------------------------------------- the FIRE pill
# whatever its colour (the yellow pill sits in a gold bezel, so colour can't part them): find the white word in the
# lower middle, flood the pill from just left of it up to the pill's dark outline (darker than the pill, it parts the
# pill from the bezel), grow over that outline up to the bezel; its bounding box gives a stadium
wht = (r > 200) & (g > 200) & (b > 200) & (a > 200)
wht[:int(H * 0.65)] = False
wht[int(H * 0.95):] = False
lab, n = nd.label(wht)
objs = nd.find_objects(lab)
# the letters: tall white blobs (≈120 px) about the cannon's centre line (the metal clamps' shine is off to the sides)
lt = [k for k in range(n) if 60 <= objs[k][0].stop - objs[k][0].start <= 160
      and abs((objs[k][1].start + objs[k][1].stop) / 2 - AX) < 0.17 * W]
sy = (min(objs[k][0].start for k in lt) + max(objs[k][0].stop for k in lt)) // 2
sx = min(objs[k][1].start for k in lt) - 30
Lpill = float(np.median(L[sy - 4:sy + 5, sx - 4:sx + 5]))
lab, n = nd.label(~((L < 0.6 * Lpill) | (a < 200)))  # (the outline is under 0.6 × the pill's brightness)
grow = nd.binary_fill_holes(lab == lab[sy, sx])
for _ in range(5):  # over the outline, to the bezel
    grow |= nd.binary_dilation(grow) & (L < 0.85 * Lpill) & (a > 200)
grow = nd.binary_fill_holes(grow)
ys, xs = np.nonzero(grow)
px0, py0, px1, py1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def stadium(shape, box, ss=8):
    """anti-aliased pill mask (0..1) for box (x0, y0, x1, y1) in edge coordinates of an image `shape`"""
    h, w = shape
    x0, y0, x1, y1 = box
    mk = Image.new('L', (w * ss, h * ss), 0)
    ImageDraw.Draw(mk).rounded_rectangle((x0 * ss, y0 * ss, x1 * ss - 1, y1 * ss - 1), radius=(y1 - y0) / 2 * ss, fill=255)
    return np.asarray(mk.resize((w, h), Image.BOX)).astype(np.float32) / 255


st = stadium((H, W), (px0, py0, px1, py1))
iou = float(((st > 0.5) & grow).sum() / ((st > 0.5) | grow).sum())

# the word erased. The letters are the pure-white blobs (the pill's top band is cream) in one band; with them go
# their thin brown outline and soft glow (~21 px round them) and their drop shadow (~32 px down, a little right).
# All that is filled with the smooth surface solved from the clean pill round it. The shine (top left), the top band
# and the light line along the pill's bottom stay as drawn and take no part in the solve, so their brightness never
# bleeds into it
M_ = 8
P = A[py0 - M_:py1 + M_, px0 - M_:px1 + M_].astype(np.float64)
Lp = L[py0 - M_:py1 + M_, px0 - M_:px1 + M_]
NR = P.shape[0]
rr = np.arange(NR)[:, None]
sp = stadium(P.shape[:2], (M_, M_, M_ + px1 - px0, M_ + py1 - py0)) > 0.5
white = (P[..., :3] > 215).all(-1) & nd.binary_erosion(sp, iterations=6)
lab, n = nd.label(white)
objs = nd.find_objects(lab)
area = nd.sum(white, lab, range(1, n + 1))
tall = [k for k in range(n) if objs[k][0].stop - objs[k][0].start >= 60]  # the letters (shine blobs are ≤ 45 px tall)
y0w, y1w = min(objs[k][0].start for k in tall), max(objs[k][0].stop for k in tall)
x0w, x1w = min(objs[k][1].start for k in tall), max(objs[k][1].stop for k in tall)
word = np.zeros_like(white)
for k in range(n):
    ys_, xs_ = objs[k]
    if area[k] > 80 and y0w <= (ys_.start + ys_.stop) / 2 <= y1w and x0w <= (xs_.start + xs_.stop) / 2 <= x1w:
        word |= lab == k + 1
dist = lambda m: nd.distance_transform_edt(~m)  # (round growth: iterated dilation grows a diamond, leaving gaps)
near = dist(word) <= 8  # small white bits next to a letter are the letter's, not shine
for k in range(n):
    if (near & (lab == k + 1)).any():
        word |= lab == k + 1
gloss = dist(white & ~word) <= 4
drop = word.copy()  # (the shadow falls down and a little to the right)
for dy in range(1, 33):
    drop[dy:, dy // 4:] |= word[:-dy, :word.shape[1] - dy // 4]
halo = (dist(word) <= 21) | (dist(drop) <= 7)
# …but never into the light line along the bottom: in each column, stop just above the first bright row under the letters
below = (rr >= y1w + 14) & sp  # (+14: past the letters' own bright bottom edge and the shadow's core)
rim = (Lp > np.median(Lp[below & (rr < y1w + 24)]) + 15) & below
rim_row = (np.where(rim.any(0), rim.argmax(0), NR) - 1)[None, :]
halo &= rr < rim_row
fill = nd.binary_fill_holes(halo & nd.binary_erosion(sp, iterations=6)) & ~gloss  # (+ any pocket it encloses)


def laplace_fill(img, mask, keep):
    """solve ∇²f = 0 over mask, f = img on the pixels round it, except `keep` pixels (no flux across them)"""
    ys, xs = np.nonzero(mask)
    n_ = len(ys)
    idx = -np.ones(mask.shape, int)
    idx[ys, xs] = np.arange(n_)
    rows, cols, vals = [], [], []
    diag = np.full(n_, 1e-6)
    rhs = img[ys, xs] * 1e-6
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = ys + dy, xs + dx
        inm = mask[ny, nx]
        fix = ~inm & ~keep[ny, nx]
        rows.append(np.nonzero(inm)[0]); cols.append(idx[ny[inm], nx[inm]]); vals.append(-np.ones(int(inm.sum())))
        diag += inm | fix
        np.add.at(rhs, np.nonzero(fix)[0], img[ny[fix], nx[fix]])
    rows.append(np.arange(n_)); cols.append(np.arange(n_)); vals.append(diag)
    Mx = sparse.csc_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(n_, n_))
    out = img.copy()
    out[ys, xs] = splu(Mx).solve(rhs)
    return out


E = P.copy()
E[..., :3] = laplace_fill(P[..., :3], fill, gloss | (rr >= rim_row))
# a light blur deep inside the fill (none at its edge), so no faint point of a leftover shadow pixel survives
wdeep = np.clip(nd.distance_transform_edt(fill) / 8, 0, 1)[..., None]
E[..., :3] = E[..., :3] * (1 - wdeep) + nd.gaussian_filter(E[..., :3], (2.5, 2.5, 0)) * wdeep
if DEBUG:
    dbg = P[..., :3].copy()
    dbg[fill] = dbg[fill] * 0.4 + np.array([0, 255, 0]) * 0.6
    kept = (gloss | (rr >= rim_row)) & sp
    dbg[kept] = dbg[kept] * 0.4 + np.array([0, 0, 255]) * 0.6
    Image.fromarray(np.clip(dbg, 0, 255).astype(np.uint8)).save(f'{OUT}/debug_fill.png')
blank = A.copy()
blank[py0 - M_:py1 + M_, px0 - M_:px1 + M_] = E.astype(np.float32)

# ---------------------------------------------------------------------------------------------- the pieces
# cannon 1: under the button, a dark recess inside the gold bezel (seen when the button is pressed in); the same
# colours as cannon 2's
cannon = A.copy()
sm = np.clip(nd.gaussian_filter(st, 0.6) * 1.15, 0, 1)[..., None]
v = np.clip((yy - py0) / (py1 - py0), 0, 1)[..., None]
recess = np.array([40, 12, 4], np.float32) * (1 - v) + np.array([92, 30, 10], np.float32) * v
cannon[..., :3] = cannon[..., :3] * (1 - sm) + recess * sm

# its gold ring only, drawn above a loaded ball: half there at the gold's inner edge, solid half a canvas px further
# out, to just past the ring's dark outer outline
d = np.hypot(xx - ecx, yy - ecy)
th = np.arctan2(yy - ecy, xx - ecx)
ramp = np.clip((d - edge_at(th)) * K + 0.5, 0, 1) * np.clip(r_out + 1 - d, 0, 1)
front = cannon.copy()
front[..., 3] *= ramp

# the button: the pill (word erased), cut on its stadium
M3 = 3
fb = (px0 - M3, py0 - M3, px1 + M3, py1 + M3)
fire = blank.copy()
fire[..., 3] = st * 255


def place(img, box, size):
    """resample an art region onto `size` px (box in art px, continuous), premultiplied, Lanczos"""
    pad = 64
    big = np.zeros((H + 2 * pad, W + 2 * pad, 4), np.float32)
    big[pad:pad + H, pad:pad + W] = img
    al = big[..., 3] / 255
    bx = tuple(v_ + pad for v_ in box)
    ch = [Image.fromarray(big[..., c] * al).resize(size, Image.LANCZOS, box=bx) for c in range(3)]
    ao = np.array(Image.fromarray(al).resize(size, Image.LANCZOS, box=bx))
    out = np.zeros((size[1], size[0], 4), np.float32)
    ok = ao > 1e-4
    for c in range(3):
        out[..., c] = np.where(ok, np.array(ch[c]) / np.maximum(ao, 1e-4), 0)
    out[..., 3] = np.clip(ao, 0, 1) * 255
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))


cbox = (AX - CX / K, BOT - CROW / K)
cbox = (cbox[0], cbox[1], cbox[0] + CW / K, cbox[1] + CH / K)
ims = {'cannon1': place(cannon, cbox, (CW, CH)), 'cannon1_front': place(front, cbox, (CW, CH))}
fsz = (round((fb[2] - fb[0]) * K), round((fb[3] - fb[1]) * K))
ims['fire'] = place(fire, fb, fsz)
for k_, im in ims.items():
    im.save(f'{OUT}/{k_}.png', optimize=True)

# ---------------------------------------------------------------------------------------------- geometry
hx, hy = to_canvas(ecx, ecy)
r_hole = (r_in_max * K + UNDER) / SEAT
low = (A[BOT - 12:BOT - 2, :, 3] > 128)
cols = np.nonzero(low.any(0))[0]
fcx, fcy = to_canvas((px0 + px1) / 2 - 0.5, (py0 + py1) / 2 - 0.5)
sx, sy = fsz[0] / (fb[2] - fb[0]), fsz[1] / (fb[3] - fb[1])
geo = dict(
    holes=[[round(hx / CW, 4), round(hy / CH, 4), round(r_hole / CW, 4)]],
    foot=dict(w=round((cols.max() - cols.min() + 1) * K / CW, 4)),
    fire=dict(cx=round(fcx / 2, 1), cy=round(fcy / 2, 1), w=round((px1 - px0) * K / 2, 1), h=round((py1 - py0) * K / 2, 1),
              art=[fsz[0], fsz[1], round((px1 - px0) * sx, 1), round((py1 - py0) * sy, 1)]),
    _check=dict(art_bottom_row=BOT, hole_fit_art=[round(hcx, 1), round(hcy, 1), round(hr0, 1)],
                ring_inner_art=[round(ecx, 1), round(ecy, 1), round(er.min(), 1), round(er.max(), 1)], ring_outer_art=round(r_out, 1),
                ring_inner_canvas_max=round(r_in_max * K, 2), pill_art=[px0, py0, px1, py1], pill_iou=round(iou, 4),
                word_band=[int(y0w), int(y1w)], word_px=int(word.sum()), fill_px=int(fill.sum()),
                art_top_canvas=round(to_canvas(0, np.nonzero((A[..., 3] > 128).any(1))[0].min())[1], 1)))
print(json.dumps(geo, default=lambda o_: o_.item() if hasattr(o_, 'item') else str(o_)))

# preview: the stack as the game draws it (body, button, a ball-coloured disc in the socket, the front ring)
pv = Image.new('RGBA', (CW, CH), (128, 128, 128, 255))
pv.alpha_composite(ims['cannon1'])
fx0, fy0 = fcx - (fsz[0] / sx * K) / 2, fcy - (fsz[1] / sy * K) / 2
pv.alpha_composite(ims['fire'], (round(fx0), round(fy0)))
orb = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
ro_ = r_hole * SEAT
ImageDraw.Draw(orb).ellipse((hx - ro_, hy - ro_, hx + ro_, hy + ro_), fill=(60, 140, 255, 255))
pv.alpha_composite(orb)
pv.alpha_composite(ims['cannon1_front'])
pv.convert('RGB').save(f'{OUT}/preview.png')
