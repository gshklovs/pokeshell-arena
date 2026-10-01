"""Step 6: lookbook sheets. Per arena: the real card | its painted-out scene | the arena with its grid overlaid
(semi-transparent; spawns marked), and one contact sheet of all ten. JPEG, 1400 px wide, in
style-lab/arenas/sheets/. Also writes style-lab/arenas/<id>/overlay.jpg (full size) for grid review.

    python tools/arenas/sheets.py [arena id ...]
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont

from common import COLS, PUBLIC, ROWS, TILE, WORK, arenas, work

COL = {"#": (230, 40, 40), "~": (40, 120, 255), "^": (255, 150, 0), "o": (255, 0, 220), "\"": (60, 220, 60), "=": (255, 170, 0)}
SHEETS = WORK / "sheets"


def font(n):
    try:
        return ImageFont.truetype("arial.ttf", n)
    except OSError:
        return ImageFont.load_default()


def arena_img(aid):
    """the arena as the game draws it: bg + intact props"""
    d = work(aid)
    im = Image.open(d / "bg.png").convert("RGBA")
    pj = PUBLIC / aid / "props.json"
    if pj.exists():
        props = json.loads(pj.read_text(encoding="utf-8-sig"))
        atlas = Image.open(PUBLIC / aid / props["image"]).convert("RGBA")
        for f in props["frames"]:
            spr = atlas.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
            im.alpha_composite(spr, (f["at"]["x"], f["at"]["y"]))
    return im


def overlay(aid):
    a = json.loads((PUBLIC / aid / "arena.json").read_text(encoding="utf-8-sig"))
    base = arena_img(aid)
    lay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    dr = ImageDraw.Draw(lay)
    for r, row in enumerate(a["grid"]):
        for c, ch in enumerate(row):
            if ch in COL:
                dr.rectangle((c * TILE, r * TILE, (c + 1) * TILE - 1, (r + 1) * TILE - 1), fill=COL[ch] + (95,))
    for c in range(COLS + 1):
        dr.line([(c * TILE, 0), (c * TILE, ROWS * TILE)], fill=(255, 255, 255, 40))
    for r in range(ROWS + 1):
        dr.line([(0, r * TILE), (COLS * TILE, r * TILE)], fill=(255, 255, 255, 40))
    for s in a["spawns"]:
        col = (255, 255, 255, 255) if s["team"] == 0 else (20, 20, 20, 255)
        dr.ellipse((s["x"] - 16, s["y"] - 16, s["x"] + 16, s["y"] + 16), fill=col, outline=(255, 220, 0, 255), width=4)
    out = Image.alpha_composite(base, lay).convert("RGB")
    out.save(work(aid) / "overlay.jpg", quality=85)
    return out


def sheet(aid, a):
    d = work(aid)
    h = 420
    card = Image.open(d / "card.png").convert("RGB")
    scene = Image.open(d / "scene.png").convert("RGB")
    ov = overlay(aid)
    parts = [card.resize((round(card.width * h / card.height), h), Image.LANCZOS),
             scene.resize((round(scene.width * h / scene.height), h), Image.LANCZOS),
             ov.resize((round(ov.width * h / ov.height), h), Image.LANCZOS)]
    gap = 12
    w = sum(p.width for p in parts) + gap * (len(parts) + 1)
    im = Image.new("RGB", (w, h + 60), (24, 24, 30))
    x = gap
    for p in parts:
        im.paste(p, (x, 48))
        x += p.width + gap
    ImageDraw.Draw(im).text((gap, 12), f"{a['name']}  ({aid})  from {a['card']}   card | painted-out scene | arena + grid",
                            fill=(240, 240, 240), font=font(22))
    if im.width > 1400:
        im = im.resize((1400, round(im.height * 1400 / im.width)), Image.LANCZOS)
    SHEETS.mkdir(parents=True, exist_ok=True)
    im.save(SHEETS / f"{aid}.jpg", quality=86)
    return im


def contact(table):
    cw, cols = 460, 3
    tiles = []
    for aid, a in table.items():
        im = arena_img(aid).convert("RGB").resize((cw, round(cw * 1080 / 1920)), Image.LANCZOS)
        card = Image.open(work(aid) / "card.png").convert("RGB")
        card = card.resize((round(card.width * 110 / card.height), 110), Image.LANCZOS)
        im.paste(card, (cw - card.width - 6, im.height - card.height - 6))
        t = Image.new("RGB", (cw, im.height + 30), (24, 24, 30))
        t.paste(im, (0, 30))
        ImageDraw.Draw(t).text((4, 6), f"{a['name']} - {a['card']}", fill=(240, 240, 240), font=font(17))
        tiles.append(t)
    gap = 6
    th = tiles[0].height
    rows = (len(tiles) + cols - 1) // cols
    sh = Image.new("RGB", (cols * cw + (cols + 1) * gap, rows * th + (rows + 1) * gap), (12, 12, 16))
    for i, t in enumerate(tiles):
        sh.paste(t, (gap + (i % cols) * (cw + gap), gap + (i // cols) * (th + gap)))
    if sh.width > 1400:
        sh = sh.resize((1400, round(sh.height * 1400 / sh.width)), Image.LANCZOS)
    sh.save(SHEETS / "contact.jpg", quality=86)


def main(ids):
    table = arenas()
    for aid in ids or table:
        sheet(aid, table[aid])
        print("sheet", aid)
    if not ids:
        contact(table)
        print("contact sheet")


if __name__ == "__main__":
    main(sys.argv[1:])
