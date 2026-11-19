# Cut the free x character (no cage) from art/sprite_sheets/1.png: its alpha body only, the faint glow removed,
# edge colours pulled in from the solid art so no purple halo is left. Writes an RGBA PNG (then upscale2x.py → WebP).
import sys, numpy as np
from PIL import Image
from scipy import ndimage
src, out = sys.argv[1], sys.argv[2]
im = np.array(Image.open(src).convert('RGBA')).astype(np.float32)
box = (1170, 50, 1450, 330)  # around the x, top right of the sheet
crop = im[box[1]:box[3], box[0]:box[2]].copy()
al = crop[:, :, 3]
lab, n = ndimage.label(al > 128)
sizes = ndimage.sum(np.ones_like(al), lab, range(1, n + 1))
main = 1 + int(np.argmax(sizes))
own = ndimage.binary_fill_holes(lab == main)
own = ndimage.binary_dilation(own, iterations=2)
na = np.clip((al - 90) / (235 - 90), 0, 1) * 255 * own
solid = (al > 235) & own
idx = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
fr = (na > 0) & ~solid
for c in range(3):
    ch = crop[:, :, c]; ch[fr] = ch[idx[0][fr], idx[1][fr]]
crop[:, :, 3] = na
ys, xs = np.where(na > 8)
pad = 4
crop = crop[max(0, ys.min() - pad):ys.max() + pad + 1, max(0, xs.min() - pad):xs.max() + pad + 1]
Image.fromarray(crop.clip(0, 255).astype(np.uint8)).save(out)
print('saved', out, crop.shape[1], 'x', crop.shape[0])
