"""Crop the work view (look.py, full image) to tile rect c0 r0 c1 r1 (inclusive), scaled 2x: python zoom.py <id> c0 r0 c1 r1"""
import sys
from pathlib import Path
from PIL import Image
d = Path(__file__).resolve().parents[2] / "shots" / "colliders" / "look"
aid, c0, r0, c1, r1 = sys.argv[1], *map(int, sys.argv[2:6])
top, bot = Image.open(d / f"{aid}-top.png"), Image.open(d / f"{aid}-bot.png")
full = Image.new("RGB", (1920, 1080)); full.paste(top, (0, 0)); full.paste(bot.crop((0, 120, 1920, 600)), (0, 600))
im = full.crop((c0 * 40, r0 * 40, (c1 + 1) * 40, (r1 + 1) * 40))
im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
im.save(d / f"{aid}-z.png"); print(im.size)
