# pokeshell arena: spec

Real-time, top-down Pokémon battles with the real cards you pulled in pokeshell. Inspired by
[Emerald Arena](https://github.com/GBurgardt/pokemon-emerald-arena) (MIT): move, aim, dodge, break props, and
combine type terrain (Water floods, Lightning electrifies the water). Bots first. Online play comes later, so the sim is
deterministic, fixed-tick and input-driven from day one.

Status: **contracts are v1** (sections 4, 7, 8, 9, 10, 11). Other agents build on them. Change a contract only
additively. Bump its `version` field for anything breaking.

**M2 decisions (the user's answers to the v1 open questions):** one untyped energy meter (section 5); you battle only
with cards you own (section 6); Pokémon evolve mid-match, earned (section 6); HP gaps are a card choice, so bots don't
scale to your team (section 11); about 20 s for a basic 1v1 is the pacing to keep; pokeshell holds the only pack-token
wallet (sections 2, 9, 10), except in the standalone download, which keeps its own (docs/RELEASE.md). Wins earn
tokens, 10 to a pack (section 9).

---

## 1. Repo layout and stack

```
docs/SPEC.md                 this file
index.html, vite.config.ts   the game (TypeScript strict + Vite + vitest)
src/sim/                     deterministic core: no DOM, no Math.random, no Date, no floats in state
src/sim/effects/ops/<op>.ts  one effect primitive per file (auto-registered), its test next to it
src/render/                  Canvas2D renderer (reads sim state and interpolates, never writes it)
src/input/                   keyboard / mouse / gamepad -> InputFrame
src/bots/                    the Bot interface and the bots
src/game/                    match flow, loading, HUD, screens
src/packs/                   the pack opening scene (pack agent)
data/kits/<card id>.json     per-card kits (kits agent), bundled at build time
public/arenas/<id>/          arena.json + bg.png (+ props.png) (arenas agent), served at /arenas/<id>/
host/                        arena-host: a Rust crate with its own exe (serves dist/ and the JSON API)
scripts/pokearena.ps1 (.cmd) the launcher
install.ps1                  builds the game and the host (later: downloads a release), prints the PATH line
tools/                       build_sprites.py and other maintainer tools
```

**TypeScript + Vite + Canvas2D.** I picked Canvas2D over PixiJS. The scene is a 48x27 tile grid, two fighters, a few
dozen projectiles and particles, all pixel art drawn with smoothing off. Canvas2D does that at 60 fps with no
dependency. It behaves the same in a browser and in a Tauri webview, and it is easy to screenshot in tests. The renderer is
one module behind `Renderer` (`render(prev, cur, alpha)`), so PixiJS/WebGL (water shimmer, glow filters) can
replace it in M4 without touching the sim.

**Launch.** `pokearena` (`scripts/pokearena.cmd` -> `pokearena.ps1`) starts `arena-host.exe` if it isn't
already running. The host writes `<arena state>/host.json` `{port, pid, started}`, and `/api/health` confirms it is up. The launcher
then opens the default browser on `http://127.0.0.1:<port>/`. The host exits by itself 60 s after the last page heartbeat
(`POST /api/heartbeat` every 5 s), or on `POST /api/shutdown`. So nothing is left running and nothing ever needs
killing. `install.ps1` runs `npm ci`, `npm run build` and `cargo build --release` (MSVC toolchain, like pokeshell's
binder) and prints the one PATH line for `scripts\`. A release zip (dist + exe) will replace the build step later.

**Standalone (M4): Tauri 2.** `src-tauri/` wraps the same `dist/`. `arena-host.exe` ships as a Tauri sidecar
(`bundle.externalBin`) started on port 0, and the webview loads `http://127.0.0.1:<port>/`. There is no code fork: the game
only ever talks to the host over HTTP.

## 2. The pokeshell dependency (one-way)

pokeshell knows nothing about the arena. The arena finds pokeshell the way pokeshell's own CLI does. It uses
**only pokeshell's JSON CLI commands**, plus read-only files pokeshell documents (the web export's images).

**Finding pokeshell** (the host tries these in order):

1. `--pokeshell <pokeshell.ps1>`, or `$env:POKEARENA_POKESHELL`.
2. The module base in `<pokeshell state>/current/module-base.txt`, then `<base>/scripts/pokeshell.ps1`.
3. `<pokeshell state>/current/scripts/pokeshell.ps1`.
4. `pokeshell.cmd` on PATH.

The pokeshell state dir is `$env:POKESHELL_HOME`, else `%LOCALAPPDATA%\pokeshell`. Every call is
`powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File <pokeshell.ps1> <args>`, with `POKESHELL_HOME`
passed through and a 60 s timeout. The host parses stdout as one JSON document.

**Commands the arena needs from pokeshell.** `version`, `collection` and the `pack` commands are on pokeshell main
(its README "For other tools", docs/BOOSTERS.md).

| command | returns (stdout JSON) | used by |
|---|---|---|
| `pokeshell version --json` | `{name, version, api, root, state, packs, carddata, commands:[...], features:[...]}`. `api` is an integer bumped on JSON changes | `/api/health` (optional: without it each command is probed on first use) |
| `pokeshell collection --json [--pack <id>]` | `{api, version, state, counts, cards:[{card, character, name, set, number, rarity, tier, caught, count, shiny, art, data}]}`. `data` (caught cards only) is the text half's gameplay fields: `hp` (a number), `types, subtypes, evolvesFrom, abilities, attacks[{name, cost, convertedEnergyCost, damage, text}], weaknesses, resistances, retreatCost, rules`. It has no id/name: they are on the entry. `art.img` / `art.imgShiny` are relative to `<pokeshell state>/web/img` | roster, auto-kits, card faces |
| `pokeshell pack sets --json` | `{sets:[{id, name, series, cards, odds:[{tier, weight}], art}]}`: the sets packs can be opened from | pack picker |
| `pokeshell pack open <set> --json` | `{set, setName, packId, cards:[{id, card, name, rarity, tier, fx, hit, shiny, isNew, image, pullId, pull, ...}], spent, tokens, imageRoot}`: pokeshell spends one of its pack tokens and records the pulls (caught). A failure is `{error, message, code: "no-tokens"|"error", tokens}` (exit 1) | the pack opening |
| `pokeshell pack grant <n> --reason <text> --json` | `{granted, reason, id, balance}`: adds pack tokens to pokeshell's wallet | rewards (a win) |
| `pokeshell pack tokens --json` | `{balance, recent:[{time, delta, reason, id, set, pack}]}` | the wallet |

`packs/pokemon/carddata.json` in pokeshell (`{format, cards: {<id>: data}}`, every served card) is what the kit tests
read (`POKEARENA_CARDS`). The game itself only uses `collection --json`.

**Graceful failure.**
- **Not found**: `/api/health` says `pokeshell: {found:false}`. The game runs in practice mode (pilot kits only,
  no rewards).
- **Found, but a command is missing** (non-zero exit or non-JSON stdout): that endpoint answers **501**
  `{error:"pokeshell_unsupported", need:"pokeshell pack open <set> --json", have:"<version>"}`, and the game shows
  "update pokeshell to ...". Probing is safe: an old `pokeshell pack open x` just errors "no pack 'open'" and never
  changes config.

The host never reads pokeshell's `pulls.log` or `pack.json` directly.

**Card faces** come from pokeshell's web export at runtime. The host serves `<pokeshell state>/web/img/**`
read-only at `/pokeshell/img/**` (`pokemon/<character>/<card id>[-shiny].png`, 1 px per art pixel). If the export
is missing, the game draws a text card. `pokeshell binder --web` creates the export.

## 3. Sim core (deterministic)

- **Fixed tick: 60 Hz.** `step(def, state, inputs[])` advances exactly one tick.
  - `def` (`MatchDef`) is immutable: arena, kits, rules, seed.
  - `state` (`SimState`) is plain JSON-able data (numbers, strings, arrays, plain objects), so `cloneState` and
    `hashState` (FNV-1a over a canonical serialization) are cheap. Rollback = clone, then re-step.
  - Entities update in id order, and every loop over players runs in player-index order.
- **Numbers.**
  - Positions and velocities are integers in **sub-pixels, 256 per design pixel** (`FP = 256`).
  - Angles are integers 0..255 (a "binary degree"). sin/cos come from a committed integer table (x65536), never
    `Math.sin`.
  - Distances use an integer square root, and division is `Math.trunc`/floor on integers.
  - Chances are permille (0..1000). No floats are stored in state.
- **Randomness.** One seeded PRNG (xorshift32 via `Math.imul`) lives in `state.rng`. Coin flips, status wake-ups and
  chance effects all draw from it in a fixed order. Bots have their own seeded PRNG (they are input producers).
- **Time units.** `TURN = 90 ticks` (1.5 s) is the unit card text is translated with. "During your opponent's
  next turn" = 1 TURN, and "between turns" damage lands every TURN.
- **World.**
  - The design space is 1920x1080 px and a tile is 40 px, so the grid is 48x27.
  - Fighters are circles (radius 20 + 2 x retreat px): that circle is the **hitbox** attacks test against.
  - Terrain sees a smaller **collision body** (src/sim/movement.ts): a circle of `min(16, 2/3 r)` px (rules
    `BODY_MAX_PX`), centred at the **feet**, 0.6 r below the fighter's position, where the sprite stands. A 32 px body
    fits every 1-tile (40 px) corridor; tools/arenas/validate.py checks corridors with the same number.
  - Movement is sub-stepped (<= 4 px), axis-separated and taken up to contact, so a blocked axis never cancels the
    other: a diagonal into a wall slides along it. **Corner nudging:** a straight move that clips a corner by up to
    20 px slides sideways around it, and a diagonal that meets a corner point head-on rounds it.
  - A body left overlapping a blocking tile (a bigger evolution, a swap-in, a tile turning solid) is pushed to the
    nearest free spot before it moves. Fighters push each other apart through the same grid moves (never into a
    wall), and the share a pinned fighter can't take goes to the other one.
  - **Movement traits** (`FighterKit.move`, copied to `Fighter.move`; types `MoveTraits`): `crossWater` / `hover`
    make deep water walkable, `speedIn.water` / `speedIn.grass` set the speed (permille) on that terrain, `hover`
    ignores the shallow-water slow, `noKnockback` is read by combat. movement.ts is the only reader of the rest.
  - F3 in a match (or `?debug=1`) toggles the collision overlay: the grid as the sim sees it, hitboxes (yellow) and
    bodies (cyan).
  - Hitboxes are circles for fighters, projectiles and areas. Beams are capsules (a segment plus a width) cut off
    at the first wall. Cones and melee are range + arc tests with integer dot products; a melee swing tests its arc
    every live tick (src/sim/melee.ts, docs/MELEE.md), a few px (`LANDING.padPx`) and binary degrees
    (`LANDING.padArc`) past the drawn wedge.
- **Entities.** Fighters (the active Pokémon of each side), projectiles, beams (live a few ticks for the visuals and hit
  once), areas (persistent circles that pulse), props (breakable tiles with HP), and the terrain grid.
- **Terrain grid.** Base tiles come from the arena (section 8), plus a surface layer per tile: `none | water | shock |
  fire`, with a TTL. Built-in element reactions run on every impact of an attack of that element, with no kit work:
  - **`~` is deep water**: nobody walks or dodges into it (except fliers, and `crossWater` / `hover` traits), but
    shots and beams fly over it. **`_` is a pit** (the void, a drop): the same, fliers and `hover` only. **`=` is a low
    obstacle** (a rock, a bush, a ledge): the same as a pit. Only tall things (`#` walls, trees, pillars, and `o` props)
    stop shots.
  - **Fliers**: a species flies when it is Flying-type or can have Levitate in the main-series games, or is a clear
    floater (data/flying.json, built by tools/build_flying.py from PokeAPI; no network at run time). newFighter adds
    `fly` to its movement traits: it crosses deep water, pits and flooded shallows (no shallow-water slow) and is
    drawn lifted over them; walls and props still stop it. A non-flier that comes on over water or a pit (a swap, a
    KO replacement, an evolution) lands on the nearest floor.
  - **A Water `paint` floods floor** for 8 s (shallow water: walkable). Shallow water slows non-Water fighters
    to 70% (Water types move at 120%).
  - A **Lightning** impact on water (deep or shallow) electrifies the connected water within 6 tiles for 2 s.
    Non-Lightning fighters whose circle touches electrified water (standing in the shallows, or hugging a deep
    shore) take 10 damage every 0.5 s, with a 30% paralysis roll on first contact.
  - A **Fire** impact on tall grass ignites it. The fire spreads to adjacent grass every 0.5 s and lasts 3 s,
    then the tile is floor. The fire burns non-Fire fighters standing in it.
  - Fire on shallow water makes steam (the flood is gone). Water on fire puts it out.
  - **`^` is lava / hazard**: walkable. Non-Fire fighters take 10 damage per second on it. Fire types are immune,
    and flooded lava is cooled (harmless) while it stays wet.
  - `"` tall grass hides a fighter beyond 3 tiles (bots can't see it).
- **Step order (per tick).**
  1. inputs
  2. status gates
  3. swap
  4. dodge
  5. move + collide
  6. attack start (pay energy, windup: the aim locks until release, the telegraph)
  7. casts resolve (spawn shapes)
  8. projectiles/beams/areas advance and hit (effects)
  9. status ticks + terrain damage
  10. terrain decay/spread
  11. energy fill
  12. KOs (the knockouts stat), the winner (full elimination), phase
  13. `tick++`
- **Render interpolation** is outside the sim. The renderer keeps the previous state's positions and lerps with
  the accumulator's alpha. The page loop runs at most 5 sim steps per animation frame. A drawn position is rounded
  to a whole pixel once, after the lerp; body motion (the walk hop) runs on sim time, not on animation frames, so it
  looks the same at 60 and 144 Hz; a hit-stop or pause holds the current tick and interpolation resumes from it
  (`src/render/pose.ts`, tested at 60/120/144/165 Hz).

## 4. Input (contract)

There is one `InputFrame` per player per tick. The sim never reads devices.

```ts
type InputFrame = { mx: -1|0|1, my: -1|0|1, aim: number /*0..255*/, buttons: number /*bitmask*/ }
// buttons: 1 ATTACK1, 2 ATTACK2, 4 ATTACK3, 8 DODGE, 16 SWAP_PREV, 32 SWAP_NEXT, (slot<<8) SWAP_TO slot 1..6,
//          64 EVOLVE, (n<<11) with EVOLVE: evolve into option n (1..7) of evolveOptions() (none = option 1)
```

Diagonal movement is scaled by 181/256. A button press is an edge: the sim compares the frame with the previous frame it
stored. So frames are self-contained, and netcode can resend or predict them. Replays = seed + input log.

**Controls.**
- **Keyboard and mouse.** WASD / arrows move. The mouse aims; without it, you aim in the last move direction. **All
  aiming is manual** (the user): no aim assist, no snapping, no auto-facing; an attack goes exactly where the mouse,
  the right stick or the keyboard aim points. Bots aim through the harness, with its aim error. The one exception
  (the user: "sure"): a melee swing's **step-in** bends toward the foe you are aimed at when it is within
  `MELEE_STEP_MAGNET_DEG` (15°) of your aim, at most that much (src/sim/melee.ts). The swing's arc stays on your aim
  and shots, beams and areas get nothing.
  - Attacks: left click / J, right click / K, middle click / L. **Hold to aim, release to fire** (the user): while a
    button or key is held, the attack's telegraph follows the aim at full strength and you can still move; the release
    sends the attack button's press edge, so the attack casts once, in the aim of the release tick. A swap (a number
    key, a picker click, the pad's d-pad), the pause menu or losing focus cancels the attack being aimed: nothing casts
    and nothing is spent. Released without the energy, the attack fizzles with "not enough energy" over the fighter.
    `InputFrame.aimHeld` (1..3, 0 = none) says which attack is being held; it is render/input only, the sim ignores it.
    **While aiming, the predicted damage** (the user: "see predicted damage while aiming, in a different colour than
    the X+ colour") shows over the foe the attack points at, and under the printed number on the attack card: cyan
    (`#6ff3ff`), never the printed number's gold. "≈ 60" for a fixed attack; "30–90 (avg 60)" for a coin flip; tags for
    weakness / resistance, a KO, several hits, a Confused caster. With no foe on the aim path it shows the nearest
    foe's number, dimmed ("nearest · off aim"). It is `src/sim/predict.ts`: a dry run of the real pipeline on a copy of
    the state (the cast paid, `shapes.release` and the advance functions with the target kept on the shape's path, so
    every op, the damage curve, W/R, shields, buffs, energy and statuses count as they would), never the sim's RNG
    (coin flips are enumerated for exact bounds; the average is exact for coins, seeded runs for weighted rolls).
    Render-only, recomputed every 6 frames while aiming (~0.1 ms).
  - **Attack info: hold I** (the pad's Back / Select) to peek at your active Pokémon's attack sheet over the arena
    without pausing: cost, printed damage (gold), the card's text, the "in the arena" line and the prediction on the
    nearest foe (cyan). The controls hint lists it.
  - Dodge: Space or Shift.
  - Swap: **the number keys 1-6** (the user). Q / E don't swap, and mid-fight nothing on the HUD is clickable: the HUD
    over the arena passes every click through to the arena, so a click over the team bar or the EVOLVE prompt aims an
    attack there. The one exception is the forced swap picker after a KO: a click on its card sends that Pokémon in
    (the user: "clicking on cards is OK when dying"), as its number key does.
  - Evolve: F. With several options, Tab / Shift+Tab pick which one F takes (the prompt highlights it).
  - Esc pauses (volume, mute, Quit match). M mutes.
  - **Quit match** (the user: "there should also be a quit match button"): the pause menu's Quit match (or Q in the pause
    menu), and a small always-visible Quit match button in the HUD's bottom-right corner, above the controls hint (the
    one HUD element that takes clicks, a DOM button out of the play area). Both ask "Forfeit? This counts as a loss."
    (Q / Enter forfeits, Esc keeps playing; the match stays paused while it asks, and any held aim is dropped). A
    forfeit ends the match as a loss with no pack tokens, reported with `forfeit: true`, then a short FORFEIT result
    screen with Rematch / New bots / Loadout.
- **Gamepad** (standard mapping):
  - Left stick moves (8-way), right stick aims.
  - RT / A attack 1, RB / X attack 2, Y attack 3: hold to aim with the right stick, release to fire.
  - LT / B dodge. D-pad left/right steps through the bench (a pad has no number keys). LB evolves. Start pauses.

## 5. Energy: one meter

The user's call ("no need for complicated energy meters"): each trainer has **one energy meter**. It fills over time
and every attack costs its card's **energy count** (`convertedEnergyCost`: each symbol on the card is one pip,
whatever its type).

- **The meter**: 0-10 pips (`ENERGY_CAP`, the user's call), **one pip per 180 ticks** (`ENERGY_FILL`, 3 s), **1 pip at the start**
  (`ENERGY_START`). Under the timing model (section 7: no cooldown on attacks that cost energy) the meter is the
  pacing. The balance-tune pass made small hits land harder (`DAMAGE_CURVE` below 40) and melee-build made swings
  connect twice as often, so the fill went from 140 to 180 to keep a basic 1v1 at the ~20 s the user asked for
  (tournament median 19.2 s with melee in; docs/KITS.md "Balance").
- **Costs.** Pikachu's Thunder Jolt (Lightning + Colorless) costs 2 pips; Charizard's Fire Spin (4 Fire) costs 4, so
  big attacks are still commitments; cheap ones fire as often as the meter allows, with a short recovery after each.
- **Retreat cost = swap cost.** Swapping out costs the leaving Pokémon's retreat cost in pips, like discarding
  energy to retreat. A KO'd Pokémon's replacement comes in free. Retreat also sets weight: move speed is
  `300 - 25 x retreat` px/s, and it sets the radius.
- **Energy effects**: `discardEnergy` and `gainEnergy` take or add pips (their `type` no longer matters on the one
  meter); `bonusPerEnergy` counts unspent pips. "For each Energy attached to this Pokémon" (`bonusPer` `myAttached`)
  and "discard Energy from your Pokémon: N for each" (`spendEnergy` `paid: 1`) also count the pips the attack was paid
  with: in the TCG that energy is still attached, and on the one meter the leftover alone is nearly always 0.
- **Compatibility.** `PlayerState.pips` / `fill` stay arrays (length 1). `PlayerDef.energy` and teams.json's
  `energy` are legacy and ignored; so are the `types` parameters of `energy.ts` (the typed multi-meter path is gone).
  Effects touch energy only through `src/sim/effects/pips.ts`.

## 6. Stats from real cards, teams and modes

| card | arena |
|---|---|
| HP | the printed HP soft-compressed toward the middle (`HP_CURVE`: 40 -> 50, 120 -> 120, 330 -> 250); the order never changes. `FighterKit.printedHp` keeps the printed number |
| attack damage | the printed damage (`+`, `x` and `-` damage is expressed with effects: coins, counts), times the attack's balance `power` (its type's and its shape's, docs/KITS.md), then the soft curve before weakness (`DAMAGE_CURVE`: small hits land a little harder, 10 -> 16, 20 -> 26, 30 -> 34, 40 -> 40; big ones compressed, 120 -> 100, 240 -> 172, 320 -> 216). `MatchDef.raw` skips the power and both curves (mechanics tests) |
| weakness `x2` | incoming attack damage of that type x1.6 (`WEAKNESS_PER_TIMES` 600 per step of the printed multiplier; the attack sheet still shows the card's "×2"). A `+N` weakness on older cards adds N |
| recoil ("does N damage to itself") | 70% of N, to 10, at least 10 (`SELF_DAMAGE_PERMILLE`: the hit it pays for is curved, the recoil wasn't) |
| resistance `-30` / `-20` | incoming attack damage of that type minus the printed value (min 0) |
| retreat cost | swap cost in pips, move speed, radius (section 5) |
| subtypes V / VSTAR / GX / EX / ex / VMAX | no prize value: there are no prizes (the user's call: "full team elimination"). Their cost is their big HP and damage, which the balance curves and telegraphs soften (docs/KITS.md) |
| GX attack / VSTAR Power | once per match per trainer (`oncePerMatch: "gx" / "vstar"`), as in the TCG |
| status conditions | Paralyzed: 1 TURN. Asleep: until hit, or a 50% wake roll each TURN. Confused: 3 TURNs, and each attack flips a coin (tails: 30 self damage, the attack is lost). Burned: 20 per TURN, then a 50% cure roll. Poisoned: 10 per TURN. Swapping out clears them all, as retreating does |

Weakness/resistance apply only to attack damage (`damage` with `wr: true`, the default). As in the TCG, they never
apply to bench damage, self damage or terrain.

**Modes.**
- **Bot matches come in two modes**, Random decks and You choose (section 11), each shown on a reveal before the fight.
- **Your cards only.** You battle with the Pokémon cards you caught (`pokeshell collection --json`); there is no
  practice roster. Without pokeshell, or with no caught Pokémon, the page says how to get cards (install pokeshell,
  catch pulls in its tabs, `pokeshell pack open <set>`) and offers no fight.
- **1v1** (quick match): one Pokémon each, best of 1. A KO wins.
- **Team** (3-6 cards, bench swaps):
  - **Full team elimination**: a side wins when every Pokémon on the other team is KO'd (a VMAX KO is one KO, like any other). `PlayerState.kos` counts knockouts for the result screen.
  - On a KO, the owner picks the next Pokémon within 3 s (else the next slot comes in). It enters with 1 s of
    invulnerability.
  - **Every enemy is beaten in the arena** (the user: "im still not having to kill all the enemies"). Bench damage
    hits benched Pokémon's HP but can't Knock Out a Pokémon off the field: it floors at 10 HP (`BENCH_FLOOR_HP`, the
    TCG's damage counters on a Pokémon still in play), so a bench-damage deck softens the bench and the damage shows
    as a "−30 to bench: Togepi" callout by the team row. One rule constant, `rules.BENCH_CAN_KO` (default false),
    brings the old bench KOs back. Before the rule, a headless probe (`tools/elim/probe.ts`, 300 bot-vs-bot team
    matches) found 54 of 1479 KOs off the field and 14 eliminations won without facing the whole team; after it, 0.
    The `ko` event says `where: 'active' | 'bench'`.
  - **Elimination you can see**: an enemy KO shows a banner ("Zeraora VMAX KO'd · 2/3", then "LAST ONE!" or "TEAM
    ELIMINATED!"); both team rows stay drawn at full strength when a fighter walks under the panel, KO'd members greyed
    and crossed, members that haven't come in yet as "?" silhouettes; the result screen lists each enemy with how it
    went down (by which Pokémon and when, still standing when time ran out, or never came in; src/game/elim.ts).
  - **The team bar** shows every member (HP, KO, its number key), the swap cost (the active's retreat, and whether the
    meter can pay it now) and the swap cooldown. After a KO a picker shows the bench with the 3 s countdown.
- **Evolving mid-match** (earned, "part of the ROM game too"):
  - Each trainer has an **evolve charge**, 0-60 (`EVO_MAX`). Attack damage you deal fills it one point per HP, each
    KO you take adds 30 (`EVO_KO`), and it creeps up 1 point per 15 fight ticks on its own (`EVO_PASSIVE_TICKS`, 15 s
    from empty), so start lines stay reachable in a short 1v1 and a low-damage Pokémon still gets there.
  - **Start lines** (`src/game/lines.ts`; the user: "force matches to start on basics when using a Pokémon that was
    intended to be evolved into"). A slot holding an evolved card (Stage 1, Stage 2, VMAX, VSTAR: anything with a
    lower stage) enters the match as the **Basic of its line**; the picked or rolled card is where the slot evolves
    to: Charizard enters as Charmander, then Charmeleon, then Charizard (two evolves); a VMAX / VSTAR enters as its V.
    For you and the bots, in every mode (Random, You choose, 1v1, team).
    - Which lower stage: one you **own** first (the same set as the picked card, then the same era, then any, then
      the lowest card number); owning none, a **loaner**: the real card of that stage from every card (the bot
      roster), same set first, marked "loaner" on the loadout, the reveal and the evolve prompt. `NO_BASIC_OWNED`
      switches loaners off ("as-is": start as the lowest owned card of the line). Bots own every card: no loaners.
    - When no card of a lower stage exists in the roster (Lunala without a Cosmoem card), the slot starts as the
      lowest card that does.
    - The loadout slot and the reveal show the line ("Charmander → Charmeleon → Charizard"). The result records the
      picked cards.
  - When it's full, the active Pokémon can evolve. **Option 1 is its slot's next step** on its line; the other
    options are the cards you **own** that evolve from it, from your whole collection (`evolutionPool`, up to 7), each
    card once per match. F takes the highlighted one, Tab moves the highlight.
  - **Which card evolves from which** (`src/sim/evolution.ts` `canEvolveInto`), what a player expects, true to the TCG:
    - names compare normalised: case, accents (Flabébé), punctuation (Farfetch'd, Mr. Mime, Porygon-Z), ♀ / ♂;
    - a regular Stage 1 / Stage 2 evolves from any card of the **species** its `evolvesFrom` names, whatever the set,
      form or prefix (a Zigzagoon takes a Galarian Linoone, a Charmeleon a Dark Charizard);
    - VMAX / VSTAR (and Mega, V-UNION) only from the exact card they name, the V (`NO_V_SHORTCUT`: a plain Umbreon
      does not take Umbreon VMAX); a Basic V is not an evolution of anything, and rule-box cards (V, GX, ex,
      Radiant) never evolve into regular stages;
    - a Neo Baby grows into its Basic (Magby -> Magmar).
  - **The HUD says why** (`evolveStatus`): the evolve bar reads "no owned evolution", "charge 40/60 → Charmeleon",
    "already evolved this match" (the card it could take was used), "top stage" (nothing evolves out of it, from
    every card), or "F → Charmeleon" when it's ready. A press that can't evolve floats the same reason.
  - Evolving keeps the damage taken, as damage counters do (new HP = the new card's HP - damage), clears special
    conditions, gives 1 s of invulnerability (`EVOLVE_INVULN`) and empties the charge. The renderer plays the evolve
    animation (event `evolve`).
  - Bots evolve too, into the next-stage cards of the bot roster (section 11). `PlayerDef.evolutions` lists each
    side's evolution kits and `PlayerDef.paths` each slot's line; `evolveOptions(def, s, p)` gives the choices; it's
    all sim state, deterministic, tested.
- **Match flow**: loadout -> arena -> 3 s countdown -> fight (3 min cap) -> result. At the cap, the winner is the one
  with more of its team's total HP left, as a share of its max (no prizes). The result screen says so ("Time! You had
  more HP left", kicker "TIME! · WON ON HP, NOT BY ELIMINATION"), so a time win never reads as an elimination. If still tied: 30 s sudden death (all meters full, terrain
  hazards spread).

> **Answered (M2):** only your own caught cards; evolving mid-match is in, earned; the raw TCG HP gap is fine ("a
> card choice thing"), so there is no HP normalisation and bots don't match your team.
>
> **Later decisions:** matches are won by full team elimination, with no prizes. After the first playtest ("level
> the playing field just a bit") HP and damage are soft-curved toward the middle. The order never changes and a VMAX
> still beats a Basic 1v1 (docs/KITS.md "Balance").

**The look.** Every screen uses the shapes of pokeshell's web binder (pokeshell `tools/binder-web/index.html`) in the
arena's own dark palette (the user: "I don't like the bright vibe"): navy panels, gold accents, type-coloured card and
attack frames, cyan for you and coral for the bot. One theme, dark, for everyone. The tokens live in `src/theme.css`,
and `src/theme.ts` hands them to the canvas HUD. Fonts are the binder's (Fredoka, Silkscreen, Caveat from Google Fonts,
with system fallbacks offline). The loadout is an open binder (a stitched navy board, a spine, two pages), the mode
buttons are its divider tabs, team slots are clear pockets, cards sit in type-tinted frames, chips and key chips are
the binder's; the HUD is dark panels with divider tabs over the arena. The pack opening keeps its own stage and reveal
effects, with the same buttons, labels and summary page.

## 7. Kits and the effect library (contract)

A kit turns one real card into a moveset. Kits live in `data/kits/<card id>.json` (pokemontcg.io id).
- **Card data is the source of truth** for the numbers: `hp`, types, weaknesses, resistances, retreat, and each
  attack's `name`, `cost` and `damage`. It comes from `pokeshell collection --json` (`data`, from pokeshell's
  shipped `carddata.json`). `resolveKit(card, kit?)` merges them: the kit adds shapes and effects, and any
  number the kit gives (`stats.*`, an attack's `cost` / `damage`) is an **override**. Kit attacks match card
  attacks by `name`, else by position.
- **Hand kits** (`data/kits`, 605 files from `tools/kits/hand/*.ts` via `tools/kits/build.ts`) carry shapes, extra
  effects and a `fantasy` note, and no numbers: the card data is the source of truth. A number a kit does override
  is listed in its `overrides` with the reason, and `npm test` fails on an undocumented or stale one.
- **Cards without a kit** get an **auto-kit** (`autoKit(card)`, `src/sim/autokit.ts`): the card-text parser
  (`src/sim/cardtext.ts`) turns the attack text into effect ops at run time, and the shape comes from **the move
  lexicon** (`src/sim/lexicon.ts`, docs/MOVES.md): the attack's name, then its text, pick one of 94 archetypes (a
  trajectory, a hit area, a windup and a feel), sized by its damage and cost. Every attack in the pool maps; the
  type fallback remains for unseen cards. docs/KITS.md has the mechanics mapping and the coverage.
- **Layers**: the type flavour (below) -> the move lexicon -> the hand kit. A hand shape wins, but inherits the
  lexicon's trajectory when the kinds agree, and a hand shape of the wrong range class for its name takes the name's
  archetype at build time (`!` pins it).
- **Type flavours** (`src/sim/flavors.ts`): one signature trait per type on every attack of that element, applied when
  the kit resolves (`flavor: false` on a kit or an attack opts out). The traits are data on the `ResolvedAttack`
  (shape params, extra effects, a `traits` list the sim reads):

  | type | trait | movement (`FighterKit.move`) | recovery x |
  |---|---|---|---:|
  | Psychic | gentle homing on a single shot (<= `PSY_HOMING` = 1 binary degree a tick toward the nearest foe; a volley doesn't home), speed -2 but at least `PSY_MIN_SPEED` 10, -10% damage | blink dodge, hover | 1.00 |
  | Fire | shots paint a fire trail (`TRAIL_TICKS` 45); other shapes scorch r24 where they land (45 ticks) | flame roll | 1.00 |
  | Water | knockback 50, a water paint where it lands | `speedIn.water` 1300 | 1.00 |
  | Lightning | speed +3, `chain` (30% more into water / shock, and to foes nearby) | burst roll (4/3 speed, 0.7 cooldown) | 0.75 |
  | Grass | slow 250 for 60 ticks, drain 150 | `speedIn.grass` 1250 | 1.00 |
  | Fighting | `armor` trait: -25% damage taken and no knockback while winding up; knockback x1.5 | shoulder roll (shoves 90 px) | 1.25 |
  | Darkness | `ambush` trait: x1.3 from behind or into a foe mid-cast; melee lunge +30 | blink dodge | 1.00 |
  | Metal | speed -1, `propDamage` 2000, +20 defense for 60 ticks after casting | `noKnockback` | 1.25 |
  | Dragon | pierce >= 1, beam width +6 | none (fliers are species: `fly`, data/flying.json) | 1.00 |
  | Fairy | the target's damage -20 for a TURN | float dodge (longer, slower), hover | 1.00 |
  | Colorless | windup -2 (at least 4) | | 0.85 |

  Plus a per-type balance knob, `power` (a multiplier on the whole hit, `ResolvedAttack.power`, applied in
  `combat.attackDamage` before the curve): Fire 850, Water 1200, Lightning 1150, Fighting 1100, Metal 960, Fairy 950 permille.
  Homing exists only here; `validateKit` rejects it in a kit.
- **Shape levelling** (`kit.levelShape`, after the flavour, for every kit): a ring (an area around the caster, or a
  swing of 200+ binary degrees) needs no aim, so it hits at `RING_POWER` 750 and winds up at least `RING_MIN_WINDUP` 14
  ticks; a dash (you are the hitbox) hits at `DASH_POWER` 850; a close swing hits at `MELEE_POWER` 1000 and is never
  narrower than `MELEE_MIN_ARC` 32 (45°, `src/sim/melee.ts`'s own floor). The powers multiply into `power` with the type's.
- **Trajectories** (`shape.path`, `PATHS` in `src/sim/shapes.ts`): `straight`, `lob` (over walls, props and fighters;
  lands on a foe once it has risen `LOB_RISE` px, else bursts `blast` at the end of its range), `boomerang`, `zigzag` /
  `weave` / `spiral` (`amp`, `period`), `bounce` (`bounces`), `phase` (through walls), `drift` (an area moving
  `drift` px a tick), `leap` (a dash out of reach, passing over fighters, bursting `blast` on landing). A shot with
  `blast` detonates where it ends; an aimed area with `count` lands a line of impacts `stagger` ticks apart; a
  multi-shot volley (`count`) hits each target once. The telegraph draws the path.
- **Pilot kits.** The five M1 kits carry their full numbers as overrides. `npm test` checks every kit against the
  card data when it is available (`POKEARENA_CARDS=<carddata.json or dir>`).
- **No card text.** Kits hold our own effect encoding, never the card's rules text. The attack sheets (loadout hover / ⓘ, the reveal's
  Attacks (I), the in-match peek) show the card text read at run time from pokeshell's `collection --json` answer
  (every card in it, caught or seen); a card that isn't in it (a bot's) shows only its arena line. The arena line is
  generated from the kit by `src/sim/explain.ts` (one sentence per op; its test fails for an op with none).
- **Defaults** (`resolveKit`, the timing model): windup 6 + 2 per extra pip, at least 6 + damage / 20 (+1 per 30
  printed HP above 150: heavy cards telegraph longer). **No cooldown on an attack that costs energy** (the meter paces
  it); a **recovery** after every attack of 18 + damage / 9 ticks, at most 48 (0.3-0.8 s), times the type's recovery
  factor; a **0-cost attack keeps a cooldown** of 150 ticks (`ZERO_COST_COOLDOWN`), plus 3 ticks per point of damage
  above 20 (`ZERO_COST_PER_DAMAGE`: a free 60 waits 270 ticks). A kit's own `cooldown` /
  `recovery` still wins. A projectile flies `damage / 40` px/tick slower (at least 8). `baseDamage` is the printed
  number, or for an attack that prints none, the damage its effects do in a typical hit (`estimateDamage`), so bots
  weigh it. The evolve charge creeps up with time for everyone (`EVO_PASSIVE_TICKS`), and a Pokémon with no damaging
  attack gets 1 more every 30 ticks (`EVO_IDLE_EVERY`: it can't earn any by damage).
- **No aim assist, no lock-on**: every shape leaves where it was aimed; the only curve is the Psychic type's gentle
  homing (above). The aim locks while an attack winds up (the windup is the telegraph), except a close attack's
  (melee, dash): it keeps following the held aim until it releases (`LANDING.track`, docs/MELEE.md "Landing").
- **HUD note**: with no cooldown on paid attacks, the attack buttons' cooldown sweep is idle except for 0-cost attacks
  and the recovery; the pip cost against the meter is what gates a button. The HUD needs no change to work; a
  recovery sweep on the fighter ring would read better (a UI-branch item).

```jsonc
{
  "version": 1,
  "card": "base1-58", "character": "pikachu", "name": "Pikachu",
  "stats": { "hp": 40, "types": ["Lightning"], "subtypes": ["Basic"],
             "weaknesses": [{"type": "Fighting", "value": "×2"}], "resistances": [], "retreat": 1 },
  "attacks": [
    { "name": "Thunder Jolt", "cost": ["Lightning", "Colorless"], "damage": "30",
      "element": "Lightning",                  // optional: default = the first typed cost, else the Pokémon's type
      "shape": { "kind": "projectile", "speed": 14, "radius": 10, "range": 640 },
      "windup": 8, "recovery": 10, "cooldown": 30,          // ticks (defaults 6 / 8 / 20)
      "oncePerMatch": null,                                  // "gx" | "vstar" | null
      "onCast":   [ { "op": "coin", "tails": [ { "op": "selfDamage", "amount": 10 } ] } ],
      "onHit":    [ { "op": "damage", "amount": 30 } ],
      "onImpact": [] }
  ],
  "passive": null,                              // reserved (abilities), M2
  "notes": "free text for reviewers"
}
```

**Shapes** (`shape.kind`; sizes in design px, speeds in px/tick, angles in binary degrees, 256 = 360°):

| kind | params | hits |
|---|---|---|
| `projectile` | `speed, radius, range, pierce?(0), count?(1), spread?(0)` | the first enemy / prop / wall; impact point |
| `beam` | `length, width, ticks?(6)` | everything along the capsule, once; stops at walls |
| `cone` | `range, arc` | every enemy in range and arc, once |
| `melee` | `range, arc?(64 = 90°), lunge?(px), style?` | a live swing (src/sim/melee.ts, docs/MELEE.md): its arc is tested every live tick (`active`, 3) after a step-in of `lunge` px over those ticks, in `strikes` (taps, then the finisher that runs onHit once); holds, throws, parries by `style` (read from the attack's name when absent) |
| `area` | `radius, at: "self"|"aim", range?(aim distance cap), ticks?(1), every?(30), delay?(30 at aim, 0 at self)` | every enemy inside, each pulse; an aimed area shows for `delay` ticks before its first pulse (`AREA_TELEGRAPH`) |
| `self` | none | the caster (effects use `target: "self"`) |
| `dash` | `distance, speed, invulnerable?(true), radius` | enemies it passes through, once |
| `summon` | `entity, ticks` | reserved (M2): turrets, walls |
| `terrain` | `radius, at: "self"|"aim", range?` | paints tiles (with `paint` effects) |

**Effect lists.**
- `onCast` runs once at release, with the caster as context.
- `onHit` runs once per target hit (target, point, caster).
- `onImpact` runs once where the shape ends or lands (a point only, for target-less effects like `paint`).

Every effect is `{op, ...params}`. Params are integers (ticks, px, permille). `target` is `"target"` or `"self"`.

**The library** (`src/sim/effects/ops/`, 39 ops). The v1 ops, then the ones the card text needed (docs/KITS.md
maps every attack-text pattern to them):

| op | params | |
|---|---|---|
| `damage` | `amount, wr?(true: or false, "weakness", "resistance"), pierce?(false)` | attack damage to the target (weakness / resistance / shields apply; `pierce` ignores shields and defense buffs) |
| `selfDamage` | `amount` | to the caster, no W/R, 70% of `amount` to 10, at least 10 (`rules.selfDamageOf`) |
| `heal` | `amount, target?("self"; "target", "team")` | removes damage, capped at max HP; `team`: the caster and its bench |
| `status` | `status: paralyzed|asleep|confused|burned|poisoned, target?("target")` | durations from section 6 |
| `knockback` | `px, ticks?(8)` | pushes the target away from the caster |
| `pull` | `px, ticks?(8)` | pulls the target toward the caster |
| `slow` | `permille, ticks` | move speed x (1000 - permille)/1000 |
| `shield` | `amount?(all), ticks, target?("self")` | prevents up to `amount` attack damage (Withdraw: all, 1 TURN) |
| `buff` | `stat: damage|speed|defense, amount, ticks, target?("self")` | flat damage bonus, speed permille, damage reduction |
| `invulnerable` | `ticks` | the caster ignores hits |
| `coin` | `heads?:[...], tails?:[...]` | one flip from the sim PRNG |
| `coins` | `count, perHeads:[...]` | "flip N coins, X per heads" |
| `chance` | `permille, then:[...], else?:[...]` | |
| `paint` | `terrain: water|fire|shock|none, radius, ticks?` | paints tiles around the point |
| `bonus` | `amount` | this cast does `amount` more damage (in onCast: Leaf Blade "90+", heads +60). W/R apply once, to the total |
| `benchDamage` | `amount, count?(0 = all), side?("foe"; "self"), radius?` | the target side's benched Pokémon, no W/R; it floors at 10 HP, never a KO off the field (`BENCH_CAN_KO` false). A 1v1 has no bench: it splashes foes within `radius` (110) of the point, the foe the attack hit directly at half (`SPLASH_DIRECT_PERMILLE`); own-bench damage lands on the caster at half |
| `discardEnergy` | `count, target?("self"; "target")` | pips from the caster (after paying) or the foe |
| `gainEnergy` | `count` | pips into the caster's meter (capped) |
| `bonusPerEnergy` | `amount, max` | extra damage per unspent pip (Hydro Pump) |
| `when` | `cond, then?, else?, kind?, n?` | conditions: selfDamaged, foeDamaged, selfHurt, allyKo, fresh, foeFresh, foeStatus, foeAsleep, foeIs {kind: V, VMAX, VSTAR, GX, EX, ex, Basic, Evolution, Rule}, hasEnergy, foeEnergy, stadium, foeBuffed, selfBuffed, usedVstar, prizesLeft, foePrizesLeft, samePips (both holding the same pips, not both empty), noPips, late {n TURNs} |
| `bonusPer` | `per, amount, max?` | `amount` per unit of: my/foe/bothEnergy, myAttached (the pips it cost plus the unspent ones; bothEnergy counts yours the same way), my/foeDamage (counters), my/foe/bothBench, my/foePrizes, myPrizesLeft, turns, foeStatus, hurt, foeRetreat, myTypes (no max: capped at 200) |
| `coinsUntilTails` | `perHeads, max?(10)` | flip until tails |
| `fizzle` | | the attack does nothing (in onCast: no shape) |
| `exhaust` | `ticks, target?("self"), which?("all"; "this", "best")` | attacks on cooldown: "can't attack next turn" |
| `retreatLock` | `ticks, target?("target")` | can't swap out or dodge |
| `counters` | `amount, target?` | damage counters: no W/R, no shields |
| `drain` | `permille` | heal a share of the damage just dealt |
| `spendEnergy` | `max, amount, paid?` | discard up to `max` pips, `amount` more damage each; `paid: 1` counts the pips the attack cost first |
| `energyJam` | `ticks, target?("target")` | the target's meter stops filling for `ticks` (hand / deck / item lock) |
| `gust` | `mode?("pull"; "push"), px?(140)` | forced switch in team mode (pull: their most damaged bench); a pull / shove in a 1v1 |
| `retreat` | `px?(160)` | the caster leaps back, briefly invulnerable, swap ready ("switch this Pokémon") |
| `dispel` | `target?` | strips shields and helpful buffs ("discard its Pokémon Tools") |
| `thorns` | `amount? or permille?, ticks` | attackers take counters back |
| `blind` | `ticks, permille?(500), target?` | Smokescreen: the target's attacks may miss |
| `execute` | `hp` | KO the target at or under `hp` |
| `bounty` | `prizes` | "take more Prize cards": a KO by this damage pays the caster 2 pips per extra prize (no prizes in the arena) |
| `hpCut` | `permille` | Super Fang: a share of the remaining HP |
| `cleanse` | `target?("self")` | clears special conditions |
| `mimic` | `wr?` | Metronome: the target's hardest-hitting printed attack |

**Adding a primitive is one file**: `src/sim/effects/ops/<op>.ts` exporting `defineOp({op, validate, apply})`,
plus `<op>.test.ts` next to it.
- `import.meta.glob` registers every file in `ops/`, sorted by op name, so the registration order is deterministic.
- `validateKit()` rejects unknown ops and bad params, both at load and in `npm test`.
- Effects touch state only through `EffectCtx` (the damage pipeline, status, rng, paint, energy), so they stay
  deterministic.

**Pilot kits (M1)** are the examples to copy: base1-58 Pikachu, base1-46 Charmander, base1-63 Squirtle, base1-44 Bulbasaur,
swsh7-7 Leafeon V.

## 8. Arena format (contract)

Each arena lives in `public/arenas/<id>/` (served at `/arenas/<id>/`). The list is `public/arenas/index.json`:
`{version:1, arenas:[id...]}`.

```jsonc
// arena.json
{
  "version": 1,
  "id": "evs-leafeon-forest", "name": "Leafeon's Forest",
  "sourceCard": "swsh7-7",                      // the real card whose scene it is painted from
  "size": { "w": 1920, "h": 1080 }, "tile": 40, // design px; grid = 48 x 27
  "grid": [ "################################################", "#..............~~~~...........o.......\"\"\"....#", "..." ],
  "spawns": [ { "team": 0, "x": 240, "y": 540 }, { "team": 1, "x": 1680, "y": 540 } ],
  "palette": { "floor": "#6a8f4e", "wall": "#2b3a22", "water": "#3f7fd6", "grass": "#3e7a33",
               "hazard": "#c85a2a", "prop": "#8a6a3a", "accent": "#e8f0c8" },
  "ambient": { "light": "day", "particles": "leaves", "music": null },
  "props": [ { "x": 12, "y": 5, "kind": "rock", "hp": 40, "frame": 0 } ]   // optional; x, y in tiles
}
```

- **`grid`**: exactly `h/tile` rows of `w/tile` chars. The outer ring should be `#`.

  | char | tile |
  |---|---|
  | `.` | floor |
  | `#` | wall: impassable, blocks projectiles and beams |
  | `_` | pit / void / a drop: no walking or dodging into it except for fliers (and `hover`), not shots or beams; nothing paints it |
  | `~` | deep water: blocks walking and dodging, not shots or beams; can be electrified |
  | `"` | tall grass: walkable, hides, burns |
  | `^` | lava / hazard: walkable, 10 damage per second to non-Fire fighters (not while flooded) |
  | `o` | breakable prop: blocks walking and shots until broken; 30 HP per cell; broken -> floor |
  | `=` | low obstacle (a rock, a bush, a stump, a ledge): blocks walking and dodging like a wall, not shots or beams; fliers and `hover` cross it; nothing paints it |

  Any other char loads as floor, with a warning.
- **`spawns`**: at least one per team (0, 1), in design px, on a walkable tile. Extra spawns are team entry points
  (the arenas ship 3 per team).
- **`ambient`**: `{tint, particles: leaves|snow|embers|bubbles|none}`, as the arenas use it.
- **`bg.png`**: 1920x1080, drawn under everything. Only surfaces and props are drawn over it, not the tiles.
- **`props.json` + `props.png`** (optional, as the arenas agent ships them):
  `{image: "props.png", size: {w, h}, frames: [{name, x, y, w, h, at: {x, y}, tiles: [[tx, ty], ...], hp?}]}`.
  Each frame is one breakable prop covering its `o` cells. It has one HP pool (30 per cell unless `hp`), and it
  breaks as a whole. The game draws the frame's atlas rect at `at` (px) until it breaks. `o` cells no frame covers
  are single-cell props drawn procedurally. (The inline `props` list above is an older alternative; props.json wins.)
- **Without art**, the renderer draws the grid procedurally with `palette`.
- **Validation.** The loader (`src/game/arena.ts` -> `validateArena`) reports every problem at once, and the arenas
  agent's test runs it over every arena.

## 9. Host API (contract)

`arena-host.exe [--port N] [--dist <dir>] [--state <dir>] [--pokeshell <ps1>] [--pokeshell-home <dir>] [--standalone] [--data <dir|pak>] [--app] [--no-idle-exit] [--idle-secs 60] [--open]`

- **Two modes.** *pokeshell* (the default in a dev or terminal setup): pokeshell holds the wallet and the collection
  and the host runs its JSON commands, as below. *standalone* (`--standalone` / `--data <release/bundle or .pak>`, and
  always in the downloadable build, `cargo build --features bundle`, docs/RELEASE.md): no pokeshell and no PowerShell;
  the host keeps its own wallet and pulls and opens real boosters itself (`host/src/standalone.rs`, `booster.rs`: a
  port of pokeshell's booster model, checked against `pokeshell pack odds --json` by `host/src/parity.rs`), from the
  game data embedded in the binary. Every route answers in the same JSON shapes either way; `/api/health` says which
  (`mode`). A new standalone state gets **3 starter packs**, once (below).
- `--app` (the downloadable build's default): the double-click launcher. If a host already serves this state
  (host.json's port answers `/api/health` for the same state) it opens the browser on it; else it starts the host in
  the background (`--serve`, detached, output in `<state>/host.log`), waits for it and opens the browser. One
  standalone host per state: it holds an exclusive lock on `<state>/host.lock` (a second one exits 3).
- The host binds `127.0.0.1` only: port 47615 by default (47616 for `--app`, then 51616, 53616, 55616, 57616, 59616), else a free port (`--port 0`: always a
  free port; Windows reserves blocks of ports, so the default may not bind). The port is in
  `<arena state>/host.json`; the launcher and `npm run dev`'s proxy read it from there.
- Requests with a `Host` other than `127.0.0.1:<port>` / `localhost:<port>` are refused (DNS rebinding).
- POSTs and PUTs need `Content-Type: application/json` and no foreign `Origin`.
- Errors are `{error: "<code>", message}`, with a 4xx/5xx status.
- On start it prints `arena-host listening http://127.0.0.1:<port>/` on stdout.

| route | |
|---|---|
| `GET /` and static files | `dist/` (the built game), including `/arenas/**` |
| `GET /pokeshell/img/**` | pokeshell's web export images, read-only (section 2); standalone: the bundled card faces (`cards/img/**`) |
| `GET /api/health` | `{ok, version, api: 1, state, mode: "pokeshell"|"standalone", bundled, pokeshell: {found, script?, home, version?}, starter?}`; standalone adds `starter: {packs: 3, granted, at}` |
| `GET /api/collection` | `pokeshell collection --json`, passed through. 501 if unsupported, 503 if pokeshell isn't installed |
| `GET /api/sets` | `pokeshell pack sets --json`, passed through, with the same errors (each set has `price`, `chance`, `oneIn`: its chance in a random pack) |
| `GET /api/pack/odds` | `pokeshell pack odds random --json`, passed through: `{set: "random", priceExponent, sets: [{set, name, price, openable, chance, oneIn}]}`. `?set=<id>`: that set's slots (`pokeshell pack odds <set> --json`: `{set, name, cards, outcomes: [{slot, count, outcome, rate, printed, served, base, probability, oneIn}]}`) |
| `GET /api/wallet` | `pokeshell pack tokens --json` -> `{tokens: <packs to open>, recent: [{time, delta, reason, id, set, pack}], progress: {points, perPack: 10}}`. `progress` is the arena's own count of the tokens toward the next pack (below). 501 / 503 as for the other pokeshell commands. Standalone: the arena's own wallet, plus `starter` |
| `POST /api/match/result` | `{matchId, mode: "1v1"|"team", difficulty: "easy"|"normal"|"hard"|"expert", won, forfeit?, prizes (the knockouts count: there are no prizes; the field name stays for the host), ticks, seed, arena?, team?, opponent?}` (`forfeit: true`: the player quit the match; always a loss, whatever `won` says, grants nothing, recorded with `forfeit: true`): records the match in matches.jsonl. **A win earns tokens toward the next pack** (1v1: 1, team: 2, +1 on hard, +2 on expert); **10 tokens make a pack**. The host keeps the count (`progress`): each time it reaches 10 it grants one pack token in the wallet (`pokeshell pack grant 1 --reason "arena win <matchId>" --json`, or the standalone wallet) and the rest carries over. Returns `{granted: <packs this result completed>, tokens: <packs to open>, points: <tokens earned>, progress: {points, perPack: 10}}`. A repeated `matchId` adds nothing (200, `{granted: 0, tokens, duplicate: true, points: 0, progress}`). If pokeshell is missing or can't grant, the match is still recorded (with `granted: 0` and the error), its tokens stay in the progress (the next win grants the pack) and the answer is 200 `{granted: 0, tokens: null, points, progress, error, message}`. The game never reports demo (bot vs bot) matches |
| `POST /api/pack/open` | `{random: true}` (or `{set: "random"}`): runs `pokeshell pack open random --json --export`, which rolls the set by its sealed pack's price and then the pack; this is what spending a token does in the game, and the JSON adds `setChance`, `setOneIn`, `setPrice` and `random: true`. `{set}`: `pokeshell pack open <set> --json --export`, a pack of that set (kept for tests and tools). Either way pokeshell spends one of its tokens and records the pulls (standalone: the arena's wallet and pulls.log, the same JSON). Returns pokeshell's JSON (`{set, setName, packId, cards, spent, tokens, imageRoot, ...}`) plus `imageBase: "/pokeshell/"` (card image URL = `imageBase + card.image`). pokeshell's `no-tokens` error -> 402 `{error: "no_tokens", message, tokens}`; `no-sets` (a random open with no openable, priced set) -> 409 `{error: "no_sets", message, tokens}`; other pokeshell errors 502; 501 / 503 as usual |
| `GET /api/teams`, `PUT /api/teams` | the loadouts file (section 10), validated |
| `POST /api/heartbeat` | keeps the host alive (it exits after 60 s without one, once one has been seen; 120 s for `--app`, since a browser throttles a background tab's timers to about one a minute). The page beats every 5 s and again when its tab is shown; when the host stops answering it says how to start it again |
| `POST /api/shutdown` | exits cleanly |

## 10. Arena state (contract)

The arena has its own state dir: `$env:POKEARENA_HOME`, else `%LOCALAPPDATA%\pokeshell-arena`. The arena never writes
pokeshell's state: `pokeshell pack open` records the pulls. The standalone arena's is separate:
`$env:POKEARENA_STANDALONE_HOME`, else `%LOCALAPPDATA%\pokeshell-arena-standalone` (Windows),
`~/Library/Application Support/pokeshell-arena` (macOS), `$XDG_DATA_HOME/pokeshell-arena` (else); never next to the exe.

| file | format |
|---|---|
| `matches.jsonl` | one JSON object per finished match: `{matchId, time, mode, difficulty, won, prizes, ticks, seed, arena, team:[card...], opponent:[card...], points, granted, forfeit?, grantError?, grantMessage?}` (`forfeit: true` only on a quit match; `points`: the tokens it earned, `granted`: the pack tokens it granted). It is what makes results idempotent (a matchId already here counts once) and it holds the progress toward the next pack: the sum of `points` minus 10 x `granted` (results from before the progress have no `points` and count nothing) |
| `teams.json` | `{version:1, selected:"<team id>", teams:[{id, name, mode:"1v1"|"team", members:[{card, shiny?}], energy?:[type,type,type]}]}`. `energy` is optional (legacy since the one meter; older files' three types are still validated). A team has 3-6 members, a 1v1 loadout one |
| `host.json` | `{port, pid, started, version, mode}` of the running host (the launcher reuses it) |
| `tokens.log` | standalone only: the pack-token wallet, pokeshell's format (append-only TSV `time  delta  reason  id=<ulid>  [set=  pack=  random=1  kind=starter]`, the balance is the sum). The starter grant is the line with `kind=starter`: 3 pack tokens, written once per state (the first start), so it survives restarts and is never granted twice |
| `pulls.log` | standalone only: one line per card pulled, pokeshell's booster line (`time  pack  character  tier  card  (skin)  shiny  booster:<set>  id=  card=  booster=  slot=  finish=`); `/api/collection` counts it into pokeshell's `collection --json` shape (`count`, `shinyCount`, `firstCaught`, `lastCaught`, `art.img`, `data`) |
| `host.lock`, `host.log`, `launcher.log` | standalone only: the one-host-per-state lock, the background host's output, the launcher's errors |
| `settings.json` | `{volume, keymap?}`: the game's options (M4; for now volume, mute and the loadout choices are per-browser localStorage) |

With pokeshell the arena has no wallet: pack tokens are pokeshell's (`pokeshell pack tokens|grant|open --json`,
pokeshell docs/BOOSTERS.md); the arena only counts the tokens toward the next one (matches.jsonl). In the game, a
"token" is that progress (10 make a pack) and a pokeshell pack token is "a pack to open". The standalone arena has its
own wallet (tokens.log) with the same rules.

## 11. Bots (contract)

```ts
interface Bot { reset(def: MatchDef, player: number, seed: number): void
                think(view: BotView): InputFrame }        // once per tick
type BotView = { tick: number, me: number, state: SimState /* read-only, possibly delayed */, def: MatchDef }
type Difficulty = { reactionTicks: number, aimErrorDeg: number, dodgePermille: number, aggression: number,
                    reactionJitter: number, wrongDodgePermille: number, timingErr: number }
// easy {30, 20, 100, 400, 6, 350, 8}, normal {20, 10, 300, 600, 4, 250, 6}, hard {15, 3, 600, 800, 3, 150, 4},
// expert {12, 2, 700, 850, 3, 100, 3}
```

- **Human reactions** (the user: "it feels impossible if he moves the same tick i move"): a new shot or windup
  reaches a bot `reactionTicks` + 0..`reactionJitter` ticks after it happens (seeded per event): Expert 12-15 ticks
  (200-250 ms), Hard 15-18, Normal 20-24, Easy 30-36. Projecting motion it has watched (the foe's walk, a shot's
  straight flight) over the delay is fine; answering an event early is not. Its dodges and parries carry a seeded
  timing error (+-`timingErr` ticks) and go the wrong way (`wrongDodgePermille`) now and then; the look-ahead rolls
  only when the bot itself chose to dodge a noticed threat, and imagines only the shots and windups it has noticed.
  A shot that lands inside the reaction window hits every level (`src/bots/reaction.test.ts`). Bots read only what
  the screen shows: a held attack isn't in the sim until its release, so the windup telegraph is the first sign.

- **Reaction time and aim error are enforced by the harness** (`BotDriver`), not by the bot: `think` sees the state
  from `reactionTicks` ago (a ring of cloned states), and the driver perturbs the frame's aim by up to
  `aimErrorDeg` (its own seeded PRNG, re-rolled every 20 ticks). A bot can't cheat either.
- **Reproducible.** Bots use only `BotView` and their own seeded PRNG, so a match against bots can be replayed from
  its seed.
- **The levels** (`createBot(level)`, `src/bots/smart.ts`; M1's `DumbBot` is kept for its tests):
  - **Easy** wanders (a seeded random walk toward you) and fires when it's roughly lined up. It rarely dodges.
  - **Normal** keeps its preferred range, strafes, dodges the projectiles it sees, fires its best attack in reach.
  - **Hard** adds energy planning (holds a cheap attack when it would delay the big one), weakness-aware targets,
    KO replacements and voluntary swaps (when the retreat is affordable), terrain combos (floods ground for a
    Lightning teammate, zaps you in water, burns you on grass, walks around hazards), leading shots, and dodging
    telegraphed windups (it walks off a shot's locked aim line).
  - **Expert** adds a short look-ahead: every 8 ticks near you it clones its (delayed) view and plays each
    candidate (its plan, holding, 4 moves, 2 dodges, each attack) 30 ticks forward against a Hard model of you, with
    coin flips reseeded from its own PRNG (it never peeks at the sim's), and keeps the best.
  - All levels evolve when they can (Hard and Expert pick the best matchup) and play team mode.
  - `src/bots/ladder.test.ts` proves the order headlessly: each level beats the one below more often than not over
    real arenas, 1v1 and team (with evolutions), both seatings.
- **Bot teams: two bot-match modes** (the user: "random decks (of your cards) and bot gets all cards, or you choose
  and bot chooses (rolls good cards for bot)"), for 1v1 and team alike, in `src/game/botteams.ts`. Both draw from
  `data/bots/roster.json`: the real cards' numbers, built from pokeshell's carddata by `tools/build_bot_roster.py`,
  no rules text.
  - **Random decks**: your team is rolled at random from **your caught cards** (distinct cards, the size you set,
    3-6 or 1; the evolutions you own for it come along). The bot's team is rolled uniformly from **every card**.
  - **You choose**: you pick your team in the loadout. The bot **rolls good cards**: each card's strength is its HP
    plus twice its biggest printed damage, and a card's weight is a bell curve around the difficulty's target
    percentile of that scale (easy 25th, normal 50th, hard 75th, expert 95th), times a bonus for rule-box cards (V,
    VMAX, VSTAR, GX, ex: x1 easy .. x12 expert). Easy rolls modest cards; Expert rolls mostly premium V / VMAX / ex.
  - Teams are distinct cards (by name for the bot), types spread out while the pool allows, the same size on both
    sides, and every roll is seeded (the match seed): the same seed rolls the same teams. Bots also get the roster's
    next-stage cards of their team to evolve into.
  - **The reveal**: before every bot match both teams are shown (their cards, HP, attacks, evolutions), with one free
    reroll (Random: both teams; You choose: the bot's), then Fight!. The result's "New bots" rolls again.
  - Tests (`botteams.test.ts`): Random only ever gives you owned cards, rolls are deterministic per seed, the bot's
    random team comes from all cards, and each level rolls stronger cards than the one below (expert mostly
    rule-box).

## 12. Sprites

Battle sprites are the pokemon-colorscripts `large` sprites (about 42x42 px, Gen 1-8, regular + shiny).
- **Drawing.** They stay pixel-exact and are drawn at a whole-number scale (3x, 2x for big sprites) with smoothing off. Facing is a horizontal flip toward the
  aim (the only change allowed, as in pokeshell's art rules).
- **Building.** `tools/build_sprites.py --vendor <pokemon-colorscripts>` decodes the half-block ANSI into
  `public/sprites/<character>[-shiny].png` plus `index.json`.
- **Shipping.** These are Nintendo artwork, so they are **gitignored and ship in the arena's own art release**,
  with the arena backgrounds (not pokeshell's art.json).
- **Fallbacks**: a pokeshell common card's web-export PNG (the plain sprite), else a type-coloured disc with the initial.
- **Shiny**: a caught shiny card fights with the shiny sprite.

## 13. Milestones

- **M1** (this branch, done):
  - scaffold, the deterministic sim with tests, the Canvas2D renderer, input, the 10 real arenas, DumbBot
    (BFS pathing, line of sight);
  - the effect registry with the core ops and five pilot kits;
  - 1v1 against a bot;
  - the host with the full API (packs answer 501 until pokeshell has the commands) and the `pokearena` launcher.
- **M2**:
  - kits for the collection (kits agent); all statuses and reactions, summon (kits agent);
  - done here: team mode (3-6, bench swaps, the team bar, the forced swap on KO, prizes), the 1v1 quick match, the
    loadout screen (your caught cards, card faces, saved teams in teams.json), the one energy meter, evolving
    mid-match, bots easy/normal/hard/expert with the headless ladder, bot teams from real cards by difficulty, game
    feel (sprites at 3x, hit flash and squash, shake, hit-stop, trails and type particles, aim telegraphs, dodge
    afterimages, organic terrain, damage numbers and status icons, KO and prize pop, the intro and the result with
    the pack-token moment), Web Audio sfx, gamepad, pause; pokeshell's wallet; the result screen -> a random pack (the rolled set revealed, then the tear) ->
    pack opening (src/packs).
- **M3**: rewards and packs end to end (the pack opening scene in `src/packs/`), the set picker, battle history.
- **M4**:
  - polish: sound, particles, a WebGL renderer if needed, settings;
  - the Tauri standalone and the arena art release;
  - then netcode (rollback over the same `step`).

## 14. Assets that need an art release (not git)

- `public/sprites/*.png` (colorscripts sprites).
- `public/arenas/*/bg.png` and `props.png` (painted from real card scenes).

Git holds only the `arena.json` files and tiny placeholders.
