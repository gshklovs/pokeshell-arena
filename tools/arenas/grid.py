"""Step 4: the tile grid of each arena, from a colour + texture segmentation of its bg.png, then hand fixes.

segs.json holds, per arena:
  protos  {char: [[col, row], ...]}  prototype tiles of each class, picked on tiles.jpg (tilegrid.py)
  thresh  {char: fraction}           a tile is that class when at least this share of its pixels is (checked
                                     in the order # ~ ^ o " ; the rest is floor '.')
  fix     [[char, c0, r0, c1, r1, from?], ...]   hand corrections, inclusive tile rects, mirrored left-right;
                                     with `from` only tiles of those chars are changed
  props   true: every 'o' component is cut out of the art into props.png / props.json and the floor painted
          back in under it (so a broken prop leaves floor behind)

Pipeline: pixels (at 1/4 scale) -> nearest prototype colour centre (Lab + local texture) -> per-tile shares ->
class -> hand fixes -> left-right symmetric (the more blocking tile wins) -> a solid border ring -> small sealed
pockets filled in -> 3 spawns per team (team 1 mirrors team 0) -> public/arenas/<id>/arena.json.

    python tools/arenas/grid.py [arena id ...]
"""
import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.cluster.vq import kmeans2

from common import COLS, H, HERE, PUBLIC, ROWS, TILE, W, arenas, work

ORDER = "#~^o\""                 # blocking first: the symmetric merge keeps the earlier one
PASS = set(".\"^o")              # walkable (a prop 'o' once broken, hazard '^' hurts)
DEFAULT_T = {"#": 0.45, "~": 0.5, "^": 0.4, "o": 0.4, "\"": 0.45}
S = 4                            # pixel classification at 1/4 scale: 10 x 10 px per tile


def lab(rgb):
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def features(img, tex=1.2):
    small = np.asarray(img.resize((W // S, H // S), Image.BOX)).astype(float)
    L = lab(small)
    # local texture: std of lightness in a 3x3 window of the small image (obstacles are busier than floor)
    m = ndimage.uniform_filter(L[..., 0], 3)
    sd = np.sqrt(np.maximum(ndimage.uniform_filter(L[..., 0] ** 2, 3) - m ** 2, 0))
    return np.concatenate([L, sd[..., None] * tex], -1)


def classify(feat, protos, seed=0):
    t = TILE // S
    centres, labels = [], []
    rng = np.random.default_rng(seed)
    for ch, tiles in protos.items():
        px = np.concatenate([feat[r * t:(r + 1) * t, c * t:(c + 1) * t].reshape(-1, feat.shape[-1]) for c, r in tiles])
        k = min(6, max(2, len(tiles)))
        cen, _ = kmeans2(px, k, minit="++", seed=rng)
        centres.append(cen)
        labels += [ch] * len(cen)
    centres = np.concatenate(centres)
    flat = feat.reshape(-1, feat.shape[-1])
    d = ((flat[:, None, :] - centres[None]) ** 2).sum(-1)
    idx = d.argmin(1)
    chars = np.array(labels)[idx].reshape(feat.shape[:2])
    return chars


def tiles_from(chars, thresh):
    t = TILE // S
    g = np.full((ROWS, COLS), ".", dtype="<U1")
    for r in range(ROWS):
        for c in range(COLS):
            blk = chars[r * t:(r + 1) * t, c * t:(c + 1) * t]
            for ch in ORDER:
                if (blk == ch).mean() >= thresh.get(ch, DEFAULT_T[ch]):
                    g[r, c] = ch
                    break
    return g


def apply_fix(g, fixes):
    for f in fixes:
        ch, c0, r0, c1, r1 = f[:5]
        only = f[5] if len(f) > 5 else None
        for cc0, cc1 in ((c0, c1), (COLS - 1 - c1, COLS - 1 - c0)):
            blk = g[r0:r1 + 1, cc0:cc1 + 1]
            if only is None:
                blk[...] = ch
            else:
                blk[np.isin(blk, list(only))] = ch
    return g


def symmetrize(g):
    m = g[:, ::-1]
    rank = {ch: i for i, ch in enumerate(ORDER + ".")}
    pick = np.vectorize(lambda a, b: a if rank[a] <= rank[b] else b)
    return pick(g, m)


def passable(g):
    return np.isin(g, list(PASS))


def seal_pockets(g, max_fill=10 ** 6):
    """walkable pockets cut off from the main area (bits of floor behind buildings, inside rock rings) become
    wall; the sizes filled are reported (and bigger than max_fill are left in, for validate.py to flag)"""
    lab_, n = ndimage.label(passable(g))
    if n <= 1:
        return g, []
    sizes = ndimage.sum(np.ones_like(lab_), lab_, range(1, n + 1))
    main = int(np.argmax(sizes)) + 1
    left = []
    for i, s in enumerate(sizes, 1):
        if i == main:
            continue
        if s <= max_fill:
            g[lab_ == i] = "#"
            left.append(int(s))
    return g, left


def spawns(g, sep=5):
    """3 per team: team 0 on the left at 1/4, 1/2, 3/4 height, team 1 its mirror; each on the floor tile
    nearest its target with a clear 3x3 around it and in the main walkable area"""
    ok = (g == ".")
    clear = ndimage.binary_erosion(ok, np.ones((3, 3)), border_value=0)
    lab_, n = ndimage.label(passable(g))
    sizes = ndimage.sum(np.ones_like(lab_), lab_, range(1, n + 1))
    main = lab_ == (int(np.argmax(sizes)) + 1)
    cand = np.argwhere(clear & main & clear[:, ::-1])
    cand = cand[cand[:, 1] < COLS // 2 - 3]             # team 0 keeps to its own (left) half
    out = []
    for ty in (ROWS * 0.28, ROWS * 0.72, ROWS * 0.5):
        tx = COLS * 0.14
        far = np.array([all((r - r0) ** 2 + (c - c0) ** 2 >= sep * sep for r0, c0 in out) for r, c in cand])
        pool = cand[far] if far.any() else cand
        r, c = pool[np.argmin((pool[:, 0] - ty) ** 2 + 1.6 * (pool[:, 1] - tx) ** 2)]
        out.append((int(r), int(c)))
    sp = []
    for team in (0, 1):
        for r, c in out:
            cc = c if team == 0 else COLS - 1 - c
            sp.append({"team": team, "x": cc * TILE + TILE // 2, "y": r * TILE + TILE // 2})
    return sp


def cut_props(aid, g, chars, d):
    """'o' components -> props.png atlas + props.json frames; the art under them painted back to floor"""
    from common import pokeshell_lib
    pokeshell_lib()
    import evlib
    img = Image.open(d / "bg-full.png").convert("RGB")
    rgb = np.asarray(img).astype(float) / 255
    lab_, n = ndimage.label(g == "o")
    if n == 0:
        return None
    boxes = []
    hole = np.zeros((H, W), bool)
    for i in range(1, n + 1):
        rr, cc = np.nonzero(lab_ == i)
        x0, y0 = int(max(0, cc.min() * TILE - 8)), int(max(0, rr.min() * TILE - 8))
        x1, y1 = int(min(W, (cc.max() + 1) * TILE + 8)), int(min(H, (rr.max() + 1) * TILE + 8))
        boxes.append((rr, cc, x0, y0, x1, y1))
        hole[y0:y1, x0:x1] = True
    # the floor as it would be without the props: the art's own texture carried in from around each box
    floor = evlib.tex_fill(rgb, ~hole, 10, None, 1.0)
    # the prop = whatever differs from that floor (the object and its shadow), soft-edged
    diff = np.sqrt(((rgb - floor) ** 2).sum(-1))
    alpha = np.clip((ndimage.gaussian_filter(diff, 1.5) - 0.05) / 0.08, 0, 1)
    alpha = ndimage.grey_dilation(alpha, size=(5, 5)) * hole
    alpha = ndimage.gaussian_filter(alpha, 1.0) * hole
    frames, crops = [], []
    for i, (rr, cc, x0, y0, x1, y1) in enumerate(boxes, 1):
        crops.append(np.dstack([rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1]]))
        tiles = [[int(c), int(r)] for r, c in zip(rr, cc)]
        frames.append({"name": f"prop{i}", "x": 0, "y": 0, "w": x1 - x0, "h": y1 - y0,
                       "at": {"x": int(x0), "y": int(y0)}, "tiles": tiles})
    filled = rgb * (1 - alpha[..., None]) + floor * alpha[..., None]
    # pack in one row
    x = 0
    aw, ah = sum(f["w"] for f in frames) + 2 * len(frames), max(f["h"] for f in frames)
    atlas = np.zeros((ah, aw, 4))
    for f, crop in zip(frames, crops):
        f["x"] = x
        atlas[:f["h"], x:x + f["w"]] = crop
        x += f["w"] + 2
    Image.fromarray((np.clip(atlas, 0, 1) * 255).astype(np.uint8), "RGBA").save(d / "props.png")
    Image.fromarray((np.clip(filled, 0, 1) * 255).astype(np.uint8)).save(d / "bg.png")
    return {"image": "props.png", "size": {"w": aw, "h": ah}, "frames": frames,
            "note": "frame x/y/w/h in props.png; `at` is its top-left in the arena px; `tiles` are its 'o' grid cells"}


def build(aid, a, seg):
    d = work(aid)
    full = d / "bg-full.png"
    if not full.exists():                     # bg-full.png = the picked art untouched; bg.png may get props cut
        full.write_bytes((d / "bg.png").read_bytes())
    img = Image.open(full).convert("RGB")
    chars = classify(features(img, seg.get("tex", 1.2)), seg["protos"])
    g = tiles_from(chars, seg.get("thresh", {}))
    g = apply_fix(g, seg.get("fix", []))
    raw_mirror = float((g == g[:, ::-1]).mean())      # how symmetric the art itself segmented, before forcing it
    g = symmetrize(g)
    g[0, :] = g[-1, :] = "#"
    g[:, 0] = g[:, -1] = "#"
    g, pockets = seal_pockets(g)
    np.save(d / "pixclass.npy", chars)
    out = PUBLIC / aid
    out.mkdir(parents=True, exist_ok=True)
    props = cut_props(aid, g, chars, d) if seg.get("props") else None
    if props is None:
        (d / "bg.png").write_bytes(full.read_bytes())
        for f in ("props.png", "props.json"):
            (d / f).unlink(missing_ok=True)
            (out / f).unlink(missing_ok=True)
    arena = {
        "id": aid, "name": a["name"], "sourceCard": a["card"],
        "size": {"w": W, "h": H}, "tile": TILE,
        "grid": ["".join(row) for row in g],
        "spawns": spawns(g, seg.get("spawn_sep", 5)),
        "ambient": a["ambient"],
    }
    (out / "arena.json").write_text(json.dumps(arena, indent=1) + "\n", encoding="utf-8")
    (out / "bg.png").write_bytes((d / "bg.png").read_bytes())
    if props:
        (out / "props.json").write_text(json.dumps(props, indent=1) + "\n", encoding="utf-8")
        (out / "props.png").write_bytes((d / "props.png").read_bytes())
        (d / "props.json").write_text(json.dumps(props, indent=1) + "\n", encoding="utf-8")
    counts = {ch: int((g == ch).sum()) for ch in ".#~^o\""}
    print(f"{aid}: {counts} art mirror agreement {raw_mirror:.2f}, sealed pockets filled: {pockets}, "
          f"props: {len(props['frames']) if props else 0}")


def main(ids):
    table = arenas()
    segs = json.loads((HERE / "segs.json").read_text(encoding="utf-8-sig"))
    for aid in ids or table:
        build(aid, table[aid], segs[aid])


if __name__ == "__main__":
    main(sys.argv[1:])
