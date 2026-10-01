# VFX: every archetype looks like its name

"How is Wave Splash a ball of water instead of waves of some sort?" The move lexicon (docs/MOVES.md) gave every
attack an archetype, but the renderer only knew shape **kinds**: every shot was a glowing ball, every beam the same
glow line, every area a dashed circle, every cone a slash crescent. So a wave was a ball (and, sim-side, it *hit* like
one: `wave` was a projectile with a 34-56 px radius). This page is the audit and the fix.

## 1. How a look is chosen

- `ResolvedAttack.look` (render-only; the sim never reads it) is the archetype the attack's **name** (else its text)
  reads as: `kit.ts lookFor`, a pure function of the card and kit, the same `archetypeFor` the auto-kit uses. A kit
  may set `look` itself. All 1,872 attacks in the pool get one; 1,692 sit on their archetype's own shape kind
  (`npx vite-node tools/kits/looks.ts` lists the rest by kind).
- The renderer draws the look on whatever shape kind the kit gave the attack (a hand-authored "Water Gun" shot is
  still a jet of droplets, not a ball). A look a drawer doesn't know falls back to the old plain look of its kind.
- `src/render/vfx.ts` holds the drawers (`drawShot`, `drawBeam`, `drawArea`, `drawCone`): Canvas2D paths, gradients
  and the renderer's own particle pool (capped at 900), type-coloured through `TYPE_COLOR`. No assets. Per-shot cost
  is a few paths and at most two particles a frame; no offscreen canvases.
- Melee and dash archetypes (jab to stomp and tackle to flamecharge in `lexicon.ts`, plus `hammer`) are drawn by the
  swing / fighter code and are out of scope here (branch melee-spec).

## 2. What changed in the sim: walls

`shape.wall` (px, a projectile param): the shot is a band `wall` px either side of its centre, **across** its heading,
`radius` px deep, a capsule (`shapes.ts shotTouches`), not a circle. Deterministic integer math (`segDist`); the
entry points (`release`, `advanceProjectiles`, `advanceAreas`, `advanceDash`) are unchanged, so `predict.ts` runs as
before (its targeting half-width reads `max(radius, wall)`). The explainer says "a wall N tiles wide rolling forward".

| archetype | before | now |
|---|---|---|
| `wave` | a circle, radius 36-56 | a wall 100-156 px wide (`wall` 50-78, about 2.8x the old radius), 16 px deep |
| `ripple` | a circle, radius 22 | a wavefront 60 px wide (`wall` 30), 12 px deep |

A hand kit's shot whose name reads as a wall archetype takes its `wall` too (`lookFor`: only when the kit's shape is
a projectile and sets no `wall` of its own), so a hand-authored "Aqua Wave" or "Sweep Away" rolls as a wall. Damage
numbers are untouched.

`Area.land` (sim data): a countdown to the tick an area lands, then ticks since. The renderer uses it to drop a rock,
strike a bolt or raise a pillar at the right moment.

Everything else already hit in a shape that fits its name (a quake is a ring round you, thunder a delayed circle on
the aim point, a stream a thin beam, a rock slide a line of impacts); only its look was wrong.

## 3. The audit

"Before" is the look every archetype of that kind shared: **ball** (a type-coloured glowing ball with a ribbon trail
and a small type mark), **glow line** (three stacked strokes), **dashed circle** (a radial fill with a marching dashed
edge and a few particles), **crescent** (the melee slash arc and a light wedge).

### Shots (projectiles)

| archetype | attacks | before | problem | now |
|---|---:|---|---|---|
| `wave` | 10 | ball (and a circle hit) | a wall of water drawn and hitting as a ball | a wide wall across the heading: a body darkening toward the back, a curling white crest with a shadowed hollow, bubbling foam on the lip, spray thrown forward; a band on the telegraph |
| `ripple` | 8 | ball | a "ring of force" as a ball | nested wavefront arcs rolling forward (Lightning: sparks across them) |
| `fireball` | 21 | ball | no flame | a white-hot core in an orange ball, flame tongues streaming back, embers and smoke shed |
| `fan` (Ember) | 18 | ball | no sparks | a hot spark with a tapering streak, sparks flying off |
| `bolt`, `zigzag` | 41 | ball on a zigzag path | the path zigzags, the shot doesn't | a jagged, forking bolt along the path it just took, a bright head |
| `leaves` | 16 | ball | no leaves | spinning leaves (type-coloured petals off Grass), leaves shed |
| `boomerang` | 1 | ball | no blade | a spinning crescent blade with motion blur |
| `weave` | 5 | ball | | fluttering leaves |
| `seed` | 3 | ball | | a spinning seed with a sprout |
| `bubble` | 6 | ball | a bubble isn't a glowing ball | translucent wobbling bubbles with a rim and a highlight |
| `orb` (Psychic) | 65 | ball with a thin ring | close | a glowing orb with pulsing rings rolling off it |
| `ball`, `sphere` | 23 | ball | no swirl | an orb wrapped in turning bands (Lightning: crackling) |
| `blast` | 24 | ball | no sense it will detonate | an orb in a swelling, crackling dashed shell |
| `stars` | 18 | ball | no stars | spinning five-point stars shedding sparkles |
| `spit` | 11 | ball | | a wobbling gob with a drip |
| `web` | 4 | ball | no net | a spinning net (spokes and rings) |
| `phase` | 24 | faded ball | | a shadow wisp with eyes and a smoky tail |
| `hypno` | 12 | ball | | swaying pink rings |
| `bullet` | 9 | ball | | a spinning coin / slug with a tracer (Pay Day is a coin) |
| `sniper`, `lance`, `barrage` | 21 | ball | a spear or needle as a ball | a dart or spear with a long streak, length by kind |
| `lob` | 15 | ball over a shadow | a rock throw as a glowing ball | a tumbling rock or lump over its shadow |
| `bounce` | 1 | ball | | a mirror disc flashing as it turns |

### Beams

| archetype | attacks | before | problem | now |
|---|---:|---|---|---|
| `beam` | 40 | glow line | fine | kept: a solid line of light, glowing ends |
| `hyperbeam`, `solar` | 17 | glow line | as thin-looking as any beam | wider halo and core; Solar Beam sun-yellow with motes |
| `pulse` | 10 | glow line | | a line with rings riding along it |
| `zap` | 26 | glow line | Thunderbolt a straight laser | a fresh jagged, forked bolt every frame |
| `stream` (Water Gun) | 14 | glow line | a laser, not water | a wobbling blue jet, droplets flowing along it, breaking into drops past the end |
| `hydro` | 8 | glow line | same | a thick turbulent torrent with heavy spray at the end |
| `drain` | 21 | glow line | a laser, not a siphon | a wavy tether, motes of life flowing back to the caster |

### Areas

| archetype | attacks | before | problem | now |
|---|---:|---|---|---|
| `thunder` | 14 | dashed circle | nothing from the sky | a storm cloud over the spot (flickering) while it's telegraphed, then a thick forked bolt from above, a flash, a ring |
| `rain` | 10 | dashed circle | no rain | a cloud over the spot, blue drops streaking down, splashes |
| `hazard` (storms) | 15 | dashed circle | no storm | turning spiral arms round a dark eye, debris of the element (leaves, embers, drops, sparks) |
| `vortex` | 9 | dashed circle | no spiral | a whirlpool / fire spin: faster, thicker spiral arms |
| `quake` | 9 | dashed circle | no ground | radial cracks (the same every frame), a rolling ring, dust |
| `surf` | 5 | dashed circle | not a wave | a ring of water racing outward with a white foam crest and spray |
| `sound` | 29 | dashed circle | | rings of sound rolling out |
| `nova`, `explode` | 34 | dashed circle | not a burst | rays and a flash that fade, a hot shell; smoke for an explosion |
| `gas`, `powder`, `cloud` | 26 | dashed circle | not a cloud | soft drifting puffs (poison purple), powder sparkles |
| `rockslide`, `meteor` | 5 | dashed circle | no rocks | a darkening shadow with a rock dropping onto it, then shards and dust |
| `pillar`, `max` | 77 | dashed circle | nothing rises | the telegraph, then a column of light rising from the spot (Max: a colossal one) |
| `field` | 1 | (paints terrain) | fine | kept |

### Cones

| archetype | attacks | before | problem | now |
|---|---:|---|---|---|
| `breath`, `flame`, `heat` | 38 | crescent | a slash, not fire | a hot wedge and a spray of embers out through the cone (heat: shimmer arcs) |
| `snow` | 24 | crescent | | a pale wedge and a flurry of flakes |
| `mud` | 8 | crescent | | a brown spray and splats where it lands |
| `gust` | 18 | crescent | | curling wind streaks sweeping out |
| `glare` | 17 | crescent | | a red wedge from a pair of glaring eyes |
| `roar` | 1 | crescent | | arcs of sound |

### The aim telegraph

The telegraph already drew each shape honestly; the one change is the wall: a wave's telegraph is a band as wide as
the wall with a crest line across its end, not a thin capsule.

## 4. Screenshots

`node tools/move_shots.mjs --sheet vfx [--out shots/vfx/after] [--before shots/vfx/before]` stages one cast per
archetype on an open floor (Herdier's temple): the caster and a still foe at the shape's reach, the caster forced to
cast the attack, the sim held mid-flight (the page keeps drawing), cropped. With `--before`, `sheet-vfx.png` pairs
each crop with the one in that folder (made the same way on the commit before this change). Wave Splash leads.
`shots/` is gitignored.

## 5. Not done here

- Where a hand kit's kind disagrees with its name's archetype and the drawer doesn't cover it, the plain look of the
  kind is kept (rarer now: hand kits take their archetype's shape, docs/MOVES.md section 9).
- Melee and dash looks: branch melee-spec.

## 6. Signature moves

The signature moves (docs/MOVES.md section 9) each get their own look, so no two of them read alike (Psychic is a
violet mind-orb in warped rings; Power Gem a spinning cut gem in spectrum facets that throws a white glint and
coloured crystal splinters where it strikes).

- **Where:** `src/render/sig/<family>.ts` (psychic, fire, water, electric, nature, shadow, force, max, iconic), a map
  of look id -> drawers (`sig/types.ts`: `shot`, `beam`, `area` under the fighters, `air` over them, `cone`, and an
  `impact` flourish for `impactLife` frames). `vfx.ts` asks the registry (`sig/index.ts`) first, so an entry also
  redraws one of the lexicon's own looks: `sig/iconic.ts` redraws Flamethrower (a roaring jet of tumbling fireballs),
  Hydro Pump (twin cannons merging into a torrent), Thunderbolt, Water Gun, Solar Beam, Hyper Beam, Ember, Thunder,
  Earthquake, Razor Leaf, Bubble, Gust and Horn Attack.
- **The shared kit:** `src/render/vfxkit.ts` (the helpers and the views, split out of `vfx.ts`). The views gained what
  the new shapes need: a split shard (`ShotView.kid`, drawn as a splinter of its shot), a fused shot stuck where it
  landed (`AreaView.fuse`, its fuse counting down in `land`), a beam's `id` and `ticks`.
- **Flourishes:** an impact event now names its attacker and attack (render-only), and a telegraphed area or a fused
  shot sends `landed` when it comes down, so a Fire Blast bursts into its five-armed star where it hits and a meteor's
  flash waits for the meteor. At most 40 flourishes live at once.
- **Every kind it is cast as:** a hand kit may cast a look on another kind (a Max move as a beam, Sacred Fire as a
  shot or a cone); each look draws every kind `tools/kits/looks.ts` lists for it (melee is drawn by `meleefx.ts`).
- **A finding:** additive glows (`'lighter'`) wash out to white on the pale arenas, so the new looks draw their bodies
  with normal blending and dark outlines and keep additive light for small highlights.

Contact sheets: `node tools/sig_shots.mjs [--family f] [--only look] [--iconic looks]` stages each look's cast
(caster and a still foe on Herdier's temple, the meter full, the foe's HP refilled) and catches three moments: the
telegraph during the windup, in flight (an aimed area: a few ticks before it lands), and one tick after the hit or
landing. `shots/signature/sheet-<family>.png`, and `sheet-pair.png` for Starmie's Psychic against its Power Gem.
