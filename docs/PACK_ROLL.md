# Rolling a pack

What you see between spending a token and holding the pack you'll tear: the set roll. pokeshell rolls the set by its
sealed pack's price (`pokeshell pack open random --json`, pokeshell's docs/BOOSTERS.md) in about a second; this is how
that second (or three, on a slow host) looks. The code is `src/packs/roll/`, one call:

```ts
import { playRoll } from './packs/roll';
const roll = playRoll(sceneRoot, { sets, result: hostCall.then(toRolled), sound: (e, d) => audio.roll(e, d) });
await roll.settled;   // { set, interrupted, ms }: the reel has landed (or the player grabbed the pack)
```

## The rule it is built around

**No waiting.** The player can start tearing the pack the instant it appears, and the roll never holds the tear. Every
choice below follows from that:

- the reel is a picture *over* the live pack scene, never a modal step before it. It has `pointer-events: none`; the
  scene underneath takes every touch as it does today;
- any touch on the scene (except the HUD's buttons), any key, or the scene leaving `idle` (autoplay, Skip, the
  reduced-motion Open button) **interrupts** the roll. An interrupt is synchronous: `settled` resolves in the same
  tick, the strip snaps and fades in 0.11 s while the tear is already following the finger;
- the host call runs from the first frame. The reel only decides *where it will stop* when the result is there.

## Choosing the metaphor

| idea | for | against | verdict |
|---|---|---|---|
| **a strip of the real wrappers scrolling under a marker (slot reel / case opening)** | shows the whole draw: every set's own wrapper, as often as it really comes up; deceleration is the readable "it's about to stop" beat; elastic by nature (it can scroll as long as it has to) | must stay honest about near misses | **chosen**: v1 as a coverflow reel with a ratchet pointer, v2 (now) as a CS:GO-style case-opening strip |
| card-shop shelf, a hand or claw picks | charming, physical | the claw's travel is fixed-length theatre: it can't absorb a 3 s host or collapse to nothing in one frame without looking broken; says nothing about odds | no |
| gacha capsule | a great "pop" moment | the capsule hides the pack, so the pack you tear appears *after* it opens; nothing to show while waiting but wobble | no |
| pack-fan shuffle, one rises | close to real life | only ever shows a handful of packs, so it can't show honest frequencies | no |

The strip wins on the three hard constraints at once: it is **elastic** (it scrolls for as long as the host takes
and settles in 0.4 s once the answer is in), **interruptible** without looking wrong (a strip that snaps to its
landing reads as "stopped early"), and **honest** in a way the others can't be: it is a sample of the real draw, so
you watch Brilliant Stars go by five times for every Evolving Skies and a Base Set glint past about once in sixty.

### v2, after playing v1

The player's feedback on v1: the gold flapper looked like a wheel stopper; they wanted it "more like the CS:GO box
opening, where the arrow is fixed", with a background aura per pack by rarity, a slowdown before the landing for
suspense, and half the time overall. v2 is exactly that:

| | v1 | v2 |
|---|---|---|
| pointer | a gold flapper knocked by each tile, springing back | a **fixed** glowing centre line with a notch at each end; never moves or wobbles |
| layout | coverflow: centre tile at the pack's size, neighbours at 62 %, dimmed | a flat strip: every wrapper at 56 % of the pack on its **rarity plate**, evenly spaced |
| rarity | a faint gold glint on vintage tiles only | every plate coloured by how rare the pack is to roll (below) |
| settle | matched the cruise speed (k 2-4), then a notch bounce | a steep ease-out (k 4, vintage 5.5): a rush, then the last tile crawls under the marker; stops anywhere inside the rolled wrapper, no bounce |
| landing | the centre tile dissolved into the pack | the landed wrapper grows from its slot into the pack's box, then dissolves into the real pack |
| time | see below | half, end to end |

## What it looks like

```
                       v  (fixed marker)
   +--+ +--+ +--+ +--+ |+--+ +--+ +--+       <- a dark window, fading at both ends
   |  | |  | |  | |  | ||  | |  | |  |          each wrapper on a plate in its rarity's colour,
   |  | |  | |  | |  | ||  | |  | |  |          a rarity bar along the plate's foot
   +==+ +==+ +==+ +==+ |+==+ +==+ +==+
                       ^
```

- **The strip.** The openable sets' wrappers, each drawn from the *same* generator as the pack (`wrapperSVG`, our
  own art: set colours, motif, title, our hero card image in the window) and rasterised once per set. Tile *i* is a
  weighted draw from the sets' `chance`, from a seeded hash of *i*: infinite, deterministic for a seed, and
  **visually honest**. Tile 0 is the mystery wrapper, so the strip starts on the pack the scene opened with.
- **Rarity plates** (`rollTier(setOneIn)`, `TIER_COLOURS`), painted once per size at the device's resolution so
  their rims and bars are pixel-sharp: a deep gradient in the tier's colour with a clean elliptical aura behind the
  wrapper, a 1.5 px rim, a lit top edge and a rarity bar along the foot.

  | tier | setOneIn | sets today | plate |
  |---|---|---|---|
  | common | under 1 in 8 | Brilliant Stars, 30th Celebration, Lost Origin, Crown Zenith | cool blue |
  | mid | 1 in 8 to 30 | Evolving Skies, Hidden Fates | purple |
  | vintage | 1 in 30+ (`isRarePack`) | Base Set, Neo Genesis | gold to red, with fine gold flecks |
  | unknown | none (the mystery strip, a set with no price) | | grey |
- **The marker.** A 2 px warm-white line with a dark outline and a narrow glow, a gold notch at the top and the
  bottom. It is one cached bitmap drawn at the same place every frame: it never moves.
- **Speed.** It launches from rest to 22 tiles a second in 0.18 s (no pull-back). At speed each wrapper trails one
  faint ghost (a motion streak). Each tile edge crossing the marker fires a `roll:tick`: at most 22 a second.
- **"1 in N"** under each plate once the strip is slow enough to read it, in the tier's rim colour.

## The timeline (elastic)

```
 t=0 (scene opens, ~50 ms after the click)
  | launch 180 ms - cruise at 22 tiles/s ... (loops as long as the host takes)
  |                                   | result arrives (any time; ~1 s usually)
  |                                   v
  |                          lock: pick the landing tile L, 2.4 tiles ahead plus up to 0.3 (never on screen yet:
  |                          the window shows 2.2 tiles each side), and where on it to stop: L +- 0.3 (seeded)
  |                          settle: x(u) = x0 + D * (1 - (1 - u)^k), k = 4 (vintage 5.5), starting at or above
  |                                  the cruise speed; T = 0.4 s (vintage 0.68 s)
  |                          land: a flash on the wrapper; vintage: rays, sparks, the "1 in 61" slam
  |                          exit: 30 ms hold, then 170 ms: the plates and the window fade, the landed wrapper grows
  |                                into the pack's box and dissolves into the real pack (shown from 55 % of the exit)
  v
 any touch / key / scene leaves idle -> interrupt: snap to L if known, else vanish; settled resolves NOW
```

With k = 4 the strip covers about 80 % of the distance in the first third of the settle and spends the rest crawling
the last tile under the marker: that is the suspense. A vintage landing's k = 5.5 over 0.68 s crawls longer.

### Before and after (measured on the model: `src/packs/roll/roll.test.ts`, "takes at most half of v1")

| | v1 | v2 |
|---|---|---|
| host answers at once, common: reel gone | 1670 ms | 780 ms |
| host answers at once, vintage: reel gone | 2220 ms | 1060 ms |
| after a 1 s host, common: landing + exit after the answer | 1250 ms | 600 ms |
| after a 1 s host, vintage | 1800 ms | 880 ms |
| vintage rays / odds slam | 1.8 s / 2.3 s | 0.9 s / 1.15 s |

The host's own time (the loop) is the host's; everything the animation adds is halved.

## Anticipation, and honesty

- **The tease is only ever true, and subtle.** A locked vintage landing's plate pulses a little brighter as it
  comes in, and its settle crawls longer. A common landing never gets either. (Every vintage plate is gold whether
  or not you land on it: that is the tier, shown for every tile, not a tease.)
- **It stops on the rolled set, always.** The stop is anywhere within 0.3 of the tile's centre (a wrapper is 0.41
  wide each side), so it sometimes stops near an edge; the marker is always on the rolled wrapper. A test checks
  200 seeds.
- **No manufactured near misses.** The tiles next to the landing are ordinary draws; we never plant a Base Set one
  slot away from a common landing. (A vintage tile that happens to pass near the end is a real 1-in-61 draw.)
- **The strip is the distribution**, not decoration, and a test checks the shares over 20 000 tiles against the
  chances. The landing tile never changes identity on screen: it is chosen beyond the window's edge.

## Landing: rarity-scaled fanfare and "1 in N"

| outcome | on landing |
|---|---|
| common or mid | a short flash on the wrapper, the window fades, the wrapper grows into the pack; the scene's ribbon "Lost Origin pack! · 1 in 5.4" pops as the pack re-skins. `roll:land` |
| vintage (1 in 30+) | all of the above, plus gold rays behind the pack (0.9 s), a gold spark burst, and the **odds slam**: "1 in 61" in huge gold numerals over the pack with "Base Set · a vintage pack" under it (1.15 s). `roll:land` + `roll:fanfare` |

## Interrupting (grab it mid-spin)

The result was rolled server-side before the strip can land, so grabbing early loses nothing, it just resolves faster:

- **result known**: the strip jumps to the landing (the pack you'll get), the pack under your finger is shown at
  once, and the strip fades in 0.11 s. No slam; the scene's ribbon and re-skin still say which pack it was.
- **result not known yet**: the strip fades in 0.11 s and you're tearing the mystery pack: the tear follows you to
  92 % and holds until the pack arrives, and the wrapper re-skins in place when it does.
- a touch in the 0.2 s exit after a landing shows the real pack at once too.

## Sound events

The roll never makes a sound itself. It calls `opts.sound(event, detail)` (and dispatches a `pk-roll-sound`
CustomEvent on the container with `{ event, ...detail }`) so the pack synth (`src/packs/audio.ts`, branch pack-sfx)
can voice them:

| event | when | detail | suggested voice |
|---|---|---|---|
| `roll:start` | the reel launches | `{}` | a short rising whoosh (band-passed noise, 300 → 2 kHz, 0.4 s) |
| `roll:tick` | a tile edge crosses the fixed marker (at most 22/s) | `{ index, speed (0..1 of cruise), rare (the tile passing is vintage), gold (the landing is vintage and locked) }` | a ratchet click: 3-6 ms noise click + a 1.8-2.6 kHz blip, level and pitch with `speed`; `rare` adds a tiny bell partial; throttle to ~40/s |
| `roll:lock` | the result is in, the reel starts to settle | `{ set, oneIn, rare }` | a soft clutch "thunk" (80 Hz sine, 60 ms) |
| `roll:tease` | a vintage landing tile comes into view | `{ set, oneIn }` | a riser (sine + triangle gliding up an octave over the settle time) |
| `roll:land` | the strip stops on the set | `{ set, oneIn, rare, interrupted: false }` | a heavy clunk (noise click + 120 Hz thump) |
| `roll:fanfare` | a vintage landing (after `roll:land`) | `{ set, oneIn }` | the gold stinger: sub drop, major chord, bell, sparkle ticks (like the gold card's) |
| `roll:interrupt` | the player grabbed the pack mid-roll | `{ snapped (a result was there), set? }` | a single sharp clack |

They are voiced by the pack audio: `rollSound` in `src/game/packs.ts` sends every event to `PackAudio.roll(event,
detail)` (`src/packs/audio.ts`: CC0 samples, a synth fallback); `roll:tick` is a ratchet click that rises with
`speed`. The scene's re-skin plays `token` / `win` at the landing as before.

## Reduced motion, phones, performance

- **`prefers-reduced-motion`** (or `reducedMotion: true`): no spinning, no streaks, no bounce, no rays. The centre
  slot cross-fades from wrapper to wrapper every 0.42 s (0.11 s fades, opacity only) while the host rolls, then cross-fades to the
  rolled set, with its "1 in N" as text. The information is the same, the motion is gone. Interrupts work the same.
- **Phones**: the strip is sized from the pack (`--pw`), so a phone shows about three wrappers; the window
  fades by 2.2 tiles or the screen edge, whichever is nearer. The odds slam is `min(22vw, 120px)` high.
- **60 fps at 1x/2x DPR**: one `<canvas>` covering only the reel's band (2.1 pack heights), its backing store capped
  at 1.5x (a moving reel of pixel-art wrappers loses nothing visible; the landed tile dissolves into the real, crisp
  pack), redrawn per frame with at most ~9 tiles (plus one motion ghost each at speed) as `drawImage` of
  pre-rasterised bitmaps (each set's wrapper once, bright at the pack's size, dim at 0.6x); no DOM layout per frame
  (the pack's box is re-read from its offset chain every 20 frames), no filters, one gradient (the band). The canvas
  is removed when the roll ends. The real pack is hidden (opacity) while the reel is over it.
- Measured with `scripts/roll-shots.mjs --only fps` in headless Chromium on **SwiftShader** (no GPU in the capture
  browser) on a busy machine: reel cruising 60.4 fps at 1x and 53.8 fps at 2x, against 60 fps for the same scene
  without the reel. Before the band and the 1.5x cap it was 30 fps at 2x. Under heavier load the numbers swing for
  the scene with and without the reel alike, so the absolute figures are the machine's; a GPU browser has headroom.

## Late sets list

`pokeshell pack sets` can take ~4 s cold (main.ts warms it, but a first pack can beat it). The reel **never waits**
for it: it starts at once with a strip of mystery foils (honest: the draw isn't known yet). When the list lands, tiles
beyond the visible edge come from the real, chance-weighted strip (`ReelModel.useStrip`); tiles already on screen
never change. If the list arrived before the reel moved (the usual, cached case) the whole strip is real from the
start. A result that beats the list lands on a placeholder painting of the set (its name from the host's `setName`,
default colours), upgraded in place when the art arrives; each set's tile is a quick canvas painting until its SVG
raster decodes.

## The module

```
src/packs/roll/
  index.ts     playRoll, attachRollToScene and the types
  types.ts     RollSet, RolledSet, RollOptions, RollHandle, RollSoundEvent
  strip.ts     the seeded, chance-weighted infinite strip (no DOM)
  reel.ts      ReelModel: the motion (wind-up, cruise, lock, settle, bounce, interrupt) and its events (no DOM)
  tiles.ts     each set's wrapper rasterised to bitmaps (wrapperSVG + our hero image), with a canvas fallback
  render.ts    the canvas renderer (the strip, rarity plates, the fixed marker, streaks, flashes, rays, sparks)
  play.ts      playRoll: the DOM glue, clock, interrupt listeners, the odds slam
  attach.ts    attachRollToScene: finds the scene's stage / pack / tag and runs playRoll over them
  styles.ts    the roll's CSS (injected once)
  roll.test.ts, play.test.ts
```

```ts
interface RollSet { id: string; name: string; chance: number; oneIn?: number | null; art?: SetInfo['art']; hero?: string; series?: string; packSize?: number }
interface RolledSet { set: string; setName?: string; oneIn?: number | null }
interface RollOptions {
  sets: RollSet[] | Promise<RollSet[]>;     // the draw; a set with chance 0 is never in the strip (but can be landed on)
  result: Promise<RolledSet>;              // the host's answer; the reel loops until it resolves
  start?: SetInfo;                         // tile 0 (default MYSTERY_SET): the wrapper the scene opened with
  anchor?: HTMLElement;                    // the element whose box is the centre slot (the scene's .pk-pack)
  hide?: HTMLElement[];                    // hidden (opacity 0) while the reel covers them
  imageBase?: string;                      // prefix for hero images
  seed?: number; reducedMotion?: boolean;
  sound?: (event: RollSoundEvent, detail: RollSoundDetail) => void;
  onSettle?: (o: RollOutcome) => void;
  interrupt?: AbortSignal | Promise<unknown>;
  clock?: { now(): number; raf(f: FrameRequestCallback): number; caf(id: number): void };   // tests
}
interface RollHandle { settled: Promise<RollOutcome>; interrupt(): void; destroy(): void; readonly model: ReelModel }
interface RollOutcome { set: string | null; interrupted: boolean; ms: number }
```

## Integration (the three branches)

The roll touches **no** scene file. pack-v3 owns `scene.ts` / `wrapper.ts` / `styles.ts`, pack-sfx owns `audio.ts`.

1. **`src/game/packs.ts`, `openRandomPack`** (the only edit outside `src/packs/roll/`):
   - the host call starts first (`const hostP = host.openRandomPack()`), shared by `fetchPack` and the reel's
     `result`;
   - the landing drives the re-skin. On arena main (with pack-v3's `PackScene.reskin(k)`): `opts.reskin` returns
     `null` while the reel is up, and `roll.settled.then(...)` calls `scene.reskin({ set, tag, sub, rare })` and
     plays `token` / `win` once; if the reel had already settled when the pack arrived, `opts.reskin` does it as
     today. `fetchPack` itself never waits for the reel, so the tear can commit the moment the host answers. main's
     late-art path (keep the mystery foil, `scene.reskin({ set })` when `packSets()` answers) stays. On this branch's
     base (before `PackScene.reskin` existed) the same effect is had by `fetchPack` awaiting `roll.settled`, which
     resolves the instant the player touches anything;
   - `openPackScene(...)` gains `onPhase: (p) => { if (p !== 'idle') roll.interrupt() }` (autoplay, Skip, the Open
     button), and `roll.destroy()` runs in the `finally`;
   - after `openPackScene` returns, `attachRollToScene(container, { sets, result, sound })`.
2. **`attachRollToScene`** finds `.pk-scene`, `.pk-stage`, `.pk-pack` (the centre slot), and hides
   `.pk-pack__float` + `.pk-packtag` while the reel is up. If pack-v3 renames those, only the selectors at the top
   of `src/packs/roll/attach.ts` change; if none is found, the reel centres itself in the container and hides
   nothing.
3. **Sound**: `openRandomPack` passes `sound: rollSound`, which calls `PackAudio.roll(event, detail)` for the
   table above.
4. **z-order**: the canvas is `z-index: 3` inside `.pk-scene` (above `.pk-stage` at 2, below the particles at 6 and
   the HUD at 10); the odds slam is `z-index: 8`.

## Demo and captures

`npm run packs:demo`, then `/?roll=1` runs the game's random-pack flow with the reel against the stand-in host:

- `&delay=1200` the host's delay in ms (`&delay=3000` shows the elastic cruise; `&delay=0` an instant result);
- `&roll=base1` forces the rolled set (`roll=neo1` too; any value other than `1` is a set id), so
  `/?roll=1&roll=base1&delay=900` is a vintage roll with the tease;
- `&reduced=1` reduced motion, `&auto=1` plays the whole opening by itself, `&seed=7` a fixed strip.

`scripts/roll-shots.mjs` (Playwright against the demo server) writes frames and short clips into `shots/pack-roll/`:
a common roll, a vintage roll with the tease and fanfare, an interrupted roll, a slow host and reduced motion, at
desktop and phone widths, plus a frame-time sample.
