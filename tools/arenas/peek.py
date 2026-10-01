"""quick grid of one file per arena (default scene.png): peek.py out.jpg [name] [width]"""
import sys

from PIL import Image, ImageDraw

from common import WORK, arenas

out = sys.argv[1]
name = sys.argv[2] if len(sys.argv) > 2 else "scene.png"
cw = int(sys.argv[3]) if len(sys.argv) > 3 else 400
ids = [a for a in arenas() if (WORK / a / name).exists()]
ims = []
for aid in ids:
    im = Image.open(WORK / aid / name).convert("RGB")
    im = im.resize((cw, int(im.height * cw / im.width)))
    ImageDraw.Draw(im).text((4, 4), aid, fill=(255, 255, 0))
    ims.append(im)
ch = max(i.height for i in ims)
sheet = Image.new("RGB", (cw * 3, ch * ((len(ims) + 2) // 3)))
for i, im in enumerate(ims):
    sheet.paste(im, ((i % 3) * cw, (i // 3) * ch))
sheet.save(out, quality=85)
