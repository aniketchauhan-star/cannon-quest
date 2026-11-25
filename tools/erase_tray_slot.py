#!/usr/bin/env python3
"""Erase the glowing cyan slot from the front rail of the orbs' tray (design review, 23 Nov 2026: "the cyan glowing
slot under the tray has no function; use it or remove it").

The tray's front rail runs straight across the picture, so the slot is covered with a stretch of the same rail
copied from its left (the same rows, so the wood's streaks, the yellow top edge and the dark lip line up), blended
in over a few pixels at both ends so no seam shows. Works on the tray (rack.webp) and on its front layer
(rack_front.webp), which both carry the slot at the same place.

    PY tools/erase_tray_slot.py assets/img/rack.webp assets/img/rack_front.webp

PY = a Python with NumPy and Pillow (~/.cache/bj-voices/venv/bin/python on this Mac). Each file is rewritten in
place as a WebP (lossy colour at q 90, lossless alpha, as the game's other sprites). Running it again does no harm:
the rail is copied over rail.
"""
import sys
import numpy as np
from PIL import Image

# the slot in the HD tray's pixels (3236 x 374): it runs from x ~1430 to ~1830 and from the rail's yellow top edge
# (a little notch at x ~1627, y ~280) down past the rail's lip (y ~355)
X0, X1 = 1405, 1855          # the columns replaced
Y0 = 262                     # from here to the picture's bottom
FEATHER = 20                 # px of blend at each end
SRC_X0 = X0 - (X1 - X0)      # the clean rail to its left, just as wide


def erase(path):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im).astype(np.float32)
    w = X1 - X0
    patch = a[Y0:, SRC_X0:SRC_X0 + w].copy()
    orig = a[Y0:, X0:X1]
    x = np.arange(w, dtype=np.float32)
    ramp = np.clip(np.minimum(x + 1, w - x) / FEATHER, 0, 1)
    k = (ramp * ramp * (3 - 2 * ramp))[None, :, None]  # smoothstep
    # blend in premultiplied colour, so the transparent rows under the rail stay clean
    pa, oa = patch[..., 3:4] / 255, orig[..., 3:4] / 255
    rgb = patch[..., :3] * pa * k + orig[..., :3] * oa * (1 - k)
    al = pa * k + oa * (1 - k)
    out = np.where(al > 1e-4, rgb / np.maximum(al, 1e-4), 0)
    a[Y0:, X0:X1, :3] = out
    a[Y0:, X0:X1, 3:4] = al * 255
    Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), 'RGBA').save(path, 'WEBP', quality=90, method=6, alpha_quality=100)
    print('erased the slot in', path)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for p in sys.argv[1:]:
        erase(p)
