// The damage pipeline, status conditions and forces: the only ways effects change fighters.
import type { EffectCtx } from './effects/define'
import { FP, icos, idiv, ilen, isin } from './fixed'
import { flip } from './rng'
import * as R from './rules'
import type { EnergyType, Fighter, FighterKit, MatchDef, SimState } from './types'

export function kitOf(def: MatchDef, s: SimState, p: number): FighterKit | null {
  const pl = s.players[p]
  if (pl.active < 0) return null
  return def.kits[pl.members[pl.active].kit]
}

/** the player's active fighter, or null when none is on the field (KO'd, replacement pending) */
export function onField(s: SimState, p: number): Fighter | null {
  const pl = s.players[p]
  if (pl.active < 0 || pl.members[pl.active].ko) return null
  return pl.fighter
}

export function canAct(f: Fighter): boolean {
  return f.status.paralyzed === 0 && f.status.asleep === 0
}

/** the weakness multiplier/addend for an element: "×2" is ×1.6 in the arena (rules.WEAKNESS_PER_TIMES), "+20" adds */
export function applyWR(amount: number, element: string, kit: FighterKit): { amount: number; eff: number } {
  let eff = 0
  for (const w of kit.weaknesses) {
    if (w.type !== element) continue
    const v = w.value.trim()
    const n = parseInt(v.replace(/[^0-9]/g, ''), 10) || 2
    if (/^[×xX*]/.test(v)) amount = Math.trunc((amount * (1000 + (n - 1) * R.WEAKNESS_PER_TIMES)) / 1000)
    else amount += n
    eff = 1
  }
  for (const r of kit.resistances) {
    if (r.type !== element) continue
    const n = parseInt(r.value.replace(/[^0-9]/g, ''), 10) || 30
    amount = Math.max(0, amount - n)
    eff = -1
  }
  return { amount, eff }
}

function buffSum(f: Fighter, stat: string): number {
  let n = 0
  for (const b of f.buffs) if (b.stat === stat) n += b.amount
  return n
}

/** is `f` winding up an attack with the Fighting armour trait (or swinging one: melee.ts keeps it on `f.armor`
 * through the live frames) */
export function armored(kit: FighterKit, f: Fighter): boolean {
  if ((f.armor ?? 0) > 0) return true
  return f.cast !== null && !!kit.attacks[f.cast.attack]?.traits?.includes('armor')
}

/** is the attacker `a` behind `t` (t faces its aim; the attacker is in the half-plane behind it) */
export function behind(t: Fighter, a: Fighter): boolean {
  const dx = a.x - t.x, dy = a.y - t.y
  return dx * icos(t.aim) + dy * isin(t.aim) < 0
}

/** which of weakness / resistance an attack's damage applies ("isn't affected by Resistance" = 'weakness') */
export type WR = 'both' | 'weakness' | 'resistance' | 'none'

/** attack damage from the cast to ctx.target: bonus, buffs, weakness/resistance (per `wr`), shields and defense
 * buffs (unless `pierce`: "isn't affected by any effects on your opponent's Active Pokémon"). Records the hit on
 * the target (hurtAt / hurtAmt), fires the target's thorns, and returns the damage dealt */
export function attackDamage(ctx: EffectCtx, amount: number, wr: boolean | WR = true, pierce = false): number {
  const { def, s } = ctx
  const t = ctx.target
  if (t < 0) return 0
  const tf = onField(s, t)
  const kit = kitOf(def, s, t)
  if (!tf || !kit || tf.invuln > 0) return 0
  let dmg = amount + ctx.cast.bonus
  const cf = onField(s, ctx.caster)
  if (cf) dmg += buffSum(cf, 'damage')
  // the balance knobs (the type's power, the shape's): a multiplier on the whole hit, before the curve (a raw match,
  // for mechanics tests, skips them like the curves)
  const pw = kitOf(def, s, ctx.caster)?.attacks[ctx.cast.attack]?.power
  if (dmg > 0 && !def.raw && pw !== undefined && pw !== 1000) dmg = Math.trunc((dmg * pw) / 1000)
  // a shard of a split shot (shapes.ts) hits for its share
  if (dmg > 0 && ctx.cast.scale !== undefined && ctx.cast.scale !== 1000) dmg = Math.trunc((dmg * ctx.cast.scale) / 1000)
  // printed (+ bonuses) -> effective attack damage: big hits soft-compressed (rules.DAMAGE_CURVE), before W/R
  if (dmg > 0 && !def.raw) dmg = R.curve(R.DAMAGE_CURVE, dmg)
  // type flavours (flavors.ts): Darkness ambush (a foe mid-cast, or hit from behind), Fighting armour (winding up)
  if (dmg > 0 && cf) {
    const mine = kitOf(def, s, ctx.caster)?.attacks[ctx.cast.attack]
    if (mine?.traits?.includes('ambush') && (tf.cast !== null || behind(tf, cf))) dmg = Math.trunc((dmg * R.AMBUSH_PERMILLE) / 1000)
  }
  if (dmg > 0 && armored(kit, tf)) dmg = Math.trunc((dmg * R.ARMOR_PERMILLE) / 1000)
  let eff = 0
  const mode: WR = wr === true ? 'both' : wr === false ? 'none' : wr
  if (mode !== 'none') {
    const k = mode === 'both' ? kit : { ...kit, weaknesses: mode === 'resistance' ? [] : kit.weaknesses, resistances: mode === 'weakness' ? [] : kit.resistances }
    ;({ amount: dmg, eff } = applyWR(dmg, ctx.cast.element, k))
  }
  if (!pierce) {
    dmg = Math.max(0, dmg - buffSum(tf, 'defense'))
    if (tf.shield && dmg > 0) {
      const absorbed = Math.min(dmg, tf.shield.amount)
      dmg -= absorbed
      tf.shield.amount -= absorbed
      if (tf.shield.amount <= 0) tf.shield = null
    }
  } else if (buffSum(tf, 'defense') < 0) {
    dmg -= buffSum(tf, 'defense') // a vulnerability ("takes 30 more damage") still counts: it's the attacker's own effect
  }
  const dealt = hurt(s, t, dmg, eff, ctx.cast.element, ctx.caster)
  if (dealt > 0) {
    tf.hurtAt = s.tick
    tf.hurtAmt = dealt
    // thorns ("put 3 damage counters on the Attacking Pokémon"): a flat amount, or a permille of the damage taken
    for (const b of tf.buffs) {
      if (b.stat === 'thorns') hurt(s, ctx.caster, b.amount)
      else if (b.stat === 'reflect') hurt(s, ctx.caster, Math.trunc((dealt * b.amount) / 1000))
    }
  }
  ctx.cast.dealt = dealt
  return dealt
}

/** direct damage (self damage, bench, terrain, burn/poison): no W/R, no shields. Returns the damage dealt */
export function hurt(s: SimState, p: number, amount: number, eff = 0, el = '', src = -1): number {
  const pl = s.players[p]
  if (pl.active < 0 || amount <= 0) return 0
  const m = pl.members[pl.active]
  if (m.ko) return 0
  const dealt = Math.min(amount, m.hp)
  m.hp -= dealt
  // attack damage to an opponent charges the attacker's evolve meter
  if (src >= 0 && src !== p && s.players[src] && s.players[src].team !== pl.team) {
    s.players[src].evo = Math.min(R.EVO_MAX, s.players[src].evo + dealt)
  }
  const f = pl.fighter
  s.events.push({ k: 'dmg', p, amount, x: f.x, y: f.y, eff, el, src })
  if (f.status.asleep > 0) f.status.asleep = 0 // taking damage wakes a sleeping Pokémon
  return dealt
}

export function heal(s: SimState, p: number, amount: number): void {
  const pl = s.players[p]
  if (pl.active < 0) return
  const m = pl.members[pl.active]
  if (m.ko) return
  const n = Math.min(amount, m.maxHp - m.hp)
  if (n <= 0) return
  m.hp += n
  s.events.push({ k: 'heal', p, amount: n })
}

export const STATUSES = ['paralyzed', 'asleep', 'confused', 'burned', 'poisoned'] as const
export type StatusName = (typeof STATUSES)[number]

/** apply a special condition. Asleep / Confused / Paralyzed replace each other (as in the TCG); Burned and Poisoned stack */
export function applyStatus(s: SimState, p: number, status: StatusName): void {
  const f = onField(s, p)
  if (!f || f.invuln > 0) return
  const st = f.status
  if (status === 'paralyzed' || status === 'asleep' || status === 'confused') {
    st.paralyzed = 0; st.asleep = 0; st.confused = 0
  }
  if (status === 'paralyzed') st.paralyzed = R.PARALYZE_TICKS
  if (status === 'asleep') st.asleep = R.SLEEP_MAX_TICKS
  if (status === 'confused') st.confused = R.CONFUSE_TICKS
  if (status === 'burned') st.burned = 1
  if (status === 'poisoned') st.poisoned = R.POISON_TICKS
  if (st.turnTimer === 0) st.turnTimer = R.TURN
  if (status === 'paralyzed' || status === 'asleep') { f.cast = null; f.dodge = null; f.dash = null }
  s.events.push({ k: 'status', p, status })
}

export function clearStatus(f: Fighter): void {
  f.status = { paralyzed: 0, asleep: 0, confused: 0, burned: 0, poisoned: 0, turnTimer: 0 }
}

/** the between-turns tick of the conditions: burn / poison damage, the sleep and burn rolls, durations */
export function tickStatus(s: SimState, p: number): void {
  const f = onField(s, p)
  if (!f) return
  const st = f.status
  if (st.paralyzed > 0) st.paralyzed--
  if (st.confused > 0) st.confused--
  if (st.poisoned > 0) st.poisoned--
  if (st.asleep > 0) st.asleep--
  const any = st.burned || st.poisoned || st.asleep
  if (!any) { st.turnTimer = 0; return }
  if (st.turnTimer > 0) st.turnTimer--
  if (st.turnTimer > 0) return
  st.turnTimer = R.TURN
  if (st.poisoned > 0) hurt(s, p, R.POISON_DAMAGE)
  if (st.burned > 0) {
    hurt(s, p, R.BURN_DAMAGE)
    if (flip(s)) st.burned = 0
  }
  if (st.asleep > 0 && flip(s)) st.asleep = 0
}

/** push p away from (x, y) by px over ticks (negative px pulls toward) */
export function shove(s: SimState, p: number, x: number, y: number, px: number, ticks: number): void {
  const f = onField(s, p)
  if (!f || f.invuln > 0 || ticks <= 0) return
  let dx = f.x - x, dy = f.y - y
  let len = ilen(dx, dy)
  if (len === 0) { dx = FP; dy = 0; len = FP }
  const total = px * FP
  f.knock = { vx: idiv(idiv(dx * total, len), ticks), vy: idiv(idiv(dy * total, len), ticks), t: ticks }
}

/** does this kit have the type (for terrain immunities) */
export function hasType(kit: FighterKit | null, t: EnergyType): boolean {
  return !!kit && kit.types.includes(t)
}
