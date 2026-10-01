# Kits: from card text to a moveset

Every Pokémon card fights with its own real attacks. A **kit** turns a card into a moveset: a shape per attack
(what you aim, how it hits) plus the attack's mechanics as effect ops. The card data (HP, types, weakness,
resistance, retreat, attack names, costs and damage) stays the source of truth; kits never store card text.

- **Hand kits** (605 files, 316 Pokémon): every rule-box card (V, VMAX, VSTAR, GX, ex, EX, Radiant: all 335), the
  Charizard, Lugia, Giratina, Umbreon and Rayquaza lines, the starters of every generation in the data, and the
  Pokémon with iconic moves. Authored per Pokémon in `tools/kits/hand/*.ts`, built into `data/kits/<id>.json`.
- **Auto-kits** for every other card (`src/sim/autokit.ts`): the same text parser for the mechanics, a shape from
  the attack's name, text, type, damage and cost.
- **Pilot kits** (5, from M1) keep their hand-written numbers.

`npm test` checks every kit file, builds an auto-kit for every card (1,187 Pokémon, 1,872 attacks) and checks every
kit against the card data (`$env:POKEARENA_CARDS`).

## 1. Translations: turns, bench, deck and hand in real time

The sim runs at 60 Hz. The card text is translated the same way everywhere (`src/sim/effects/facts.ts`,
`src/sim/rules.ts`, `src/sim/effects/pips.ts`):

| card text | arena |
|---|---|
| a turn, "during your opponent's next turn", "until the end of your next turn" | 1 TURN = 90 ticks (1.5 s); "next turn" effects on the foe last 1 TURN, "until the end of your next turn" 2 |
| "during your opponent's last turn", "this turn" | the last 2 TURNs (`RECENT_TICKS`) |
| energy: attach, search for, discard, "for each Energy attached" | pips on the one meter: gain a pip, lose a pip, unspent pips. "Attached to this Pokémon" and "discard Energy from your Pokémon" count the pips the attack cost too. Energy types are ignored |
| draw, search the deck for a card, put a card from the discard pile in the hand | +1 pip (cards become options) |
| search for a card that evolves from this Pokémon | +20 damage for 4 TURNs and heal 30 (a mid-fight growth spurt) |
| put Basic Pokémon onto your Bench | +10 defense for 3 TURNs |
| your opponent's hand (discard a card, reveal and take) | their pips (discard one) |
| your opponent's deck (mill, prize manipulation), "can't play Items / Supporters / Tools", "can't attach Energy" | their meter stops filling for a while (`energyJam`) |
| your own deck (discard the top card, look at, rearrange) | flavor: no effect (32 attacks, 2.5% of the texts) |
| the Bench | team mode: the back line (bench damage hits benched HP). **1v1**: a splash on foes within 110 px of the hit or landing point (the foe the attack hit directly takes half); counting effects see 2 virtual benched Pokémon a side |
| Prize cards | the arena has no prizes (a match is won by full team elimination). Text that counts prizes counts progress: team mode, your knockouts ("prizes left": foes still standing); **1v1**, a 6-prize game on one Pokémon's HP (the foe losing half its HP = 3 "prizes taken"). "Take more Prize cards" for a KO pays 2 pips per prize (`bounty`) |
| damage counters | direct damage, no weakness / resistance, no shields (`counters`) |
| a Stadium | the terrain under your feet: painted water / fire / shock, tall grass, lava. "Discard a Stadium" clears the surface |
| Pokémon Tools, Special Energy on the foe | its buffs and shields (`dispel`) |
| switch this Pokémon with a benched one | leap back, briefly invulnerable, swap ready (`retreat`) |
| switch the opponent's Active (gust) | team mode: a forced swap (their most damaged benched Pokémon comes in); 1v1: a pull toward you, or a shove away |
| "the Defending Pokémon can't retreat" | can't swap and can't dodge-roll (`retreatLock`) |
| "can't attack during your next turn" | all attacks on cooldown for 1 TURN (`exhaust`) |
| coin flips | the sim's seeded PRNG; "flip until tails" is capped at 10 heads |
| "you can use this attack only if ..." | the attack fizzles when the condition fails (energy stays spent) |
| "N or more cards in the Lost Zone" | the fight has lasted N TURNs (the Lost Zone fills with time) |
| once-per-game GX attacks and VSTAR Powers | once per match per trainer (from the card's own reminder text) |

Everything stays deterministic: integer math, the state's PRNG, no time or randomness outside the sim.

## 2. The mechanics mapping

`src/sim/cardtext.ts` reads an attack's text at run time: it normalizes the text (the card's own name becomes
"this Pokémon", the Defending / opponent's Active Pokémon becomes "foe", reminder parentheses go), then consumes it
clause by clause. Each rule matches at the start of what's left, emits effects into a slot (`onCast`; `onHit` before
the damage op for bonuses and conditions, after it for status, drain and so on; `onImpact` for terrain), and names
its mechanic. `npm run kits:coverage` clusters every attack by those mechanic ids.

**Coverage** (`npm run kits:coverage -- --md`, 1,187 Pokémon cards):

<!-- coverage -->
| | attacks | share |
|---|---:|---:|
| all attacks | 1872 | 100% |
| no text (damage only: maps trivially) | 566 | 30.2% |
| with text | 1306 | 69.8% |
| with text, fully mapped | 1306 | 100.0% of text |
| of which to effect ops | 1274 | 97.5% of text |
| of which flavor only (no arena meaning, on purpose) | 32 | 2.5% of text |
| with text, partly mapped | 0 | 0% |
| with text, not mapped | 0 | 0% |
| mapped with an approximation somewhere | 124 | 9.5% of text |
| **all attacks mapped** | 1872 | **100%** |

There are no leftovers. The approximations (124 texts) are the ones the arena can't do exactly. They are listed
per mechanic below and in each rule of `cardtext.ts` (`approx: true`).

| mechanic | attacks | approx. | text pattern (in our words) | ops |
|---|---:|---:|---|---|
| `coin` | 177 | 1 | flip a coin; if heads / tails, a clause | `coin` around the clause's effects (in onCast if caster-only, else in onHit); "if tails, does nothing" + target effects = `coin{tails: fizzle}` in onCast, the effects on hit |
| `scaling` | 163 | 37 | N (more / less) damage for each X; N damage times X | `bonusPer` (energy, damage counters, bench, prizes, turns, conditions, retreat, team types); the printed number becomes a per-unit amount. Approx.: discard piles and the Lost Zone (turns), "Pokémon in play" kinds (bench + 1) |
| `status` | 153 | 6 | the foe (or itself) is now Asleep / Burned / Confused / Paralyzed / Poisoned; recovers | `status`, `cleanse`. Approx.: stronger poison ticks, Char counters (a burn chance) |
| `conditional` | 102 | 11 | if a condition, N more damage / an effect; only if; else does nothing | `when` (20 conditions). Approx.: named teammates or trainers in play (a 50% `chance`) |
| `bench` | 92 | 1 | N damage to 1 / each of the opponent's (or your own) benched Pokémon, to each of the opponent's Pokémon, to 1 of their Pokémon | `benchDamage` (1v1: splash), `damage` for snipes |
| `draw` | 78 | 0 | draw, search the deck, put cards from the discard into the hand | `gainEnergy` 1 |
| `discardEnergy` | 75 | 0 | discard N / all Energy from this Pokémon (to use it, or as a cost) | `discardEnergy` |
| `prevent` | 68 | 11 | takes N less damage, prevent all damage, prevent all effects | `buff defense`, `shield`, `invulnerable`. Approx.: "from Basic / VMAX / GX Pokémon only" (a 60 shield), halving |
| `accel` | 61 | 7 | search for / attach Energy to your Pokémon | `gainEnergy` (at most 3) |
| `selfDamage` | 48 | 0 | this Pokémon also does N damage to itself | `selfDamage` |
| `heal` | 43 | 1 | heal N / all from this Pokémon, from each of your Pokémon, a benched one | `heal` (`team` for the bench) |
| `coins` | 41 | 3 | flip N coins; N damage per heads; for each heads, an effect; at least K heads | `coins`, `chance` (binomial) |
| `flavor` | 37 | 0 | your own deck order, looking, revealing, shuffling | nothing, on purpose |
| `spendEnergy` | 36 | 12 | discard any amount of Energy / cards for N more each | `spendEnergy` (up to 3 pips). Approx.: tools and hand cards spent as pips |
| `disrupt` | 34 | 6 | hand disruption, milling, item / supporter / tool locks | `discardEnergy` on the foe, `energyJam`, `dispel` |
| `selfLock` | 32 | 0 | this Pokémon can't attack / can't use this attack during your next turn | `exhaust` (all / this) |
| `gust` | 28 | 9 | switch in an opponent's benched Pokémon; they switch; devolve; bounce to hand or deck | `gust` pull / push. Approx.: devolve and bounce (a shove + 30 counters) |
| `switch` | 28 | 1 | switch this Pokémon with a benched one; shuffle it into the deck | `retreat` |
| `ignoreWR` | 25 | 0 | isn't affected by Weakness / Resistance | `damage.wr` |
| `retreatLock` | 23 | 0 | the Defending Pokémon can't retreat | `retreatLock` |
| `pierce` | 22 | 0 | isn't affected by effects on the foe; discard its Tools first | `damage.pierce`, `dispel` |
| `foeEnergy` | 21 | 0 | discard / Lost Zone an Energy from the opponent's Active | `discardEnergy{target}` |
| `counters` | 20 | 3 | put N damage counters on the opponent's Pokémon; move counters; half its HP | `counters`, `hpCut`. Approx.: "until its HP is N" |
| `benchCall` | 16 | 0 | put Basic Pokémon onto your Bench | `buff defense` |
| `cantAttack` | 14 | 0 | the Defending Pokémon can't attack (or one of its attacks) | `exhaust{target}` |
| `weaken` | 13 | 3 | the foe's attacks do N less; it takes N more; your next attacks do N more | `buff` on the target or self. Approx.: changing its Weakness (a vulnerability) |
| `flipUntilTails` | 10 | 0 | flip until tails: N per heads | `coinsUntilTails` |
| `evolve` | 9 | 0 | search for the evolution and evolve | `buff damage` + `heal` |
| `execute` | 8 | 1 | knock out a Pokémon at N HP or less; "is Knocked Out" | `execute`. Approx.: "at the end of the next turn" (poison + counters) |
| `stadium` | 7 | 0 | discard a Stadium in play | `paint none` at the landing point |
| `mimic` | 6 | 3 | Metronome, Mirror Move, copy an attack | `mimic`, `bonusPer hurt`. Approx.: copying a benched ally's attack, transforming |
| `drain` | 5 | 0 | heal half the damage done | `drain` |
| `thorns` | 5 | 1 | if damaged next turn, counters on the attacker | `thorns` |
| `bounty` | 5 | 2 | a KO by this attack takes more prizes | `bounty` |
| `extraTurn` | 4 | 4 | take another turn | Approx.: `gainEnergy` (tempo) |
| `blind` | 3 | 0 | if the foe attacks, flip: tails it does nothing | `blind` |
| `bonus` | 1 | 0 | you may do N more damage (and can't attack next turn) | `bonus` + `exhaust` |
| `combo` | 1 | 1 | only if it used another attack last turn | Approx.: no restriction |

## 3. The effect library

39 ops in `src/sim/effects/ops/`, one file and one test each (docs/SPEC.md section 7 has the params). 19 are M1's
(`damage`, `selfDamage`, `heal`, `status`, `knockback`, `pull`, `slow`, `shield`, `buff`, `invulnerable`, `coin`,
`coins`, `chance`, `paint`, `bonus`, `benchDamage`, `discardEnergy`, `gainEnergy`, `bonusPerEnergy`). The 20 new ones
come from the card text: `when`, `bonusPer`, `coinsUntilTails`, `fizzle`, `exhaust`, `retreatLock`, `counters`,
`drain`, `spendEnergy`, `energyJam`, `gust`, `retreat`, `dispel`, `thorns`, `blind`, `execute`, `bounty`, `hpCut`,
`cleanse`, `mimic`. `damage`, `heal`, `benchDamage` and `discardEnergy` gained params (W/R modes and pierce, a team
heal, the 1v1 splash, the foe as a target).

Sim hooks they needed (additive): `Fighter.enteredAt / hurtAt / hurtAmt` and `PlayerState.koAt` (tick stamps for
"this turn" / "last turn"), `CastInfo.fizzle / dealt`, thorns in the damage pipeline, blind and fizzle in `release`.

## 4. Shapes: the move language

`autoKit(card)` gives every attack the effects from its text and a shape from **the move lexicon**
(`src/sim/lexicon.ts`, **docs/MOVES.md**): the attack's name (hand-picked names, keyword rules, stems), then its text,
pick one of 94 archetypes (a quake rings you, Thunder falls from the sky, a lob arcs over walls, a boomerang comes
back, Dig goes untouchable...), sized by the energy cost and the damage, with its trajectory, its windup and its feel
on hit (a punch shoves, a whip reels in, a web sticks). All 1,872 attacks in the pool get a deliberate archetype; none
is left on the type fallback below, which only remains for a card the lexicon has never seen:

- **Its type**, for the cheap first attack and the big later one: Fire cones, Water and Lightning shots then beams,
  Grass shots then areas, Psychic shots then areas, Fighting melee then a quake, Darkness melee then a dash, Metal
  melee then a heavy shot, Dragon beams, Fairy areas, Colorless melee then a shot.

A hand kit's authored shape wins, except that the lexicon's trajectory rides along when the kinds agree and a hand
shape of the wrong range class for its name takes the name's archetype (`!` in the spec pins it). Ice slows; wraps
and vines slow; whips and grabs pull; Water floods where it lands; big Fire attacks leave burning ground.

## 4b. Type flavours, movement and timing

**One signature trait per type** (`src/sim/flavors.ts`), applied to every attack of that element when the kit
resolves; `flavor: false` on a kit or one attack opts out. The full table, with each type's movement, is in
docs/MOVES.md section 5:

| type | trait | the test (`src/sim/flavors.test.ts`) |
|---|---|---|
| Psychic | gentle homing on a single shot (a capped turn; the aim stays yours), slower, -10% damage | a shot aimed 17° off curves in; a plain one misses |
| Fire | a burning trail behind shots; other shapes scorch where they land | the trail paints fire |
| Water | pushback and flooding | knockback + water paint |
| Lightning | the fastest shots, the shortest recovery, arcs into a foe in water (`chain`) | faster, quicker, chains |
| Grass | roots (slow 25% for 1 s) and drains 15% | slowed, healed |
| Fighting | armour while winding up (-25%, no knockback), bigger knockback, heavier recovery | 30 of 40 taken, not moved |
| Darkness | ambush: +30% from behind or into a foe mid-cast, longer lunges | 52 from behind, 40 from the front |
| Metal | heavy: slower shots, braces (+20 defense) after casting, breaks props twice as fast | the numbers |
| Dragon | shots pierce the first target; beams 6 px wider | pierce 1, width +6 |
| Fairy | charm: the target's attacks do 20 less for a TURN | the debuff on hit |
| Colorless | reliable: 2 ticks quicker windup, quicker recovery | the windup |

A per-type **power** knob (a multiplier on the whole hit, set from the tournament) evens the types out: Fire 0.85,
Water 1.20, Lightning 1.15, Fighting 1.10, Metal 0.96, Fairy 0.95. The shape levelling (section 6, "The balance-tune
pass") multiplies in a shape power: rings 0.75, dashes 0.85 (close swings 1.00 since melee-build).

**Movement traits** (arena main's `MoveTraits` hook): Psychic and Darkness blink-dodge (the whole roll at once), Fire's
roll leaves flames, Lightning's roll is quicker with a shorter cooldown, Fighting's roll shoulders foes aside, Fairy
floats (a longer, slower dodge), Psychic and Fairy hover (no shallow-water slowdown, unhurt by lava and live water),
Metal is `noKnockback`, Water wades at 130% and Grass runs through tall grass at 125% (`speedIn`). Fliers are the
species list (`fly`, fix-movement), never a type.

**The timing model** (`src/sim/rules.ts`): an attack that costs energy has **no cooldown**: the meter is the pacing.
Every attack has a short **recovery** after it: 18 ticks + damage / 9, at most 48 (0.3-0.8 s), scaled by the type
(Lightning 0.75, Colorless 0.85, Fighting and Metal 1.25). A 0-cost attack keeps a real cooldown (150 ticks, plus 3 per
point of damage above 20). The meter holds **10** pips and fills one per **180 ticks** (3 s): a basic 1v1 lasts about
20 s. A Pokémon with no damaging attack fills its evolve charge with time (1 per 30 ticks).

## 5. Hand kits

A hand kit is authored once per Pokémon name in `tools/kits/hand/<type>.ts`: a one-sentence **fantasy** and, per
attack name, a shape in a small DSL plus any extra feel (knockback, slow, paint, windup). `npm run kits:build`
writes a kit for every printing of that name, with the card's own mechanics from the parser (so a reprint with the
same attacks gets the same kit, and a different printing gets its own attacks). The DSL is documented in
`tools/kits/build.ts`: `beam L760 W44 wu20 kb140`, `area@aim r150 R480`, `melee R84 A96 l90`, `proj s15 r10 R640`...

A hand kit's shape flies like its name (docs/MOVES.md section 9): at resolve time it takes its archetype's
trajectory (the same kind: the path, volley, split, fuse...; another kind: the archetype's shape, with the kit's reach
between ranged shapes), and keeps its numbers, effects and timing. A spec that means its own shape pins it with `!`
and a note; the kit then carries `pin: "<the note>"` and keeps it (13 attack names today, each a balance fix).

Numbers stay in the card data. A kit overrides a number only when the translation needs it, in `overrides` with the
reason; `npm test` fails on an undocumented or stale override. One of the 605 hand kits needs one today: Radiant Charizard's cost (its ability isn't simulated).

Some highlights (the fantasy notes are in every kit file):

| Pokémon | the kit |
|---|---|
| Lugia | Elemental Blast: a long, wide beam of fire, water and lightning that floods and pushes foes back |
| Giratina VSTAR | Lost Impact: a huge blast around it that costs two extra pips (the energy it sends to the Lost Zone); Star Requiem knocks a foe out once the fight has lasted 10 TURNs |
| Charizard (Base) | Fire Spin: the widest cone, a long windup, sets the field alight |
| Charizard VSTAR | Star Blaze: a falling star of flame on the aim point, once per match |
| Radiant Charizard | one huge Combustion Blast beam, then a turn to cool down |
| Rayquaza VMAX | Max Burst: burns its energy into a sky beam |
| Umbreon VMAX | Max Darkness: a charge out of the night |
| Blastoise | Hydro Pump: a pushing beam that grows with the energy it holds |
| Pikachu (39 printings) | 41 attack names: jolts, sparks, darting tackles, Thunder from the sky |
| Clefairy | Sing puts foes to sleep; Metronome copies the foe's strongest attack |
| Raticate | Super Fang halves a foe's remaining HP |
| Machamp | Seismic Toss throws a foe across the arena; Strong-Arm Lariat clears everything around |
| Gengar ex | Chaotic Pain: damage counters rain on the aim point |
| Greninja-GX | Shadowy Hunter: three water shuriken, once per match |
| Kyogre | Dynamic Wave: floods everything around it (set up a Lightning partner) |
| Zeraora VSTAR | Crushing Beat smashes the Stadium; Lightning Storm Star rains bolts |
| Snorlax | collapses and snores around itself, knocking everything away |
| Ditto | transforms: hits with the foe's own strongest attack |

## 6. Balance

**The harness** (`npm run kits:tournament`, `tools/kits/tournament.ts`): every card with attacks (1,187) gets its
fighter and plays seeded 1v1s against opponents of its peer group (Basics split at 90 printed HP, Stage 1, Stage 2,
V / GX / ex, VSTAR, VMAX), or against anyone (`--mixed`, to check the tiers still order). Both sides are the M2 bots
(`createBot`, normal), on the real arenas, sharded across cores (~10,000 matches in ~6 min). It reports time to KO,
win rates, top / bottom kits with the features that explain them (`diagnose.mjs`, reprints pooled by design), and
degenerate loops: stunlock (the foe stunned > 35% of the fight), infinite heal (healing > max HP), timeouts.

**Rules now: full team elimination.** A match is won when every Pokémon on the other side is KO'd (the user's call);
there are no prizes, so a VMAX no longer "costs" 3 prizes when it falls. That made levelling the big cards matter more:
the harness is 1v1, where a KO always ended the match, so its numbers hold under the new rule.

### What the playtest found, and why

"Some characters are way stronger than others, especially Gyarados VMAX" and "TTK is really fast". The baseline
(M2's meter: a pip per 0.5 s, 3 to start; defaults 20 + 8 per pip cooldown) measured:

- **Time to KO ~5 s in every tier** (basics 6.3 s median, VMAX 5.4 s).
- **Instant, undodgeable hits.** Areas landed on the aim point the tick they were released; beams are instant; the
  caster kept re-aiming during the windup. Plain auto-kits with an aimed area (Orbeetle, Alcremie, Lunatone) won 100%.
- **Huge damage per pip in low tiers.** Lugia (Elemental Blast 250 for 3 pips on a 120-HP Basic) and Radiant
  Charizard (250) won 100%. The same goes for the 130-HP legendary Basics against 50-HP commons.
- **Raw HP and damage gaps across tiers.** Gyarados VMAX: 330 HP (the top of its tier), Max Tyrant 240 around itself
  in a 200 px radius, an instant 120 Hyper Beam. It won 94% / 77% of its mixed matches (two printings, one kit): it
  one-shot the Basics it met.
- **Text-driven damage the bots never used.** Attacks that print no number (Gengar's Screaming Circle, Mimikyu V,
  Empoleon's Water Arrow, the counters attacks) scored 0%: the bots rank attacks by the printed damage.

### What changed (constants in `src/sim/rules.ts`)

| knob | before | now | why |
|---|---|---|---|
| `ENERGY_FILL` | 30 ticks (0.5 s) | **90** (1 pip per TURN: the TCG's one attachment a turn) | scarcer energy: "TTK is really fast" |
| `ENERGY_START` | 3 | **1** | no 3-pip opener before anyone moves (2 tested: no better, see below) |
| default cooldown | 20 + 8 per pip | **70 + 30 per pip + 25 per 10 damage, at most 300** (5 s) | big hits are commitments in time too; the cap keeps one-attack heavy hitters playable |
| `HP_CURVE` | printed HP | **soft curve**: 40 -> 50, 70 -> 80, 120 -> 120, 200 -> 180, 330 -> 250 | level a bit, keep the order |
| `DAMAGE_CURVE` | printed damage | **soft curve above 40**: 80 -> 72, 120 -> 100, 200 -> 150, 240 -> 172, 320 -> 216 (before weakness) | no one-shots of whole tiers, and the biggest hit is still the biggest |
| aim during windup | re-aims every tick | **locked** (the windup is the telegraph) | big attacks become readable and dodgeable |
| `AREA_TELEGRAPH` | 0 | **30 ticks**: an aimed area shows before it lands | the aimed-area outliers |
| minimum windup | none | **6 + damage / 20**, +1 tick per 30 printed HP above 150 | heavy cards and big attacks wind up longer |
| big projectiles | full speed | **speed - damage / 40** (at least 8) | slower big shots |
| `baseDamage` for no-number attacks | 0 | **the damage their effects do** (`estimateDamage`) | bots now use them |
| homing | Psychic auto-kits, a few specs, the Bulbasaur pilot | **none**: rejected by `validateKit`, removed from the sim | everything is aimed by hand |

A basic Pikachu is not equal to Gyarados VMAX: its effective HP is 70 against 250, and a VMAX still wins 96% of its
1v1s against Basics (98% before). Displayed HP is the arena HP; `FighterKit.printedHp` keeps the card's number.

### Before and after (same-tier 1v1s, 8 per fighter, normal bots)

`node tools/kits/compare.mjs before.json after.json`:

| peer group | kits | time to KO p10 / **p50** / p90 (s), before | after | win rate p10 / p90, before | after | kits at >= 90% or <= 10%, before | after |
|---|---:|---|---|---|---|---:|---:|
| basic | 410 | 3.3 / **6.3** / 14.5 | 8.1 / **20.4** / 47.9 | 7% / 72% | 17% / 82% | 61 | 43 |
| basic+ (> 90 HP) | 123 | 2.9 / **4.6** / 10.3 | 5.1 / **12.6** / 29.4 | 50% / 95% | 20% / 78% | 48 | 10 |
| stage1 | 245 | 3.0 / **5.0** / 9.5 | 4.4 / **14.2** / 34.3 | 14% / 80% | 16% / 79% | 27 | 20 |
| stage2 | 80 | 2.9 / **4.4** / 7.4 | 4.0 / **11.1** / 26.1 | 14% / 82% | 20% / 81% | 9 | 4 |
| V / GX / ex | 227 | 3.1 / **5.1** / 8.5 | 7.9 / **15.0** / 30.7 | 17% / 80% | 21% / 79% | 21 | 12 |
| VSTAR | 45 | 2.9 / **4.5** / 7.2 | 6.6 / **11.2** / 25.4 | 21% / 75% | 18% / 77% | 3 | 1 |
| VMAX | 57 | 3.7 / **5.4** / 8.4 | 8.6 / **14.6** / 29.2 | 20% / 73% | 21% / 77% | 2 | 0 |

(The "before" run matched Basics of every HP against each other, which is why its basic+ win rates run high.)
A basic 1v1 now lasts **~20 s**; VMAX vs VMAX ~15 s (5.4 before). Pooling reprints by design (>= 12 games each):
designs at >= 85% went from 81 to 49, and designs at <= 15% from 101 to 65. Of those 65, 17 are cards with no
damaging attack at all.

**Mixed opponents, win rate of the row tier against the column tier (after):**

| | basic | basic+ | stage1 | stage2 | V/GX/ex | VSTAR | VMAX |
|---|---:|---:|---:|---:|---:|---:|---:|
| basic | 50% | 18% | 24% | 11% | 3% | 2% | 4% |
| basic+ | 82% | 50% | 66% | 41% | 27% | 9% | 10% |
| stage1 | 76% | 34% | 50% | 31% | 17% | 9% | 9% |
| stage2 | 89% | 59% | 68% | 50% | 30% | 22% | 14% |
| V / GX / ex | 97% | 73% | 82% | 70% | 50% | 31% | 28% |
| VSTAR | 98% | 91% | 91% | 78% | 69% | 50% | 46% |
| VMAX | 96% | 90% | 91% | 86% | 70% | 51% | 47% |

Before: VMAX beat Basics 98% and V / GX / ex 78%; now 96% and 70%. The tiers still order, "just a bit" flatter.

### The outliers, before and after

| | before (why) | after |
|---|---|---|
| Gyarados VMAX | 94% / 77% mixed; ~59% in its tier (330 HP, 240 slam around itself, instant beam) | 88% / 62% mixed; ~45% in its tier (250 arena HP, the slam compressed, the beam telegraphed) |
| Lugia (Elemental Blast) | 100% of Basics (250 for 3 pips, instant beam) | 83% of its peers (130-HP Basics) and 79% mixed: still strong, now beatable (172 after the curve, a 22-tick telegraphed windup) |
| Radiant Charizard | 100% (Combustion Blast 250) | 94% of its peers, 72% mixed: the strongest remaining Basic, the next candidate for a kit-level nerf (a longer cooldown in its spec) |
| Orbeetle / Alcremie / Lunatone (auto-kits) | 94-100% (instant aimed areas) | 54%, 13-15%, 35-73% (the 30-tick area telegraph) |
| Rayquaza VMAX | 54-89% (Max Burst on plentiful energy) | 13-31%: over-corrected. Max Burst spends pips, which are now scarce; its spec is the next to buff (a bigger `spendEnergy` payoff) |
| Gengar, Mimikyu V, Empoleon, Spiritomb, Haunter | 0% (bots never used the attack) | used: they deal damage now |

Top of the tiers now (same tier, pooled): Charizard (Royal Blaze, 100%), Hisuian Zoroark V, Minior, Electrode,
Muk, a 100-damage Pikachu, Diancie (heals), Carnivine, Dragonite V (Dragon Gale 250, 97%). Most win on damage per pip
well above their tier median (the features are in `diagnose.mjs`). These are strong cards, not loops: none stunlocks
or heals without limit.

Bottom: the cards with **no attack that deals damage** (utility Pikachus with Nap, Find a Friend or Peer At; Gible's
and Axew's Ascension; Roselia's and Litwick's status-only attacks; Cleffa, Inkay, Slowpoke). In a 1v1 they can't win.
That is TCG-true: they are made to evolve. Under the evolve charge (filled by damage dealt) they can't evolve either.
Suggested for M2: let the charge also fill with time for a Pokémon with no damaging attack.

**Degenerate loops:** no stunlock (the worst, Exeggcute's sleep powder at 37%, wins 6%: it deals no damage), no
infinite heal (at most 3 kits heal more than their max HP over a match; all lose or trade evenly), timeouts 0-3%.

**Energy start 2 was tested and rejected:** basic TTK 20.1 s (the same), but more extreme designs (73 at <= 15%
against 65).

### Type flavours, the move language and the timing model: before and after

Same-tier 1v1s, 8 per fighter, normal bots; before = arena main `ba2f52e`, after = this branch (type flavours, the
move lexicon, 163 hand shapes re-read from their names, the timing model with `ENERGY_FILL` 140, the power knobs).
`node tools/kits/bytype.mjs before=... after=...`:

| type | kits | before: win / median KO | after: win / median KO |
|---|---:|---|---|
| Grass | 146 | 47.1% / 17.0 s | 50.2% / 17.4 s |
| Fire | 88 | 61.7% / 12.8 s | 62.3% / 12.6 s |
| Water | 155 | 45.3% / 16.8 s | 46.2% / 17.1 s |
| Lightning | 146 | 49.0% / 14.9 s | 45.9% / 16.7 s |
| Psychic | 167 | 46.5% / 16.6 s | 51.2% / 16.8 s |
| Fighting | 111 | 50.6% / 15.1 s | 45.5% / 17.4 s |
| Darkness | 96 | 50.6% / 15.4 s | 46.2% / 17.2 s |
| Metal | 59 | 55.3% / 14.7 s | 53.2% / 18.9 s |
| Fairy | 11 | 66.2% / 17.0 s | 52.7% / 19.1 s |
| Dragon | 76 | 56.1% / 14.2 s | 51.7% / 16.8 s |
| Colorless | 132 | 44.1% / 17.5 s | 47.7% / 17.5 s |

The spread narrowed from 44-66% to 46-62%. Fire stays on top at about the same rate as before: a 15% damage cut
barely moved it (65% -> 62%), because its edge is the TCG's weakness chart (Fire hits the big Grass and Metal pools
x2), not its flavour. Time to KO, p10 / **p50** / p90 (s), before -> after: basic 8.1 / **20.5** / 48.4 -> 7.4 /
**19.5** / 54.0; basic+ 13.6 -> **16.9**; stage 1 14.2 -> **14.4**; stage 2 11.1 -> **10.0**; V / GX / ex 15.0 ->
**17.0**; VSTAR 11.2 -> **12.6**; VMAX 14.6 -> **19.4**. Kits at >= 90% or <= 10% rose (basic 37 -> 48, stage 1
20 -> 33): new shapes make new outliers, the next pass for the tuning tools.

Carry-overs: Lugia (Elemental Blast) 83% -> 53%; Rayquaza VMAX (Max Burst, a flat +60) 13-30% -> 33-46%; Radiant
Charizard went from 93% to 35% with a narrower beam plus the Fire knob, so its spec is back to the full beam with a
28-tick windup (was 26).

### The balance-tune pass: shapes, translations and type knobs

The type-flavour pass narrowed the type spread but left more kits at the extremes. This pass (branch `balance-tune`,
off arena main `b5ea821`) measured why, per tier, and fixed it at the layer that helps the most attacks: the move
lexicon's archetype parameters, the effect translations, the shape and type power knobs, then single specs. Same-tier
1v1s, 8 per fighter, normal bots, 12 shards; before = `b5ea821`.

**How the outliers were read.** Two new views next to `diagnose.mjs`: `tools/kits/byarch.ts rows.json --kind` (win
rate by the resolved shape of each kit's strongest attack; without `--kind`, by its lexicon archetype) and
`bytype.mjs --chart` (a type's win rate against foes weak to it, neutral, resisting; the tournament rows now record
it). A throwaway census of win rate by the effect ops a kit carries found the text translations.

| outliers (>= 85% / <= 15%) | diagnosed reason | layer fixed |
|---|---|---|
| rings around the caster (68% as a class; 19 kits >= 85%: Arceus VSTAR, Snorlax, Noivern V, Raikou V, Luxio, Gourgeist, Muk) | **shape**: no aim needed, so the normal bot (18-tick reaction, 10° aim error) never misses; cheap rings with an 8-12 tick windup | `RING_POWER` 0.75 and `RING_MIN_WINDUP` 14; nova / sound radii -15%; the specs the lexicon had turned into rings pinned back (Arceus VSTAR's Trinity Nova to its aimed burst) |
| dashes (58%; quick 76%, roll 65%, wing 66%) | **shape**: you are a 30-44 px hitbox sweeping a line | `DASH_POWER` 0.88; quick / roll / wing radii and distances trimmed |
| close swings (42%; 41 kits <= 15%) | **shape**: a narrow swing aimed at a foe that keeps moving through the windup | `MELEE_POWER` 1.10, `MELEE_MIN_ARC` 52; numeric arc / range tweaks on jab, peck, scratch, bite, punch, uppercut, kick, chop, horn, whip, grab, throw (no redesign: the melee redesign is its own branch) |
| aimed areas (46%; 19 kits <= 15%: the Max moves, Thunder) | **shape**: telegraph + delay + windup let a strafing foe walk out | `AREA_TELEGRAPH` 30 -> 24; `max` delay 32 -> 20, `thunder` 26 -> 20 and +8 radius; `hammer` +12 radius |
| slow homing Psychic shots (Diancie, Comfey, Dusclops, Cresselia, Malamar, Starmie: 90-100%) | **flavour**: homing at 2 binary degrees a tick on a 7 px/tick shot has all the time in the world | `PSY_HOMING` 2 -> 1, `PSY_MIN_SPEED` 10, homing on single shots only |
| Fire (58%, a 13 s median KO against 17-19 s) | **flavour**: not the weakness chart first (54% even against neutral foes) but its ground fire: every trail and scorch burns (20 a TURN) | `TRAIL_TICKS` 90 -> 45, scorch r28 -> r24; and a printed weakness "×2" is x1.6 (`WEAKNESS_PER_TIMES`) |
| "for each Energy attached to this Pokémon" (25%; 19 kits <= 15%) | **translation**: it counted unspent pips only, which is 0 once the attack is paid | `bonusPer` `myAttached`: the pips it cost plus the unspent ones |
| "discard any amount of Energy: N for each" (32%; Rayquaza VMAX, Raichu V, Kyurem, Mewtwo VSTAR at 0-40%) | **translation**: the same: bots and players fire as soon as they can pay, so nothing is left to discard | `spendEnergy` `paid: 1` counts the paid pips; Rayquaza VMAX's +60 stopgap removed |
| bench attacks in a 1v1 (Luxio's Shorting Spark 100%) | **translation**: the splash hit the foe the attack had just hit, a second time | the direct target takes half the splash (`SPLASH_DIRECT_PERMILLE`); "each Pokémon with a Tool attached" is conditional now |
| recoil attacks (35%; 14 <= 15%) | **stat extreme**: the hit is curved, the recoil wasn't | recoil at 70% (`SELF_DAMAGE_PERMILLE`) |
| free attacks (Hisuian Zoroark's Doom Curse, a 0-cost 60: 100%) | **damage per pip**: free every 2.5 s | +3 cooldown ticks per point of damage above 20 |
| "same number of cards in hand" (Noivern V's Synchro Loud +120: 90%+) | **translation**: both meters at 0 counted as equal | both must hold pips |
| the 10-30 damage kits of the low tiers | **damage per pip**: a 10 against a 30 is a threefold gap | `DAMAGE_CURVE` lifts small hits (10 -> 16, 20 -> 26, 30 -> 34; 40 and up unchanged); `ENERGY_FILL` 140 -> 160 keeps the basic TTK at ~20 s |
| single specs (high: Volcarona V, Drampa V, Tapu Koko-GX, Leafeon V, Glaceon V, a Charizard, Victini, Starmie, Radiant Steelix, Raikou V; low: Medicham V, Magnezone VSTAR, Zeraora VSTAR, Drapion VSTAR, Urshifu VMAX, Gallade V, Pikachu ex, Jirachi ex, Decidueye-GX, Espeon VMAX, Blastoise, Gyarados VMAX) | range / shape per kit, or a lexicon relex that broke the spec's intent | spec tweaks, each with its reason in the kit's `notes`; Radiant Charizard's cost override (its Excited Heart ability isn't simulated: 3 of 5 pips) |

What stays: the kits with **no damaging attack** (16 basics: utility Pikachus, Gible, Eevee, Cleffa...) can't win a 1v1
and are made to evolve (in a match their charge fills with time); the **base-set Stage 1s** (Haunter, Kadabra, Machoke,
Wartortle, Starmie, Magneton, Dragonair) print 20-50 damage on 60-90 HP against modern 100-130 HP Stage 1s hitting for
60-130: an era gap in the card data, not a kit bug. The tables below are this pass before melee-build (cap 5, fill 160);
"After the melee merge" has the numbers with melee in and the cap back at 10.

**Type win rate** (`bytype.mjs before=... after=... --chart`):

| type | kits | before: win / median KO | after: win / median KO |
|---|---:|---|---|
| Grass | 146 | 49.3% / 18.0 s | 47.4% / 19.7 s |
| Fire | 88 | 57.6% / 12.8 s | 56.4% / 16.4 s |
| Water | 155 | 44.6% / 19.1 s | 46.8% / 19.1 s |
| Lightning | 146 | 46.8% / 16.8 s | 46.4% / 18.4 s |
| Psychic | 167 | 53.3% / 16.9 s | 52.5% / 19.1 s |
| Fighting | 111 | 44.7% / 19.1 s | 47.4% / 19.4 s |
| Darkness | 96 | 49.7% / 19.1 s | 48.8% / 19.4 s |
| Metal | 59 | 51.1% / 19.2 s | 53.4% / 21.8 s |
| Fairy | 11 | 54.3% / 19.6 s | 57.4% / 21.9 s |
| Dragon | 76 | 50.2% / 17.0 s | 50.6% / 19.2 s |
| Colorless | 132 | 47.6% / 19.1 s | 46.6% / 20.0 s |

44.6-57.6% -> **46.4-57.4%** (Fairy is 11 kits). Fire against a weak foe 71% -> 68%, against a neutral one 55% -> 54%.

**Tiers** (`compare.mjs`; the last two columns count the kits at >= 90% / <= 10% that have no damaging attack):

| peer group | kits | time to KO p10 / **p50** / p90 (s), before | after | win rate p10 / p90, before | after | kits at >= 90% or <= 10%, before | after | of them with no damaging attack, before | after |
|---|---:|---|---|---|---|---:|---:|---:|---:|
| basic | 409 | 7.4 / **21.4** / 54.1 | 8.4 / **21.7** / 51.3 | 14% / 84% | 17% / 79% | 52 | 39 | 16 | 16 |
| basic+ | 118 | 7.1 / **19.1** / 44.7 | 8.6 / **21.8** / 45.8 | 16% / 81% | 21% / 85% | 11 | 7 | 0 | 0 |
| stage1 | 245 | 5.2 / **16.1** / 40.1 | 5.9 / **16.4** / 40.4 | 13% / 85% | 14% / 82% | 32 | 27 | 0 | 0 |
| stage2 | 80 | 4.5 / **11.7** / 31.4 | 4.8 / **13.8** / 35.2 | 14% / 77% | 15% / 81% | 9 | 7 | 0 | 0 |
| V / GX / ex | 233 | 8.0 / **19.1** / 40.3 | 10.8 / **21.8** / 45.8 | 14% / 79% | 21% / 80% | 20 | 17 | 0 | 0 |
| VSTAR | 45 | 6.4 / **12.6** / 31.3 | 8.6 / **14.2** / 30.0 | 17% / 86% | 18% / 76% | 5 | 0 | 0 | 0 |
| VMAX | 57 | 10.5 / **19.3** / 33.9 | 9.9 / **19.7** / 38.3 | 21% / 78% | 29% / 69% | 1 | 1 | 0 | 0 |

Kits at >= 90% or <= 10%: **130 -> 98** (without the no-damage kits, 114 -> 82). At >= 85% / <= 15%: 210 -> 157;
pooled by design, 58 / 100 -> 52 / 80. Against the pre-flavour counts (basic 37, stage 1 20): basic 39 (23 with a
damaging attack), stage 1 27. **Mixed opponents**: a VMAX beats a Basic 93%, a VSTAR 94%, a V / GX / ex 88%: card
choice still decides most cross-tier fights.

**The named cards** (same tier; before -> after):

| card | before | after | |
|---|---|---|---|
| Radiant Charizard | 43% | 50% | a three-pip Combustion Blast (the ability's cost cut, averaged); on five pips under the slower meter it fell to 14-21% |
| Lugia (Elemental Blast / Aeroblast) | 67% / 92% | 60% / 69% | untouched: the curve and the power knobs |
| Rayquaza VMAX | 21-54% | 50-67% | Max Burst counts the pips that paid for it (no flat bonus) |
| Gyarados VMAX | 12-33% | 8-35% (29 games: ~24%) | Max Tyrant pinned back to its tidal ring, shorter windups, a wider Hyper Beam; still its tier's weakest VMAX: 4 retreat, and 330 printed HP winds up 6 ticks longer |

### After the melee merge: melee in, the cap back at 10

Arena main (melee-build: live swings, flinch, bites / grabs / throws, dash styles; the wave walls; the packs) merged
into `balance-tune`, and `ENERGY_CAP` back to 10 (the user's call). Melee now connects about twice as often, so the
fights got shorter (basic median 17.4 s) and the pass's melee knob double-counted. Changes on top:

| knob | before (this pass, pre-merge) | now | why |
|---|---|---|---|
| `ENERGY_FILL` | 160 | **180** | basic TTK 17.4 s -> 19.2 s |
| `MELEE_POWER` | 1.10 | **1.00** | melee-first kits win 50% with it at 1.00 (51% at 1.10); swings land twice as often now |
| `MELEE_MIN_ARC` | 52 | **32** | `src/sim/melee.ts` pads every swing's hitbox and floors its own arcs at 32-48: 52 doubled up |
| `DASH_POWER` | 0.88 | **0.85** | dash-shaped kits 56% -> 55%; `quick` 180 px / r22 (was 200 / r24) |
| Water power | 1.15 | **1.20** | Water 43.9% |
| `leaves`, `hypno`, `lob` | speed 12 / 9 / 10 | 14 / 11 / 11 (lob blast +6) | 34-35%, 19% |

Same-tier, 8 per fighter, normal bots; "merged" is main merged in with the pre-merge knobs, "after" is now:

| type | kits | merged: win / median KO | after: win / median KO |
|---|---:|---|---|
| Grass | 146 | 48.2% / 16.6 s | 48.1% / 19.5 s |
| Fire | 88 | 55.7% / 13.9 s | 56.9% / 15.8 s |
| Water | 155 | 43.9% / 15.2 s | 44.4% / 18.4 s |
| Lightning | 146 | 46.7% / 14.3 s | 46.8% / 16.2 s |
| Psychic | 167 | 51.9% / 16.3 s | 51.4% / 18.4 s |
| Fighting | 111 | 50.1% / 14.6 s | 49.7% / 16.7 s |
| Darkness | 96 | 52.0% / 14.5 s | 52.6% / 17.4 s |
| Metal | 59 | 55.0% / 16.8 s | 54.9% / 19.1 s |
| Fairy | 11 | 54.3% / 21.7 s | 52.1% / 23.1 s |
| Dragon | 76 | 54.3% / 14.2 s | 53.4% / 16.0 s |
| Colorless | 132 | 44.1% / 16.6 s | 44.4% / 18.8 s |

Types **44.4-56.9%**. Against the start of this pass (`b5ea821`, no melee-build, cap 5, fill 140):

| peer group | kits | time to KO p10 / **p50** / p90 (s), b5ea821 | after | win rate p10 / p90, b5ea821 | after | kits at >= 90% or <= 10%, b5ea821 | after | of them with no damaging attack, b5ea821 | after |
|---|---:|---|---|---|---|---:|---:|---:|---:|
| basic | 409 | 7.4 / **21.4** / 54.1 | 7.5 / **19.2** / 45.4 | 14% / 84% | 15% / 81% | 52 | 47 | 16 | 16 |
| basic+ | 118 | 7.1 / **19.1** / 44.7 | 9.4 / **18.8** / 42.5 | 16% / 81% | 16% / 80% | 11 | 7 | 0 | 0 |
| stage1 | 245 | 5.2 / **16.1** / 40.1 | 6.5 / **15.5** / 33.8 | 13% / 85% | 18% / 82% | 32 | 26 | 0 | 1 |
| stage2 | 80 | 4.5 / **11.7** / 31.4 | 4.5 / **10.4** / 33.5 | 14% / 77% | 11% / 82% | 9 | 11 | 0 | 0 |
| V / GX / ex | 233 | 8.0 / **19.1** / 40.3 | 9.8 / **21.5** / 40.8 | 14% / 79% | 18% / 79% | 20 | 13 | 0 | 0 |
| VSTAR | 45 | 6.4 / **12.6** / 31.3 | 9.3 / **15.8** / 27.9 | 17% / 86% | 25% / 80% | 5 | 1 | 0 | 0 |
| VMAX | 57 | 10.5 / **19.3** / 33.9 | 11.4 / **23.4** / 39.8 | 21% / 78% | 27% / 75% | 1 | 1 | 0 | 0 |

Kits at >= 90% / <= 10%: 130 (b5ea821) -> 113 (merged) -> **106**; at >= 85% / <= 15%: 210 -> 160. Melee stats
(`node tools/melee/run.mjs`): melee-first 50%, dash-first 51%, ranged-first 48%; melee / dash-first against
ranged-first 52% (53% merged); fight median 18.4 s; stunlocks 0. By resolved shape (`byarch.ts --kind`): swings 51%,
dashes 55%, rings 55%, aimed areas 45%. Named cards: Radiant Charizard 64%, Lugia 73% / 77%, Rayquaza VMAX 39-54%,
Gyarados VMAX 33-41%.

**The cap at 10, VMAX against VMAX with hard bots** (240 fights, a throwaway script; the same fights with the meter
clamped at 5 for comparison): the TTK is 11.2 / 18.7 / 60.8 s (p10 / p50 / p90) at both caps, and so is everything
else: hard bots hold 2.8 pips on average when they cast, so they never bank past 5. In 104 of 240 fights the loser
took >= 60% of its HP inside one TURN at either cap: that is one big hit (a 240 is 172 after the curve, 69% of a
250-HP VMAX), not a banked burst. What a 10-pip bank changes is for players who wait: two big attacks back to back,
one recovery (at most 48 ticks) apart. Worth a human playtest; if it decides fights, a longer recovery after a hit
of 150+ is the lever, not the cap.

## 7. Screenshots

`npm run kits:shots` (Vite in-process, a stand-in collection built from the card data at run time) writes:

| file | kit in action |
|---|---|
| `shots/kits-beam.png` | Lugia's Elemental Blast: the aim telegraph as the beam fires across the lagoon |
| `shots/kits-cone.png` | Charizard's Fire Spin on Leafeon V: the cone, super effective, the grass burning |
| `shots/kits-area-telegraph.png` | Gyarados VMAX vs Charizard VSTAR: Max Tyrant's slam and the flood around it |
| `shots/kits-terrain-flood.png` | Kyogre flooding the meadow before Zeraora V's lightning |
| `shots/kits-status-sleep.png` | Haunter's Hypnosis: Raichu asleep; Dream Eater fizzles when its condition fails |
| `shots/kits-lost-impact.png` | Giratina VSTAR's Lost Impact knocking out Umbreon VMAX |

## 8. Tools

| command | what |
|---|---|
| `npm run kits:build` | build `data/kits` from `tools/kits/hand/*.ts` (`-- --check`: report without writing) |
| `npm run kits:coverage` | the mechanics clusters and coverage (`-- --md` for this page, `-- --leftovers`, `-- --dump N [regex]` to read parses; the last two print card text, never commit their output) |
| `npx vite-node tools/kits/list.ts [name regex] [--rule / --plain]` | card designs for authoring: attack names, energy, damage, mechanics (no text) |
| `npm run kits:tournament -- [--per 8] [--mixed] [--level normal] [--save rows.json]` | the balance tournament, sharded across cores |
| `node tools/kits/diagnose.mjs rows.json [--card regex]` | top / bottom kits with the features that explain them |
| `node tools/kits/compare.mjs before.json after.json` | the before / after table below |
| `npm run kits:shots` | the screenshots above |
| `npx vite-node tools/kits/lexicon.ts [--sample 32] [--leftovers]` | the move lexicon's coverage and archetype table (docs/MOVES.md) |
| `npx vite-node tools/kits/audit.ts [--top 60] [--md]` | the move audit: most-fielded attacks, before / now (docs/moves-audit.md) |
| `node tools/kits/bytype.mjs label=rows.json ... [--chart]` | win rate and median time to KO by type, for saved tournaments; `--chart`: the last run's win rate against foes weak to the type, neutral, resisting |
| `npx vite-node tools/kits/byarch.ts rows.json [--kind] [--all]` | win rate and extremes by the lexicon archetype of each kit's strongest attack (`--kind`: by its resolved shape) |
| `node tools/move_shots.mjs [--only name,...]` | move and type-flavour screenshots and their contact sheets (`shots/moves/`) |
| `npx vite-node tools/kits/signature.ts [--changed] [--names] [--pick]` | the signature-move report (docs/MOVES.md section 9): specific vs generic looks over the pool, hand-kit attacks carrying their archetype's trajectory; `--changed` lists hand attacks whose kind the adoption changed, with their notes |
| `node tools/sig_shots.mjs [--family f,...] [--only look,...] [--iconic look,...]` | signature-move contact sheets: telegraph / in flight / impact per look (`shots/signature/`, `sheet-pair.png`: Starmie's Psychic vs Power Gem) |
