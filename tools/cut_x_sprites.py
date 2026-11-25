# x's moods, from the pictures the user made in ChatGPT on 23 Nov 2026 (kept in art/sprite_sheets/x_moods/):
#   cry_in_cage.png  6 frames, 3 × 2: x crying in its cage         → assets/img/x_cry.webp      (x sad, no tears: 3
#                                                                    frames in one row, see below)
#                                                                  → assets/img/cage_empty.webp (frame 1's cage, x out)
#                                                                  → assets/img/cage_crack.webp (frame 1's cage round x)
#   dance.png        6 frames, 3 × 2: the freed x dancing (a loop) → assets/img/x_dance.webp    (the 6 in one row)
#   free.png         x free and dancing by its broken cage         → assets/img/x_free.webp     (the end card)
# It prints the numbers the game needs (SPR and CAGE in src/30_stage.js). (It took over from tools/cut_cage_break.py,
# which cut the empty cage from the old caged x.)
#
# The frames are drawn by hand, so they never sit exactly alike in their cells. Here:
#   • the crying frames are lined up on their cage (its dome and its base, the same in all six), so in the game the
#     cage stands perfectly still and only x moves
#   • the dance frames are lined up on x's body: its middle on one line, its feet on one floor (the sheet draws two of
#     them a hop higher; the game makes that hop itself, smoothly, in step with the frames)
#   • each frame keeps only what lies in its own cell of the sheet (no neighbour's edge comes along)
#   • the frames of a sheet all get the same box (the union of all six, a few px clear round it), so the row of them
#     can be shown through a window one frame wide: the game slides the row along, frame by frame
#   • ChatGPT's alpha is never quite solid (250–254) and leaves a faint haze round the art: solid becomes solid and
#     the haze goes
#   • x is sad in its cage, not crying (the user, 25 Nov 2026): only the frames where its eyes are open (1, 2 and 6;
#     in 3–5 it squeezes them shut and wails) are kept, with their tears painted out (tools/dry_tears.py)
#   • the empty cage (its shards, when the cage breaks: CageBreak) is frame 1's cage with x taken out: x's body with
#     its face, gloves, arms and tears go; the two front bars stay (filled in where a glove hid them); the floor under
#     x's feet is filled in smoothly from the floor round it; the rest of x's place is see-through (the free x covers
#     it as the pieces fly)
#   • the cracks run only where the cage shows round x in frame 1 (cage_crack: a mask), so they never cross x's gloves
#     or feet, where the empty cage was filled in
# Run: ~/.cache/bj-voices/venv/bin/python tools/cut_x_sprites.py [--debug DIR]   (Pillow + numpy + scipy; cwebp on PATH)
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage as nd

from dry_tears import dry

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'art', 'sprite_sheets', 'x_moods')
IMG = os.path.join(ROOT, 'assets', 'img')
DEBUG = sys.argv[sys.argv.index('--debug') + 1] if '--debug' in sys.argv else None
CAGE_U = (199, 262)  # the cage's units in the game (CAGE.w × CAGE.h): the crying frames' box keeps these proportions
SIDE = 7             # px kept clear at each side of a frame (so sliding the row never shows a neighbour's edge)


def load(name):
    return np.array(Image.open(os.path.join(ART, name)).convert('RGBA')).astype(np.float32)


def clean(a):
    """ChatGPT's alpha: 250–254 where solid, a faint haze (1–15) round the art → solid where solid, no haze."""
    out = a.copy()
    out[..., 3] = np.clip((a[..., 3] - 6) / (238 - 6), 0, 1) * 255
    out[..., :3] = np.where(out[..., 3:] > 0, out[..., :3], 0)
    return out


def webp(arr, name, q=90):
    """Saves arr as assets/img/name: lossy colour with lossless alpha (q = None: all lossless, for a mask)."""
    path = os.path.join(IMG, name)
    with tempfile.TemporaryDirectory() as td:
        png = os.path.join(td, 'x.png')
        Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA').save(png)
        how = ['-lossless', '-z', '9'] if q is None else ['-q', str(q), '-alpha_q', '100', '-m', '6', '-sharp_yuv']
        subprocess.run(['cwebp', '-quiet', *how, png, '-o', path], check=True)
        if DEBUG:
            Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(DEBUG, name.replace('.webp', '.png')))
    return os.path.getsize(path)


def frames(A):
    """The 6 frames of a 3 × 2 sheet, row by row: where each one's art starts (its big blob, alpha > 100) and the cell
    it may take pixels from (cut halfway between its art and its neighbours' art, haze included)."""
    h, w = A.shape[:2]
    solid, soft = A[..., 3] > 100, A[..., 3] > 8
    lab, n = nd.label(solid)
    sizes = nd.sum(solid, lab, range(1, n + 1))
    fr = []
    for i, o in enumerate(nd.find_objects(lab)):
        if sizes[i] < 5000:
            continue
        cy, cx = (o[0].start + o[0].stop) / 2, (o[1].start + o[1].stop) / 2
        # its art: the blob and whatever lies within 30 px of it (tears and sparkles are blobs of their own)
        near = np.zeros((h, w), bool)
        near[o] = lab[o] == i + 1
        near = nd.binary_dilation(near, iterations=30) & soft
        ys, xs = np.nonzero(near)
        fr.append({'col': int(cx // (w / 3)), 'row': int(cy // (h / 2)), 'x0': o[1].start, 'y0': o[0].start,
                   'ax0': xs.min(), 'ax1': xs.max() + 1, 'ay0': ys.min(), 'ay1': ys.max() + 1})
    fr.sort(key=lambda f: (f['row'], f['col']))
    assert len(fr) == 6 and len({(f['row'], f['col']) for f in fr}) == 6, 'expected 6 frames, 3 × 2'
    cut_x = [0] + [int((max(f['ax1'] for f in fr if f['col'] == c) + min(f['ax0'] for f in fr if f['col'] == c + 1)) / 2) for c in (0, 1)] + [w]
    cut_y = [0, int((max(f['ay1'] for f in fr if f['row'] == 0) + min(f['ay0'] for f in fr if f['row'] == 1)) / 2), h]
    for f in fr:
        f['cx0'], f['cx1'], f['cy0'], f['cy1'] = cut_x[f['col']], cut_x[f['col'] + 1], cut_y[f['row']], cut_y[f['row'] + 1]
    return fr


def own(A, f):
    """The sheet with everything outside frame f's cell cleared."""
    B = np.zeros_like(A)
    B[f['cy0']:f['cy1'], f['cx0']:f['cx1']] = A[f['cy0']:f['cy1'], f['cx0']:f['cx1']]
    return B


def union(A, fr, org):
    """The box (left, top, right, bottom) round all six frames' art, each measured from its own origin."""
    l = t = 10 ** 9
    r = b = -10 ** 9
    for f, (ox, oy) in zip(fr, org):
        ys, xs = np.nonzero(own(A, f)[..., 3] > 8)
        l, r, t, b = min(l, xs.min() - ox), max(r, xs.max() - ox), min(t, ys.min() - oy), max(b, ys.max() - oy)
    return l, t, r, b


def cut(A, fr, org, box):
    """Each frame from its own cell, at its origin + box (left, top, W, H), cleaned."""
    l, t, W, H = box
    P = 80
    out = []
    for f, (ox, oy) in zip(fr, org):
        B = np.pad(own(A, f), ((P, P), (P, P), (0, 0)))
        out.append(clean(B[P + oy + t:P + oy + t + H, P + ox + l:P + ox + l + W]))
    return out


def colours(F):
    r, g, b, a = (F[..., i] for i in range(4))
    gold = (r > 140) & (g > 70) & (b < 150) & (r - b > 60) & (g > b + 25) & (a > 60)  # (warm, far more green than blue)
    purple = (b > g + 30) & (r > g + 10) & (a > 100)
    return r, g, b, a, gold, purple


# =============================================================================== the crying x in its cage
A = load('cry_in_cage.png')
fr = frames(A)
al = A[..., 3]


def cage_err(i, dx, dy):
    """How unlike frame 1's cage frame i's is, moved by (dx, dy): its dome (top 150 rows) and its base (rows 400–470)."""
    X0, Y0, x0, y0 = fr[0]['x0'], fr[0]['y0'], fr[i]['x0'] + dx, fr[i]['y0'] + dy
    return sum(np.mean((al[Y0 + a0:Y0 + a1, X0 - 10:X0 + 375] - al[y0 + a0:y0 + a1, x0 - 10:x0 + 375]) ** 2) for a0, a1 in ((0, 150), (400, 470)))


org = []
for i, f in enumerate(fr):
    _, dx, dy = min((cage_err(i, dx, dy), dx, dy) for dy in range(-8, 9) for dx in range(-8, 9))
    org.append((f['x0'] + dx, f['y0'] + dy))
l, t, r, b = union(A, fr, org)
CW = (r - l + 1) + 2 * SIDE
CH = round(CW * CAGE_U[1] / CAGE_U[0])
if CH < (b - t + 1) + 8:
    CH = (b - t + 1) + 8
    CW = round(CH * CAGE_U[0] / CAGE_U[1])
cry = cut(A, fr, org, (l - (CW - (r - l + 1)) // 2, t - (CH - (b - t + 1)) // 2, CW, CH))
cry = [dry(cry[0]), dry(cry[1]), dry(cry[5], lid=22)]  # (sad, no tears: frame 6's eyes have a lid over their top)
size_cry = webp(np.concatenate(cry, 1), 'x_cry.webp', q=84)

# ---- frame 1 measured: x's body, gloves, arms and tears; the cage's front bars and floor
F = cry[0]
r_, g_, b_, a_, gold, purple = colours(F)
h, w = a_.shape
lab, n = nd.label(purple)
sizes = nd.sum(purple, lab, range(1, n + 1))
body = nd.binary_fill_holes(np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 25]))  # (all its parts: the bars cut it up; its face inside)
white = (F[..., :3].min(-1) > 165) & (a_ > 120) & ~gold
lab, n = nd.label(white & ~body)
near = nd.binary_dilation(body, iterations=4)
gloves = np.isin(lab, [i for i in range(1, n + 1) if (near & (lab == i)).any() and (lab == i).sum() > 60])
gloves = nd.binary_fill_holes(nd.binary_closing(gloves, iterations=2))
dark = (F[..., :3].max(-1) < 100) & (a_ > 120) & ~gold
lab, n = nd.label(dark & ~body & ~gloves)
near = nd.binary_dilation(gloves, iterations=3) | nd.binary_dilation(body, iterations=2)
arms = np.isin(lab, [i for i in range(1, n + 1) if (near & (lab == i)).any() and (lab == i).sum() < 2500])
tears = (b_ > r_ + 25) & (b_ > 150) & (a_ > 40) & ~gold  # (light blue)
X = body | gloves | arms | tears
X |= nd.binary_dilation(X, iterations=2) & ~gold  # (the fringe of mixed pixels round it)

bys, bxs = np.nonzero(body)
x_cx, x_top, x_feet = float(bxs.mean()), int(bys.min()), int(bys.max())
gl, gn = nd.label(gloves)
hands = sorted(tuple(map(float, nd.center_of_mass(gl == i)))[::-1] for i in range(1, gn + 1) if (gl == i).sum() > 200)
assert len(hands) == 2, f'expected 2 gloves, found {len(hands)}'
# the bars in front of x: gold columns that run down through x's body
front, c0 = [], None
for c in range(w + 1):
    on = c < w and gold[x_top + 20:x_feet - 10, c].mean() > 0.55 and body[x_top:x_feet, max(0, c - 12):c + 13].any()
    if on and c0 is None:
        c0 = c
    elif not on and c0 is not None:
        if c - 1 - c0 >= 6:
            front.append((c0 - 3, c + 2))  # (with their outline)
        c0 = None
# the floor: its back edge, where its gold first shows between x's legs
cx = int(round(x_cx))
floor = next(y for y in range((x_top + x_feet) // 2, h) if gold[y, cx - 10:cx + 11].mean() > 0.5)

# ---- the empty cage: x out, the front bars filled in where a glove hid them, the floor filled in under x's feet
out = F.copy()
known = ~X
GAP = int(0.2 * h)  # a masked run this short in a front bar's column is a glove in front of the bar
for c in [c for c0, c1 in front for c in range(max(0, c0), min(w, c1 + 1))]:
    col, y = X[:, c], 0
    while y < h:
        if not col[y]:
            y += 1
            continue
        y0 = y
        while y < h and col[y]:
            y += 1
        y1 = y - 1
        if y1 - y0 + 1 <= GAP and y0 > 0 and y1 < h - 1 and a_[y0 - 1, c] > 200 and a_[y1 + 1, c] > 200:
            top, bot = F[y0 - 1, c], F[y1 + 1, c]
            for k, yy in enumerate(range(y0, y1 + 1)):
                tt = (k + 1) / (y1 - y0 + 2)
                out[yy, c] = top * (1 - tt) + bot * tt
            known[y0:y1 + 1, c] = True
rows = np.arange(h)[:, None]
hole = ~known & (rows >= floor)
rgb = out[..., :3].copy()
fixed = known & (out[..., 3] > 200)
rgb[hole] = rgb[fixed & (rows >= floor)].mean(0)
feed = (fixed | hole)
for _ in range(900):  # (a Laplace fill: each hole pixel becomes the mean of its neighbours, over and over)
    s = np.zeros_like(rgb)
    cnt = np.zeros((h, w, 1), np.float32)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ok = np.roll(feed, (dy, dx), (0, 1))[..., None].astype(np.float32)
        s += np.roll(rgb, (dy, dx), (0, 1)) * ok
        cnt += ok
    rgb = np.where(hole[..., None], s / np.maximum(cnt, 1), rgb)
out[..., :3] = np.where(hole[..., None], rgb, out[..., :3])
out[..., 3] = np.where(hole, 255, out[..., 3])
known |= hole
out[..., 3] = np.where(known, out[..., 3], 0)
out[..., :3] = np.where(out[..., 3:] > 0, out[..., :3], 0)
size_empty = webp(out, 'cage_empty.webp', q=90)
# ---- the cracks' mask: the cage only where it shows round x in frame 1 (white; its alpha is the mask)
mask = np.full_like(F, 255)
mask[..., 3] = np.where(X, 0, a_)
size_crack = webp(mask, 'cage_crack.webp', q=None)
u = CAGE_U[0] / CW  # cage units per px

# =============================================================================== the freed x dancing
D = load('dance.png')
dfr = frames(D)
dpurple = colours(D)[5]
dorg, bodies = [], []
for f in dfr:
    m = own(dpurple[..., None].astype(np.float32), f)[..., 0] > 0
    lab, n = nd.label(m)
    sizes = nd.sum(m, lab, range(1, n + 1))
    bd = nd.binary_fill_holes(np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 400]))
    ys, xs = np.nonzero(bd)
    dorg.append((int(round(xs.mean())), int(ys.max())))  # (its middle: the body's centre of mass; its feet: the body's lowest row)
    bodies.append({'h': int(ys.max() - ys.min() + 1), 'w': int(xs.max() - xs.min() + 1), 'area': int(bd.sum())})
l, t, r, b = union(D, dfr, dorg)
half = max(-l, r) + SIDE
DW, DH = 2 * half + 1, (b - t + 1) + 6  # (x's middle in the middle; 6 px clear above, its feet at the bottom)
dance = cut(D, dfr, dorg, (-half, t - 6, DW, DH))
size_dance = webp(np.concatenate(dance, 1), 'x_dance.webp', q=84)
feet = -(t - 6)  # (the feet's row: px from the box's top)

# =============================================================================== x free by its broken cage (one picture)
S1 = load('free.png')
ys, xs = np.nonzero(S1[..., 3] > 8)
x0, x1 = max(0, xs.min() - 10), min(S1.shape[1], xs.max() + 11)
y0, y1 = max(0, ys.min() - 10), min(S1.shape[0], ys.max() + 11)
pic = clean(S1[y0:y1, x0:x1])
k = 900 / max(pic.shape[:2])
if k < 1:  # (resized with its colour premultiplied, so no dark fringe)
    p = pic.copy()
    p[..., :3] *= p[..., 3:] / 255
    size = (round(pic.shape[1] * k), round(pic.shape[0] * k))
    q = np.stack([np.array(Image.fromarray(p[..., i]).resize(size, Image.LANCZOS)) for i in range(4)], -1)
    q[..., 3] = np.clip(q[..., 3], 0, 255)
    q[..., :3] = np.where(q[..., 3:] > 0.5, q[..., :3] / np.maximum(q[..., 3:] / 255, 1e-6), 0)
    pic = q
size_free = webp(pic, 'x_free.webp', q=86)

print(json.dumps({
    'x_cry.webp': {'frame': [CW, CH], 'n': len(cry), 'kB': round(size_cry / 1024)},
    'cage_empty.webp': {'size': [CW, CH], 'kB': round(size_empty / 1024)},
    'cage_crack.webp': {'size': [CW, CH], 'kB': round(size_crack / 1024)},
    'CAGE (cage units %d x %d)' % CAGE_U: {
        'x': {'cx': round(x_cx * u, 1), 'feet': round(x_feet * u, 1), 'h': round((x_feet - x_top + 1) * u, 1)},
        'hands': [[round(hx * u, 1), round(hy * u, 1)] for hx, hy in hands],
        'floor': round(floor * u, 1), 'front bars (px)': front,
    },
    'x_dance.webp': {'frame': [DW, DH], 'feet': feet, 'bodies': bodies, 'kB': round(size_dance / 1024)},
    'x_free.webp': {'size': [pic.shape[1], pic.shape[0]], 'kB': round(size_free / 1024)},
}, indent=1, default=lambda o: o.item()))
