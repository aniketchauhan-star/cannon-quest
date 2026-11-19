# Cut the user's deck background into the game's parallax layers (#bg in src/00_head.html, src/32_scenery.js).
#
# Source: art/background/new_background.png, the user's finished picture (1672x941 = the game's art space), and
# art/background/new_background_2x.png, the same picture made 2x by EDSR (tools/upscale2x.py). The layers are cut
# from the 2x copy so they stay sharp on retina screens. art/background/new_background_sheet.png is the user's sheet
# of the same parts; the finished picture is the look to match, so the cut follows it pixel for pixel.
#
# With the camera at rest, the layers stack back into exactly the picture (the script checks this and prints the
# error). When the camera moves, the far layers drift less than the deck (PARALLAX in src/30_stage.js). So each
# layer also holds what would be behind the edge of the layer in front of it: the sky goes on under the mountains,
# the mountains go on under the trees, and the trees go on behind the railing and under the deck. The camera moves
# the layers apart by ~25 bg px at most, so only a thin strip of that ever shows. It is filled from the picture
# itself: smooth for the sky and the misty mountains, mirrored for the textured trees.
#
# Layers, back to front (bg units = the 1672x941 frame; saved at 2x):
#   bg_sky                 the sky without its clouds (a smooth fit; a gradient, so it is saved small and stretched)
#   bg_clouds              the five clouds, lifted off the sky (each one drifts on its own: src/32_scenery.js)
#   bg_mount               the mountains
#   bg_trees               the forest and the big trees
#   bg_plantL, bg_plantR   the two leafy plants behind the railing (they sway in the wind)
#   bg_deck                the railing (posts + ropes) and the wooden deck
# It prints each layer's box in bg units for the CSS (#bg… in src/00_head.html) and writes the .webp files.
#
# Run (a Python with Pillow, numpy, scipy and OpenCV; cwebp on the PATH):
#   python tools/cut_deck_bg.py [out_dir]          (out_dir defaults to assets/img/)
import json
import os
import subprocess
import sys
import tempfile

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy import sparse
from scipy.sparse.linalg import factorized

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ART = os.path.join(ROOT, 'art', 'background')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'img')
S = 2  # the layers are saved at 2x bg units

ref1 = np.asarray(Image.open(os.path.join(ART, 'new_background.png')).convert('RGB'), np.float32)
img = np.asarray(Image.open(os.path.join(ART, 'new_background_2x.png')).convert('RGB'), np.float32)
H1, W1 = ref1.shape[:2]
H, W = img.shape[:2]
assert (H, W) == (H1 * S, W1 * S), 'the 2x picture must be exactly twice the picture'
yy, xx = np.mgrid[0:H, 0:W]
R, G, B = img[..., 0], img[..., 1], img[..., 2]
U = lambda v: int(round(v * S))  # bg units -> 2x px


# ---------- helpers ----------
def disk(r):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)).astype(bool)


def dilate(m, r):
    return ndi.binary_dilation(m, disk(r))


def erode(m, r):
    return ndi.binary_erosion(m, disk(r), border_value=1)


def nearest(known):
    """for every pixel, the (y, x) of the nearest pixel in `known`, and the distance to it"""
    d, (iy, ix) = ndi.distance_transform_edt(~known, return_indices=True)
    return d, iy, ix


def fill_small_holes(m, area):
    holes = ndi.binary_fill_holes(m) & ~m
    lab, n = ndi.label(holes)
    if n == 0:
        return m
    sizes = ndi.sum(holes, lab, np.arange(1, n + 1))
    small = np.zeros(n + 1, bool)
    small[1:] = sizes < area
    return m | small[lab]


def drop_specks(m, area):
    lab, n = ndi.label(m)
    if n == 0:
        return m
    sizes = ndi.sum(m, lab, np.arange(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= area
    return keep[lab]


def matte(core, band, bg, unmix_max=None, exact=True):
    """Soft edges. Inside `core` the layer is the picture (alpha 1). In `band` (just outside it), a pixel is a mix of
    the layer's colour (that of the nearest core pixel) and what is behind it (`bg`), so alpha is how far the picture's
    colour lies along that line, and the colour is un-mixed so the stack gives back the picture's pixel exactly.
    unmix_max: where un-mixing would move a colour further than this from the layer's own, keep the layer's colour
    (for the clouds: no blue specks on their rims when they drift).
    exact: a band pixel that no mix gives back (a light rim, a dark outline) is kept as it is, opaque."""
    _, iy, ix = nearest(core)
    F = img[iy, ix]
    d = F - bg
    a = np.clip(((img - bg) * d).sum(-1) / np.maximum((d * d).sum(-1), 1e-6), 0, 1)
    a[(d * d).sum(-1) < 400] = 1.0  # (layer and background alike: nothing to un-mix, keep the pixel)
    a = np.where(core, 1.0, np.where(band, a, 0.0))
    a[a < 0.03] = 0
    col = np.where(core[..., None], img, F)
    m = band & (a > 0)
    col[m] = np.clip((img[m] - (1 - a[m, None]) * bg[m]) / a[m, None], 0, 255)
    if unmix_max is not None:
        far = m & (np.abs(col - F).max(-1) > unmix_max)
        col[far] = F[far]
    if exact:
        off = band & (np.abs(col * a[..., None] + bg * (1 - a[..., None]) - img).max(-1) > 8)
        a[off] = 1.0
        col[off] = img[off]
    return col, a


def mirror_fill(col, known, todo, passes=8):
    """Fill `todo` with the picture mirrored across the nearest edge of `known` (keeps the foliage's texture). In
    passes: a pixel whose mirror image is not known yet waits for a later pass, when the filled part can mirror it.
    Whatever is left at the end takes the nearest colour."""
    out, kn = col.copy(), known.copy()
    for _ in range(passes):
        left = todo & ~kn
        if not left.any():
            break
        _, iy, ix = nearest(kn)
        ty, tx = np.nonzero(left)
        qy, qx = iy[ty, tx], ix[ty, tx]
        my, mx = 2 * qy - ty, 2 * qx - tx
        myc, mxc = np.clip(my, 0, H - 1), np.clip(mx, 0, W - 1)
        good = (my == myc) & (mx == mxc) & kn[myc, mxc]
        out[ty[good], tx[good]] = out[myc[good], mxc[good]]
        kn[ty[good], tx[good]] = True
    left = todo & ~kn
    if left.any():
        _, iy, ix = nearest(kn)
        out[left] = out[iy[left], ix[left]]
    return out


def smear_fill(col, known, todo, sigma):
    """Fill `todo` with the nearest known colour, softened the deeper it goes (for the misty mountains)."""
    d, iy, ix = nearest(known)
    out = col.copy()
    out[todo] = col[iy[todo], ix[todo]]
    bl = cv2.GaussianBlur(out.astype(np.float32), (0, 0), sigma)
    w = (np.clip(d / (4 * S), 0, 1) * todo)[..., None]
    return out * (1 - w) + bl * w


def over(back, col, a):
    return col * a[..., None] + back * (1 - a[..., None])


# ---------- 1. the sky: a smooth fit (a smoothing spline on a 32x16 grid) to the clear-sky pixels ----------
def fit_sky(r):
    h, w = r.shape[:2]
    SX, SY, X0 = 32, 16, -32
    nx = int(np.ceil((w - 2 * X0) / SX)) + 1
    ny = int(np.ceil(h / SY)) + 2

    def design(ys, xs):
        fx, fy = (xs - X0) / SX, ys / SY
        ix, iy = np.floor(fx).astype(int), np.floor(fy).astype(int)
        tx, ty = fx - ix, fy - iy
        rows = np.repeat(np.arange(len(xs)), 4)
        cols = np.stack([iy * nx + ix, iy * nx + ix + 1, (iy + 1) * nx + ix, (iy + 1) * nx + ix + 1], -1).ravel()
        vals = np.stack([(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty], -1).ravel()
        return sparse.csr_matrix((vals, (rows, cols)), shape=(len(xs), nx * ny))

    idx = np.arange(nx * ny).reshape(ny, nx)
    trip = [np.stack([idx[:, :-2].ravel(), idx[:, 1:-1].ravel(), idx[:, 2:].ravel()], -1),
            np.stack([idx[:-2].ravel(), idx[1:-1].ravel(), idx[2:].ravel()], -1)]
    trip = np.concatenate(trip)
    P = sparse.csr_matrix((np.tile([6.0, -12.0, 6.0], len(trip)), (np.repeat(np.arange(len(trip)), 3), trip.ravel())),
                          shape=(len(trip), nx * ny))
    PtP = P.T @ P
    gy, gx = np.mgrid[0:h, 0:w]
    Dall = design(gy.ravel().astype(float), gx.ravel().astype(float))
    RR, GG, BB = r[..., 0], r[..., 1], r[..., 2]
    blue = (BB >= 244) & (GG > RR)
    rowmed = np.array([np.median(RR[y][blue[y]]) if blue[y].any() else 0 for y in range(h)])
    ok = blue & (gy < 255) & (np.abs(RR - rowmed[:, None]) < 22)  # (the high sky, less the clouds)
    for it in range(7):  # then grow it down to the horizon, keeping only pixels that fit
        ys, xs = np.nonzero(ok)
        sel = (ys % 2 == 0) & (xs % 2 == 0)
        D = design(ys[sel].astype(float), xs[sel].astype(float))
        solve = factorized((D.T @ D + PtP).tocsc())
        model = np.stack([(Dall @ solve(D.T @ r[ys[sel], xs[sel], c].astype(float))).reshape(h, w) for c in range(3)], -1)
        res = r - model
        ok = blue & (gy < 255 + (it + 1) * 30) & (np.abs(res[..., 0]) < 9) & (np.abs(res[..., 1]) < 7) & (np.abs(res[..., 2]) < 6)
    e = np.abs(res[ok])
    print('sky fit: mean error', e.mean(0).round(2), ' 99th pct', np.percentile(e, 99, axis=0).round(1))
    return np.clip(model, 0, 255).astype(np.float32)


sky1 = fit_sky(ref1)
sky = np.clip(cv2.resize(sky1, (W, H), interpolation=cv2.INTER_LINEAR), 0, 255)
res = img - sky
blue = (B >= 244) & (G > R)
skyish = blue & (np.abs(res[..., 0]) < 9) & (np.abs(res[..., 1]) < 7) & (np.abs(res[..., 2]) < 6)

# ---------- 2. the clouds: brighter than the sky behind them ----------
cl_seed = (yy < U(360)) & (B >= 200) & (res[..., 0] > 12)
cl_seed = drop_specks(cl_seed, U(20) ** 2)
cl_any = (yy < U(360)) & (B >= 200) & (res[..., 0] > 4)
lab, _ = ndi.label(cl_any)
cl_region = np.isin(lab, [v for v in np.unique(lab[cl_seed]) if v > 0])
cl_region = ndi.binary_fill_holes(cl_region)
cl_core = erode(cl_region & (res[..., 0] > 25), 1)  # (the cloud itself; its faint glow on the sky is the soft edge)
cl_col, cl_a = matte(cl_core, dilate(cl_region, 3) & ~cl_core & (yy < U(360)), sky, unmix_max=60, exact=False)
comp = over(sky, cl_col, cl_a)

# ---------- 3. the wood (railing posts, ropes, deck) and the two plants, which sit in front of the trees ----------
strong = (R >= 110) & (R - B >= 70) & (R >= G - 5)
relaxed = ((R >= G - 5) & (R - B >= 25)) | ((R >= 200) & (G >= 170) & (R >= G - 10))  # dark grain, rope highlights
lab, _ = ndi.label(relaxed & (yy >= U(440)))
wood = np.isin(lab, [v for v in np.unique(lab[strong & (yy >= U(440))]) if v > 0])
wood = fill_small_holes(wood, U(10) ** 2)
wood = drop_specks(wood, U(6) ** 2)

PLANT_BOX = {'L': (70, 530, 245, 672), 'R': (1430, 525, 1600, 672)}  # (bg units: x0, y0, x1, y1)
plants = {}
for k, (x0, y0, x1, y1) in PLANT_BOX.items():
    box = (xx >= U(x0)) & (xx < U(x1)) & (yy >= U(y0)) & (yy < U(y1))
    p = box & ~wood & (G > 50) & (B < 0.32 * G) & (G > R + 15)  # (their leaves have almost no blue; the forest is teal)
    p = drop_specks(p, U(12) ** 2)
    p = fill_small_holes(p, U(8) ** 2) & ~wood
    plants[k] = p
plant_any = plants['L'] | plants['R']

# ---------- 4. the mountains: bluer than the sky, below a ridge line ----------
# the forest: everything that is not sky, cloud or mountain below the treetops, less small specks of blue in it
tree_zone = (yy >= U(255)) & ~blue & ~cl_region
lab, n = ndi.label(~tree_zone & (yy >= U(255)))
sizes = ndi.sum(np.ones_like(lab), lab, np.arange(1, n + 1))
small = np.zeros(n + 1, bool)
small[1:] = sizes < U(12) ** 2
tree_zone |= small[lab] & (yy >= U(255))
tree_zone = drop_specks(tree_zone, U(10) ** 2) | wood | plant_any

mtn = blue & (res[..., 0] < -12) & (yy > U(240)) & (yy < U(520))
mtn = drop_specks(mtn, U(40) ** 2)
first = np.where(mtn.any(0), mtn.argmax(0), H)
cols = np.arange(W)
fy = np.clip(first, 4, H - 1)
seen = (first < H) & np.all([~tree_zone[np.clip(fy - k, 0, H - 1), cols] for k in range(1, 9)], 0)  # (no tree on it)
ridge = np.interp(cols, cols[seen], first[seen]).astype(np.float32)  # (behind the trees: joined up straight,
# then kept well under the treetops, so a hidden stretch of ridge never peeks over a tree when the layers part; it
# eases down from where the ridge is last seen)
canopy = np.where(tree_zone.any(0), tree_zone.argmax(0), H).astype(np.float32)
d_seen = ndi.distance_transform_edt(~seen)
ridge = np.where(seen, ridge, np.maximum(ridge, canopy + np.minimum(U(26), d_seen * 0.8))).astype(np.float32)

mzone = yy >= ridge[None, :]
m_core = mzone & (yy >= ridge[None, :] + 3) & ~tree_zone
m_band = (yy >= ridge[None, :] - 7) & (yy <= ridge[None, :] + 4) & seen[None, :] & ~tree_zone & ~m_core  # (+ its light rim)
m_col, m_a = matte(m_core, m_band, comp)
# where the ridge shows against the sky the edge is un-mixed (m_band); elsewhere (behind trees) it is a clean step
m_a = np.where(m_core | m_band, m_a, np.clip(yy - ridge[None, :] + 1, 0, 1)).astype(np.float32)
m_known = m_core  # (the light rim does not spread into the fill)
m_col = smear_fill(m_col, m_known, (m_a > 0) & ~m_known & ~m_band, 3 * S)
comp = over(comp, m_col, m_a)

# ---------- 5. the trees: opaque below the treetops; behind the railing, the plants and the deck, mirrored ----------
front = wood | plant_any
t_core = erode(tree_zone, 2)
t_band = dilate(tree_zone, 3) & ~t_core
t_col, t_a = matte(t_core & ~front, t_band & ~front, comp)
t_a[t_core | front] = 1.0
# (the pixels touching the railing or a plant are part railing, and so are the warm ones just around it, where the
# rope's or the post's colour bleeds into the leaves: they are redone, or they would show as faint ghost ropes)
warm = (R - G > -85) & (R > 50)
t_known = t_core & ~dilate(front, 1) & ~(dilate(front, U(2)) & warm)
todo = (t_a > 0) & ~t_known & (front | t_core)
t_col = mirror_fill(t_col, t_known, todo)
comp_t = over(comp, t_col, t_a)

# ---------- 6. the plants (in front of the trees; they continue a little under the ropes so they can sway) ----------
plant_out = {}
near_w = dilate(wood, 2)
for k, p in plants.items():
    core = erode(p, 1) & ~near_w  # (leaf pixels touching a rope are part rope: they are redone below)
    band = dilate(p, 3) & ~core & ~near_w
    col, a = matte(core, band, comp_t)
    under = (wood | (near_w & dilate(p, 2))) & dilate(p, U(6))
    ext = mirror_fill(img, core, under)
    _, iy, ix = nearest(core)
    reach = under & (np.hypot(yy - iy, xx - ix) < U(6))
    col[reach] = ext[reach]
    a[reach] = 1.0
    plant_out[k] = (col, a)
    comp_t = over(comp_t, col, a)

# ---------- 7. the railing + deck ----------
w_core = erode(wood, 1)
w_band = dilate(wood, U(2) + 1) & ~w_core  # (covers the redone ring around it, so the stack still gives the picture)
d_col, d_a = matte(w_core, w_band, comp_t)
final = over(comp_t, d_col, d_a)

err = np.abs(final - img)
print('stack vs picture: mean', err.mean().round(3), ' 99.9th pct', np.percentile(err, 99.9).round(1), ' max', err.max().round(1))
if os.environ.get('CUT_DEBUG'):  # (where the stack differs from the picture: a map, for checking)
    e = err.max(-1)
    Image.fromarray(np.clip(np.dstack([e * 4, e * 0, e * 0]) + img * 0.25, 0, 255).astype(np.uint8)).save(os.environ['CUT_DEBUG'])
    big = e > 30
    lab, n = ndi.label(dilate(big, 3))
    for i, sl in enumerate(ndi.find_objects(lab)[:40]):
        print('  error spot', (sl[1].start / S, sl[0].start / S, sl[1].stop / S, sl[0].stop / S), int(big[sl].sum()), 'px')


# ---------- save ----------
def save(name, col, a, box, q=82, aq=90, small=1):
    x0, y0, x1, y1 = box
    rgba = np.dstack([np.clip(col, 0, 255), np.clip(a * 255, 0, 255)])[y0:y1, x0:x1].round().astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA')
    if small > 1:
        im = im.resize((max(1, round(im.width / small)), max(1, round(im.height / small))), Image.LANCZOS)
    with tempfile.TemporaryDirectory() as t:
        png = os.path.join(t, name + '.png')
        im.save(png)
        args = ['cwebp', '-quiet', '-m', '6', '-sharp_yuv']
        args += ['-lossless'] if q == 'lossless' else ['-q', str(q), '-alpha_q', str(aq)]
        subprocess.run(args + [png, '-o', os.path.join(OUT, name + '.webp')], check=True)
    kb = os.path.getsize(os.path.join(OUT, name + '.webp')) / 1024
    return {'x': x0 / S, 'y': y0 / S, 'w': (x1 - x0) / S, 'h': (y1 - y0) / S, 'kb': round(kb, 1)}


def bbox(a, pad=U(2)):
    ys, xs = np.nonzero(a > 0)
    return (max(0, xs.min() - pad), max(0, ys.min() - pad), min(W, xs.max() + 1 + pad), min(H, ys.max() + 1 + pad))


ones = np.ones((H, W), np.float32)
boxes = {}
boxes['bg_sky'] = save('bg_sky', sky, ones, (0, 0, W, H), q='lossless', small=8)  # (a smooth gradient: 1/4 size)
boxes['bg_clouds'] = save('bg_clouds', cl_col, cl_a, bbox(cl_a))
# the mountains: from the ridge down to well past the deepest spot the trees let them show through
mvis = (m_a > 0) & ~tree_zone
mb = bbox(m_a)
boxes['bg_mount'] = save('bg_mount', m_col, m_a, (0, mb[1], W, min(H, np.nonzero(mvis.any(1))[0].max() + U(40))))
# the trees: from the treetops down to well under the deck's back edge (the deck never moves further from them)
# (per column, where the deck starts for good: below the last pixel that is not wood; at a post, the post's top)
gap = ~wood
deck_top = np.where(gap.any(0), H - np.argmax(gap[::-1], 0), 0)
print('deck back edge: lowest at y', deck_top.max() / S, 'bg units, x', np.argmax(deck_top) / S)
tb = bbox(t_a)
boxes['bg_trees'] = save('bg_trees', t_col, t_a, (0, tb[1], W, min(H, int(deck_top.max()) + U(40))))
for k, (col, a) in plant_out.items():
    x0, y0, x1, y1 = bbox(a, U(4))
    boxes['bg_plant' + k] = save('bg_plant' + k, col, a, (x0, y0, x1, y1), aq=100)
db = bbox(d_a)
boxes['bg_deck'] = save('bg_deck', d_col, d_a, (0, db[1], W, H))
print(json.dumps(boxes, indent=1))
