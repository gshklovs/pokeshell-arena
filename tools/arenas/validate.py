"""Validate every public/arenas/<id>/arena.json: format, reachability and fairness.

    python tools/arenas/validate.py [arena id ...]        exit code 1 if any arena fails

Checks
  format     27 rows x 48 chars of . # ~ " ^ o _ = (_ = pit / void: fliers only, like ~; = low obstacle: the
             same for walking, shots fly over it); size 1920x1080, tile 40; id / name / sourceCard; ambient
  border     the outer ring is impassable to ground fighters (# ~ _ =), so nothing walks off the field
  spawns     >= 3 per team, each on a '.' tile with no wall in its 3x3, both teams >= 20 tiles apart
  reach      one flood fill (4-neighbour, over . " ^ o) from team 0 reaches every spawn of both teams and every
             walkable tile: no sealed pockets
  corridors  the reach check again for the largest fighter body (BODY_R, the sim's rules.BODY_MAX_PX): a flood fill
             of body positions on a 4 px lattice (a body is a circle of radius BODY_R that may not overlap # ~ _ =, the
             sim's exact circle-vs-tile test) must put a body in every walkable tile the tile fill reached, so no
             corridor the grid calls walkable is too narrow to walk. Props 'o' count as open, as in reach
  symmetry   share of tiles equal to their left-right mirror (>= 0.9; '=' and '~' count as equal), and walkable tiles left vs right (>= 0.95)
  balance    each team's mean path length to the centre line, ratio >= 0.9
  floor      walkable share of the field >= 0.25 (water arenas are meant to be tight)
  art        bg.png is 1920x1080 (a warning only: bg.png is gitignored and may not be there); props.json frames
             sit on 'o' tiles
It does not need Python packages beyond the standard library (Pillow only for the optional art check).
"""
import json
import sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "public" / "arenas"
ROWS, COLS, TILE = 27, 48, 40
CHARS = set(".#~\"^o_=")
WALK = set(".\"^o")
# the largest fighter collision body, px: src/sim/rules.ts BODY_MAX_PX (movement.test.ts checks they agree)
BODY_R = 16
LATTICE = 4
PARTICLES = {"leaves", "snow", "embers", "bubbles", "none"}


def bfs(grid, starts):
    dist = {}
    q = deque()
    for s in starts:
        dist[s] = 0
        q.append(s)
    while q:
        r, c = q.popleft()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            rr, cc = r + dr, c + dc
            if 0 <= rr < ROWS and 0 <= cc < COLS and (rr, cc) not in dist and grid[rr][cc] in WALK:
                dist[(rr, cc)] = dist[(r, c)] + 1
                q.append((rr, cc))
    return dist


def body_reach(grid, start_px):
    """tiles a body of radius BODY_R can get its center into, walking from start_px (x, y). The body may not overlap
    a '#' or '~' tile (off the grid counts as wall); the test is the sim's: distance from the center to the nearest
    point of the tile < BODY_R"""
    blocking = lambda r, c: not (0 <= r < ROWS and 0 <= c < COLS) or grid[r][c] in "#~_="
    nx, ny = COLS * TILE // LATTICE, ROWS * TILE // LATTICE
    r2 = BODY_R * BODY_R

    def free(i, j):
        x, y = i * LATTICE + LATTICE // 2, j * LATTICE + LATTICE // 2
        for r in range((y - BODY_R) // TILE, (y + BODY_R) // TILE + 1):
            for c in range((x - BODY_R) // TILE, (x + BODY_R) // TILE + 1):
                if blocking(r, c):
                    px = min(max(x, c * TILE), c * TILE + TILE - 1)
                    py = min(max(y, r * TILE), r * TILE + TILE - 1)
                    if (x - px) ** 2 + (y - py) ** 2 < r2:
                        return False
        return True

    s = (start_px[0] // LATTICE, start_px[1] // LATTICE)
    if not free(*s):
        return set()
    seen = {s}
    q = deque([s])
    tiles = set()
    while q:
        i, j = q.popleft()
        tiles.add(((j * LATTICE) // TILE, (i * LATTICE) // TILE))
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (i + di, j + dj)
            if 0 <= n[0] < nx and 0 <= n[1] < ny and n not in seen and free(*n):
                seen.add(n)
                q.append(n)
    return tiles


def check(path):
    a = json.loads(path.read_text(encoding="utf-8-sig"))
    errs, warns, info = [], [], {}
    for k in ("id", "name", "sourceCard", "size", "tile", "grid", "spawns", "ambient"):
        if k not in a:
            errs.append(f"missing {k}")
    if errs:
        return errs, warns, info
    if a["id"] != path.parent.name:
        errs.append("id != folder name")
    if a["size"] != {"w": 1920, "h": 1080} or a["tile"] != TILE:
        errs.append("size / tile")
    g = a["grid"]
    if len(g) != ROWS or any(len(row) != COLS for row in g):
        errs.append(f"grid is not {ROWS} x {COLS}")
        return errs, warns, info
    bad = {ch for row in g for ch in row} - CHARS
    if bad:
        errs.append(f"unknown chars {bad}")
    amb = a["ambient"]
    if not str(amb.get("tint", "")).startswith("#") or len(amb.get("tint", "")) != 7:
        errs.append("ambient.tint")
    if amb.get("particles") not in PARTICLES:
        errs.append("ambient.particles")
    ring = [g[0][c] for c in range(COLS)] + [g[-1][c] for c in range(COLS)] + \
           [g[r][0] for r in range(ROWS)] + [g[r][-1] for r in range(ROWS)]
    if any(ch in WALK for ch in ring):
        errs.append("border ring has walkable tiles")
    # spawns
    teams = {0: [], 1: []}
    for s in a["spawns"]:
        r, c = s["y"] // TILE, s["x"] // TILE
        if not (0 <= r < ROWS and 0 <= c < COLS):
            errs.append(f"spawn off grid {s}")
            continue
        if g[r][c] != ".":
            errs.append(f"spawn on '{g[r][c]}' at {c},{r}")
        if any(g[rr][cc] == "#" for rr in range(r - 1, r + 2) for cc in range(c - 1, c + 2)):
            warns.append(f"spawn {c},{r} touches a wall")
        teams.setdefault(s["team"], []).append((r, c))
    if len(teams[0]) < 3 or len(teams[1]) < 3:
        errs.append("fewer than 3 spawns per team")
    gap = min(abs(r0 - r1) + abs(c0 - c1) for r0, c0 in teams[0] for r1, c1 in teams[1])
    info["team gap"] = gap
    if gap < 20:
        errs.append(f"teams only {gap} tiles apart")
    # reachability
    walk = {(r, c) for r in range(ROWS) for c in range(COLS) if g[r][c] in WALK}
    dist = bfs(g, teams[0][:1])
    unreached = [s for s in teams[0] + teams[1] if s not in dist]
    if unreached:
        errs.append(f"spawns not reachable: {unreached}")
    pockets = len(walk) - len(dist)
    # corridors: every tile the tile fill reached must take the largest body too
    s0 = next(s for s in a["spawns"] if s["team"] == 0)
    body = body_reach(g, (s0["x"], s0["y"]))
    narrow = sorted((c, r) for r, c in dist if (r, c) not in body)
    info["body reach"] = f"{len(dist) - len(narrow)}/{len(dist)}"
    if narrow:
        errs.append(f"{len(narrow)} walkable tiles too narrow for a {2 * BODY_R} px body: {narrow[:12]}")
    info["walkable"] = len(walk)
    info["sealed"] = pockets
    if pockets:
        errs.append(f"{pockets} walkable tiles sealed off from the spawns")
    # symmetry
    # a low rock '=' in the sea mirrored by deep water '~' is the same for play (no walking, shots fly over)
    kind = lambda ch: "~" if ch == "=" else ch
    same = sum(kind(g[r][c]) == kind(g[r][COLS - 1 - c]) for r in range(ROWS) for c in range(COLS)) / (ROWS * COLS)
    left = sum(1 for r, c in walk if c < COLS // 2)
    right = len(walk) - left
    lr = min(left, right) / max(1, max(left, right))
    info["mirror"] = round(same, 3)
    info["L/R walk"] = round(lr, 3)
    if same < 0.9:
        errs.append(f"mirror symmetry {same:.2f} < 0.9")
    if lr < 0.95:
        errs.append(f"walkable left/right {lr:.2f} < 0.95")
    # balance: mean path length from each team's spawns to the centre columns
    centre = [(r, c) for r in range(ROWS) for c in (COLS // 2 - 1, COLS // 2) if g[r][c] in WALK]
    if centre:
        dc = bfs(g, centre)
        m = [sum(dc.get(s, 999) for s in teams[t]) / len(teams[t]) for t in (0, 1)]
        bal = min(m) / max(1e-9, max(m))
        info["centre path"] = [round(x, 1) for x in m]
        if bal < 0.9:
            errs.append(f"centre path balance {bal:.2f}")
    else:
        warns.append("no walkable tile on the centre line")
    fl = len(walk) / (ROWS * COLS)
    info["walk share"] = round(fl, 2)
    if fl < 0.25:
        errs.append(f"walkable share {fl:.2f} < 0.25")
    # art
    bg = path.parent / "bg.png"
    if bg.exists():
        try:
            from PIL import Image
            if Image.open(bg).size != (1920, 1080):
                errs.append("bg.png is not 1920x1080")
        except ImportError:
            pass
    else:
        warns.append("bg.png missing (gitignored: fetch the art release or run the tools)")
    pj = path.parent / "props.json"
    if pj.exists():
        props = json.loads(pj.read_text(encoding="utf-8-sig"))
        for f in props["frames"]:
            if any(g[r][c] != "o" for c, r in f["tiles"]):
                errs.append(f"prop {f['name']} not on 'o' tiles")
        info["props"] = len(props["frames"])
    info["o tiles"] = sum(row.count("o") for row in g)
    return errs, warns, info


def main(ids):
    paths = [ROOT / i / "arena.json" for i in ids] if ids else sorted(ROOT.glob("*/arena.json"))
    fails = 0
    for p in paths:
        errs, warns, info = check(p)
        status = "FAIL" if errs else "ok"
        fails += bool(errs)
        print(f"{status:4} {p.parent.name:24} " + "  ".join(f"{k}={v}" for k, v in info.items()))
        for e in errs:
            print(f"     error: {e}")
        for w in warns:
            print(f"     warn:  {w}")
    print(f"{len(paths) - fails}/{len(paths)} arenas pass")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
