"""Split the grid's '#' into what the art paints there: solid walls stay '#', open sea becomes deep water '~' and
the void / a drop becomes a pit '_' (fliers cross both, ground fighters cross neither; shots fly over both).

    python tools/arenas/split.py [arena id ...]

grid.py's classes are . # ~ ^ o " and its symmetric merge and pocket fill turned stretches of sea and sky into '#'.
Per interior '#' tile (the outer ring stays '#'):
  sea   at least SEA_T of its pixels classify as water in pixclass.npy (the art's own segmentation)   -> '~'
  void  arenas in VOID only (the starry void around Crescent Isle): the tile's mean colour is dark
        (Lab L < VOID_L) and violet (a > VOID_A), unlike the island's rock rim                      -> '_'
  rim   then, in VOID arenas, the '#' band grown RIM tiles in from the void: the island's cliff edge, a drop
        (fliers leave the island over it; rock outcrops further in stay walls)                      -> '_'
Ground reachability, spawns and balance do not change ('~' and '_' are no more walkable than '#'); validate.py is
run on the result. Needs the pokeshell .venv (numpy, Pillow), bg.png and style-lab/arenas/<id>/pixclass.npy.
"""
import json
import sys

import numpy as np
from PIL import Image

from common import COLS, PUBLIC, ROWS, WORK
from grid import lab
import validate

SEA_T = 0.5
VOID = {"cresselia-moonlit-sky"}
VOID_L, VOID_A = 30, 5
RIM = 3


def split(aid):
    p = PUBLIC / aid / "arena.json"
    a = json.loads(p.read_text(encoding="utf-8-sig"))
    g = [list(r) for r in a["grid"]]
    pix = np.load(WORK / aid / "pixclass.npy")
    t = pix.shape[0] // ROWS
    sea = (pix == "~").reshape(ROWS, t, COLS, t).mean(axis=(1, 3))
    im = np.asarray(Image.open(PUBLIC / aid / "bg.png").convert("RGB").resize((COLS * 4, ROWS * 4), Image.BOX)).astype(float)
    L = lab(im).reshape(ROWS, 4, COLS, 4, 3).mean(axis=(1, 3))
    n = {"~": 0, "_": 0}
    for r in range(1, ROWS - 1):
        for c in range(1, COLS - 1):
            if g[r][c] != "#":
                continue
            if sea[r, c] >= SEA_T:
                g[r][c] = "~"
            elif aid in VOID and L[r, c, 0] < VOID_L and L[r, c, 1] > VOID_A:
                g[r][c] = "_"
            else:
                continue
            n[g[r][c]] += 1
    if aid in VOID:
        # the island's rim is its cliff edge, a drop into the void: the '#' band between the floor and the void
        # (up to RIM tiles deep, grown from the void) becomes pit too, so fliers can leave the island
        for _ in range(RIM):
            grow = [(r, c) for r in range(1, ROWS - 1) for c in range(1, COLS - 1) if g[r][c] == "#"
                    and any(g[r + dr][c + dc] == "_" for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
            for r, c in grow:
                g[r][c] = "_"
                n["_"] += 1
    a["grid"] = ["".join(r) for r in g]
    p.write_text(json.dumps(a, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    errs, _, _ = validate.check(p)
    print(f"{aid:24} sea {n['~']:3}  void {n['_']:3}  {'ok' if not errs else errs}")
    return not errs


def main(ids):
    ids = ids or sorted(q.parent.name for q in PUBLIC.glob("*/arena.json"))
    return 0 if all([split(i) for i in ids]) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
