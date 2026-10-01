// DumbBot (M1): keeps a preferred range, strafes, aims (the harness adds the error), fires the biggest attack it can afford that
// reaches, and sometimes dodges incoming shots. Deterministic: its own seeded PRNG, integer math.
import { canPay } from '../sim/energy'
import { onField, kitOf } from '../sim/combat'
import { FP, iatan2, idiv, ilen, wrapAngle } from '../sim/fixed'
import { randInt, roll, seedRng } from '../sim/rng'
import { fighterBlocked } from '../sim/movement'
import { tileAt } from '../sim/terrain'
import { flowField, followField, lineOfSight } from './nav'
import { BTN, type Dir, type InputFrame, type MatchDef, type ResolvedAttack, type Shape } from '../sim/types'
import type { Bot, BotView, Difficulty } from './bot'

const BUTTONS = [BTN.ATTACK1, BTN.ATTACK2, BTN.ATTACK3]
const DIRS: [Dir, Dir][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]

/** how far an attack reaches, in px */
export function reach(sh: Shape): number {
  const n = (k: string) => (typeof sh[k] === 'number' ? (sh[k] as number) : 0)
  switch (sh.kind) {
    case 'projectile': return n('range')
    case 'beam': return n('length')
    case 'cone': return n('range')
    case 'melee': return n('range') + n('lunge')
    case 'area': return sh.at === 'aim' ? (n('range') || 300) + n('radius') : n('radius')
    case 'dash': return n('distance')
    case 'terrain': return (n('range') || 200) + n('radius')
    default: return 140
  }
}

export class DumbBot implements Bot {
  private h = { rng: 1 }
  private held = 0
  private strafe: 1 | -1 = 1
  private closeIn = false
  private dodged: number[] = []
  private field: Int16Array | null = null
  private fieldAt = 0
  constructor(readonly diff: Difficulty) {}

  reset(_def: MatchDef, _player: number, seed: number): void {
    this.h = { rng: seedRng(seed ^ 0x5eed) }
    this.held = 0
    this.dodged = []
    this.field = null
  }

  private press(bit: number): number {
    // a press is an edge: release for a frame between presses
    if (this.held & bit) { this.held = 0; return 0 }
    this.held = bit
    return bit
  }

  think(v: BotView): InputFrame {
    const { state: s, def, me } = v
    const f = onField(s, me)
    if (!f) { const b = this.press(BTN.SWAP_NEXT); return { mx: 0, my: 0, aim: 0, buttons: b } }
    const foe = s.players.findIndex((p, i) => i !== me && p.team !== s.players[me].team && onField(s, i))
    if (foe < 0) return { mx: 0, my: 0, aim: f.aim, buttons: 0 }
    const e = s.players[foe].fighter
    const kit = kitOf(def, s, me)!
    const dx = idiv(e.x - f.x, FP), dy = idiv(e.y - f.y, FP)
    const dist = ilen(dx, dy)

    if (v.tick % 90 === 0) {
      this.closeIn = roll(this.h, this.diff.aggression)
      if (randInt(this.h, 3) === 0) this.strafe = this.strafe > 0 ? -1 : 1
    }
    const aim = iatan2(dy, dx) // the harness adds the aim error

    // preferred range: most of the reach of its longest ranged attack, or melee range
    const reaches = kit.attacks.map((a) => reach(a.shape))
    let pref = Math.max(60, idiv(Math.max(...reaches) * 6, 10))
    if (this.closeIn) pref = Math.max(50, idiv(pref, 2))

    // movement: 8-way. Out of range or out of sight: follow the BFS field toward the foe; in range: keep
    // distance and strafe
    const los = lineOfSight(s, f.x, f.y, e.x, e.y)
    if (!this.field || v.tick - this.fieldAt >= 20) {
      const t = tileAt(e.x, e.y)
      this.field = flowField(s, t.tx, t.ty)
      this.fieldAt = v.tick
    }
    let want: number
    if (!los || dist > pref + 40) want = followField(s, this.field, f.x, f.y) ?? iatan2(dy, dx)
    else if (dist < pref - 40) want = wrapAngle(iatan2(dy, dx) + 128)
    else want = wrapAngle(iatan2(dy, dx) + 64 * this.strafe)
    let sector = Math.round(want / 32) % 8
    for (let k = 0; k < 8; k++) {
      const [mx, my] = DIRS[(sector + k) % 8]
      const probe = 34 * FP
      const d = mx !== 0 && my !== 0 ? 181 : 256
      if (!fighterBlocked(s, f, f.x + idiv(mx * probe * d, 256), f.y + idiv(my * probe * d, 256))) { sector = (sector + k) % 8; break }
      if (k === 1) this.strafe = this.strafe > 0 ? -1 : 1
    }
    let [mx, my] = DIRS[sector]
    let buttons = 0

    // dodge a shot heading at it (decided once per projectile)
    for (const pr of s.projectiles) {
      if (pr.owner === me || this.dodged.includes(pr.id)) continue
      const rx = f.x - pr.x, ry = f.y - pr.y
      const L = ilen(rx, ry)
      if (L > 170 * FP || rx * pr.vx + ry * pr.vy <= 0) continue
      this.dodged.push(pr.id)
      if (this.dodged.length > 32) this.dodged.shift()
      if (f.dodgeCd === 0 && roll(this.h, this.diff.dodgePermille)) {
        const side = wrapAngle(iatan2(pr.vy, pr.vx) + 64 * (randInt(this.h, 2) ? 1 : -1))
        ;[mx, my] = DIRS[Math.round(side / 32) % 8]
        return { mx, my, aim, buttons: this.press(BTN.DODGE) }
      }
    }

    // attack: the most expensive affordable attack that reaches
    const types = def.players[me].energy
    const pl = s.players[me]
    if (!f.cast && f.recovery === 0) {
      const order = kit.attacks.map((a, i) => [a, i] as [ResolvedAttack, number]).sort((a, b) => b[0].cost.length - a[0].cost.length || a[1] - b[1])
      for (const [a, i] of order) {
        if (f.cooldowns[i] > 0 || !canPay(a.cost, types, pl.pips)) continue
        if (a.oncePerMatch && pl.usedOnce.includes(a.oncePerMatch)) continue
        if (reaches[i] + e.r < dist) continue
        if (!los && a.shape.kind !== 'self') continue
        buttons = this.press(BUTTONS[i])
        break
      }
    }
    if (!buttons) this.held = 0
    return { mx, my, aim, buttons }
  }
}
