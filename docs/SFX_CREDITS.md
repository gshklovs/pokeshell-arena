# Pack-opening sound effects: sources and licences

The recorded sounds of the pack opening and the set roll live in `public/sfx/packs/` (about 640 KB for both formats, so they're
committed). Each sound is there twice: `<name>.ogg` (Ogg Opus, 48 kbps mono) and `<name>.mp3` (64 kbps mono), the
MP3 for browsers that can't play Ogg Opus. `tools/sfx/build_pack_sfx.py` rebuilds every file from the sources below.
It downloads them into `.cache/sfx/`, which is gitignored.

**Every source is CC0 1.0 (public domain dedication).** CC0 needs no attribution and no licence text. The
credits are here because they're owed, not because the licence asks for them. Nothing here is under CC-BY, CC-BY-NC or a
"personal use only" licence, and nothing comes from a Pokémon game or app.

- **Kenney.nl** packs: "License (Creative Commons Zero, CC0) http://creativecommons.org/publicdomain/zero/1.0/ You
  may use these assets in personal and commercial projects. Credit (Kenney or www.kenney.nl) would be nice but is not
  mandatory." (the `License.txt` in each pack)
- **Freesound.org** sounds, each one's licence checked on its own page ("Creative Commons 0",
  https://creativecommons.org/publicdomain/zero/1.0/). They come from Freesound's public HQ previews (128 kbps MP3),
  which need no login and no API key.

The CC0 1.0 legal code: https://creativecommons.org/publicdomain/zero/1.0/legalcode

## Common edits

Every file gets the same treatment:
- mixed to mono and resampled to 48 kHz;
- trimmed to the times given (seconds into the source);
- faded in and out with a raised cosine, and some get a gentle high-pass to take out handling rumble;
- loudness-matched: the RMS of the loud part (within 30 dB of the loudest 10 ms) is set to -18 dBFS and the peak
  is capped at -1 dBFS;
- metadata stripped, then encoded to Opus and MP3.

**Grain sprites** (`crinkle`, `riffle`, `ratchet`): the build finds the strongest transients (5 ms RMS onsets of the
high-passed signal, at least 70 ms apart). It cuts a short grain at each one, peak-normalises it to -1 dBFS, and
puts each grain at the start of its own 100 ms slot. The player picks a random slot (never the same one twice in a
row) at a random pitch, so the tear is built from many real crinkles and still follows the drag.

## The files

| file | what it's for | source | author | licence | edits |
|---|---|---|---|---|---|
| `crinkle` | tear: crinkle grains, the rate and loudness follow the drag | [Snack chip bag crinkle sounds](https://freesound.org/people/DrDufus/sounds/550405/), [Wrapper crinkle; close](https://freesound.org/people/cfedorek16/sounds/660563/), [tinfoil 05](https://freesound.org/people/Anthousai/sounds/337524/), [wrapper](https://freesound.org/people/TOMRORYPARSONS/sounds/676822/) | DrDufus, cfedorek16, Anthousai, TOMRORYPARSONS | CC0 | 24 grains, 6 from each source, 60 ms each (1.5 kHz high-pass for onset finding) |
| `riffle` | fan-out ticks, a shaken card's rattle | Kenney Casino Audio `card-shuffle`, `card-fan-1`, `card-fan-2` ([pack](https://kenney.nl/assets/casino-audio)) | Kenney | CC0 | 12 grains (6 + 3 + 3), 50 ms each |
| `rip-1` | the strip tearing off | Kenney Casino Audio `cards-pack-open-1` | Kenney | CC0 | 0.20-0.90, 120 Hz high-pass |
| `rip-2` | the strip tearing off (variation) | Kenney Casino Audio `cards-pack-open-2` | Kenney | CC0 | 0.00-0.66, 120 Hz high-pass |
| `rip-3` | the strip tearing off (variation) | [SFX_STICKERRIPPER_candyWrapper_47](https://freesound.org/people/MrFossy/sounds/590222/) | MrFossy | CC0 | 0.08-0.50, 150 Hz high-pass |
| `rip-foil` | a foil boom layered under the rip of big packs | [SFX_STICKERRIPPER_foilBooms_04](https://freesound.org/people/MrFossy/sounds/590363/) | MrFossy | CC0 | 0.02-0.80, 200 ms fade-out |
| `stack-1` | the stack sliding out of the pack | Kenney Casino Audio `cards-pack-take-out-1` | Kenney | CC0 | 0.00-0.48 |
| `stack-2` | the stack sliding out (variation) | Kenney Casino Audio `cards-pack-take-out-2` | Kenney | CC0 | 0.00-0.60 |
| `fan` | the fan closing back into a stack | Kenney Casino Audio `card-fan-2` | Kenney | CC0 | 0.10-1.12 (played from 0.55 s, to the snap) |
| `shove-1` | a card flung off the table | Kenney Casino Audio `card-shove-1` | Kenney | CC0 | 0.00-0.55 |
| `shove-2` | a card flung off (variation) | Kenney Casino Audio `card-shove-2` | Kenney | CC0 | 0.00-0.55 |
| `shove-3` | a card flung off (variation) | Kenney Casino Audio `card-shove-3` | Kenney | CC0 | 0.00-0.55 |
| `swish` | the air of the fling | [Swish wipe HZA 16-05-2022](https://freesound.org/people/hz37/sounds/667419/) | hz37 | CC0 | 0.00-0.44 |
| `snap-1` | the flip: a card snap | Kenney Casino Audio `card-slide-1` | Kenney | CC0 | 10 ms before the onset to 240 ms after it |
| `snap-2` | the flip (variation) | Kenney Casino Audio `card-slide-2` | Kenney | CC0 | as above |
| `snap-3` | the flip (variation) | Kenney Casino Audio `card-slide-4` | Kenney | CC0 | as above |
| `snap-4` | the flip (variation) | Kenney Casino Audio `card-slide-5` | Kenney | CC0 | as above |
| `thump-1` | a face-down hit's heartbeat, the body of the rip | Kenney Impact Sounds `impactSoft_heavy_000` ([pack](https://kenney.nl/assets/impact-sounds)) | Kenney | CC0 | 0.00-0.45 |
| `thump-2` | heartbeat (variation) | Kenney Impact Sounds `impactSoft_heavy_001` | Kenney | CC0 | 0.00-0.45 |
| `thump-3` | heartbeat (variation) | Kenney Impact Sounds `impactSoft_heavy_002` | Kenney | CC0 | 0.00-0.45 |
| `riser` | the hold-to-reveal charge | [magic riser](https://freesound.org/people/stuniverso/sounds/761564/) | stuniverso | CC0 | 0.05-1.90, 20 ms fade-in, 400 ms fade-out, -20 dBFS RMS |
| `magic-pop` | the radiant and rainbow reveals | [magic riser and a pop](https://freesound.org/people/stuniverso/sounds/761563/) | stuniverso | CC0 | 1.42-2.42 (the pop and its tail) |
| `musicbox` | the tuned note: the flip's pentatonic climb and every stinger chord | [Hand Crank Music Box [G5 Note]](https://freesound.org/people/moodyfingers/sounds/732943/) | moodyfingers | CC0 | 0.12-1.90, 600 ms fade-out; measured at 796.6 Hz, pitched per note |
| `glock` | shimmer notes over the rarer reveals | [Glock-G4](https://freesound.org/people/hollandm/sounds/693357/) | hollandm | CC0 | 0.00-1.10; measured at 3137.8 Hz, pitched per note |
| `sparkle-1` | holo, full-art, alt-art sparkle | [Sparkling Star 01](https://freesound.org/people/LilMati/sounds/462095/) | LilMati | CC0 | 0.00-2.00, 600 ms fade-out |
| `sparkle-2` | radiant, shiny, rainbow, gold, the rare pack | [Sparkling Star 04](https://freesound.org/people/LilMati/sounds/462092/) | LilMati | CC0 | 0.00-2.80, 900 ms fade-out |
| `wink` | reverse holo, the shiny roll | [cartoon_wink_magic_sparkle](https://freesound.org/people/MLaudio/sounds/511485/) | MLaudio | CC0 | 0.00-0.60 |
| `boom` | the gold (big hit) impact | [Sound Design Elements Impact SFX PS 012](https://freesound.org/people/AudioPapkin/sounds/751843/) | AudioPapkin | CC0 | 0.12-2.30, 800 ms fade-out, -16 dBFS RMS |
| `brass` | the gold reveal's triumphant stinger | [WinBrass](https://freesound.org/people/Fupicat/sounds/521639/) | Fupicat | CC0 | 0.00-2.15 |
| `fanfare` | a rare pack announcing itself | [Fanfare 4 - Rpg](https://freesound.org/people/colorsCrimsonTears/sounds/609028/) | colorsCrimsonTears | CC0 | 0.00-3.05, 500 ms fade-out |
| `sticker` | the NEW! sticker slapping on | [SFX_STICKERRIPPER_thumb_08](https://freesound.org/people/MrFossy/sounds/590432/) | MrFossy | CC0 | 0.04-0.34 |
| `blip` | the NEW! sticker's bright blip | Kenney Interface Sounds `confirmation_003` ([pack](https://kenney.nl/assets/interface-sounds)) | Kenney | CC0 | 0.00-0.30, -20 dBFS RMS |
| `jingle` | the summary | Kenney Music Jingles `jingles_STEEL03` ([pack](https://kenney.nl/assets/music-jingles)) | Kenney | CC0 | 0.00-1.39 |
| `ratchet` | the set roll: a ratchet click per tile (`roll:tick`), pitch and level rising with the reel's speed | [Wheel Spin Click Slow Down](https://freesound.org/people/pooky1/sounds/398235/), [Wheel Spin Click Slow Down Fast](https://freesound.org/people/pooky1/sounds/398236/) | pooky1 | CC0 | 12 grains (8 + 4), 50 ms each (1 kHz high-pass for onset finding) |
| `whirr` | the reel launching (`roll:start`), played rising 0.85x to 1.25x | [Old fishing reel fast rewinding fishing line](https://freesound.org/people/AudioPapkin/sounds/716635/) | AudioPapkin | CC0 | 0.00-0.80, 150 ms fade-in, 300 ms fade-out, 200 Hz high-pass, -20 dBFS RMS |
| `clunk` | the result locking in (`roll:lock`) | [opening click clunk](https://freesound.org/people/Ambiabstract/sounds/584215/) | Ambiabstract | CC0 | 0.00-0.30 |
| `shimmer` | the gold tease of a vintage landing (`roll:tease`) | [Fashion Shimmer - Luxury Runway Percussion Stinger](https://freesound.org/people/LilMati/sounds/714565/) | LilMati | CC0 | 0.18-2.20, 600 ms fade-out |
| `thunk` | the reel stopping (`roll:land`) | Kenney Impact Sounds `impactWood_heavy_000` | Kenney | CC0 | 0.00-0.45 |
| `ding` | the chime on the landing (`roll:land`), brighter for a vintage pack | [SingleDing](https://freesound.org/people/NoisyRedFox/sounds/759839/) | NoisyRedFox | CC0 | 0.00-0.60 |
| `vintage` | the vintage fanfare (`roll:fanfare`; the scene's rare-pack fanfare stands down for it) | [Triumphant Trumpet and Chimes](https://freesound.org/people/JellyDaisies/sounds/578853/) | JellyDaisies | CC0 | 0.08-3.30, 800 ms fade-out |
| `zip` | the player grabbing the pack mid-roll (`roll:interrupt`) | [Zipper Fast Pull 01](https://freesound.org/people/Rudmer_Rotteveel/sounds/536235/) | Rudmer_Rotteveel | CC0 | 0.00-0.50 |

Still synthesised, on purpose: the low **drone** under the idle, tear and summary. It's a bed rather than an effect
and it has to hold for as long as the player takes. Every sound in the table also keeps its original synthesised
version as the fallback (`src/packs/audio.ts`).
