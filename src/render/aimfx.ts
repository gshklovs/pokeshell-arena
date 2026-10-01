// The aim info on the canvas (src/game/aiminfo.ts says what): a slim strip at the top, under the timer, with how the
// held move behaves; small badges by each Pokémon it would touch (conditions, forces, buffs, heals, recoil, energy);
// marks on the team row for bench hits and forced swaps. Dark plates like the cyan prediction chip, small type, and a
// fade in when aiming starts and out on release or cancel (stepAimFade). Render-only.
import { chanceLabel, type AimBadge, type AimInfo, type BenchMark, type ChipTone } from '../game/aiminfo'
import type { SimState } from '../sim/types'
import { FONT, PRINTED, fighterUnder, teamRowSlot, type HudRect } from './hud'
import { FONT_PIX } from '../theme'
import { TYPE_COLOR, hexA } from './sprites'

const W = 1920
/** the strip's room: under the timer, between the two trainer cards (design px) */
export const STRIP: HudRect = { x: 556, y: 118, w: 808, h: 62 }
const PLATE = 'rgba(4,14,22,0.84)'
const CHIP_H = 22, ROW_GAP = 4, PAD = 6, GAP = 6
const TONE: Record<ChipTone, { ink: string; edge: string }> = {
  move: { ink: '#d8ecf5', edge: 'rgba(216,236,245,0.22)' },
  bonus: { ink: PRINTED, edge: 'rgba(255,226,138,0.5)' },
  good: { ink: '#9ff0a8', edge: 'rgba(159,240,168,0.45)' },
  warn: { ink: '#ffb4a8', edge: 'rgba(255,180,168,0.5)' },
}

/** one frame of the fade toward shown (on) or hidden, 0..1 */
export function stepAimFade(cur: number, on: boolean): number {
  return on ? Math.min(1, cur + 0.2) : Math.max(0, cur - 0.25)
}

/** where the strip's chips go: rows inside STRIP's width (at most two; what doesn't fit is dropped) */
export function layoutStrip(widths: number[], label: number, maxW = STRIP.w - 2 * PAD, maxRows = 2): { x: number; row: number }[] {
  const out: { x: number; row: number }[] = []
  let x = label > 0 ? label + GAP : 0, row = 0
  for (const w of widths) {
    if (x > 0 && x + w > maxW) { row++; x = 0 }
    if (row >= maxRows) break
    out.push({ x, row })
    x += w + GAP
  }
  return out
}

/** a #rrggbb colour lifted toward white by t (the type colours are dark on the dark plate) */
function lift(c: string, t: number): string {
  const n = parseInt(c.slice(1, 7), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t))
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`
}

const overlaps = (a: HudRect, b: HudRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** the strip at the top: the attack's name in its type's colour, then the chips. See-through over a fighter, or over
 * anything in `avoid` (the prediction chip, badges near the top) */
export function drawAimStrip(g: CanvasRenderingContext2D, s: SimState, info: AimInfo, a: number, avoid: readonly HudRect[] = []): void {
  if (a <= 0) return
  g.save()
  g.font = `700 11px ${FONT_PIX}`
  const name = info.name.toUpperCase()
  const lw = g.measureText(name).width
  g.font = `700 13px ${FONT}`
  const ws = info.chips.map((c) => g.measureText(c.text).width + 16)
  const pos = layoutStrip(ws, lw)
  const rows = pos.length ? pos[pos.length - 1].row + 1 : 1
  const rowW = (r: number) => {
    let w = r === 0 ? lw : 0
    pos.forEach((p, i) => { if (p.row === r) w = p.x + ws[i] })
    return w
  }
  const inner = Math.max(...Array.from({ length: rows }, (_, r) => rowW(r)))
  const w = inner + 2 * PAD, h = rows * CHIP_H + (rows - 1) * ROW_GAP + 2 * PAD
  const x0 = W / 2 - w / 2, y0 = STRIP.y
  // a fighter under it: see-through, like the HUD's panels
  const box = { x: x0, y: y0, w, h }
  const under = fighterUnder(s, box) || avoid.some((r) => overlaps(r, box))
  g.globalAlpha = a * (under ? 0.35 : 1)
  g.beginPath(); g.roundRect(x0, y0, w, h, 10); g.fillStyle = PLATE; g.fill()
  g.lineWidth = 1; g.strokeStyle = 'rgba(111,243,255,0.25)'; g.stroke()
  g.textBaseline = 'middle'; g.textAlign = 'left'
  const col = TYPE_COLOR[info.element] ?? '#d8ecf5'
  g.font = `700 11px ${FONT_PIX}`; g.fillStyle = /^#[0-9a-f]{6}/i.test(col) ? lift(col, 0.45) : col
  g.fillText(name, x0 + PAD, y0 + PAD + CHIP_H / 2 + 1)
  g.font = `700 13px ${FONT}`
  pos.forEach((p, i) => {
    const c = info.chips[i], t = TONE[c.tone]
    const cx = x0 + PAD + p.x, cy = y0 + PAD + p.row * (CHIP_H + ROW_GAP)
    g.beginPath(); g.roundRect(cx, cy, ws[i], CHIP_H, 7)
    g.fillStyle = 'rgba(255,255,255,0.04)'; g.fill()
    g.strokeStyle = t.edge; g.stroke()
    g.fillStyle = t.ink
    g.fillText(c.text, cx + 8, cy + CHIP_H / 2 + 1)
  })
  g.restore()
}

/** a fighter's drawn spot (design px): its feet, the top of its sprite, the sprite's half width */
export interface Anchor { x: number; y: number; head: number; half: number }

/** the badges by a Pokémon: a column beside its sprite (the side with room), most likely first */
export function drawBadges(g: CanvasRenderingContext2D, list: readonly AimBadge[], at: Anchor, a: number): void {
  if (a <= 0 || !list.length) return
  g.save()
  g.globalAlpha = a
  g.font = `700 13px ${FONT}`
  const parts = list.map((b) => ({ b, odds: chanceLabel(b.chance) }))
  const widths = parts.map(({ b, odds }) => g.measureText(b.text).width + (odds ? g.measureText(odds).width + 6 : 0) + 22)
  const colW = Math.max(...widths)
  const h = 20, gap = 3
  const total = list.length * h + (list.length - 1) * gap
  const right = at.x + at.half + 10 + colW <= W - 8
  const x = right ? at.x + at.half + 10 : at.x - at.half - 10 - colW
  let y = Math.max(8, Math.min(at.y - total / 2 - 10, at.head + 8))
  g.textBaseline = 'middle'; g.textAlign = 'left'
  parts.forEach(({ b, odds }, i) => {
    const bw = widths[i], bx = right ? x : x + colW - bw
    g.beginPath(); g.roundRect(bx, y, bw, h, 7); g.fillStyle = PLATE; g.fill()
    g.lineWidth = 1.5; g.strokeStyle = hexA(b.color, 0.7); g.stroke()
    g.beginPath(); g.arc(bx + 10, y + h / 2, 4, 0, Math.PI * 2); g.fillStyle = b.color; g.fill()
    g.fillStyle = b.color
    g.fillText(b.text, bx + 18, y + h / 2 + 1)
    if (odds) { const tw = g.measureText(b.text).width; g.fillStyle = 'rgba(220,240,250,0.75)'; g.fillText(odds, bx + 24 + tw, y + h / 2 + 1) }
    y += h + gap
  })
  g.restore()
}

/** the bench marks: a small pill under the member's pocket in the team row ("−30", "forced in") */
export function drawBenchMarks(g: CanvasRenderingContext2D, marks: readonly BenchMark[], me: number, a: number): void {
  if (a <= 0 || !marks.length) return
  g.save()
  g.globalAlpha = a
  g.font = `700 12px ${FONT}`
  g.textAlign = 'center'; g.textBaseline = 'middle'
  for (const m of marks) {
    const right = m.p !== me
    const { cx, cy } = teamRowSlot(right ? W - 540 : 20, right, m.member)
    const odds = chanceLabel(m.chance)
    const text = odds ? `${m.text} ${odds}` : m.text
    const w = g.measureText(text).width + 12, y = cy + 20
    g.beginPath(); g.roundRect(cx - w / 2, y, w, 18, 6); g.fillStyle = PLATE; g.fill()
    g.lineWidth = 1.5; g.strokeStyle = hexA(m.color, 0.75); g.stroke()
    g.fillStyle = m.color; g.fillText(text, cx, y + 10)
  }
  g.restore()
}
