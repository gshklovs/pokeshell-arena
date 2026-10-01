"""Record the pack opening with Playwright: frames of a full opening, a big-hit reveal, every effect family, the
set picker, a mid-tear drag, reduced motion and a phone viewport, plus contact sheets and GIFs.

  python scripts/packs-sheets.py [--url http://localhost:5178] [--out <dir>]

Needs the demo server (npm run packs:demo); started here if it isn't running. Python with playwright + pillow
(pip install playwright pillow; playwright install chromium). Default --out: <pokeshell checkout>/style-lab/packs/sheets
(the lab folder, not in git): POKESHELL_ROOT or ../pokeshell.
"""
import argparse
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PS_ROOT = Path(os.environ.get("POKESHELL_ROOT") or ROOT.parent / "pokeshell")


def up(url):
    try:
        urllib.request.urlopen(url + "/pokeshell/built.json", timeout=2)
        return True
    except Exception:
        return False


def contact(frames, out, cols=4, label=None, width=1600):
    ims = [Image.open(f).convert("RGB") for f in frames]
    if not ims:
        return
    w = width // cols
    h = int(ims[0].height * w / ims[0].width)
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w, rows * (h + 22)), (12, 10, 20))
    d = ImageDraw.Draw(sheet)
    for i, im in enumerate(ims):
        x, y = (i % cols) * w, (i // cols) * (h + 22)
        sheet.paste(im.resize((w, h), Image.LANCZOS), (x, y))
        d.text((x + 6, y + h + 4), (label[i] if label else Path(frames[i]).stem), fill=(220, 215, 240))
    sheet.save(out)


def gif(frames, out, ms=90, width=640):
    ims = []
    for f in frames:
        im = Image.open(f).convert("RGB")
        im = im.resize((width, int(im.height * width / im.width)), Image.LANCZOS)
        ims.append(im.convert("P", palette=Image.ADAPTIVE, colors=128))
    if ims:
        ims[0].save(out, save_all=True, append_images=ims[1:], duration=ms, loop=0, optimize=True)


def record(page, url, out_dir, name, until="summary", every=0.14, extra=1.8, limit=60):
    """play an autoplay opening, screenshot every `every` s until the phase is `until` (+extra s)"""
    d = out_dir / f"{name}-frames"
    d.mkdir(parents=True, exist_ok=True)
    for f in d.glob("*.png"):
        f.unlink()
    page.goto(url)
    page.wait_for_function("document.body.dataset.phase && document.body.dataset.phase !== 'picker'", timeout=15000)
    frames, phases, t0, done_at = [], [], time.time(), None
    while time.time() - t0 < limit:
        f = d / f"{len(frames):04d}.png"
        page.screenshot(path=str(f))
        ph = page.evaluate("document.body.dataset.phase + (document.body.dataset.index ? ':' + document.body.dataset.index : '')")
        frames.append(f); phases.append(ph)
        if ph.startswith(until) and done_at is None:
            done_at = time.time()
        if done_at and time.time() - done_at > extra:
            break
        time.sleep(every)
    return frames, phases


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5178")
    ap.add_argument("--out", default=str(PS_ROOT / "style-lab" / "packs" / "sheets"))
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    srv = None
    if not up(a.url):
        srv = subprocess.Popen(["node", str(ROOT / "scripts" / "packs-demo.mjs")], cwd=ROOT)
        for _ in range(240):
            if up(a.url):
                break
            time.sleep(0.5)
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            page = b.new_page(viewport={"width": 1280, "height": 800})
            u = a.url

            # the set picker
            page.goto(u + "/?mute=1")
            page.wait_for_selector(".demo-set")
            time.sleep(0.8)
            page.screenshot(path=str(out / "00-picker.png"))

            # idle, then a real mouse drag across the tear strip (mid-tear: the flap lifts, the light leaks)
            page.goto(u + "/?set=swsh7&force=gold&mute=1")
            page.wait_for_selector(".pk-pack")
            time.sleep(1.2)
            page.screenshot(path=str(out / "01-idle.png"))
            box = page.locator(".pk-pack").bounding_box()
            y = box["y"] + box["height"] * 0.155
            page.mouse.move(box["x"] + 8, y)
            page.mouse.down()
            for i in range(1, 15):
                page.mouse.move(box["x"] + 8 + box["width"] * 0.62 * i / 14, y + (i % 3 - 1), steps=2)
                time.sleep(0.03)
            time.sleep(0.35)
            page.screenshot(path=str(out / "02-tear-drag.png"))
            for i in range(15, 26):
                page.mouse.move(box["x"] + 8 + box["width"] * 0.62 * i / 14, y, steps=2)
                time.sleep(0.02)
            page.mouse.up()
            time.sleep(0.12)
            page.screenshot(path=str(out / "03-torn.png"))
            time.sleep(1.1)
            page.screenshot(path=str(out / "04-fan.png"))

            # a full opening (seeded Evolving Skies pack), frames + GIF
            frames, phases = record(page, u + "/?set=swsh7&seed=20260929&auto=1&mute=1", out, "full")
            pick = frames[:: max(1, len(frames) // 24)][:24]
            contact(pick, out / "full-opening-sheet.png", cols=6, label=[phases[frames.index(f)] for f in pick])
            gif(frames, out / "full-opening.gif", ms=140)

            # the big hit: a gold card last (the charge, the flip, the rays, the burst)
            frames, phases = record(page, u + "/?set=swsh7&force=gold&auto=1&mute=1", out, "bighit", every=0.09)
            last = [f for f, p in zip(frames, phases) if p.startswith("reveal:")]
            n = page.evaluate("document.querySelectorAll('.pk-summary .pk-card').length") or 10
            hit = [f for f, p in zip(frames, phases) if p == f"reveal:{n - 1}"]
            pick = (hit[:: max(1, len(hit) // 12)] or last[-12:])[:12]
            contact(pick, out / "bighit-sheet.png", cols=4, label=[phases[frames.index(f)] for f in pick])
            gif(hit or last, out / "bighit.gif", ms=90)
            if hit:
                Image.open(hit[min(len(hit) - 1, int(len(hit) * 0.55))]).save(out / "05-bighit-reveal.png")
            page.screenshot(path=str(out / "06-summary.png"))

            # every effect family: a pack forced to end on it, screenshot just after its reveal
            fx_shots = []
            for fx, s in [("holo", "swsh7"), ("full-art", "swsh7"), ("alt-art", "swsh7"), ("rainbow", "swsh7"), ("gold", "swsh7"),
                          ("radiant", "swsh12pt5"), ("shiny", "sm115")]:
                page.goto(u + f"/?set={s}&force={fx}&auto=1&mute=1")
                page.wait_for_function("document.body.dataset.phase === 'reveal'", timeout=20000)
                n = page.evaluate("0") or 0
                page.wait_for_function("document.querySelector('.pk-card.is-top.is-revealed') || document.body.dataset.phase === 'summary'", timeout=40000)
                # wait for the last card
                page.wait_for_function("(() => { const t = document.querySelectorAll('.pk-deck .pk-card:not(.is-flung)'); return t.length === 1 && t[0].classList.contains('is-revealed'); })() || document.body.dataset.phase === 'summary'", timeout=60000)
                time.sleep(0.7)
                box = page.locator(".pk-deck").bounding_box()
                if box:
                    page.mouse.move(box["x"] + box["width"] * 0.25, box["y"] + box["height"] * 0.3)
                    time.sleep(0.15)
                f = out / f"fx-{fx}.png"
                page.screenshot(path=str(f))
                fx_shots.append(f)
                del n
            contact(fx_shots, out / "fx-sheet.png", cols=4, label=[f.stem for f in fx_shots])

            # reduced motion and a phone
            page.goto(u + "/?set=swsh9&seed=3&reduced=1&mute=1")
            page.wait_for_selector(".pk-pack")
            time.sleep(0.6)
            page.screenshot(path=str(out / "07-reduced-idle.png"))
            ph = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            ph.goto(u + "/?set=me55&seed=5&auto=1&mute=1")
            ph.wait_for_selector(".pk-pack")
            time.sleep(1.0)
            ph.screenshot(path=str(out / "08-phone-idle.png"))
            ph.wait_for_function("document.body.dataset.phase === 'summary'", timeout=60000)
            time.sleep(1.5)
            ph.screenshot(path=str(out / "09-phone-summary.png"))
            b.close()
    finally:
        if srv:
            srv.terminate()
    print(f"sheets in {out}")


if __name__ == "__main__":
    sys.exit(main())
