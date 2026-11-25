#!/usr/bin/env python3
"""The equation cloud's warm rim light (design review, 23 Nov 2026: "a stock cloud placed flat in the sky, with no
motion or light… a warm rim light on the sun side (top right)").

From the cloud's own picture (assets/img/cloud.webp, painted by tools/paint_cloud.py) it finds the edges that face
the sun (top right: a pixel of cloud whose neighbour a few px toward the sun is open sky), softens them, and keeps
them strongest on the cloud's upper right, fading toward its lower left. Then a faint warm wash over the same
side. The result is a picture the same size as the cloud's, laid exactly over it (.clr in #cloud).

    PY tools/cloud_rim.py assets/img/cloud.webp assets/img/cloud_rim.webp

PY = a Python with NumPy, SciPy and Pillow (~/.cache/bj-voices/venv/bin/python on this Mac). Re-run it whenever
the cloud is repainted.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

SUN = np.array([0.72, -0.69])  # toward the sun, in picture px (x right, y down): up and to the right
WARM = np.array([255, 233, 178], np.float32)


def main(src, dst):
    im = Image.open(src).convert('RGBA')
    a = np.asarray(im).astype(np.float32) / 255
    A = a[..., 3]
    H, W = A.shape
    k = W / 760  # the cloud's art is 760 art px wide
    rim = np.zeros_like(A)
    # a few distances, so the rim has a bright edge and a softer band inside it
    for d, wgt in ((6 * k, 0.55), (13 * k, 0.3), (24 * k, 0.15)):
        sky = 1 - ndimage.shift(A, (-SUN[1] * d, -SUN[0] * d), order=1, mode='constant', cval=0)
        rim += wgt * np.clip(sky, 0, 1)
    rim = ndimage.gaussian_filter(rim * A, 4.5 * k) * A
    # strongest up and to the right of the cloud's middle, nothing on its far lower left
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    side = ((xx / W - 0.5) * SUN[0] + (yy / H - 0.5) * SUN[1]) * 1.6 + 0.55
    side = np.clip(side, 0, 1) ** 1.3
    # the flat blue base under the cloud gets none (the sun is above it)
    base = np.clip((H * 0.88 - yy) / (H * 0.12), 0, 1)
    alpha = np.clip(rim * 1.3, 0, 1) * side * base * 0.5
    # a faint warm wash over the sunny side of the cloud's body
    wash = A * side * base * 0.05
    al = np.clip(alpha + wash * (1 - alpha), 0, 1)
    out = np.zeros((H, W, 4), np.float32)
    out[..., :3] = WARM
    out[..., 3] = al * 255
    Image.fromarray(out.astype(np.uint8), 'RGBA').save(dst, 'WEBP', quality=88, method=6, alpha_quality=90)
    print('wrote', dst, (W, H), 'max alpha', round(float(al.max()), 3))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
