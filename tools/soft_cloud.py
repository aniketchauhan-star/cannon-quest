# The equation cloud, made calm and far away (assets/img/cloud.webp):
#   1. cut the cloud from art/sprite_sheets/new.png (the same box as cut_new_art.py) and scale it 2× (premultiplied)
#   2. no outline: the blue stroke round the edge is trimmed off (a smooth, sub-pixel distance from the edge), and
#      the edge takes the cloud's own colour from just inside, so no blue fringe is left
#   3. far away (aerial perspective): the shading inside is lighter and a little cooler, the edge is soft, the
#      underside fades into a faint sky-blue, and the outermost few pixels are slightly see-through
# Usage: python tools/soft_cloud.py art/sprite_sheets/new.png assets/img/cloud.webp [preview.png]
import sys, numpy as np, cv2
from PIL import Image
from scipy import ndimage as nd

SRC, OUT = sys.argv[1], sys.argv[2]
BOX, PAD = (22, 407, 576, 657), 3   # as in tools/cut_new_art.py
S = 2                               # output scale (the cloud is shown ~590 art px wide, so ~2× on a retina screen)
TRIM = 5.2                          # how far in the blue stroke reaches, in source px
FEATHER = 2.2                       # the soft edge, in source px
SHADE = 0.72                        # inside shading kept (1 = as painted): lighter = farther and calmer
HAZE = np.array([210, 234, 252], np.float32)  # the sky's light cyan-blue (sampled near the cloud), for aerial perspective

A = np.array(Image.open(SRC).convert('RGBA')).astype(np.float32)
x0, y0, x1, y1 = BOX
c = A[y0 - PAD:y1 + PAD, x0 - PAD:x1 + PAD].copy()
m = c[..., 3] >= 40; lab, n = nd.label(m); k = np.argmax(nd.sum(m, lab, range(1, n + 1))) + 1
c[..., 3] *= nd.binary_dilation(lab == k, iterations=3)   # only the cloud itself

# 1) 2× upscale on premultiplied colour, so the transparent edge does not bleed dark
h, w = c.shape[:2]; H, W = h * S, w * S
a = c[..., 3:] / 255
pm = np.concatenate([c[..., :3] * a, c[..., 3:]], -1)
up = cv2.resize(pm, (W, H), interpolation=cv2.INTER_CUBIC)
ua = np.clip(up[..., 3], 0, 255) / 255
rgb = np.where(ua[..., None] > 1e-3, up[..., :3] / np.maximum(ua[..., None], 1e-3), 0)
rgb = np.clip(rgb, 0, 255)

# a smooth signed distance from the painted edge (output px): + inside, − outside
inside = ua > 0.5
sd = nd.distance_transform_edt(inside) - nd.distance_transform_edt(~inside)
sd = nd.gaussian_filter(sd, 1.2)

# 2) trim the stroke: the new edge sits TRIM in, feathered over FEATHER (a smoothstep)
e0 = TRIM * S
t = np.clip((sd - e0) / (FEATHER * S), 0, 1); alpha = t * t * (3 - 2 * t)

# the edge's colour comes from just inside the stroke (the nearest pixel past it), blended in smoothly
core = sd >= e0 + 3 * S
_, (iy, ix) = nd.distance_transform_edt(~core, return_indices=True)
fill = rgb[iy, ix]
for ch in range(3): fill[..., ch] = nd.gaussian_filter(fill[..., ch], 2.0 * S)
wgt = np.clip((sd - (e0 + 1 * S)) / (3 * S), 0, 1)[..., None]   # 0 at the edge → 1 well inside
rgb = rgb * wgt + fill * (1 - wgt)

# 3) aerial perspective: lighter, cooler shading; the underside drifts toward the sky's blue
lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
shade = np.clip((255 - lum) / 255, 0, 1)[..., None]               # 0 on the lit white, more in the shading
rgb = 255 - (255 - rgb) * SHADE                                    # lighter shading, same shapes
rgb = rgb * (1 - 0.5 * shade) + HAZE * (0.5 * shade)              # the shading takes the sky's hue
ys = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
low = np.clip((ys - 0.55) / 0.45, 0, 1) ** 1.5                     # the lower part of the cloud
rim = np.clip(1 - (sd[..., None] - e0) / (14 * S), 0, 1)          # near the edge
rgb = rgb * (1 - 0.22 * low * rim) + HAZE * (0.22 * low * rim)
alpha = alpha * (1 - 0.12 * np.clip(1 - (sd - e0) / (6 * S), 0, 1) * (sd > e0))  # the outermost px a touch see-through

out = np.dstack([np.clip(rgb, 0, 255), np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
ys_, xs_ = np.nonzero(out[..., 3] > 0)
out = out[max(ys_.min() - 2, 0):ys_.max() + 3, max(xs_.min() - 2, 0):xs_.max() + 3]   # snug, a 2 px margin
img = Image.fromarray(out, 'RGBA')
img.save(OUT, 'WEBP', quality=90, alpha_quality=100, method=6)
print(f'{OUT}: {img.size[0]}×{img.size[1]}, from {w}×{h} source')
if len(sys.argv) > 3:   # a preview on the game's sky blue
    bg = Image.new('RGBA', img.size, (98, 178, 236, 255)); bg.alpha_composite(img); bg.convert('RGB').save(sys.argv[3])
