// Type flavours (docs/KITS.md "Type flavours"): one signature trait per TCG type, applied by default to every attack
// of that element when a kit resolves (resolveKit). A kit opts out with `flavor: false` (the whole kit or one
// attack). The traits are data on the resolved attack (shape params, extra effects, `traits` flags the sim reads),
// so they stay deterministic and every kit gets them without authoring.
//
//   Psychic    gentle homing (capped turn), a slower shot, 10% less damage
//   Fire       shots leave a burning trail; other shapes scorch where they land
//   Water      pushes back and floods
//   Lightning  the fastest shots and recovery; arcs harder into a foe standing in water (chain)
//   Grass      roots (slow) and drains a little life
//   Fighting   armour while winding up (less damage, no knockback); bigger knockback; heavier recovery
//   Darkness   ambush: 30% more damage from behind or into a foe mid-cast; longer lunges
//   Metal      heavy: slower shots, braces after casting, breaks props twice as fast; heavier recovery
//   Dragon     shots pierce the first target; wider beams
//   Fairy      charm: the target's next attacks are weaker
//   Colorless  reliable: a quicker windup and recovery, no gimmick
import * as R from './rules'
import type { Effect, EnergyType, MoveTraits, ResolvedAttack, Shape } from './types'

export interface Flavor {
  /** one line for docs and the HUD */
  trait: string
  /** recovery multiplier, permille */
  recovery: number
  /** the balance knob: damage multiplier, permille (a bonus op on hit; 1000 = none). Set from the type tournament */
  power?: number
}

export const FLAVORS: Record<EnergyType, Flavor> = {
  Psychic: { trait: 'gentle homing, slower, -10% damage', recovery: 1000 },
  Fire: { trait: 'burning trail / scorched ground', recovery: 1000, power: 850 },
  Water: { trait: 'pushback and flooding', recovery: 1000, power: 1200 },
  Lightning: { trait: 'fastest shots and recovery; arcs through water', recovery: 750, power: 1150 },
  Grass: { trait: 'roots (slow) and a small drain', recovery: 1000 },
  Fighting: { trait: 'armour during windup, big knockback', recovery: 1250, power: 1100 },
  Darkness: { trait: 'ambush: +30% from behind or mid-cast', recovery: 1000 },
  Metal: { trait: 'heavy: slower, braces after casting, breaks props', recovery: 1250, power: 960 },
  Dragon: { trait: 'pierces the first target, wide beams', recovery: 1000 },
  Fairy: { trait: 'charm: the target hits weaker', recovery: 1000, power: 950 },
  Colorless: { trait: 'reliable: quick windup and recovery', recovery: 850 },
}

// ------------------------------------------------------------------ movement (per fighter, by its first type)
export const MOVES: Record<EnergyType, MoveTraits> = {
  Psychic: { dodge: 'blink', hover: true },
  Darkness: { dodge: 'blink' },
  Fire: { dodge: 'flame' },
  Lightning: { dodge: 'burst' },
  Fighting: { dodge: 'shoulder' },
  Fairy: { dodge: 'float', hover: true },
  Metal: { noKnockback: true },
  Dragon: {}, // who flies is species, not type (fix-movement's data/flying.json sets `fly`)
  Water: { speedIn: { water: 1300 } },
  Grass: { speedIn: { grass: 1250 } },
  Colorless: {},
}

/** a fighter's movement traits: its type's, then the kit's own `move` (arena main's species list adds `fly` through
 * the same hook) */
export function moveFor(types: readonly EnergyType[], kit?: MoveTraits): MoveTraits | undefined {
  const t = MOVES[types[0] ?? 'Colorless'] ?? {}
  const speedIn = { ...t.speedIn, ...kit?.speedIn }
  const out: MoveTraits = { ...t, ...(kit ?? {}), ...(Object.keys(speedIn).length ? { speedIn } : {}) }
  if (!Object.keys(speedIn).length) delete out.speedIn
  return Object.keys(out).length ? out : undefined // none: a plain walker (movement.ts reads absent as no traits)
}

const has = (list: readonly Effect[], op: string) => list.some((e) => e.op === op)
const num = (sh: Shape, k: string, d: number) => (typeof sh[k] === 'number' ? (sh[k] as number) : d)

/** the attack with its element's flavour applied (a new object; `a` is not changed) */
export function applyFlavor(a: ResolvedAttack): ResolvedAttack {
  const sh: Shape = { ...a.shape }
  let onCast = a.onCast, onHit = a.onHit, onImpact = a.onImpact, windup = a.windup
  const traits: string[] = []
  const proj = sh.kind === 'projectile'
  switch (a.element) {
    case 'Psychic':
      if (proj) {
        // one homing shot: a volley of homing needles (Diancie's Spike Draw) found the foe with every one
        // ...and never a phase shot (it flies through walls: a shot that bent after you through them would be one you
        // could never hide from)
        if (num(sh, 'count', 1) <= 1 && sh.path !== 'phase') sh.homing = R.PSY_HOMING
        sh.speed = Math.max(R.PSY_MIN_SPEED, num(sh, 'speed', 12) - 2)
        const cut = Math.trunc((a.baseDamage * R.PSY_DAMAGE_CUT) / 1000)
        if (cut > 0) onHit = [{ op: 'bonus', amount: -cut }, ...onHit]
        if (sh.homing) traits.push('homing')
      }
      break
    case 'Fire':
      if (proj) { sh.trail = 1; traits.push('trail') }
      // scorch where it lands away from the caster (an aimed area, a beam's end, a cone's tip): not under its own feet
      // (an area around itself, a melee swing or a dash's end would set the caster alight)
      else if ((sh.kind === 'beam' || sh.kind === 'cone' || (sh.kind === 'area' && sh.at === 'aim')) && !has(onImpact, 'paint')) onImpact = [...onImpact, { op: 'paint', terrain: 'fire', radius: 24, ticks: R.TRAIL_TICKS }]
      break
    case 'Water':
      if (sh.kind !== 'self') {
        if (!has(onHit, 'knockback') && !has(onHit, 'pull')) onHit = [...onHit, { op: 'knockback', px: 50 }]
        if (!has(onImpact, 'paint')) onImpact = [...onImpact, { op: 'paint', terrain: 'water', radius: 50 }]
      }
      break
    case 'Lightning':
      if (proj) sh.speed = Math.min(24, num(sh, 'speed', 14) + 3)
      if (sh.kind !== 'self') onHit = [...onHit, { op: 'chain', permille: R.CHAIN_WATER_PERMILLE }]
      break
    case 'Grass':
      if (sh.kind !== 'self') {
        if (!has(onHit, 'slow')) onHit = [...onHit, { op: 'slow', permille: 250, ticks: 60 }]
        if (!has(onHit, 'drain') && a.baseDamage > 0) onHit = [...onHit, { op: 'drain', permille: 150 }]
      }
      break
    case 'Fighting':
      traits.push('armor')
      if (sh.kind === 'melee' || sh.kind === 'dash') {
        const kb = onHit.find((e) => e.op === 'knockback')
        onHit = kb ? onHit.map((e) => (e === kb ? { ...e, px: Math.min(600, Math.trunc(((e.px as number) * 3) / 2)) } : e)) : [...onHit, { op: 'knockback', px: 70 }]
      }
      break
    case 'Darkness':
      traits.push('ambush')
      if (sh.kind === 'melee') sh.lunge = num(sh, 'lunge', 0) + 30
      break
    case 'Metal':
      if (proj) sh.speed = Math.max(R.BIG_SHOT_MIN_SPEED, num(sh, 'speed', 12) - 1)
      sh.propDamage = 2000
      onCast = [...onCast, { op: 'buff', stat: 'defense', amount: 20, ticks: 60 }]
      break
    case 'Dragon':
      if (proj) sh.pierce = Math.max(1, num(sh, 'pierce', 0))
      if (sh.kind === 'beam') sh.width = num(sh, 'width', 20) + 6
      break
    case 'Fairy':
      if (sh.kind !== 'self') onHit = [...onHit, { op: 'buff', stat: 'damage', amount: -20, ticks: R.TURN, target: 'target' }]
      break
    case 'Colorless':
      windup = Math.max(4, windup - 2)
      break
  }
  const recovery = Math.trunc((a.recovery * FLAVORS[a.element].recovery) / 1000)
  // the balance knob (tuned with the tournament, docs/KITS.md): a type's hits a few percent stronger or weaker. A
  // multiplier on the whole hit (combat.attackDamage), so it scales text-driven damage too, not just the printed number
  const power = Math.trunc(((a.power ?? 1000) * (FLAVORS[a.element].power ?? 1000)) / 1000)
  return { ...a, shape: sh, onCast, onHit, onImpact, windup, recovery, traits, ...(power !== 1000 ? { power } : {}) }
}
