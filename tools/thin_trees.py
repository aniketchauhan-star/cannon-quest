# Fewer trees in the background (the user, 23 Nov: "too many trees… remove some… not clutter… so the cloud and the
# equation show"). Takes out the three big trees that tower over the forest: the two on the right (the tallest one
# and the one beside it) and the big one on the left. The yellow-green tree in front on the right, the small tree on
# the far left and the forest in the middle stay as painted.
#
# Inputs: the full layers as tools/cut_deck_bg.py made them, kept in art/background/ (bg_trees_full.webp,
# bg_mount_full.webp). Outputs: assets/img/bg_trees.webp and bg_mount.webp (the game's layers, 2x, same boxes).
#   • trees: where a big tree stood, the forest is refilled with low canopy from the middle of the same picture
#     (the part the cannon stands in front of), mirrored on the right so it does not repeat; two bands, the treetops
#     and the dense forest under the ropes, joined under the upper rope. Above the new treetops it is see-through.
#   • mountains: where the crowns hid them, the ridge runs on as a clean line between the parts that were in view,
#     and the slopes are filled smoothly from the colours around them (no smears).
# Run: ~/.cache/bj-voices/venv/bin/python tools/thin_trees.py   (Pillow + numpy + scipy; cwebp on the PATH)
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage as nd
from scipy import sparse
from scipy.sparse.linalg import spsolve

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'art', 'background')
OUT = os.path.join(ROOT, 'assets', 'img')
TOP_T, TOP_M = 263.5, 261.5  # the layers' tops in bg units (#bgTrees / #bgMount in src/00_head.html); saved at 2x

T0 = np.asarray(Image.open(os.path.join(ART, 'bg_trees_full.webp')).convert('RGBA')).astype(np.float32) / 255
M0 = np.asarray(Image.open(os.path.join(ART, 'bg_mount_full.webp')).convert('RGBA')).astype(np.float32) / 255
HT, W = T0.shape[:2]
HM = M0.shape[0]
ty = lambda y: (y - TOP_T) * 2  # bg units -> trees px
my = lambda y: (y - TOP_M) * 2  # bg units -> mount px
YT = np.arange(HT, dtype=np.float32)[:, None]
XT = np.arange(W, dtype=np.float32)[None, :]


def ramp(v, a, b):  # 0 at a, 1 at b (either direction), smoothstep
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def pm(a):  # premultiplied
    return np.concatenate([a[..., :3] * a[..., 3:], a[..., 3:]], -1)


def unpm(p):
    al = p[..., 3:]
    return np.concatenate([np.where(al > 1e-4, p[..., :3] / np.maximum(al, 1e-4), 0), al], -1)


P = pm(T0)


def patch(dx0, dx1, sx0, mirror):
    """the trees layer's columns for dest x dx0..dx1 (bg units), taken from source x sx0.. (mirrored or not)"""
    xs = np.arange(int(dx0 * 2), int(dx1 * 2))
    src = (int(sx0 * 2) + (xs[-1] - xs)) if mirror else (int(sx0 * 2) + (xs - xs[0]))
    return xs, pm(T0)[:, src]


def put(xs, src, wmask):
    """blend src into the working layer at columns xs by weight wmask (HT x len(xs))"""
    w = wmask[..., None]
    P[:, xs] = P[:, xs] * (1 - w) + src * w


ROPE = 505  # the bands meet here, under the upper rope


def refill(dx0, dx1, top_src, low_src, mirror, feather_l, feather_r, bottom=640):
    """refill dest columns dx0..dx1: treetops from top_src, the dense forest under the rope from low_src"""
    xs, up = patch(dx0, dx1, top_src, mirror)
    _, lo = patch(dx0, dx1, low_src, mirror)
    x = xs[None, :].astype(np.float32) / 2
    side = np.ones_like(x)
    if feather_l: side = side * ramp(x, dx0, dx0 + feather_l)
    if feather_r: side = side * ramp(x, dx1, dx1 - feather_r)
    y = YT / 2 + TOP_T
    k = ramp(y, ROPE - 9, ROPE + 9)  # 0 = treetop band, 1 = lower band
    src = up * (1 - k[..., None]) + lo * k[..., None]
    wm = side * ramp(y, bottom + 10, bottom)  # (fades out under the deck, where nothing shows)
    put(xs, src, np.broadcast_to(wm, (HT, len(xs))).copy())


def clear(poly_fn, feather):
    """make the trees layer see-through where poly_fn(x, y) > 0 (a signed distance in bg units, + inside)"""
    d = poly_fn(XT / 2, YT / 2 + TOP_T)
    k = ramp(d, 0, feather)
    P[...] = P * (1 - k[..., None])


# ---------- right: the tall tree and the big tree beside it ----------
# above the yellow-green tree (it stays): see-through from x 1232 to 1418, down to just over its crown
def cut_right(x, y):
    floor = np.where(x < 1340, 391, np.minimum(391 + (x - 1340) * 1.2, 478))  # down to the deck past the tree's top
    return np.minimum(np.minimum(x - 1232, 1446 - x), floor - y)


clear(cut_right, 5)
# x 1418 → the right edge: low canopy (mirrored from the middle: treetops x 655.., the forest under the ropes x 530..)
refill(1420, 1672, 688, 530, True, 12, 0)
# the yellow-green tree's own leaf clusters on its right side come back over the cut, so its edge stays leafy (its
# bright clusters, found by colour, with their dark rims); the stub of the old trunk above it does not
Z = (XT / 2 >= 1330) & (XT / 2 < 1468) & (YT / 2 + TOP_T >= 372) & (YT / 2 + TOP_T < 478)
r, g, b_ = T0[..., 0], T0[..., 1], T0[..., 2]
lobe = Z & (T0[..., 3] > 0.9) & (g > 0.66) & (r > 0.40) & (b_ < 0.6)
lobe = nd.binary_closing(lobe, iterations=2)
lab, nl = nd.label(lobe)
if nl:  # only the clusters of the yellow-green tree itself: big enough, and lying low and left (the old tree's
    ids = np.arange(1, nl + 1)  # own lower clusters sit higher and further right; they must not stay floating)
    size = nd.sum(lobe, lab, ids)
    cy, cx = np.array(nd.center_of_mass(lobe, lab, ids)).T
    ok = (size >= 220) & (cx / 2 < 1385) & (cy / 2 + TOP_T > 410)
    lobe = np.isin(lab, ids[ok])
lobe = nd.binary_dilation(lobe, iterations=3) & Z
keep = nd.gaussian_filter(lobe.astype(np.float32), 1.0)
P[...] = pm(T0) * keep[..., None] + P * (1 - keep[..., None])

# ---------- left: the big tree ----------
# the tips of its crown that stand over the mid tree on its right (which stays)
def cut_left(x, y):
    return np.minimum(np.minimum(x - 522, 554 - x), 391 - y)


clear(cut_left, 4)
# x 262 → 545: the forest right of the middle (x 945 → 1231, rising toward the right), mirrored, so its treetops meet
# the small tree's side high and the mid tree's side low, as the neighbours do
refill(262, 545, 945, 560, True, 12, 10)

T = unpm(P)

# ---------- mountains behind the old crowns ----------
M = M0.copy()
YM = np.arange(HM, dtype=np.float32)[:, None] / 2 + TOP_M
XM = np.arange(W, dtype=np.float32)[None, :] / 2
# the ridge (bg y) per column: as cut, except across the hidden spans, where it runs straight between seen points
ridge = 261.5 + np.argmax(M0[..., 3] > 0.5, axis=0) / 2
xcol = np.arange(W) / 2
for pts in [(1250, 1470), (322, 386, 478)]:
    a, b = pts[0], pts[-1]
    ia, ib = int(a * 2), int(b * 2)
    ys = [ridge[ia]] + [ridge[ia] + 22] * (len(pts) - 2) + [ridge[ib]]  # (a gentle saddle between the two left peaks)
    ridge[ia:ib] = np.interp(xcol[ia:ib], list(pts), ys)
# where the mountains now show that the trees used to hide (with a margin), in the edited spans only
Tm_old = np.zeros((HM, W), np.float32); Tm_new = np.zeros((HM, W), np.float32)
r0 = int(round(my(TOP_T)))  # the trees layer starts this many mount px lower
n = min(HM - r0, HT)
Tm_old[r0:r0 + n] = T0[:n, :, 3]; Tm_new[r0:r0 + n] = T[:n, :, 3]
span = np.zeros(W, bool)
for (a, b) in [(1226, 1672), (256, 560)]:
    span[int(a * 2):int(b * 2)] = True
hidden = (nd.maximum_filter(Tm_old, 9) > 0.04) & span[None, :]
# the new silhouette: a clean anti-aliased ridge across the spans
alpha_new = np.clip((YM - ridge[None, :]) * 2 + 0.5, 0, 1)
M[..., 3] = np.where(span[None, :], alpha_new, M0[..., 3])
# colours: a smooth (harmonic) fill of the hidden part, held by the mountain colours that were in view around it
known = (M0[..., 3] > 0.9) & ~hidden & (YM > ridge[None, :] + 1.5)
unk = hidden & (M[..., 3] > 0)
idx = -np.ones((HM, W), np.int64); idx[unk] = np.arange(unk.sum())
rows, cols, vals = [], [], []
N = int(unk.sum()); b = np.zeros((N, 3))
uy, ux = np.nonzero(unk)
diag = np.zeros(N)
for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
    vy, vx = uy + dy, ux + dx
    ok = (vy >= 0) & (vy < HM) & (vx >= 0) & (vx < W)
    vy2, vx2 = np.clip(vy, 0, HM - 1), np.clip(vx, 0, W - 1)
    nu = ok & unk[vy2, vx2]
    nk = ok & known[vy2, vx2]
    i = np.nonzero(nu)[0]
    rows += [i]; cols += [idx[vy2[i], vx2[i]]]; vals += [-np.ones(len(i))]
    diag += (nu | nk)
    j = np.nonzero(nk)[0]
    b[j] += M0[vy2[j], vx2[j], :3]
A = sparse.csr_matrix((np.concatenate(vals + [diag + 1e-6]), (np.concatenate(rows + [np.arange(N)]), np.concatenate(cols + [np.arange(N)]))), shape=(N, N))
sol = spsolve(A.tocsc(), b)
rgb = M[..., :3].copy()
rgb[uy, ux] = np.clip(sol, 0, 1)
# a gentle seam: blend the fill over 3 px into what was there
blend = nd.gaussian_filter(unk.astype(np.float32), 1.5)
M[..., :3] = M0[..., :3] * (1 - blend[..., None]) + rgb * blend[..., None]
M[..., :3] = np.where(unk[..., None], rgb, M[..., :3])


def save(a, name, q):
    img = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
    with tempfile.TemporaryDirectory() as td:
        png = os.path.join(td, 'l.png'); img.save(png)
        subprocess.run(['cwebp', '-quiet', '-q', str(q), '-alpha_q', '100', '-exact', png, '-o', os.path.join(OUT, name)], check=True)
    print('wrote', name)


save(T, 'bg_trees.webp', 82)
save(M, 'bg_mount.webp', 82)
