#!/usr/bin/env python3
"""
HD pictures (20 Nov 2026, user: "make the assets quality better… so it looks HD").

The user's sheets are small (the whole UI sheet is 1672×941, so the cannon in it is ~300 px wide), and the first cuts
were only 1.2–1.5 game px per art px: on a retina screen, with the camera zoomed in, they were stretched and soft. This
upscales the game's finished pictures with Real-ESRGAN's model for illustrations (RealESRGAN_x4plus_anime_6B: clean
lines, flat cartoon shading kept flat), then sizes each one to about DENSITY picture px per art px it is drawn at.

Every picture keeps its exact proportions (or is drawn at a size set in CSS / JS), so nothing moves in the game: the
geometry in src/30_stage.js (CANNON, RACK, BALL_ART…) is in fractions or in the old "source px", which the code only
ever uses as ratios.

Colour and alpha are upscaled separately: the colour under transparent pixels is first bled out from the edge (so no
dark fringe), and the alpha goes through the same model (crisp edges, no halo).

Runs on this Mac's GPU (MPS) with plain PyTorch: the network below is Real-ESRGAN's RRDBNet (BSD-3, xinntao/Real-ESRGAN),
the weights a data file loaded with weights_only=True (no code in it is run).

    PY tools/hd_upscale.py OUTDIR name:width … layer:name …    width = the output's width in px;
                                                                  layer:name = a cut-out layer, cut from name's HD
then cwebp each PNG into assets/img/ (see build notes in README.md).
PY = a Python with torch, numpy and PIL (~/.cache/bj-voices/venv/bin/python on this Mac);
weights: ~/.cache/esrgan-weights/RealESRGAN_x4plus_anime_6B.pth (github.com/xinntao/Real-ESRGAN, release v0.2.2.4).
"""
import os
import sys

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEIGHTS = os.path.expanduser("~/.cache/esrgan-weights/RealESRGAN_x4plus_anime_6B.pth")
TILE, PAD = 192, 16  # input px per tile, and the overlap round it (the seams are cut away)


# ---------------------------------------------------------------------------------------------- the network
class RDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        return self.conv5(torch.cat((x, x1, x2, x3, x4), 1)) * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf, gc=32):
        super().__init__()
        self.rdb1, self.rdb2, self.rdb3 = RDB(nf, gc), RDB(nf, gc), RDB(nf, gc)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):  # scale 4
    def __init__(self, nb=6, nf=64, gc=32):
        super().__init__()
        self.conv_first = nn.Conv2d(3, nf, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
        self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        f = self.conv_first(x)
        f = f + self.conv_body(self.body(f))
        f = self.lrelu(self.conv_up1(F.interpolate(f, scale_factor=2, mode="nearest")))
        f = self.lrelu(self.conv_up2(F.interpolate(f, scale_factor=2, mode="nearest")))
        return self.conv_last(self.lrelu(self.conv_hr(f)))


DEV = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
NET = RRDBNet()
state = torch.load(WEIGHTS, map_location="cpu", weights_only=True)
NET.load_state_dict(state.get("params_ema", state), strict=True)
NET.eval().to(DEV)


@torch.no_grad()
def x4(rgb):
    """an H×W×3 float image (0..1) → 4H×4W×3, tile by tile"""
    H, W = rgb.shape[:2]
    out = np.zeros((H * 4, W * 4, 3), np.float32)
    for y in range(0, H, TILE):
        for x in range(0, W, TILE):
            y0, x0, y1, x1 = max(0, y - PAD), max(0, x - PAD), min(H, y + TILE + PAD), min(W, x + TILE + PAD)
            t = torch.from_numpy(np.ascontiguousarray(rgb[y0:y1, x0:x1].transpose(2, 0, 1)))[None].to(DEV)
            o = NET(t)[0].clamp(0, 1).cpu().numpy().transpose(1, 2, 0)
            ty, tx = (y - y0) * 4, (x - x0) * 4
            h, w = min(TILE, H - y) * 4, min(TILE, W - x) * 4
            out[y * 4:y * 4 + h, x * 4:x * 4 + w] = o[ty:ty + h, tx:tx + w]
    return out


def bleed(im):
    """the colour under transparent pixels, filled in from the nearest opaque colours (so the model sees no dark
    fringe at the edge): premultiplied blurs at growing radii, each filling what the smaller ones could not"""
    a = np.asarray(im.getchannel("A"), np.float32) / 255
    rgb = np.asarray(im.convert("RGB"), np.float32) / 255
    out = rgb.copy(); need = a < 0.98
    pm = Image.fromarray((rgb * a[..., None] * 255).astype(np.uint8)); am = Image.fromarray((a * 255).astype(np.uint8))
    filled = ~need
    for r in (1, 2, 4, 8, 16, 32, 64):
        p = np.asarray(pm.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255
        q = np.asarray(am.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255
        ok = (q > 0.02) & ~filled
        out[ok] = p[ok] / q[ok, None]
        filled |= ok
    # where it is partly transparent, keep its own colour where it has one
    part = (a > 0.02) & need
    out[part] = rgb[part] * a[part, None] + out[part] * (1 - a[part, None])
    return np.clip(out, 0, 1)


def hd(name, width, outdir):
    src = os.path.join(ROOT, "assets", "img", name + ".webp")
    im = Image.open(src).convert("RGBA")
    W, H = im.size
    height = round(width * H / W)
    rgb = x4(bleed(im))
    al = np.asarray(im.getchannel("A"), np.float32) / 255
    if al.min() < 1:
        a4 = x4(np.repeat(al[..., None], 3, 2)).mean(2)
    else:
        a4 = np.ones(rgb.shape[:2], np.float32)
    big = Image.fromarray((np.dstack([rgb, a4[..., None]]) * 255).round().clip(0, 255).astype(np.uint8), "RGBA")
    out = big.resize((width, height), Image.LANCZOS)
    path = os.path.join(outdir, name + ".png")
    out.save(path)
    print(f"{name}: {W}×{H} → {width}×{height}")


def cutout(name, base, outdir):
    """a layer that is a cut-out of another picture (cannonN_front = only its gold ring, rack_front = its front lip,
    t_cage_front = the bars in front of x): cut again from that picture's HD version, by the same mask scaled up, so
    it lines up with it to the pixel (upscaled on its own, its edges would drift a little from the picture under it)"""
    lo_f = Image.open(os.path.join(ROOT, "assets", "img", name + ".webp")).convert("RGBA")
    lo_b = Image.open(os.path.join(ROOT, "assets", "img", base + ".webp")).convert("RGBA")
    fa = np.asarray(lo_f.getchannel("A"), np.float32); ba = np.asarray(lo_b.getchannel("A"), np.float32)
    mask = np.where(ba > 4, np.clip(fa / np.maximum(ba, 1), 0, 1), 0).astype(np.float32)
    big = Image.open(os.path.join(outdir, base + ".png")).convert("RGBA")
    m = np.clip(np.asarray(Image.fromarray(mask, "F").resize(big.size, Image.LANCZOS)), 0, 1)
    arr = np.asarray(big).copy()
    arr[..., 3] = np.round(arr[..., 3] * m).astype(np.uint8)
    Image.fromarray(arr, "RGBA").save(os.path.join(outdir, name + ".png"))
    print(f"{name}: cut from {base} → {big.size[0]}×{big.size[1]}")


if __name__ == "__main__":
    # name:width upscales a picture; name:base (base given earlier in the list) cuts a layer from base's HD version
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    for arg in sys.argv[2:]:
        n, w = arg.split(":")
        if w.isdigit(): hd(n, int(w), outdir)
        else: cutout(n, w, outdir)
