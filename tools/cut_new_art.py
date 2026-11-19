# cut every game sprite from new.png (native resolution); prints the measured geometry
import sys, json, numpy as np, cv2
from PIL import Image, ImageDraw
from scipy import ndimage as nd
SRC, OUT = sys.argv[1], sys.argv[2]
A = np.array(Image.open(SRC).convert('RGBA')).astype(np.float32)
geo = {}
def save(arr, name): Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(f'{OUT}/{name}', optimize=True)
def piece(box, pad=3, th=40):
    x0, y0, x1, y1 = box; c = A[y0 - pad:y1 + pad, x0 - pad:x1 + pad].copy()
    m = c[..., 3] >= th; lab, n = nd.label(m); k = np.argmax(nd.sum(m, lab, range(1, n + 1))) + 1
    keep = nd.binary_dilation(lab == k, iterations=3); c[..., 3] *= keep
    return c, (x0 - pad, y0 - pad)
lum = lambda c: c[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
def polyfit_fill(img, fitm, fill, deg=4):
    h, w = fill.shape; yy, xx = np.mgrid[0:h, 0:w]; u, v = xx / w - .5, yy / h - .5
    terms = [u ** p * v ** q for p in range(deg + 1) for q in range(deg + 1) if p + q <= deg]
    M = np.stack([t[fitm] for t in terms], 1); out = img.copy()
    wgt = np.maximum(nd.gaussian_filter(fill.astype(np.float32), 1.0), fill)
    for ch in range(3):
        s = sum(cf * t for cf, t in zip(np.linalg.lstsq(M, img[..., ch][fitm], rcond=None)[0], terms))
        out[..., ch] = img[..., ch] * (1 - wgt) + s * wgt
    return out
def holes_of(c, n):
    L = lum(c); dark = (L < 70) & (c[..., 3] > 200); dark[int(c.shape[0] * 0.66):] = False
    dark = nd.binary_opening(dark, iterations=3)
    lab, k = nd.label(dark); sizes = nd.sum(dark, lab, range(1, k + 1)); ids = np.argsort(sizes)[::-1][:n] + 1
    hs = []
    for i in ids:
        m = nd.binary_fill_holes(lab == i); ys, xs = np.nonzero(m)
        hs.append((xs.mean(), ys.mean(), np.sqrt(m.sum() / np.pi)))
    return sorted(hs)
def ring_front(c, hs):
    h, w = c.shape[:2]; yy, xx = np.mgrid[0:h, 0:w]; f = np.zeros((h, w), np.float32); out = []
    gold = (c[..., 0] > 170) & (c[..., 1] > 110) & (c[..., 2] < 110)
    for (cx, cy, r) in hs:
        d = np.hypot(xx - cx, yy - cy); ro = r
        for rad in np.arange(r, r * 1.7, 0.5):  # walk out while the band is still mostly gold
            band = (d >= rad) & (d < rad + 0.5)
            if gold[band].mean() > 0.5: ro = rad
        ro += 2.5  # its dark outline
        f = np.maximum(f, np.clip(np.minimum(d - (r - 1.0), ro + 1 - d), 0, 1)); out.append((cx, cy, r, ro))
    fr = c.copy(); fr[..., 3] *= f; return fr, out

# ---------- cannons ----------
c1, o1 = piece((138, 10, 606, 395)); c2, o2 = piece((697, 9, 1268, 395))
# remove the FIRE plate baked into cannon 1: transplant the plain belly + base from cannon 2 (bottom-aligned)
red = (c1[..., 0] > 200) & (c1[..., 1] < 95) & (c1[..., 2] < 95); red[:int(c1.shape[0] * 0.55)] = False
lab, n = nd.label(red); red = lab == (np.argmax(nd.sum(red, lab, range(1, n + 1))) + 1); ys, xs = np.nonzero(red)
rx0, ry0, rx1, ry1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1; rcy = (ry0 + ry1) // 2
row = c1[rcy]; x = rx0
while x > 0 and not (row[x, 1] > row[x, 0] + 40 and row[x, 2] > row[x, 0] + 30): x -= 1  # walk left to the teal body
t = rx0 - x + 1
plate = (rx0 - t, ry0 - t, rx1 + t, ry1 + t)
mk = Image.new('L', (c1.shape[1], c1.shape[0]), 0)
ImageDraw.Draw(mk).rounded_rectangle(plate, radius=(plate[3] - plate[1]) / 2, fill=255)
pm = np.array(mk) > 0; pmd = nd.binary_dilation(pm, iterations=2)
w1 = nd.gaussian_filter(pmd.astype(np.float32), 1.3); w1 = np.maximum(w1, pmd)[..., None]
cx1 = c1.shape[1] / 2 + o1[0]; cx2 = c2.shape[1] / 2 + o2[0]; dx = int(round(cx2 - cx1))
donor = A[o1[1]:o1[1] + c1.shape[0], o1[0] + dx:o1[0] + dx + c1.shape[1]]
c1[..., :3] = c1[..., :3] * (1 - w1) + donor[..., :3] * w1
geo['plate'] = dict(box=[int(v) for v in plate], w=c1.shape[1], h=c1.shape[0])
for name, c, n in (('cannon1', c1, 1), ('cannon2', c2, 2)):
    hs = holes_of(c, n); fr, rings = ring_front(c, hs)
    save(c, name + '.png'); save(fr, name + '_front.png')
    H, W = c.shape[:2]; ys, xs = np.nonzero(c[..., 3] > 128)
    geo[name] = dict(size=[W, H], holes=[[round(cx / W, 4), round(cy / H, 4), round(r / W, 4)] for cx, cy, r in hs],
                     rings=[[round(v, 1) for v in rr] for rr in rings], opaque=[int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)])
# ---------- FIRE, cloud, cage, buttons ----------
for name, box in (('fire', (7, 688, 305, 822)), ('cloud', (22, 407, 576, 657)), ('cage_x', (605, 405, 798, 661)),
                  ('pause', (819, 490, 945, 617)), ('sound', (962, 490, 1089, 617))):
    c, o = piece(box); save(c, name + '.png'); geo[name] = [c.shape[1], c.shape[0]]
    if name == 'pause': pz = c
    if name == 'cage_x': cg = c
# play: the pause button with its bars replaced by a white triangle
P = pz.copy(); white = (P[..., :3].min(-1) > 190) & (P[..., 3] > 200)
lab, n = nd.label(white); sizes = nd.sum(white, lab, range(1, n + 1)); bars = np.isin(lab, np.argsort(sizes)[::-1][:2] + 1)
ys, xs = np.nonzero(bars); bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
fill = nd.binary_dilation(bars, iterations=4)
face = np.zeros_like(bars); face[by0 - 12:by1 + 12, bx0 - 14:bx1 + 14] = True
P = polyfit_fill(P, face & ~nd.binary_dilation(fill, iterations=2), fill, deg=3)
S = 8; h, w = P.shape[:2]; im = Image.new('L', (w * S, h * S), 0); d = ImageDraw.Draw(im)
th_ = (by1 - by0) * 0.98; cxp = (bx0 + bx1) / 2 + th_ * 0.07; cyp = (by0 + by1) / 2
tri = [(cxp - th_ * 0.42, cyp - th_ / 2), (cxp - th_ * 0.42, cyp + th_ / 2), (cxp + th_ * 0.5, cyp)]
d.polygon([(x * S, y * S) for x, y in tri], fill=255)
im = im.filter(__import__('PIL.ImageFilter', fromlist=['x']).MinFilter(1))
tm = np.array(im.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255
tm = np.clip(nd.gaussian_filter(np.array(Image.fromarray((tm * 255).astype(np.uint8)).filter(__import__('PIL.ImageFilter', fromlist=['x']).MaxFilter(3))).astype(np.float32) / 255, 0.6), 0, 1)
sh = nd.shift(tm, (1.5, 0.6), order=1) * 0.35
barcol = pz[..., :3][bars].mean(0)
P[..., :3] = P[..., :3] * (1 - sh[..., None]) + np.array([150, 60, 0], np.float32) * sh[..., None]
P[..., :3] = P[..., :3] * (1 - tm[..., None]) + barcol * tm[..., None]
save(P, 'play.png')
# x on its own (for the freed x): purple body + face + gloves, the bars painted out
c = cg.copy(); r, g, b = c[..., 0], c[..., 1], c[..., 2]; L = lum(c)
purple = (b > g + 50) & (r > g + 20) & (c[..., 3] > 200)
lab, n = nd.label(purple); body = lab == (np.argmax(nd.sum(purple, lab, range(1, n + 1))) + 1)
closed = nd.binary_closing(body, structure=np.ones((1, 15)), iterations=1) | body
closed = nd.binary_fill_holes(closed)
gloveW = (c[..., :3].min(-1) > 175) & ~closed
lab, n = nd.label(gloveW); near = nd.binary_dilation(closed, iterations=3)
gl = np.isin(lab, [i for i in range(1, n + 1) if (near & (lab == i)).any() and (lab == i).sum() > 60])
gl = nd.binary_fill_holes(nd.binary_closing(gl, iterations=2))
ch = nd.binary_dilation(closed, iterations=2) | nd.binary_dilation(gl, iterations=2)
goldbar = (r > 180) & (g > 110) & (b < 120) & ~nd.binary_dilation(gl, iterations=1)
paint = nd.binary_dilation(goldbar, iterations=2) & nd.binary_dilation(closed, iterations=1)
rgb8 = np.clip(c[..., :3], 0, 255).astype(np.uint8)
inp = cv2.inpaint(rgb8, paint.astype(np.uint8) * 255, 5, cv2.INPAINT_TELEA).astype(np.float32)
xc = c.copy(); xc[..., :3] = inp
alpha = nd.gaussian_filter(ch.astype(np.float32), 0.7)
xc[..., 3] = np.clip(alpha * 255, 0, 255)
ys, xs = np.nonzero(ch); xc = xc[max(0, ys.min() - 2):ys.max() + 3, max(0, xs.min() - 2):xs.max() + 3]
save(xc, 'xchar.png'); geo['xchar'] = [xc.shape[1], xc.shape[0]]
# ---------- tray + its front lip ----------
t, ot = piece((13, 845, 1435, 1003)); save(t, 'rack.png')
L = lum(t); H, W = L.shape
inner = (L < 212) & (t[..., 3] > 200); lab, n = nd.label(inner); inner = lab == lab[H // 2 - 10, W // 2]
cols = np.nonzero(inner.any(0))[0]; ybot = np.full(W, -1)
for x in cols: ybot[x] = np.nonzero(inner[:, x])[0].max()
yrow = np.nonzero(inner.any(1))[0]
cut = np.where(ybot >= 0, ybot, ybot[cols].min())
yy = np.mgrid[0:H, 0:W][0]; f = t.copy(); f[..., 3] *= (yy > cut[None, :] + 0.5)
save(f, 'rack_front.png')
ys, xs = np.nonzero(t[..., 3] > 128)
geo['rack'] = dict(size=[W, H], inner_x=[int(cols.min()), int(cols.max())], inner_y=[int(yrow.min()), int(yrow.max())],
                   front_mid=int(ybot[W // 2]), bottom=int(ys.max() + 1), opaque_x=[int(xs.min()), int(xs.max() + 1)])
print(json.dumps(geo))
