"""The arena's app icon: a ball on the arena's navy and gold (docs/RELEASE.md). Writes host/assets/icon.png (1024 px),
icon.ico (Windows: 16-256 px, embedded in the exe by host/build.rs), icon.icns (macOS: the .app's icon) and
public/favicon.png (64 px). Needs Pillow:  python tools/release/icon.py
The files are committed; rerun only to change the drawing."""
import io
import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
NAVY, NAVY_HI, GOLD = (13, 22, 48), (28, 44, 92), (244, 197, 66)
RED, RED_HI, WHITE, INK = (214, 48, 36), (240, 92, 70), (246, 242, 230), (12, 14, 24)


def draw(size: int = 1024) -> Image.Image:
    s = 4  # supersampled, then shrunk: smooth edges
    n = size * s
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad, r = int(n * 0.06), int(n * 0.2)
    # the tile: navy with a lighter top, a thin gold rim
    tile = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    td = ImageDraw.Draw(tile)
    for y in range(pad, n - pad):
        t = (y - pad) / (n - 2 * pad)
        c = tuple(int(NAVY_HI[i] * (1 - t) + NAVY[i] * t) for i in range(3))
        td.line([(pad, y), (n - pad, y)], fill=c + (255,))
    mask = Image.new('L', (n, n), 0)
    ImageDraw.Draw(mask).rounded_rectangle([pad, pad, n - pad, n - pad], r, fill=255)
    im.paste(tile, (0, 0), mask)
    d.rounded_rectangle([pad, pad, n - pad, n - pad], r, outline=GOLD + (255,), width=int(n * 0.018))
    # the ball, with a soft shadow
    cx, cy, br = n / 2, n / 2 + n * 0.01, n * 0.33
    shadow = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse([cx - br, cy - br + n * 0.03, cx + br, cy + br + n * 0.03], fill=(0, 0, 0, 140))
    im.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(n * 0.02)))
    box = [cx - br, cy - br, cx + br, cy + br]
    d.pieslice(box, 180, 360, fill=RED + (255,))
    d.pieslice(box, 0, 180, fill=WHITE + (255,))
    # a highlight on the red half
    hl = Image.new('RGBA', (n, n), RED_HI + (0,))   # transparent in the highlight's colour: the blur adds no dark edge
    ImageDraw.Draw(hl).ellipse([cx - br * 0.62, cy - br * 0.86, cx - br * 0.05, cy - br * 0.42], fill=RED_HI + (200,))
    im.alpha_composite(hl.filter(ImageFilter.GaussianBlur(n * 0.012)))
    band = br * 0.13
    disc = Image.new('L', (n, n), 0)
    ImageDraw.Draw(disc).ellipse(box, fill=255)
    stripe = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    ImageDraw.Draw(stripe).rectangle([cx - br, cy - band, cx + br, cy + band], fill=INK + (255,))
    im.paste(stripe, (0, 0), Image.composite(stripe.getchannel('A'), Image.new('L', (n, n), 0), disc))   # the band, inside the ball
    d.ellipse(box, outline=INK + (255,), width=int(br * 0.1))
    # the button: ink ring, gold ring, white centre
    for rr, col in ((0.34, INK), (0.25, GOLD), (0.17, WHITE)):
        d.ellipse([cx - br * rr, cy - br * rr, cx + br * rr, cy + br * rr], fill=col + (255,))
    return im.resize((size, size), Image.LANCZOS)


def png_bytes(im: Image.Image, size: int) -> bytes:
    b = io.BytesIO()
    im.resize((size, size), Image.LANCZOS).save(b, 'PNG')
    return b.getvalue()


def main() -> None:
    big = draw(1024)
    out = ROOT / 'host' / 'assets'
    out.mkdir(parents=True, exist_ok=True)
    big.save(out / 'icon.png')
    big.save(out / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    # icns: PNG entries (macOS 10.7+), by OSType
    entries = [(b'ic11', 32), (b'ic12', 64), (b'ic07', 128), (b'ic13', 256), (b'ic08', 256), (b'ic14', 512), (b'ic09', 512), (b'ic10', 1024)]
    body = b''.join(t + struct.pack('>I', 8 + len(p)) + p for t, p in ((t, png_bytes(big, s)) for t, s in entries))
    (out / 'icon.icns').write_bytes(b'icns' + struct.pack('>I', 8 + len(body)) + body)
    big.resize((64, 64), Image.LANCZOS).save(ROOT / 'public' / 'favicon.png')
    print('icons:', ', '.join(str(p.relative_to(ROOT)) for p in [out / 'icon.png', out / 'icon.ico', out / 'icon.icns', ROOT / 'public' / 'favicon.png']))


if __name__ == '__main__':
    main()
