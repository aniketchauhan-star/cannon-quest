# Cut the start screen from the user's sheet art/start_screen/start_sheet.png (19 Nov), laid out as in their
# mockup art/start_screen/start_mockup.png (1672×941 = the game's art space):
#
#   t_logo.png        the CANNON QUEST plaque with its leaves
#   t_cannon.png      the wooden cannon with leaves
#   playbtn.png       the teal Play button (shown smaller than in the mockup: the user asked for a small one)
#   t_cage.png        the golden cage, whole: drawn BEHIND the x
#   t_cage_front.png  only what is in front of the x: the dome + top ring, the 5 front bars, the base's front lip
#   t_x.png           the purple x, which sits inside the cage (between the two cage layers)
#
# Each piece is lifted from the sheet by its own alpha (never a neighbour's edge), its hidden colours are bled out
# from the edge (so no sheet colour fringes), then upscaled with EDSR (2×, or 2×2× for the cage and x, which the
# mockup shows bigger than the sheet draws them), so they stay sharp on retina screens.
#
# Usage (a Python with cv2.dnn_superres, scipy and PIL):
#   python tools/cut_start_screen.py art/start_screen/start_sheet.png EDSR_x2.pb OUTDIR
# then cwebp each PNG into assets/img/. Prints each piece's box in the mockup for TL in src/35_title.js.
import sys, numpy as np, cv2
from PIL import Image
from scipy import ndimage as nd

SRC, MODEL, OUT = sys.argv[1:4]
A = np.array(Image.open(SRC).convert('RGBA'))
n, LAB, ST, _ = cv2.connectedComponentsWithStats((A[..., 3] > 40).astype(np.uint8), 8)
sr = cv2.dnn_superres.DnnSuperResImpl_create(); sr.readModel(MODEL); sr.setModel('edsr', 2)

# sheet box (alpha > 40) → where the mockup draws it (found by template matching the sheet piece in the mockup)
PIECES = {
    't_logo':   dict(box=(39, 15, 914, 357),    mock=(341, 35, 978, 382),   passes=1, width=None),
    't_cannon': dict(box=(13, 370, 389, 357),   mock=(123, 402, 525, 482),  passes=1, width=None),
    'playbtn':  dict(box=(766, 393, 198, 199),  mock=(708, 497, 257, 259),  passes=1, width=352),
    't_cage':   dict(box=(1372, 315, 205, 270), mock=(1093, 353, 377, 497), passes=2, width=754),
    't_x':      dict(box=(1598, 394, 150, 156), mock=(1180, 545, 204, 212), passes=2, width=408),
}


def edsr(rgb, T=384, P=12):
    bgr = cv2.cvtColor(np.ascontiguousarray(rgb), cv2.COLOR_RGB2BGR); H, W = bgr.shape[:2]
    out = np.zeros((H * 2, W * 2, 3), np.uint8)
    for y in range(0, H, T):
        for x in range(0, W, T):
            y0, x0, y1, x1 = max(0, y - P), max(0, x - P), min(H, y + T + P), min(W, x + T + P)
            u = sr.upsample(bgr[y0:y1, x0:x1]); oy, ox = (y - y0) * 2, (x - x0) * 2
            h, w = min(T, H - y) * 2, min(T, W - x) * 2
            out[y * 2:y * 2 + h, x * 2:x * 2 + w] = u[oy:oy + h, ox:ox + w]
    return cv2.cvtColor(out, cv2.COLOR_BGR2RGB)


def lift(box, pad=8):
    """the piece and a pad around it, with only its own alpha, and its colours bled out under the transparent part"""
    x, y, w, h = box
    i = next(k for k in range(1, n) if tuple(int(v) for v in ST[k][:4]) == box)
    x0, y0 = x - pad, y - pad
    c = A[y0:y + h + pad, x0:x + w + pad].astype(np.float32).copy()
    own = cv2.dilate((LAB[y0:y + h + pad, x0:x + w + pad] == i).astype(np.uint8), np.ones((7, 7), np.uint8))
    c[..., 3] *= own
    solid = c[..., 3] > 200
    _, (iy, ix) = nd.distance_transform_edt(~solid, return_indices=True)
    c[..., :3] = c[iy, ix, :3] # every pixel takes the colour of the nearest solid one (alpha keeps the shape)
    return c, (x0, y0)


def upscale(c, passes):
    rgb, a = np.clip(c[..., :3], 0, 255).astype(np.uint8), Image.fromarray(np.clip(c[..., 3], 0, 255).astype(np.uint8))
    for _ in range(passes):
        rgb = edsr(rgb); a = a.resize((a.width * 2, a.height * 2), Image.LANCZOS)
    return np.dstack([rgb, np.array(a)]).astype(np.float32)


def cage_front(shape, k, org):
    """1 where the cage is IN FRONT of the x (sheet px of the cage box: 0..205 × 0..270), 0 where it is behind it"""
    H, W = shape
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    sx, sy = xx / k + org[0], yy / k + org[1] # → cage-box sheet px
    top = np.clip(99 - sy, 0, 1)                                             # the dome and the top ring
    bars = np.zeros_like(sx)
    for b0, b1 in [(9, 27), (39, 58), (94, 112), (148, 167), (176, 195)]:   # the 5 front bars (thick, bright)
        bars = np.maximum(bars, np.clip(np.minimum(sx - b0, b1 - sx) + 0.5, 0, 1))
    lip = np.clip(sy - (236 - 11 * ((sx - 102) / 97) ** 2), 0, 1)           # the base, from the bars' feet down
    return np.maximum(np.maximum(top, bars * (sy > 90)), lip)


for name, p in PIECES.items():
    c, (x0, y0) = lift(p['box'])
    k = 2 ** p['passes']
    u = upscale(c, p['passes'])
    if name == 't_cage':
        bx, by = p['box'][:2]
        f = cage_front(u.shape[:2], k, (x0 - bx, y0 - by))
        fr = u.copy(); fr[..., 3] *= f
        layers = {'t_cage': u, 't_cage_front': fr}
    else:
        layers = {name: u}
    # trim to the piece (alpha > 8 of the whole piece), then size it
    ys, xs = np.where(u[..., 3] > 8)
    t0, t1, l0, l1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    bx, by, bw, bh = p['box']; mx, my, mw, mh = p['mock']; s = mw / bw
    art = (mx + ((x0 + l0 / k) - bx) * s, my + ((y0 + t0 / k) - by) * s, (l1 - l0) / k * s, (t1 - t0) / k * s)
    for ln, arr in layers.items():
        im = Image.fromarray(np.clip(arr[t0:t1, l0:l1], 0, 255).astype(np.uint8))
        if p['width']: im = im.resize((p['width'], round(p['width'] * im.height / im.width)), Image.LANCZOS)
        im.save(f'{OUT}/{ln}.png', optimize=True)
        print(f"{ln}: {im.width}x{im.height}  mockup box x {art[0]:.1f} y {art[1]:.1f} w {art[2]:.1f} h {art[3]:.1f}"
              f"  centre ({art[0] + art[2] / 2:.1f}, {art[1] + art[3] / 2:.1f})", flush=True)
    if name == 't_cannon': # its foot on the deck, as fractions of the sprite (for the ground shadows)
        a = u[t0:t1, l0:l1, 3] > 128; rows = np.where(a.any(1))[0]; bot = rows.max()
        cols = np.where(a[bot - 12])[0]
        print(f"  cannon foot: ground y {bot / a.shape[0]:.4f}, x {cols.min() / a.shape[1]:.4f}..{cols.max() / a.shape[1]:.4f}")
    if name == 't_cage':
        a = u[t0:t1, l0:l1, 3] > 128; rows = np.where(a.any(1))[0]; bot = rows.max()
        cols = np.where(a[bot - 4 * k])[0]
        print(f"  cage foot: ground y {bot / a.shape[0]:.4f}, x {cols.min() / a.shape[1]:.4f}..{cols.max() / a.shape[1]:.4f}")
