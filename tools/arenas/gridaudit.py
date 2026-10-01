"""Grid vs art audit: where the tile grid disagrees with the painting, and the playtest sheets in shots/grid/.

    python tools/arenas/gridaudit.py [--fix] [arena id ...]

The grid comes from a per-pixel classification of the art (grid.py, saved as style-lab/arenas/<id>/pixclass.npy),
then a left-right symmetric merge where the more blocking tile wins. Where the art itself is not symmetric that
merge puts walls on ground the painting shows as open. This tool finds, per arena:

  mirror walls   blocking tiles (# ~ o) whose own pixels are clearly open (blocking share < OPEN_T): walls that only
                 came from the mirror (or a pocket fill) and look walkable
  looks blocked  walkable tiles whose pixels are largely an obstacle (blocking share >= LOOKS_T): open ground the
                 art paints as an obstacle (reported only; the art wins over the grid by un-blocking, never the
                 other way)

--fix un-blocks the mirror walls that join the main walkable area (grid.unmirror, the same step grid.py runs), back
to the art's own class, as long as validate.py still passes (symmetry, left/right balance, path balance); it drops
the least clearly open ones first if a check fails. Spawns are left alone.

Output: shots/grid/<id>.png (full size: bg + props + grid; yellow X = mirror wall, cyan box = un-blocked by --fix,
magenta dots = looks blocked) and shots/grid/contact.jpg (all ten, with the top rows called out). Needs the pokeshell
.venv (numpy, Pillow) and the art (bg.png, gitignored) plus style-lab/arenas/<id>/pixclass.npy.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from common import COLS, PUBLIC, REPO, ROWS, TILE, WORK
import validate

S = 4                                  # pixclass.npy is at 1/4 scale: 10 x 10 cells per tile
BLOCK = "#~o_="
OPEN_T = 0.2                           # a blocking tile with less than this share of blocking pixels looks open
LOOKS_T = 0.4                          # a walkable tile with at least this share of blocking pixels looks blocked
OUT = REPO / "shots" / "grid"
# reviewed on the sheets: mirror walls that stay walls although their pixels classify as open (row, col)
KEEP = {}
COL = {"#": (230, 40, 40), "~": (40, 120, 255), "_": (140, 60, 255), "^": (255, 150, 0), "o": (255, 0, 220), "\"": (60, 220, 60), "=": (255, 170, 0)}


def shares(pix):
    """per tile: the share of its pixels in each class"""
    t = TILE // S
    out = {}
    for ch in ".#~^o\"":
        m = (pix == ch).astype(float)
        out[ch] = m.reshape(ROWS, t, COLS, t).mean(axis=(1, 3))
    return out


def art_class(sh, r, c):
    """the class the tile's own pixels vote for, blocking classes excluded (what an un-blocked tile becomes)"""
    best = max(".\"^", key=lambda ch: sh[ch][r, c])
    return best if sh[best][r, c] > 0 else "."


def audit(aid):
    a = json.loads((PUBLIC / aid / "arena.json").read_text(encoding="utf-8-sig"))
    g = np.array([list(row) for row in a["grid"]])
    sh = shares(np.load(WORK / aid / "pixclass.npy"))
    blk = sh["#"] + sh["~"] + sh["o"]
    # a props.json frame is drawn over its cells until it breaks: those stay props whatever their pixels say
    framed = set()
    pj = PUBLIC / aid / "props.json"
    if pj.exists():
        for f in json.loads(pj.read_text(encoding="utf-8-sig"))["frames"]:
            framed |= {(r, c) for c, r in f["tiles"]}
    mirror = [(r, c) for r in range(1, ROWS - 1) for c in range(1, COLS - 1)
              if g[r, c] in BLOCK and blk[r, c] < OPEN_T and (r, c) not in framed and (r, c) not in KEEP.get(aid, set())]
    looks = [(r, c) for r in range(1, ROWS - 1) for c in range(1, COLS - 1) if g[r, c] not in BLOCK and blk[r, c] >= LOOKS_T]
    return a, g, sh, blk, mirror, looks


def unmirror(g, cands, sh, spawns):
    """un-block the candidate tiles that touch the main walkable area, repeatedly (so a run of them opens up from
    the edge in); the rest stay blocking (they would be sealed pockets)"""
    g = g.copy()
    s0 = (spawns[0]["y"] // TILE, spawns[0]["x"] // TILE)
    left = set(cands)
    opened = []
    while True:
        reach = validate.bfs(["".join(r) for r in g], [s0])
        grow = sorted(p for p in left if any((p[0] + dr, p[1] + dc) in reach for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1))))
        if not grow:
            return g, opened
        for r, c in grow:
            g[r, c] = art_class(sh, r, c)
            opened.append((r, c))
            left.discard((r, c))


def check(a, g):
    """validate.py's checks on a grid (errors only)"""
    tmp = dict(a, grid=["".join(r) for r in g])
    p = OUT / "_tmp" / a["id"] / "arena.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(tmp), encoding="utf-8")
    errs, _, info = validate.check(p)
    return [e for e in errs if "bg.png" not in e], info


def fix(aid):
    a, g, sh, blk, mirror, looks = audit(aid)
    # most clearly open first; drop from the end until the validator is happy
    cands = sorted(mirror, key=lambda p: (blk[p], p))
    while cands:
        g2, opened = unmirror(g, cands, sh, a["spawns"])
        errs, info = check(a, g2)
        if not errs:
            break
        cands = cands[:-1]
    else:
        return a, g, [], []
    a["grid"] = ["".join(r) for r in g2]
    (PUBLIC / aid / "arena.json").write_text(json.dumps(a, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return a, g2, opened, errs


def font(n):
    try:
        return ImageFont.truetype("arial.ttf", n)
    except OSError:
        return ImageFont.load_default()


def arena_img(aid):
    im = Image.open(PUBLIC / aid / "bg.png").convert("RGBA")
    pj = PUBLIC / aid / "props.json"
    if pj.exists() and (PUBLIC / aid / "props.png").exists():
        props = json.loads(pj.read_text(encoding="utf-8-sig"))
        atlas = Image.open(PUBLIC / aid / props["image"]).convert("RGBA")
        for f in props["frames"]:
            spr = atlas.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
            im.alpha_composite(spr, (f["at"]["x"], f["at"]["y"]))
    return im


def draw(aid, g, mirror, looks, opened, title):
    base = arena_img(aid)
    lay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    dr = ImageDraw.Draw(lay)
    for r in range(ROWS):
        for c in range(COLS):
            ch = g[r][c]
            if ch in COL:
                dr.rectangle((c * TILE, r * TILE, (c + 1) * TILE - 1, (r + 1) * TILE - 1), fill=COL[ch] + (80,))
    for i in range(COLS + 1):
        dr.line([(i * TILE, 0), (i * TILE, ROWS * TILE)], fill=(255, 255, 255, 45))
    for i in range(ROWS + 1):
        dr.line([(0, i * TILE), (COLS * TILE, i * TILE)], fill=(255, 255, 255, 45))
    for r, c in mirror:
        if (r, c) in opened:
            continue
        x, y = c * TILE, r * TILE
        dr.line([(x + 6, y + 6), (x + 33, y + 33)], fill=(255, 235, 0, 255), width=4)
        dr.line([(x + 33, y + 6), (x + 6, y + 33)], fill=(255, 235, 0, 255), width=4)
    for r, c in opened:
        dr.rectangle((c * TILE + 2, r * TILE + 2, (c + 1) * TILE - 3, (r + 1) * TILE - 3), outline=(0, 255, 255, 255), width=4)
    for r, c in looks:
        for k in range(3):
            x, y = c * TILE + 10 + k * 10, r * TILE + 20
            dr.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(255, 0, 255, 255))
    for i in range(ROWS):
        dr.text((3, i * TILE + 12), str(i), fill=(255, 255, 255, 220), font=font(14))
    for i in range(0, COLS, 2):
        dr.text((i * TILE + 12, 3), str(i), fill=(255, 255, 255, 220), font=font(14))
    out = Image.alpha_composite(base, lay).convert("RGB")
    d = ImageDraw.Draw(out)
    d.rectangle((0, ROWS * TILE - 34, 1920, ROWS * TILE), fill=(0, 0, 0))
    d.text((10, ROWS * TILE - 30), title, fill=(255, 255, 255), font=font(24))
    return out


def main(argv):
    do_fix = "--fix" in argv
    ids = [x for x in argv if not x.startswith("--")] or sorted(p.parent.name for p in PUBLIC.glob("*/arena.json"))
    OUT.mkdir(parents=True, exist_ok=True)
    thumbs = []
    report = {}
    for aid in ids:
        a, g0, sh, blk, mirror, looks = audit(aid)
        opened = []
        if do_fix:
            a, g, opened, _ = fix(aid)
            _, _, _, _, _, looks = audit(aid)
        else:
            g = g0
        opened = [tuple(p) for p in opened]
        title = f"{aid}: {len(mirror)} mirror walls (yellow X), {len(opened)} un-blocked (cyan), {len(looks)} look blocked (magenta)"
        im = draw(aid, g, mirror, looks, opened, title)
        im.save(OUT / f"{aid}.png")
        thumbs.append(im.resize((960, 540), Image.LANCZOS))
        report[aid] = {"mirror": [[int(c), int(r)] for r, c in mirror], "opened": [[int(c), int(r)] for r, c in opened],
                       "looksBlocked": [[int(c), int(r)] for r, c in looks]}
        print(f"{aid:24} mirror walls {len(mirror):3}  un-blocked {len(opened):3}  looks blocked {len(looks):3}")
    cols = 2
    sheet = Image.new("RGB", (960 * cols, 540 * ((len(thumbs) + cols - 1) // cols)), (0, 0, 0))
    for i, t in enumerate(thumbs):
        sheet.paste(t, ((i % cols) * 960, (i // cols) * 540))
    sheet.save(OUT / "contact.jpg", quality=85)
    (OUT / ("fix.json" if do_fix else "audit.json")).write_text(json.dumps(report, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
