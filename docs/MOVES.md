# Moves: the move language

"The impact radius and trajectories of many moves don't really fit the move descriptions... go all out on move
design to make them fun and feel like their names and actual trajectories in Pokémon." This page is the answer: how
an attack's name, text, damage and cost become how it travels, where it lands and how it feels.

## 1. The layers

Every attack resolves through three layers, most specific last:

1. **The type default** (`src/sim/flavors.ts`, section 5): every attack of an element gets its type's signature
   trait (Psychic shots home gently, Fire leaves a burning trail, Water pushes and floods...).
2. **The move lexicon** (`src/sim/lexicon.ts`): the attack's **name**, then its **text**, pick one of **94
   archetypes**; its **damage and cost** size it. The name is read three ways, first match wins:
   - hand-picked whole names (`NAMES`, `EXACT`: "Leaf Boomerang", "Lost Impact", "Metronome", the VSTAR Powers...);
   - ordered keyword rules over the name (`RULES`: `^(g-)?max ` is a pillar from the sky, "punch" a lunging shove,
     "surf" a wave from you, "shadow" a shot through walls...);
   - stems (`W`: "bomb" lobs, "boomerang"/"cutter" return, "thunder"/"spark" zigzag, "storm" drifts...).
   Only when the name says nothing does the **text** decide (spread damage falls from the sky, a status-only move is
   a lingering cloud, a coin flurry is a volley, recoil is a charge, a heal is a draining weave...).
3. **The hand kit** (`tools/kits/hand/*.ts`, 605 kits): its numbers, effects and timing win; its shape **flies like
   its name** (section 9): it takes its archetype's trajectory when the kinds agree (a hand-authored "Thunder Jolt"
   shot zigzags, a "Power Gem" shot shatters), and the archetype's shape when they don't (a "Tackle" swing becomes the
   body charge). A spec pins its own shape with `!` and a note (the kit's `pin`).

The auto-kit (every card without a hand kit) takes the archetype's shape, its windup, and its feel on hit (a punch
shoves, a whip reels in, a web sticks, snow slows), next to the card's own effects from its text. Everything is a pure
function of the card data: the same card always plays the same.

**Coverage:** all **1,872** attacks in the card pool get a deliberate archetype (72% from the name's rules and stems,
19% from a hand-picked name, 9% from the text). **None is left on the bare type default**; `src/sim/lexicon.test.ts`
fails if an attack a bot or the collection can field ever is (the allowlist is empty). 91 of the 94 archetypes are
used by at least one attack.

`npx vite-node tools/kits/lexicon.ts [--sample 32] [--leftovers]` prints the coverage and the tables below.

## 2. Trajectories

A shape's `path` (`src/sim/shapes.ts`, integer math, deterministic). The aim is always the player's own; the path is
the move's. The telegraph draws the path honestly while aiming (hold to aim) and during the windup:

| path | in play | telegraph |
|---|---|---|
| straight | the default | a capsule to the first wall |
| `lob` | arcs over walls, props and fighters on the way up; comes down on the first foe under it once it has risen 140 px, else bursts (`blast`) where its range ends | an arc over its ground shadow, a landing circle |
| `boomerang` | turns back at half range, can hit again on the way home, caught by its owner | out and back, the turn point marked |
| `zigzag` / `weave` / `spiral` | steer off the line (a crackling bolt, a fluttering shot, a corkscrew that widens) | the wiggle itself |
| `bounce` | ricochets off walls (`bounces`) | the reflected path |
| `phase` | passes through walls | the full line through them |
| `drift` (areas) | a storm that moves along the aim, stopped by walls | an arrow and where it ends up |
| `leap` (dashes) | out of reach in the air (passes over fighters), bursts where it lands | an arc and a landing circle |
| homing (Psychic only) | a capped turn toward the nearest foe; never on a `phase` shot; stops at walls like any shot | the curve toward the foe |

New shape features: a shot with `blast` detonates where it ends (it hits everyone else near that point; the direct
target only once); an aimed area with `count` lands a line of impacts ending at the aim point, `stagger` ticks apart,
spaced so one fighter is never under two (Rock Slide); a multi-shot volley hits each target once (it is one attack).

**Walls** (`src/sim/walls.test.ts`): only a `phase` shot passes a `#` wall or an `o` prop; a `=` low obstacle is
flown over and a lob flies over everything. Everything else a shot brings stops at them too: a shot hits only a foe in
sight of its centre (`terrain.inSight`), so a grown moon or a wave's band overlapping a wall doesn't reach behind it;
a `blast`, a fused burst and a 1v1 bench splash hit only what their centre can see; a shot landing on a prop blasts
against it before breaking it; two walls touching at a corner are a seam no shot slips through; a big shot from a
caster hugging a wall starts on the caster's side. Phase shots never home (the Psychic flavour skips them), so no
shot can follow you through a wall. Same-tier tournament against main `3ea4274`: basic time to KO p50 21.5 -> 21.5 s,
types unchanged within 0.5 points (Psychic 52.6% -> 52.3%); Lunala, both Cresselias, Clefable, Tapu Lele-GX and Starmie
the same; the ghostly phase shots that lost their homing dropped a little (Banette 47% -> 24%, Dusclops 73% -> 50%,
Banette-GX 88% -> 81%, Dusknoir 40% -> 33%, on 12-16 games each).

## 3. The archetypes

`what` is how it plays; sizes grow with the energy cost and the damage.

| archetype | attacks | what |
|---|---:|---|
| `aura` | 173 | a self move (heal, charge, draw, guard) |
| `tackle` | 93 | a short body charge (no i-frames) |
| `slash` | 72 | a wide 180° slash with a step in |
| `bite` | 71 | a snapping lunge |
| `orb` | 65 | a slow, big orb |
| `max` | 63 | a colossal pillar crashing down (Max / G-Max, VSTAR) |
| `hammer` | 53 | an overhead smash on a circle just ahead |
| `charge` | 46 | a long heavy charge that bowls over, committed (no i-frames) |
| `punch` | 44 | a straight lunging punch that shoves |
| `bolt` | 41 | a fast thin crackling bolt |
| `beam` | 40 | an instant line |
| `blade` | 37 | a long lunge that ends in a slice |
| `jab` | 36 | a quick close poke with a little shove |
| `leap` | 30 | leaps / digs out of reach, then crashes down where it lands |
| `blink` | 30 | vanishes and reappears with a strike |
| `sound` | 29 | a sound ring from you |
| `nova` | 29 | a burst of energy all around |
| `quick` | 27 | a blink-fast dash with i-frames |
| `kick` | 27 | a lunging kick with a solid push |
| `spin` | 26 | a spin that hits all around |
| `zap` | 26 | a crackling bolt beam, quick to fire (Thunderbolt) |
| `roll` | 26 | a long rolling run |
| `tail` | 24 | a wide tail sweep that knocks away |
| `snow` | 24 | a wide freezing flurry (slows) |
| `phase` | 24 | a slow shadow that passes through walls |
| `blast` | 24 | an energy orb that detonates |
| `fireball` | 21 | a big fireball that explodes and scorches |
| `drain` | 21 | a tether that siphons |
| `horn` | 21 | a long narrow thrust |
| `grab` | 21 | a grab that pulls in and holds |
| `rage` | 21 | a furious rush |
| `ball` | 21 | a slow big orb that bursts |
| `barrage` | 20 | a tight burst of needles / icicles |
| `scratch` | 20 | a 135° claw rake |
| `whip` | 19 | a very long, very narrow lash that reels the foe in |
| `gust` | 18 | a wide blast of wind that blows the foe away |
| `fan` | 18 | a short fan of three fast embers |
| `stars` | 18 | three fluttering stars (Swift) |
| `powder` | 17 | a lingering cloud just ahead |
| `glare` | 17 | a long narrow glare |
| `leaves` | 16 | three spinning blades that cut through |
| `lob` | 15 | an arcing lob over walls and props that bursts where it lands |
| `hazard` | 15 | a drifting storm that moves along the aim |
| `heat` | 15 | a close burst of heat |
| `stream` | 14 | a thin stream that nudges |
| `thunder` | 14 | a bolt from the sky a beat after you call it |
| `hyperbeam` | 14 | a huge, wide beam after a long charge |
| `pillar` | 14 | a column / eruption on the aim point, telegraphed |
| `wing` | 13 | a swoop with wide wings |
| `jet` | 13 | a jet-propelled rush |
| `hypno` | 12 | a slow wide wave that sways (sleep) |
| `combo` | 12 | a flurry of blows (its coins decide the damage) |
| `peck` | 12 | a fast narrow beak stab with a short step in |
| `breath` | 12 | a cone of breath |
| `counter` | 12 | a wide counter-swing that pushes back |
| `flame` | 11 | a long narrow jet of fire |
| `throw` | 11 | grab and hurl far |
| `flail` | 11 | thrashing about, all around, short |
| `spit` | 11 | a gob that clings and slows |
| `pulse` | 10 | a thick, shorter beam |
| `wave` | 10 | a wide wall of water that rolls forward through everything (a band ~2.8x its old radius wide, thin) |
| `rain` | 10 | a cloudburst on the aim point |
| `gas` | 9 | a lingering cloud around you |
| `vortex` | 9 | a lingering vortex on the aim point (Whirlpool, Fire Spin) |
| `quake` | 9 | a shockwave ring through the ground (slows) |
| `ripple` | 9 | a broad ring of force rolling forward through everything (a wavefront 60 px wide) |
| `bullet` | 9 | a quick straight shot |
| `sniper` | 9 | a long aim, then a very fast piercing shot |
| `hydro` | 8 | a long thick jet that blasts the foe away |
| `mud` | 8 | grit in the face (slows) |
| `uppercut` | 7 | a rising blow that launches |
| `slam` | 7 | a heavy close blow |
| `bubble` | 6 | slow floaty bubbles |
| `flamecharge` | 6 | a burning charge that scorches where it stops |
| `explode` | 5 | a huge blast after a long fuse |
| `rockslide` | 5 | a line of rocks crashing down one after another |
| `weave` | 5 | a weaving, fluttering shot |
| `surf` | 5 | a great wave surging out from you |
| `chop` | 4 | a narrow chop that staggers |
| `web` | 4 | a sticky net (slows hard) |
| `solar` | 3 | the longest charge, then a huge beam |
| `seed` | 3 | a slow seed that wobbles on its way |
| `lance` | 3 | a fast spear that pierces through |
| `stomp` | 3 | a short quake around the feet (slows) |
| `sphere` | 2 | a heavy orb that bursts (Aura Sphere) |
| `roar` | 1 | a short, wide blast of sound |
| `field` | 1 | reshapes the ground (a Stadium) |
| `boomerang` | 1 | flies out and returns, hitting on both legs |
| `bounce` | 1 | ricochets off walls |
| `strike`, `cloud`, `meteor` | 0 | a dash-in blow, a lingering aimed cloud, a strike from above: reachable from the stems and the text, unused by today's pool |

## 4. Per-move rationale (a sample of 32)

Spread over the card pool, one per archetype first (`lexicon.ts --sample 32`):

| card | attack | energy | damage | became | from | why |
|---|---|---:|---|---|---|---|
| Alakazam | Confuse Ray | 3 | 30 | `orb` | names | a slow glowing ball (Psychic: it homes) |
| Dugtrio | Earthquake | 4 | 70 | `quake` | name | a ring through the ground around you, never a shot |
| Chansey | Scrunch | 2 | - | `aura` | text | no damage, nothing on the foe: a self move |
| Poliwhirl | Doubleslap | 3 | 30× | `combo` | name | a flurry; the coins decide the damage |
| Clefairy | Sing | 1 | - | `hypno` | name | a slow swaying wave that puts you to sleep |
| Ponyta | Smash Kick | 2 | 20 | `kick` | name | a lunging kick that pushes |
| Pikachu | Gnaw | 1 | 10 | `bite` | name | a snapping lunge |
| Zamazenta | Shield Press | 3 | 100 | `hammer` | name | an overhead smash on a circle just ahead |
| Ho-Oh | Fire Wing | 3 | 100 | `wing` | name | a swoop with wide wings |
| Drifloon | Float Up | 1 | 20 | `leap` | name | up out of reach, then down |
| Pikachu ex | Thunder | 3 | 200 | `thunder` | name | called down from the sky on the aim point, a beat late: step out |
| Alolan Exeggutor | Mega Drain | 4 | 150 | `drain` | name | a tether that siphons |
| Pikachu | Rollout | 2 | 30 | `roll` | name | a long rolling run |
| Cherubi | Flop | 1 | 10 | `slam` | names | flopping onto you |
| Unown | Mysterious Signal | 2 | 40 | `weave` | names | a wavering signal |
| Azumarill | Bubble Shower | 3 | 30 | `bubble` | name | slow floaty bubbles |
| Magmar | Tail Slap | 2 | 20 | `tail` | name | a wide sweep that knocks away |
| Feraligatr | Riptide | 3 | 10+ | `jet` | name | a jet-propelled rush through the foe |
| Heracross | Megahorn | 3 | 60 | `charge` | names | a horn-first charge |
| Jumpluff | Sleep Powder | 1 | 20 | `powder` | name | a cloud just ahead that lingers |
| Swinub | Powder Snow | 1 | 10 | `snow` | name | a wide freezing flurry that slows |
| Gyarados-GX | Dragon Rage | 4 | 130 | `breath` | names | a raging breath cone |
| Koffing | Tackle | 1 | 20 | `tackle` | name | a short body charge |
| Clefairy | Pound | 1 | 10 | `jab` | name | a quick poke |
| Scyther | Sharp Scythe | 2 | 30 | `slash` | name | a wide slash with a step in |
| Charizard-GX | Crimson Storm | 5 | 300 | `hazard` | name | a firestorm that drifts along the aim |
| Glaceon-GX | Polar Spear-GX | 3 | 50× | `horn` | name | a long narrow thrust |
| Darkrai-GX | Dark Cleave | 3 | 130 | `blade` | name | a long lunge ending in a slice |
| Murkrow | Peck | 1 | 10 | `peck` | name | a fast narrow stab |
| Hisuian Goodra V | Slip-'n'-Trip | 2 | 60 | `flail` | name | thrashing about |
| Magnezone V | Splitting Beam | 3 | 90 | `beam` | name | an instant line |
| Giratina VSTAR | Lost Impact | 3 | 280 | `nova` | names | a huge blast all around it (a hand-picked name: "impact" alone would be a charge) |

Choices worth naming:

- **Homing is the Psychic type's alone.** The move-design pass gave homing to orbs, seeds, stars and Aura Sphere; the
  user asked for manual aim, so those archetypes wobble or weave instead, and only Psychic shots curve (gently).
- **Ghostly names pass through walls** (`phase`: Eerie, Spooky, Curse, Nightmare, Hex), but "Shadow Claw" and
  "Shadow Slash" are claws and slashes, and "Shadow Ball" is a bursting ball.
- **Dynamax moves are pillars from the sky** (`max`), telegraphed for 32 ticks: you see them coming.
- **Dashes commit.** Only `quick`, `leap` and `blink` keep i-frames; tackles, charges, rolls and rushes can be hit.
- **Self moves never hit and hitting moves are never self moves**, whatever the name says ("Growth" that deals 30 is
  not a buff).

## 5. The type flavour and movement

Each type's trait applies to every attack of that element unless a kit (or one attack) sets `flavor: false`.

| type | attack trait | movement | recovery |
|---|---|---|---:|
| Psychic | gentle homing on a single shot (at most 1 binary degree a tick toward the nearest foe; volleys fly straight), a slower shot (never under 10 px a tick), -10% damage | blink dodge (the roll is instant), hovers (no shallow-water slowdown, unhurt by lava / live water) | 1.00 |
| Fire | shots leave a short burning trail (45 ticks); other shapes scorch where they land; -15% damage (balance) | the roll leaves flames | 1.00 |
| Water | pushes back and floods; +15% damage (balance) | wades fast (130% in water) | 1.00 |
| Lightning | the fastest shots, arcs into a foe standing in water or live water (`chain`); +15% damage (balance) | a quick, short-cooldown roll | 0.75 |
| Grass | roots (slow) and drains a little | runs through tall grass (125%) | 1.00 |
| Fighting | armour while winding up (-25% damage taken, no knockback), bigger knockback; +10% damage (balance) | the roll shoulders foes aside | 1.25 |
| Darkness | ambush: +30% from behind or into a foe mid-cast; longer lunges | blink dodge | 1.00 |
| Metal | heavy: slower shots, braces after casting, breaks props twice as fast; -4% damage | not knocked back (`noKnockback`) | 1.25 |
| Dragon | shots pierce the first target; wider beams | (fliers are species, not a type) | 1.00 |
| Fairy | charm: the target's attacks are weaker for a TURN | a long floating dodge, hovers | 1.00 |
| Colorless | reliable: a quicker windup and recovery | | 0.85 |

The movement traits use arena main's names (fix-movement's `MoveTraits`: `crossWater`, `hover`, `fly`, `speedIn`,
`noKnockback`, plus this branch's `dodge`). **No type sets `fly` or `crossWater`**: who flies is the species list
(`data/flying.json`, fix-movement). A kit may set any of them in `move`.

## 6. The audit

`npx vite-node tools/kits/audit.ts --top 60` compares the 60 attacks the bots and the collection field most often,
before this branch (arena main `ba2f52e`: the kit file, else the old auto-kit families) and now. The full table is
`docs/moves-audit.md`. 12 of the 60 had a gross mismatch before: a shape of the wrong range class for the name.

| attack | before | now | |
|---|---|---|---|
| Headbutt | a melee swipe | a short body charge | a headbutt is you, moving |
| Heavy Impact (Dialga) | a ring around it | a leap that crashes down | airborne, then the impact |
| Revenge Blast (Zamazenta V) | a dash | a detonating orb | a blast |
| Surprise Attack | a shot | vanish and reappear with a strike | a surprise |
| Mega Drain / Absorb | an area on the aim point | a siphoning tether | a drain |
| Heat Blast (Charizard V) | a long beam | a close burst of heat | heat, not a laser |
| Poisonpowder (Ivysaur) | a cone | a lingering cloud just ahead | powder hangs in the air |
| Aqua Return (Lumineon V) | a beam | a jet-propelled rush | it returns by swimming through you |
| Pay Day | a melee swipe | a flicked coin | coins fly |
| Boulder Crush, Hammer In | a melee swipe | a smash on a circle just ahead | overhead and heavy |

Across all 730 hand attacks, 297 disagreed with their name's kind; the build replaces the 163 of those in another
range class (close / ring around you / ranged / aimed / self). The rest are close cousins (a lunging melee for a
tackle, a beam for a bolt) and keep their authored shape. `npm run kits:build` prints the count.

## 7. Screenshots

`node tools/move_shots.mjs` (Vite in-process, headless Chromium, a stand-in collection from the card data; nothing
else is started) writes the crops to `shots/moves/` and two contact sheets:

- `shots/moves/sheet-moves.png`: 16 marquee moves with their telegraphs (Earthquake, Thunder, Hydro Pump, Rock Throw
  over a wall, Leaf Boomerang, Body Slam, Surf, Ember, Razor Leaf, Rock Slide, Hurricane, Thunder Shock, Fire Spin,
  Swift, Take Down, Psychic);
- `shots/moves/sheet-types.png`: the eleven type traits. The dodge styles (blink, flame roll) are covered by
  `src/sim/paths.test.ts` rather than pictures: the demo bots dodge too rarely to catch one on camera.

How each archetype is **drawn** (a wave is a wall with a crest, not a ball) and the two hit shapes that changed for it
(`wave` and `ripple` roll as walls, `shape.wall`) are in `docs/VFX.md`, with a before / after sheet of every ranged,
area and cone archetype (`node tools/move_shots.mjs --sheet vfx`).

Staging (a demo nicety, not the rules): the attacker's meter is kept full, both fighters' HP is refilled, and the
foe (Gyarados VMAX) has an empty meter, so the picture is taken before anyone is knocked out.

## 8. Where the move-design pass went

The unfinished pass on branch `pack-redesign-restore` (9239d2b) is folded in, not merged: its archetypes (jab to
max), its `EXACT` names and its keyword `RULES` live in `lexicon.ts` (its ids renamed where this lexicon already had
one: `strike` is `pillar`, `snipe` is `sniper`, `volley` is `barrage`...), its `move_shots.mjs` is ported onto the
stand-in collection. Left out: its homing (see above), the `mimic` op (Metronome is an orb here), and `cardfx.ts`:
`src/sim/cardtext.ts` already reads every card's text into effects (one parser), and its 228 kit files, which arena
main's 605 hand kits supersede.

## 9. Signature moves

"How did Psychic and Power Gem turn out the same? ... I wanted a big chunk of the moves to get this treatment."

### Why they looked the same

- **Hand kits ignored the trajectory.** `kit.ts lookFor` took only the archetype's *look* id (and a wave's wall
  width) for a hand kit; the shape stayed the kit's own. 225 of the 989 hand-kit attacks did not fly like their
  archetype (a Pikachu "Thunder Jolt" was a plain shot, not a zigzag bolt; a Magikarp "Tackle" a swing, not a charge;
  Starmie's "Star Freeze" a plain shot).
- **Broad buckets.** The lexicon put many unlike names in one archetype: Power Gem was a generic `beam`, Shadow Ball
  the generic `ball` (with Electro Ball and Zen Shot), Psyshot and Magical Shot the generic `orb`, every Max move one
  plain pillar. On Starmie (`data/kits/swsh9-55.json`) Psychic and Power Gem were both plain shots with the same
  Psychic homing, so they flew and looked nearly alike.

### The fix

- **Hand kits adopt their archetype's trajectory** (`kit.ts adoptShape`, at resolve time, so every kit file and the
  pilots too). The same kind: the trajectory params the kit doesn't set (`TRAJECTORY`: path, amp, period, bounces,
  drift, wall, blast, count / spread, split, fuse, stick, grow, scatter...); its sizes stay its own, and a single shot
  taking a volley gets 0.7x its radius (its reach budget). Another kind: the archetype's shape, with the kit's reach
  between two ranged shapes (shot, beam, aimed area). Kept on purpose: a kit's shot under a beam archetype (dodgeable;
  a beam hits at once), a Max move's kind, a kit's single area (a line or scatter of impacts is drawn, not added), a
  broad bucket (`Archetype.generic`: orb, beam, blast, ball, bullet, nova, max, strike, slam, jab), self moves and
  Stadiums. **Opt-out**: `KitAttack.pin` (the reason), from a spec's `!` and its note; 13 attack names, each a balance
  fix recorded in its note (e.g. Charizard's Royal Blaze cone, Greninja ex's Stealthy Slash as a slash).
- **56 signature moves** (`src/sim/signatures.ts`): each an archetype with its own trajectory and look, claiming 187
  attack names (337 attacks) by whole name and keyword rule, ahead of the lexicon's own tables. The look is drawn by
  `src/render/sig/<family>.ts` (docs/VFX.md section 6). Plus 13 of the lexicon's iconic looks redrawn (Flamethrower,
  Hydro Pump, Thunderbolt, Water Gun, Solar Beam, Hyper Beam, Ember, Thunder, Earthquake, Razor Leaf, Bubble, Gust,
  Horn Attack).

| family | signature (the names it claims in the pool) | trajectory |
|---|---|---|
| psychic | `psychic` Psychic, Psyshock, Psystrike, Psycrush, Telekinesis, Synchro / Moon Kinesis | a slow mind-orb (the type's homing) |
| | `powergem` Power Gem | a fast gem that **splits** into a fan of 5 shards (40% each) where it ends |
| | `psybeam` Psybeam, Psylaser, Psyray, Midnight Ray, Rewind Beam | a beam of rainbow rings |
| | `confuse` Confuse Ray, Perplex, Headache, Distort, Chaotic / Mirror Pain | a woozy wisp that weaves |
| | `psyshot` Psyshot, Magical Shot, Zen Shot, Mind Blast, Psydrive, Psy Purge, Psyburn, Photon Boost, Super Psy, Psychic Sphere | a fast thin dart |
| | `heart` Lovely Kiss, Draining Kiss, Loving Sympathy, Lovely Star | two hearts **braiding** (helix) |
| | `sing` Sing, Singing Voice, Lordly Songleader, Alluring Dance | three notes braiding |
| | `moonblast` Moonblast, Lunar Blast, Moon Impact, Moonglow Reverse, Moon Dance | a moon that **grows** as it flies and bursts |
| | `gleam` Dazzling Gleam, Dazzle Blast, Miraculous / Wonder Shine, Bloomshine, Floodlight, Dede-Flash, Lighting | a prismatic flash all around |
| | `fairywind` Fairy Wind, Trick Wind, Plea | a glittering cone that blows back |
| | `mimic` Metronome, Super Metronome, Mirror Move, Cross Fusion Strike, Coinciding Figures | a mirror shard that ricochets |
| fire | `fireblast` Fire Blast, Explosive Fire, Magical Fire, Bright Flame | a fireball bursting in the five-armed star |
| | `willowisp` Will-O-Wisp, Eerie Glow / Light, Flickering Glow | three blue wisps braiding |
| | `fireworks` Fireworks, Kaboom Needles | a rocket splitting into a **ring** of 8 sparks |
| | `juggle` Flare Juggling, Fireball Fever | three lobbed fireballs in a spread (one hit per foe) |
| | `sacredfire` Sacred Fire, Phoenix Burn, Royal Blaze, Laser Flame | a rainbow-edged phoenix flame beam |
| water | `bubblebeam` Bubblebeam, Bubble Shower, Bubble Drain | five bubbles braiding |
| | `icebeam` Ice Beam, Freeze, Freeze Down, Ice Path | a crystalline beam that slows |
| | `aurora` Aurora Beam, Aurora Gain, White Ray | a rainbow ribbon beam |
| | `starfreeze` Star Freeze | a spinning ice star (corkscrew) that slows |
| | `icicle` Icicle Missile, Icicle Shot, Frost Bullet | three icicles that each shatter into chips |
| | `hail` Hail | 4 impacts **scattered** around the aim point (slows) |
| | `crabhammer` Crabhammer, Crab Impact, Raging / Cyclone Pincers | a giant pincer slamming down just ahead |
| | `watershuriken` Water Shot, Water Drip, Water Arrow, Schooling Shot | three spinning water stars in a tight fan |
| electric | `electroball` Electro Ball, Electric / Pika / Lightning / Spark Ball | a crackling sphere that grows and bursts |
| | `discharge` Discharge, Shorting Spark, Big Sparking, Lightning Rondo | arcs all around you |
| | `zapcannon` Zap Cannon, Electroblast, Teraspark | a huge slow orb that grows and bursts |
| | `pinmissile` Pin Missile, Twineedle, Photon Bullets | four darts braiding |
| | `poisonsting` Poison Sting, Poison Barb | a quick burst of venom barbs |
| nature | `airslash` Air Slash, Cutting Wind, Gale Blade, Razor Wing | two crescent blades that cut through |
| | `petals` Petal Dance, Flower Dance, Flower Spin | a whirl of petals around you |
| | `seedbomb` Seed Bomb | a lobbed seed that **sticks** and bursts a beat later (`fuse`) |
| | `sludgebomb` Sludge Bomb, Garbage Attack, Dredge Up | a lobbed glob that bursts and splatters into droplets |
| | `grassknot` Grass Knot, Tempting Trap | a root racing under the ground (through walls) that snares |
| | `stoneedge` Splintered Shards, Rocky Avalanche | stone spikes bursting up in a line |
| shadow | `shadowball` Shadow Ball, Shadow Bullet, Shadow Impact | a roiling ball that grows and bursts |
| | `darkpulse` Dark Pulse, Night Daze, Dyna Barrier | rings of dark energy rolling out as a wall |
| | `tickingcurse` Ticking Curse, Ticking Terror | a cursed timer through walls that **clings** to the foe (`stick`) and blows |
| | `dragonpulse` Dragon Pulse, Spiral Burst | twin serpents coiling along a beam |
| | `dracometeor` Draco Meteor, Shoot Meteors, Star Raid | meteors scattered around the aim point |
| force | `payday` Pay Day | a spray of three coins |
| | `triattack` Tri Attack, Elemental Blast, Trinity Nova | fire, ice and thunder orbs braiding |
| | `flashcannon` Flash Cannon, Core Beam, Power / Windup Beam, Energy Stream, Blinding Beam | a blinding silver beam |
| | `aurasphere` Aura Sphere, Aura Sphere Volley | a blue aura sphere that bursts |
| | `revengeblast` Revenge Blast | a crimson orb that grows and bursts |
| | `hypervoice` Hyper Voice, Boomburst, Synchro Loud, Sonic Volume, Bug Buzz | a wall of sound rolling through |
| max | `maxfire` `maxwater` `maxice` `maxleaf` `maxbolt` `maxpsy` `maxdark` `maxfist` `maxsteel` `maxdragon` (35 Max / G-Max moves and VSTAR stars) | each element's own colossal column |

### New shape features (`src/sim/shapes.ts`, integer math, deterministic)

| param | what | telegraph | explained as |
|---|---|---|---|
| `split` (+ `splitSpread`, `splitSpeed`, `splitRange`, `splitR`, `splitPower`) | where a shot ends it shatters into shards (a fan round its heading, or a ring; off a wall they fan back), each hitting for its share (`CastInfo.scale`); they never re-hit what the shot hit | the shard fan at the end | "shatters into 5 shards (40% damage each)" |
| `fuse` (+ `blast`, `stick`) | a shot sticks where it ends (on a foe it touches: no hit) and bursts `fuse` ticks later; `stick` rides on the foe it touched | the burst ring and a clock mark | "sticks where it lands and bursts 0.3 s later" |
| `grow` (+ `growMax`) | a shot swells as it flies | | "swells as it flies" |
| path `helix` | a volley braids around the aim line (each shot a phase apart) | each strand | "braided around the aim line" |
| `scatter` (areas with `count`) | the impacts land around the aim point, never nearer than a line's spacing (one fighter is never under two) | every circle | "4 impacts scattered 4 tiles around the aim point" |

Also: a volley of bursting shots now hits a foe once (a `blast` marks its volley), and a telegraphed area (or a fused
shot) sends a render-only `landed` event for its look's flourish. The damage preview (`predict.ts`) dry-runs all of
them through the sim's own code (tests: `src/sim/signature.test.ts`); the bots aim them like any shot or area.

### Coverage (`npx vite-node tools/kits/signature.ts`)

"Specific": a deliberate pick by name (a signature, a hand-picked name or a keyword rule) of an archetype that is not
a broad bucket; "generic": a broad bucket, a coarse stem or only the text. Self moves have no attack to draw.

| | before (main `7a1060d`) | after |
|---|---:|---:|
| attacks with a specific look (of 1,872) | 1,401 (74.8%) | **1,610 (86.0%)** |
| attacks in a generic bucket | 297 (15.9%) | 88 (4.7%) |
| attacks with a signature move | 0 | 337 (187 names, 56 signatures) |
| hand-kit attacks flying like their archetype (of 989) | 764 (77.3%) | **914 (92.4%)** |

The rest of the hand-kit attacks: 25 pinned, 14 under a broad bucket, 36 kept on purpose (a shot under a beam
archetype, a Max move, a kit's single area). `src/sim/signature.test.ts` holds a floor on all of these over the bot
roster.

### Balance

Same-tier tournament (`npm run kits:tournament`, 8 per fighter, normal bots), main `57291f8` (with the human-like bot
reactions) against this branch merged onto it, same machine. Time to KO p50: basic 21.5 -> **21.5 s**, stage 1 15.7
-> 15.7 s, rule-box 22.0 -> 21.9 s, VMAX 24.9 -> 24.9 s. Kits at >= 90% / <= 10%: 42 / 64 -> 40 / 62. Starmie
(swsh9-55): **100% -> 74%** of Stage 1 fights (Power Gem keeps the kit's r10 trim; its shards never re-hit the foe it
struck).

| type | before: win / median KO | after |
|---|---|---|
| Grass | 47.1% / 21.4 s | 48.2% / 21.4 s |
| Fire | 57.3% / 17.0 s | 57.7% / 15.9 s |
| Water | 45.2% / 20.6 s | 46.3% / 18.6 s |
| Lightning | 44.8% / 18.5 s | 44.5% / 18.5 s |
| Psychic | 53.2% / 18.9 s | 52.6% / 18.9 s |
| Fighting | 49.7% / 20.1 s | 48.7% / 21.0 s |
| Darkness | 51.7% / 20.2 s | 52.7% / 20.0 s |
| Metal | 54.1% / 21.6 s | 53.5% / 20.0 s |
| Fairy | 48.4% / 24.6 s | 47.9% / 24.6 s |
| Dragon | 54.0% / 18.6 s | 53.8% / 18.5 s |
| Colorless | 44.2% / 21.5 s | 43.2% / 21.5 s |

Bots: a volley (a fan, a braid, a shot's shards) is one threat to dodge (one notice, one plan), and a wiggling shot
is read along its mean line. The difficulty ladder (`src/bots/ladder.test.ts`) orders the levels as before: normal / easy
18-6, hard / normal 13-11, expert / hard 16-8 (main: 15-9, 14-10, 16-8).

Fixed on the way (each seen in the tournament): a volley of bursting shots hit a foe once per shot (Flare Juggling
won 90%); a single shot taking a volley kept its full radius (Piplup's Bubble); a kit's big area split into a line of
archetype-sized impacts (Articuno's Hail 0-17%, Aggron V's Rock Slide); Petal Dance lingered long enough to hit twice;
Ticking Curse's first fuse could simply be walked out of (it now clings to the foe it touches). Five hand attacks were
pinned with the reason in their note (Greninja ex's Stealthy Slash, Rapid Strike Urshifu VMAX's Gale Thrust, Espeon
ex's Solar Beatdown, Hisuian Zoroark VSTAR's Ticking Curse, Articuno's Hail).

Contact sheets: `node tools/sig_shots.mjs` writes `shots/signature/sheet-<family>.png` (telegraph / in flight /
impact per move) and `sheet-pair.png` (Starmie's Psychic against its Power Gem).
