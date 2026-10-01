"""Shared paths and the arena table for the arena generation tools (tools/arenas/README.md).

The card data (scans, masks) is never copied here: it is read from the pokeshell checkout's data root,
<POKESHELL_REPO>/style-lab/<set>/ (docs/ART_METHOD.md there). The working images and review sheets go to
<POKESHELL_REPO>/style-lab/arenas/ (untracked). Override the checkout with $POKESHELL_REPO.
"""
import json
import os
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]                                   # the pokeshell-arena checkout
PUBLIC = REPO / "public" / "arenas"
POKESHELL = Path(os.environ.get("POKESHELL_REPO") or REPO.parent / "pokeshell").resolve()   # default: a checkout next to this one
LAB = POKESHELL / "style-lab"
WORK = LAB / "arenas"                                    # style-lab/arenas/<id>/ (images), sheets/

W, H, TILE = 1920, 1080, 40
COLS, ROWS = W // TILE, H // TILE                        # 48 x 27

# card-id prefix -> (data folder, scan prefix, art window in card px)
SWSH_WIN = (66, 106, 680, 476)
SOURCES = {
    "swsh7": ("evs", "swsh7", SWSH_WIN),
    "swsh9": ("brs", "swsh9", SWSH_WIN),
    "swsh11": ("lor", "swsh11", SWSH_WIN),
    "swsh12pt5": ("cz", "swsh12pt5", SWSH_WIN),
    "me55": ("p30", "me55", (52, 88, 606, 432)),
    "neo1": ("neo1", "neo1", (68, 99, 532, 420)),
    "base1": ("base", "base1", (66, 100, 534, 418)),
    "sm115": ("hf", "hf", (58, 100, 676, 482)),
}


def src(cid):
    p, n = cid.rsplit("-", 1)
    folder, pre, win = SOURCES[p]
    return LAB / folder, pre, n, win


def scan(cid):
    d, pre, n, _ = src(cid)
    return Image.open(d / "ref" / f"{pre}_{n}.png").convert("RGB")


def mask(cid):
    d, _, _, _ = src(cid)
    return Image.open(d / "masks" / f"{cid}.png").convert("L")


def arenas():
    """the arena table (arenas.json next to this file): id -> card, name, boxes, prompt notes, ambient"""
    return json.loads((HERE / "arenas.json").read_text(encoding="utf-8-sig"))


def work(aid):
    p = WORK / aid
    p.mkdir(parents=True, exist_ok=True)
    return p


def pokeshell_lib():
    """put pokeshell's artlab evs helpers (evlib.tex_fill) on sys.path"""
    os.environ.setdefault("ARTLAB_DATA", str(LAB))
    sys.path.insert(0, str(POKESHELL / "artlab" / "sets" / "evs"))
