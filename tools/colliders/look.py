"""Work view for re-authoring a grid: bg + props, every blocking tile as a thin coloured outline (no fill, so the art
shows through), tile numbers on all four edges. Writes the top and bottom halves (rows 0-14, 12-26) at full scale.

    python tools/colliders/look.py <id> [grid.txt]      (grid.txt: 27 lines, else the arena.json grid)
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]
PUBLIC = REPO / "public" / "arenas"
OUT = REPO / "shots" / "colliders" / "look"
T = 40
COL = {"#": (255, 40, 40), "~": (60, 140, 255), "_": (190, 90, 255), "o": (255, 0, 220), "=": (255, 170, 0), "^": (255, 230, 0), '"': (40, 255, 120)}

aid = sys.argv[1]
a = json.loads((PUBLIC / aid / "arena.json").read_text(encoding="utf-8-sig"))
grid = Path(sys.argv[2]).read_text().splitlines() if len(sys.argv) > 2 else a["grid"]
im = Image.open(PUBLIC / aid / "bg.png").convert("RGBA")
pj = PUBLIC / aid / "props.json"
if pj.exists() and (PUBLIC / aid / "props.png").exists():
    atlas = Image.open(PUBLIC / aid / "props.png").convert("RGBA")
    for fr in json.loads(pj.read_text())["frames"]:
        im.alpha_composite(atlas.crop((fr["x"], fr["y"], fr["x"] + fr["w"], fr["y"] + fr["h"])), (fr["at"]["x"], fr["at"]["y"]))
d = ImageDraw.Draw(im)
for i in range(49):
    d.line((i * T, 0, i * T, 1080), fill=(255, 255, 255, 60))
for j in range(28):
    d.line((0, j * T, 1920, j * T), fill=(255, 255, 255, 60))
for y, row in enumerate(grid):
    for x, ch in enumerate(row):
        if ch in COL:
            w = 1 if ch in '"^' else 3
            d.rectangle((x * T + 2, y * T + 2, x * T + T - 3, y * T + T - 3), outline=COL[ch], width=w)
for y in range(27):
    d.text((3, y * T + 14), str(y), fill=(255, 255, 255))
    d.text((1900, y * T + 14), str(y), fill=(255, 255, 255))
for x in range(48):
    for yy in (2, 14 * T + 4, 26 * T + 26):
        d.text((x * T + 14, yy), str(x), fill=(255, 255, 0))
OUT.mkdir(parents=True, exist_ok=True)
im.crop((0, 0, 1920, 600)).convert("RGB").save(OUT / f"{aid}-top.png")
im.crop((0, 480, 1920, 1080)).convert("RGB").save(OUT / f"{aid}-bot.png")
print(OUT)
