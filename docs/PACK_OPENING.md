# Pack opening

What happens between "you won a pack" and "it's in your binder". The scene lives in `src/packs/` and is one call:

```ts
import { openPackScene } from './packs';
const scene = openPackScene(container, { set: 'swsh7', fetchPack: () => host.openPack('swsh7') });
const result = await scene.done;        // the PackResult, after the summary's "Done"
```

The cards come from pokeshell (`pokeshell pack open <set> --json`, pokeshell's docs/BOOSTERS.md): the real booster
structure, rolled and recorded there. The scene only stages what already happened. This doc is the design; the code
follows it section by section.

## What makes an opening feel good

What the good ones do, and what we take from each:

- **A real pack**: the crimp, the resistance, the sound of foil. Then the slow thumb-slide through the stack, rare
  at the back, where the last card is always the question. The pack is a *sealed promise*. Opening it should cost a
  gesture, never just a click.
- **Pokemon TCG Pocket**: you drag a line across the pack to cut it, and a glowing slice follows your finger. Cards
  come out as a stack and you swipe each one away. Rarer cards arrive face down, you flip them, and the flip is
  slowed down and lit up. The best pull lands last. The whole thing is tactile and short (about 20 s), and it never
  shows a loading bar.
- **Pokemon TCG Live**: an energetic pack shake, a burst when it opens, cards that fan out, and one card revealed
  at a time with rarity lighting. Some openings feel long because every card gets the same weight.
- **Hearthstone**: the pack slams onto a board, and five face-down cards burst out in a ring. Before you flip a card,
  hovering it **glows in its rarity's colour** (blue, purple, orange). You *know* a legendary is there before you see
  it, and choosing when to flip it is the best moment in the game. Each rarity has its own sound on reveal, and a
  legendary gets a voice line and a screen-wide burst.

Principles:

1. **Earned tension.** Each step asks for a gesture (tear, flip, swipe), so the player sets the pace and owns the
   moment.
2. **Honest foreshadowing, escalating.** The pack tells you *how big* before it tells you *what*. It shakes and leaks
   light when it tears, and the card back pulses in the tier colour before the flip. It never lies: a gold pulse
   always means gold.
3. **Commons go fast, hits go slow.** Plain cards come face up and one swipe sends them away. Hits come face down and
   take time: a pulse, a hold, a slowed flip, light.
4. **Rarest last**, always. pokeshell already orders the cards.
5. **Every hit gets its own signature.** Holo shimmer, rainbow sweep, gold rays, radiant starburst, shiny sparkle:
   the same effect families as the terminal tiers, drawn over *our* card image.
6. **Always skippable and calm when asked.** Skip and fast-forward work at every step. `prefers-reduced-motion`
   gets the same information with fades instead of motion.
7. **No dead time.** `fetchPack()` starts on the first touch of the tear, and the tear takes at least 0.6 s, so
   pokeshell's ~1 s roll is hidden behind the gesture. If it's slower, the torn edge glows and waits at 92%.

## The flow

```
 idle ──tear──▶ torn ──▶ stack out ──▶ fan ──▶ reveal 1..N ──▶ summary ──Done──▶ resolves scene.done
  │                                             ▲    │
  └──────────── Skip (S / button): fast-forward ┘    └─ Esc / double Skip: straight to the summary
```

### 0. A random pack: no waiting
Spending a token (`src/game/packs.ts` openRandomPack) opens the scene **at once** (about 50 ms after the click) with a
silver **mystery wrapper** (`MYSTERY_SET`: a "?" in the window, a sheen sweeping over it, a "rolling a pack" ribbon).
The host call (`pokeshell pack open random`) runs as the scene's `fetchPack` in the background (`eager`), so you can
start tearing right away: the tear follows you up to 92% and holds there until the pack arrives, then commits at once
if you're still past the far end. When the roll lands:
- the wrapper **re-skins** in place, even mid-tear (the art, the peeling strip's face, the colours, the HUD title) under
  a foil flash; the torn edge keeps its shape;
- the ribbon on the pack reads "<Set> pack!" and "1 in N";
- a rare vintage pack (1 in 30 or rarer) gets its fanfare on the pack: gold rays, a gold spark burst, a gold ribbon and
  the 'win' sting. Nothing blocks the tear;
- the seam's glow switches from the neutral white to the best card's aura (5a).

An error (402 no tokens, 409 no sets, 502) rejects `scene.done` before any token is spent; the scene is torn down and
the arena shows "No pack this time". Measured against the demo's stand-in host with a 1.2 s delay: the pack is on
screen 49 ms after the click (was 4.1 s: a spinner for the roll, then the 2.6 s "YOUR PACK" card), the cards are there
at 1.26 s.

### 1. Idle: anticipation (until the first touch)
- The pack floats centre-stage over a vignette in the set's colours. It bobs slowly (a 4 s sine), turns a few
  degrees, and follows the pointer with **tilt parallax**: the wrapper is a stack of layers (back, art, foil, logo,
  crimp) at different depths, so it reads as a physical object. A foil glare slides across it as it tilts.
- Dust motes drift in the light. A soft drone (two detuned oscillators through a low-pass filter) swells in, after
  the first user gesture because browsers require one.
- The tear strip along the top crimp is marked with a dotted line and a small animated hand: "drag across to open".
  After 6 s without input the hint pulses. **Keyboard**: Space or Enter tears it (auto-tear animation).

### 2. The tear gesture (physics)
The tear is a small state machine (`src/packs/tear.ts`, `TearModel`, no DOM, unit-tested):

```
 sealed ──press on the strip + drag──▶ dragging ──let go before the far end──▶ settling ──spring──▶ sealed
                                         │  ▲  drag back: the tear and its glow close again
                                         └──┴─ the pointer crosses the far end ──▶ committed (the pack pops open)
```

- **Progress follows the pointer.** Press on the top strip (the top 26% of the pack) and drag sideways: progress is
  where the pointer is along the strip, from the edge the tear started at (0) to the far edge (1), through a stiff
  spring so it has a little weight. Left to right is the usual way, right to left mirrors everything. It is **fully
  reversible**: drag back and the strip lies back down, the torn line closes and the light shrinks back into the
  pack.
- **The cut exists only behind the pointer** (v3). `cutSpan(progress, dir)` is the torn stretch, from the start
  edge to the tear front; the rim, the mouth, the core line, the light's rays and the strip's torn-edge stroke are
  all clipped to it, and the strip column at the tear front shows exactly its torn fraction. Ahead of the pointer the
  strip is drawn whole (the "seal" layer under the peeling chain), so there is no seam, no pre-cut and no
  perforation line. Dragging back **mends** it: everything follows `progress`, never a high-water mark; only
  shreds already in flight keep falling. Unit-tested both ways and in both directions.
- **Only crossing the far end commits.** Nothing opens at 99%. If you let go before the end, the strip **springs
  back closed** (an under-damped spring, so it settles with a small bounce) and the pack is sealed again, hint and
  all. If the pointer crosses the end before pokeshell's roll has arrived, the tear holds at 92% with the light
  pulsing, and commits the moment the pack arrives if the pointer is still past the end.
- **The strip peels, it doesn't swing.** The torn-off strip is a chain of 28 nested segments, each a column of the
  wrapper's own artwork (an SVG `<use>` of it, so nothing is drawn twice). Each segment is rotated relative to the
  one before it (`curlChain`): a fold at the tear front, spread over ~6 segments, then a steady curl, so the foil
  arcs up and rolls slightly towards you with real perspective, plus a seeded crinkle per segment. Pulling the
  pointer above the strip lifts the peel, below presses it down. Each segment has a silver back face (the inner
  lining, with the crimp ridges) that shows as the foil rolls over, a specular glint where it faces the light and a
  shade where it rolls away. Faces overlap their neighbours by a quarter segment, so the bend never opens a gap.
- **The rip.** The torn edge is a seeded, 128-point path (`tearEdge`): a slow wander, a mid zigzag and fine foil
  teeth. The body is clipped to it and the strip is cut from it, so they always match. On the body, only along the
  torn part: the **mouth** (the back panel, torn a little higher, its silver lining visible inside), the foil
  layers at the cut (the print colour, then a silver lining line, with tiny white fibres), the strip's **shadow** on
  the body, and a crisp **tear line** that is brightest at the tear front and fades behind it. A small cross glint
  rides the tear front. As the front advances it sheds sparks in the leak colour and **foil shreds**: two-sided
  flakes (print colour one side, silver the other) that flip as they flutter down.
- **Light leaks out, and it's honest.** While the pack tears, light comes out of the opening: a glow inside the
  mouth, a plume over it, a bloom behind the pack and, for the big hits, light rays. All of it grows with the tear
  and shrinks back when you drag back (`leakGlow`). Its colour and strength are the aura of the pack's best card
  (§5a): a plain pack leaks a faint white, a holo a blue-white, an ultra gold-magenta, a gold pack thick gold rays,
  a rainbow pack cycles through the hues. It tells you *how big*, never *what*. Big packs also **shake** during the
  tear: 0 / 0 / 1 / 2 / 3.5 / 5 px for hit 0-5, driven by noise and not a sine.
- Sound: every few pixels of movement fire a **crinkle grain**, one of 24 short cuts of real foil and wrapper
  crinkles at a random pitch; the rate and loudness follow the pointer speed (softer when dragging back). §6 has
  the details.
- **The pop.** On commit the strip comes off with physics (the pointer's velocity, gravity, spin and drag, still
  curling as it flutters away), the light bursts out of the mouth (sized by the best card), sparks in the aura's
  colours and a spray of foil shreds fly off the whole edge, and there's a rip-pop sound. The coins, confetti and
  petals wait for the card itself.
- Only crossing the far end opens it. A plain mouse tap does not (`TAP_OPENS = false` in scene.ts): it pulses the
  "drag across the top" hint and sweeps the hand once more. Space / Enter / Right, the reduced-motion "Open the pack"
  button and a touch held still for 450 ms still open it with an auto-tear that drives the same model in 0.8 s.

### 3. Stack out, then the fan
- The pack body drops away (gravity plus a small rotation) and the card stack rises from it with a whoosh.
- **Fan-out**: the N cards spread into an arc for 0.6 s, backs up, so you can count what's in the pack. Then they
  gather back into a centred stack. The hit cards' backs sit in the fan like any others: no spoilers yet.

### 4. The reveal, one card at a time
Cards come in pokeshell's reveal order (rarest last). Each card has a **reveal class** from its `hit`:

| class | cards | arrives | to reveal |
|---|---|---|---|
| quick | hit 0 (commons, uncommons) | face up | swipe/tap sends it away |
| flip | hit 1-2 (reverse holo, plain rare, holo) | face down, faint tier-coloured edge | tap flips (0.35 s) |
| charged | hit 3 (full art, radiant, shiny vault) | face down, **pulsing** in the tier colour | tap flips slowly (0.7 s) behind a flash |
| held | hit 4-5 (alt art, rainbow, gold) | face down, pulsing hard, light rays behind, the stack shaking | **press and hold** to charge (0.9 s: a ring fills, a riser climbs, the shake grows); release when full: a slow flip with a burst |

- **The last card is always face down**, even if it's a plain rare. That is the real-pack moment.
- **Escalation**: each card's flip or swipe sound is one step higher in a pentatonic scale than the one before, so
  the pack climbs towards the last card. Hits add their stinger on top.
- **Grab it and shake it** (`src/packs/shake.ts`, `CardShake`): a revealed card is yours to hold, by mouse or
  touch. It chases the pointer through an under-damped spring, so it lags and swings past like something with
  weight; it rolls and tilts with its velocity (`rotateX/Y`, up to ~30 deg), and the foil and glare follow the tilt
  and brighten with its speed. Shaking it (fast changes of direction, not just moving it) builds up **energy**,
  which swells the card's aura and sprays sparkles off its edges in the aura's colours; the energy fades when you
  calm down. Let go and it springs home with a bounce. **Fling** it off to the side (past most of a card width,
  moving outwards, or far off) and it flies into the "seen" pile: the next card. Keyboard: Space / Enter / Right.
- **Shake to reveal (v3b): the shake comes before the flip.** A hit (hit >= 2: holo and up) arrives **face down**
  and is yours to grab and shake (`waitShakeReveal`). While you shake it, its back pulses and its aura leaks out
  round the edges in the tier's colour (honest foreshadowing, like the tear light: how big, never what), and a
  **charge** builds (`shakeCharge`: the shake energy integrated over time, about a second of hard shaking; it drains
  when you hold still or let go). The charge drives the edge glow, the sparkles off the edges and the rattle
  (`PackAudio.shake(speed, charge)`). It **flips** at full charge (`SHAKE_FLIP_EN` 0.85: a double ring of sparkles and
  `PackAudio.tick(12 + hit, 0.3)` straight into the flip), when you let go after a good shake (`SHAKE_RELEASE_EN`
  0.45), or on the fallback: Enter / Space / Right or the **Reveal ›** button. A plain press is not a reveal.
  The first face-down hit, for a player who hasn't shaken one yet, carries a "shake to reveal!" bubble (remembered
  in localStorage). Reduced motion: no shake, **press and hold** reveals it (`revealBy`). Commons and hit-1 cards
  are unchanged (face up, or tap to flip).
- **Escalation by tier (v4, `revealFx` in tiers.ts).** Before and during the reveal the show climbs steeply by tier,
  read from the aura, so it stays honest (how rare, never which card). **calm** (commons, uncommons, reverse, plain
  rare): quiet, quick, unchanged. **mid** (holo, full art): a wider edge leak, a coloured floor glow, a few idle
  sparkles; the flip gets a flash, one shockwave ring, ~24 shards, a ray sweep, a small push-in and the foil sheen.
  **top** (prismatic, gold, alt art / SIR, rainbow, radiant, shiny): face down, a bright layered edge leak that
  breathes, a fan of crisp rays peeking from behind the card (`.pk-peek`), the floor glow, ~22 idle sparkles a
  second (fine glints; gold leaf flecks for gold), a hue sweep across the back for prismatic/rainbow/SIR; the flip
  gets slow-mo (the card hangs edge-on: +400 ms, +650 ms for gold and SIR), two rings, 60-100 shards, the ray sweep,
  a bigger push-in and the sheen. Gold and SIR add a full-screen light bloom, falling glitter and
  `PackAudio.rarePack()` on top of their stinger (boom + brass for gold). Reduced motion: no slow-mo, no rings,
  shards or bloom; the tier's glow shows, still, while the card is held open and after it turns (`pk-soft-glow`).
  All of it is CSS transforms/opacity, vector gradients and the DPR-sharp particle canvas: 58-61 fps at 1x and 2x.
- **After the flip** the card keeps its tilt and parallax; a **Next ›** button, a swipe/fling or Enter moves on, and a
  short press on a hit never skips it (`tapAdvances`). Commons still go with a tap.
- **The face**: our card image (pokeshell's web export PNG, 1 px per art pixel, scaled with
  `image-rendering: pixelated`) in a card chassis: the tier's frame gradient, name and number on top, rarity symbol
  and label and set at the bottom. Full-art, alt-art, rainbow and gold cards get the art full-bleed.
- **Tilt parallax** on the revealed card: the pointer position drives `rotateX/rotateY` (up to 14 deg) and the foil
  layers' light position, so the foil moves as you look around it.
- **NEW!** badge: a sticker slaps onto the top-right corner (scale 0 to 1.25 to 1, with a star burst and a bright
  two-note chime) on cards you hadn't caught before (`isNew`).
- Under the card, a **ribbon** with the rarity name in the tier colour, plus "1 in N packs" for hits.

### 5a. The rarity aura
Every card has an aura (`auraOf` in `src/packs/tiers.ts`): a light behind it, in the tier's colours, that shows once
it's face up and that shaking feeds. The same aura, of the pack's best card, is what leaks out of the tear.

**Drawn in high definition (v3).** No blurred blobs or upscaled canvases:
- out of the tear (`src/packs/leak.ts`): thin vector wedges with a falloff along each ray, rising only from the
  torn part, their count, length and colours from the best card's aura (neutral white until the pack is known); a
  white hairline core along the rip with a thin two-step bloom; fine hairline glints drifting up, gold leaf flecks
  for gold; a chromatic hue drift for prismatic;
- on the card: a 1 px edge light with a tight layered falloff (gold and chromatic variants), hairline conic rays,
  a thin chromatic ring for prismatic, and a quiet halo whose strength follows the aura's intensity;
- particles at devicePixelRatio (up to 3).

| aura | cards | the light | sparkles at rest | extras |
|---|---|---|---|---|
| none | common | barely a white haze (6%) | none | |
| soft | uncommon, plain rare, reverse holo | a soft silver-white glow | 1/s | |
| cool | holo, V, VMAX, ex, promo | blue-white, clearly there | 5/s | |
| strong | full art, ultra, radiant, shiny vault, alt art | gold-magenta (radiant: gold-orange; shiny: silver-violet), strong | 12-16/s | alt art: rays |
| prismatic | rainbow rare, shiny ultra | a rotating rainbow ring round a white core, full strength | 26/s | rays |
| gold | secret, hyper | intense gold, full strength | 26/s | rays |

A shiny roll brightens any aura a step and adds white sparkles. Shaking multiplies the sparkle rate up to ~6x and
the glow by up to 1.6x. In the summary the auras stay on, at half strength.

### 5. Per-tier reveal effects (`fx`)
All CSS layers over the card, driven by the custom properties `--mx`/`--my` (pointer, 0-1) and `--t` (time), plus a
2D-canvas particle layer for bursts. They match the terminal skins in family, not in pixels.

| fx | terminal family | the foil on the card | the reveal |
|---|---|---|---|
| plain | plain tab | none | a soft white flash |
| reverse | silver frame | a holo sheen on the *frame* only, not the art (a reverse holo) | a flash plus a silver sweep |
| holo | holo / starlight / cosmos | a glare following the pointer plus a starlight speckle over the art (color-dodge) | blue-white sparks, a bell triad |
| full-art | sunpillar / fingerprint | diagonal etched lines (repeating-linear-gradient) with a moving rainbow sheen over the whole card | a big flash, a spark ring, the triad plus an octave |
| alt-art | illustration-rare / ir-glow | a painterly soft glow (bloom), slow pastel hue drift, gentle vignette | a warm bloom, petals and dust, a slow arpeggio |
| rainbow | rainbow-rare | a full hue sweep (conic gradient, `mix-blend-mode: color`) plus glitter | rotating rainbow rays, confetti sparks, a rising arpeggio |
| gold | gold / gold-facet | a gold gradient plus faceted glitter plus a moving specular band | **god rays** (a rotating conic), a gold coin shower, a screen shake, a sub boom and a big chord |
| radiant | radiant | a star-burst line pattern radiating from the centre, bright rim | a radial burst and a shimmer chord |
| shiny | shiny-vault | a dark silver foil with twinkling four-point stars | star twinkles, a sparkle arpeggio |
| (shiny roll) | the shiny palette | our 1 in 64 shiny: extra twinkling stars over any fx, a "shiny" tag | sparkle ticks on top of the fx's stinger |

### 6. Sound design (recorded CC0 samples, synthesised fallback)
The opening plays real recordings: foil and wrapper crinkles, a card pack being torn open, card snaps, riffles and
shoves, a music box and a glockenspiel, sparkles, a riser, a boom and short fanfares. They're all CC0 (Kenney.nl
packs and Freesound), about 500 KB in `public/sfx/packs/` as Ogg Opus with an MP3 fallback. Every file's source,
author, licence and edits are in [SFX_CREDITS.md](SFX_CREDITS.md), and `tools/sfx/build_pack_sfx.py` rebuilds them.

`src/packs/samples.ts` is the manifest and a Web Audio buffer bank. The files start downloading when the scene
opens and are decoded when the AudioContext starts (the first gesture). They're shared by every later scene.
`src/packs/audio.ts` plays them with a little pitch and volume variation on every play. Each sound keeps its
original synthesised version, which plays for any sample that hasn't loaded yet, is missing, or fails to decode.
The drone always plays the synth. A master gain with a mute toggle (remembered in localStorage) goes through a
light compressor. The volume follows the arena's slider, and the arena's mute holds until the pack's own toggle
is used.

| moment | recording | how it plays |
|---|---|---|
| tear drag | `crinkle`: 24 grains cut from four foil / wrapper recordings | one random grain per few px of movement; the rate, loudness and pitch follow the drag speed (softer dragging back) |
| the strip comes off | `rip-1..3`, plus `rip-foil` and `thump-1` for big packs | loudness grows with the pack's best card (strength 1-1.5); the foil boom comes in above 1.15 |
| a rare pack announces itself | `fanfare` + `sparkle-2` | on the reskin, with the gold rays |
| the stack slides out | `stack-1/2` (cards taken out of a pack) | |
| the fan | `riffle` grains climbing in pitch, then `fan` as it closes | |
| flip / swipe tick | `snap-1..4` + a `musicbox` note | the note climbs a pentatonic step per card |
| face-down heartbeat | `thump-1..3` | lower and louder with the hit |
| hold-to-reveal | `riser` | faster and louder with the hit, with a tremolo from hit 4 |
| reveal stinger | `musicbox` chords, `glock` shimmer, `sparkle-1/2`, `wink`, `magic-pop`, `boom`, `brass` | layered by fx (below), all pitched to the climbing key |
| shaking a revealed card | `riffle` grains | denser and louder with the shake speed and energy |
| a card flung off | `shove-1..3` + `swish` | |
| NEW! | `sticker` + `blip` | |
| summary | `jingle` | |

- **Drone** (synth only): sawtooth plus detuned saw into a low-pass at 400 Hz with a slow LFO. It swells during
  idle and the tear, drops for the reveal, and returns softly under the summary.
- **Stingers**, rarer fx layer more:
  - plain: a soft music-box note.
  - reverse: a fifth, plus the wink.
  - holo: a triad plus sparkle 1.
  - full-art: four notes, glockenspiel shimmer and sparkle 1.
  - radiant: a bright chord, shimmer, the magic pop and sparkle 2.
  - shiny: a wide chord, shimmer, sparkle 2 and the wink.
  - alt-art: a slow five-note arpeggio and sparkle 1.
  - rainbow: a fast eight-note arpeggio, shimmer, the magic pop and sparkle 2.
  - gold: the boom, the brass stinger, a big chord, a high bell, 16 shimmer notes and sparkle 2.
  - The shiny roll adds shimmer and the wink on top of any fx.
- **The fallback synth** is the original design: band-passed noise grains for the crinkle, a swept high-pass
  noise and a 90 Hz thump for the rip, swept noise whooshes, a noise click with a pentatonic sine for the ticks,
  a sine/triangle/saw riser with a tremolo, and bell stingers (a sine plus a 2.76x partial).

### 7. Summary
Every card flies from the pile into a grid in reveal order (rarest last, so the best card is bottom-right). The best
card also gets a hero spot above the grid. Each card keeps its fx and tilt on hover, NEW! badges stay, and the
header reads "Evolving Skies · 10 cards · 7 new · best: Umbreon VMAX (alternate art)". Buttons: **Done** (resolves
`scene.done`) and, if the host passes `onOpenAnother`, **Open another**.

### 8. Skip and fast-forward
- **Skip** (a button, or the S key) fast-forwards. It auto-tears if the pack is still sealed, then reveals the
  remaining cards at 4x speed with the sound trimmed to ticks. The *last* card still gets its full reveal if it is a
  hit (hit 3 and up): skipping never hides the big moment. A second Skip, or Esc, jumps straight to the summary.
- `scene.skip()` and `scene.destroy()` for the host.

### 9. Reduced motion
With `prefers-reduced-motion: reduce` (or `reducedMotion: true`):
- no shake, no parallax, no flying physics, no particles, no god-ray rotation, no screen flash;
- the tear's light still grows and fades (it's the information), without rays or the tear-front glint; auras are
  steady (no spinning rays or hue cycling, no sparkles);
- a revealed card can still be dragged, but moves at 30% and tilts little; nothing flashes when you shake it;
- the tear is a button ("Open"); cards cross-fade face down to face up; the foil layers are static gradients;
- the foreshadowing becomes a steady coloured outline instead of a pulse, with the tier name as text ("a gold card
  is next");
- the sound stays (it's not motion), still under the mute toggle.

## Contract

```ts
interface PackCard {        // pokeshell pack open --json
  id: string; name: string; rarity: string; tier: string; slot: string; shiny: boolean; isNew: boolean;
  image: string;            // relative to imageBase (pokeshell's web export: img/pokemon/<character>/<id>[-shiny].png)
  fx?: Fx; hit?: number;    // derived from tier + slot when missing
  number?: string; tierLabel?: string; finish?: 'normal' | 'reverse' | 'foil'; oneIn?: number; setName?: string;
}
interface PackResult { set: string; packId: string; cards: PackCard[]; setName?: string }
interface SetInfo { id: string; name: string; series?: string; art?: { colors: string[]; accent?: string; motif?: string }; hero?: string }

openPackScene(container: HTMLElement, opts: {
  set: string | SetInfo;                   // pokeshell pack sets --json gives SetInfo
  fetchPack: () => Promise<PackResult>;    // called once, on the first touch of the tear (or at once with eager)
  eager?: boolean;                         // fetch as the scene opens (a random pack: the host rolls while you tear)
  reskin?: (res: PackResult) => { set?: SetInfo; tag?: string; sub?: string; rare?: boolean } | null;
                                           // `set` was a stand-in (MYSTERY_SET): re-skin to this when the pack lands
  imageBase?: string;                      // URL prefix for card.image (default '')
  sound?: boolean; reducedMotion?: boolean;
  onOpenAnother?: () => void;
}): { done: Promise<PackResult>; skip(): void; destroy(): void }
```

The scene holds no game state and writes nothing. pokeshell recorded the cards before `fetchPack` resolved.

## Pack art

Each set's wrapper is generated in SVG from pokeshell's set data, never from a scan of an official wrapper:
- the set colours (`art.colors`, three stops) in a diagonal foil gradient, with a procedural **motif** per set
  (sky swirls, confetti, a crown and stars, a vault grid, a classic starburst, sparkles, leaves, a void);
- our hero card image (`art.hero`, a PNG from the web export) in a window, pixelated, with a glow;
- the set name in heavy type with a stroke, the series, "pokeshell" and the card count;
- crimped top and bottom edges (a zigzag clip path) and a vertical seam;
- a foil glare layer on top, driven by the tilt.

## Files

- `src/packs/index.ts`: `openPackScene` and the types
- `src/packs/scene.ts`: the flow, input, layout and drawing (the peeling strip, the rim, the glow, the held card)
- `src/packs/tear.ts`: the tear state machine, the strip's curl and the leak glow (no DOM)
- `src/packs/shake.ts`: the held card's spring, tilt and shake energy (no DOM)
- `src/packs/card.ts`: the card face, the back, the foil layers and tilt
- `src/packs/wrapper.ts`: the SVG pack wrapper and the torn edge (`tearEdge`, `tearShapes`)
- `src/packs/audio.ts`: the sounds: the sample player and the synthesised fallback
- `src/packs/samples.ts`: the recorded sounds' manifest and buffer bank (files in `public/sfx/packs/`, credits in
  `docs/SFX_CREDITS.md`, rebuilt by `tools/sfx/build_pack_sfx.py`)
- `src/packs/particles.ts`: the canvas bursts, tear sparks, foil shreds and card-edge sparkles (capped at 700 alive)
- `src/packs/tiers.ts`: fx, hit, colours and the aura per tier
- `src/packs/styles.ts`: the scene's CSS, injected once
- `src/packs/mock.ts`: a mock `fetchPack` that rolls real cards from pokeshell's pack.json + boosters.json
- `packs-demo.html` + `src/packs/demo.ts`: the standalone demo; `npm run packs:demo` serves it (card faces from
  pokeshell's `binder.exe --export-web`, no Python). `?random=1` runs the game's own random-pack flow against a
  stand-in host: `&delay=1200` (ms), `&roll=base1` (force the set), `&fail=402`
- `scripts/packs-sheets.py`: Playwright frames of a full opening, and a big hit, into the sheets folder

## Performance

Everything that moves per frame is a transform or an opacity (the strip's 28 segments, the glow, the rays, the
bloom, the held card), plus two SVG attributes on the rim's clip. Nothing reads layout per frame: the pack's box is
measured once per press. The rays are drawn once per pack into an image; the big light layers use plain alpha, not
blend modes, and the strip is clipped inside its SVG rather than with CSS clip-paths (mask layers). Particles are
capped at 700 alive and the held card's sparkles back off near the cap. Measured in Chromium with GPU compositing:
~60 fps idle, tearing and shaking at 1x and 2x DPR (58-60 fps while tearing). The strip segments' specular and shade
opacities are quantised to 1/16 steps: restyling 56 layers every frame for sub-percent changes was what held the
tear at 40-49 fps.
