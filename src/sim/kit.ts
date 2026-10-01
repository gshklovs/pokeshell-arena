// Kits (docs/SPEC.md section 7): card data is the source of truth for the numbers; a kit adds shapes and effects,
// and any number it gives is an override. resolveKit merges them; autoKit shapes a card that has no kit.
import { autoKit } from './autokit'
import { parseAttackText } from './cardtext'
import { applyFlavor, moveFor } from './flavors'
import { STYLES, applyMelee, isStyle } from './melee'
import { ARCHETYPES, archetypeFor } from './lexicon'
import { PATHS } from './shapes'
import { validateEffects } from './effects/registry'
import * as R from './rules'
import {
  ENERGY_TYPES, type CardData, type Effect, type EnergyType, type FighterKit, type Kit,
  type ResolvedAttack, type Shape, type ShapeKind,
} from './types'

export const SHAPE_KINDS: ShapeKind[] = ['projectile', 'beam', 'cone', 'melee', 'area', 'self', 'dash', 'summon', 'terrain']

/** the printed damage as a number: "90+" -> 90, "30×" -> 30, "" -> 0 */
export function parseDamage(d: string | undefined): number {
  const m = /\d+/.exec(d ?? '')
  return m ? parseInt(m[0], 10) : 0
}


function asType(t: string | undefined): EnergyType {
  return (ENERGY_TYPES as string[]).includes(t ?? '') ? (t as EnergyType) : 'Colorless'
}

function cleanCost(cost: readonly string[] | undefined): EnergyType[] {
  return (cost ?? []).filter((c) => c && c !== 'Free').map(asType)
}

/** once-per-match attacks, from the card's own reminder text (GX attacks, VSTAR Powers) */
function onceFrom(text: string | undefined): 'gx' | 'vstar' | null {
  if (!text) return null
  if (/VSTAR Power/i.test(text)) return 'vstar'
  if (/GX attack/i.test(text)) return 'gx'
  return null
}

// ------------------------------------------------------------------ auto-kit (autokit.ts: effects from the card text, shapes)
export { autoKit }

// ------------------------------------------------------------------ validation
function shapeErrors(s: unknown, at: string): string[] {
  if (!s || typeof s !== 'object') return [`${at}: missing`]
  const sh = s as Shape
  if (!SHAPE_KINDS.includes(sh.kind)) return [`${at}.kind: ${JSON.stringify(sh.kind)} is not one of ${SHAPE_KINDS.join(', ')}`]
  const need: Record<ShapeKind, string[]> = {
    projectile: ['speed', 'radius', 'range'], beam: ['length', 'width'], cone: ['range', 'arc'], melee: ['range'],
    area: ['radius'], self: [], dash: ['distance', 'speed'], summon: ['ticks'], terrain: ['radius'],
  }
  const errs: string[] = []
  for (const k of need[sh.kind]) if (!Number.isInteger(sh[k]) || (sh[k] as number) <= 0) errs.push(`${at}.${k}: a positive integer is required`)
  for (const [k, v] of Object.entries(sh)) {
    if (k === 'kind' || k === 'at' || k === 'entity') continue
    if (k === 'path') { if (!(PATHS as readonly string[]).includes(v as string)) errs.push(`${at}.path: one of ${PATHS.join(', ')}`); continue }
    // the melee style by hand (melee.ts; else it is read from the attack's name)
    if (k === 'style') { if (!isStyle(v)) errs.push(`${at}.style: one of ${STYLES.join(', ')}`); continue }
    if (typeof v !== 'number' || !Number.isInteger(v)) errs.push(`${at}.${k}: must be an integer`)
  }
  if ((sh.kind === 'area' || sh.kind === 'terrain') && sh.at !== undefined && sh.at !== 'self' && sh.at !== 'aim') errs.push(`${at}.at: "self" or "aim"`)
  // no aim assist and no hand-set lock-on: only the Psychic flavour adds (gentle) homing
  if (sh.homing !== undefined && sh.homing !== 0) errs.push(`${at}.homing: kits can't set homing (Psychic shots get it from their type flavour)`)
  return errs
}

/** the shape params that make a trajectory (docs/MOVES.md "Signature moves"): how a shot flies, spreads, splits,
 * sticks, swells or bursts, and how aimed impacts are laid out. A kit shape of the archetype's own kind takes the ones
 * it doesn't set itself; its sizes (speed, radius, range, width, arc...) stay its own */
export const TRAJECTORY = [
  'path', 'amp', 'period', 'bounces', 'drift', 'wall', 'blast', 'count', 'spread', 'split', 'splitSpread', 'splitSpeed',
  'splitRange', 'splitR', 'splitPower', 'fuse', 'stick', 'grow', 'growMax', 'scatter', 'stagger',
] as const

const ranged = (s: Shape) => s.kind === 'projectile' || s.kind === 'beam' || (s.kind === 'area' && s.at === 'aim')
/** how far a shape reaches along the aim, px */
function reachOf(s: Shape): number {
  const n = (k: string) => (typeof s[k] === 'number' ? (s[k] as number) : 0)
  return s.kind === 'beam' ? n('length') : s.kind === 'area' ? n('range') + n('radius') : n('range')
}

/** a hand kit's shape with its archetype's trajectory (kit.resolveKit; docs/MOVES.md "Signature moves"). The kit keeps
 * its numbers and effects; its shape takes how the move flies:
 *  - the same kind: the trajectory params it doesn't set (a Thunder Jolt shot zigzags, a Power Gem shot shatters)
 *  - another kind: the archetype's shape (a Tackle swing becomes the body charge, a Super Psy Bolt beam a zigzag
 *    bolt), and between two ranged shapes (shot, beam, aimed area) with the kit's reach. A kit's shot stays a shot
 *    under a beam archetype (dodgeable on purpose: a beam hits at once), and a Max move keeps the kit's kind
 *  - not at all under a broad bucket (Archetype.generic), a self move or a Stadium, or when the kit pins its shape
 *    (KitAttack.pin, with the reason) */
export function adoptShape(kit: Shape, id: string, cost: number, damage: number): Shape {
  const ar = ARCHETYPES[id]
  if (!ar || ar.generic) return kit
  const lex = ar.shape(cost, damage, 'Colorless')
  const plain = (s: Shape) => s.kind === 'self' || s.kind === 'terrain' || s.kind === 'summon'
  if (plain(kit) || plain(lex)) return kit
  if (lex.kind === kit.kind && (lex.at ?? null) === (kit.at ?? null)) {
    if (kit.kind === 'melee' || kit.kind === 'cone' || kit.kind === 'beam') return kit
    const out: Shape = { ...kit }
    const ownPath = kit.path !== undefined
    for (const k of TRAJECTORY) {
      if (out[k] !== undefined || lex[k] === undefined) continue
      if (ownPath && (k === 'path' || k === 'amp' || k === 'period')) continue
      // a wall across a lob's path means nothing (it flies over everything)
      if (k === 'wall' && (out.path ?? lex.path) === 'lob') continue
      out[k] = lex[k]
    }
    // a volley spread of the archetype's makes sense only with its count
    if (kit.count !== undefined && lex.count !== undefined && out.spread === lex.spread && kit.spread === undefined) delete out.spread
    // a single shot taking the archetype's volley keeps its reach budget: a volley of shots is thinner (0.7x the
    // radius). A kit's area stays one area (its size is its balance: a line or scatter of impacts is drawn, not added)
    if (kit.count === undefined && typeof out.count === 'number' && out.count > 1) {
      if (kit.kind === 'projectile' && typeof kit.radius === 'number') out.radius = Math.max(5, Math.trunc((kit.radius * 7) / 10))
      if (kit.kind === 'area') for (const k of ['count', 'scatter', 'stagger'] as const) if (kit[k] === undefined) delete out[k]
    }
    return out
  }
  if ((ar as { family?: string }).family === 'max') return kit
  if (kit.kind === 'projectile' && lex.kind === 'beam') return kit
  if (ranged(kit) && ranged(lex)) {
    const reach = reachOf(kit)
    if (lex.kind === 'projectile') {
      const out: Shape = { ...lex, range: Math.max(360, Math.min(800, reach)) }
      if (kit.kind === 'projectile') { out.speed = kit.speed; out.radius = kit.radius }
      return out
    }
    if (lex.kind === 'beam') return { ...lex, length: Math.max(360, Math.min(800, reach)) }
    const r = typeof lex.radius === 'number' ? (lex.radius as number) : 80
    return { ...lex, range: Math.max(r, Math.min(560, reach - Math.trunc(r / 2))) }
  }
  return lex
}

/** how an attack is drawn (docs/VFX.md), and the hit shape its name implies: the archetype its name (else its text)
 * reads as. A kit's own `look` wins. For a hand kit (`hand`), its shape takes the archetype's trajectory (adoptShape)
 * unless it pins its shape; the renderer draws the look on whatever shape kind it ends up. When the archetype makes the
 * same kind of shot, its wall rides along too (a hand-authored "Wave Splash" shot rolls as a wide wall, not a ball).
 * Pure: the same card and kit always give the same look */
function lookFor(a: { name: string; look?: string; shape: Shape; pin?: string }, text: string | undefined, cardName: string, cost: number, damage: number, hand: boolean): { look?: string; shape: Shape } {
  const id = a.look && ARCHETYPES[a.look] ? a.look : archetypeFor(a.name, parseAttackText(text, cardName), damage)?.id
  if (!id) return { shape: a.shape }
  if (hand && !a.pin) return { look: id, shape: adoptShape(a.shape, id, cost, damage) }
  const ar = ARCHETYPES[id].shape(cost, damage, 'Colorless')
  // a wall of a shot (a wave, a ripple): the kit's shot takes the archetype's width across its path
  const wall = typeof ar.wall === 'number' && ar.kind === 'projectile' && a.shape.kind === 'projectile' && a.shape.wall === undefined && a.shape.path !== 'lob'
  return { look: id, shape: wall ? { ...a.shape, wall: ar.wall } : a.shape }
}

/** every problem in a kit file (schema, shapes, effect ops and their params) */
export function validateKit(k: unknown): string[] {
  const errs: string[] = []
  const kit = k as Kit
  if (!kit || typeof kit !== 'object') return ['not an object']
  if (kit.version !== 1) errs.push(`version: ${JSON.stringify(kit.version)} (must be 1)`)
  if (typeof kit.card !== 'string' || !/^[a-z0-9]+-[A-Za-z0-9]+$/.test(kit.card)) errs.push('card: a pokemontcg.io id like "base1-58"')
  if (!Array.isArray(kit.attacks) || kit.attacks.length === 0) errs.push('attacks: at least one')
  const st = kit.stats
  if (st) {
    if (st.hp !== undefined && !(Number.isInteger(st.hp) && st.hp > 0)) errs.push('stats.hp: a positive integer')
    if (st.retreat !== undefined && !(Number.isInteger(st.retreat) && st.retreat >= 0)) errs.push('stats.retreat: an integer >= 0')
    for (const t of st.types ?? []) if (!(ENERGY_TYPES as string[]).includes(t)) errs.push(`stats.types: unknown type ${t}`)
  }
  ;(kit.attacks ?? []).forEach((a, i) => {
    const at = `attacks[${i}]`
    if (!a || typeof a.name !== 'string' || !a.name) errs.push(`${at}.name: required (it matches the card's attack)`)
    for (const c of a?.cost ?? []) if (!(ENERGY_TYPES as string[]).includes(c) && c !== 'Free') errs.push(`${at}.cost: unknown energy ${c}`)
    if (a?.element !== undefined && !(ENERGY_TYPES as string[]).includes(a.element)) errs.push(`${at}.element: unknown type ${a.element}`)
    for (const k2 of ['windup', 'recovery', 'cooldown'] as const) {
      const v = a?.[k2]
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) errs.push(`${at}.${k2}: an integer >= 0 (ticks)`)
    }
    if (a?.oncePerMatch != null && a.oncePerMatch !== 'gx' && a.oncePerMatch !== 'vstar') errs.push(`${at}.oncePerMatch: "gx", "vstar" or null`)
    if (a?.pin !== undefined && (typeof a.pin !== 'string' || !a.pin.trim())) errs.push(`${at}.pin: the reason the kit keeps its own shape, as text`)
    errs.push(...shapeErrors(a?.shape, `${at}.shape`))
    for (const list of ['onCast', 'onHit', 'onImpact'] as const) errs.push(...validateEffects(a?.[list], `${at}.${list}`))
  })
  if (kit.fantasy !== undefined && (typeof kit.fantasy !== 'string' || !kit.fantasy.trim())) errs.push('fantasy: a sentence')
  if (kit.overrides !== undefined) {
    if (!kit.overrides || typeof kit.overrides !== 'object') errs.push('overrides: {key: reason}')
    else for (const [k2, v] of Object.entries(kit.overrides)) if (typeof v !== 'string' || !v.trim()) errs.push(`overrides.${k2}: the reason, as text`)
  }
  return errs
}

/** the override keys a kit's numbers imply against its card ("hp", "retreat", "types", "<attack>.cost", "<attack>.damage") */
export function overrideKeys(kit: Kit, card: CardData): string[] {
  const out: string[] = []
  const st = kit.stats ?? {}
  if (st.hp !== undefined && st.hp !== parseInt(String(card.hp), 10)) out.push('hp')
  if (st.retreat !== undefined && st.retreat !== (card.retreatCost ?? []).length) out.push('retreat')
  if (st.types && JSON.stringify(st.types) !== JSON.stringify(card.types ?? [])) out.push('types')
  kit.attacks.forEach((a, i) => {
    const ca = card.attacks?.find((x) => x.name === a.name) ?? card.attacks?.[i]
    if (!ca) return
    if (a.cost && JSON.stringify(cleanCost(a.cost)) !== JSON.stringify(cleanCost(ca.cost))) out.push(`${a.name}.cost`)
    if (a.damage !== undefined && a.damage !== (ca.damage ?? '')) out.push(`${a.name}.damage`)
  })
  return out
}

/** where a kit's override differs from the card data (the kit test lists these: overrides must be deliberate) */
export function kitOverrides(kit: Kit, card: CardData): string[] {
  const out: string[] = []
  const st = kit.stats ?? {}
  if (st.hp !== undefined && st.hp !== parseInt(String(card.hp), 10)) out.push(`hp ${st.hp} vs card ${card.hp}`)
  if (st.retreat !== undefined && st.retreat !== (card.retreatCost ?? []).length) out.push(`retreat ${st.retreat} vs card ${(card.retreatCost ?? []).length}`)
  if (st.types && JSON.stringify(st.types) !== JSON.stringify(card.types ?? [])) out.push(`types ${st.types} vs card ${card.types}`)
  kit.attacks.forEach((a, i) => {
    const ca = card.attacks?.find((x) => x.name === a.name) ?? card.attacks?.[i]
    if (!ca) { out.push(`attack "${a.name}" is not on the card`); return }
    if (ca.name !== a.name) out.push(`attack ${i} "${a.name}" vs card "${ca.name}"`)
    if (a.cost && JSON.stringify(cleanCost(a.cost)) !== JSON.stringify(cleanCost(ca.cost))) out.push(`${a.name} cost ${a.cost} vs card ${ca.cost}`)
    if (a.damage !== undefined && a.damage !== (ca.damage ?? '')) out.push(`${a.name} damage "${a.damage}" vs card "${ca.damage}"`)
  })
  return out
}

/** the timing model (rules.RECOVERY_*): an attack that costs energy has no cooldown (energy gates it); a 0-cost
 * attack keeps one (the kit's, else ZERO_COST_COOLDOWN, longer for a free attack that hits hard) */
export function cooldownFor(pips: number, kitCooldown: number | undefined, damage = 0): number {
  return pips > 0 ? 0 : (kitCooldown ?? R.ZERO_COST_COOLDOWN + R.ZERO_COST_PER_DAMAGE * Math.max(0, damage - R.ZERO_COST_FREE_DAMAGE))
}

/** the recovery after an attack: a base plus some per damage, capped; a kit may ask for a longer one */
export function recoveryFor(damage: number, kitRecovery: number | undefined): number {
  const r = Math.min(R.RECOVERY_MAX, R.RECOVERY_BASE + Math.trunc(damage / R.RECOVERY_PER_TICK_DAMAGE))
  return Math.max(r, kitRecovery ?? 0)
}

/** the damage an effect list does in a typical hit (coins at their average, counts at a typical 2): what a bot
 * weighs an attack by when the card prints no damage number (its damage comes from its text) */
export function estimateDamage(list: readonly Effect[] | undefined): number {
  let n = 0
  for (const e of list ?? []) {
    const amount = typeof e.amount === 'number' ? e.amount : 0
    switch (e.op) {
      case 'damage': case 'counters': case 'bonus': n += amount; break
      case 'bonusPer': n += 2 * amount; break
      case 'benchDamage': n += Math.trunc(amount / 2); break
      case 'hpCut': n += 40; break
      case 'mimic': n += 60; break
      case 'coins': n += Math.trunc(((e.count as number) * estimateDamage(e.perHeads as Effect[])) / 2); break
      case 'coinsUntilTails': n += estimateDamage(e.perHeads as Effect[]); break
      case 'coin': n += Math.trunc((estimateDamage(e.heads as Effect[]) + estimateDamage(e.tails as Effect[])) / 2); break
      case 'chance': n += Math.trunc(((e.permille as number) * estimateDamage(e.then as Effect[])) / 1000); break
      case 'when': n += Math.trunc(estimateDamage(e.then as Effect[]) / 2); break
    }
  }
  return Math.max(0, n)
}

/** the shape levelling (rules.RING_POWER, DASH_POWER, MELEE_POWER, MELEE_MIN_ARC, RING_MIN_WINDUP; docs/KITS.md): a
 * ring around the caster and a dash hit a little softer (they need little or no aim) and a ring winds up long enough
 * to step out of; a close swing hits a little harder, and no swing is narrower than the minimum arc */
export function levelShape(a: ResolvedAttack): ResolvedAttack {
  const sh = a.shape
  let shape = sh
  if (sh.kind === 'melee' && typeof sh.arc === 'number' && sh.arc < R.MELEE_MIN_ARC) shape = { ...sh, arc: R.MELEE_MIN_ARC }
  // a ring needs no aim: an area around the caster, or a swing that goes (nearly) all the way round
  const ring = (sh.kind === 'area' && sh.at !== 'aim') || (sh.kind === 'melee' && typeof sh.arc === 'number' && sh.arc >= 200)
  const power = ring ? R.RING_POWER : sh.kind === 'dash' ? R.DASH_POWER : sh.kind === 'melee' ? R.MELEE_POWER : 1000
  const windup = ring && a.baseDamage > 0 ? Math.max(a.windup, R.RING_MIN_WINDUP) : a.windup
  if (power === 1000 && shape === sh && windup === a.windup) return a
  const total = Math.trunc(((a.power ?? 1000) * power) / 1000)
  return { ...a, shape, windup, ...(total !== 1000 ? { power: total } : {}) }
}

/** the HP a fighter has in the arena: the printed HP soft-compressed toward the middle (rules.HP_CURVE), to 10 */
export function effectiveHp(printed: number): number {
  return Math.max(10, Math.round(R.curve(R.HP_CURVE, printed) / 10) * 10)
}

/** a card (with or without a kit) -> the fighter the sim uses. Throws if a number is missing from both */
export function resolveKit(card: CardData | null, kit: Kit | null): FighterKit {
  if (!card && !kit) throw new Error('resolveKit: need a card or a kit')
  const k = kit ?? autoKit(card!)
  const st = k.stats ?? {}
  const id = k.card ?? card!.id
  const printedHp = st.hp ?? parseInt(String(card?.hp ?? ''), 10)
  if (!Number.isInteger(printedHp) || printedHp <= 0) throw new Error(`${id}: no HP (no card data and no stats.hp override)`)
  const hp = effectiveHp(printedHp)
  const types = (st.types ?? card?.types ?? ['Colorless']).map(asType)
  const subtypes = st.subtypes ?? card?.subtypes ?? []
  // heavy cards wind up longer (they're bigger and slower already, by their retreat cost)
  const heavy = Math.trunc(Math.max(0, printedHp - R.HEAVY_HP) / R.HEAVY_HP_PER_TICK)
  const attacks = k.attacks.map((a, i): ResolvedAttack => {
    const ca = card?.attacks?.find((x) => x.name === a.name) ?? card?.attacks?.[i]
    if (!a.cost && !ca) throw new Error(`${id}: attack "${a.name}" has no cost (no card data and no override)`)
    const cost = cleanCost(a.cost ?? ca?.cost)
    const damage = a.damage ?? ca?.damage ?? ''
    const element = a.element ? asType(a.element) : (cost.find((c) => c !== 'Colorless') ?? types[0])
    const onCast = a.onCast ?? [], onHit = a.onHit ?? []
    // no printed number: the damage its effects do (so bots and props weigh it)
    const printed = parseDamage(damage)
    const base = printed > 0 ? printed : estimateDamage([...onCast, ...onHit])
    // big attacks telegraph: a minimum windup by damage, and slower shots
    const minWindup = R.DEFAULT_WINDUP + Math.trunc(base / R.WINDUP_PER_TICK_DAMAGE) + heavy
    const lk = lookFor(a, ca?.text, card?.name ?? k.name ?? id, cost.length, printed, !!kit)
    const shape = lk.shape.kind === 'projectile' && typeof lk.shape.speed === 'number'
      ? { ...lk.shape, speed: Math.max(R.BIG_SHOT_MIN_SPEED, (lk.shape.speed as number) - Math.trunc(base / R.BIG_SHOT_SLOWDOWN)) }
      : lk.shape
    const resolved: ResolvedAttack = {
      name: a.name,
      cost,
      damage,
      baseDamage: base,
      element,
      shape,
      windup: Math.max(minWindup, a.windup ?? Math.min(24, R.DEFAULT_WINDUP + 2 * Math.max(0, cost.length - 1))),
      recovery: recoveryFor(base, a.recovery),
      cooldown: cooldownFor(cost.length, a.cooldown, base),
      oncePerMatch: a.oncePerMatch ?? onceFrom(ca?.text),
      onCast,
      onHit,
      onImpact: a.onImpact ?? [],
      traits: [],
      ...(lk.look ? { look: lk.look } : {}),
    }
    // the type flavour (flavors.ts), unless the kit or the attack opts out; then the melee style by name (melee.ts,
    // docs/MELEE.md) with its per-type melee flavour under the same opt-out; then the shape levelling (always)
    const plain = k.flavor === false || a.flavor === false
    return levelShape(applyMelee(plain ? resolved : applyFlavor(resolved), !plain))
  })
  return {
    card: id,
    character: k.character ?? card?.character ?? (k.name ?? card?.name ?? id).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: k.name ?? card?.name ?? id,
    hp,
    printedHp,
    types,
    subtypes,
    evolvesFrom: (st.evolvesFrom !== undefined ? st.evolvesFrom : card?.evolvesFrom) ?? null,
    weaknesses: st.weaknesses ?? card?.weaknesses ?? [],
    resistances: st.resistances ?? card?.resistances ?? [],
    retreat: st.retreat ?? (card?.retreatCost ?? []).length,
    move: moveFor(types, k.move),
    attacks,
    source: kit ? 'kit' : 'auto',
  }
}
