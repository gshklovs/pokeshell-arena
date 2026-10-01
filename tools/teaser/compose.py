"""The teaser's compositor (tools/teaser/README.md): the shot list below, cut from the clips tools/teaser/capture.mjs
recorded, under the motion-graphics layers tools/teaser/layers.mjs drew. Pillow + numpy frames piped to ffmpeg.

  python tools/teaser/compose.py [--scale 1|0.41667] [--out shots/teaser/master.mp4] [--stable 14] [--sheet sheet.png]

--scale 1 renders the 1920x1080 master (a fight shot's 800x450 window of the game blown up by nearest neighbour);
0.41667 renders 800x450 for the GIF, where a fight shot is the game's own pixels, never resized. --sheet writes a
contact sheet of every 0.5 s instead; --stable holds pixels that barely changed from the last frame (the GIF: the
screencast's JPEG noise would otherwise make every frame a full one) and drops the cuts' punch-in.
"""
import argparse
import json
import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "shots/teaser/raw"
LAYERS = ROOT / "shots/teaser/layers"
FPS = 50
W, H = 1920, 1080

# the game's tokens (src/theme.css)
DESK = (10, 14, 25)
GLOW1 = (28, 42, 82)
GLOW2 = (58, 28, 62)
GOLD = (255, 211, 90)

# ------------------------------------------------------------------ the shot list
# clip shots: `clip` from `t` (seconds into the clip) for `dur` seconds of the teaser at `speed`; `zoom` (2.4) crops
# a 1920/zoom wide window of the game (2.4: 800x450, the GIF's size), centred on the two fighters (`cam`: 'pair', 'a' you, 'b' the foe, or
# [x, y]; 'fit', 'fita', 'fitb' a still window around where both / you / the foe go during the shot, zoomed to fit;
# 'follow', 'fa', 'fb' pan after them frame by frame, which the GIF pays for in size) plus `off`; `cap` a caption layer; `flash` a white flash `flash` seconds into the shot
SHOTS = [
    dict(kind="title", dur=1.2),
    # moving: the camera follows the runner; fliers over water, strafing, dodge rolls out of the shots, a close call,
    # the bots chasing each other, a melee step-in
    dict(clip="mv-lagoon", t=0.15, dur=0.70, cam="fita", cap="move"),                        # Zapdos flies out over the lagoon
    dict(clip="mv-free", t=17.25, dur=0.70, cam="fit"),                       # the bots chase and roll
    dict(clip="mv-city", t=0.60, dur=0.65, cam="fita", cap="dodge"),                        # Machamp's shoulder-charge dodge
    dict(clip="mv-lagoon", t=5.45, dur=0.55, cam="fita"),                                   # Starmie blinks out of a Fire Blast
    dict(clip="mv-lagoon", t=6.50, dur=0.70, cam="fita", cap="close"),                      # Zapdos: the star passes behind
    dict(clip="melee", t=0.45, dur=0.65, cam="fit"),                                   # Leafeon V steps in: Leaf Blade
    # the moves: walking in, then the signature casts
    dict(clip="duel-water", t=0.50, dur=0.60, cam="fit", cap="aim"),                   # Blastoise: Hydro Pump
    dict(clip="duel-fire", t=0.55, dur=0.65, speed=1.3, cam="fit"),                    # Volcarona V: Fire Blast
    dict(clip="duel-water", t=2.35, dur=0.55, cam="fit"),                              # Raichu: Thunderbolt
    dict(clip="duel-fire", t=2.50, dur=0.55, cam="fit"),                               # Tropius: Solar Beam
    dict(clip="duel-fire", t=4.45, dur=0.65, off=(60, -90)),                              # Minior: Draco Meteor rain
    dict(clip="duel-night", t=2.45, dur=0.60, speed=1.2, cam="fit"),                   # Cresselia: Lunar Blast homing
    dict(clip="melee", t=3.90, dur=0.40, cam=(930, 680), cap="swap"),                     # the team bar's swap
    dict(clip="evo", t=0.62, dur=0.75, cam="a", off=(120, -40), cap="evolve"),            # Charmeleon -> Charizard
    dict(clip="duel-fire", t=6.95, dur=0.80, cam="fit", cap="ko", flash=0.63),         # Fire Blast, the KO
    # the pack: the roll reel lands, the tear, the shake, the alt-art reveal
    dict(clip="pack", t=1.05, dur=0.65, speed=1.2, zoom=1.6, cam=(960, 440), smooth=True, cap="packs", cap_pos="tc"),
    dict(clip="pack", t=1.90, dur=0.55, speed=1.3, zoom=2, cam=(960, 470), smooth=True),
    dict(clip="pack", t=17.0, dur=0.70, speed=2.0, zoom=1.8, cam=(960, 470), smooth=True),
    dict(clip="pack", t=18.7, dur=0.80, speed=1.2, zoom=1.8, cam=(960, 470), smooth=True, cap="rare", cap_pos="tc"),
    dict(kind="end", dur=1.6),
]


def ease_out_back(x, s=1.70158):
    x = min(max(x, 0.0), 1.0) - 1
    return 1 + (s + 1) * x ** 3 + s * x ** 2


def ease_out(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3


class Clip:
    """a recorded clip read frame by frame (50 fps), forward only, from a start time"""

    def __init__(self, name, t):
        self.name = name
        self.proc = subprocess.Popen(
            ["ffmpeg", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", str(RAW / f"{name}.mp4"), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            stdout=subprocess.PIPE)
        self.i = -1
        self.cur = None

    def frame(self, i):
        while self.i < i:
            buf = self.proc.stdout.read(W * H * 3)
            if len(buf) < W * H * 3:
                break
            self.cur = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
            self.i += 1
        return self.cur

    def close(self):
        self.proc.kill()


def cam_center(clip, t0, t1, mode):
    if isinstance(mode, (list, tuple)):
        return mode
    cam = json.loads((RAW / f"{clip}.cam.json").read_text())
    pts = [c for c in cam if t0 <= c[0] <= t1] or cam[:1]
    a = np.mean([[c[1], c[2]] for c in pts], 0)
    b = np.mean([[c[3], c[4]] for c in pts], 0)
    return {"a": a, "b": b}.get(mode, (a + b) / 2)


def fit(clip, t0, t1, mode, margin=150):
    """a still window around the action: the box the runner ('fita'), the foe ('fitb') or both ('fit') cover over the
    shot, plus a margin; the zoom steps down from 2.4 to 2.0 or 1.6 until the box fits (a still crop keeps a GIF's
    frames small, a panning one redraws every pixel)"""
    cam = np.array(json.loads((RAW / f"{clip}.cam.json").read_text()), float)
    cam = cam[(cam[:, 0] >= t0) & (cam[:, 0] <= t1)]
    pts = {"fita": cam[:, 1:3], "fitb": cam[:, 3:5]}.get(mode, np.concatenate([cam[:, 1:3], cam[:, 3:5]]))
    lo, hi = pts.min(0) - margin, pts.max(0) + margin
    zoom = next((z for z in (2.4, 2.0, 1.6) if hi[0] - lo[0] <= W / z and hi[1] - lo[1] <= H / z), 1.6)
    return (lo + hi) / 2, zoom


class Follow:
    """a camera that follows the action: the pair's midpoint ('follow'), you ('fa') or the foe ('fb'), smoothed over
    `win` seconds either side so it glides instead of jittering"""

    def __init__(self, clip, mode, win=0.25):
        cam = np.array(json.loads((RAW / f"{clip}.cam.json").read_text()), float)
        self.t = cam[:, 0]
        a, b = cam[:, 1:3], cam[:, 3:5]
        self.p = {"follow": (a + b) / 2, "fa": a, "fb": b}[mode]
        self.win = win

    def at(self, t):
        m = (self.t >= t - self.win) & (self.t <= t + self.win)
        if not m.any():
            return self.p[np.argmin(np.abs(self.t - t))]
        w = 1 - np.abs(self.t[m] - t) / (self.win + 1e-6)
        return (self.p[m] * w[:, None]).sum(0) / w.sum()


def layer(name, scale):
    im = Image.open(LAYERS / f"{name}.png").convert("RGBA")
    if scale != 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    return im


def desk(scale):
    """the screens' backdrop (src/style.css body): navy, two glows, the dot grid"""
    w, h = round(W * scale), round(H * scale)
    y, x = np.mgrid[0:h, 0:w].astype(np.float32) / scale
    img = np.zeros((h, w, 3), np.float32) + DESK
    for (cx, cy, rx, ry, col) in [(0.15 * W, -0.1 * H, 1200, 600, GLOW1), (W, 1.1 * H, 900, 500, GLOW2)]:
        d = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
        k = np.clip(1 - d / 0.6, 0, 1)[..., None]
        img = img * (1 - k) + np.array(col, np.float32) * k
    dots = ((x % 22) < 2.4) & ((y % 22) < 2.4)
    img[dots] = img[dots] * 0.88 + np.array([160, 180, 255]) * 0.12
    return Image.fromarray(img.clip(0, 255).astype(np.uint8)).convert("RGBA")


def paste(base, im, cx, cy, s=1.0, alpha=1.0):
    """`im` centred on (cx, cy), scaled by s, faded by alpha"""
    if s <= 0.01 or alpha <= 0.01:
        return
    if abs(s - 1) > 1e-3:
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.BICUBIC)
    if alpha < 1:
        a = im.getchannel("A").point(lambda v: int(v * alpha))
        im = im.copy()
        im.putalpha(a)
    base.alpha_composite(im, (round(cx - im.width / 2), round(cy - im.height / 2)))


class Teaser:
    def __init__(self, scale, punch=True):
        self.s = scale
        self.punch = punch
        self.w, self.h = round(W * scale), round(H * scale)
        names = ["ball", "wordmark", "tagline", "tagline2", "end-dl", "end-url", "end-free"]
        names += [p.stem for p in LAYERS.glob("cap-*.png")]
        self.L = {n: layer(n, scale) for n in names}
        self.desk = desk(scale)

    # ---------------------------------------------------------------- the cards
    def title(self, t, dur):
        s = self.s
        im = self.desk.copy()
        # the ball drops in, the wordmark punches in beside it, the taglines rise
        ball, wm = self.L["ball"], self.L["wordmark"]
        total = ball.width * 0.8 + 30 * s + wm.width
        x0 = (self.w - total) / 2
        k = ease_out_back(t / 0.32)
        paste(im, ball, x0 + ball.width * 0.4, self.h * 0.40 - (1 - ease_out(t / 0.32)) * 160 * s, 0.8 * max(k, 0), min(1, t / 0.12))
        k2 = ease_out_back((t - 0.12) / 0.3, 2.4)
        paste(im, wm, x0 + ball.width * 0.8 + 30 * s + wm.width / 2, self.h * 0.40, 0.6 + 0.4 * k2 if t > 0.12 else 0, min(1, (t - 0.12) / 0.1))
        tg = ease_out((t - 0.42) / 0.3)
        paste(im, self.L["tagline"], self.w / 2, self.h * 0.585 + (1 - tg) * 30 * s, 1, tg)
        tg2 = ease_out((t - 0.62) / 0.3)
        paste(im, self.L["tagline2"], self.w / 2, self.h * 0.69 + (1 - tg2) * 30 * s, 1, tg2)
        return im

    def end(self, t, dur):
        s = self.s
        im = self.desk.copy()
        ball, wm = self.L["ball"], self.L["wordmark"]
        sc = 0.72
        total = (ball.width * 0.8 + 30 * s + wm.width) * sc
        x0 = (self.w - total) / 2
        paste(im, ball, x0 + ball.width * 0.4 * sc, self.h * 0.24, 0.8 * sc)
        paste(im, wm, x0 + (ball.width * 0.8 + 30 * s + wm.width / 2) * sc, self.h * 0.24, sc)
        k = ease_out_back((t - 0.05) / 0.3, 2.2)
        paste(im, self.L["end-dl"], self.w / 2, self.h * 0.47, 0.5 + 0.5 * k if t > 0.05 else 0, min(1, max(0, (t - 0.05) / 0.08)))
        # the URL types in, letter by letter (a wipe over the pixel font)
        url = self.L["end-url"]
        n = ease_out((t - 0.3) / 0.45)
        if n > 0:
            cut = url.crop((0, 0, max(1, round(url.width * n)), url.height))
            im.alpha_composite(cut, (round(self.w / 2 - url.width / 2), round(self.h * 0.665 - url.height / 2)))
        f = ease_out((t - 0.7) / 0.3)
        paste(im, self.L["end-free"], self.w / 2, self.h * 0.79 + (1 - f) * 20 * s, 1, f)
        return im

    # ---------------------------------------------------------------- the clips
    def clip_frame(self, sh, src, t):
        s = self.s
        zoom = sh.get("zoom", 2.4)
        cw, chh = W / zoom, H / zoom
        cx, cy = sh["_c"]
        cx = min(max(cx, cw / 2), W - cw / 2)
        cy = min(max(cy, chh / 2), H - chh / 2)
        x0, y0 = round(cx - cw / 2), round(cy - chh / 2)
        crop = Image.fromarray(src[y0:y0 + round(chh), x0:x0 + round(cw)])
        out_w, out_h = self.w, self.h
        if crop.size != (out_w, out_h):
            up = out_w > crop.width
            crop = crop.resize((out_w, out_h), Image.LANCZOS if sh.get("smooth") else Image.NEAREST if up else Image.BOX)
        im = crop.convert("RGBA")
        # a quick punch-in on the cut
        if t < 0.08 and sh.get("punch", True) and self.punch:
            k = 1 + 0.05 * (1 - t / 0.08)
            big = im.resize((round(out_w * k), round(out_h * k)), Image.NEAREST)
            im = big.crop(((big.width - out_w) // 2, (big.height - out_h) // 2, (big.width - out_w) // 2 + out_w, (big.height - out_h) // 2 + out_h))
        if "flash" in sh:
            d = t - sh["flash"]
            if 0 <= d < 0.1:
                a = 0.55 * (1 - d / 0.1)
                im = Image.blend(im, Image.new("RGBA", im.size, (255, 255, 255, 255)), a)
        if sh.get("cap"):
            self.caption(im, sh["cap"], t, sh["dur"], sh.get("cap_at", 0.0), sh.get("cap_pos", "bl"))
        return im

    def caption(self, im, name, t, dur, at, pos):
        cap = self.L[f"cap-{name}"]
        s = self.s
        t -= at
        if t < 0:
            return
        k = ease_out_back(t / 0.16, 2.6)
        out = ease_out((t - (dur - at - 0.1)) / 0.1)
        x = 70 * s + cap.width / 2 if pos == "bl" else self.w / 2
        y = self.h - 120 * s if pos in ("bl", "bc") else 110 * s
        # a gold bar sweeps in under it
        bar = ease_out(t / 0.22)
        d = ImageDraw.Draw(im)
        bw = cap.width * bar * (1 - out)
        if bw > 40 * s:
            bx = x - cap.width / 2 + 16 * s
            d.rectangle([bx, y + cap.height * 0.42, bx + bw - 32 * s, y + cap.height * 0.42 + 10 * s], fill=GOLD + (255,))
        paste(im, cap, x - out * 60 * s, y, 1.35 - 0.35 * k if t < 0.16 else 1.0, min(1, t / 0.06) * (1 - out))

    # ---------------------------------------------------------------- the whole cut
    def frames(self):
        for sh in SHOTS:
            n = round(sh["dur"] * FPS)
            if sh.get("kind") in ("title", "end"):
                fn = self.title if sh["kind"] == "title" else self.end
                for i in range(n):
                    yield fn(i / FPS, sh["dur"])
                continue
            speed = sh.get("speed", 1.0)
            mode = sh.get("cam", "pair")
            follow = Follow(sh["clip"], mode, sh.get("win", 0.25)) if mode in ("follow", "fa", "fb") else None
            if isinstance(mode, str) and mode.startswith("fit"):
                c, sh["zoom"] = fit(sh["clip"], sh["t"], sh["t"] + sh["dur"] * speed, mode, sh.get("margin", 150))
                sh["_c"] = c + np.array(sh.get("off", (0, 0)))
            elif not follow:
                sh["_c"] = np.array(cam_center(sh["clip"], sh["t"], sh["t"] + sh["dur"] * speed, mode), float) + np.array(sh.get("off", (0, 0)))
            c = Clip(sh["clip"], sh["t"])
            for i in range(n):
                if follow:
                    sh["_c"] = follow.at(sh["t"] + i * speed / FPS) + np.array(sh.get("off", (0, 0)))
                src = c.frame(math.floor(i * speed))
                yield self.clip_frame(sh, src, i / FPS)
            c.close()


def shot_starts():
    out, t = [], 0.0
    for sh in SHOTS:
        out.append(t)
        t += sh["dur"]
    return out, t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--out", default=str(ROOT / "shots/teaser/master.mp4"))
    ap.add_argument("--sheet")
    ap.add_argument("--every", type=float, default=0.5)
    ap.add_argument("--stable", type=int, default=0)
    a = ap.parse_args()
    tz = Teaser(a.scale, punch=not a.stable)
    starts, total = shot_starts()
    print(f"{len(SHOTS)} shots, {total:.2f} s: " + ", ".join(f"{s:.2f} {sh.get('kind') or sh['clip']}{'/' + sh['cap'] if sh.get('cap') else ''}" for s, sh in zip(starts, SHOTS)))
    if a.sheet:
        thumbs = []
        for i, im in enumerate(tz.frames()):
            if i % round(FPS * a.every) == 0:
                th = im.convert("RGB").resize((480, 270), Image.BOX)
                ImageDraw.Draw(th).text((6, 4), f"{i / FPS:.1f}s", fill=(255, 255, 0))
                thumbs.append(th)
        cols = 6
        rows = math.ceil(len(thumbs) / cols)
        sheet = Image.new("RGB", (cols * 484, rows * 274), (0, 0, 0))
        for i, th in enumerate(thumbs):
            sheet.paste(th, ((i % cols) * 484, (i // cols) * 274))
        sheet.save(a.sheet)
        print("sheet", a.sheet)
        return
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{tz.w}x{tz.h}", "-r", str(FPS), "-i", "-",
                          *(["-c:v", "libx264", "-preset", "slow", "-crf", "8", "-pix_fmt", "yuv420p"] if a.scale == 1 else ["-c:v", "libx264rgb", "-qp", "0", "-preset", "fast"]), "-movflags", "+faststart", a.out],
                         stdin=subprocess.PIPE)
    prev = None
    for im in tz.frames():
        cur = np.asarray(im.convert("RGB")).copy()
        if a.stable and prev is not None:
            still = np.abs(cur.astype(np.int16) - prev).max(2) < a.stable
            cur[still] = prev[still]
        prev = cur
        p.stdin.write(cur.tobytes())
    p.stdin.close()
    p.wait()
    print("wrote", a.out)


if __name__ == "__main__":
    main()
