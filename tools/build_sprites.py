"""Battle sprites from pokemon-colorscripts (docs/SPEC.md section 12).

  python tools/build_sprites.py --vendor <path to pokemon-colorscripts> [--only pikachu,squirtle] [--out public/sprites]

Decodes the half-block ANSI sprites (colorscripts/large/{regular,shiny}/<name>) into 1-px-per-pixel RGBA PNGs,
pixel-exact: each cell is two pixels ("▀" top = foreground, "▄" bottom = foreground, the other half = the background
colour or transparent, "█" both, " " the background or transparent). Empty margins are cropped (the pixels are not
touched) so the feet sit on the bottom edge. Writes <out>/<name>.png, <name>-shiny.png and index.json.

The output is Nintendo artwork: it is gitignored and ships in the arena's own art release, never in git.
Needs Pillow (the pokeshell .venv has it).
"""
import argparse
import json
import re
import sys
from pathlib import Path

from PIL import Image

SGR = re.compile(r"\x1b\[([0-9;]*)m")


def decode(text):
    """ANSI half-block text -> (width, height, pixels dict {(x, y): (r, g, b, 255)})"""
    px = {}
    rows = text.replace("\r", "").split("\n")
    width = 0
    for row_i, line in enumerate(rows):
        fg = bg = None
        x = 0
        pos = 0
        while pos < len(line):
            m = SGR.match(line, pos)
            if m:
                parts = [int(p) if p else 0 for p in m.group(1).split(";")] if m.group(1) else [0]
                i = 0
                while i < len(parts):
                    p = parts[i]
                    if p == 0:
                        fg = bg = None
                    elif p == 39:
                        fg = None
                    elif p == 49:
                        bg = None
                    elif p in (38, 48) and i + 4 < len(parts) and parts[i + 1] == 2:
                        col = (parts[i + 2], parts[i + 3], parts[i + 4], 255)
                        if p == 38:
                            fg = col
                        else:
                            bg = col
                        i += 4
                    i += 1
                pos = m.end()
                continue
            ch = line[pos]
            pos += 1
            top = bottom = None
            if ch == "▀":
                top, bottom = fg, bg
            elif ch == "▄":
                top, bottom = bg, fg
            elif ch == "█":
                top = bottom = fg
            elif ch == " ":
                top = bottom = bg
            else:
                top = bottom = fg
            if top:
                px[(x, row_i * 2)] = top
            if bottom:
                px[(x, row_i * 2 + 1)] = bottom
            x += 1
        width = max(width, x)
    return width, len(rows) * 2, px


def to_png(text):
    w, h, px = decode(text)
    if not px:
        return None
    xs = [p[0] for p in px]
    ys = [p[1] for p in px]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    img = Image.new("RGBA", (x1 - x0 + 1, y1 - y0 + 1), (0, 0, 0, 0))
    for (x, y), c in px.items():
        img.putpixel((x - x0, y - y0), c)
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vendor", required=True, help="the pokemon-colorscripts checkout")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "public" / "sprites"))
    ap.add_argument("--only", default="", help="comma-separated names")
    ap.add_argument("--size", default="large", choices=["large", "small"])
    a = ap.parse_args()
    root = Path(a.vendor) / "colorscripts" / a.size
    if not root.is_dir():
        sys.exit(f"no colorscripts at {root}")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    only = {n.strip() for n in a.only.split(",") if n.strip()}
    index = {}
    for f in sorted((root / "regular").iterdir()):
        name = f.name
        if only and name not in only:
            continue
        entry = {}
        for form, suffix in (("regular", ""), ("shiny", "-shiny")):
            src = root / form / name
            if not src.is_file():
                continue
            img = to_png(src.read_text(encoding="utf-8", errors="replace"))
            if img is None:
                continue
            img.save(out / f"{name}{suffix}.png", optimize=True)
            entry[form] = [img.width, img.height]
        if entry:
            index[name] = entry
    (out / "index.json").write_text(json.dumps({"version": 1, "size": a.size, "sprites": index}, indent=0), encoding="utf-8")
    print(f"{len(index)} sprites -> {out}")


if __name__ == "__main__":
    main()
