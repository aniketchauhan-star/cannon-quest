# Compose the parallax background layers (bg units = the 1672x941 frame the old bg.jpg filled; saved at 2x)
import sys, json, numpy as np
from PIL import Image
SRC, OUT = sys.argv[1], sys.argv[2]
R = 2
def L(n): return Image.open(f'{SRC}/{n}.png').convert('RGBA')
def scaled(im, w=None, h=None, f=None):
    # im is already 2x of the sheet; target size in bg units
    if f is not None: w, h = im.width / 2 * f, im.height / 2 * f
    return im.resize((max(1, round(w * R)), max(1, round(h * R))), Image.LANCZOS)
lay = {}
FW, FH = 1672, 941
# --- far strips: wider than the frame (parallax margin) ---
W = 1940; X0 = (FW - W) / 2
mount = L('mount'); m = scaled(mount, W, mount.height / 2 * W / (mount.width / 2) * 1.32)
trees = L('trees'); t = scaled(trees, W, trees.height / 2 * W / (trees.width / 2))
lake = L('lake'); lk = scaled(lake, W, lake.height / 2 * W / (lake.width / 2))
lay['mount'] = dict(x=X0, y=322, w=W, h=m.height / R); m.save(f'{OUT}/bg_mount.png')
lay['trees'] = dict(x=X0, y=404, w=W, h=t.height / R); t.save(f'{OUT}/bg_trees.png')
lay['lake'] = dict(x=X0, y=546, w=W, h=lk.height / R); lk.save(f'{OUT}/bg_lake.png')
# --- ground (k = 1): grass bank, plaza in perspective, lake-edge rocks + plants ---
GT, GW = 560, FW + 120; GX = -60
GH = FH + 30 - GT
g = Image.new('RGBA', (GW * R, GH * R), (0, 0, 0, 0))
yy = np.linspace(0, 1, GH * R)[:, None]
top = np.array([128, 210, 62]); bot = np.array([98, 188, 46])
grad = (top * (1 - yy) + bot * yy)[:, None, :].repeat(GW * R, 1).reshape(GH * R, GW * R, 3)
base = np.dstack([grad, np.full((GH * R, GW * R, 1), 255)]).astype(np.uint8)
bank0 = 662 - GT  # grass bank starts here (just under the lake's bottom edge, which overlaps it)
base[: bank0 * R, :, 3] = 0
g = Image.fromarray(base)
def put(im, x, y_bottom, flip=False):
    if flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    g.alpha_composite(im, (round((x - GX) * R), round((y_bottom - GT) * R - im.height)))
# grass tufts along the lake's edge
gs = scaled(L('prop_685'), f=0.62)
x = GX - 20
while x < GX + GW:
    put(gs, x, 676, flip=(int(x) // 151) % 2 == 1); x += gs.width / R - 18
# plaza with a perspective stretch (far rows compressed, near rows tall)
pz = L('plaza'); pw, ph = pz.size
PT, PB, PW = 678, FH + 40, 1830
dh = round((PB - PT) * R)
u = np.linspace(0, 1, dh) ** (1 / 1.45) * (ph - 1)  # dest v -> src row
arr = np.array(pz).astype(np.float32)
i0 = np.floor(u).astype(int); fr = (u - i0)[:, None, None]; i1 = np.minimum(i0 + 1, ph - 1)
st = arr[i0] * (1 - fr) + arr[i1] * fr
pzs = Image.fromarray(st.clip(0, 255).astype(np.uint8)).resize((round(PW * R), dh), Image.LANCZOS)
g.alpha_composite(pzs, (round(((FW - PW) / 2 - GX) * R), round((PT - GT) * R)))
# rocks + plants on the bank (like the painted scene: left and right of the lake, clear of the cannon)
put(scaled(L('prop_262'), f=1.0), -10, 686)
put(scaled(L('prop_940'), f=1.18), 70, 690)
put(scaled(L('prop_1452'), f=0.9), 430, 684)
put(scaled(L('prop_597'), f=0.9), 520, 682)
put(scaled(L('prop_262'), f=1.0), 1500, 688, flip=True)
put(scaled(L('prop_940'), f=1.12), 1260, 690, flip=True)
put(scaled(L('prop_1243'), f=0.95), 1110, 686)
put(scaled(L('prop_464'), f=0.8), 1050, 684, flip=True)
g.save(f'{OUT}/bg_ground.png')
lay['ground'] = dict(x=GX, y=GT, w=GW, h=GH)
# --- foreground corner plants (own layer, parallax > 1, they sway) ---
fl = scaled(L('prop_16'), f=1.3); fr_ = scaled(L('prop_1567'), f=1.3).transpose(Image.FLIP_LEFT_RIGHT)
fl.save(f'{OUT}/bg_foreL.png'); fr_.save(f'{OUT}/bg_foreR.png')
lay['foreL'] = dict(x=-36, y=FH + 14 - fl.height / R, w=fl.width / R, h=fl.height / R)
lay['foreR'] = dict(x=FW + 30 - fr_.width / R, y=FH + 14 - fr_.height / R, w=fr_.width / R, h=fr_.height / R)
# preview (sky gradient + all layers) at 1x
pv = Image.new('RGBA', (FW, FH))
sy = np.linspace(0, 1, FH)[:, None]
sk = np.array([38, 168, 246]) * (1 - sy) + np.array([168, 228, 251]) * sy
pv = Image.fromarray(np.dstack([sk[:, None, :].repeat(FW, 1).reshape(FH, FW, 3), np.full((FH, FW, 1), 255)]).astype(np.uint8))
for k in ['mount', 'trees', 'lake', 'ground', 'foreL', 'foreR']:
    d = lay[k]; im = Image.open(f'{OUT}/bg_{k}.png').resize((round(d['w']), round(d['h'])), Image.LANCZOS)
    pv.alpha_composite(im, (round(d['x']) if d['x'] >= 0 else 0, round(d['y'])) if d['x'] >= 0 else (0, round(d['y']))) if False else None
    tmp = Image.new('RGBA', (FW + 800, FH + 400)); tmp.alpha_composite(im, (round(d['x']) + 400, round(d['y']) + 200))
    pv.alpha_composite(tmp.crop((400, 200, 400 + FW, 200 + FH)))
pv.convert('RGB').save(f'{OUT}/preview.png')
print(json.dumps({k: {kk: round(vv, 1) for kk, vv in v.items()} for k, v in lay.items()}))
