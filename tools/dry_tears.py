# x's tears painted out of its crying frames (the user, 25 Nov 2026: "just remove the cry … only the eyes, no need to
# make a cry"): x stays sad in its cage, with no tears. Used by tools/cut_x_sprites.py on the frames it cuts from
# art/sprite_sheets/x_moods/cry_in_cage.png (the sheet itself is kept as the user made it).
#   • each drop on x's cheeks becomes x's purple, grown smoothly from the purple round it (its navy outline and glints
#     go too; x's mouth, gloves and the bars are never touched)
#   • each pool lying in an eye: the eye under it is drawn again. Its outline, its white and its iris carry on along the
#     curves they follow where they show (an ellipse fitted to each), each in its own colour, grown from where it shows;
#     the pool's own lower edge is the eye's lower outline (the pool fills the eye up to it)
import numpy as np
from scipy import ndimage as nd


def fit_ellipse(x, y):
    """Direct least-squares ellipse (Fitzgibbon, as Halir & Flusser), as a conic (A..F) that is < 0 inside."""
    mx, my, s = x.mean(), y.mean(), max(x.std(), y.std())
    u, v = (x - mx) / s, (y - my) / s
    D1, D2 = np.vstack([u * u, u * v, v * v]).T, np.vstack([u, v, np.ones_like(u)]).T
    S1, S2, S3 = D1.T @ D1, D1.T @ D2, D2.T @ D2
    T = -np.linalg.solve(S3, S2.T)
    M = S1 + S2 @ T
    M = np.array([M[2] / 2, -M[1], M[0] / 2])
    V = np.real(np.linalg.eig(M)[1])
    a = V[:, np.nonzero(4 * V[0] * V[2] - V[1] ** 2 > 0)[0][0]]
    A, B, C, D, E, F = np.concatenate([a, T @ a])
    q = np.array([A, B, C, D * s - 2 * A * mx - B * my, E * s - 2 * C * my - B * mx,
                  F * s * s + A * mx * mx + B * mx * my + C * my * my - D * s * mx - E * s * my]) / s ** 2
    return -q if q[0] < 0 else q


def sdist(q, X, Y):
    """Signed distance (px, + inside) to the conic's curve (first order: right near the curve, which is all we need)."""
    A, B, C, D, E, F = q
    f = A * X * X + B * X * Y + C * Y * Y + D * X + E * Y + F
    return -f / np.maximum(np.hypot(2 * A * X + B * Y + D, B * X + 2 * C * Y + E), 1e-6)


def robust(fit, x, y):
    q = fit(x, y)
    for _ in range(4):  # (the stray points out, and fit again)
        res = np.abs(sdist(q, x, y))
        ok = res < max(0.8, 2.5 * np.median(res))
        q = fit(x[ok], y[ok])
    return q


def crossings(V, lo_ok, hi_ok, level):
    """Subpixel points where V crosses level between 4-neighbours, its low side in lo_ok and its high side in hi_ok."""
    xs_, ys_ = [], []
    for ax in (0, 1):
        sl = (slice(None, -1), slice(1, None)) if ax == 0 else ((slice(None), slice(None, -1)), (slice(None), slice(1, None)))
        s0, s1 = (sl[0], sl[1]) if ax == 0 else sl
        for p, q_, back in ((s0, s1, False), (s1, s0, True)):  # (p low, q_ high)
            lo, hi = V[p], V[q_]
            m = (lo < level) & (hi >= level) & lo_ok[p] & hi_ok[q_]
            yy, xx = np.nonzero(m)
            t = (level - lo[m]) / np.maximum(hi[m] - lo[m], 1e-6)
            t = 1 - t if back else t
            if ax == 0:
                xs_.append(xx.astype(float)); ys_.append(yy + t)
            else:
                xs_.append(xx + t); ys_.append(yy.astype(float))
    return np.concatenate(xs_), np.concatenate(ys_)


def grow(rgb, known, it=1200):
    """A colour field grown smoothly from the known pixels over the rest (a Laplace fill)."""
    out = rgb.copy()
    out[~known] = rgb[known].mean(0)
    k = known[..., None]
    for _ in range(it):
        p = np.pad(out, ((1, 1), (1, 1), (0, 0)), mode='edge')
        out = np.where(k, rgb, (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]) / 4)
    return out


def at(m, x, y):
    return m[np.clip(np.round(y).astype(int), 0, m.shape[0] - 1), np.clip(np.round(x).astype(int), 0, m.shape[1] - 1)]


def dry(F, lid=None):
    """x's tears painted out of one frame (float RGBA): each drop becomes x's purple, grown from the purple round it;
    under each pool the eye is drawn again: its outline, its white and its iris carried on along the curves they follow
    where they show (fitted to them), each in its own colour, grown from where it shows. lid: an eye with a lid over its
    top (px above the pool's top that its outline is measured from; None: all round)."""
    F = F.copy()
    r, g, b, a = (F[..., i] for i in range(4))
    h, w = a.shape
    purple = (r > 110) & (b > r + 10) & (g < r - 50) & (b > 170) & (a > 200)
    white = (F[..., :3].min(-1) > 170) & (a > 200)
    dark = (F[..., :3].max(-1) < 90) & (a > 200)
    cyan = (g > 120) & (b > 170) & (b > r + 30) & (a > 100)
    gold = (r > 140) & (g > 70) & (b < 150) & (r - b > 60) & (a > 60)
    black = (F[..., :3].max(-1) < 70) & (b - r < 45) & (a > 200)  # (x's own outlines: black, never the tears' navy)
    keep_out = nd.binary_dilation(black | white | gold)  # (what a drop's cover may not reach: mouth, gloves, bars)
    # the tears: their light blue, the white glints in it, and their dark blue outline (never into purple)
    core = nd.binary_fill_holes(nd.binary_closing(cyan, iterations=2))
    lab, n = nd.label(core)
    T = np.isin(lab, [i + 1 for i, s in enumerate(nd.sum(core, lab, range(1, n + 1))) if s > 30])
    for _ in range(6):
        T |= nd.binary_dilation(T) & ~purple & (b > r + 55) & (b > 95) & (a > 100)
    T = nd.binary_fill_holes(T)
    Y, X = np.mgrid[0:h, 0:w].astype(np.float64)
    other = ~purple & ~T & (a > 200)
    olab, _ = nd.label(other)
    tl, tn = nd.label(T)
    out = F.copy()
    cov = lambda d: np.clip(d + 0.5, 0, 1)[..., None]
    for ti in range(1, tn + 1):
        Ti = tl == ti
        ys, xs = np.nonzero(Ti)
        # its pool: its top rows, as long as they stay wide (a drop hangs below on a narrow neck)
        wid = np.array([(Ti[y]).sum() for y in range(ys.min(), ys.max() + 1)])
        pb = ys.min() + next((k for k in range(len(wid)) if wid[k] < 0.45 * wid.max() and k > np.argmax(wid)), len(wid)) - 1
        pool = Ti & (Y <= pb)
        # the eye: the region with white in it that the pool sits in (the longest contact)
        ring = nd.binary_dilation(pool, iterations=2)
        best, most = None, 0
        for o in np.unique(olab[ring & other]):
            m = olab == o
            c = (m & ring).sum()
            if o and (m & white).sum() > 80 and c > most:
                best, most = m, c
        y0, y1 = max(0, ys.min() - 70), min(h, ys.max() + 8)
        x0, x1 = max(0, xs.min() - 14), min(w, xs.max() + 15)
        sl = (slice(y0, y1), slice(x0, x1))
        win = np.zeros((h, w), bool)
        win[sl] = True
        if best is None or most < 25:  # (a drop of its own: it and 3 px round it)
            cover = Ti | (nd.binary_dilation(Ti, iterations=3) & ~keep_out)
            Pf = grow(F[..., :3][sl], ~cover[sl] & purple[sl])
            wgt = np.clip(nd.distance_transform_edt(cover[sl]) / 2, 0, 1)[..., None]
            out[sl][..., :3] = out[sl][..., :3] * (1 - wgt) + Pf * wgt
            continue
        E = best & win
        near = nd.binary_dilation(T, iterations=2)
        # its outline's outer edge: where purple meets the outline round the eye, and the pool's own edge (the pool
        # fills the eye's bottom up to its outline); the red channel: purple ~190, outlines and tears ≤ 70
        zone = nd.binary_dilation(E | pool, iterations=3) & (Y <= pb + 1)
        if lid is not None:
            zone &= Y >= ys.min() - lid
        px, py = crossings(r, ~purple, purple, 110)
        k = at(zone, px, py)
        q = robust(fit_ellipse, px[k], py[k])
        d_out = sdist(q, X, Y)
        # its outline's width: from its outer edge in to the white
        sx, sy = crossings(F[..., 2], dark, white, 140)
        ds = sdist(q, sx, sy)
        k = at(E & ~near, sx, sy) & (ds > 0.3) & (ds < 7)
        t = float(np.median(ds[k]))
        # the white of the eye (white touching the outline) and the glint (white inside the iris)
        wl, wn = nd.label(white & E)
        band = d_out < t + 3
        sclera = np.isin(wl, [i for i in range(1, wn + 1) if ((wl == i) & band).any()])
        glint = white & E & ~sclera
        # the iris's edge: dark → the white of the eye, well inside the outline
        ix, iy = crossings(F[..., 2], dark, sclera, 140)
        k = at(E & ~near & ~nd.binary_dilation(glint, iterations=2), ix, iy) & (sdist(q, ix, iy) > t + 2.5)
        qi = robust(fit_ellipse, ix[k], iy[k])
        d_iris = sdist(qi, X, Y)
        # what is drawn again: the pool and 3 px round it (its glow and fringe), in the eye or on purple, and a drop
        # hanging from it (3 px round it); each part's colour, grown from where it shows clear of all that; then the
        # eye drawn over the purple, smooth-edged
        cover = Ti | (nd.binary_dilation(pool, iterations=3) & ((d_out > -1.5) | ~keep_out)) | (nd.binary_dilation(Ti, iterations=3) & ~keep_out)
        rgb, kn = F[..., :3][sl], ~nd.binary_dilation(cover, iterations=1)[sl]
        dO, dI = d_out[sl], d_iris[sl]
        Pf = grow(rgb, kn & purple[sl])
        Kf = grow(rgb, kn & black[sl] & (dO > -0.5) & (dO < t) & (dI < -1))
        Wf = grow(rgb, kn & sclera[sl] & (dO > t + 0.8) & (dI < -0.8))
        If = grow(rgb, kn & black[sl] & (dI > 1.2) & (dO > t + 1) & ~nd.binary_dilation(glint, iterations=2)[sl])
        R = Pf + (Kf - Pf) * cov(dO)
        R = R + (Wf - R) * cov(dO - t)
        R = R + (If - R) * (cov(dI) * cov(dO - t * 0.5))
        wgt = np.clip(nd.distance_transform_edt(cover[sl]) / 1.3, 0, 1)[..., None]
        out[sl][..., :3] = out[sl][..., :3] * (1 - wgt) + R * wgt
    return out
