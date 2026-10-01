// Every tuning constant in one place (docs/SPEC.md sections 3, 5, 6). Ticks are 1/60 s.

export const TICK_HZ = 60
/** one TCG "turn" of real time: the unit card text is translated with */
export const TURN = 90

/** one energy meter (docs/SPEC.md section 5): an attack costs its card's energy count, any type */
export const ENERGY_METERS = 1
/** the meter holds at most this many pips (10: the user's call, "I want 10 max energy again"; the type-flavour pass had
 * cut it to 5. Hard bots hold ~2.8 pips when they cast either way, docs/KITS.md "After the melee merge") */
export const ENERGY_CAP = 10
/** ticks per pip (3 s). With no cooldown on paid attacks (the timing model) the meter is the only pacing, so a pip
 * is slower than one a TURN: a basic 1v1 lasts about 20 s (tournament medians with melee in: 160 ticks 17.4 s, 180
 * 19.2 s) */
export const ENERGY_FILL = 180
/** pips at the start (was 3: a 3-pip opener before anyone moved) */
export const ENERGY_START = 1

export const COUNTDOWN_TICKS = 180
export const MATCH_TICKS = 3 * 60 * TICK_HZ
export const RESULT_TICKS = 120

export const DODGE_TICKS = 12
/** px per tick while rolling */
export const DODGE_SPEED = 14
export const DODGE_IFRAMES = 10
export const DODGE_COOLDOWN = 48

export const SWAP_COOLDOWN = 60
export const KO_REPLACE_TICKS = 180
export const SPAWN_INVULN = 60
/** full elimination you actually fight (the user: "i want full team elimination", "im still not having to kill all
 * the enemies"): bench damage can't Knock Out a Pokémon off the field. It still lands (chip), but floors at
 * BENCH_FLOOR_HP (the TCG's "damage counters, still alive"), so every enemy has to be beaten in the arena. true
 * restores the old rule (a bench KO counts as a knockout) */
export const BENCH_CAN_KO: boolean = false
export const BENCH_FLOOR_HP = 10

// evolving mid-match (docs/SPEC.md section 6): the charge fills from attack damage dealt and KOs
export const EVO_MAX = 60
/** charge per KO you take */
export const EVO_KO = 30
export const EVOLVE_INVULN = 60
/** the evolve charge gains 1 point every this many fight ticks on its own (on top of damage dealt and KOs): start
 * lines make evolved cards something to earn, and this keeps them reachable in a short 1v1 */
export const EVO_PASSIVE_TICKS = 15
/** evolve options F can pick from (EVOLVE carries the choice in 3 bits) */
export const EVO_OPTIONS_MAX = 7

export const DEFAULT_WINDUP = 6
/** timing model (the user's call: "energy is the limiter, like the TCG"): an attack that costs energy has NO
 * cooldown, only a recovery after it (no attack while recovering; moving and dodging still work), so banked pips come
 * out as distinct, dodgeable shots. Recovery = RECOVERY_BASE + damage / RECOVERY_PER_TICK_DAMAGE, at most
 * RECOVERY_MAX (a 30 jab ~0.37 s, a 240 nuke ~0.75 s), times the type's flavour (Lightning quicker, Metal and
 * Fighting heavier). A kit may give a longer one */
export const RECOVERY_BASE = 18
export const RECOVERY_PER_TICK_DAMAGE = 9
export const RECOVERY_MAX = 48
/** a 0-cost attack is the one thing energy doesn't gate: it keeps a real cooldown */
export const ZERO_COST_COOLDOWN = 150
/** ...plus this many ticks per point of damage above ZERO_COST_FREE_DAMAGE (a free 60 every 2.5 s out-damaged most
 * paid attacks: Hisuian Zoroark's Doom Curse won every fight) */
export const ZERO_COST_PER_DAMAGE = 3
export const ZERO_COST_FREE_DAMAGE = 20
/** @deprecated the old per-attack default, kept for kits that name it: recovery is the pacing now */
export const DEFAULT_RECOVERY = RECOVERY_BASE
/** movement multiplier while winding up an attack, permille */
export const WINDUP_MOVE = 450

// the balance pass (docs/KITS.md "Balance"): level the field a bit, keep the printed numbers ordering the cards
/** HP in the arena: printed HP -> effective HP, a soft curve toward the middle (small cards a bit tougher, huge
 * ones a bit less huge; the order never changes). Piecewise linear through these [printed, effective] knots */
export const HP_CURVE: readonly (readonly [number, number])[] = [[0, 0], [40, 50], [70, 80], [120, 120], [200, 180], [340, 260], [1000, 680]]
/** attack damage: printed (+ bonuses) -> effective, before weakness / resistance: small hits unchanged, big ones
 * compressed (a 300 is still the biggest hit, not a one-shot of everything) */
export const DAMAGE_CURVE: readonly (readonly [number, number])[] = [[0, 0], [10, 16], [20, 26], [30, 34], [40, 40], [80, 72], [120, 100], [200, 150], [320, 216], [1000, 580]]
/** a piecewise-linear integer curve through [x, y] knots (x ascending; extrapolates past the last) */
export function curve(knots: readonly (readonly [number, number])[], x: number): number {
  if (x <= knots[0][0]) return knots[0][1]
  for (let i = 1; i < knots.length; i++) {
    const [x1, y1] = knots[i], [x0, y0] = knots[i - 1]
    if (x <= x1) return y0 + Math.trunc(((x - x0) * (y1 - y0)) / (x1 - x0))
  }
  const [xa, ya] = knots[knots.length - 2], [xb, yb] = knots[knots.length - 1]
  return yb + Math.trunc(((x - xb) * (yb - ya)) / (xb - xa))
}
/** an aimed area shows this long before it lands (you can step out) */
export const AREA_TELEGRAPH = 24
/** minimum windup: DEFAULT_WINDUP + damage / this (a 240 winds up 18 ticks) + the heavy bonus */
export const WINDUP_PER_TICK_DAMAGE = 20
/** heavy cards wind up longer: +1 tick per this much printed HP above HEAVY_HP */
export const HEAVY_HP = 150
export const HEAVY_HP_PER_TICK = 30
/** big shots fly slower: speed - damage / this, at least BIG_SHOT_MIN_SPEED px/tick */
export const BIG_SHOT_SLOWDOWN = 40
export const BIG_SHOT_MIN_SPEED = 8

// status conditions (section 6)
export const PARALYZE_TICKS = TURN
export const SLEEP_MAX_TICKS = 4 * TURN
export const CONFUSE_TICKS = 3 * TURN
export const CONFUSE_SELF_DAMAGE = 30
export const BURN_DAMAGE = 20
export const POISON_DAMAGE = 10
export const POISON_TICKS = 4 * TURN

// terrain (section 3)
export const WET_TICKS = 480
export const SHOCK_TICKS = 120
export const SHOCK_RANGE_TILES = 6
export const SHOCK_DAMAGE = 10
export const SHOCK_EVERY = 30
export const SHOCK_PARALYZE_PERMILLE = 300
export const FIRE_TICKS = 180
export const FIRE_SPREAD_EVERY = 30
export const HAZARD_DAMAGE = 10
export const HAZARD_EVERY = 60
export const WATER_SLOW = 700
export const WATER_FAST = 1200
export const PROP_HP = 30

/** move speed in px/s from the retreat cost (heavier = slower) */
export function moveSpeedPx(retreat: number): number {
  return Math.max(180, 300 - 25 * retreat)
}

/** the most a fighter's collision body (movement.bodyRadiusPx) may be, px: a 32 px body fits a 1-tile (40 px)
 * corridor with 8 px to spare. tools/arenas/validate.py BODY_R checks corridors with this same number */
export const BODY_MAX_PX = 16

/** fighter radius (the hitbox) in px from the retreat cost */
export function radiusPx(retreat: number): number {
  return 20 + 2 * Math.min(retreat, 5)
}

// effect translations: how card text maps to real time and space (docs/KITS.md "Translations")
/** "your opponent's last turn" / "this turn": a window of 2 TURNs looking back */
export const RECENT_TICKS = 2 * TURN
/** a 1v1 has no Bench: counting effects see this many virtual benched Pokémon per side */
export const VIRTUAL_BENCH = 2
/** a 1v1 has no Bench: bench damage splashes foes within this many px of the hit / impact point */
export const SPLASH_RADIUS = 110
/** recoil ("this Pokémon also does N damage to itself") in the arena, permille of the printed amount (to 10, at least
 * 10): the hit it pays for is compressed by the damage curve, so the full recoil made recoil attacks lose (35%) */
export const SELF_DAMAGE_PERMILLE = 700
/** the recoil the caster really takes: the printed amount scaled, to 10, at least 10 (the op and explain use it) */
export function selfDamageOf(amount: number): number {
  return Math.max(10, Math.round((amount * SELF_DAMAGE_PERMILLE) / 10000) * 10)
}
/** ...and the foe the attack hit directly takes this share of the splash, permille (rounded down to 10) */
export const SPLASH_DIRECT_PERMILLE = 500
/** a 1v1 is scored as a 6-prize game played on one Pokémon's HP (prize-counting effects) */
export const TCG_PRIZES = 6
/** the most a single counting effect (`bonusPer`) may add when a kit gives no `max` */
export const BONUS_CAP = 200

// type flavours (flavors.ts, docs/KITS.md "Type flavours")
/** Psychic shots home gently: at most this many binary degrees of turn per tick (256 = a full turn) */
export const PSY_HOMING = 1
/** ...and do this much less damage, permille */
export const PSY_DAMAGE_CUT = 100
/** ...and never fly slower than this, px per tick (a very slow homing shot had all the time in the world to curve in:
 * the slow Psychic shots won 90-100% of their tier) */
export const PSY_MIN_SPEED = 10
/** Lightning arcs into a foe standing in water (or electrified water): extra damage counters, permille of the hit */
export const CHAIN_WATER_PERMILLE = 300
/** Fighting armour: attack damage taken while winding up a Fighting attack, permille (and no knockback) */
export const ARMOR_PERMILLE = 750
/** Darkness ambush: attack damage into a foe mid-cast or from behind, permille */
export const AMBUSH_PERMILLE = 1300
/** Fire trails (and the scorch where other Fire shapes land) burn this long, ticks. Standing in fire burns (20 a
 * TURN): at 90 the flavour's ground fire, not its hits, made Fire the strongest type (a 13 s median KO, others 17-19) */
export const TRAIL_TICKS = 45
/** a Pokémon with no damaging attack fills its evolve charge by 1 every this many ticks (it can't earn it by damage) */
export const EVO_IDLE_EVERY = 30
/** a lob can come down on a foe once it has arced this far, px (before that it sails over)
 */
export const LOB_RISE = 140

// the balance-tune pass (docs/KITS.md "Levelling the shapes"): how reliably a shape lands decides its value as much
// as its damage does. A ring around you needs no aim; a dash sweeps a wide line and moves you; a close swing has to
// be aimed at a foe that keeps moving through the windup. These knobs even the shape classes out (a bonus op on hit,
// like the type power), and a swing is never narrower than MELEE_MIN_ARC
/** damage of an area around the caster (a ring: no aim needed), permille */
export const RING_POWER = 750
/** a ring (an area around the caster, or a swing all the way round) winds up at least this long: the tell that
 * lets a foe step out of it */
export const RING_MIN_WINDUP = 14
/** damage of a dash (you are the hitbox, sweeping a wide line), permille */
export const DASH_POWER = 850
/** damage of a close swing (it has to be aimed at a foe that keeps moving through the windup), permille */
export const MELEE_POWER = 1000
/** weakness: each step of a printed "×N" adds this much, permille (600: "×2" is ×1.6). The TCG's doubling made the
 * type chart the biggest single edge in a 1v1 (Fire won 58-62% of its tier on hitting the large Grass and Metal pools
 * x2); a weakness still hurts, it just doesn't decide the fight on its own */
export const WEAKNESS_PER_TIMES = 600
/** the narrowest melee swing, binary degrees (256 = a full turn; 32 is 45°, src/sim/melee.ts's own floor: its landing
 * padding widens every swing, so the balance pass's 52 would double up) */
export const MELEE_MIN_ARC = 32
