"""Collider sheets: each arena's painting with the sim's colliders drawn over it, for checking the two agree.

    python tools/colliders/render.py <tag> [arena id ...]      (tag: before / after / anything)

Writes shots/colliders/<id>-<tag>.png (full size) and shots/colliders/sheet-<tag>.jpg (all ten). Red hatched = blocks
walking and shots (#), orange outline = blocks walking only (low obstacle), magenta = breakable prop (the props.json
frame outline too), blue = deep water, violet = pit, green dot = tall grass. If shots/colliders/audit.json exists
(tools/colliders/audit.ts), its findings are marked: cyan X = open tile no walker reaches, yellow box = a tile
that stopped test shots although it is not a wall or prop (should be none). Needs Pillow (the pokeshell .venv) and the arena art (bg.png, gitignored).
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]
PUBLIC = REPO / "public" / "arenas"
OUT = REPO / "shots" / "colliders"
T, COLS, ROWS = 40, 48, 27
FILL = {"#": (255, 40, 40, 110), "~": (40, 120, 255, 90), "_": (140, 60, 255, 110), "o": (255, 0, 220, 110),
        "=": (255, 150, 0, 70), "^": (255, 150, 0, 40)}


def render(aid, tag, audit):
    a = json.loads((PUBLIC / aid / "arena.json").read_text(encoding="utf-8-sig"))
    bgp = PUBLIC / aid / "bg.png"
    im = Image.open(bgp).convert("RGBA") if bgp.exists() else Image.new("RGBA", (1920, 1080), (30, 30, 30, 255))
    pj = PUBLIC / aid / "props.json"
    frames = json.loads(pj.read_text())["frames"] if pj.exists() else []
    if frames and (PUBLIC / aid / "props.png").exists():
        atlas = Image.open(PUBLIC / aid / "props.png").convert("RGBA")
        for fr in frames:
            im.alpha_composite(atlas.crop((fr["x"], fr["y"], fr["x"] + fr["w"], fr["y"] + fr["h"])), (fr["at"]["x"], fr["at"]["y"]))
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for y, row in enumerate(a["grid"]):
        for x, ch in enumerate(row):
            box = (x * T, y * T, x * T + T - 1, y * T + T - 1)
            if ch in FILL:
                d.rectangle(box, fill=FILL[ch])
            if ch == "#":
                d.line((x * T, y * T + T - 1, x * T + T - 1, y * T), fill=(255, 255, 255, 120), width=1)
            if ch == "=":
                d.rectangle(box, outline=(255, 150, 0, 230), width=2)
            if ch == '"':
                d.ellipse((x * T + 17, y * T + 17, x * T + 23, y * T + 23), fill=(60, 220, 60, 200))
    for fr in frames:
        d.rectangle((fr["at"]["x"], fr["at"]["y"], fr["at"]["x"] + fr["w"], fr["at"]["y"] + fr["h"]), outline=(255, 0, 220, 255), width=2)
    for i in range(COLS + 1):
        d.line((i * T, 0, i * T, 1080), fill=(255, 255, 255, 35))
    for j in range(ROWS + 1):
        d.line((0, j * T, 1920, j * T), fill=(255, 255, 255, 35))
    for i in range(0, COLS, 2):
        d.text((i * T + 3, 2), str(i), fill=(255, 255, 255, 230))
    for j in range(1, ROWS):
        d.text((3, j * T + 3), str(j), fill=(255, 255, 255, 230))
    for sp in a["spawns"]:
        c = (80, 160, 255, 255) if sp["team"] == 0 else (255, 90, 90, 255)
        d.ellipse((sp["x"] - 12, sp["y"] - 12, sp["x"] + 12, sp["y"] + 12), outline=c, width=4)
    f = (audit or {}).get(aid, {})
    for tx, ty in f.get("unreachable", []):
        d.line((tx * T + 6, ty * T + 6, tx * T + 34, ty * T + 34), fill=(0, 255, 255, 255), width=4)
        d.line((tx * T + 34, ty * T + 6, tx * T + 6, ty * T + 34), fill=(0, 255, 255, 255), width=4)
    for tx, ty in f.get("oddStops", []):
        d.rectangle((tx * T + 3, ty * T + 3, tx * T + 36, ty * T + 36), outline=(255, 255, 0, 255), width=3)
    im.alpha_composite(ov)
    OUT.mkdir(parents=True, exist_ok=True)
    out = im.convert("RGB")
    out.save(OUT / f"{aid}-{tag}.png")
    return out


def main():
    tag = sys.argv[1] if len(sys.argv) > 1 else "before"
    ids = sys.argv[2:] or json.loads((PUBLIC / "index.json").read_text())["arenas"]
    aj = OUT / f"audit-{tag}.json"
    audit = json.loads(aj.read_text()) if aj.exists() else None
    tiles = [render(i, tag, audit) for i in ids]
    w, h = 960, 540
    sheet = Image.new("RGB", (w * 2, h * ((len(tiles) + 1) // 2)), (0, 0, 0))
    for k, t in enumerate(tiles):
        sheet.paste(t.resize((w, h), Image.LANCZOS), ((k % 2) * w, (k // 2) * h))
        ImageDraw.Draw(sheet).text(((k % 2) * w + 30, (k // 2) * h + 16), ids[k], fill=(255, 255, 0))
    sheet.save(OUT / f"sheet-{tag}.jpg", quality=88)
    print(f"wrote {len(tiles)} images + sheet-{tag}.jpg to {OUT}")


if __name__ == "__main__":
    main()
