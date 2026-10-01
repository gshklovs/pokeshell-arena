"""Step 1: each arena's reference scene = its card's art window with the real Pokemon painted out.

pokeshell's own recipe (docs/ART_METHOD.md section 7): the mask (style-lab/<set>/masks/<id>.png) grown a few px,
plus per-card boxes (stage icon, 30th stamp), filled by evlib.tex_fill (push-pull membrane + the scene's own
reflected texture). Output: style-lab/arenas/<id>/scene.png (the art window only, no card frame or text).

    python tools/arenas/scene.py [arena id ...]
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

from common import arenas, mask, pokeshell_lib, scan, src, work

pokeshell_lib()
import evlib  # noqa: E402


def auto_tex_src(known, x0, y0, x1, y1, tw=120, th=120):
    best, bs = (x0, y0, x0 + tw, y0 + th), -1
    for y in range(y0, y1 - th, 16):
        for x in range(x0, x1 - tw, 16):
            s = known[y:y + th, x:x + tw].mean()
            if s > bs:
                best, bs = (x, y, x + tw, y + th), s
    return best


def paint_out(cid, boxes, grow=6):
    rgb = np.asarray(scan(cid)).astype(float) / 255
    m = np.asarray(mask(cid)) > 0
    m = ndimage.binary_dilation(m, iterations=grow)
    for a, b, c, d in boxes:
        m[max(0, b):d, max(0, a):c] = True
    x0, y0, x1, y1 = src(cid)[3]
    # only the art window counts as known: the frame and text never leak into the fill
    known = ~m
    win = np.zeros_like(known)
    win[y0:y1, x0:x1] = True
    known &= win
    # a mostly smooth fill (detail 0.35): the image model gets the palette, light and landmarks, and no
    # kaleidoscope texture it would copy into the arena
    tex = auto_tex_src(known, x0, y0, x1, y1)
    out = evlib.tex_fill(rgb, known, 14, tex, 0.35)
    crop = out[y0:y1, x0:x1]
    return Image.fromarray((np.clip(crop, 0, 1) * 255).astype(np.uint8)), m[y0:y1, x0:x1].mean()


def main(ids):
    table = arenas()
    for aid in ids or table:
        a = table[aid]
        im, frac = paint_out(a["card"], a.get("boxes", []))
        im.save(work(aid) / "scene.png")
        scan(a["card"]).save(work(aid) / "card.png")
        print(f"{aid}: {a['card']} scene {im.size}, {frac:.0%} painted out")


if __name__ == "__main__":
    main(sys.argv[1:])
