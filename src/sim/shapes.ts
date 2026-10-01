// Attack shapes: releasing an attack, and advancing projectiles / beams / areas / dashes (docs/SPEC.md section 7).
import { onField, kitOf } from './combat'
import type { CastInfo, EffectCtx } from './effects/define'
import { runEffects } from './effects/registry'
import { FP, ONE, angleDiff, iatan2, icos, idiv, ilen, isin, wrapAngle } from './fixed'
import { roll } from './rng'
import * as R from './rules'
import { moveBody } from './movement'
import { advanceSwings, afterHit, dashBonk, drawnSwing, newSwing, parried, swoopStart, turnVel, type SwingHooks } from './melee'
import { crossesSolid, hitProp, inSight, paint, react, solid, tileAt, TILE_FP, COLS, ROWS } from './terrain'
import type { Effect, MatchDef, Projectile, ResolvedAttack, Shape, SimState } from './types'
import { TILE } from './types'

/** damage an attack does to a breakable prop (Metal's flavour breaks them faster: shape.propDamage permille) */
function propDmg(atk: ResolvedAttack): number {
  return Math.trunc((atk.baseDamage * num(atk.shape, 'propDamage', 1000)) / 1000)
}

function num(sh: Shape, k: string, dflt: number): number {
  const v = sh[k]
  return typeof v === 'number' ? v : dflt
}

export function attackOf(def: MatchDef, s: SimState, p: number, i: number): ResolvedAttack | null {
  const k = kitOf(def, s, p)
  return k?.attacks[i] ?? null
}

export function makeCtx(def: MatchDef, s: SimState, cast: CastInfo, target: number, x: number, y: number): EffectCtx {
  const ctx: EffectCtx = {
    def, s, caster: cast.player, target, x, y, cast,
    run: (list: Effect[] | undefined) => runEffects(ctx, list),
  }
  return ctx
}

/** enemies on the field, in player order */
export function enemies(s: SimState, p: number): number[] {
  const team = s.players[p].team
  const out: number[] = []
  for (let i = 0; i < s.players.length; i++) if (s.players[i].team !== team && onField(s, i)) out.push(i)
  return out
}

function hit(def: MatchDef, s: SimState, cast: CastInfo, target: number, x: number, y: number): void {
  const atk = attackOf(def, s, cast.player, cast.attack) ?? def.kits[0].attacks[0]
  // a counter's parry window blocks the hit (melee.ts: the attacker reels, the counter ripostes)
  if (parried(def, s, cast, target, atk)) return
  const knock0 = s.players[target].fighter.knock
  runEffects(makeCtx(def, s, cast, target, x, y), atk.onHit)
  // the melee style's extras (flinch, interrupt, a sideways sweep, the splat mark, a backstab)
  if (atk.shape.style) afterHit(def, s, cast, target, atk, knock0)
}

/** a melee finisher's swing reaching the ground (melee.ts calls it on the finisher's first live tick): props in the
 * arc, element reactions along it, the impact at its tip; a Fire swing scorches past its tip */
function landSwing(def: MatchDef, s: SimState, cast: CastInfo, atk: ResolvedAttack, w: { x: number; y: number; aim: number; range: number; arc: number; owner: number }): void {
  const f = s.players[w.owner].fighter
  const range = w.range, arc = w.arc, aim = w.aim
  const along = (px: number) => ({ x: f.x + idiv(icos(aim) * px * FP, ONE), y: f.y + idiv(isin(aim) * px * FP, ONE) })
  const t0 = tileAt(f.x - range * FP, f.y - range * FP), t1 = tileAt(f.x + range * FP, f.y + range * FP)
  for (let ty = Math.max(0, t0.ty); ty <= Math.min(ROWS - 1, t1.ty); ty++) {
    for (let tx = Math.max(0, t0.tx); tx <= Math.min(COLS - 1, t1.tx); tx++) {
      if (s.tiles[ty * COLS + tx] !== TILE.PROP) continue
      if (inCone(f.x, f.y, aim, range, arc, tx * TILE_FP + TILE_FP / 2, ty * TILE_FP + TILE_FP / 2, 20)) hitProp(def, s, tx, ty, propDmg(atk))
    }
  }
  for (let d = 40; d < range; d += 40) { const pt = along(d); react(s, cast.element, pt.x, pt.y, 30) }
  const tip = along(idiv(range * 2, 3))
  impact(def, s, cast, atk, tip.x, tip.y, idiv(range, 3))
  // Fire melee (melee.ts): a burning arc at the tip, never under the swinger's feet
  if (atk.shape.burnarc) { const b = along(Math.max(range, f.r + 44)); paint(s, b.x, b.y, 22, 'fire', R.TRAIL_TICKS) }
}

const HOOKS: SwingHooks = {
  hit, land: landSwing, attackOf, enemies,
  move: (s, p, dx, dy) => moveFighter(s, p, dx, dy),
}

/** advance every swing a tick (melee.ts: live hitboxes, strings, holds, throws, parries) */
export function advanceMelee(def: MatchDef, s: SimState): void {
  advanceSwings(def, s, HOOKS)
}

/** where a shape ends: the element reaction there, then onImpact */
function impact(def: MatchDef, s: SimState, cast: CastInfo, atk: ResolvedAttack, x: number, y: number, rPx: number): void {
  s.events.push({ k: 'impact', x, y, element: cast.element, p: cast.player, a: cast.attack })
  react(s, cast.element, x, y, rPx)
  runEffects(makeCtx(def, s, cast, -1, x, y), atk.onImpact)
}

/** march from (x, y) along angle for up to lenPx, stopping at the first solid tile. Returns the end point and the tile hit */
function march(s: SimState, x: number, y: number, aim: number, lenPx: number): { x: number; y: number; tx: number; ty: number; blocked: boolean } {
  const step = 8
  let cx = x, cy = y
  let at = tileAt(x, y)
  for (let d = step; d <= lenPx; d += step) {
    const nx = x + idiv(icos(aim) * d * FP, ONE), ny = y + idiv(isin(aim) * d * FP, ONE)
    const t = tileAt(nx, ny)
    // a wall, or the corner seam of two walls touching diagonally (terrain.crossesSolid)
    if (crossesSolid(s, at.tx, at.ty, t.tx, t.ty)) return { x: cx, y: cy, tx: t.tx, ty: t.ty, blocked: true }
    cx = nx; cy = ny; at = t
  }
  return { x: cx, y: cy, tx: -1, ty: -1, blocked: false }
}

/** is the point within a cone (range px, arc binary degrees) from (x, y) facing aim; `pad` px widens the range */
function inCone(x: number, y: number, aim: number, rangePx: number, arc: number, px: number, py: number, padPx: number): boolean {
  const dx = px - x, dy = py - y
  const L = ilen(dx, dy)
  if (L > (rangePx + padPx) * FP) return false
  if (L <= padPx * FP) return true
  const dot = dx * icos(aim) + dy * isin(aim)
  return dot >= L * icos(idiv(arc, 2))
}

/** distance from point c to the segment p0-p1 (all sub-pixels) */
function segDist(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number): number {
  const dx = x1 - x0, dy = y1 - y0
  const wx = cx - x0, wy = cy - y0
  const L2 = dx * dx + dy * dy
  const t = wx * dx + wy * dy
  if (L2 === 0 || t <= 0) return ilen(wx, wy)
  if (t >= L2) return ilen(cx - x1, cy - y1)
  return idiv(Math.abs(wx * dy - wy * dx), ilen(dx, dy))
}

/** move a fighter by (dx, dy) sub-pixels with wall sliding, in steps of at most 4 px */
/** move player p's fighter by (dx, dy) sub-pixels against the grid (movement.ts: body circle, wall sliding,
 * corner nudging; `nudgeCorners` false for the fighter push-apart) */
export function moveFighter(s: SimState, p: number, dx: number, dy: number, nudgeCorners = true): void {
  moveBody(s, s.players[p].fighter, dx, dy, nudgeCorners)
}

// ------------------------------------------------------------------ release
export function release(def: MatchDef, s: SimState, p: number, ai: number): void {
  const pl = s.players[p]
  const f = pl.fighter
  const atk = attackOf(def, s, p, ai)
  if (!atk) return
  const cast: CastInfo = { player: p, attack: ai, element: atk.element, bonus: 0 }
  // blinded (Smokescreen, Sand-Attack: the `blind` op): the attack may miss outright
  const blind = f.buffs.find((b) => b.stat === 'blind')
  if (blind && roll(s, blind.amount)) { s.events.push({ k: 'fizzle', p, why: 'blinded' }); return }
  runEffects(makeCtx(def, s, cast, -1, f.x, f.y), atk.onCast)
  if (!onField(s, p)) return // self damage KO'd the caster
  if (cast.fizzle) { s.events.push({ k: 'fizzle', p, why: 'the attack did nothing' }); return }
  const sh = atk.shape
  const aim = f.aim
  const dirx = icos(aim), diry = isin(aim)
  const along = (px: number) => ({ x: f.x + idiv(dirx * px * FP, ONE), y: f.y + idiv(diry * px * FP, ONE) })

  switch (sh.kind) {
    case 'projectile': {
      const count = Math.max(1, num(sh, 'count', 1))
      const spread = num(sh, 'spread', 0)
      const r = num(sh, 'radius', 10)
      const speed = num(sh, 'speed', 12)
      const grp = count > 1 ? s.nextId : 0
      for (let k = 0; k < count; k++) {
        const a = wrapAngle(aim + k * spread - idiv((count - 1) * spread, 2))
        let start = { x: f.x + idiv(icos(a) * (f.r + r) * FP, ONE), y: f.y + idiv(isin(a) * (f.r + r) * FP, ONE) }
        // a big shot from a caster hugging a wall would start past it: it starts on the caster's side (and breaks on
        // the wall). A phase shot starts where it likes
        if (sh.path !== 'phase' && !inSight(s, f.x, f.y, start.x, start.y)) { const m = march(s, f.x, f.y, a, f.r + r); start = { x: m.x, y: m.y } }
        s.projectiles.push({
          id: s.nextId++, owner: p, attack: ai, x: start.x, y: start.y, ...(grp ? { grp } : {}),
          vx: idiv(icos(a) * speed * FP, ONE), vy: idiv(isin(a) * speed * FP, ONE), r,
          left: num(sh, 'range', 600) * FP, pierce: num(sh, 'pierce', 0), homing: num(sh, 'homing', 0),
          bonus: cast.bonus, hit: [], age: 0, base: a, back: sh.path === 'bounce' ? num(sh, 'bounces', 2) : 0,
          // a braid (path "helix"): the volley's shots weave around the aim line, each a turn of the phase apart
          ...(sh.path === 'helix' ? { ph: idiv(k * 256, count) } : {}),
        })
      }
      break
    }
    case 'beam': {
      const len = num(sh, 'length', 500), w = num(sh, 'width', 20)
      const end = march(s, f.x, f.y, aim, len)
      if (end.blocked) hitProp(def, s, end.tx, end.ty, propDmg(atk))
      for (const e of enemies(s, p)) {
        const ef = s.players[e].fighter
        if (ef.invuln > 0) continue
        if (segDist(f.x, f.y, end.x, end.y, ef.x, ef.y) <= (idiv(w, 2) + ef.r) * FP) hit(def, s, cast, e, ef.x, ef.y)
      }
      // a beam reacts along its whole length (a Thunderbolt across a pond electrifies it)
      const L = idiv(ilen(end.x - f.x, end.y - f.y), FP)
      for (let d = 40; d < L; d += 40) {
        const pt = along(d)
        react(s, cast.element, pt.x, pt.y, idiv(w, 2))
      }
      impact(def, s, cast, atk, end.x, end.y, Math.max(30, w))
      s.beams.push({ id: s.nextId++, owner: p, attack: ai, x1: f.x, y1: f.y, x2: end.x, y2: end.y, w, t: num(sh, 'ticks', 8) })
      break
    }
    case 'melee': {
      // a live swing (melee.ts): it hits over its active frames, from the step-in, in strikes; advanceMelee runs its
      // first live tick this same tick
      s.swings.push(newSwing(s, p, ai, atk, cast.bonus, enemies(s, p)))
      break
    }
    case 'cone': {
      const lunge = num(sh, 'lunge', 0)
      if (lunge > 0) moveFighter(s, p, idiv(dirx * lunge * FP, ONE), idiv(diry * lunge * FP, ONE))
      const range = num(sh, 'range', 160)
      const arc = num(sh, 'arc', 64)
      for (const e of enemies(s, p)) {
        const ef = s.players[e].fighter
        if (ef.invuln > 0) continue
        if (inCone(f.x, f.y, aim, range, arc, ef.x, ef.y, ef.r)) hit(def, s, cast, e, ef.x, ef.y)
      }
      // props inside the swing
      const t0 = tileAt(f.x - range * FP, f.y - range * FP), t1 = tileAt(f.x + range * FP, f.y + range * FP)
      for (let ty = Math.max(0, t0.ty); ty <= Math.min(ROWS - 1, t1.ty); ty++) {
        for (let tx = Math.max(0, t0.tx); tx <= Math.min(COLS - 1, t1.tx); tx++) {
          if (s.tiles[ty * COLS + tx] !== TILE.PROP) continue
          if (inCone(f.x, f.y, aim, range, arc, tx * TILE_FP + TILE_FP / 2, ty * TILE_FP + TILE_FP / 2, 20)) hitProp(def, s, tx, ty, propDmg(atk))
        }
      }
      for (let d = 40; d < range; d += 40) { const pt = along(d); react(s, cast.element, pt.x, pt.y, 30) }
      const tip = along(idiv(range * 2, 3))
      impact(def, s, cast, atk, tip.x, tip.y, idiv(range, 3))
      s.swings.push(drawnSwing(s, p, ai, f.x, f.y, aim, range, arc))
      break
    }
    case 'area':
    case 'terrain': {
      const r = num(sh, 'radius', 80)
      // `count` > 1 on the aim (a Rock Slide): a line of impacts ending at the aim point, landing one after another
      // (`stagger` ticks apart), spaced so one fighter is never under two at once
      const count = sh.kind === 'area' && sh.at === 'aim' ? Math.max(1, Math.min(5, num(sh, 'count', 1))) : 1
      // `scatter` px: the impacts land around the aim point instead (a hailstorm, a meteor shower): the first on it, the
      // rest on a ring that far out, evenly spaced from the aim's side (a wall there: on the aim point); never nearer
      // than a line's spacing, so one fighter is never under two
      const scatter = count > 1 && num(sh, 'scatter', 0) > 0 ? Math.max(num(sh, 'scatter', 0), 2 * (r + 24)) : 0
      const hub = scatter > 0 ? march(s, f.x, f.y, aim, Math.max(r, num(sh, 'range', 300))) : null
      for (let i = 0; i < count; i++) {
        let at = { x: f.x, y: f.y }
        if (hub) {
          at = { x: hub.x, y: hub.y }
          if (i > 0) {
            const a2 = wrapAngle(aim + 64 + idiv((i - 1) * 256, count - 1))
            const px = hub.x + idiv(icos(a2) * scatter * FP, ONE), py = hub.y + idiv(isin(a2) * scatter * FP, ONE)
            const t = tileAt(px, py)
            if (!solid(s, t.tx, t.ty)) at = { x: px, y: py }
          }
        } else if (sh.at === 'aim') { const m = march(s, f.x, f.y, aim, Math.max(r, num(sh, 'range', 300) - (count - 1 - i) * 2 * (r + 24))); at = { x: m.x, y: m.y } }
        if (sh.kind === 'terrain') { impact(def, s, cast, atk, at.x, at.y, r); break }
        const ticks = Math.max(1, num(sh, 'ticks', 1))
        // an area on the aim point lands after a telegraph (it shows first, then hits): you can step out of it
        const delay = Math.max(0, num(sh, 'delay', sh.at === 'aim' ? R.AREA_TELEGRAPH : 0)) + i * num(sh, 'stagger', 8)
        // a drifting hazard (Storm, Rain, a Surf wave) moves along the aim at `drift` px per tick
        const drift = sh.path === 'drift' ? num(sh, 'drift', 2) : 0
        const area = {
          id: s.nextId++, owner: p, attack: ai, x: at.x, y: at.y, r, t: ticks + delay + 12, every: Math.max(1, num(sh, 'every', 30)), next: delay, bonus: cast.bonus,
          vx: idiv(dirx * drift * FP, ONE), vy: idiv(diry * drift * FP, ONE), land: delay,
        }
        s.areas.push(area)
        impact(def, s, cast, atk, at.x, at.y, r)
      }
      break
    }
    case 'self': {
      impact(def, s, cast, atk, f.x, f.y, f.r)
      break
    }
    case 'dash': {
      const dist = num(sh, 'distance', 200), speed = num(sh, 'speed', 16)
      const t = Math.max(1, idiv(dist, speed))
      // a swoop (melee.ts) curves: it sets off turned half its total turn the other way
      const turn = sh.path === 'leap' ? 0 : num(sh, 'turn', 0)
      const h = turn ? swoopStart(aim, turn, t) : aim
      f.dash = { attack: ai, t, vx: idiv(icos(h) * speed * FP, ONE), vy: idiv(isin(h) * speed * FP, ONE), hit: [], bonus: cast.bonus, ...(sh.path === 'leap' ? { air: 1, t0: t } : {}), ...(turn ? { turn } : {}) }
      if (sh.invulnerable !== 0) f.invuln = Math.max(f.invuln, t)
      break
    }
    case 'summon':
    default:
      s.events.push({ k: 'fizzle', p, why: `shape ${sh.kind} is not implemented yet` })
  }
}

// ------------------------------------------------------------------ advance
function castOf(def: MatchDef, s: SimState, owner: number, attack: number, bonus: number, scale?: number): CastInfo {
  const atk = attackOf(def, s, owner, attack)
  return { player: owner, attack, element: atk?.element ?? 'Colorless', bonus, ...(scale !== undefined ? { scale } : {}) }
}

/** a shot splitting where it ends (shape.split, docs/MOVES.md "Signature moves": Power Gem refracting into shards, a
 * firework's ring of sparks): `split` shards from (x, y), fanned `splitSpread` binary degrees apart around its heading
 * (0: a ring all round), `splitSpeed` px a tick for `splitRange` px, radius `splitR`, each hitting for `splitPower`
 * permille. Off a wall they fan back the way it came. They never hit what the shot already hit */
function splinter(s: SimState, pr: Projectile, sh: Shape, x: number, y: number, wall: boolean): void {
  const n = Math.max(1, Math.min(8, num(sh, 'split', 0)))
  const spread = num(sh, 'splitSpread', 0), speed = num(sh, 'splitSpeed', 12), r = num(sh, 'splitR', Math.max(4, idiv(pr.r, 2)))
  const head = wrapAngle((sh.path === 'lob' ? pr.base : iatan2(pr.vy, pr.vx)) + (wall ? 128 : 0))
  const grp = s.nextId
  for (let k = 0; k < n; k++) {
    const a = wrapAngle(spread > 0 ? head + k * spread - idiv((n - 1) * spread, 2) : head + idiv(k * 256, n))
    s.projectiles.push({
      id: s.nextId++, owner: pr.owner, attack: pr.attack, x, y, vx: idiv(icos(a) * speed * FP, ONE), vy: idiv(isin(a) * speed * FP, ONE), r,
      left: num(sh, 'splitRange', 140) * FP, pierce: 0, homing: 0, bonus: pr.bonus, hit: pr.hit.slice(), age: 0, base: a, back: 0,
      ...(n > 1 ? { grp } : {}), kid: 1, pw: num(sh, 'splitPower', 500),
    })
  }
}

/** a shot that sticks where it ends and bursts `fuse` ticks later (shape.fuse: a seed bomb sprouting, a ticking
 * curse): an area of the shot's attack, `blast` px (else 3x its radius), that hits once when the fuse runs out */
function stick(s: SimState, pr: Projectile, sh: Shape, x: number, y: number, on = -1): void {
  const fuse = num(sh, 'fuse', 0)
  s.areas.push({
    id: s.nextId++, owner: pr.owner, attack: pr.attack, x, y, r: num(sh, 'blast', Math.max(40, pr.r * 3)), t: fuse + 13, every: 9999, next: fuse, bonus: pr.bonus, vx: 0, vy: 0, land: fuse,
    // its burst hits only what it can see (a walled-off foe is safe); a phase shot's burst goes through walls
    ...(sh.path !== 'phase' ? { sight: 1 } : {}),
    // `stick`: it clings to the foe it touched and rides along (a dodge's i-frames at the burst still beat it)
    ...(on >= 0 && num(sh, 'stick', 0) > 0 ? { on } : {}),
  })
}

/** the trajectory paths (shape.path, docs/KITS.md "Trajectories"): what a shot does after release. The aim is the
 * player's own; the path is the move's. Every path is integer math on the projectile's state */
export const PATHS = ['straight', 'lob', 'boomerang', 'zigzag', 'weave', 'spiral', 'bounce', 'phase', 'drift', 'leap', 'helix'] as const

/** set a projectile's heading, keeping its speed */
function steer(pr: Projectile, angle: number): void {
  const v = ilen(pr.vx, pr.vy)
  pr.vx = idiv(icos(angle) * v, ONE); pr.vy = idiv(isin(angle) * v, ONE)
}

/** every enemy within `rPx` of a point takes the hit (a lob's landing burst, a detonating shot); `skip`: already hit.
 * A shot's burst (`pr`) marks what it hit on the shot and its volley, so a volley of bursting shots hits a foe once.
 * It never reaches through a wall: a foe the burst's centre can't see is safe (`thru`: a phase shot's burst) */
function burst(def: MatchDef, s: SimState, cast: CastInfo, owner: number, x: number, y: number, rPx: number, skip: readonly number[] = [], pr?: Projectile, thru = false): void {
  for (const e of enemies(s, owner)) {
    const ef = s.players[e].fighter
    if (ef.invuln > 0 || skip.includes(e) || pr?.hit.includes(e)) continue
    const rr = (rPx + ef.r) * FP
    const dx = ef.x - x, dy = ef.y - y
    if (dx * dx + dy * dy > rr * rr) continue
    if (!thru && !inSight(s, x, y, ef.x, ef.y)) continue
    if (pr) {
      pr.hit.push(e)
      if (pr.grp) for (const o of s.projectiles) if (o.grp === pr.grp && o !== pr && !o.hit.includes(e)) o.hit.push(e)
    }
    hit(def, s, cast, e, ef.x, ef.y)
  }
}

/** is a fighter at (x, y), radius r (sub-px), inside a shot? A wall shot (shape.wall: a wave, a ripple) is a band
 * `wall` px either side of its centre, across its heading, `pr.r` px deep: a capsule, not a circle */
function shotTouches(pr: Projectile, wallPx: number, x: number, y: number, r: number): boolean {
  const rr = pr.r * FP + r
  if (wallPx <= 0) {
    const dx = x - pr.x, dy = y - pr.y
    return dx * dx + dy * dy <= rr * rr
  }
  const sp = Math.max(1, ilen(pr.vx, pr.vy))
  const ux = idiv(-pr.vy * wallPx * FP, sp), uy = idiv(pr.vx * wallPx * FP, sp)
  return segDist(pr.x - ux, pr.y - uy, pr.x + ux, pr.y + uy, x, y) <= rr
}

export function advanceProjectiles(def: MatchDef, s: SimState): void {
  const keep = []
  for (const pr of s.projectiles) {
    const atk = attackOf(def, s, pr.owner, pr.attack)
    if (!atk) continue // its owner swapped out or was KO'd: the shot fizzles
    const cast = castOf(def, s, pr.owner, pr.attack, pr.bonus, pr.pw)
    const sh = atk.shape
    // a shard of a split shot flies straight and plain
    const kid = !!pr.kid
    const path = kid ? 'straight' : (sh.path as string | undefined) ?? 'straight'
    const fuse = kid ? 0 : num(sh, 'fuse', 0)
    // where a shot ends (a foe, a wall, its range): its impact effects, and a `blast` (Shadow Ball, Fire Blast)
    // detonates on everyone else near that point too; a fused shot sticks there instead, a splitting one shatters
    const land = (x: number, y: number, wall = false, on = -1) => {
      if (fuse > 0) { stick(s, pr, sh, x, y, on); impact(def, s, cast, atk, x, y, Math.max(30, pr.r)); return }
      const blast = kid ? 0 : num(sh, 'blast', 0)
      if (blast > 0) burst(def, s, cast, pr.owner, x, y, blast, [], pr, path === 'phase')
      impact(def, s, cast, atk, x, y, Math.max(kid ? 12 : 30, pr.r, blast))
      if (!kid && num(sh, 'split', 0) > 0) splinter(s, pr, sh, x, y, wall)
    }
    const age = pr.age++
    const wallPx = path === 'lob' || kid ? 0 : num(sh, 'wall', 0)
    // a shot that swells as it flies (shape.grow: px per 10 ticks, up to growMax more)
    if (!kid && num(sh, 'grow', 0) > 0) pr.r = num(sh, 'radius', 10) + Math.min(num(sh, 'growMax', 8), idiv(age * num(sh, 'grow', 0), 10))
    // Psychic flavour: gentle homing toward the nearest foe, at most `homing` binary degrees of turn per tick. The
    // shot still leaves where it was aimed; a sidestep beats the turn rate
    if (pr.homing > 0) {
      let best = -1, bestD = 0
      for (const e of enemies(s, pr.owner)) {
        const ef = s.players[e].fighter
        const d = ilen(ef.x - pr.x, ef.y - pr.y)
        if (best < 0 || d < bestD) { best = e; bestD = d }
      }
      if (best >= 0) {
        const ef = s.players[best].fighter
        const cur = iatan2(pr.vy, pr.vx), want = iatan2(ef.y - pr.y, ef.x - pr.x)
        steer(pr, cur + Math.max(-pr.homing, Math.min(pr.homing, angleDiff(cur, want))))
      }
    }
    // the path's steering
    const amp = num(sh, 'amp', 20), period = Math.max(2, num(sh, 'period', 10))
    if (path === 'zigzag') steer(pr, pr.base + (Math.trunc(age / period) % 2 === 0 ? amp : -amp))
    else if (path === 'weave') steer(pr, pr.base + idiv(isin(idiv(age * 256, period * 2)) * amp, ONE))
    // a braid: a weave a quarter turn on (so each shot swings evenly about the aim line), offset by the shot's phase
    else if (path === 'helix') steer(pr, pr.base + idiv(isin(idiv(age * 256, period * 2) + 64 + (pr.ph ?? 0)) * amp, ONE))
    // a corkscrew: a wobble around the aim line that widens over the first ~0.4 s
    else if (path === 'spiral') steer(pr, pr.base + idiv(idiv(isin(idiv(age * 256, period)) * amp, ONE) * Math.min(age, 24), 24))
    else if (path === 'boomerang') {
      const range = num(sh, 'range', 600) * FP
      const owner = onField(s, pr.owner)
      if (pr.back === 0 && pr.left <= idiv(range, 2)) { pr.back = 1; pr.hit = [] } // turns back; can hit again
      if (pr.back === 1 && owner) {
        steer(pr, iatan2(owner.y - pr.y, owner.x - pr.x))
        if (ilen(owner.x - pr.x, owner.y - pr.y) <= (owner.r + pr.r) * FP) { impact(def, s, cast, atk, pr.x, pr.y, Math.max(30, pr.r)); continue } // caught
        pr.left = Math.max(pr.left, FP) // it flies home however far
      }
    }
    // Fire flavour: the shot leaves a short burning trail
    if (sh.trail && !kid) paint(s, pr.x, pr.y, 18, 'fire', R.TRAIL_TICKS)
    const sp = ilen(pr.vx, pr.vy)
    const n = Math.max(1, Math.ceil(sp / (Math.max(4, pr.r) * FP)))
    let alive = true
    for (let i = 0; i < n && alive; i++) {
      const px0 = pr.x, py0 = pr.y
      pr.x += idiv(pr.vx, n); pr.y += idiv(pr.vy, n)
      pr.left -= idiv(sp, n)
      // a lob flies over walls, props and fighters on the way up, and bursts where it lands: at the end of its range,
      // or on the first foe under it once it has arced R.LOB_RISE px (so a close foe can still be lobbed on)
      if (path === 'lob') {
        const down = num(sh, 'range', 600) * FP - pr.left >= Math.min(R.LOB_RISE, idiv(num(sh, 'range', 600), 2)) * FP
        const under = down && enemies(s, pr.owner).some((e) => {
          const ef = s.players[e].fighter
          const rr = (pr.r + ef.r) * FP
          return ef.invuln === 0 && (ef.x - pr.x) ** 2 + (ef.y - pr.y) ** 2 <= rr * rr
        })
        if (pr.left <= 0 || under) {
          if (fuse > 0) { stick(s, pr, sh, pr.x, pr.y); impact(def, s, cast, atk, pr.x, pr.y, num(sh, 'blast', 60)); alive = false; continue }
          burst(def, s, cast, pr.owner, pr.x, pr.y, num(sh, 'blast', 60), [], pr)
          impact(def, s, cast, atk, pr.x, pr.y, num(sh, 'blast', 60))
          if (num(sh, 'split', 0) > 0) splinter(s, pr, sh, pr.x, pr.y, false)
          alive = false
        }
        continue
      }
      const t = tileAt(pr.x, pr.y), t0 = tileAt(px0, py0)
      // a wall or prop stops every shot but a phase one, and so does the corner seam of two walls (terrain.crossesSolid)
      if (path !== 'phase' && crossesSolid(s, t0.tx, t0.ty, t.tx, t.ty)) {
        if (path === 'bounce' && pr.back > 0) {
          hitProp(def, s, t.tx, t.ty, propDmg(atk))
          // reflect off the wall: flip the axis that crossed into it
          pr.back--
          const tx0 = tileAt(px0, pr.y), ty0 = tileAt(pr.x, py0)
          if (solid(s, tx0.tx, tx0.ty)) pr.vy = -pr.vy
          if (solid(s, ty0.tx, ty0.ty) || !solid(s, tx0.tx, tx0.ty)) pr.vx = -pr.vx
          pr.x = px0; pr.y = py0
          pr.base = iatan2(pr.vy, pr.vx)
          break
        }
        // the shot lands (its blast, its shards) against the prop still standing, then breaks it: a blast never
        // reaches a foe hiding behind the prop it broke
        land(px0, py0, true)
        hitProp(def, s, t.tx, t.ty, propDmg(atk))
        alive = false
        break
      }
      for (const e of enemies(s, pr.owner)) {
        if (pr.hit.includes(e)) continue
        const ef = s.players[e].fighter
        if (ef.invuln > 0) continue
        if (!shotTouches(pr, wallPx, ef.x, ef.y, ef.r * FP)) continue
        // a big (or grown) shot or a wave's band overlapping a wall doesn't reach a foe behind it: the foe must be in
        // sight of the shot's centre (a phase shot reaches through)
        if (path !== 'phase' && !inSight(s, pr.x, pr.y, ef.x, ef.y)) continue
        // a fused shot sticks where it touches the foe and bursts later (the foe can still step out)
        if (fuse > 0) { land(pr.x, pr.y, false, e); alive = false; break }
        pr.hit.push(e)
        // a volley is one attack: its other shots won't hit this target again
        if (pr.grp) for (const o of s.projectiles) if (o.grp === pr.grp && o !== pr && !o.hit.includes(e)) o.hit.push(e)
        hit(def, s, cast, e, pr.x, pr.y)
        if (path !== 'boomerang' && pr.pierce-- <= 0) {
          land(pr.x, pr.y)
          alive = false
          break
        }
      }
      if (alive && pr.left <= 0) {
        land(pr.x, pr.y)
        alive = false
      }
    }
    if (alive) keep.push(pr)
  }
  s.projectiles = keep
}

export function advanceAreas(def: MatchDef, s: SimState): void {
  const keep = []
  for (const a of s.areas) {
    a.t--
    // render-only: the moment a telegraphed area (or a fused shot) lands, for its look's flourish
    if (a.land-- === 1) s.events.push({ k: 'landed', x: a.x, y: a.y, p: a.owner, a: a.attack })
    // a fused shot stuck to a fighter rides along with it (while that fighter is on the field)
    if (a.on !== undefined) { const f = onField(s, a.on); if (f) { a.x = f.x; a.y = f.y } }
    // a drifting hazard moves on, and stops at a wall
    else if (a.vx || a.vy) {
      const nt = tileAt(a.x + a.vx, a.y + a.vy)
      if (solid(s, nt.tx, nt.ty)) { a.vx = 0; a.vy = 0 } else { a.x += a.vx; a.y += a.vy }
    }
    const atk = attackOf(def, s, a.owner, a.attack)
    if (atk && a.t >= 12 && --a.next <= 0) {
      a.next = a.every
      const cast = castOf(def, s, a.owner, a.attack, a.bonus)
      for (const e of enemies(s, a.owner)) {
        const ef = s.players[e].fighter
        if (ef.invuln > 0) continue
        const rr = (a.r + ef.r) * FP
        const dx = ef.x - a.x, dy = ef.y - a.y
        if (dx * dx + dy * dy > rr * rr) continue
        // a shot's fused burst never reaches through a wall (stick)
        if (a.sight && !inSight(s, a.x, a.y, ef.x, ef.y)) continue
        hit(def, s, cast, e, ef.x, ef.y)
      }
    }
    if (a.t > 0) keep.push(a)
  }
  s.areas = keep
  s.beams = s.beams.filter((b) => --b.t > 0)
}

/** a dashing fighter: move, hit what it passes through once, impact at the end */
export function advanceDash(def: MatchDef, s: SimState, p: number): void {
  const f = s.players[p].fighter
  const d = f.dash
  if (!d) return
  const atk = attackOf(def, s, p, d.attack)
  if (!atk) { f.dash = null; return }
  if (d.turn) turnVel(d, d.turn) // a swoop's curve
  moveFighter(s, p, d.vx, d.vy)
  const cast = castOf(def, s, p, d.attack, d.bonus ?? 0) // the on-cast bonuses (energy, coins) ride along
  const rad = num(atk.shape, 'radius', f.r)
  // a leap (Dig, Fly, Bounce): out of reach on the way (the dash is invulnerable), then it strikes where it lands
  if (atk.shape.path === 'leap') {
    // a slam, a stomp or a burrow (melee.ts) comes down on the first foe it passes over once it has flown a third
    // of the way (like a lob): it lands where the foe is, not past it. A flier (Fly, Bounce) sails on and dives at
    // the end
    const blast = num(atk.shape, 'blast', rad + 30)
    const st = atk.shape.style
    const early = (st === 'slam' || st === 'stomp' || st === 'burrow') && !!d.t0 && (d.t0 - d.t) * 3 >= d.t0 && enemies(s, p).some((e) => {
      const ef = s.players[e].fighter
      const rr = (idiv(blast, 2) + ef.r) * FP
      return ef.invuln === 0 && (ef.x - f.x) ** 2 + (ef.y - f.y) ** 2 <= rr * rr
    })
    if (--d.t <= 0 || early) {
      if (early && atk.shape.invulnerable !== 0) f.invuln = Math.max(0, f.invuln - d.t)
      f.dash = null
      burst(def, s, cast, p, f.x, f.y, blast)
      impact(def, s, cast, atk, f.x, f.y, rad)
    }
    return
  }
  for (const e of enemies(s, p)) {
    if (d.hit.includes(e)) continue
    const ef = s.players[e].fighter
    if (ef.invuln > 0) continue
    const rr = (rad + ef.r) * FP
    const dx = ef.x - f.x, dy = ef.y - f.y
    if (dx * dx + dy * dy <= rr * rr) {
      d.hit.push(e)
      hit(def, s, cast, e, ef.x, ef.y)
      // a parry stopped it dead (melee.parried)
      if (!f.dash) return
      // a body blow (melee.ts: tackle, headbutt) stops on the foe and bounces back off it
      if (atk.shape.bonk) { dashBonk(s, p, ef.x, ef.y); impact(def, s, cast, atk, f.x, f.y, rad); return }
    }
  }
  if (--d.t <= 0) {
    f.dash = null
    impact(def, s, cast, atk, f.x, f.y, rad)
  }
}
