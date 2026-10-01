# The teaser

`docs/media/teaser.gif` (the top of the README) and `docs/media/teaser.mp4` (the release page): 15 s of real game
footage, the pack opening, and title / caption / end cards in the game's own fonts and colours. It loops: the end card
cuts back to the title card.

Needs Node (this checkout's `npm install`, Playwright's Chromium), Python with Pillow and numpy, ffmpeg, and a pokeshell
checkout next to this one (`..\pokeshell`: its card data, read-only; `binder.exe` for the pack demo's card faces). The
battle sprites and arena paintings must be in `public\` (install.ps1, or copied from another checkout). Nothing is
written to any pokeshell or arena state: the fights get a stand-in collection through Playwright, and the pack clip
runs the pack demo server (`scripts/packs-demo.mjs`) on its own port with its stand-in host.

```powershell
node tools\teaser\capture.mjs        # the clips -> shots\teaser\raw\<clip>.mp4 + .events.json + .cam.json (~12 min)
node tools\teaser\layers.mjs         # the motion-graphics layers -> shots\teaser\layers\*.png
python tools\teaser\compose.py --sheet shots\teaser\sheet.png              # a contact sheet, every 0.5 s
python tools\teaser\compose.py                                             # the 1920x1080 50 fps master
python tools\teaser\compose.py --scale 0.41667 --stable 14 --out shots\teaser\gif-base.mp4  # 800x450, for the GIF
powershell -NoProfile -ExecutionPolicy Bypass -File tools\teaser\export.ps1 # docs\media\teaser.gif + teaser.mp4
```

- **capture.mjs** directs bot-vs-bot team matches beat by beat (who stands where, who runs where, which attack is pressed, the runner
  rolling out of a shot, a swap, an evolve, a KO): every move is the real sim and the real renderer. The page's clock
  runs 4x slower while the DevTools screencast records, so the 1080p frames come out at about 60 fps of game time.
  `--only duel-fire,pack` re-records some clips; `--probe` lists each clip's kits and attacks.
- **compose.py** holds the shot list (`SHOTS`: clip, start, length, speed, zoom, caption). A fight shot crops 800x450
  of the game around the two fighters, so the GIF (800x450, 20 fps, about 10 MB) shows the game's own pixels and the
  master blows them up by nearest neighbour. `--stable` holds the pixels the screencast's JPEG noise would flicker,
  which keeps the GIF's frames small.
- Everything under `shots\teaser\` is gitignored; `shots\teaser\master.mp4` is the high-res master.
