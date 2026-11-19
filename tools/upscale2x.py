import sys, os, cv2, numpy as np
from PIL import Image
model, src, dst = sys.argv[1], sys.argv[2], sys.argv[3]
sr = cv2.dnn_superres.DnnSuperResImpl_create(); sr.readModel(model); sr.setModel('edsr', 2)
T, P = 384, 12
for f in sorted(os.listdir(src)):
    if not f.endswith('.png') or f.startswith('cloud') or f == 'sky.png': continue
    im = np.array(Image.open(os.path.join(src, f)).convert('RGBA'))
    rgb = cv2.cvtColor(im[:, :, :3], cv2.COLOR_RGB2BGR); H, W = rgb.shape[:2]
    out = np.zeros((H * 2, W * 2, 3), np.uint8)
    for y in range(0, H, T):
        for x in range(0, W, T):
            y0, x0, y1, x1 = max(0, y - P), max(0, x - P), min(H, y + T + P), min(W, x + T + P)
            up = sr.upsample(rgb[y0:y1, x0:x1])
            oy, ox = (y - y0) * 2, (x - x0) * 2
            h, w = min(T, H - y) * 2, min(T, W - x) * 2
            out[y * 2:y * 2 + h, x * 2:x * 2 + w] = up[oy:oy + h, ox:ox + w]
    a = np.array(Image.fromarray(im[:, :, 3]).resize((W * 2, H * 2), Image.LANCZOS))
    res = np.dstack([cv2.cvtColor(out, cv2.COLOR_BGR2RGB), a])
    Image.fromarray(res).save(os.path.join(dst, f)); print('done', f, flush=True)
