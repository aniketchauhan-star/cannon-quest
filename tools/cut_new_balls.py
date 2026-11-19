# cut the 8 balls from new.png: labelled (title) + blank (label erased by a smooth-surface fill)
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
SRC, OUT = sys.argv[1], sys.argv[2]
a = np.array(Image.open(SRC).convert('RGBA')).astype(np.float32)
centres = [(377, 750), (518, 748), (658, 748), (796, 748), (935, 749), (1072, 748), (1215, 749), (1358, 749)]
cuts = [304, 449, 589, 728, 866, 1004, 1144, 1286, 1436]
circ = []
for i, (cx, cy) in enumerate(centres):
    x0, x1 = cuts[i], cuts[i + 1]
    m = a[:, :, 3] >= 128
    band = np.zeros_like(m); band[cy - 90:cy + 90, x0:x1] = True
    lab, n = nd.label(m & band); mm = lab == lab[cy, cx]
    edge = mm & ~nd.binary_erosion(mm); ys, xs = np.nonzero(edge)
    keep = (xs > x0 + 2) & (xs < x1 - 2); xs, ys = xs[keep], ys[keep]
    A = np.c_[2 * xs, 2 * ys, np.ones(len(xs))]; b = xs ** 2 + ys ** 2
    c = np.linalg.lstsq(A, b, rcond=None)[0]; circ.append((c[0], c[1], np.sqrt(c[2] + c[0] ** 2 + c[1] ** 2)))
def fit(img, fitm, terms):
    M = np.stack([t[fitm] for t in terms], 1)
    return np.stack([sum(cf * t for cf, t in zip(np.linalg.lstsq(M, img[..., ch][fitm], rcond=None)[0], terms)) for ch in range(3)], -1)
for i, (fx, fy, R) in enumerate(circ):
    P = int(np.ceil(R + 6)); X0, Y0 = int(round(fx)) - P, int(round(fy)) - P
    crop = a[Y0:Y0 + 2 * P, X0:X0 + 2 * P].copy()
    yy, xx = np.mgrid[0:2 * P, 0:2 * P]; gx, gy = xx + X0, yy + Y0
    d = np.hypot(gx - fx, gy - fy); ang = np.arctan2(gy - fy, gx - fx)
    # neighbour pixels that fall inside this disc -> resample own rim at the same radius, ±40° away
    bad = np.zeros(d.shape, bool)
    for j in (i - 1, i + 1):
        if 0 <= j < 8:
            nx, ny, nR = circ[j]; bad |= (np.hypot(gx - nx, gy - ny) < nR + 1.5) & (d > R - 6)
    if bad.any():
        src = a.copy()
        for ys_, xs_ in zip(*np.nonzero(bad)):
            acc = []
            for s in (-1, 1):
                t = ang[ys_, xs_] + s * np.radians(40); r = d[ys_, xs_]
                acc.append(nd.map_coordinates(src[..., :4].transpose(2, 0, 1).reshape(4, *src.shape[:2]), [[0] * 4, [0] * 4], order=1)[0] if False else
                           np.array([nd.map_coordinates(src[..., ch], [[fy + r * np.sin(t)], [fx + r * np.cos(t)]], order=1)[0] for ch in range(4)]))
            crop[ys_, xs_] = np.mean(acc, 0)
    crop[..., 3] *= np.clip(R + 2.5 - d, 0, 1)
    Image.fromarray(np.clip(crop, 0, 255).astype(np.uint8)).save(f'{OUT}/lab_ball_{i}.png')
    # ---- erase the label
    rgb = crop[..., :3]; lum = rgb @ [0.299, 0.587, 0.114]
    inner = d < R * 0.8
    hl = nd.binary_dilation((rgb.min(-1) > 170) & inner, iterations=4)  # the white gloss (yellow is bright but not white)
    ink = nd.binary_fill_holes(nd.binary_closing(inner & (lum < 90), iterations=2))
    u = (xx - P) / R; v = (yy - P) / R
    terms = [u ** p * v ** q for p in range(6) for q in range(6) if p + q <= 5]
    terms = [u ** p * v ** q for p in range(5) for q in range(5) if p + q <= 4]
    fill = nd.binary_dilation(ink, iterations=4)
    surf = fit(rgb, (d < R * 0.86) & ~nd.binary_dilation(fill, iterations=2) & ~hl, terms)
    dev = np.abs(rgb - surf).max(-1)
    near = nd.binary_dilation(ink, iterations=7) & ~hl
    fill = nd.binary_dilation(fill | (near & (dev > 16)), iterations=2)
    surf = fit(rgb, (d < R * 0.86) & ~nd.binary_dilation(fill, iterations=2) & ~hl, terms)
    w = np.maximum(nd.gaussian_filter(fill.astype(np.float32), 1.2), fill)[..., None]
    out = crop.copy(); out[..., :3] = rgb * (1 - w) + surf * w
    g = nd.gaussian_filter(np.random.default_rng(i).normal(0, 1.4, d.shape), 0.7)
    out[..., :3] += (g * fill)[..., None]
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(f'{OUT}/blank_ball_{i}.png')
print([tuple(round(float(v), 1) for v in c) for c in circ])
