"""Step 2: a top-down arena painting from each card scene (OpenAI image edit, the scene as the reference).

    python tools/arenas/gen.py <arena id> [--n 1] [--extra "more prompt"] [--model gpt-image-2]

Needs OPENAI_API_KEY in the environment (never printed or logged). Every attempt is saved as
style-lab/arenas/<id>/gen-<k>.png and logged (prompt, model, size, token usage) to gen.jsonl next to it;
pick.py then copies the chosen one to bg.png. The prompt is built here from arenas.json + STYLE, so the look
stays the same across all ten.
"""
import argparse
import base64
import io
import json
import time

from PIL import Image

from common import H, W, arenas, work

STYLE = (
    "Painterly Pokemon trading card game illustration style: soft hand-painted brushwork, gentle gradients, "
    "clean shapes, a warm storybook finish like the reference card art. "
)

RULES = (
    "Strict top-down orthographic view, looking straight down at the ground from high above, like a 2D "
    "top-down video game battle map: no horizon, no sky, no perspective, no vanishing point. "
    "One enclosed battlefield filling the whole 16:9 frame: impassable terrain (rocks, cliffs, walls, deep "
    "water or dense foliage) forms a border around all four edges, a few obstacles and cover pieces sit inside, "
    "and a wide, clear, evenly lit open floor fills most of the middle so that small characters stay readable "
    "on it. The layout is roughly mirror-symmetric left to right. Floor surfaces are calm and low-contrast; "
    "obstacles are clearly outlined with a soft drop shadow so they read at a glance. "
    "No characters, no Pokemon, no creatures, no people, no text, no letters, no logos, no UI, no grid lines."
)


def prompt(a, extra=""):
    return (
        f"Turn this reference scene into a top-down battle arena of the same place. The reference is {a['place']}. "
        f"Keep its exact colour palette, lighting and mood, and its landmarks, seen from directly above. "
        f"The arena: {a['layout']}. " + STYLE + RULES + (" " + extra if extra else "")
    )


def to_size(im):
    """cover-crop to exactly 1920x1080"""
    s = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("aid")
    ap.add_argument("--n", type=int, default=1)
    ap.add_argument("--extra", default="")
    ap.add_argument("--model", default="gpt-image-2")
    ap.add_argument("--size", default="1920x1088")
    ap.add_argument("--quality", default="high")
    args = ap.parse_args()
    from openai import OpenAI
    client = OpenAI()
    a = arenas()[args.aid]
    d = work(args.aid)
    p = prompt(a, args.extra)
    for _ in range(args.n):
        k = len(list(d.glob("gen-*.png"))) + 1
        t = time.time()
        with open(d / "scene.png", "rb") as f:
            r = client.images.edit(model=args.model, image=f, prompt=p, size=args.size, quality=args.quality)
        im = Image.open(io.BytesIO(base64.b64decode(r.data[0].b64_json))).convert("RGB")
        im.save(d / f"raw-{k}.png")
        to_size(im).save(d / f"gen-{k}.png")
        usage = getattr(r, "usage", None)
        usage = usage.model_dump() if usage is not None and hasattr(usage, "model_dump") else None
        rec = dict(k=k, model=args.model, size=args.size, quality=args.quality, raw=list(im.size),
                   secs=round(time.time() - t, 1), extra=args.extra, prompt=p, usage=usage)
        with open(d / "gen.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(rec) + "\n")
        print(f"{args.aid} gen-{k}: {im.size} {rec['secs']}s usage={usage}")


if __name__ == "__main__":
    main()
