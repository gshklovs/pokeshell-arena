// Types shared by the sim, the game, the bots and the kits (docs/SPEC.md sections 4, 7, 8, 11).

/** how a fighter moves (src/sim/movement.ts reads the terrain ones; docs/KITS.md "Type flavours"). The type flavour
 * sets some (flavors.ts moveFor), a kit may override, newFighter adds the species' `fly` and copies them onto the
 * Fighter */
export interface MoveTraits {
  /** deep water `~` is walkable (the body may overlap it). No type sets it (a kit may) */
  crossWater?: boolean
  /** hovers (Psychic, Fairy): deep water and pits `_` walkable, no shallow-water slowdown, unhurt by lava and
   * electrified water */
  hover?: boolean
  /** flies (the species: data/flying.json, added by newFighter): deep water and pits `_` passable, no
   * shallow-water slowdown, drawn lifted over them. Walls and props still block. Never a type */
  fly?: boolean
  /** speed multipliers (permille) on that terrain under the fighter's center: Water wades fast, Grass runs through
   * tall grass */
  speedIn?: { water?: number; grass?: number }
  /** knockback and pulls do not move it (Metal; read by combat, not by movement) */
  noKnockback?: boolean
  /** the dodge style: roll (the default), blink (a teleport-dash), flame (the roll leaves fire), burst (a faster roll,
   * a shorter cooldown), shoulder (the roll shoves foes aside), float (a long, slow drift) */
  dodge?: 'roll' | 'blink' | 'flame' | 'burst' | 'shoulder' | 'float'
}

// ------------------------------------------------------------------ input (section 4)
export type Dir = -1 | 0 | 1
/** `aimHeld`: the attack (1..3) the player is holding to aim, 0 or absent when none. Render/input only: the sim
 * ignores it (an attack fires on its button's press edge, which the input layer sends at release) */
export interface InputFrame { mx: Dir; my: Dir; aim: number; buttons: number; aimHeld?: number }
export const BTN = {
  ATTACK1: 1, ATTACK2: 2, ATTACK3: 4, DODGE: 8, SWAP_PREV: 16, SWAP_NEXT: 32, EVOLVE: 64,
} as const
/** SWAP_TO slot n (1..6) lives in bits 8..10 */
export function swapTo(slot: number): number { return (slot & 7) << 8 }
export function swapSlot(buttons: number): number { return (buttons >> 8) & 7 }
/** EVOLVE into option n (1..7) of evolveOptions(): EVOLVE plus the choice in bits 11..13 (no choice = option 1) */
export function evolveTo(n: number): number { return BTN.EVOLVE | ((n & 7) << 11) }
export function evolveChoice(buttons: number): number { return (buttons >> 11) & 7 }
export const NO_INPUT: InputFrame = { mx: 0, my: 0, aim: 0, buttons: 0 }

// ------------------------------------------------------------------ cards and kits (section 7)
export type EnergyType =
  | 'Grass' | 'Fire' | 'Water' | 'Lightning' | 'Psychic' | 'Fighting' | 'Darkness' | 'Metal' | 'Fairy' | 'Dragon'
  | 'Colorless'
export const ENERGY_TYPES: EnergyType[] = [
  'Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Fairy', 'Dragon', 'Colorless',
]

/** the gameplay fields of a card, as pokeshell's `collection --json` gives them (`data`) */
export interface CardData {
  id: string
  name: string
  character?: string
  hp: string | number
  types?: string[]
  subtypes?: string[]
  /** the name of the card it evolves from (a Stage 1 / Stage 2 / VMAX), else null */
  evolvesFrom?: string | null
  attacks?: { name: string; cost?: string[]; damage?: string; text?: string }[]
  weaknesses?: { type: string; value: string }[]
  resistances?: { type: string; value: string }[]
  retreatCost?: string[]
  rules?: string[]
}

export interface Effect { op: string; [param: string]: unknown }

export type ShapeKind = 'projectile' | 'beam' | 'cone' | 'melee' | 'area' | 'self' | 'dash' | 'summon' | 'terrain'
export interface Shape { kind: ShapeKind; [param: string]: unknown }

export interface KitAttack {
  name: string
  cost?: string[]
  damage?: string
  element?: string
  shape: Shape
  windup?: number
  recovery?: number
  cooldown?: number
  oncePerMatch?: 'gx' | 'vstar' | null
  onCast?: Effect[]
  onHit?: Effect[]
  onImpact?: Effect[]
  /** false: this attack opts out of its type flavour (flavors.ts) */
  flavor?: boolean
  /** how it is drawn (docs/VFX.md): a move-lexicon archetype id. Absent: the archetype its name reads as, when that
   * archetype makes the same kind of shape (kit.resolveKit). Render-only: the sim never reads it */
  look?: string
  /** the kit's own shape on purpose (the reason, as text): the move lexicon's trajectory and signature shape don't
   * replace it (kit.resolveKit adopts them otherwise; docs/MOVES.md "Signature moves"). The look still applies */
  pin?: string
}

export interface KitStats {
  hp?: number
  types?: string[]
  subtypes?: string[]
  evolvesFrom?: string | null
  weaknesses?: { type: string; value: string }[]
  resistances?: { type: string; value: string }[]
  retreat?: number
}

/** a kit file, data/kits/<card id>.json */
export interface Kit {
  version: 1
  card: string
  character?: string
  name?: string
  stats?: KitStats
  attacks: KitAttack[]
  passive?: unknown
  notes?: string
  /** hand kits (docs/KITS.md): how fighting as this Pokémon should feel, in a sentence */
  fantasy?: string
  /** every number the kit overrides, with the reason: keys "hp", "retreat", "types", "<attack>.cost", "<attack>.damage" */
  overrides?: Record<string, string>
  /** false: the whole kit opts out of the type flavours (flavors.ts) */
  flavor?: boolean
  /** movement flags over the type default (flavors.ts MoveTraits) */
  move?: MoveTraits
}

/** a kit merged with its card data: every number resolved (resolveKit) */
export interface ResolvedAttack extends Required<Omit<KitAttack, 'oncePerMatch' | 'flavor' | 'look' | 'pin'>> {
  /** the archetype it is drawn as (docs/VFX.md); absent: the plain look of its shape kind. Render-only */
  look?: string
  /** type-flavour flags the sim reads (flavors.ts): homing, trail, armor, ambush */
  traits?: string[]
  /** the balance knobs' damage multiplier, permille (the type's power times the shape's: flavors.ts, kit.levelShape);
   * applied to the whole hit (printed damage, bonuses and scaling) before the damage curve. Absent = 1000 */
  power?: number
  cost: EnergyType[]
  damage: string
  /** the printed base damage as a number; when the card prints none, the damage its effects do in a typical hit
   * (kit.estimateDamage), so bots and props weigh text-driven attacks */
  baseDamage: number
  element: EnergyType
  oncePerMatch: 'gx' | 'vstar' | null
}
export interface FighterKit {
  card: string
  character: string
  name: string
  /** the arena HP: the printed HP soft-compressed toward the middle (kit.effectiveHp, rules.HP_CURVE) */
  hp: number
  /** the card's printed HP (for display) */
  printedHp?: number
  types: EnergyType[]
  subtypes: string[]
  /** the card name it evolves from, or null for a Basic */
  evolvesFrom: string | null
  weaknesses: { type: string; value: string }[]
  resistances: { type: string; value: string }[]
  retreat: number
  /** movement traits: the type flavour (flavors.ts moveFor) and the kit's own; absent = none. newFighter adds the species' fly and copies them onto the Fighter */
  move?: MoveTraits
  attacks: ResolvedAttack[]
  /** 'kit' when a kit file shaped it, 'auto' for autoKit */
  source: 'kit' | 'auto'
}

// ------------------------------------------------------------------ arena (section 8)
/** PIT: a hole / the void / a drop (`_`): no walking (fliers pass), shots fly over, nothing paints it */
/** LOW (`=`): a low obstacle (a rock, a bush, a stump, a ledge): blocks walking like a wall, shots fly over it */
export const TILE = { FLOOR: 0, WALL: 1, WATER: 2, GRASS: 3, HAZARD: 4, PROP: 5, PIT: 6, LOW: 7 } as const
export interface ArenaFile {
  version?: number
  id: string
  name: string
  sourceCard?: string
  size: { w: number; h: number }
  tile: number
  grid: string[]
  spawns: { team: number; x: number; y: number }[]
  palette?: Record<string, string>
  ambient?: Record<string, unknown>
  props?: { x: number; y: number; kind?: string; hp?: number; frame?: number }[]
  /** props.json (loaded next to arena.json by the game): multi-tile breakable props with atlas frames */
  propFrames?: PropFrame[]
}
export interface PropFrame {
  name?: string
  /** rect in props.png */
  x: number; y: number; w: number; h: number
  /** top-left in design px where the frame is drawn */
  at: { x: number; y: number }
  /** the `o` cells it covers, as [tx, ty] */
  tiles: [number, number][]
  hp?: number
}
export interface ArenaDef {
  id: string
  name: string
  cols: number
  rows: number
  /** tile size in design px */
  tile: number
  /** base tile codes, row-major */
  tiles: number[]
  /** prop HP per tile (0 = none); a multi-tile prop's pool is on its root tile */
  propHp: number[]
  /** per tile: the root tile index of its prop (itself for a single-tile prop, -1 for none) */
  propGroup: number[]
  spawns: { team: number; x: number; y: number }[]
  file: ArenaFile
}

// ------------------------------------------------------------------ match
export interface PlayerDef {
  team: number
  name: string
  /** indexes into MatchDef.kits */
  members: number[]
  shiny?: boolean[]
  /** legacy (the three typed meters of v1): matches run one untyped meter, and ignore it */
  energy: EnergyType[]
  /** kit indexes of the owned cards its Pokémon can evolve into mid-match (not team members) */
  evolutions?: number[]
  /** shiny flags for `evolutions`, by position */
  evolutionShiny?: boolean[]
  /** per member (by position in `members`): the kit indexes of the line it was picked for, after the card it enters
   * as, the picked card last (docs/SPEC.md section 6, "start lines"). Its next step is evolve option 1 */
  paths?: number[][]
  /** shiny flags for `paths`, the same shape */
  pathShiny?: boolean[][]
  /** loaner flags for `paths` (and `loanerMembers` for the entering cards): cards the player doesn't own */
  pathLoaner?: boolean[][]
  loanerMembers?: boolean[]
}
/** is kit `k` shiny for this player (one of its evolution or line cards) */
export function evoShiny(pd: PlayerDef | undefined, k: number): boolean {
  if (!pd) return false
  const pos = (pd.evolutions ?? []).indexOf(k)
  if (pos >= 0) return !!pd.evolutionShiny?.[pos]
  for (let i = 0; i < (pd.paths ?? []).length; i++) { const j = pd.paths![i].indexOf(k); if (j >= 0) return !!pd.pathShiny?.[i]?.[j] }
  return false
}
/** is kit `k` a loaner line card for this player (docs/SPEC.md section 6: a lower stage it doesn't own) */
export function evoLoaner(pd: PlayerDef | undefined, k: number): boolean {
  if (!pd) return false
  for (let i = 0; i < (pd.paths ?? []).length; i++) { const j = pd.paths![i].indexOf(k); if (j >= 0) return !!pd.pathLoaner?.[i]?.[j] }
  return false
}
export interface MatchDef {
  mode: '1v1' | 'team'
  seed: number
  arena: ArenaDef
  kits: FighterKit[]
  players: PlayerDef[]
  matchTicks?: number
  /** kit indexes nothing evolves out of, from every card there is (the HUD says "top stage"); optional */
  topKits?: number[]
  /** no balance curves: attack damage is the printed number (rules.DAMAGE_CURVE is skipped). Unit tests of
   * mechanics set it (with kits at their printed HP); real matches never do */
  raw?: boolean
}

// ------------------------------------------------------------------ state (plain data only: clone/hash-safe)
export interface Status {
  paralyzed: number
  asleep: number
  confused: number
  burned: number
  poisoned: number
  /** ticks until the next between-turns tick (burn / poison / sleep roll) */
  turnTimer: number
}

export interface CastState { attack: number; t: number }
export interface DodgeState { t: number; dx: number; dy: number }
/** air: 1 while leaping (path 'leap'): it passes over fighters instead of pushing them */
export interface DashState { attack: number; t: number; vx: number; vy: number; hit: number[]; air?: number; bonus?: number; turn?: number; t0?: number }

export interface Fighter {
  x: number
  y: number
  r: number
  aim: number
  facing: Dir
  moving: number
  cast: CastState | null
  recovery: number
  cooldowns: number[]
  dodge: DodgeState | null
  dash: DashState | null
  dodgeCd: number
  invuln: number
  /** `src`: a strong melee knock (melee.ts): the player that sent it; running into a wall splats */
  knock: { vx: number; vy: number; t: number; src?: number } | null
  slow: { permille: number; t: number } | null
  shield: { amount: number; t: number } | null
  buffs: { stat: string; amount: number; t: number }[]
  status: Status
  /** ticks until the next terrain damage tick while standing in shock / hazard */
  terrainTimer: number
  inShock: boolean
  /** the tick this Pokémon came onto the field ("moved from the Bench this turn") */
  enteredAt: number
  /** the tick it last took attack damage (-1 = never) and how much ("if damaged last turn", Rage) */
  hurtAt: number
  hurtAmt: number
  /** the kit's movement traits (absent = none; see MoveTraits) */
  move?: MoveTraits
  /** melee (melee.ts, docs/MELEE.md): ticks left flinched (no walking, no attack start, no dodge), the flinch
   * immunity after one ends, the ticks flinched in a row, a counter's parry window, the armour of a live swing */
  flinch?: number
  flinchGuard?: number
  flinchRun?: number
  parry?: number
  armor?: number
}

export interface Member { kit: number; hp: number; maxHp: number; ko: boolean }

export interface PlayerState {
  team: number
  prevButtons: number
  /** index into members, or -1 while a KO'd Pokémon's replacement is pending */
  active: number
  members: Member[]
  fighter: Fighter
  pips: number[]
  fill: number[]
  /** Pokémon this side has knocked out (a stat for the result screen; matches are won by full elimination) */
  kos: number
  swapCd: number
  replaceT: number
  usedOnce: string[]
  /** the evolve charge, 0..EVO_MAX */
  evo: number
  /** evolution kits already used this match (one card evolves one Pokémon) */
  evoUsed: number[]
  /** the tick one of this player's Pokémon was last Knocked Out (-1 = never): "if any of your Pokémon were KO'd last turn" */
  koAt: number
}

export interface Projectile {
  id: number
  owner: number
  attack: number
  x: number
  y: number
  vx: number
  vy: number
  r: number
  left: number
  pierce: number
  homing: number
  /** ticks since launch, the launch angle, and a per-path counter (boomerang: 1 once it turned back; bounce: bounces
   * left) for the trajectory paths (shape.path, docs/KITS.md "Trajectories") */
  age: number
  base: number
  back: number
  /** a multi-shot's volley: the first shot's id (0 for a single shot). A volley hits each target once */
  grp?: number
  bonus: number
  hit: number[]
  /** a shard a shot split into (shape.split): it flies straight and never splits, bursts or sticks again */
  kid?: number
  /** this shot's damage scale, permille (a shard's share of the hit); absent = 1000 */
  pw?: number
  /** a braid's phase (path "helix"), binary degrees: each shot of the volley weaves around the aim line offset */
  ph?: number
}
export interface Beam { id: number; owner: number; attack: number; x1: number; y1: number; x2: number; y2: number; w: number; t: number }
/** an area; `vx, vy` (sub-px per tick) move a drifting hazard (shape.path "drift"); `land` counts down to the tick it
 * lands (its first hit) and on below zero: ticks since (the renderer's bolt from the sky, a rock's fall) */
export interface Area {
  id: number; owner: number; attack: number; x: number; y: number; r: number; t: number; every: number; next: number; bonus: number; vx: number; vy: number; land: number
  /** a fused shot stuck to a fighter (shape.stick): the player whose fighter it rides on until it bursts */
  on?: number
  /** a shot's burst (shape.fuse): it hits only foes in sight of its centre (terrain.inSight), not through a wall */
  sight?: 1
}
/** a swing: a melee attack's live hitbox (melee.ts, docs/MELEE.md 3.2), or a cone's short-lived visual. `t`: ticks
 * left to draw it; `age`: ticks since release; `live`: live ticks left in the current strike (-1: done, only drawn);
 * `strike` of `strikes`, the next `every` ticks later (`next` counts down); `wait`: a counter's parry window left;
 * the step-in `lx, ly` sub-px a tick for `ln` more ticks; `hit`: struck this strike; `landed`: strikes that
 * connected; `held` (-1 none) for `hold` more ticks; `sx, sy`: where the attacker stood at release */
export interface Swing {
  id: number; owner: number; attack: number; x: number; y: number; aim: number; range: number; arc: number; t: number
  dur: number; age: number; live: number; active: number; strike: number; strikes: number; every: number; next: number
  wait: number; lx: number; ly: number; ln: number; hit: number[]; landed: number; held: number; hold: number
  bonus: number; sx: number; sy: number
}

export type SimEvent =
  /** `el` is the attack's element ('' for direct damage: status, terrain, self, bench); `src` the attacker (-1 none) */
  | { k: 'dmg'; p: number; amount: number; x: number; y: number; eff: number; el?: string; src?: number }
  | { k: 'heal'; p: number; amount: number }
  | { k: 'status'; p: number; status: string }
  | { k: 'coin'; p: number; heads: boolean }
  | { k: 'cast'; p: number; attack: number }
  | { k: 'fizzle'; p: number; why: string }
  /** where it went down: 'active' (on the field) or 'bench' (bench damage, only with rules.BENCH_CAN_KO) */
  | { k: 'ko'; p: number; member: number; where: 'active' | 'bench' }
  /** bench damage to benched member `member` (amount = HP it lost: floored at rules.BENCH_FLOOR_HP unless BENCH_CAN_KO) */
  | { k: 'bench'; p: number; member: number; amount: number }
  | { k: 'swap'; p: number; member: number }
  | { k: 'evolve'; p: number; member: number; from: number; to: number }
  /** `p`, `a`: the attacker and its attack (render-only: a signature move's flourish) */
  | { k: 'impact'; x: number; y: number; element: string; p?: number; a?: number }
  /** an area landing after its telegraph (or a fused shot bursting): render-only, a signature move's flourish */
  | { k: 'landed'; x: number; y: number; p: number; a: number }
  | { k: 'react'; x: number; y: number; what: string }
  | { k: 'prop'; x: number; y: number; broken: boolean }
  // melee (melee.ts; render-only readers): a strike of a swing landing (`fin` 1 = the finisher, 0 = a tap; `style` the
  // melee style, or 'backstab'), a swing that ended having hit nothing, a parry (p blocked `by`), a wall splat (p
  // was splatted by `by`), a throw (p threw t), a flinch (p reels for `ticks`; `interrupt` 1 broke its windup)
  | { k: 'strike'; p: number; t: number; x: number; y: number; fin: number; style: string }
  | { k: 'whiff'; p: number; x: number; y: number }
  | { k: 'parry'; p: number; by: number; x: number; y: number }
  | { k: 'splat'; p: number; by: number; x: number; y: number }
  | { k: 'throw'; p: number; t: number; x: number; y: number }
  | { k: 'flinch'; p: number; ticks: number; interrupt: number }

export type Phase = 'countdown' | 'fight' | 'over'

export interface SimState {
  tick: number
  rng: number
  phase: Phase
  phaseT: number
  /** -1 while playing; else the winning team, or 2 for a draw */
  winner: number
  /** ticks the fight lasted (set when it ends) */
  fightT: number
  nextId: number
  players: PlayerState[]
  projectiles: Projectile[]
  beams: Beam[]
  areas: Area[]
  swings: Swing[]
  /** current tile codes (props break, grass burns) */
  tiles: number[]
  propHp: number[]
  wet: number[]
  shock: number[]
  fire: number[]
  events: SimEvent[]
}
