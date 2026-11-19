# Draws the sun's light for the sky (src/32_scenery.js puts them together):
#   sun_glow.webp  the bloom around the disc: a tight hot core glow, a soft halo and a wide faint haze (warm white)
#   sun_rays.webp  the glare: thin soft rays of random length and strength, plus a few long spikes
# The white disc itself is a CSS gradient (crisp on every screen). Both pictures are white-to-warm light with
# alpha, dithered so the soft falloff shows no banding.
# usage: python tools/make_sun.py OUT_DIR, then WebP with lossy alpha, at full size (the dither makes lossless alpha
# 3× bigger): cwebp -m 6 -q 82 -alpha_q 70 sun_rays.png  (sun_glow keeps -alpha_q 100: its smooth falloff would band)
import sys, numpy as np
from PIL import Image
OUT = sys.argv[1]
rng = np.random.default_rng(7)

def save(rgb, a, name):
    a = np.clip(a + rng.uniform(-0.5, 0.5, a.shape) / 255, 0, 1)
    im = np.dstack([np.clip(rgb, 0, 255), a * 255]).round().astype(np.uint8)
    Image.fromarray(im, 'RGBA').save(f'{OUT}/{name}.png')

# ---------- glow: 640 px (shown 760 bg units across) ----------
N = 640; c = (N - 1) / 2
y, x = np.mgrid[0:N, 0:N]
r = np.hypot(x - c, y - c)
a = 1.0 * np.exp(-r / 24) + 0.62 * np.exp(-r / 58) + 0.32 * np.exp(-r / 125) + 0.14 * np.exp(-r / 240)
a *= np.clip((318 - r) / 60, 0, 1) ** 2  # reaches 0 before the picture's edge
a = np.clip(a, 0, 1)
warm = np.clip((r - 40) / 260, 0, 1)[..., None]  # blown-out white at the core, warmer outward
rgb = np.array([255, 255, 252]) * (1 - warm) + np.array([255, 236, 196]) * warm
save(rgb, a, 'sun_glow')

# ---------- rays: 1000 px = 1000 bg units across ----------
N = 1000; c = (N - 1) / 2
y, x = np.mgrid[0:N, 0:N]
r = np.hypot(x - c, y - c); th = np.arctan2(y - c, x - c)
acc = np.zeros((N, N))
def ray(angle, width_deg, length, strength):
    d = np.angle(np.exp(1j * (th - angle)))  # angular distance, wrapped
    w = np.radians(width_deg) * (1 + r / 260)  # a ray widens a little with distance
    prof = np.exp(-(d / w) ** 2)
    rad = np.exp(-r / length) * np.clip((r - 14) / 30, 0, 1)
    return strength * prof * rad
for _ in range(72):  # the glare: many thin rays
    acc += ray(rng.uniform(-np.pi, np.pi), rng.uniform(0.25, 0.9), rng.uniform(50, 170), rng.uniform(0.10, 0.34))
for _ in range(220):  # hairline streaks, very faint
    acc += ray(rng.uniform(-np.pi, np.pi), rng.uniform(0.08, 0.2), rng.uniform(60, 220), rng.uniform(0.03, 0.09))
for k in range(6):  # a few long spikes, spread round the circle
    acc += ray(k * np.pi / 3 + rng.uniform(-0.25, 0.25), rng.uniform(0.35, 0.6), rng.uniform(190, 260), rng.uniform(0.28, 0.4))
a = 1 - np.exp(-acc * 1.25)  # soft-saturating, so overlapping rays never clip hard
a *= np.clip((498 - r) / 120, 0, 1) ** 2
warm = np.clip(r / 420, 0, 1)[..., None]
rgb = np.array([255, 255, 250]) * (1 - warm) + np.array([255, 240, 205]) * warm
save(rgb, a, 'sun_rays')
print('ok')
