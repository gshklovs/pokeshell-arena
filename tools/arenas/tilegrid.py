"""bg.png with the 40 px tile grid and column / row numbers, for picking prototype tiles and corrections:
tilegrid.py <arena id> [out.jpg]"""
import sys

from PIL import Image, ImageDraw

from common import COLS, ROWS, TILE, work

aid = sys.argv[1]
d = work(aid)
im = Image.open(d / "bg.png").convert("RGB")
dr = ImageDraw.Draw(im)
for c in range(COLS + 1):
    dr.line([(c * TILE, 0), (c * TILE, ROWS * TILE)], fill=(255, 255, 255) if c % 4 == 0 else (90, 90, 90), width=1)
for r in range(ROWS + 1):
    dr.line([(0, r * TILE), (COLS * TILE, r * TILE)], fill=(255, 255, 255) if r % 4 == 0 else (90, 90, 90), width=1)
for c in range(0, COLS, 2):
    for r in range(0, ROWS, 2):
        dr.text((c * TILE + 2, r * TILE + 1), f"{c},{r}", fill=(255, 255, 0))
im.save(sys.argv[2] if len(sys.argv) > 2 else d / "tiles.jpg", quality=80)
