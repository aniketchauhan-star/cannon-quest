# Cut the game's tray and 8 balls from the UI sheet art/sprite_sheets/ui_elements.png (the user's art, 19 Nov): the
# 8 orbs, and the wooden tray with metal corners (tray row 1, first). Each piece is upscaled 2× with EDSR first, so it
# stays sharp on retina screens.
#
#   rack.png           the tray, its plain middle stretched so 8 balls fit (corners, ropes and light kept as drawn)
#   rack_front.png     its front lip, drawn above the balls
#   ball_0..7.png      the orbs with their painted labels erased (the game draws each ball's label)
#
# (This tool also cut the cannons and the FIRE button from the sheet's wooden cannon until 23 Nov 2026. They now come
# from the user's own cannon art: tools/cut_single_cannon.py → cannon1*, fire; tools/cut_double_cannon.py → cannon2*,
# fire2. The old cannon code is in git history, at commit 8621747.)
#
# Usage (a Python with cv2.dnn_superres, scipy and PIL):
#   python tools/cut_ui_elements.py art/sprite_sheets/ui_elements.png EDSR_x2.pb OUTDIR
# then cwebp each PNG into assets/img/. Prints the geometry for RACK in src/30_stage.js.
import sys, json, numpy as np, cv2
from PIL import Image
from scipy import ndimage as nd

SRC, MODEL, OUT = sys.argv[1:4]
A = np.array(Image.open(SRC).convert('RGBA'))
sr = cv2.dnn_superres.DnnSuperResImpl_create(); sr.readModel(MODEL); sr.setModel('edsr', 2)
geo = {}
lum = lambda c: c[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)


def up(box, pad=8):
    """crop a sheet box (+pad) and upscale it 2×: EDSR for colour, Lanczos for alpha"""
    x0, y0, x1, y1 = box
    c = A[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad]
    rgb = cv2.cvtColor(np.ascontiguousarray(c[..., :3]), cv2.COLOR_RGB2BGR)
    o = cv2.cvtColor(sr.upsample(rgb), cv2.COLOR_BGR2RGB)
    a = np.array(Image.fromarray(c[..., 3]).resize((c.shape[1] * 2, c.shape[0] * 2), Image.LANCZOS))
    return np.dstack([o, a]).astype(np.float32)


def save(arr, name, scale=1.0):
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    if scale != 1.0: im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    im.save(f'{OUT}/{name}', optimize=True); return im.size


# =====================================================================================================
# tray (wooden, metal corners, rope ends, cyan light): stretch only its plain middle
# =====================================================================================================
t = up((30, 690, 548, 794)); ys, xs = np.nonzero(t[..., 3] > 128)
t = t[ys.min() - 2:ys.max() + 3, xs.min() - 2:xs.max() + 3]; TH = t.shape[0]
o = xs.min() - 2  # columns below are in the uncropped 2× image
CAP_L, MID_A, LIGHT, MID_B = 160 - o, (160 - o, 425 - o), (425 - o, 645 - o), (645 - o, 905 - o)
RACK_W, RACK_H = 1340, 155  # its size in the game (art-space px)
TS = RACK_H / TH            # game px per 2× px
target = round(RACK_W / TS)
fixed = CAP_L + (LIGHT[1] - LIGHT[0]) + (t.shape[1] - MID_B[1])
grow_a = (target - fixed) // 2; grow_b = target - fixed - grow_a
stretch = lambda seg, w: np.array(Image.fromarray(np.clip(seg, 0, 255).astype(np.uint8)).resize((w, TH), Image.LANCZOS)).astype(np.float32)
T = np.concatenate([t[:, :CAP_L], stretch(t[:, MID_A[0]:MID_A[1]], grow_a), t[:, LIGHT[0]:LIGHT[1]],
                    stretch(t[:, MID_B[0]:MID_B[1]], grow_b), t[:, MID_B[1]:]], 1)
TW = T.shape[1]
# the front lip starts at the bright top edge of the front plank (a straight row); the balls sit just behind it
Lt = lum(T); mid = Lt[:, CAP_L + 40:CAP_L + grow_a - 40].mean(1)
lip = int(np.argmax(mid[TH // 2:] > 190) + TH // 2) - 2
Fr = T.copy(); Fr[..., 3] *= np.clip((np.arange(TH)[:, None] - lip + 0.5), 0, 1)
TOUT = 0.9
save(T, 'rack.png', TOUT); save(Fr, 'rack_front.png', TOUT)
# 8 spots, evenly along the floor between the inner side walls
BD = 122  # ball diameter in the game (BALL_D)
d_src = BD / TS
left_in, right_in = CAP_L + 10, TW - (t.shape[1] - MID_B[1]) - 10
sp = (right_in - left_in - d_src) / 7
hx = [left_in + d_src / 2 + i * sp for i in range(8)]
seat_y = lip + 8 - d_src / 2  # its bottom tucks 8 px (2× art) behind the lip
ys, xs = np.nonzero(T[..., 3] > 128)
geo['rack'] = dict(w=RACK_W, h=round(TH * TS, 1), srcW=round(TW * TOUT), holesX=[round(x * TOUT, 1) for x in hx], holeY=round(seat_y * TOUT, 1),
                   lip=round(lip * TOUT, 1), bot=round((ys.max() + 1) * TOUT, 1), edges=[round(xs.min() * TOUT), round((xs.max() + 1) * TOUT)],
                   spacing_game=round(sp * TS, 1))

# =====================================================================================================
# balls: fit each disc, erase its painted label with a smooth fill solved from the colours around it
# (seamless at the edge; a fitted surface left a lighter ghost of the label)
# =====================================================================================================
BOXES = [(155, 524, 305, 674), (329, 524, 478, 674), (503, 524, 650, 672), (679, 524, 824, 672),
         (853, 524, 1001, 673), (1027, 524, 1174, 674), (1196, 524, 1342, 673), (1363, 524, 1512, 675)]
BALL_PX = 168
from scipy import sparse
from scipy.sparse.linalg import spsolve
def laplace_fill(img, mask):
    ys, xs = np.nonzero(mask); idx = -np.ones(mask.shape, int); idx[ys, xs] = np.arange(len(ys)); n = len(ys)
    rows, cols, vals = [], [], []; rhs = np.zeros((n, img.shape[2]))
    for k, (y, x) in enumerate(zip(ys, xs)):
        rows.append(k); cols.append(k); vals.append(4.0)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if mask[y + dy, x + dx]: rows.append(k); cols.append(idx[y + dy, x + dx]); vals.append(-1.0)
            else: rhs[k] += img[y + dy, x + dx]
    M = sparse.csr_matrix((vals, (rows, cols)), shape=(n, n)); out = img.copy()
    for ch in range(img.shape[2]): out[ys, xs, ch] = spsolve(M, rhs[:, ch])
    return out
radii = []
for i, box in enumerate(BOXES):
    B = up(box); m = B[..., 3] >= 128
    lab, n = nd.label(m); m = lab == (np.argmax(nd.sum(m, lab, range(1, n + 1))) + 1)
    ey, ex = np.nonzero(m & ~nd.binary_erosion(m))
    cf = np.linalg.lstsq(np.c_[2 * ex, 2 * ey, np.ones(len(ex))], ex ** 2 + ey ** 2, rcond=None)[0]
    fx, fy = cf[0], cf[1]; Rb = np.sqrt(cf[2] + fx ** 2 + fy ** 2); radii.append(Rb)
    Pp = int(np.ceil(Rb + 6)); X0, Y0 = int(round(fx)) - Pp, int(round(fy)) - Pp
    canvas = np.zeros((2 * Pp, 2 * Pp, 4), np.float32)
    sx0, sy0 = max(0, X0), max(0, Y0); sx1, sy1 = min(B.shape[1], X0 + 2 * Pp), min(B.shape[0], Y0 + 2 * Pp)
    canvas[sy0 - Y0:sy1 - Y0, sx0 - X0:sx1 - X0] = B[sy0:sy1, sx0:sx1]
    by, bx = np.mgrid[0:2 * Pp, 0:2 * Pp]; d = np.hypot(bx + X0 - fx, by + Y0 - fy)
    canvas[..., 3] *= np.clip(Rb + 2.5 - d, 0, 1)
    rgb = canvas[..., :3].astype(np.float64); Lb = rgb @ np.array([0.299, 0.587, 0.114])
    inn = d < Rb * 0.8; med = np.median(Lb[inn])
    # the ink, then its soft edge: darker than the ball's own tone (relative, so it also works on the bright yellow)
    ink = nd.binary_fill_holes(nd.binary_closing(inn & (Lb < min(80, 0.45 * med)), iterations=2))
    soft = inn & (Lb < 0.8 * med) & nd.binary_dilation(ink, iterations=8)
    fl = nd.binary_dilation(ink | soft, iterations=4)
    out = canvas.copy(); out[..., :3] = laplace_fill(rgb, fl)
    out[..., :3] += (nd.gaussian_filter(np.random.default_rng(i).normal(0, 1.2, d.shape), 0.7) * fl)[..., None]
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).resize((BALL_PX, BALL_PX), Image.LANCZOS).save(f'{OUT}/ball_{i}.png', optimize=True)
geo['ball'] = dict(px=BALL_PX, disc_frac=round(float(np.mean([2 * r_ / (2 * np.ceil(r_ + 6)) for r_ in radii])), 4))
print(json.dumps(geo, default=lambda o_: o_.item() if hasattr(o_, 'item') else str(o_)))
