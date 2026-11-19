# Cut the caption board (the wooden board the voice's words sit on) from the user's UI sheet
# art/sprite_sheets/ui_elements.png: the jungle board (trays, row 2, third: wood in a gold frame, a bamboo rail with
# green rings, rope bindings, leaves at both ends). It is rebuilt so CSS can size it to ANY text (border-image 9-slice):
#
#   cap_board.png   left end | one seamless middle piece (one bamboo ring) | right end, 270 × 117 art px (2× stored).
#                   Slices: top 42, bottom 39 (rows 78..117), left 80, right 80. The corners are as drawn (their leaves
#                   and ropes never stretch). The left / right edge strips (rows 42..78) have their leaves taken off
#                   and the gold end bar's outer edge redrawn smooth, so they can stretch for 2–3 lines of text.
#   cap_leaf_l.png  the whole leaf column of the left end (full height). CSS draws it twice, pinned to the board's top
#                   and to its bottom: for one line they coincide (= the art), a taller board gets a fuller column
#   cap_leaf_r.png  the same on the right
#
# Usage (a Python with cv2.dnn_superres, scipy and PIL):
#   python tools/cut_caption_board.py art/sprite_sheets/ui_elements.png EDSR_x2.pb OUTDIR
# then cwebp each PNG into assets/img/. The numbers the CSS needs (#cap in src/00_head.html) are the art px above.
import sys, numpy as np, cv2
from PIL import Image
from scipy import ndimage as nd

SRC, MODEL, OUT = sys.argv[1:4]
A = np.array(Image.open(SRC).convert('RGBA'))
X0, Y0, W, H = 1116, 804, 537, 117          # the board on the sheet (its component box 1121,809 527×107, with a margin)
L, R, TOP, BOT = 80, 457, 42, 78             # end widths (left end 0..80, right end 457..537), top / bottom slice rows
T0, T1, F = 260, 370, 14                     # the middle piece: one bamboo ring (at 320), made seamless over F px
k = 2                                        # stored at 2× (EDSR)

# the board alone (no neighbour on the sheet), its hidden colours bled out from the edge
n, lab, st, _ = cv2.connectedComponentsWithStats((A[..., 3] > 40).astype(np.uint8), 8)
i = next(j for j in range(1, n) if tuple(int(v) for v in st[j][:4]) == (1121, 809, 527, 107))
c = A[Y0:Y0 + H, X0:X0 + W].astype(np.float32).copy()
c[..., 3] *= cv2.dilate((lab[Y0:Y0 + H, X0:X0 + W] == i).astype(np.uint8), np.ones((7, 7), np.uint8))
_, (iy, ix) = nd.distance_transform_edt(~(c[..., 3] > 200), return_indices=True)
c[..., :3] = c[iy, ix, :3]

sr = cv2.dnn_superres.DnnSuperResImpl_create(); sr.readModel(MODEL); sr.setModel('edsr', 2)
rgb = cv2.cvtColor(sr.upsample(cv2.cvtColor(np.clip(c[..., :3], 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)), cv2.COLOR_BGR2RGB)
a = np.array(Image.fromarray(np.clip(c[..., 3], 0, 255).astype(np.uint8)).resize((W * k, H * k), Image.LANCZOS))
B = np.dstack([rgb, a]).astype(np.float32)                    # the board at 2×
Hh, Ww = B.shape[:2]


def gold(p):  # the gold frame's colours (not leaf green, not wood brown)
    r, g, b = p[..., 0], p[..., 1], p[..., 2]
    return (r > 150) & (g > 95) & (b < 140) & (r >= g) & ~((g > r + 6) & (g > b + 30))


# ---- the leaves on each end: lifted out whole as one column (CSS draws it twice, pinned to the board's top and to its
# bottom: one line of text = exactly the art; a taller board gets a fuller column of overlapping leaves, never a cut
# leaf). The edge strip that stretches (rows TOP..BOT) loses its leaves, and the gold bar's outer edge there is redrawn
r_, g_, b_ = B[..., 0], B[..., 1], B[..., 2]
leafm = (g_ > r_ + 6) & (g_ > b_ + 20) & (B[..., 3] > 20)
leafm = nd.binary_dilation(leafm, iterations=k)                  # (their soft edges and dark outlines too)
leaves = {}
def bar_edge(side):  # where the gold end bar starts on each row of the edge strip, from that side (2× px)
    S = B[TOP * k:BOT * k]; lm = leafm[TOP * k:BOT * k]
    if side == 'r': S, lm = S[:, ::-1], lm[:, ::-1]
    g = gold(S) & (S[..., 3] > 200) & ~lm
    return np.array([np.argmax(g[y, 20 * k:60 * k]) + 20 * k for y in range(S.shape[0])], np.float32)


for side, (c0, c1) in (('l', (0, 95 * k)), ('r', (Ww - 95 * k, Ww))):
    col = B[:, c0:c1].copy(); col[..., 3] *= leafm[:, c0:c1]
    # only what is outside the bar (its outer edge measured on this side, + 1.5 px under it): a copy pinned lower down
    # must never lay a leaf over the bar or the wood (there the leaves just look tucked behind the bar); the corners
    # keep their own painted leaves anyway
    edge = float(np.median(bar_edge(side))) + 1.5 * k
    xg = np.arange(c0, c1, dtype=np.float32)
    col[..., 3] *= np.clip(((edge - xg) if side == 'l' else (xg - (Ww - edge))) / k + 0.5, 0, 1)[None, :]
    cols = np.where((col[..., 3] > 8).any(0))[0]
    leaves[side] = (col[:, cols.min():cols.max() + 1], c0 + cols.min(), c0 + cols.max() + 1)
y0, y1 = TOP * k, BOT * k
for side in ('l', 'r'):
    S = B[y0:y1].copy(); lm = leafm[y0:y1].copy()
    if side == 'r': S, lm = S[:, ::-1], lm[:, ::-1]               # (the right end, mirrored, uses the same steps)
    g = gold(S) & (S[..., 3] > 200) & ~lm
    raw = np.array([np.argmax(g[y, 20 * k:60 * k]) + 20 * k for y in range(S.shape[0])], np.float32)
    # the bar's outer edge: one calm curve, never cutting into the bar (so no gap opens between leaves and bar)
    xs = np.minimum(nd.gaussian_filter1d(nd.median_filter(raw, 9), 4), raw)
    xx = np.arange(S.shape[1])[None, :].astype(np.float32)
    for y in range(S.shape[0]):                                  # where the leaves had covered the rim: the rim's colour
        r0 = int(raw[y])
        for x in range(max(0, int(np.floor(xs[y])) - 1), r0): S[y, x, :3] = S[y, r0 + 1, :3]
    keep = np.clip(xx - (xs[:, None] - 0.5), 0, 1)
    S[..., 3] = np.where(xx < xs[:, None] + 3, keep * 255, S[..., 3])
    if side == 'r': S = S[:, ::-1]
    B[y0:y1] = S

# ---- the middle piece: one bamboo ring, seamless (its first F px fade from what follows its end)
P = B[:, T0 * k:T1 * k].copy(); f = F * k
nxt = B[:, T1 * k:T1 * k + f]
w = np.linspace(0, 1, f, dtype=np.float32)[None, :, None]
P[:, :f] = nxt * (1 - w) + P[:, :f] * w
# the ends, faded into the piece where they meet it (so the rails and the grain run on without a step)
Lp, Rp = B[:, :L * k].copy(), B[:, R * k:].copy(); e = 10 * k
we = np.linspace(0, 1, e, dtype=np.float32)[None, :, None]
Lp[:, -e:] = Lp[:, -e:] * (1 - we) + P[:, :e] * we
Rp[:, :e] = P[:, -e:] * (1 - we) + Rp[:, :e] * we
board = np.concatenate([Lp, P, Rp], axis=1)


def save(arr, name):
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)); im.save(f'{OUT}/{name}', optimize=True); return im.size


print('cap_board', save(board, 'cap_board.png'), 'slices (2× px): top', TOP * k, 'right', L * k, 'bottom', (H - BOT) * k, 'left', L * k)
for side, (lf, c0, c1) in leaves.items(): # where each leaf column sits: from its own edge of the board (art px), full height
    off = c0 / k if side == 'l' else (Ww - c1) / k
    print(f'cap_leaf_{side}', save(lf, f'cap_leaf_{side}.png'), f'{off:.1f} art px in from the board\'s {"left" if side == "l" else "right"} edge, rows 0..{H}')
