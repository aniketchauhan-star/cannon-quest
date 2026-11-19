# cut the background layer sheet into clean RGBA pieces (alpha components; faint glow removed)
import sys, numpy as np
from PIL import Image
from scipy import ndimage
src, out = sys.argv[1], sys.argv[2]
im = np.array(Image.open(src).convert('RGBA')).astype(np.float32)
a = im[:, :, 3]
lab, n = ndimage.label(a > 128)
objs = ndimage.find_objects(lab)
names = {}
pieces = []
for i, s in enumerate(objs):
    area = (lab[s] == i + 1).sum()
    if area < 1400: continue
    pieces.append((s[0].start, s[1].start, s[0].stop, s[1].stop, i + 1))
pieces.sort()
label_names = ['sky', 'cloudA', 'cloudB', 'cloudC', 'cloudD', 'cloudE', 'mount', 'trees', 'lake', 'plaza',
               'bushFlower', 'bushR', 'bushL2', 'rocksBig', 'rocksMid', 'grassS', 'grassStrip', 'rockS', 'bushTiny']
# order by (top,left) puts them as printed earlier; name by rough position
def nm(p):
    t, l, b, r, _ = p
    if t < 60 and l < 400: return 'sky'
    if t < 200: return f'cloud_{l}'
    if t < 300: return 'mount'
    if t < 400: return 'trees'
    if t < 560: return 'lake'
    if t < 700: return 'plaza'
    return f'prop_{l}'
for p in pieces:
    t, l, b, r, k = p
    pad = 6
    t0, l0, b0, r0 = max(0, t - pad), max(0, l - pad), min(im.shape[0], b + pad), min(im.shape[1], r + pad)
    crop = im[t0:b0, l0:r0].copy()
    own = ndimage.binary_dilation(lab[t0:b0, l0:r0] == k, iterations=3)
    al = crop[:, :, 3]
    # faint matte glow (alpha < ~90) goes; the body keeps a soft 1–2 px edge
    na = np.clip((al - 90) / (235 - 90), 0, 1) * 255 * own
    # edge colours: pull RGB from the nearest solid pixel to kill cyan/black fringe
    solid = (al > 235) & own
    if solid.any():
        idx = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
        fr = (na > 0) & ~solid
        for c in range(3):
            ch = crop[:, :, c]; ch[fr] = ch[idx[0][fr], idx[1][fr]]
    crop[:, :, 3] = na
    name = nm(p)
    Image.fromarray(crop.clip(0, 255).astype(np.uint8)).save(f'{out}/{name}.png')
    print(name, (l0, t0, r0, b0), crop.shape[1], crop.shape[0])
