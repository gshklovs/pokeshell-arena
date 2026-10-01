# Melee: making close-range attacks feel like their names

"All the melee attacks are so lame still. Could we spec out adding flavor to them?" This page is the answer: why melee
feels flat today (with numbers), what great action games do about it, the melee flavour system for this game's rules,
and the build plan. It sits next to `docs/MOVES.md` (how every attack's name picks its shape) and `docs/KITS.md`
(kits and type flavours): the move lexicon still decides *that* an attack is melee; this page decides *how it plays*.

## 1. Diagnosis: why melee feels lame today

### 1.1 How much of the game is melee

`npx vite-node tools/melee/stats.ts --pool` over the 1,872 attacks in the card pool:

- **855 attacks (46%) resolve to a melee-ish archetype** in the move lexicon: tackle 93, slash 72, bite 71, hammer 53,
  charge 46, punch 44, blade 37, jab 36, leap 30, blink 30, quick 27, kick 27, spin 26, roll 26, tail 24, horn 21,
  grab 21, rage 21, scratch 20, whip 19, wing 13, jet 13, combo 12, peck 12, counter 12, throw 11, flail 11,
  uppercut 7, slam 7, flamecharge 6, chop 4, stomp 3.
- After the hand kits, **513 attacks are `melee` shapes and 280 are `dash` shapes: 42% of all attacks** (the rest:
  area 318, projectile 308, self 172, beam 167, cone 113).

So nearly half of what players field is close-range, and it all goes through two code paths.

### 1.2 What a melee hit is today

Read from `src/sim/shapes.ts` (`release`, `case 'melee'`), `src/sim/lexicon.ts`, `src/sim/kit.ts`,
`src/render/renderer.ts` (`drawSwings`, `feed`) and `src/audio/sfx.ts`:

| | today |
|---|---|
| reach | 62–124 px of arc from the body, plus a lunge of 16–110 px (a jab is 62 + 20, a slash 80 + 24, a bite 58–74 + 50–90). A fighter is 20–30 px in radius and walks 3–5 px a tick |
| windup | the sim minimum (`6 + damage / 20` ticks, + heavy cards) or the archetype's: 7 ticks (0.12 s) for a jab or a small punch, 9–12 for slashes, blades, uppercuts |
| the swing | **one tick.** On release the lunge **teleports** the attacker forward, then one `inCone` test decides hit or miss for everyone, and it's over. There are no active frames, no sweep, no strings: a "Fury Swipes" or a "Double Kick" is one blob |
| recovery | `18 + damage / 9` ticks (a 20-damage jab 0.33 s), the same for melee and ranged |
| on hit | the card's effects plus the archetype's "feel": a shove (jab 24 px, punch 70–120, kick 60, throw 200), a slow (chop), a pull (whip, grab). No stagger, no interrupt, no hold, no throw direction, nothing about walls |
| hit feedback | shared by every attack: a damage number, a type-coloured particle burst, a ring, `shake = 3 + dmg / 5`, a render-only hit-stop of **3 ticks at 30+ damage, 5 at 60+** (none under 30, i.e. for most jabs and bites), the target's white flash and squash |
| visuals | `drawSwings`: a 10-tick wedge at 16% opacity and one crescent stroke. The swing is drawn *after* the hit has already resolved, and every archetype (bite, kick, claw, horn, whip, grab) draws the same crescent |
| sound | the element's cast sound at the **start of the windup**; on contact the generic `hit` (noise + triangle). Nothing on the release itself: the swing is silent |
| telegraph | a flat wedge of `range + lunge` (the lunge is folded into the reach; you can't see the step-in, strings, a grab or a throw) |
| dashes | tackles, rams, headbutts, take downs: a capsule that hits what it passes and ends; Tackle and Take Down differ only in numbers |

### 1.3 How often melee lands, and what it's worth

`node tools/melee/run.mjs --per 4` (half the cores): 3,088 bot-vs-bot 1v1s at Normal, same-tier foes from the Basic,
Basic+ and Stage 1 tiers, fight median 19.1 s. Every release is classed by its shape, every hit is credited to it:

| class | releases | connect | damage share | damage per release |
|---|---:|---:|---:|---:|
| melee | 21,615 | **18%** | 30% | **5.2** |
| dash | 10,770 | 30% | 21% | 7.4 |
| ranged (everything else) | 19,024 | 31% | 50% | 9.9 |

| main attack is | win rate | games |
|---|---:|---:|
| melee | **44%** | 1,881 |
| dash | 54% | 1,160 |
| ranged | 50% | 3,135 |

Melee-or-dash-first kits against ranged-first kits: 47% of 1,533 matches.

The worst archetypes (releases, connect): chop 7%, leap 8%, blink 8%, uppercut 8%, peck 12%, scratch 13%, grab 13%,
horn 13%, bite 14%, kick 14%, jab 15%, whip 15%, punch 16%. The ones that land are the wide or long ones: wing 57%,
jet 50%, roll 46%, spin 41%, rage 38%, quick 37%, tackle 35%, tail 35%.

So a melee press is **worth half a ranged press** and misses four times out of five. Why:

1. **One-tick hitboxes against a locked aim.** The aim locks for the windup (the telegraph), the foe keeps walking
   (3–5 px a tick, 20–60 px over a windup), and the swing checks exactly once. Narrow arcs (peck 36, horn 22, chop 36
   binary degrees) almost never survive that.
2. **The lunge is a teleport, not a step-in**, so it can't catch a foe that drifts during the swing, and it reads as
   nothing on screen (a one-frame hop).
3. **No reward for the risk.** Closing to 80 px costs you (you eat their shots on the way in) but a landed jab gives
   the same number a shot would, with no stagger, no combo, no wall play. Ranged is strictly safer.
4. **Players**: the arena records no human telemetry, so there are no human connect rates. The bot numbers are the
   best proxy, and the first-person read is the same: you press, a faint wedge blinks, a number maybe appears.

### 1.4 Before: storyboards and clips

`node tools/melee/shots.mjs --video` (the real game page, a stand-in pokeshell, temp state only) steps each of the
24 most-fielded melee attacks tick by tick from windup to aftermath, into `shots/melee-before/` (gitignored):
`strip-<attack>.png` (9 frames, captioned with the windup tick or the ticks since release) and `<attack>.webm`.
Tackle, Slash, Bite, Ram, Gnaw, Pound, Spinning Attack, Headbutt, Heavy Impact, Mega Punch, Rear Kick, Quick Attack,
Body Slam, Seismic Toss, Counter, Fury Swipes, Stomp, Wing Attack, Dig, Dragon Claw, Vine Whip, Karate Chop,
Take Down, Double Kick. What they show: the wedge is nearly invisible against the arena art, the frame of the hit
looks like every other frame, and a Seismic Toss, a Counter and a Pound are the same picture.

## 2. What great action games do

| technique | where it shines | what makes it work |
|---|---|---|
| **Step-in / lunge** | Hades (Sword dash-strike), Dead Cells, Zelda: Breath of the Wild | the attack moves you over its active frames, so aim + motion carry it to a drifting target; it reads as commitment |
| **Active frames and sweeps** | Smash Bros (every move has startup / active / endlag), Brawlhalla | a hitbox that lives 2–6 frames and sweeps an arc: forgiving to land, readable to dodge |
| **Clear telegraphs** | Pokémon Unite (ground indicators), Hades (enemy tells), Emerald Arena | the shape of the danger on the ground before it lands; for the attacker, the aim preview is the promise |
| **Hitstop scaled to damage** | Smash (hitlag = f(damage)), Street Fighter, Hades | freezing both fighters 2–15 frames sells weight; a light jab barely pauses, a smash stops the world |
| **Knockback direction and wall bounces** | Smash (angles, DI), Brawlhalla, Tekken (wall splats) | where the hit sends you is a decision; walls turn position into reward |
| **Strings, launchers, finishers** | Hades (3-hit Sword combo, the third hits hardest), Brawlhalla, Dead Cells | light, light, heavy: rhythm, and a finisher that pays off the taps |
| **Grabs and throws** | Smash, Brawlhalla, Street Fighter | beats blocking/turtling; the throw direction is the reward (into a wall, off a ledge) |
| **Counters / parry windows** | Hades (Aegis), Sekiro, Street Fighter III parry, Unite's Lucario | a short window that turns the foe's commitment into yours |
| **Armour on windup** | Smash (super armour smashes), Unite (unstoppable), Dark Souls heavies | lets heavies trade instead of being poked out |
| **Multi-hit flurries** | Pokémon (Fury Swipes, Double Kick), Dead Cells daggers, Hades Fists | many small taps with a finisher; each tap has its own spark and sound |
| **Charge-and-release** | Hades Special, Smash charged smashes, Zelda spin attack | hold to power up, the telegraph grows with it |
| **Dash-through slashes** | Hades dash strike, Hollow Knight dash slash, Unite Zeraora | you pass through the foe; the cut shows up behind you |
| **Trail VFX, impact frames** | Dead Cells, anime fighters (Dragon Ball FighterZ impact frames), Hades | a swoosh ribbon traces the arc; the hit frame goes stark (white target, speed lines) for 1–3 frames |
| **Screen shake, camera punch-in** | Vlambeer's "art of screenshake", Nuclear Throne, Smash final hits | a directional kick along the hit, a 2–4% zoom toward the impact on heavy hits |
| **Sound layers** | Hades, Dead Cells | whoosh on release, a transient on contact, a body thud scaled by weight, an element layer; taps and finishers sound different |
| **Hit sparks per type** | Pokémon Unite, Smash (element effects) | fire embers, electric crackle, water splash: the hit tells you what hit you |

The common thread: melee is **committed motion + a live hitbox + a big, distinct payoff**. Ours is a single-tick test
with a generic payoff.

## 3. The melee flavour system

### 3.1 Rules it keeps

Manual aim, hold-to-aim then release (the attack casts on the release, in the aim of that tick); energy-only timing
(no cooldown on paid attacks, the post-cast recovery, the pip cap); a deterministic 60 Hz sim (integer math, every new
field plain data in `SimState`, so replays and hashes stay exact); render-only juice (hit-stop, flashes, shake,
punch-in and sound never touch the sim); full elimination; ~20 s basic 1v1s. The card's printed damage stays the
card's damage: strings and flurries don't multiply it.

### 3.2 The strike model (the sim)

A melee attack becomes a **live swing** (`s.swings`, today render-only) instead of a one-tick test:

- **Active frames.** On release the swing lives for `active` ticks (default 3) and tests its arc every tick until it
  connects (each target once per strike). The arc follows the attacker.
- **Step-in.** The lunge is motion over the active frames (`lunge / active` px a tick, stopped by walls), not a
  teleport. A foe drifting inside the arc gets caught; a foe that dodges out still escapes.
- **Strikes.** A swing has `strikes` (1–5) spaced `every` ticks. Every strike before the last is a **tap**: a spark, a
  sound, a short **flinch** (the foe can't walk or start an attack for a few ticks) and no card damage. The **last
  strike is the finisher**: it runs the card's `onHit` (damage, effects, knockback). So Double Kick is kick-*kick*,
  Fury Swipes is swipe-swipe-*SWIPE*, and the damage is still the card's number, landed on the finisher.
- **Flinch** is the new melee reward: `flinch` ticks on the fighter (no walking, no attack start, no dodge;
  knockback still moves it). Some strikes **interrupt** (cancel a windup in progress: the energy stays spent), as a
  Pokémon flinch does. Guardrails: armour (Fighting / Metal windups) ignores flinch and interrupts; after a flinch ends
  the fighter is immune to new flinches for 30 ticks (no stunlock); taps of one swing chain inside that.
- **Holds.** A grab or a bite **holds** the foe: it is pulled to the attacker's front and kept there for `hold` ticks
  (flinched). The attacker can still walk and turn during its recovery, dragging the foe along.
- **Throws.** A throw grabs, holds, then **hurls the foe along the attacker's current aim** (so you grab, then aim the
  throw) and runs `onHit` at the throw.
- **Wall splats.** A strong melee knockback (100+ px) that runs into a wall stops dead: a **splat** (10 extra damage,
  a 20-tick flinch). Position is now a melee resource.
- **Parry.** A counter doesn't swing on release: it opens a **parry window** (18 ticks). Any hit that lands on you in
  the window (melee, shot, beam, area, dash) is **blocked** (no damage, no effects), the attacker is flinched, and the
  counter fires at once at them (the riposte). If nothing comes, the counter swings at the end of the window.
- **Dash styles.** A body blow (`tackle`) stops on the first foe and bounces the attacker back (a *bonk*); a charge
  plows through everything; a swoop curves (its heading turns a little every tick); a hop (Stomp) is a short leap that
  lands in a ring; leaps (Body Slam, Heavy Impact) and burrows (Dig) land with a flinch.

### 3.3 Melee archetypes by name

The **style** is read from the attack's name (the same normalised name the lexicon reads), and only for attacks
whose resolved shape is `melee` or `dash` (or the lexicon's `stomp`). The lexicon keeps deciding the *shape and
sizes*; the style decides *how it plays*. A hand kit's numbers stay; the style adds strikes, holds and feel.

| style | names (examples) | strikes / behaviour | telegraph while aiming |
|---|---|---|---|
| `jab` | Pound, Jab, Slap, Smack, Hit, Whack, Beat | a quick 1-2: a tap then the finisher; short step-in | the wedge + two tick marks |
| `punch` | Punch, Mega/Comet/Mach/Corkscrew Punch, Knuckle, Lariat | light punches (≤ 2 energy, < 60): a 3-hit 1-2-3 string. Heavy (Mega Punch, Focus Punch): one big wound-up punch that **interrupts** | a narrow wedge + the step-in arrow + ×3 |
| `uppercut` | Uppercut, Rising Lunge, Sky Uppercut | a launcher: a long flinch (the foe is popped up), short knockback | a narrow wedge + an up-chevron |
| `kick` | Kick, Rear/Low/Smash/Double/Jump Kick, Sweep the Leg | an arcing sweep: the foe is knocked **sideways** along the sweep; Low Kick / Sweep trips (flinch); Double Kick is 2 strikes | a wide wedge with a sweep arrow along the arc |
| `slash` | Slash, Claw, Cut, Shred, Rend, Scythe, Blade, Edge, Cleave, Night Slash, Leaf Blade | a wide arc with a trail; blades lunge far and slice at the end; claws rake (three parallel marks) | the arc + the trail direction |
| `chop` | Karate Chop, Chop | one overhead chop that interrupts | a narrow wedge + a down-chevron |
| `thrust` | Horn Attack, Megahorn, Peck, Drill Peck, Poison Jab, Pierce, Spear | a fast narrow stab with a long step-in; Peck is two quick pecks | a long thin spear line |
| `bite` | Bite, Gnaw, Crunch, Fang, Chomp, Nibble | a snapping lunge that **latches**: holds the foe 24 ticks, a 10-damage gnaw on release | jaws at the lunge end |
| `grab` | Bind, Wrap, Vise Grip, Clamp, Constrict, Squeeze | a grab that holds the foe 36 ticks and drags it | a hand bracket at the reach |
| `throw` | Seismic Toss, Circle Throw, Submission, Strength, Shakedown, Knock Away | grab, hold 20 ticks, **throw along your aim**; damage at the throw; walls splat | the grab bracket + a throw arrow along the aim |
| `counter` | Counter, Revenge, Retaliate, Payback, Mirror Coat | parry window 18 ticks, riposte on a block | a shield arc in front |
| `flurry` | Fury Swipes, Fury Attack, Double Slap, Double Hit, Triple Axel, Beat Up, Barrage | 2–5 strikes (the coins it flips, else "double" 2, "triple" 3, "fury" 4), 5 ticks apart, the last is the finisher | the wedge + ×N |
| `whip` | Vine Whip, Power Whip, Tongue Lash, Lick | a long lash that **reels the foe in** (pull) | a thin curved lash line |
| `tail` | Tail Whip/Slap/Smash, Iron Tail, Dragon Tail, Slam | a wide sweep that knocks sideways | a wide wedge with a sweep arrow |
| `spin` | Spinning Attack, Rapid Spin, Flail, Thrash | all around, two strikes | a full ring |
| `headbutt` | Headbutt, Zen Headbutt, Iron Head, Skull Bash (melee or dash) | a short bonk that **interrupts** | the capsule + a star at the end |
| `tackle` | Tackle, Ram, Body Blow, Spark, Treasure Rush | a body charge that **stops on the foe and bounces you back** | the capsule + a recoil arrow |
| `charge` | Take Down, Double-Edge, Giga Impact, Wild Charge, Stampede, Rollout | plows through; a big flinch on the way | a long capsule with speed lines |
| `swoop` | Wing Attack, Aerial Ace, Air Slash-dash, Brave Bird | a curved dash arc (the heading turns every tick) | the curved capsule |
| `slam` | Body Slam, Heavy Impact, (leaping) Crush | a leap that lands in a shockwave with a flinch | the arc + a landing ring |
| `stomp` | Stomp, Trample | a short hop into a small ring at your feet | a small hop arc + a ring |
| `burrow` | Dig, Dive, Underground (and Fly: airborne) | vanish (i-frames), a moving mound underground, emerge where aimed with a ring | the landing ring + a dotted path |
| `strike` | everything else melee | a clean single strike with a step-in | the wedge + the step-in arrow |

### 3.4 Per-type melee flavour

On top of the type traits every attack already gets (`flavors.ts`), melee and dash attacks get:

| type | melee flavour |
|---|---|
| Fighting | **combos and armour**: strings get one extra tap; the armour of the windup lasts through the active frames and ignores flinch |
| Fire | a **burning arc**: the swing scorches the ground at its tip (never under your feet) |
| Water | **pushback wave**: the existing push plus a splash at the tip (already there), drawn as a crest |
| Lightning | **chain stun flicker**: every melee hit flinches 6 ticks (a static flicker), even single strikes |
| Grass | **vine pull**: a melee hit with no knockback pulls the foe 24 px in (keeps them in reach) |
| Psychic | a **telekinetic shove** at short range instead of contact: +40 reach, no step-in, a push |
| Darkness | **backstab**: the ambush bonus (+30% from behind or into a windup) also flinches, and says BACKSTAB |
| Metal | **heavy armoured slam**: armour during melee windups (like Fighting), knockback +25% |
| Dragon | a **wide tail sweep**: +32 binary degrees of arc |
| Fairy | a **charm hit**: the existing weaken-debuff, drawn as hearts |
| Colorless | **clean and reliable**: one more active tick (more forgiving) on top of the quick windup |

### 3.5 Hit feel (render and sound only)

- **Hit-stop scaled by damage**: `3 + damage / 15` ticks for melee/dash strikes (max 12), 2 for a tap, +3 for a
  super-effective, a splat or a parry. The sim never sees it (the page loop holds the tick).
- **Impact frames**: on a finisher of 40+ (or any splat / parry / throw), 3 frames of a stark impact: the target drawn
  white, radial speed lines around the hit point.
- **Directional sparks**: the particle burst goes along the hit (attacker to target), type-coloured, plus white streaks.
- **Swing trails**: each style draws its own swoosh for the live frames and fades after: arc ribbons (slash, kick,
  tail), three claw marks, a straight streak (punch, thrust), a curved lash (whip), jaws (bite), a ring (spin), a
  bracket and a tether (grab/throw), a shield (counter), a mound (burrow), a dust ring (stomp, slam).
- **Camera**: shake along the hit direction (`2 + damage / 6`), and a **punch-in** (up to 4% zoom toward the hit) on
  heavy finishers, splats and throws.
- **Synthesised sound layers** (`sfx.ts`): a **whoosh** on release (pitch by weight), a **tap** transient per tap, a
  **body thud** scaled by damage on the finisher, the **element layer** (crackle, sizzle, splash...), a **clang** for a
  parry, a **whoomph** for a throw, a **crunch** for a splat, a thin **whiff** when a swing ends having hit nothing.
- **Hit-confirm**: when your swing connects, the target gets a bright confirm bracket in the colour of the predicted
  chip; when it ends empty, a grey WHIFF at its tip. The chip itself (the damage preview while aiming) is unchanged.

### 3.6 Telegraphs and aim previews

The aim preview (held) and the windup telegraph draw the **real** shape: the step-in arrow from your body to where the
swing happens, the arc from there (not from your feet), and the style's glyph (×N tick marks for strings, a sweep arrow
for kicks and tails, a spear line for thrusts, jaws for bites, a hand bracket plus the throw arrow for grabs and
throws, a shield arc for counters, a recoil arrow for tackles, the curve for swoops, the hop arc and ring for stomps).

### 3.7 Balance guardrails

Melee's risk (closing distance, eating shots on the way) earns: forgiving active frames, the step-in, flinch and
interrupts, holds and throws, splats, parries. Its reward is capped by:

- the card's damage is unchanged (taps do none; splats +10, a bite's gnaw +10 are the only extras);
- flinch immunity (30 ticks after any flinch) and armour ignoring flinch: no stunlock loops; the tournament's
  stunlock flag must stay at 0;
- holds and parries are short (≤ 36 ticks) and the attacker is in recovery meanwhile;
- targets (the tournament, Normal bots, same tier):
  - melee **connect rate 30–45%** (from 18%), dash 30–45%;
  - **damage per release within 25% of ranged** (from 47% less);
  - win rate of melee-first kits **46–54%** (from 44%), melee-first vs ranged-first **45–55%**;
  - fight median **17–23 s**, timeouts not up, stunlock flags 0.

**Bots** (`src/bots/smart.ts`): gap-close when their plan is melee and the foe is in recovery or winding up something
long (punish the recovery), fire melee only when the foe is inside the arc after the step-in, open a counter's parry
when a foe's windup is aimed at them in reach (hard+), and throw toward the nearest wall behind the foe.

## 4. Scope

### 4.1 Sim (new or changed)

- `src/sim/melee.ts` (new): the style table (`meleeStyleFor(name, shape)`), `applyMelee(attack)` (the style's shape
  params and per-type melee flavour, applied in `resolveKit` after the type flavour; data, deterministic), the strike
  model (`startSwing`, `advanceSwings`, holds, throws, parry), flinch and splat.
- `src/sim/shapes.ts`: `release` hands melee to `startSwing`; `hit()` checks a parry first; `advanceDash` gains the
  bonk (stop + recoil), the swoop turn and the landing flinch.
- `src/sim/step.ts`: `advanceSwings` in the tick order; flinch gates input; knock-into-wall splats.
- `src/sim/types.ts`: `Swing` grows (live ticks, strikes, lunge, hold); `Fighter.flinch?`, `parry?`; `knock.src?`; new
  render-only events `strike`, `whiff`, `parry`, `splat`, `throw`.
- `src/sim/kit.ts`: `style` is a valid string shape param; `applyMelee` in `resolveKit`.
- A `flinch` effect op (`{ticks, interrupt?}`) so kits can ask for it by hand, with its explain sentence and test.
- `src/sim/predict.ts`: the dry run advances swings like shots and dashes.
- No change to `rules.ts` or the kit files: melee constants live in `melee.ts`, so the balance pass and this merge
  cleanly.

### 4.2 Data

No new kit data: styles come from names at resolve time (hand kits keep their numbers). The lexicon's `stomp` becomes
a hop. Lexicon coverage stays 1,872/1,872.

### 4.3 Render and audio

`drawSwings` per style, trails, directional sparks, impact frames, punch-in, directional shake, melee hit-stop,
telegraph glyphs per style, the hit-confirm and WHIFF, new sfx voices (`swing`, `tap`, `thud`, `parry`, `throw`,
`splat`, `whiff`).

### 4.4 Tests

Style resolution by name (the top 30), strings (taps then one finisher, the card's damage exactly once), active frames
catching a drifting foe, the step-in stopping at walls, flinch and interrupt and the flinch immunity, armour ignoring
flinch, grab hold and the throw along the aim, wall splat, parry blocking a shot and a swing and riposting, bonk
recoil, swoop curve, determinism (replay hash), predict still exact, explain has a sentence for `flinch`, lexicon
coverage unchanged, `probe:stuck` 0.

### 4.5 Phases

| phase | what | effort |
|---|---|---|
| **MVP** | the strike model (active frames, step-in, strikes/taps, flinch + immunity, interrupt), styles by name for the melee kinds (jab, punch, kick, slash, thrust, bite latch, flurry, strike), melee hit-stop + directional sparks + trails + whoosh/tap/thud, telegraph step-in arrow and ×N, bots firing inside the arc, tests, before/after shots and the tournament check | 1–1.5 days |
| **Full** | holds, throws along the aim, wall splats, parry + riposte, dash styles (bonk, charge, swoop, stomp hop, slam/burrow landing), per-type melee flavour, impact frames + punch-in + parry/throw/splat sounds, WHIFF and hit-confirm, per-style telegraph glyphs, bots gap-close / punish / counter, balance pass on the targets above | 1.5–2 days |
| later | charge-and-release (hold longer for a stronger heavy), human telemetry (connect rate per player), per-species trails (a Scyther's scythes) | — |

### 4.6 The most-fielded melee attacks and what each becomes

`npx vite-node tools/melee/stats.ts --fielded 30` (fielded = the bot roster + the collection fixture):

| # | attack | fielded | e.g. | shape today | becomes |
|---:|---|---:|---|---|---|
| 1 | Tackle | 31 | base1-35 | melee (hand) / dash | `tackle`: a body blow; as a dash it stops on the foe and bonks you back |
| 2 | Slash | 20 | base1-19 | melee 180° | `slash`: a wide arc with a trail, 3 live ticks |
| 3 | Bite | 19 | base1-40 | melee lunge | `bite`: snap, latch 24 ticks, gnaw +10 |
| 4 | Ram | 16 | me55-4 | dash | `tackle`: bonk and recoil |
| 5 | Gnaw | 14 | base1-58 | melee lunge | `bite`: latch |
| 6 | Pound | 12 | base1-26 | melee jab | `jab`: tap + finisher |
| 7 | Spinning Attack | 11 | sm115-14 | dash | `spin`/`charge`: plows through, spinning |
| 8 | Hammer In | 10 | me55-98 | area ahead | stays an overhead smash (area); gains flinch, a crack and a thud |
| 9 | Headbutt | 10 | base1-41 | dash | `headbutt`: a short bonk that interrupts |
| 10 | Scratch | 10 | base1-46 | melee 110° | `slash` (claw): three claw marks |
| 11 | Heavy Impact | 9 | me55-103 | leap | `slam`: lands in a shockwave, flinch |
| 12 | Agility | 8 | base1-14 | quick dash | quick dash (afterimages), unchanged play |
| 13 | Mega Punch | 8 | me55-84 | melee punch | `punch` heavy: one wound-up punch that interrupts |
| 14 | Surprise Attack | 8 | me55-22 | blink | blink strike, flinch on landing |
| 15 | Peck | 7 | neo1-60 | melee 36° | `thrust`: two quick pecks |
| 16 | Quick Attack | 7 | me55-117 | quick dash | quick dash, unchanged play |
| 17 | Rear Kick | 7 | swsh11-109 | melee kick | `kick`: a sweep that knocks sideways |
| 18 | Stampede | 7 | sma-SV25 | roll dash | `charge`: plows through |
| 19 | Corkscrew Punch | 6 | me55-94 | melee punch | `punch`: 1-2-3 string |
| 20 | Giga Impact | 6 | swsh11-17 | charge dash | `charge`: plows through, big flinch |
| 21 | Sharp Fang | 6 | me55-111 | melee bite | `bite`: latch |
| 22 | Smash Kick | 6 | base1-60 | melee kick | `kick`: sweep |
| 23 | Dragon Claw | 5 | me55-110 | melee slash | `slash` (claw) |
| 24 | Fury Swipes | 5 | neo1-25 | melee 110° | `flurry`: 3 swipes (its 3 coins), the last lands the damage |
| 25 | Low Kick | 5 | base1-52 | melee kick | `kick`: a trip (flinch) |
| 26 | Rollout | 5 | me55-35 | roll dash | roll dash (charge through) |
| 27 | Shred | 5 | swsh11-130 | melee slash | `slash` |
| 28 | Slap | 5 | base1-65 | melee jab | `jab`: tap + finisher |
| 29 | Treasure Rush | 5 | me55-101 | dash | `tackle`: bonk |
| 30 | Aqua Return | 4 | swsh12pt5gg-GG39 | jet dash | `charge`: jets through |

Next in line: Body Slam (`slam`), Boulder Crush (area smash), Breaking Swipe / Claw Slash / Metal Claw (`slash`),
Darkness Fang (`bite`), Flail (`spin`), Leaf Blade / Moonlight Blade / Power Edge (`slash`, blade lunge), Seismic Toss
(`throw`), Counter (`counter`), Wing Attack (`swoop`), Dig (`burrow`), Stomp (`stomp`), Double Kick (`kick` ×2),
Karate Chop (`chop`), Vine Whip (`whip`).

## 5. Mockups

The storyboards come from the real game: `node tools/melee/shots.mjs --out shots/melee-after --video --frames 12
--after 36` steps the same 24 attacks tick by tick (a punch string, a grab-throw, a body-slam leap and a parry among
them) into `shots/melee-after/` (gitignored), next to `shots/melee-before/` for comparison.

## 6. Questions for the user

Decided (the user approved the defaults; each is a constant in `src/sim/melee.ts`): 1. finisher-only
(`STRING_SPLIT = false`); 2. an interrupt keeps the energy spent (`FLINCH_REFUND = false`); 3. throws go where you
aim during the hold (`THROW_AIMED = true`); 4. the parry blocks melee and dash hits only (`PARRY_BLOCKS_RANGED =
false`); 5. charge-and-release later (`CHARGE_RELEASE = false`, not built). The original questions:

1. **Damage on the finisher only** (taps are 0-damage flinches) keeps every card's printed number exact. The
   alternative splits the damage across the strikes (more numbers popping, but the damage curve makes the total drift).
   Keep finisher-only?
2. **Interrupts** cancel a windup and the energy stays spent (like a TCG flinch). Harsh for big nukes; armour
   (Fighting, Metal) is the counterplay. OK, or refund the energy?
3. **Throws go along your aim after the grab** (you can turn while holding). Or always over your shoulder?
4. **Parry blocks everything** in its window, shots and beams included. Or melee-only?
5. Charge-and-release (hold longer for a stronger heavy) is left for later: hold-to-aim already uses the hold. Want it?

## 7. As built (branch melee-build)

### 7.1 What is in

- **The strike model** (`src/sim/melee.ts`, wired through `shapes.ts` / `step.ts`): a melee release is a live swing
  (`s.swings`) that tests its arc every live tick (`ACTIVE` 3, more for thrusts, blades, whips, Colorless), from a
  step-in that is motion over those ticks (stopped by walls), in `strikes` (taps then one finisher that runs `onHit`
  once). A swing roots its attacker until its strikes are out (no walking, dodging or swapping: committed motion).
  Flinch (`Fighter.flinch`): no walking, no attack start, no dodge; `interrupt` breaks a windup; armour (a Fighting /
  Metal windup, and a Fighting / Metal swing's live frames) ignores it; `FLINCH_GUARD` (30) after one ends, except a
  string's taps after `TAP_GUARD` (12); never more than `FLINCH_CHAIN` (48) ticks in a row. The `flinch` effect op
  (with its explain sentence) lets a kit ask for one.
- **Styles by name** (`meleeStyleFor`, `applyMelee` in `resolveKit` after the type flavour; a shape may name its
  `style` by hand): jab, punch (light 1-2-3 / heavy interrupting), uppercut, kick (sideways; Double Kick 2 strikes),
  slash (claw rakes, blades), chop, thrust (Peck twice), bite (latch 24 ticks, a +10 gnaw for 2+ energy), grab (36-tick
  drag), throw (20-tick hold, then along the held aim), counter (18-tick parry, riposte), flurry (its coins, else
  double 2 / triple 3 / fury 4), whip, tail, spin, headbutt, strike, smash (the lexicon's close hammer), and the dashes:
  tackle (stops on the foe and bonks back), charge and roll (plow through), swoop (curves), slam (Body Slam and Heavy
  Impact leap into a shockwave), stomp (the lexicon's stomp becomes a hop), burrow (Dig: a moving mound, i-frames),
  fly, quick. Slam, stomp and burrow come down on the first foe they pass over once a third of the way along (like a
  lob), so a leap lands where the foe is, not past it.
- **Wall splats** (a styled knock of 100+ px that a wall stops: +10 and a 20-tick flinch), **parry** (a blocked hit
  does nothing, the attacker reels 16 ticks, the counter fires at it and its "if damaged" bonus rides along).
- **Per-type melee flavour** (off with the kit's or attack's `flavor: false`): Fighting +1 tap and armour through the
  live frames, Fire scorches past the tip, Lightning flinches 6+, Grass reels in 24 px, Psychic +40 reach and a push
  (no step-in), Darkness backstabs flinch, Metal armour and +25% knockback, Dragon +32 arc, Colorless +1 live tick
  (Water and Fairy keep their type flavour's push and charm, drawn as a crest and hearts).
- **Render and audio** (`src/render/meleefx.ts`, `renderer.ts`, `src/audio/sfx.ts`): every strike drawn as its move,
  the step-in's speed lines, hold tethers, the parry shield, per-type accents; per-style telegraphs (the step-in
  arrow, the arc from where the swing happens with the hitbox's forgiveness as a faint outer edge, xN, jaws, hand
  bracket and throw arrow, shield, sweep arrows, the swoop's curve, a tackle's recoil arrow, landing glyphs); melee
  hit-stop `3 + dmg / 15` (max 12; 2 for a tap; 6 a parry; 8 a splat), directional sparks and shake, impact frames
  and a punch-in on heavy hits, splats and throws, WHIFF, a hit-confirm bracket, reel stars on a flinched fighter, a
  burrow's mound; the swing / tap / thud / parry / throw / splat / whiff voices.
- **Bots** (`src/bots/smart.ts`): close the gap on a recovering, reeling or long-winding foe; fire a swing only when
  the foe will still be in reach after the windup and the step-in; parry a close windup aimed at them (hard+); throw
  toward the nearest wall past the foe.
- **Predict** advances swings like shots and dashes (strings, a bite's gnaw and a throw are predicted exactly).

### 7.2 Landing (the user: "landing melees already felt a bit hard")

`tools/melee/human.ts` plays a scripted human against each bot level's movement (the bot never attacks): it sees the
foe 14 ticks late, aims at that with an error of up to 12° per attempt (plus a small wobble), and releases when the
seen foe looks inside the telegraph (70-115% of its reach, drawn per attempt). Connect = the release dealt damage.
The top 20 of the 24 most-fielded melee attacks, 3 foes x 3 arenas x 40 s per attack and level:

| build | vs easy | vs normal | vs hard |
|---|---:|---:|---:|
| before (arena main) | 54% | 51% | 59% |
| the strike model, no landing levers | 69% | 69% | 66% |
| + windup aim tracking (`LANDING.track`) | 75% | 75% | 70% |
| + hitbox pad 6 px / 4 binary degrees (`LANDING.padPx`, `padArc`) | 72% | 70% | 68% |
| + step-in magnet 15° only (`MELEE_STEP_MAGNET_DEG`) | 71% | 69% | 67% |
| tracking + pad | 77% | 77% | 72% |
| **as shipped: tracking + pad + magnet 15°** | **78%** | **78%** | **73%** |
| as shipped with the magnet at 0 | 78% | 78% | 73% |

(The single-lever rows were measured before the last trim of the dash styles' flinch; the two as-shipped rows after
it.) The target (45%+ against normal movement) is met by the strike model alone; tracking and the pad make the biggest
difference and ship on. The step-in magnet (the user approved it, 15°) is on but measures as no aggregate change;
it helps a string's later strikes a little (Fury Swipes, Double Kick) and can be set to 0 with no loss. The
hardest top-20 attacks to land: Pound (42% vs normal: a short jab 1-2 whose finisher a retreating foe leaves),
Fury Swipes (50%), Counter (63%: the foe here never attacks into it), Dig (66%).

### 7.3 The tournament (`node tools/melee/run.mjs --per 4`: 3,088 bot 1v1s at Normal, same tier, half the cores)

| | before | after | target |
|---|---:|---:|---|
| melee connect | 18% | 31% | 30-45% |
| dash connect | 30% | 35% | 30-45% |
| melee damage per release (ranged) | 5.2 (9.9) | 9.1 (10.6): -14% | within 25% of ranged |
| melee-first win rate | 44% | 49% | 46-54% |
| dash-first win rate | 54% | 56% | |
| melee/dash-first vs ranged-first | 47% | 55% | 45-55% |
| fight median | 19.1 s | 16.7 s | 17-23 s |
| timeouts (90 s cap) | 196 | 89 | not up |
| stunlocks (60+ ticks flinched in a row) | 0 | 0 (longest 41) | 0 |

With the step-in magnet at 0 the bots' numbers are the same within noise (melee connect 31%, 9.0 per release, fight
median 16.8 s). The fight median is 0.3 s under its band: melee now lands its printed damage about twice as often, so fights end
sooner (and half the stalemates are gone). Flinch lengths, the gap-closing bots and the bite's gnaw were each tried
as levers and don't move it; the energy pace (`rules.ENERGY_FILL`, the balance pass's lane) is what sets fight
length, and the balance-tune branch's energy change moves it anyway.
