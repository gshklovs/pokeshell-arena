// One sim tick (docs/SPEC.md section 3 "step order"). Deterministic: integer math, the state's PRNG, player order.
import { applyStatus, canAct, clearStatus, hasType, hurt, kitOf, onField, shove, tickStatus } from './combat'
import { canPay, fillMeters, pay } from './energy'
import { FP, ONE, icos, idiv, ilen, isin, isqrt, pxPerSec } from './fixed'
import { flip, roll } from './rng'
import * as R from './rules'
import { advanceAreas, advanceDash, advanceMelee, advanceProjectiles, moveFighter, release } from './shapes'
import { LANDING, decayMelee, dropSwings, flinched, splat, swinging } from './melee'
import { newFighter, spawnPoint } from './state'
import { fighterBlocked, terrainSpeedPermille, unstick } from './movement'
import { circleTouches, COLS, paint, tickTerrain, tileAt } from './terrain'
import { canEvolveInto, isTopStage } from './evolution'
import { BTN, NO_INPUT, TILE, evolveChoice, swapSlot, type InputFrame, type MatchDef, type SimState } from './types'

const ATTACK_BTNS = [BTN.ATTACK1, BTN.ATTACK2, BTN.ATTACK3]

/** the tile index under a fighter's center */
function tileIndex(x: number, y: number): number {
  const t = tileAt(x, y)
  return t.ty * COLS + t.tx
}

/** remove a player's live shots (they belong to the Pokémon that left the field) */
function dropShots(s: SimState, p: number): void {
  s.projectiles = s.projectiles.filter((x) => x.owner !== p)
  s.areas = s.areas.filter((x) => x.owner !== p)
  dropSwings(s, p)
}

/** put member idx on the field for player p (a swap or a KO replacement) */
export function bringIn(def: MatchDef, s: SimState, p: number, idx: number, invuln: number): void {
  const pl = s.players[p]
  const old = pl.fighter
  const kit = def.kits[pl.members[idx].kit]
  let x = old.x, y = old.y
  if (pl.active < 0) ({ x, y } = spawnPoint(def, pl.team, p))
  pl.active = idx
  pl.fighter = newFighter(kit, x, y, old.facing, s.tick)
  pl.fighter.aim = old.aim
  // landing: a Pokémon that can't stand where the last one was (a bigger body by a wall, a non-flier replacing a
  // flier over water or a pit) goes to the nearest free spot; the spawn point only if there is none
  if (!unstick(s, pl.fighter) && fighterBlocked(s, pl.fighter)) { const sp = spawnPoint(def, pl.team, p); pl.fighter.x = sp.x; pl.fighter.y = sp.y }
  pl.fighter.invuln = invuln
  dropShots(s, p)
  s.events.push({ k: 'swap', p, member: idx })
}

/** the next kit on the active member's start line (PlayerDef.paths), or -1 */
function pathNext(def: MatchDef, s: SimState, p: number): number {
  const pl = s.players[p]
  const path = def.players[p].paths?.[pl.active] ?? []
  if (!path.length) return -1
  const cur = pl.members[pl.active].kit
  const at = cur === def.players[p].members[pl.active] ? -1 : path.includes(cur) ? path.indexOf(cur) : -2
  if (at >= -1) { const k = path[at + 1]; return k !== undefined && !pl.evoUsed.includes(k) ? k : -1 }
  // it left its line (another option): rejoin it where the card it became can evolve into a later step
  const kit = def.kits[cur]
  for (const k of path) if (!pl.evoUsed.includes(k) && canEvolveInto(kit, def.kits[k])) return k
  return -1
}

/** the kits player p's active Pokémon can evolve into now: first the next step of the line its slot was picked for,
 * then the owned cards that evolve from it (src/sim/evolution.ts canEvolveInto: normalised names, the species of
 * regular stages, VMAX / VSTAR only from their V), each card once per match. Empty unless the evolve charge is full
 * (pass charged=false to preview) */
export function evolveOptions(def: MatchDef, s: SimState, p: number, charged = true): number[] {
  const pl = s.players[p]
  if (pl.active < 0 || (charged && pl.evo < R.EVO_MAX)) return []
  const kit = def.kits[pl.members[pl.active].kit]
  const out: number[] = []
  const first = pathNext(def, s, p)
  if (first >= 0) out.push(first)
  // other slots' line cards are theirs; a card already on offer (the same printed card) isn't offered twice
  const reserved = new Set<number>()
  def.players[p].paths?.forEach((path, i) => { if (i !== pl.active) for (const k of path) reserved.add(k) })
  const cards = new Set(out.map((k) => def.kits[k].card))
  for (const k of def.players[p].evolutions ?? []) {
    if (out.length >= R.EVO_OPTIONS_MAX) break
    const e = def.kits[k]
    if (!e || reserved.has(k) || pl.evoUsed.includes(k) || out.includes(k) || cards.has(e.card)) continue
    if (canEvolveInto(kit, e)) { out.push(k); cards.add(e.card) }
  }
  return out
}

/** why the active Pokémon can or can't evolve, for the HUD and the fizzle: `options` as evolveOptions(charged=false) */
export interface EvolveStatus {
  ready: boolean
  options: number[]
  /** "no owned evolution" | "charge 40/60" | "already evolved this match" | "top stage" | "ready" */
  reason: string
}

export function evolveStatus(def: MatchDef, s: SimState, p: number): EvolveStatus {
  const pl = s.players[p]
  if (pl.active < 0) return { ready: false, options: [], reason: 'no Pokémon in play' }
  const options = evolveOptions(def, s, p, false)
  const charge = `charge ${Math.min(pl.evo, R.EVO_MAX)}/${R.EVO_MAX}`
  if (options.length) return pl.evo >= R.EVO_MAX ? { ready: true, options, reason: 'ready' } : { ready: false, options, reason: charge }
  const ck = pl.members[pl.active].kit
  const kit = def.kits[ck]
  // the cards it could have taken are spent: this match already used them
  const pathSpent = (def.players[p].paths?.[pl.active] ?? []).some((k) => pl.evoUsed.includes(k) && canEvolveInto(kit, def.kits[k]))
  const spent = pathSpent || (def.players[p].evolutions ?? []).some((k) => pl.evoUsed.includes(k) && canEvolveInto(kit, def.kits[k]))
  if (spent) return { ready: false, options, reason: 'already evolved this match' }
  if (isTopStage(kit) || def.topKits?.includes(ck)) return { ready: false, options, reason: 'top stage' }
  return { ready: false, options, reason: 'no owned evolution' }
}

/** evolve player p's active Pokémon into kit `to`: the damage taken stays (the TCG's damage counters), conditions
 * clear, a brief invulnerability, the charge resets */
export function evolve(def: MatchDef, s: SimState, p: number, to: number): void {
  const pl = s.players[p]
  const m = pl.members[pl.active]
  const old = pl.fighter
  const kit = def.kits[to]
  const damage = m.maxHp - m.hp
  const from = m.kit
  m.kit = to
  m.maxHp = kit.hp
  m.hp = Math.max(1, kit.hp - damage)
  const f = newFighter(kit, old.x, old.y, old.facing)
  f.aim = old.aim
  // a bigger body may overlap a wall (or lose crossWater over deep water): take the nearest free spot around
  unstick(s, f)
  f.invuln = R.EVOLVE_INVULN
  pl.fighter = f
  pl.evo = 0
  pl.evoUsed.push(to)
  dropShots(s, p)
  s.events.push({ k: 'evolve', p, member: pl.active, from, to })
}

function nextAlive(s: SimState, p: number, from: number, dir: 1 | -1): number {
  const m = s.players[p].members
  for (let k = 1; k <= m.length; k++) {
    const i = (((from + dir * k) % m.length) + m.length) % m.length
    if (!m[i].ko && i !== s.players[p].active) return i
  }
  return -1
}

/** which bench slot the pressed buttons ask for (-1 none) */
function wantedSlot(s: SimState, p: number, pressed: number): number {
  const pl = s.players[p]
  const from = pl.active < 0 ? -1 : pl.active
  const slot = swapSlot(pressed)
  if (slot >= 1 && slot <= pl.members.length && !pl.members[slot - 1].ko && slot - 1 !== pl.active) return slot - 1
  if (pressed & BTN.SWAP_NEXT) return nextAlive(s, p, from < 0 ? -1 : from, 1)
  if (pressed & BTN.SWAP_PREV) return nextAlive(s, p, from < 0 ? 0 : from, -1)
  return -1
}

function tryAttack(def: MatchDef, s: SimState, p: number, i: number): void {
  const pl = s.players[p]
  const f = pl.fighter
  const kit = kitOf(def, s, p)
  const atk = kit?.attacks[i]
  if (!kit || !atk || f.cooldowns[i] > 0) return
  const types = def.players[p].energy
  if (atk.oncePerMatch && pl.usedOnce.includes(atk.oncePerMatch)) { s.events.push({ k: 'fizzle', p, why: `one ${atk.oncePerMatch.toUpperCase()} per match` }); return }
  if (!canPay(atk.cost, types, pl.pips)) { s.events.push({ k: 'fizzle', p, why: 'energy' }); return }
  pay(pl, types, atk.cost)
  if (atk.oncePerMatch) pl.usedOnce.push(atk.oncePerMatch)
  f.cooldowns[i] = atk.cooldown
  if (f.status.confused > 0) {
    const heads = flip(s)
    s.events.push({ k: 'coin', p, heads })
    if (!heads) { hurt(s, p, R.CONFUSE_SELF_DAMAGE); f.recovery = 20; s.events.push({ k: 'fizzle', p, why: 'confused' }); return }
  }
  f.cast = { attack: i, t: atk.windup }
  s.events.push({ k: 'cast', p, attack: i })
}

function trySwap(def: MatchDef, s: SimState, p: number, idx: number): void {
  const pl = s.players[p]
  const kit = kitOf(def, s, p)
  if (!kit || idx < 0) return
  const cost = new Array<string>(kit.retreat).fill('Colorless')
  if (!pay(pl, def.players[p].energy, cost)) { s.events.push({ k: 'fizzle', p, why: 'retreat' }); return }
  bringIn(def, s, p, idx, 0)
  pl.swapCd = R.SWAP_COOLDOWN
}

function decay(f: SimState['players'][number]['fighter']): void {
  if (f.dodgeCd > 0) f.dodgeCd--
  if (f.invuln > 0) f.invuln--
  if (f.recovery > 0) f.recovery--
  for (let i = 0; i < f.cooldowns.length; i++) if (f.cooldowns[i] > 0) f.cooldowns[i]--
  if (f.slow && --f.slow.t <= 0) f.slow = null
  if (f.shield && --f.shield.t <= 0) f.shield = null
  if (f.buffs.length) f.buffs = f.buffs.filter((b) => --b.t > 0)
  decayMelee(f)
}

/** 1. inputs, 2. status gates, 3. swap, 4. dodge, 6. attack start */
function intents(def: MatchDef, s: SimState, p: number, inp: InputFrame): void {
  const pl = s.players[p]
  const pressed = inp.buttons & ~pl.prevButtons
  pl.prevButtons = inp.buttons
  if (pl.swapCd > 0) pl.swapCd--
  if (pl.active < 0) {
    // a KO'd Pokémon's replacement: the player's pick, else the next slot when time runs out (free, invulnerable)
    let want = wantedSlot(s, p, pressed)
    if (want < 0 && --pl.replaceT <= 0) want = nextAlive(s, p, -1, 1)
    if (want >= 0) bringIn(def, s, p, want, R.SPAWN_INVULN)
    return
  }
  const f = onField(s, p)
  if (!f) return
  decay(f)
  if (!canAct(f) || f.dash) return
  // the aim locks while an attack winds up: the windup is a telegraph the target can read and dodge. A close attack
  // (melee, dash) keeps following the held aim until it releases (melee.LANDING.track)
  if (f.cast) {
    const k = LANDING.track ? kitOf(def, s, p)?.attacks[f.cast.attack]?.shape.kind : undefined
    if (k === 'melee' || k === 'dash') f.aim = inp.aim & 255
    return
  }
  // flinched (melee.ts): reeling, no aiming, swapping, dodging or attacking until it passes
  if (flinched(f)) return
  f.aim = inp.aim & 255
  // committed to a melee swing (melee.ts): no swap, dodge or new attack until its strikes are out
  if (swinging(s, p)) return
  const slot = wantedSlot(s, p, pressed)
  if (slot >= 0 && pl.swapCd === 0 && !f.dodge) { trySwap(def, s, p, slot); return }
  if (pressed & BTN.EVOLVE && !f.dodge) {
    const opts = evolveOptions(def, s, p)
    const to = opts[(evolveChoice(inp.buttons) || 1) - 1]
    if (to !== undefined) { evolve(def, s, p, to); return }
    s.events.push({ k: 'fizzle', p, why: evolveStatus(def, s, p).reason })
  }
  if (pressed & BTN.DODGE && f.dodgeCd === 0 && !f.dodge) {
    let dx: number = inp.mx, dy: number = inp.my
    let ux: number, uy: number
    if (dx === 0 && dy === 0) { ux = icos(f.aim); uy = isin(f.aim) } else {
      const diag = dx !== 0 && dy !== 0 ? 46341 : ONE
      ux = dx * diag; uy = dy * diag
    }
    // the dodge style (MoveTraits.dodge): blink teleports the whole roll at once; burst is quicker and back sooner;
    // float drifts further but slower; flame and shoulder roll as usual (movement() adds their effect)
    const style = kitOf(def, s, p)?.move?.dodge ?? 'roll'
    const speed = style === 'burst' ? idiv(R.DODGE_SPEED * 4, 3) : style === 'float' ? idiv(R.DODGE_SPEED * 3, 4) : R.DODGE_SPEED
    const ticks = style === 'float' ? idiv(R.DODGE_TICKS * 3, 2) : R.DODGE_TICKS
    f.dodge = { t: ticks, dx: idiv(ux * speed * FP, ONE), dy: idiv(uy * speed * FP, ONE) }
    f.invuln = Math.max(f.invuln, R.DODGE_IFRAMES)
    f.dodgeCd = style === 'burst' ? idiv(R.DODGE_COOLDOWN * 7, 10) : R.DODGE_COOLDOWN
    if (style === 'blink') {
      for (let k = 0; k < ticks; k++) moveFighter(s, p, f.dodge.dx, f.dodge.dy)
      f.dodge = null
    }
    return
  }
  if (f.dodge || f.recovery > 0) return
  for (let i = 0; i < ATTACK_BTNS.length; i++) {
    if (pressed & ATTACK_BTNS[i]) { tryAttack(def, s, p, i); break }
  }
}

/** 5. move + collide */
function movement(def: MatchDef, s: SimState, p: number, inp: InputFrame): void {
  const f = onField(s, p)
  if (!f) return
  const kit = kitOf(def, s, p)!
  f.moving = 0
  // safety net: nothing should leave a body in a wall, but if something did (a tile turned solid, a new effect
  // placing the fighter) it is pushed out before it moves
  unstick(s, f)
  if (f.dash) { advanceDash(def, s, p); return }
  if (f.knock) {
    const x0 = f.x, y0 = f.y
    moveFighter(s, p, f.knock.vx, f.knock.vy)
    // a strong melee knock (melee.ts) that a wall stops short: a splat
    const src = f.knock.src
    if (src !== undefined && src >= 0 && 2 * ilen(f.x - x0, f.y - y0) < ilen(f.knock.vx, f.knock.vy)) splat(def, s, p, src)
    else if (--f.knock.t <= 0) f.knock = null
  }
  if (f.dodge) {
    moveFighter(s, p, f.dodge.dx, f.dodge.dy)
    f.moving = 1
    // a Fire roll leaves flames; a Fighting roll shoulders foes aside
    if (kit.move?.dodge === 'flame') paint(s, f.x, f.y, 20, 'fire', R.TRAIL_TICKS)
    if (kit.move?.dodge === 'shoulder') {
      for (let e = 0; e < s.players.length; e++) {
        const ef = e !== p && s.players[e].team !== s.players[p].team ? onField(s, e) : null
        if (!ef) continue
        const rr = (f.r + ef.r + 6) * FP, dx = ef.x - f.x, dy = ef.y - f.y
        if (dx * dx + dy * dy <= rr * rr && !ef.knock) shove(s, e, f.x, f.y, 90, 8)
      }
    }
    if (--f.dodge.t <= 0) f.dodge = null
    return
  }
  // flinched, or committed to a melee swing (its strikes still to come): no walking
  if (!canAct(f) || flinched(f) || swinging(s, p) || (inp.mx === 0 && inp.my === 0)) return
  let speed = pxPerSec(R.moveSpeedPx(kit.retreat))
  // tile speeds from the movement traits (movement.ts): Water wades fast, Grass runs through tall grass, a hoverer
  // or a flier skims the shallows
  const terrain = terrainSpeedPermille(s, f, hasType(kit, 'Water'))
  if (terrain !== 1000) speed = idiv(speed * terrain, 1000)
  if (f.slow) speed = idiv(speed * (1000 - f.slow.permille), 1000)
  for (const b of f.buffs) if (b.stat === 'speed') speed = idiv(speed * (1000 + b.amount), 1000)
  if (f.cast) speed = idiv(speed * R.WINDUP_MOVE, 1000)
  const diag = inp.mx !== 0 && inp.my !== 0 ? 181 : 256
  moveFighter(s, p, idiv(inp.mx * speed * diag, 256), idiv(inp.my * speed * diag, 256))
  f.moving = 1
}

/** fighters push each other apart. Moves go through the grid (never into a wall, no corner nudges), and whatever
 * one side can't take (it is against a wall) goes to the other side, then back once */
function separate(s: SimState): void {
  for (let i = 0; i < s.players.length; i++) {
    for (let j = i + 1; j < s.players.length; j++) {
      const a = onField(s, i), b = onField(s, j)
      if (!a || !b || a.dash?.air || b.dash?.air) continue // a leaper sails over
      const dx = b.x - a.x, dy = b.y - a.y
      const rr = (a.r + b.r) * FP
      const d2 = dx * dx + dy * dy
      if (d2 >= rr * rr) continue
      const d = Math.max(1, isqrt(d2))
      const full = rr - d + 2
      const ux = d2 === 0 ? FP : dx, uy = d2 === 0 ? 0 : dy
      const L = d2 === 0 ? FP : d
      const vx = idiv(ux * full, L), vy = idiv(uy * full, L)
      const ax0 = a.x, ay0 = a.y
      moveFighter(s, i, -idiv(vx, 2), -idiv(vy, 2), false)
      // b takes the rest of the separation (all of it when a is pinned)
      const bx0 = b.x, by0 = b.y
      const wantBx = vx + (a.x - ax0), wantBy = vy + (a.y - ay0)
      moveFighter(s, j, wantBx, wantBy, false)
      // and what b couldn't take goes back to a
      const leftX = wantBx - (b.x - bx0), leftY = wantBy - (b.y - by0)
      if (leftX || leftY) moveFighter(s, i, -leftX, -leftY, false)
    }
  }
}

/** 7. casts whose windup ended are released */
function casts(def: MatchDef, s: SimState, p: number): void {
  const f = onField(s, p)
  if (!f || !f.cast) return
  if (--f.cast.t > 0) return
  const i = f.cast.attack
  f.cast = null
  const atk = kitOf(def, s, p)?.attacks[i]
  if (!atk) return
  f.recovery = atk.recovery
  release(def, s, p, i)
}

/** 9. terrain on the fighter: electrified water, fire, hazards */
function terrainOnFighter(def: MatchDef, s: SimState, p: number): void {
  const f = onField(s, p)
  if (!f) return
  const kit = kitOf(def, s, p)
  const i = tileIndex(f.x, f.y)
  if (f.terrainTimer > 0) f.terrainTimer--
  // electrified water shocks whoever stands in it or hugs its shore (the circle touches a shocked tile)
  const shocked = !hasType(kit, 'Lightning') && !kit?.move?.hover && circleTouches(s, f.x, f.y, f.r, (j) => s.shock[j] > 0)
  if (shocked && !f.inShock && roll(s, R.SHOCK_PARALYZE_PERMILLE)) applyStatus(s, p, 'paralyzed')
  f.inShock = shocked
  if (s.fire[i] > 0 && !hasType(kit, 'Fire') && f.status.burned === 0) applyStatus(s, p, 'burned')
  if (f.terrainTimer === 0) {
    if (shocked) { hurt(s, p, R.SHOCK_DAMAGE); f.terrainTimer = R.SHOCK_EVERY }
    // `^` lava / hazard: Fire types walk it unharmed; flooded lava is cooled while it stays wet
    else if (s.tiles[i] === TILE.HAZARD && s.wet[i] === 0 && !hasType(kit, 'Fire') && !kit?.move?.hover) { hurt(s, p, R.HAZARD_DAMAGE); f.terrainTimer = R.HAZARD_EVERY }
  }
}

/** 12. KOs (active and bench), the knockouts stat, the winner: a side wins only when every Pokémon on the other
 * side is KO'd (full team elimination, 1v1 and team mode alike; there are no prizes) */
function knockouts(def: MatchDef, s: SimState): void {
  for (let p = 0; p < s.players.length; p++) {
    const pl = s.players[p]
    pl.members.forEach((m, idx) => {
      if (m.ko || m.hp > 0) return
      m.ko = true
      pl.koAt = s.tick
      s.events.push({ k: 'ko', p, member: idx, where: idx === pl.active ? 'active' : 'bench' })
      const taker = s.players.findIndex((o) => o.team !== pl.team)
      if (taker >= 0) {
        s.players[taker].kos++
        s.players[taker].evo = Math.min(R.EVO_MAX, s.players[taker].evo + R.EVO_KO)
      }
      if (idx === pl.active) {
        clearStatus(pl.fighter)
        pl.fighter.cast = null
        pl.active = -1
        pl.replaceT = R.KO_REPLACE_TICKS
        dropShots(s, p)
      }
    })
  }
  const done: number[] = []
  for (let p = 0; p < s.players.length; p++) {
    const pl = s.players[p]
    const out = pl.members.every((m) => m.ko)
    if (out) { const other = s.players.find((o) => o.team !== pl.team); if (other) done.push(other.team) }
  }
  const teams = [...new Set(done)]
  if (teams.length === 1) finish(s, teams[0])
  else if (teams.length > 1) finish(s, 2)
}

function finish(s: SimState, winner: number): void {
  s.fightT = s.phaseT
  s.phase = 'over'
  s.phaseT = 0
  s.winner = winner
}

/** the time cap: more total HP left (as a fraction of the team's max, cross-multiplied), else a draw */
function timeUp(s: SimState): void {
  const [a, b] = s.players
  const hp = (pl: typeof a) => pl.members.reduce((n, m) => n + m.hp, 0)
  const max = (pl: typeof a) => pl.members.reduce((n, m) => n + m.maxHp, 0)
  const l = hp(a) * max(b), r = hp(b) * max(a)
  finish(s, l === r ? 2 : l > r ? a.team : b.team)
}

/** advance one tick. `inputs[p]` is player p's frame for this tick (missing = no input) */
export function step(def: MatchDef, s: SimState, inputs: readonly (InputFrame | undefined)[]): void {
  s.events = []
  if (s.phase === 'countdown') {
    // aim can move during the countdown; nothing else does
    for (let p = 0; p < s.players.length; p++) {
      const inp = inputs[p] ?? NO_INPUT
      s.players[p].fighter.aim = inp.aim & 255
      s.players[p].prevButtons = inp.buttons
    }
    if (--s.phaseT <= 0) { s.phase = 'fight'; s.phaseT = 0 }
    s.tick++
    return
  }
  if (s.phase === 'over') { s.phaseT++; s.tick++; return }

  const n = s.players.length
  for (let p = 0; p < n; p++) intents(def, s, p, inputs[p] ?? NO_INPUT)
  for (let p = 0; p < n; p++) movement(def, s, p, inputs[p] ?? NO_INPUT)
  separate(s)
  for (let p = 0; p < n; p++) casts(def, s, p)
  // melee swings (melee.ts): a swing released this tick gets its first live frame now
  advanceMelee(def, s)
  advanceProjectiles(def, s)
  advanceAreas(def, s)
  for (let p = 0; p < n; p++) { tickStatus(s, p); terrainOnFighter(def, s, p) }
  tickTerrain(def, s)
  for (let p = 0; p < n; p++) {
    const f = onField(s, p)
    if (f) f.facing = f.aim > 64 && f.aim < 192 ? -1 : 1
    fillMeters(s.players[p])
    // the evolve charge also creeps up with time in the fight, so a slot that entered as a Basic of its line (and a
    // low-damage Pokémon) still gets there (rules.EVO_PASSIVE_TICKS)
    const pl = s.players[p]
    if (s.phase === 'fight' && pl.active >= 0 && pl.evo < R.EVO_MAX && s.phaseT % R.EVO_PASSIVE_TICKS === 0) pl.evo++
    // a Pokémon with no damaging attack can't earn its charge by damage at all: it fills faster with time instead
    const k = f ? kitOf(def, s, p) : null
    if (k && s.phaseT % R.EVO_IDLE_EVERY === 0 && k.attacks.every((a) => a.baseDamage <= 0)) pl.evo = Math.min(R.EVO_MAX, pl.evo + 1)
  }
  knockouts(def, s)
  s.phaseT++
  if (s.phase === 'fight' && s.phaseT >= (def.matchTicks ?? R.MATCH_TICKS)) timeUp(s)
  s.tick++
}
