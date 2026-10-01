"""Build the pack-opening sound effects in public/sfx/packs/ from their CC0 sources (docs/SFX_CREDITS.md).

    python tools/sfx/build_pack_sfx.py            # downloads into .cache/sfx/, writes public/sfx/packs/*.ogg + *.mp3

Needs ffmpeg on PATH and numpy + soundfile (use a venv: python -m venv .cache/sfx/venv, then pip install numpy soundfile).
Every source is CC0 (Kenney.nl packs, Freesound sounds filtered to Creative Commons 0; each Freesound licence was
checked on the sound's own page). Freesound sounds come from their public HQ previews (no login, no API key).

Each output is mono, trimmed, faded, loudness-matched (the RMS of its loud part to -18 dBFS, peaks capped at -1 dBFS)
and encoded twice: Ogg Opus (48 kbps) and an MP3 fallback (64 kbps) for browsers without Ogg Opus.

The three "sprites" (crinkle, riffle, ratchet) are many short grains cut at the transients of real recordings, each placed at
the start of its own 100 ms slot, so the player picks slot i with start(t, i * 0.1, 0.1): src/packs/samples.ts keeps
GRAIN_SLOT and the grain counts in step with this file.
"""
from __future__ import annotations

import io
import os
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache' / 'sfx'
OUT = ROOT / 'public' / 'sfx' / 'packs'
SR = 48000
SLOT = 0.1          # grain slot length in the sprites (samples.ts GRAIN_SLOT)
UA = {'User-Agent': 'Mozilla/5.0 (pokeshell-arena sfx build)'}

FREESOUND = {  # id: hq preview (the sound page is https://freesound.org/s/<id>/)
    '550405': 'https://cdn.freesound.org/previews/550/550405_4474247-hq.mp3',   # DrDufus, Snack chip bag crinkle sounds
    '660563': 'https://cdn.freesound.org/previews/660/660563_14333353-hq.mp3',  # cfedorek16, Wrapper crinkle; close
    '337524': 'https://cdn.freesound.org/previews/337/337524_5923045-hq.mp3',   # Anthousai, tinfoil 05
    '676822': 'https://cdn.freesound.org/previews/676/676822_4793892-hq.mp3',   # TOMRORYPARSONS, wrapper
    '590222': 'https://cdn.freesound.org/previews/590/590222_129727-hq.mp3',    # MrFossy, candyWrapper_47
    '590363': 'https://cdn.freesound.org/previews/590/590363_129727-hq.mp3',    # MrFossy, foilBooms_04
    '590432': 'https://cdn.freesound.org/previews/590/590432_129727-hq.mp3',    # MrFossy, thumb_08 (sticker)
    '667419': 'https://cdn.freesound.org/previews/667/667419_123355-hq.mp3',    # hz37, Swish wipe
    '761564': 'https://cdn.freesound.org/previews/761/761564_16036556-hq.mp3',  # stuniverso, magic riser
    '761563': 'https://cdn.freesound.org/previews/761/761563_16036556-hq.mp3',  # stuniverso, magic riser and a pop
    '732943': 'https://cdn.freesound.org/previews/732/732943_15504031-hq.mp3',  # moodyfingers, Hand Crank Music Box G5
    '693357': 'https://cdn.freesound.org/previews/693/693357_5309408-hq.mp3',  # hollandm, Glock-G4
    '462095': 'https://cdn.freesound.org/previews/462/462095_6142149-hq.mp3',   # LilMati, Sparkling Star 01
    '462092': 'https://cdn.freesound.org/previews/462/462092_6142149-hq.mp3',   # LilMati, Sparkling Star 04
    '511485': 'https://cdn.freesound.org/previews/511/511485_6890478-hq.mp3',   # MLaudio, cartoon_wink_magic_sparkle
    '751843': 'https://cdn.freesound.org/previews/751/751843_8698658-hq.mp3',   # AudioPapkin, Impact SFX PS 012
    '609028': 'https://cdn.freesound.org/previews/609/609028_11785387-hq.mp3',  # colorsCrimsonTears, Fanfare 4 - Rpg
    '521639': 'https://cdn.freesound.org/previews/521/521639_7724198-hq.mp3',   # Fupicat, WinBrass
    # the set roll (src/packs/roll)
    '398235': 'https://cdn.freesound.org/previews/398/398235_2339776-hq.mp3',   # pooky1, Wheel Spin Click Slow Down
    '398236': 'https://cdn.freesound.org/previews/398/398236_2339776-hq.mp3',   # pooky1, Wheel Spin Click Slow Down Fast
    '716635': 'https://cdn.freesound.org/previews/716/716635_8698658-hq.mp3',   # AudioPapkin, Old fishing reel fast rewinding
    '584215': 'https://cdn.freesound.org/previews/584/584215_5099915-hq.mp3',   # Ambiabstract, opening click clunk
    '714565': 'https://cdn.freesound.org/previews/714/714565_6142149-hq.mp3',   # LilMati, Fashion Shimmer stinger
    '578853': 'https://cdn.freesound.org/previews/578/578853_11794886-hq.mp3',  # JellyDaisies, Triumphant Trumpet and Chimes
    '536235': 'https://cdn.freesound.org/previews/536/536235_4921277-hq.mp3',   # Rudmer_Rotteveel, Zipper Fast Pull 01
    '759839': 'https://cdn.freesound.org/previews/759/759839_14357801-hq.mp3',  # NoisyRedFox, SingleDing
}

KENNEY = {  # pack: zip (CC0, https://kenney.nl/assets/<pack>)
    'casino-audio': 'https://kenney.nl/media/pages/assets/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip',
    'impact-sounds': 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
    'interface-sounds': 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip',
    'music-jingles': 'https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip',
}


# ------------------------------------------------------------------------------------------------ sources
def fetch(url: str, dest: Path) -> Path:
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f'  get {url}')
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r:
            dest.write_bytes(r.read())
    return dest


def decode(path: Path) -> np.ndarray:
    """any audio file -> mono float32 at SR, through ffmpeg"""
    p = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', str(path), '-ac', '1', '-ar', str(SR), '-f', 'wav', '-'],
                       capture_output=True, check=True)
    x, _ = sf.read(io.BytesIO(p.stdout), dtype='float32')
    return x


_cache: dict[str, np.ndarray] = {}


def src(key: str) -> np.ndarray:
    """'fs:<id>' (a Freesound preview) or 'k:<pack>/<file stem>' (a sound inside a Kenney pack)"""
    if key in _cache:
        return _cache[key]
    kind, name = key.split(':', 1)
    if kind == 'fs':
        path = fetch(FREESOUND[name], CACHE / 'freesound' / f'{name}.mp3')
    else:
        pack, stem = name.split('/', 1)
        z = fetch(KENNEY[pack], CACHE / 'kenney' / f'{pack}.zip')
        with zipfile.ZipFile(z) as zf:
            member = next(m for m in zf.namelist() if m.endswith(f'/{stem}.ogg'))
            path = CACHE / 'kenney' / pack / f'{stem}.ogg'
            if not path.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(zf.read(member))
    _cache[key] = decode(path)
    return _cache[key]


# ------------------------------------------------------------------------------------------------ edits
def trim(x: np.ndarray, a: float, b: float | None = None) -> np.ndarray:
    return x[int(a * SR): None if b is None else int(b * SR)].copy()


def fade(x: np.ndarray, fin: float = 0.004, fout: float = 0.03) -> np.ndarray:
    n_in, n_out = min(len(x), int(fin * SR)), min(len(x), int(fout * SR))
    if n_in:
        x[:n_in] *= np.linspace(0, 1, n_in) ** 2
    if n_out:
        x[-n_out:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, n_out)))
    return x


def highpass(x: np.ndarray, hz: float) -> np.ndarray:
    """a gentle one-pole high-pass: rumble out of hand-held recordings"""
    a = np.exp(-2 * np.pi * hz / SR)
    y = np.empty_like(x)
    prev_x = prev_y = 0.0
    for i, v in enumerate(x):  # small clips: a plain loop is fine
        prev_y = a * (prev_y + v - prev_x)
        prev_x = v
        y[i] = prev_y
    return y


def loudness(x: np.ndarray, rms_db: float = -18.0, peak_db: float = -1.0) -> np.ndarray:
    """the RMS of the loud frames (within 30 dB of the loudest) to rms_db, the peak capped at peak_db"""
    h = int(0.01 * SR)
    fr = max(1, len(x) // h)
    rms = np.sqrt((x[: fr * h].reshape(fr, h) ** 2).mean(1) + 1e-12)
    loud = rms[rms > rms.max() * 10 ** (-30 / 20)]
    g = 10 ** (rms_db / 20) / float(np.sqrt((loud ** 2).mean()))
    g = min(g, 10 ** (peak_db / 20) / (np.abs(x).max() + 1e-9))
    return (x * g).astype(np.float32)


def grains(x: np.ndarray, n: int, length: float, pre: float = 0.004, gap: float = 0.07, hp: float = 1500) -> list[np.ndarray]:
    """cut n grains at the n strongest transients (5 ms RMS peaks of the high-passed signal, >= gap apart)"""
    y = highpass(x, hp)
    h = int(0.005 * SR)
    fr = len(y) // h
    env = np.sqrt((y[: fr * h].reshape(fr, h) ** 2).mean(1))
    # onset strength: the rise over the previous 20 ms
    rise = env - np.concatenate([np.full(4, env[0]), env[:-4]])
    order = np.argsort(rise)[::-1]
    picked: list[int] = []
    for k in order:
        if all(abs(k - p) * 0.005 >= gap for p in picked) and k * h / SR > pre and (k * h / SR + length) < len(x) / SR:
            picked.append(int(k))
        if len(picked) == n:
            break
    out = []
    for k in sorted(picked):
        s = int(k * h - pre * SR)
        g = x[s: s + int(length * SR)].copy()
        g = fade(g, 0.002, length * 0.55)
        out.append(g / (np.abs(g).max() + 1e-9) * 0.89)
    return out


def sprite(parts: list[np.ndarray]) -> np.ndarray:
    slot = int(SLOT * SR)
    buf = np.zeros(slot * len(parts), dtype=np.float32)
    for i, g in enumerate(parts):
        g = g[:slot]
        buf[i * slot: i * slot + len(g)] = g
    return buf


# ------------------------------------------------------------------------------------------------ the set
def clip(key: str, a: float, b: float | None = None, fin: float = 0.004, fout: float = 0.05, hp: float = 0,
         rms_db: float = -18.0) -> np.ndarray:
    x = trim(src(key), a, b)
    if hp:
        x = highpass(x, hp)
    return loudness(fade(x, fin, fout), rms_db)


def build() -> dict[str, np.ndarray]:
    s: dict[str, np.ndarray] = {}
    # the tear: foil and wrapper crinkle grains, 24 of them from four recordings (6 each)
    crinkle = []
    for key in ('fs:550405', 'fs:660563', 'fs:337524', 'fs:676822'):
        crinkle += grains(src(key), 6, 0.06)
    s['crinkle'] = sprite(crinkle)
    # card riffle grains for the fan and a shaken card: 12 from Kenney's card shuffle and fans
    riffle = grains(src('k:casino-audio/card-shuffle'), 6, 0.05, gap=0.12, hp=800)
    riffle += grains(src('k:casino-audio/card-fan-1'), 3, 0.05, gap=0.08, hp=800)
    riffle += grains(src('k:casino-audio/card-fan-2'), 3, 0.05, gap=0.08, hp=800)
    s['riffle'] = sprite(riffle)
    # the rip: a real card-pack opening (x2), a candy wrapper, and a foil boom to layer under big packs
    s['rip-1'] = clip('k:casino-audio/cards-pack-open-1', 0.20, 0.90, hp=120)
    s['rip-2'] = clip('k:casino-audio/cards-pack-open-2', 0.0, 0.66, hp=120)
    s['rip-3'] = clip('fs:590222', 0.08, 0.50, hp=150)
    s['rip-foil'] = clip('fs:590363', 0.02, 0.80, fout=0.2)
    # the stack sliding out of the pack, the fan closing, a card flung off
    s['stack-1'] = clip('k:casino-audio/cards-pack-take-out-1', 0.0, 0.48)
    s['stack-2'] = clip('k:casino-audio/cards-pack-take-out-2', 0.0, 0.60)
    s['fan'] = clip('k:casino-audio/card-fan-2', 0.10, 1.12, fout=0.12)
    s['shove-1'] = clip('k:casino-audio/card-shove-1', 0.0, 0.55, fout=0.2)
    s['shove-2'] = clip('k:casino-audio/card-shove-2', 0.0, 0.55, fout=0.2)
    s['shove-3'] = clip('k:casino-audio/card-shove-3', 0.0, 0.55, fout=0.2)
    s['swish'] = clip('fs:667419', 0.0, 0.44, fout=0.1)
    # the flip: card snaps (Kenney card slides), one per flip, round robin
    for i, k in enumerate(('card-slide-1', 'card-slide-2', 'card-slide-4', 'card-slide-5'), 1):
        x = src(f'k:casino-audio/{k}')
        on = int(np.argmax(np.abs(x) > 0.05))
        s[f'snap-{i}'] = clip(f'k:casino-audio/{k}', max(0.0, on / SR - 0.01), on / SR + 0.24, fout=0.12)
    # the face-down heartbeat: soft heavy impacts
    for i in range(3):
        s[f'thump-{i + 1}'] = clip(f'k:impact-sounds/impactSoft_heavy_00{i}', 0.0, 0.45, fout=0.2)
    # the hold-to-reveal riser, and the pop at the end of the second riser
    s['riser'] = clip('fs:761564', 0.05, 1.90, fin=0.02, fout=0.4, rms_db=-20)
    s['magic-pop'] = clip('fs:761563', 1.42, 2.42, fin=0.004, fout=0.4)
    # tuned notes: a music box (about G5) and a glockenspiel (G7), pitched to the pentatonic climb and the chords
    s['musicbox'] = clip('fs:732943', 0.12, 1.90, fin=0.002, fout=0.6)
    s['glock'] = clip('fs:693357', 0.0, 1.10, fin=0.001, fout=0.5)
    # sparkles
    s['sparkle-1'] = clip('fs:462095', 0.0, 2.0, fin=0.002, fout=0.6)
    s['sparkle-2'] = clip('fs:462092', 0.0, 2.8, fin=0.002, fout=0.9)
    s['wink'] = clip('fs:511485', 0.0, 0.60, fin=0.002, fout=0.25)
    # the big hits: a boom, a brass win stinger, an RPG fanfare
    s['boom'] = clip('fs:751843', 0.12, 2.30, fin=0.002, fout=0.8, rms_db=-16)
    s['brass'] = clip('fs:521639', 0.0, 2.15, fin=0.002, fout=0.2)
    s['fanfare'] = clip('fs:609028', 0.0, 3.05, fin=0.002, fout=0.5)
    # the NEW! sticker slap and its blip, the summary jingle
    s['sticker'] = clip('fs:590432', 0.04, 0.34, fin=0.001, fout=0.12)
    s['blip'] = clip('k:interface-sounds/confirmation_003', 0.0, 0.30, fin=0.001, fout=0.1, rms_db=-20)
    s['jingle'] = clip('k:music-jingles/jingles_STEEL03', 0.0, 1.39, fin=0.002, fout=0.25)
    # the set roll: prize-wheel ratchet clicks (12 grains), a reel whirr, the clutch clunk, a gold shimmer,
    # the landing thunk and ding, the vintage fanfare, a zip for the interrupt
    ratchet = grains(src('fs:398235'), 8, 0.05, gap=0.1, hp=1000)
    ratchet += grains(src('fs:398236'), 4, 0.05, gap=0.08, hp=1000)
    s['ratchet'] = sprite(ratchet)
    s['whirr'] = clip('fs:716635', 0.0, 0.80, fin=0.15, fout=0.3, hp=200, rms_db=-20)
    s['clunk'] = clip('fs:584215', 0.0, 0.30, fin=0.001, fout=0.15)
    s['shimmer'] = clip('fs:714565', 0.18, 2.20, fin=0.01, fout=0.6)
    s['thunk'] = clip('k:impact-sounds/impactWood_heavy_000', 0.0, 0.45, fin=0.001, fout=0.2)
    s['ding'] = clip('fs:759839', 0.0, 0.60, fin=0.001, fout=0.25)
    s['vintage'] = clip('fs:578853', 0.08, 3.30, fin=0.005, fout=0.8)
    s['zip'] = clip('fs:536235', 0.0, 0.50, fin=0.004, fout=0.12)
    return s


def encode(name: str, x: np.ndarray) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    wav = CACHE / 'out' / f'{name}.wav'
    wav.parent.mkdir(parents=True, exist_ok=True)
    sf.write(wav, x, SR, subtype='PCM_16')
    common = ['ffmpeg', '-loglevel', 'error', '-y', '-i', str(wav), '-map_metadata', '-1', '-ac', '1']
    subprocess.run(common + ['-c:a', 'libopus', '-b:a', '48k', '-vbr', 'on', str(OUT / f'{name}.ogg')], check=True)
    subprocess.run(common + ['-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '64k', str(OUT / f'{name}.mp3')], check=True)


def main() -> None:
    os.chdir(ROOT)
    sounds = build()
    total = 0
    for name, x in sounds.items():
        encode(name, x)
        size = (OUT / f'{name}.ogg').stat().st_size + (OUT / f'{name}.mp3').stat().st_size
        total += size
        print(f'{name:10s} {len(x) / SR:5.2f}s  {size / 1024:6.1f} KB (ogg + mp3)')
    print(f'total {total / 1024:.0f} KB in {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    sys.exit(main())
