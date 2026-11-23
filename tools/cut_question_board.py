# Cuts the caption board from the user's question template (art/ui/question_template.png: an orange wooden frame,
# a dark-brown outline and a cream panel) into assets/img/question_board.webp, which Caption.paint (src/20_audio.js)
# paints as a 9-slice into the canvas #cap .bg, in whole device pixels: the corners stay as drawn, the frame and the
# cream stretch to the words.
#   - crop to the board (alpha > 8), then scale to K (0.5: the game draws it at 0.25 art px per template px, so it
#     stays sharp on a 2x screen)
#   - the slice lines are where the template's rounded corners end (the outer frame's and the cream panel's), so a
#     stretched edge is always a straight run of frame. They are printed in WebP px (BOARD.SLICE in src/20_audio.js)
#     and in art px at 0.25 (BOARD.EDGE); the cream panel's inset (for #cap's padding, src/00_head.html) too.
# usage: python tools/cut_question_board.py   (from the project root; needs Pillow + numpy; Pillow writes the WebP)
import numpy as np
from PIL import Image

SRC, OUT, K, DRAW = 'art/ui/question_template.png', 'assets/img/question_board.webp', 0.5, 0.25
# in template px (measured on the art): the corners' curves end at these lines
CUT_TOP, CUT_BOTTOM, CUT_LEFT, CUT_RIGHT = 340, 530, 215, 1955
# the cream panel (inside its bevel), template px
CREAM_TOP, CREAM_BOTTOM, CREAM_LEFT, CREAM_RIGHT = 244, 614, 89, 2077

im = Image.open(SRC).convert('RGBA')
a = np.array(im)[:, :, 3]
ys, xs = np.where(a > 8)
x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
board = im.crop((x0, y0, x1, y1))
w, h = round(board.width * K), round(board.height * K)
# resize with premultiplied alpha, so the transparent edge gets no dark fringe
board = board.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')
board.save(OUT, 'WEBP', quality=90, method=6, alpha_quality=100)

sl = [CUT_TOP - y0, x1 - CUT_RIGHT, y1 - CUT_BOTTOM, CUT_LEFT - x0]
cream = [CREAM_TOP - y0, x1 - CREAM_RIGHT, y1 - CREAM_BOTTOM, CREAM_LEFT - x0]
print(f'{OUT}: {w}x{h} (template crop {x0},{y0} {x1 - x0}x{y1 - y0})')
print("BOARD.SLICE (WebP px, top right bottom left):", ' '.join(str(round(v * K)) for v in sl))
print(f"BOARD.EDGE (art px at {DRAW}):", ' '.join(f'{v * DRAW:.1f}' for v in sl))
print(f'cream panel inset (art px at {DRAW}):', ' '.join(f'{v * DRAW:.1f}' for v in cream))
