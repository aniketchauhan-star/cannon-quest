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
# Saved in pieces so the plants can sway in the wind (src/32_scenery.js): the bank is a CSS gradient, the plaza and
# the rocks are still pictures, and every grass tuft and bush is its own picture. Back to front: bank, grass strip,
# plaza, bushes, rocks, small tufts (the same order the single ground picture was painted in). Positions go to
# bg_ground.json in ground units (the ground box: x GX, y GT, GW x GH bg units).
GT, GW = 560, FW + 120; GX = -60
GH = FH + 30 - GT
yy = np.linspace(0, 1, GH * R)[:, None]
top = np.array([128, 210, 62]); bot = np.array([98, 188, 46])
grad = (top * (1 - yy) + bot * yy)[:, None, :].repeat(GW * R, 1).reshape(GH * R, GW * R, 3)
base = np.dstack([grad, np.full((GH * R, GW * R, 1), 255)]).astype(np.uint8)
bank0 = 662 - GT  # grass bank starts here (just under the lake's bottom edge, which overlaps it)
base[: bank0 * R, :, 3] = 0
g = Image.fromarray(base)  # the whole ground, for the preview only
k0 = bank0 / GH
ground = {'box': dict(x=GX, y=GT, w=GW, h=GH),
          'bank': dict(y=bank0, top=[round(float(c), 1) for c in top * (1 - k0) + bot * k0], bot=[int(c) for c in bot]),
          'grass': [], 'plants': []}
def place(im, x, y_bottom, flip=False):
    if flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    l, t = (x - GX), (y_bottom - GT) - im.height / R
    g.alpha_composite(im, (round(l * R), round(t * R)))
    return dict(x=round(l, 2), y=round(t, 2), w=round(im.width / R, 2), h=round(im.height / R, 2))
def group(name, items):  # several props flattened into one still picture, cropped to what they cover
    c = Image.new('RGBA', (GW * R, GH * R))
    for im, x, yb, fl in items:
        if fl: im = im.transpose(Image.FLIP_LEFT_RIGHT)
        c.alpha_composite(im, (round((x - GX) * R), round((yb - GT) * R - im.height)))
    g.alpha_composite(c)
    b = c.getbbox(); c.crop(b).save(f'{OUT}/{name}.png')
    return dict(src=name, x=round(b[0] / R, 2), y=round(b[1] / R, 2), w=round((b[2] - b[0]) / R, 2), h=round((b[3] - b[1]) / R, 2))
# grass tufts along the lake's edge (one picture, repeated; every other one mirrored)
gs = scaled(L('prop_685'), f=0.62); gs.save(f'{OUT}/bg_grass.png')
x = GX - 20
while x < GX + GW:
    fl = (int(x) // 151) % 2 == 1
    ground['grass'].append({**place(gs, x, 676, flip=fl), 'flip': fl}); x += gs.width / R - 18
# plaza with a perspective stretch (far rows compressed, near rows tall)
pz = L('plaza'); pw, ph = pz.size
PT, PB, PW = 678, FH + 40, 1830
dh = round((PB - PT) * R)
u = np.linspace(0, 1, dh) ** (1 / 1.45) * (ph - 1)  # dest v -> src row
arr = np.array(pz).astype(np.float32)
i0 = np.floor(u).astype(int); fr = (u - i0)[:, None, None]; i1 = np.minimum(i0 + 1, ph - 1)
st = arr[i0] * (1 - fr) + arr[i1] * fr
pzs = Image.fromarray(st.clip(0, 255).astype(np.uint8)).resize((round(PW * R), dh), Image.LANCZOS)
ground['plaza'] = group('bg_plaza', [(pzs, (FW - PW) / 2, PT + dh / R, False)])
# rocks + plants on the bank (like the painted scene: left and right of the lake, clear of the cannon)
bush = scaled(L('prop_262'), f=1.0); bush.save(f'{OUT}/bg_bush.png')
ground['plants'].append({**place(bush, -10, 686), 'src': 'bg_bush', 'flip': False})
ground['plants'].append({**place(bush, 1500, 688, flip=True), 'src': 'bg_bush', 'flip': True})
ground['rocks'] = [group('bg_rocksL', [(scaled(L('prop_940'), f=1.18), 70, 690, False), (scaled(L('prop_1452'), f=0.9), 430, 684, False)]),
                   group('bg_rocksR', [(scaled(L('prop_940'), f=1.12), 1260, 690, True), (scaled(L('prop_1243'), f=0.95), 1110, 686, False)])]
t1 = scaled(L('prop_597'), f=0.9); t1.save(f'{OUT}/bg_tuft1.png')
t2 = scaled(L('prop_464'), f=0.8); t2.save(f'{OUT}/bg_tuft2.png')
ground['tufts'] = [{**place(t1, 520, 682), 'src': 'bg_tuft1', 'flip': False}, {**place(t2, 1050, 684, flip=True), 'src': 'bg_tuft2', 'flip': True}]
g.save(f'{OUT}/bg_ground.png')  # (preview only: the game builds the ground from the pieces)
json.dump(ground, open(f'{OUT}/bg_ground.json', 'w'), indent=1)
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
