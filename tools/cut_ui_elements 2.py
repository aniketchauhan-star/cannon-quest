# Cut the game's cannon, FIRE button, tray and 8 balls from the UI sheet art/sprite_sheets/ui_elements.png
# (the user's art, 19 Nov): the wooden cannon with leaves (row 1, first), the 8 orbs, and the wooden tray with
# metal corners (tray row 1, first). Each piece is upscaled 2× with EDSR first, so it stays sharp on retina screens.
#
#   cannon1.png        the cannon; its FIRE pill is replaced by a dark recess (the game's FIRE button sits there)
#   cannon1_front.png  only its gold socket ring, drawn above a loaded ball
#   cannon2.png        the same cannon with two smaller sockets side by side (the sheet has no two-socket cannon)
#   cannon2_front.png  its two rings
#   fire.png           the red FIRE pill with the word erased: the game writes T('btnFire') on it
#   rack.png           the tray, its plain middle stretched so 8 balls fit (corners, ropes and light kept as drawn)
#   rack_front.png     its front lip, drawn above the balls
#   ball_0..7.png      the orbs with their painted labels erased (the game draws each ball's label)
#
# Usage (a Python with cv2.dnn_superres, scipy and PIL):
#   python tools/cut_ui_elements.py art/sprite_sheets/ui_elements.png EDSR_x2.pb OUTDIR
# then cwebp each PNG into assets/img/. Prints the geometry for CANNON / RACK in src/30_stage.js.
import sys, json, numpy as np, cv2
from PIL import Image, ImageDraw
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


def stadium(shape, box, ss=4):
    """anti-aliased rounded-end pill mask (0..1)"""
    H, W = shape; x0, y0, x1, y1 = box
    mk = Image.new('L', (W * ss, H * ss), 0)
    ImageDraw.Draw(mk).rounded_rectangle((x0 * ss, y0 * ss, x1 * ss, y1 * ss), radius=(y1 - y0) / 2 * ss, fill=255)
    return np.array(mk.resize((W, H), Image.LANCZOS)).astype(np.float32) / 255


# =====================================================================================================
# cannon (the wooden one with leaves)
# =====================================================================================================
c = up((32, 7, 372, 257)); H, W = c.shape[:2]
r, g, b, a = (c[..., i] for i in range(4)); L = lum(c)
gold = (r > 170) & (g > 110) & (b < 110) & (r - b > 90)
yy, xx = np.mgrid[0:H, 0:W]

# the socket: the big dark hole in the upper part, then walk out over its gold ring
dark = (L < 90) & (a > 200); dark[int(H * 0.62):] = False; dark = nd.binary_opening(dark, iterations=3)
lab, n = nd.label(dark); hole = nd.binary_fill_holes(lab == (np.argmax(nd.sum(dark, lab, range(1, n + 1))) + 1))
ys, xs = np.nonzero(hole); hcx, hcy, hr = xs.mean(), ys.mean(), np.sqrt(hole.sum() / np.pi)
dist = np.hypot(xx - hcx, yy - hcy); ro = hr
for rad in np.arange(hr, hr * 1.7, 0.5):
    if gold[(dist >= rad) & (dist < rad + 0.5)].mean() > 0.5: ro = rad

# the red FIRE pill: its bounding box gives a clean stadium
red = (r > 190) & (g < 130) & (b < 110) & (a > 200) & ~gold; red[:H // 2] = False
lab, n = nd.label(red); red = lab == (np.argmax(nd.sum(red, lab, range(1, n + 1))) + 1)
pill = nd.binary_fill_holes(nd.binary_closing(red, iterations=3))
grow = pill.copy()
for _ in range(6): grow |= nd.binary_dilation(grow) & ~gold & (a > 200) & (L < 170)  # over its dark-red outline, up to the gold
ys, xs = np.nonzero(nd.binary_fill_holes(grow)); pbox = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
st = stadium((H, W), pbox)

# fire.png: the pill, the word erased row by row (its shading runs top to bottom, so each row is filled from its own ends)
px0, py0, px1, py1 = pbox; P = c[py0 - 2:py1 + 2, px0 - 2:px1 + 2].copy(); m = st[py0 - 2:py1 + 2, px0 - 2:px1 + 2] > 0.5
inner = nd.binary_erosion(m, iterations=4)
fill = nd.binary_dilation((P[..., 1] > 112) & nd.binary_erosion(m, iterations=10), iterations=5) & inner
F = P.copy()
for y in range(P.shape[0]):
    f = fill[y]
    if not f.any(): continue
    ok = np.nonzero(inner[y] & ~f)[0]
    for ch in range(3): F[y, f, ch] = np.interp(np.nonzero(f)[0], ok, P[y, ok, ch])
wgt = nd.gaussian_filter(fill.astype(np.float32), 1.2)[..., None]
F[..., :3] = F[..., :3] * (1 - wgt) + nd.gaussian_filter(F[..., :3], (1.0, 3.0, 0)) * wgt
F[..., :3] += (nd.gaussian_filter(np.random.default_rng(1).normal(0, 1.5, m.shape), 0.8) * fill)[..., None]
F[..., 3] = st[py0 - 2:py1 + 2, px0 - 2:px1 + 2] * 255

# the cannon under the button: a dark recess inside the gold bezel (seen when the button is pressed in)
body1 = c.copy(); sm = np.clip(nd.gaussian_filter(st, 0.6) * 1.15, 0, 1)[..., None]
v = np.clip((yy - py0) / (py1 - py0), 0, 1)[..., None]
recess = np.array([40, 12, 4], np.float32) * (1 - v) + np.array([92, 30, 10], np.float32) * v
body1[..., :3] = body1[..., :3] * (1 - sm) + recess * sm

# cannon 2: the old socket filled from the cannon around it (wood grain copied in), then two sockets at 0.78×
K, GAP, DROP = 0.78, 2.0, 6.0
disc = dist < ro + 4
# the gold arrow on the barrel sits just above the socket: lift it out first (so the fill below is teal, not a
# gold smear), fill, then put it back
arrow = np.zeros((H, W), bool); ay0 = int(hcy - ro - 50)
arrow[ay0:int(hcy - ro + 6), int(hcx - 45):int(hcx + 45)] = True
arrow &= gold & (a > 200)
lab, n = nd.label(arrow); arrow = lab == (np.argmax(nd.sum(arrow, lab, range(1, n + 1))) + 1)
arrow = nd.binary_dilation(nd.binary_fill_holes(arrow), iterations=3)
src8 = np.clip(body1[..., :3], 0, 255).astype(np.uint8)
src8 = cv2.inpaint(src8, (arrow * 255).astype(np.uint8), 5, cv2.INPAINT_TELEA)
base = cv2.inpaint(src8, (disc * 255).astype(np.uint8), 12, cv2.INPAINT_TELEA).astype(np.float32)
aw = np.maximum(nd.gaussian_filter(arrow.astype(np.float32), 0.8), nd.binary_erosion(arrow))[..., None]
base = base * (1 - aw) + body1[..., :3] * aw
detail = c[..., :3] - nd.gaussian_filter(c[..., :3], (2.5, 2.5, 0))
dx0 = int(hcx + ro + 4); dw = 36  # a strip of belly just right of the ring
don = detail[yy, np.clip(dx0 + ((xx - int(hcx - ro)) % dw), 0, W - 1)]
brown = (base[..., 0] > base[..., 1] + 35) & (base[..., 2] < 120)
wt = nd.gaussian_filter((disc & brown).astype(np.float32), 2)[..., None]
body2 = body1.copy(); body2[..., :3] = np.where(disc[..., None], base, body1[..., :3]) + don * wt * 0.9
R = int(np.ceil(ro + 4)); iy, ix = int(hcy), int(hcx)
S = c[iy - R:iy + R + 1, ix - R:ix + R + 1].copy()
sy, sx = np.mgrid[0:S.shape[0], 0:S.shape[1]]; S[..., 3] = np.clip(ro + 1.5 - np.hypot(sx - (hcx - ix + R), sy - (hcy - iy + R)), 0, 1) * 255
sz = round(S.shape[1] * K); Sim = Image.fromarray(S.astype(np.uint8)).resize((sz, sz), Image.LANCZOS)
ro2, hr2, dd, cy2 = ro * K, hr * K, ro * K + GAP, hcy + DROP
b2 = Image.fromarray(np.clip(body2, 0, 255).astype(np.uint8)); holes2 = []
for s_ in (-1, 1):
    ox, oy = round(hcx + s_ * dd - sz / 2), round(cy2 - sz / 2)
    b2.alpha_composite(Sim, (ox, oy))
    # where the pasted socket's centre really landed (the patch's centre, scaled, plus its rounded offset)
    holes2.append((ox + (hcx - ix + R) * sz / S.shape[1], oy + (hcy - iy + R) * sz / S.shape[0]))
body2 = np.array(b2).astype(np.float32)


def front(body, rings):
    """only the gold ring(s): drawn above a loaded ball so its edge tucks under the ring"""
    f = np.zeros((H, W), np.float32)
    for (x, y, ri, rO) in rings:
        d = np.hypot(xx - x, yy - y); f = np.maximum(f, np.clip(np.minimum(d - (ri - 1.0), rO + 1 - d), 0, 1))
    fr = body.copy(); fr[..., 3] *= f; return fr


# both cannons on the same canvas: trimmed to the art, the bottom edge = where the base meets the ground
ys, xs = np.nonzero(c[..., 3] > 128); cx0, cy0, cx1, cy1 = xs.min() - 2, ys.min() - 2, xs.max() + 3, ys.max() + 2
CS = 0.9  # 2× art → 1.8× the sheet
crop = lambda arr: arr[cy0:cy1, cx0:cx1]
CW, CH = cx1 - cx0, cy1 - cy0
fronts = {1: [(hcx, hcy, hr, ro)], 2: [(x, y, hr2, ro2) for x, y in holes2]}
for n_, body in ((1, body1), (2, body2)):
    save(crop(body), f'cannon{n_}.png', CS); save(crop(front(body, fronts[n_])), f'cannon{n_}_front.png', CS)
# the base's footprint: its widest opaque run in the bottom rows (the leaves sit higher)
low = crop(c)[-14:-4, :, 3] > 128; cols = np.nonzero(low.any(0))[0]
geo['cannon'] = dict(
    src=[round(CW * CS), round(CH * CS)],
    holes={n_: [[round((x - cx0) / CW, 4), round((y - cy0) / CH, 4), round(ri / CW, 4)] for x, y, ri, _ in fronts[n_]] for n_ in (1, 2)},
    foot_w=round((cols.max() - cols.min() + 1) / CW, 4),
    fire=dict(w=round((px1 - px0) / CH, 4), y=round((cy1 - (py0 + py1) / 2) / CH, 4), ar=round((py1 - py0) / (px1 - px0), 4)),
    top_rim=int(np.nonzero((crop(c)[..., 3] > 128).any(1))[0].min()))
save(F, 'fire.png', CS)

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
