// The in-match HUD, drawn on the canvas in pokeshell's binder style (the tokens of src/theme.css, through
// src/theme.ts): paper cards with the binder's divider tabs, type-tinted card frames for the attacks, clear pockets
// for the team, key chips, Fredoka / Silkscreen / Caveat. Both trainers (active HP, the team's KOs), the timer, the
// energy meter and evolve charge, your attacks, the team bar with the swap cost, the forced swap picker after a KO,
// and the match intro (arena banner, VS, countdown).
// Nothing here is clickable: every click over the arena is an attack (the user: "clicks go through to the arena").
// Swaps are the number keys; evolving is F, and Tab picks between evolve options.
import { costPips, planPayment } from '../sim/energy'
import { ENERGY_CAP, ENERGY_FILL, EVO_MAX, KO_REPLACE_TICKS, MATCH_TICKS, SWAP_COOLDOWN, COUNTDOWN_TICKS } from '../sim/rules'
import { evolveOptions, evolveStatus } from '../sim/step'
import { evoLoaner, evoShiny, type EnergyType, type FighterKit, type MatchDef, type Shape, type SimState } from '../sim/types'
import { FONT_HAND, FONT_PIX, FONT_ROUND, tokens, type Tokens } from '../theme'
import type { Prediction } from '../sim/predict'
import type { SheetAttack } from '../game/attacksheet'
import type { AimInfo } from '../game/aiminfo'
import { TYPE_COLOR, boundsOf, hexA, sprite } from './sprites'

export interface HudInfo {
  me: number
  /** seen[p][member]: that member has been on the field (src/game/elim.ts); the team strip draws the others as
   * "not yet seen" silhouettes. Absent: every member shows */
  seen?: boolean[][]
  names: string[]
  difficulty: string
  arenaName: string
  keys: string[]
  mode?: '1v1' | 'team'
  paused?: boolean
  /** the evolve option F picks now (1..n; Tab cycles it) */
  evoPick?: number
  /** the attack being held to aim (1..3), 0 when none: the renderer shows its telegraph at full strength */
  aiming?: number
  /** the held attack's predicted damage on the foe it's aimed at (render-only; src/sim/predict.ts) */
  predict?: AimPrediction | null
  /** the held attack's aim info: badges by the Pokémon it touches, the strip at the top (src/game/aiminfo.ts) */
  aimInfo?: AimInfo | null
  /** the attack sheet peek (hold I) */
  peek?: PeekInfo | null
  /** the mouse in design px, for the KO picker's hover (render-only); null when a bot plays for you */
  pointer?: { x: number; y: number } | null
}

export interface AimPrediction {
  /** attack index (0..2) */
  attack: number
  target: number
  /** the target is on the aim path (else it's the nearest foe, and the number is dimmed) */
  onPath: boolean
  p: Prediction
  /** a wall cuts the line to the target (predict.aimBlocked): the number is dimmed */
  blocked?: boolean
}

export interface PeekInfo {
  kit: FighterKit
  /** the foe the predictions are against (-1 none) */
  target: number
  sheet: SheetAttack[]
  predictions: (Prediction | null)[]
}

/** the prediction's colour: cyan, never the printed damage's gold */
export const PREDICT = '#6ff3ff'
/** the printed damage's gold (as on the card) */
export const PRINTED = '#ffe28a'

/** "≈ 60", or "30–90 (avg 60)" for a coin-flip attack */
export function predictLabel(p: Prediction, short = false): string {
  if (!p.chance || p.min === p.max) return `≈ ${p.max}`
  return short ? `${p.min}–${p.max}` : `${p.min}–${p.max} (avg ${p.avg})`
}

/** the forced-swap picker's cards after your active is KO'd: where each sits (design px) and its team slot (1..6).
 * Empty when there is no picker. The picker draws from it, and the page hit-tests clicks with it (pickerSlotAt) */
export function pickerCards(s: SimState, me: number): { x: number; y: number; w: number; h: number; slot: number }[] {
  const pl = s.players[me]
  if (!pl || pl.active >= 0 || s.phase !== 'fight' || pl.members.every((m) => m.ko)) return []
  const alive = pl.members.map((m, i) => ({ m, i })).filter((o) => !o.m.ko)
  const cw = 190, ch = 224, gap = 18
  const tw = alive.length * cw + (alive.length - 1) * gap
  const x0 = 960 - tw / 2, y = PICK_SY + 112
  return alive.map(({ i }, k) => ({ x: x0 + k * (cw + gap), y, w: cw, h: ch, slot: i + 1 }))
}

/** the team slot of the picker card under a design-px point, else 0 */
export function pickerSlotAt(s: SimState, me: number, x: number, y: number): number {
  return pickerCards(s, me).find((c) => x >= c.x && x < c.x + c.w && y >= c.y - 6 && y < c.y + c.h + 6)?.slot ?? 0
}
const PICK_SY = 300

/** the hovered picker card grows to this scale (centred, drawn over its neighbours) */
export const PICK_GROW = 1.15
/** how long the grow (and the shrink back) takes, in ms of frame time */
export const PICK_GROW_MS = 130
/** one frame of a picker card's grow (0 = resting, 1 = fully grown) toward `hot`, dtMs of frame time later */
export function stepPickGrow(cur: number, hot: boolean, dtMs: number): number {
  const d = Math.max(0, dtMs) / PICK_GROW_MS
  return hot ? Math.min(1, cur + d) : Math.max(0, cur - d)
}
/** the picker card the pointer (design px) is over, else 0: the same rects as the click (pickerSlotAt), so what grows
 * is exactly what a click sends in, and a grown card's overhang never steals its neighbour's clicks */
export function pickerHoverSlot(s: SimState, me: number, pointer: { x: number; y: number } | null | undefined): number {
  return pointer ? pickerSlotAt(s, me, pointer.x, pointer.y) : 0
}

/** the HUD's rounded font (the renderer's damage numbers and banners use it too) */
export const FONT = FONT_ROUND
const INK_DARK = 'rgba(0,0,0,0.75)'

// ------------------------------------------------------------------ colour helpers
function rgb(c: string): [number, number, number] {
  if (c.startsWith('#')) {
    const h = c.slice(1)
    const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const m = c.match(/[\d.]+/g)
  return m ? [+m[0], +m[1], +m[2]] : [128, 128, 128]
}
/** a mixed into b by t (0 = a, 1 = b), like CSS color-mix */
function mix(a: string, b: string, t: number, alpha = 1): string {
  const x = rgb(a), y = rgb(b)
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t))
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`
}
const tint = (type: string) => TYPE_COLOR[type] ?? '#9aa4b5'

// ------------------------------------------------------------------ binder pieces
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath(); g.roundRect(x, y, w, h, r)
}

/** a paper card lying on the arena: a soft shadow, the paper, its edge */
export function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 10, fill?: string, line?: string): void {
  const T = tokens()
  g.save()
  g.shadowColor = 'rgba(20,10,0,0.45)'; g.shadowBlur = 16; g.shadowOffsetY = 6
  rr(g, x, y, w, h, r); g.fillStyle = fill ?? mix(T.paper, T.paper, 0, 0.9); g.fill()
  g.restore()
  // the page's side shading, as on a binder page
  const sh = g.createLinearGradient(x, 0, x + w, 0)
  sh.addColorStop(0, 'rgba(0,0,0,0.05)'); sh.addColorStop(0.06, 'rgba(0,0,0,0)'); sh.addColorStop(0.94, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.05)')
  rr(g, x, y, w, h, r); g.fillStyle = sh; g.fill()
  g.lineWidth = 1.5; g.strokeStyle = line ?? T.paperEdge; rr(g, x + 0.5, y + 0.5, w - 1, h - 1, r); g.stroke()
}

/** a clear pocket (a sleeve on the page) */
function pocket(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 6, fill?: string): void {
  const T = tokens()
  rr(g, x, y, w, h, r); g.fillStyle = fill ?? mix(T.ink, T.ink, 0, 0.05); g.fill()
  g.lineWidth = 1; g.strokeStyle = T.pocketLine; rr(g, x + 0.5, y + 0.5, w - 1, h - 1, r); g.stroke()
  // the sleeve's gloss
  g.save(); rr(g, x, y, w, h, r); g.clip()
  const gl = g.createLinearGradient(x, y, x + w, y + h * 0.6)
  gl.addColorStop(0.32, 'rgba(255,255,255,0)'); gl.addColorStop(0.42, `rgba(255,255,255,${T.dark ? 0.06 : 0.22})`); gl.addColorStop(0.5, 'rgba(255,255,255,0)')
  g.fillStyle = gl; g.fillRect(x, y, w, h)
  g.restore()
}

/** a divider tab sticking up from a card's top edge (the binder's Pokémon / Pokédex tabs) */
function tab(g: CanvasRenderingContext2D, x: number, y: number, text: string, col: string, ink: string, right = false): void {
  g.font = `700 11px ${FONT_PIX}`
  const w = g.measureText(text).width + 22, h = 20
  const tx = right ? x - w : x
  const gr = g.createLinearGradient(0, y - h, 0, y)
  gr.addColorStop(0, mix(col, '#ffffff', 0.18)); gr.addColorStop(1, col)
  g.beginPath(); g.roundRect(tx, y - h, w, h + 6, [8, 8, 0, 0]); g.fillStyle = gr; g.fill()
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(text, tx + w / 2, y - h / 2 + 1)
}

/** a key chip, like the binder's .kbd */
function kbd(g: CanvasRenderingContext2D, x: number, y: number, text: string, size = 13, align: 'left' | 'center' = 'left', hot = false): number {
  const T = tokens()
  g.font = `600 ${size}px ${FONT_ROUND}`
  const w = Math.max(size * 1.6, g.measureText(text).width + size * 0.9), h = size * 1.7
  const x0 = align === 'center' ? x - w / 2 : x
  rr(g, x0, y - h / 2, w, h, 5); g.fillStyle = hot ? T.gold : T.paper2; g.fill()
  g.lineWidth = 1; g.strokeStyle = hot ? T.gold2 : T.chipLine; g.stroke()
  g.fillStyle = hexA('#000000', T.dark ? 0.5 : 0.18); g.fillRect(x0 + 2, y + h / 2 - 2, w - 4, 2)
  g.fillStyle = hot ? T.goldInk : T.ink; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(text, x0 + w / 2, y + 0.5)
  return w
}

/** the art window of a card: the type's tint in the binder's double frame */
function artWindow(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, type: string): void {
  const T = tokens()
  const c = tint(type)
  const x = cx - w / 2, y = cy - h / 2
  rr(g, x - 3, y - 3, w + 6, h + 6, 6); g.fillStyle = 'rgba(0,0,0,0.45)'; g.fill()
  rr(g, x - 2, y - 2, w + 4, h + 4, 5); g.fillStyle = 'rgba(255,255,255,0.16)'; g.fill()
  const gr = g.createRadialGradient(cx, cy + h * 0.1, 2, cx, cy, Math.max(w, h) * 0.75)
  gr.addColorStop(0, mix(T.paper2, c, 0.4)); gr.addColorStop(0.7, mix(T.paper, c, 0.18)); gr.addColorStop(1, T.paper)
  rr(g, x, y, w, h, 4); g.fillStyle = gr; g.fill()
}

function pip(g: CanvasRenderingContext2D, x: number, y: number, r: number, type: string): void {
  const c = TYPE_COLOR[type] ?? '#d6d2c6'
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2)
  const grad = g.createRadialGradient(x - r * 0.32, y - r * 0.4, 0.5, x, y, r)
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.3, c); grad.addColorStop(1, mix(c, '#000000', 0.25))
  g.fillStyle = grad; g.fill()
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.2; g.stroke()
}

function hpColor(T: Tokens, frac: number): string {
  return frac > 0.5 ? T.hpHi : frac > 0.2 ? T.hpMid : T.hpLo
}

function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, col: string, fromRight = false): void {
  const T = tokens()
  rr(g, x, y, w, h, h / 2); g.fillStyle = mix(T.ink, T.ink, 0, 0.12); g.fill()
  const fw = Math.max(0, Math.min(1, frac)) * w
  if (fw > 0) {
    rr(g, fromRight ? x + w - fw : x, y, fw, h, h / 2); g.fillStyle = col; g.fill()
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect((fromRight ? x + w - fw : x) + h / 2, y + 2, Math.max(0, fw - h), Math.max(1, h / 4))
  }
}

/** a sprite fitted into a box (nearest neighbour), or a type disc */
export function drawMini(g: CanvasRenderingContext2D, kit: FighterKit, shiny: boolean, cx: number, cy: number, size: number, grey = false): void {
  const img = sprite(kit.character, shiny)
  g.save()
  g.imageSmoothingEnabled = false
  if (grey) { g.filter = 'grayscale(1) brightness(0.6)'; g.globalAlpha *= 0.7 }
  if (img) {
    const b = boundsOf(img)
    let s = size / Math.max(b.w, b.h)
    if (s >= 1) s = Math.max(1, Math.round(s)) // a whole-pixel scale when growing (crisp)
    g.drawImage(img, b.x, b.y, b.w, b.h, Math.round(cx - (b.w * s) / 2), Math.round(cy - (b.h * s) / 2), b.w * s, b.h * s)
  } else {
    g.fillStyle = TYPE_COLOR[kit.types[0]] ?? '#ccc'
    g.beginPath(); g.arc(cx, cy, size * 0.36, 0, Math.PI * 2); g.fill()
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.font = `700 ${Math.round(size * 0.4)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(kit.name[0], cx, cy + 1)
  }
  g.restore()
}

/** a red KO cross over a member */
function koCross(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const T = tokens()
  g.save(); g.strokeStyle = T.foe; g.lineWidth = Math.max(2.5, r / 5); g.lineCap = 'round'
  g.beginPath(); g.moveTo(cx - r, cy - r); g.lineTo(cx + r, cy + r); g.moveTo(cx + r, cy - r); g.lineTo(cx - r, cy + r); g.stroke()
  g.restore()
}

function shiny(def: MatchDef, p: number, member: number): boolean {
  return !!def.players[p]?.shiny?.[member]
}

/** KO'd members of a side, as the sim has them */
function kod(s: SimState, p: number): number {
  return s.players[p].members.filter((m) => m.ko).length
}

// ------------------------------------------------------------------ the two trainers
function trainer(g: CanvasRenderingContext2D, s: SimState, def: MatchDef, p: number, x: number, right: boolean, name: string, you: boolean): void {
  const T = tokens()
  const pl = s.players[p]
  const w = 520, y = 24, h = 118
  panel(g, x, y, w, h, 10)
  // the side's divider tab: you in the Pokédex blue, the bot in the cover red
  tab(g, right ? x + w - 16 : x + 16, y + 1, name === 'You' ? 'YOU' : name.toUpperCase(), you ? T.tabBlue : T.tabRed, you ? T.tabBlueInk : T.tabRedInk, right)
  const idx = pl.active >= 0 ? pl.active : Math.max(0, pl.members.findIndex((m) => !m.ko))
  const m = pl.members[idx]
  const kit = def.kits[m.kit]
  // portrait in its art window
  const px = right ? x + w - 58 : x + 58, py = y + 50
  artWindow(g, px, py, 76, 70, kit.types[0])
  drawMini(g, kit, shiny(def, p, idx), px, py, 62, pl.active < 0)
  g.textBaseline = 'alphabetic'
  g.textAlign = right ? 'right' : 'left'
  const tx = right ? x + w - 112 : x + 112
  g.font = `700 27px ${FONT_ROUND}`; g.fillStyle = T.ink
  g.fillText(pl.active < 0 && pl.members.some((mm) => !mm.ko) ? 'choosing…' : kit.name, tx, y + 38, w - 260)
  g.font = `500 14px ${FONT_ROUND}`; g.fillStyle = T.inkSoft
  g.fillText(`${name} · ${kit.types.join(' / ')}`, tx, y + 58, w - 260)
  // HP like the card's own: the number in red ink, then "/ max HP" small
  const hpInk = T.dark ? '#ff9a8a' : '#8d1f14'
  const big = `${m.hp}`, small = `/ ${m.maxHp} HP`
  g.font = `700 11px ${FONT_PIX}`
  const sw = g.measureText(small).width
  g.font = `700 24px ${FONT_ROUND}`
  const bw0 = g.measureText(big).width
  const hx = right ? x + 20 : x + w - 20 - sw - 6 - bw0
  g.textAlign = 'left'; g.fillStyle = hpInk
  g.fillText(big, hx, y + 38)
  g.font = `700 11px ${FONT_PIX}`; g.fillStyle = T.inkSoft
  g.fillText(small, hx + bw0 + 6, y + 37)
  const bx = right ? x + 20 : x + 112, bw = w - 132
  bar(g, bx, y + 68, bw, 13, m.hp / m.maxHp, hpColor(T, m.hp / m.maxHp), right)
  // the team row is teamRow(), drawn over the panels unfaded so it always shows
}

const ROW_CS = 30, ROW_GAP = 5
/** where member i of a trainer panel's team row sits (design px): x is the panel's left, right = the foe's side */
export function teamRowSlot(x: number, right: boolean, i: number): { cx: number; cy: number } {
  const w = 520, y = 24
  return { cx: right ? x + w - 112 - ROW_CS / 2 - i * (ROW_CS + ROW_GAP) : x + 112 + ROW_CS / 2 + i * (ROW_CS + ROW_GAP), cy: y + 101 }
}

/** the team row under a trainer's HP bar, never faded (full elimination: always see who is left): every member in a
 * pocket, KO'd ones greyed and crossed, members that haven't come in yet as dark silhouettes, how many are down, and
 * LAST ONE when one is left */
function teamRow(g: CanvasRenderingContext2D, s: SimState, def: MatchDef, hud: HudInfo, p: number, x: number, right: boolean, you: boolean, t: number): void {
  const T = tokens()
  const pl = s.players[p]
  const n = pl.members.length
  if (n <= 1) return
  const w = 520, y = 24
  const cs = ROW_CS
  pl.members.forEach((mm, i) => {
    const { cx, cy } = teamRowSlot(x, right, i)
    pocket(g, cx - cs / 2, cy - cs / 2 + 2, cs, cs - 4, 5, i === pl.active ? mix(you ? T.tabBlue : T.cover, you ? T.tabBlue : T.cover, 0, 0.22) : undefined)
    const seen = you || !hud.seen || hud.seen[p]?.[i] !== false || mm.ko
    if (seen) drawMini(g, def.kits[mm.kit], shiny(def, p, i), cx, cy, 24, mm.ko)
    else silhouette(g, def.kits[mm.kit], cx, cy, 24)
    if (mm.ko) koCross(g, cx, cy, 8)
  })
  const k = kod(s, p)
  g.save()
  g.textAlign = right ? 'left' : 'right'; g.textBaseline = 'middle'
  g.font = `700 11px ${FONT_PIX}`; g.fillStyle = k ? (T.dark ? '#ff9a8a' : '#b3290a') : T.inkSoft
  const lx = right ? x + 20 : x + w - 20
  if (n - k === 1 && s.phase !== 'countdown') {
    // one left: say so, pulsing on the foe's side
    g.fillStyle = !you && t % 40 < 20 ? T.foe : g.fillStyle
    g.fillText(`${k}/${n} KO'D · LAST ONE`, lx, y + 101)
  } else g.fillText(`${k}/${n} KO'D`, lx, y + 101)
  g.restore()
}

/** a member not seen yet: its sprite's shape filled dark, with a "?" (you know how many, not who) */
function silhouette(g: CanvasRenderingContext2D, kit: FighterKit, cx: number, cy: number, size: number): void {
  g.save()
  g.filter = 'brightness(0)'
  g.globalAlpha *= 0.55
  drawMini(g, kit, false, cx, cy, size)
  g.restore()
  g.save()
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = `700 13px ${FONT_ROUND}`; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.fillStyle = '#fff'
  g.strokeText('?', cx, cy + 1); g.fillText('?', cx, cy + 1)
  g.restore()
}

/** a small glyph for an attack shape */
function shapeIcon(g: CanvasRenderingContext2D, sh: Shape, x: number, y: number, color: string): void {
  g.save()
  g.strokeStyle = color; g.fillStyle = color.startsWith('#') ? hexA(color, 0.3) : color; g.lineWidth = 2.5
  g.translate(x, y)
  switch (sh.kind) {
    case 'projectile': g.beginPath(); g.moveTo(-12, 0); g.lineTo(6, 0); g.stroke(); g.beginPath(); g.arc(9, 0, 5, 0, Math.PI * 2); g.fill(); g.stroke(); break
    case 'beam': g.beginPath(); g.roundRect(-13, -4, 26, 8, 4); g.fill(); g.stroke(); break
    case 'cone': case 'melee': g.beginPath(); g.moveTo(-10, 0); g.arc(-10, 0, 22, -0.5, 0.5); g.closePath(); g.fill(); g.stroke(); break
    case 'area': case 'terrain': g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.fill(); g.stroke(); g.setLineDash([3, 3]); g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); g.stroke(); break
    case 'dash': g.beginPath(); g.moveTo(-12, -6); g.lineTo(2, -6); g.lineTo(2, -11); g.lineTo(13, 0); g.lineTo(2, 11); g.lineTo(2, 6); g.lineTo(-12, 6); g.closePath(); g.fill(); g.stroke(); break
    default: g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fill()
  }
  g.restore()
}

// ------------------------------------------------------------------ your attacks: small cards in their type's frame
function attacks(g: CanvasRenderingContext2D, s: SimState, def: MatchDef, hud: HudInfo, t: number, y0: number): void {
  const T = tokens()
  const me = hud.me
  const pl = s.players[me]
  if (pl.active < 0) return
  const types: EnergyType[] = []
  const kit = def.kits[pl.members[pl.active].kit]
  const f = pl.fighter
  const n = kit.attacks.length
  const bw = 340, gap = 14, bh = 104
  const x0 = 960 - (n * bw + (n - 1) * gap) / 2
  kit.attacks.forEach((a, i) => {
    const x = x0 + i * (bw + gap), y = y0
    const afford = planPayment(a.cost, types, pl.pips) !== null
    const used = !!(a.oncePerMatch && pl.usedOnce.includes(a.oncePerMatch))
    const can = afford && f.cooldowns[i] === 0 && !used
    const col = tint(a.element)
    // the frame (the card's foil edge in the type's colour), glowing when the attack is ready
    g.save()
    if (can) { g.shadowColor = col; g.shadowBlur = 14 + 6 * Math.sin(t * 0.12) } else { g.shadowColor = 'rgba(20,10,0,0.45)'; g.shadowBlur = 14; g.shadowOffsetY = 6 }
    const fr = g.createLinearGradient(x, y, x + bw, y + bh)
    fr.addColorStop(0, mix(col, '#ffffff', 0.25)); fr.addColorStop(0.5, col); fr.addColorStop(1, mix(col, '#000000', 0.15))
    rr(g, x, y, bw, bh, 10); g.fillStyle = fr; g.fill()
    g.restore()
    // the panel inside, tinted by the type
    const pn = g.createLinearGradient(0, y, 0, y + bh)
    pn.addColorStop(0, mix(T.paper, col, 0.14)); pn.addColorStop(1, mix(T.paper2, col, 0.3))
    rr(g, x + 5, y + 5, bw - 10, bh - 10, 7); g.fillStyle = pn; g.fill()
    kbd(g, x + 16, y + 28, hud.keys[i] ?? '', 12)
    g.textAlign = 'left'; g.textBaseline = 'middle'
    g.font = `700 22px ${FONT_ROUND}`; g.fillStyle = T.ink
    g.fillText(a.name, x + 90, y + 28, bw - 170)
    g.textAlign = 'right'
    g.font = `700 28px ${FONT_ROUND}`; g.fillStyle = '#ffe28a'
    g.fillText(a.damage || '—', x + bw - 16, y + 29)
    // cost: N energy pips, filled as the meter can pay them (the card's cost types as coloured flavour dots)
    const need = costPips(a.cost)
    const have = pl.pips[0] ?? 0
    for (let k = 0; k < need; k++) {
      epip(g, x + 26 + k * 24, y + 68, 10, k < have, k === have ? (pl.fill[0] ?? 0) / ENERGY_FILL : 0)
      const c = a.cost[k]
      if (c && c !== 'Colorless') pip(g, x + 26 + k * 24, y + 84, 3.5, c)
    }
    g.textAlign = 'left'; g.font = `600 17px ${FONT_HAND}`; g.fillStyle = T.inkSoft
    g.fillText(need === 0 ? 'free' : `${need} energy`, x + 18 + Math.max(0, need) * 24 + (need ? 8 : 0), y + 69)
    shapeIcon(g, a.shape, x + bw - 40, y + 68, can ? mix(col, T.ink, 0.35) : T.inkSoft)
    g.textAlign = 'right'; g.font = `700 10px ${FONT_PIX}`
    const tag = used ? `${a.oncePerMatch!.toUpperCase()} USED` : can ? 'READY' : !afford ? 'ENERGY' : a.oncePerMatch ? `${a.oncePerMatch.toUpperCase()} ONCE` : ''
    g.fillStyle = can ? (T.dark ? mix(col, '#ffffff', 0.3) : mix(col, T.ink, 0.45)) : T.inkSoft
    g.fillText(tag, x + bw - 64, y + 69)
    // not ready: the card sits greyed in its sleeve
    if (!can) { rr(g, x, y, bw, bh, 10); g.fillStyle = mix(T.paper, T.paper, 0, 0.45); g.fill() }
    if (f.cooldowns[i] > 0) {
      const k = f.cooldowns[i] / Math.max(1, a.cooldown)
      rr(g, x + 10, y + bh - 12, (bw - 20) * k, 4, 2); g.fillStyle = T.ink; g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1
    }
  })
}

/** where attack card i of n sits (design px): the same layout as attacks() */
function attackCard(n: number, i: number): { x: number; y: number; w: number; h: number } {
  const bw = 340, gap = 14, bh = 104
  return { x: 960 - (n * bw + (n - 1) * gap) / 2 + i * (bw + gap), y: 1080 - 124, w: bw, h: bh }
}

/** aiming an attack: its predicted damage under the printed number on its card, in cyan (dimmed when no foe is on
 * the aim path). Drawn after the panels, on a dark plate, so it reads even while the attack panel is faded */
function attackPrediction(g: CanvasRenderingContext2D, s: SimState, def: MatchDef, hud: HudInfo): void {
  const pr = hud.predict
  const pl = s.players[hud.me]
  if (!pr || !pl || pl.active < 0) return
  const kit = def.kits[pl.members[pl.active].kit]
  const c = attackCard(kit.attacks.length, pr.attack)
  const lbl = (pr.p.max > 0 ? predictLabel(pr.p, true) : 'no damage') + (pr.p.ko === 'always' ? ' KO' : '')
  g.save()
  g.globalAlpha = pr.onPath && !pr.blocked ? 1 : 0.6
  g.font = `700 16px ${FONT_ROUND}`
  const w = g.measureText(lbl).width + 12
  const rx = c.x + c.w - 16, ry = c.y + 52
  rr(g, rx - w + 6, ry - 11, w, 22, 6); g.fillStyle = 'rgba(3,20,26,0.8)'; g.fill()
  g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillStyle = PREDICT
  g.fillText(lbl, rx, ry + 1)
  g.restore()
}

/** an energy pip: a gold crystal, filled / empty / partly filling */
function epip(g: CanvasRenderingContext2D, x: number, y: number, r: number, filled: boolean, frac = 0, glow = 0): void {
  const T = tokens()
  g.save()
  g.translate(x, y)
  const diamond = () => { g.beginPath(); g.moveTo(0, -r); g.lineTo(r * 0.8, 0); g.lineTo(0, r); g.lineTo(-r * 0.8, 0); g.closePath() }
  diamond()
  g.fillStyle = mix(T.ink, T.ink, 0, 0.08); g.fill()
  if (filled) {
    if (glow > 0) { g.shadowColor = T.gold; g.shadowBlur = glow }
    const grad = g.createLinearGradient(-r, -r, r, r)
    grad.addColorStop(0, '#fff3b0'); grad.addColorStop(0.45, T.gold); grad.addColorStop(1, T.gold2)
    g.fillStyle = grad; diamond(); g.fill()
    g.shadowBlur = 0
  } else if (frac > 0) {
    g.save(); diamond(); g.clip()
    g.fillStyle = hexA(T.gold, 0.6)
    g.fillRect(-r, r - 2 * r * frac, 2 * r, 2 * r * frac)
    g.restore()
  }
  diamond()
  g.strokeStyle = filled ? 'rgba(90,50,0,0.7)' : mix(T.ink, T.ink, 0, 0.28); g.lineWidth = 1.5; g.stroke()
  g.restore()
}

// ------------------------------------------------------------------ energy meter, evolve charge, the EVOLVE prompt
function energy(g: CanvasRenderingContext2D, s: SimState, def: MatchDef, me: number, pick: number, t: number): void {
  const T = tokens()
  const pl = s.players[me]
  const x0 = 20, y0 = 1080 - 146, w = 440, h = 128
  panel(g, x0, y0, w, h, 10)
  const pips = pl.pips[0] ?? 0
  const fill = pl.fill[0] ?? 0
  g.textAlign = 'left'; g.textBaseline = 'middle'
  g.font = `700 11px ${FONT_PIX}`; g.fillStyle = T.inkSoft
  g.fillText('ENERGY', x0 + 16, y0 + 20)
  g.textAlign = 'right'; g.font = `700 24px ${FONT_ROUND}`; g.fillStyle = T.ink
  g.fillText(`${pips}`, x0 + w - 46, y0 + 22)
  g.font = `600 14px ${FONT_ROUND}`; g.fillStyle = T.inkSoft
  g.fillText(`/ ${ENERGY_CAP}`, x0 + w - 16, y0 + 24)
  for (let k = 0; k < ENERGY_CAP; k++) {
    const x = x0 + 30 + k * 40, y = y0 + 58
    const full = k < pips
    epip(g, x, y, 15, full, k === pips && pips < ENERGY_CAP ? fill / ENERGY_FILL : 0, full && pips >= ENERGY_CAP ? 6 + 4 * Math.sin(t * 0.15) : 0)
  }
  // evolve charge
  const evo = pl.evo ?? 0
  const frac = Math.min(1, evo / EVO_MAX)
  const opts = evolveOptions(def, s, me)
  const why = evolveStatus(def, s, me)
  const has = why.options.length > 0
  g.textAlign = 'left'; g.font = `700 11px ${FONT_PIX}`; g.fillStyle = has ? '#7a4fd6' : T.inkSoft
  if (T.dark && has) g.fillStyle = '#c8a8ff'
  g.fillText('EVOLVE', x0 + 16, y0 + 102)
  const bx = x0 + 84, bw = w - 104
  rr(g, bx, y0 + 96, bw, 12, 6); g.fillStyle = mix(T.ink, T.ink, 0, 0.1); g.fill()
  if (frac > 0) {
    const grad = g.createLinearGradient(bx, 0, bx + bw, 0)
    grad.addColorStop(0, '#7a5cff'); grad.addColorStop(1, frac >= 1 ? '#e9dcff' : '#b48cff')
    rr(g, bx, y0 + 96, bw * frac, 12, 6); g.fillStyle = grad; g.fill()
  }
  // why it can or can't evolve: "no owned evolution" / "charge 40/60 → Charmeleon" / "top stage" / "F → Charmeleon"
  {
    const into = has ? ` → ${why.options.map((k) => def.kits[k].name).slice(0, 2).join(' / ')}${why.options.length > 2 ? ' …' : ''}` : ''
    g.font = `600 16px ${FONT_HAND}`; g.fillStyle = T.inkSoft; g.textAlign = 'right'
    g.fillText(why.ready ? `F${into}` : `${why.reason}${into}`, bx + bw - 6, y0 + 101, bw - 12)
  }
  if (opts.length && pl.active >= 0 && s.phase === 'fight') {
    const ow = 170, oh = 86
    const tw = 128 + opts.length * (ow + 8)
    const px = x0, py = y0 - oh - 22 - (pl.members.length > 1 ? 84 : 0)
    const sel = Math.min(opts.length, Math.max(1, pick))
    g.save()
    g.shadowColor = '#b48cff'; g.shadowBlur = 18 + 10 * Math.sin(t * 0.2)
    panel(g, px, py, tw, oh, 10, undefined, '#9a6cff')
    g.restore()
    tab(g, px + 14, py + 1, 'EVOLVE', '#9a6cff', '#ffffff')
    g.textAlign = 'center'; g.textBaseline = 'middle'
    kbd(g, px + 60, py + 34, 'F', 18, 'center')
    g.font = `600 16px ${FONT_HAND}`; g.fillStyle = T.inkSoft
    g.fillText(opts.length > 1 ? 'Tab: pick' : 'to evolve', px + 60, py + 66)
    opts.forEach((k, i) => {
      const ox = px + 120 + i * (ow + 8)
      const kit = def.kits[k]
      const on = i + 1 === sel
      pocket(g, ox, py + 8, ow, oh - 16, 6, on && opts.length > 1 ? hexA('#9a6cff', 0.18) : undefined)
      if (on && opts.length > 1) { g.lineWidth = 2.5; g.strokeStyle = '#9a6cff'; rr(g, ox, py + 8, ow, oh - 16, 6); g.stroke() }
      drawMini(g, kit, evoShiny(def.players[me], k), ox + 36, py + oh / 2, 58)
      g.textAlign = 'left'; g.font = `700 16px ${FONT_ROUND}`; g.fillStyle = T.ink
      g.fillText(kit.name, ox + 70, py + 34, ow - 76)
      g.font = `500 12.5px ${FONT_ROUND}`; g.fillStyle = T.inkSoft
      g.fillText(`${kit.hp} HP${evoLoaner(def.players[me], k) ? ' · loaner' : ''}`, ox + 70, py + 54)
    })
  }
}

// ------------------------------------------------------------------ the team bar: pockets with the number keys
function teamBar(g: CanvasRenderingContext2D, s: SimState, def: MatchDef, hud: HudInfo, t: number): void {
  const T = tokens()
  const me = hud.me
  const pl = s.players[me]
  const n = pl.members.length
  if (n < 2) return
  const sw = 132, sh = 70, gap = 8
  const total = n * sw + (n - 1) * gap + 200
  const x0 = 960 - total / 2, y = 1080 - 146 - sh - 14
  const types: EnergyType[] = []
  const activeKit = pl.active >= 0 ? def.kits[pl.members[pl.active].kit] : null
  const cost = new Array<string>(activeKit?.retreat ?? 0).fill('Colorless')
  const affordable = !activeKit || planPayment(cost, types, pl.pips) !== null
  const cd = pl.swapCd
  // the swap cost card
  panel(g, x0, y, 192, sh, 10)
  g.textAlign = 'left'; g.textBaseline = 'middle'
  g.font = `700 11px ${FONT_PIX}`; g.fillStyle = T.inkSoft
  g.fillText('SWAP', x0 + 14, y + 20)
  kbd(g, x0 + 62, y + 20, `1-${n}`, 11)
  g.textAlign = 'left'
  g.font = `500 14px ${FONT_ROUND}`; g.fillStyle = T.ink
  if (activeKit) {
    if (cost.length === 0) { g.font = `600 18px ${FONT_HAND}`; g.fillStyle = T.good; g.fillText('free retreat', x0 + 14, y + 47) }
    else {
      g.fillText('retreat', x0 + 14, y + 47)
      cost.forEach((_, k) => pip(g, x0 + 76 + k * 20, y + 47, 7, 'Colorless'))
      if (!affordable) { g.fillStyle = T.dark ? '#ff9a8a' : '#b3290a'; g.font = `600 16px ${FONT_HAND}`; g.fillText('need energy', x0 + 80 + cost.length * 20, y + 47) }
    }
  }
  if (cd > 0) { rr(g, x0 + 10, y + sh - 9, (192 - 20) * (cd / SWAP_COOLDOWN), 3, 1.5); g.fillStyle = T.inkSoft; g.fill() }
  pl.members.forEach((m, i) => {
    const x = x0 + 200 + i * (sw + gap)
    const kit = def.kits[m.kit]
    const active = i === pl.active
    const ready = !m.ko && !active && affordable && cd === 0 && pl.active >= 0
    panel(g, x, y, sw, sh, 8, active ? mix(T.paper, T.tabBlue, 0.2, 0.97) : undefined, active ? T.me : undefined)
    if (active) { g.save(); g.shadowColor = T.tabBlue; g.shadowBlur = 12; g.strokeStyle = T.me; g.lineWidth = 2.5; rr(g, x, y, sw, sh, 8); g.stroke(); g.restore() }
    artWindow(g, x + 32, y + 36, 46, 46, kit.types[0])
    drawMini(g, kit, shiny(def, me, i), x + 32, y + 36, 42, m.ko)
    g.textAlign = 'left'; g.textBaseline = 'middle'
    g.font = `700 14px ${FONT_ROUND}`; g.fillStyle = m.ko ? T.inkSoft : T.ink
    g.fillText(kit.name, x + 62, y + 18, sw - 68)
    const frac = m.hp / m.maxHp
    bar(g, x + 62, y + 31, sw - 72, 7, frac, hpColor(T, frac))
    g.font = `500 12px ${FONT_ROUND}`; g.fillStyle = T.inkSoft
    if (m.ko) { g.font = `700 10px ${FONT_PIX}`; g.fillStyle = T.dark ? '#ff9a8a' : '#b3290a'; g.fillText("KO'D", x + 62, y + 53) }
    else g.fillText(`${m.hp}/${m.maxHp}`, x + 62, y + 53, sw - 68)
    kbd(g, x + 4, y + 12, String(i + 1), 11, 'left', i + 1 === pickerHoverSlot(s, me, hud.pointer)) // lit while its picker card is hovered
    if (m.ko) koCross(g, x + 32, y + 36, 14)
    if (ready && Math.sin(t * 0.1) > 0.3) { rr(g, x, y, sw, sh, 8); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fill() }
  })
}

// ------------------------------------------------------------------ the forced swap after your active is KO'd
function picker(g: CanvasRenderingContext2D, s: SimState, def: MatchDef, hud: HudInfo, t: number): void {
  const T = tokens()
  const me = hud.me
  const pl = s.players[me]
  if (pl.active >= 0 || s.phase !== 'fight' || pl.members.every((m) => m.ko)) { pickGrow.clear(); pickLast = 0; return }
  const alive = pl.members.map((m, i) => ({ m, i })).filter((o) => !o.m.ko)
  g.fillStyle = T.modalBg; g.fillRect(0, 0, 1920, 1080)
  const cw = 190, ch = 224, gap = 18
  const tw = alive.length * cw + (alive.length - 1) * gap
  const sheetW = Math.max(640, tw + 80), sheetH = 396
  const sx = 960 - sheetW / 2, sy = PICK_SY
  panel(g, sx, sy, sheetW, sheetH, 12)
  tab(g, sx + 24, sy + 1, 'KNOCKED OUT', T.tabRed, T.tabRedInk)
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = `700 38px ${FONT_ROUND}`; g.fillStyle = T.ink
  g.fillText('Choose your next Pokémon', 960, sy + 48)
  const left = Math.max(0, pl.replaceT) / KO_REPLACE_TICKS
  bar(g, 960 - 220, sy + 82, 440, 9, left, left < 0.34 ? T.hpLo : T.gold)
  const x0 = 960 - tw / 2, y = sy + 112
  // hover: the card under the mouse eases up to PICK_GROW over frame time (render state, never the sim's)
  const hot = pickerHoverSlot(s, me, hud.pointer)
  const now = typeof performance !== 'undefined' ? performance.now() : 0
  const dt = pickLast ? Math.min(100, now - pickLast) : 0
  pickLast = now
  const cards = alive.map(({ m, i }, k) => {
    const e = stepPickGrow(pickGrow.get(i + 1) ?? 0, hot === i + 1, dt)
    pickGrow.set(i + 1, e)
    return { m, i, k, e: e * e * (3 - 2 * e) }
  })
  // resting cards first, then the growing ones, the hovered one last: it lies over its neighbours
  for (const c of [...cards].sort((a, b) => +(hot === a.i + 1) - +(hot === b.i + 1) || a.e - b.e)) {
    pickCard(g, def, me, c.m, c.i, x0 + c.k * (cw + gap), y, cw, ch, Math.sin(t * 0.1 + c.k) * 3 * (1 - c.e), c.e)
  }
  g.font = `600 22px ${FONT_HAND}`; g.fillStyle = T.inkSoft; g.textAlign = 'center'
  g.fillText('press its number key or click it · it enters with a moment of invulnerability', 960, sy + sheetH - 26)
}

/** the picker cards' grow (team slot -> 0..1) and the last frame's time: render state only */
const pickGrow = new Map<number, number>()
let pickLast = 0

/** one picker card: the member in its type's frame; e (0..1, eased) grows it about its centre with a lift and a glow */
function pickCard(g: CanvasRenderingContext2D, def: MatchDef, me: number, m: SimState['players'][number]['members'][number], i: number,
  x: number, y: number, cw: number, ch: number, bob: number, e: number): void {
  const T = tokens()
  const kit = def.kits[m.kit]
  const col = tint(kit.types[0])
  const sc = 1 + (PICK_GROW - 1) * e
  g.save()
  if (e > 0) {
    const cx = x + cw / 2, cy = y + ch / 2
    g.translate(cx, cy - 3 * e); g.scale(sc, sc); g.translate(-cx, -cy)
  }
  // the member as a card in its type's frame; grown, a deeper lift shadow and a glow in its type's colour
  g.save(); g.shadowColor = e > 0 ? mix('#140a00', col, 0.55 * e, 0.4 + 0.25 * e) : 'rgba(20,10,0,0.4)'
  g.shadowBlur = 14 + 16 * e; g.shadowOffsetY = 6 + 8 * e
  const fr = g.createLinearGradient(x, y, x + cw, y + ch)
  fr.addColorStop(0, mix(col, '#ffffff', 0.25 + 0.15 * e)); fr.addColorStop(1, col)
  rr(g, x, y + bob, cw, ch, 10); g.fillStyle = fr; g.fill(); g.restore()
  if (e > 0) { rr(g, x - 1, y + bob - 1, cw + 2, ch + 2, 11); g.lineWidth = 2.5; g.strokeStyle = mix(T.gold, T.gold, 0, 0.85 * e); g.stroke() }
  const pn = g.createLinearGradient(0, y, 0, y + ch)
  pn.addColorStop(0, mix(T.paper, col, 0.14)); pn.addColorStop(1, mix(T.paper2, col, 0.3))
  rr(g, x + 6, y + bob + 6, cw - 12, ch - 12, 7); g.fillStyle = pn; g.fill()
  artWindow(g, x + cw / 2, y + bob + 80, cw - 40, 108, kit.types[0])
  drawMini(g, kit, shiny(def, me, i), x + cw / 2, y + bob + 80, 100)
  g.font = `700 20px ${FONT_ROUND}`; g.fillStyle = T.ink; g.textAlign = 'center'
  g.fillText(kit.name, x + cw / 2, y + bob + 158, cw - 20)
  const frac = m.hp / m.maxHp
  bar(g, x + 22, y + bob + 178, cw - 44, 8, frac, hpColor(T, frac))
  g.font = `500 13px ${FONT_ROUND}`; g.fillStyle = T.inkSoft
  g.fillText(`${m.hp}/${m.maxHp} HP`, x + cw / 2, y + bob + 202)
  kbd(g, x + 12, y + bob + 26, String(i + 1), 17, 'left', e > 0.5)
  g.restore()
}

function bigText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, alpha = 1, scale = 1, font = FONT_ROUND): void {
  g.save()
  g.globalAlpha = alpha
  g.translate(x, y); g.scale(scale, scale)
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = `700 ${size}px ${font}`
  g.lineWidth = size / 9; g.strokeStyle = INK_DARK; g.lineJoin = 'round'
  g.strokeText(text, 0, 0)
  g.fillStyle = fill; g.fillText(text, 0, 0)
  g.restore()
}

const ease = (k: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3)
const back = (k: number) => { k = Math.max(0, Math.min(1, k)); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2) }

/** arena label, VS splash with both leads, 3-2-1, FIGHT! */
function intro(g: CanvasRenderingContext2D, s: SimState, def: MatchDef, hud: HudInfo): void {
  const T = tokens()
  const me = hud.me, foe = me === 0 ? 1 : 0
  if (s.phase === 'countdown') {
    const e = COUNTDOWN_TICKS - s.phaseT // 0..180
    const out = e > 120 ? ease((e - 120) / 16) : 0
    g.fillStyle = `rgba(20,12,8,${0.45 * (1 - out)})`; g.fillRect(0, 0, 1920, 1080)
    // bands: you in the Pokédex blue, the bot in the binder's red
    const bandIn = ease(e / 18)
    const sides: [number, number, string][] = [[me, -1, '#2a7bd6'], [foe, 1, '#d64545']]
    for (const [p, dir, col] of sides) {
      const pl = s.players[p]
      const off = (1 - bandIn) * 1100 * dir + out * 1300 * dir
      g.save()
      g.translate(off, 0)
      const grad = g.createLinearGradient(dir < 0 ? 0 : 1920, 0, 960, 0)
      grad.addColorStop(0, hexA(col, 0.95)); grad.addColorStop(1, hexA(col, 0.0))
      g.fillStyle = grad
      g.beginPath()
      if (dir < 0) { g.moveTo(0, 380); g.lineTo(1000, 380); g.lineTo(900, 700); g.lineTo(0, 700) }
      else { g.moveTo(1920, 380); g.lineTo(1020, 380); g.lineTo(920, 700); g.lineTo(1920, 700) }
      g.closePath(); g.fill()
      // stitching along the band, like the binder board's
      g.save(); g.setLineDash([10, 7]); g.strokeStyle = 'rgba(255,240,220,0.35)'; g.lineWidth = 2
      g.beginPath(); if (dir < 0) { g.moveTo(0, 392); g.lineTo(760, 392); g.moveTo(0, 688); g.lineTo(700, 688) } else { g.moveTo(1920, 392); g.lineTo(1160, 392); g.moveTo(1920, 688); g.lineTo(1220, 688) }
      g.stroke(); g.restore()
      const lead = pl.members[Math.max(0, pl.active)]
      const kit = def.kits[lead.kit]
      const cx = dir < 0 ? 520 : 1400
      g.save()
      g.translate(cx, 520)
      if (dir < 0) g.scale(-1, 1) // face the centre
      drawMini(g, kit, shiny(def, p, Math.max(0, pl.active)), 0, 0, 260)
      g.restore()
      g.textAlign = dir < 0 ? 'left' : 'right'
      g.textBaseline = 'alphabetic'
      g.font = `700 46px ${FONT_ROUND}`; g.lineWidth = 7; g.strokeStyle = INK_DARK; g.lineJoin = 'round'
      const nx = dir < 0 ? 80 : 1840
      g.strokeText(kit.name, nx, 660); g.fillStyle = '#ffffff'; g.fillText(kit.name, nx, 660)
      g.font = `700 13px ${FONT_PIX}`; g.fillStyle = 'rgba(255,255,255,0.9)'
      const sub = `${(hud.names[p] ?? '').toUpperCase()}${pl.members.length > 1 ? ` · TEAM OF ${pl.members.length}` : ''}`
      g.fillText(sub, nx, 686)
      if (pl.members.length > 1) {
        pl.members.forEach((m, i) => {
          if (i === Math.max(0, pl.active)) return
          const k = i - (i > Math.max(0, pl.active) ? 1 : 0)
          drawMini(g, def.kits[m.kit], shiny(def, p, i), dir < 0 ? 110 + k * 56 : 1810 - k * 56, 420, 48)
        })
      }
      g.restore()
    }
    if (out < 1) {
      const k = back((e - 10) / 20)
      bigText(g, 'VS', 960, 540, 150, T.tabYellow, 1 - out, Math.max(0.01, k))
    }
    // the arena's label: a paper tag with its divider tab
    const bx = -760 + ease(e / 22) * 760 - out * 760
    g.save(); g.translate(bx, 0)
    panel(g, 40, 190, 700, 104, 10)
    tab(g, 64, 191, hud.mode === 'team' ? 'TEAM BATTLE' : '1 V 1', T.tabYellow, T.tabYellowInk)
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'
    g.font = `700 13px ${FONT_PIX}`; g.fillStyle = T.inkSoft
    g.fillText(`${hud.difficulty.toUpperCase()} BOTS`, 70, 226)
    g.font = `700 46px ${FONT_ROUND}`; g.fillStyle = T.ink
    g.fillText(hud.arenaName, 68, 276, 650)
    g.restore()
    const n = Math.ceil(s.phaseT / 60)
    const local = (s.phaseT % 60) / 60
    if (e > 120) bigText(g, String(n), 960, 540, 200, '#ffffff', 1, 0.8 + 0.5 * local)
    else bigText(g, String(n), 960, 660, 44, '#ffffff', 0.9, 0.9 + 0.3 * local)
  } else if (s.phase === 'fight' && s.phaseT < 50) {
    const k = s.phaseT / 50
    bigText(g, 'FIGHT!', 960, 520, 160, T.tabYellow, 1 - k * k, back(s.phaseT / 10) * (1 + k * 0.2))
  }
}

/** words of `text` wrapped to `w` px in the current font */
function wrap(g: CanvasRenderingContext2D, text: string, w: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (!word) continue
    const next = line ? `${line} ${word}` : word
    if (g.measureText(next).width > w && line) { out.push(line); line = word } else line = next
  }
  if (line) out.push(line)
  return out
}

/** the attack sheet peek (hold I): every attack of your active Pokémon, the card text, what it does in the arena and
 * its predicted damage on the nearest foe. The match keeps running under it */
function peek(g: CanvasRenderingContext2D, s: SimState, def: MatchDef, pk: PeekInfo): void {
  const T = tokens()
  const w = 1120, pad = 22, x = 960 - w / 2, y0 = 160
  const textW = w - 2 * pad - 20
  const tp = pk.target >= 0 ? s.players[pk.target] : null
  const foeName = tp && tp.active >= 0 ? def.kits[tp.members[tp.active].kit].name : ''
  // lay out first (heights), then draw
  const blocks = pk.sheet.map((sa) => {
    g.font = `500 16px ${FONT_ROUND}`
    const card = sa.text === null ? ['card text: not in your binder'] : sa.text ? wrap(g, sa.text, textW) : ['no card text: its printed damage']
    g.font = `500 15px ${FONT_ROUND}`
    const arena = [sa.arena.shape, ...sa.arena.does, ...(sa.arena.curve ? [sa.arena.curve] : [])].flatMap((l) => wrap(g, l, textW - 16))
    return { sa, card, arena, h: 44 + card.length * 21 + 12 + arena.length * 20 + 18 }
  })
  const h = 70 + blocks.reduce((n, b) => n + b.h, 0)
  g.save()
  g.globalAlpha = 0.97
  panel(g, x, y0, w, h, 12)
  g.restore()
  tab(g, x + 24, y0 + 1, 'ATTACKS · HOLD I', PREDICT, '#03262b')
  g.textAlign = 'left'; g.textBaseline = 'alphabetic'
  g.font = `700 28px ${FONT_ROUND}`; g.fillStyle = T.ink
  g.fillText(pk.kit.name, x + pad, y0 + 44)
  const nw = g.measureText(pk.kit.name).width
  g.font = `600 19px ${FONT_HAND}`; g.fillStyle = T.inkSoft
  g.fillText(`${pk.kit.types.join(' / ')}${foeName ? ` · predictions against ${foeName}` : ''}`, x + pad + nw + 14, y0 + 43)
  let y = y0 + 64
  blocks.forEach(({ sa, card, arena, h: bh }, i) => {
    const a = sa.atk
    const col = tint(a.element)
    rr(g, x + pad - 8, y, w - 2 * pad + 16, bh - 8, 8); g.fillStyle = mix(T.paper2, col, 0.1, 0.9); g.fill()
    g.fillStyle = col; rr(g, x + pad - 8, y, 4, bh - 8, 2); g.fill()
    // cost, name, the printed damage in gold, the prediction in cyan
    const need = costPips(a.cost)
    for (let k = 0; k < need; k++) epip(g, x + pad + 10 + k * 22, y + 22, 9, true)
    g.textAlign = 'left'; g.textBaseline = 'middle'
    g.font = `700 22px ${FONT_ROUND}`; g.fillStyle = T.ink
    const nx = x + pad + 10 + Math.max(1, need) * 22 + (need ? 6 : 30)
    g.fillText(a.name, nx, y + 22)
    if (!need) { g.font = `600 17px ${FONT_HAND}`; g.fillStyle = T.inkSoft; g.fillText('free', x + pad + 2, y + 22) }
    g.textAlign = 'right'
    g.font = `700 28px ${FONT_ROUND}`; g.fillStyle = PRINTED
    const dx = x + w - pad - 6
    g.fillText(a.damage || '—', dx, y + 22)
    const dw = g.measureText(a.damage || '—').width
    const p = pk.predictions[i]
    if (p && p.max > 0) {
      g.font = `700 20px ${FONT_ROUND}`; g.fillStyle = PREDICT
      g.fillText(`${predictLabel(p)}${p.eff > 0 ? ' · weak' : p.eff < 0 ? ' · resists' : ''}${p.ko === 'always' ? ' · KO' : p.ko === 'maybe' ? ' · may KO' : ''}`, dx - dw - 18, y + 23)
    }
    let ly = y + 50
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'
    g.font = sa.text ? `500 16px ${FONT_ROUND}` : `600 18px ${FONT_HAND}`; g.fillStyle = sa.text ? T.ink : T.inkSoft
    for (const l of card) { g.fillText(l, x + pad + 10, ly + 4); ly += 21 }
    ly += 10
    g.font = `700 10px ${FONT_PIX}`; g.fillStyle = PREDICT
    g.fillText('IN THE ARENA', x + pad + 10, ly)
    ly += 2
    g.font = `500 15px ${FONT_ROUND}`
    arena.forEach((l, k) => { g.fillStyle = k === 0 ? T.inkSoft : T.ink; g.fillText(l, x + pad + 26, ly + 17 + k * 20) })
    y += bh
  })
}

/** the controls: key chips and what they do */
function controls(g: CanvasRenderingContext2D, s: SimState, me: number): void {
  const T = tokens()
  const x = 1920 - 300, y = 1080 - 146
  panel(g, x, y, 280, 128, 10)
  const team = s.players[me].members.length > 1
  const lines: [string, string][] = [['WASD', 'move · mouse aims'], ['click · J K L', 'hold: aim · let go: fire'], ['Space', 'dodge'], [team ? '1-6' : 'F', team ? 'swap · F evolve' : 'evolve'], ['I', 'hold: attack info'], ['Esc', 'menu · Q quits']]
  lines.forEach(([k, d], i) => {
    const ly = y + 14 + i * 20
    const kw = kbd(g, x + 14, ly, k, 11)
    g.textAlign = 'left'; g.textBaseline = 'middle'
    g.font = `500 13.5px ${FONT_ROUND}`; g.fillStyle = T.inkSoft
    g.fillText(d, x + 22 + kw, ly + 1, 280 - 36 - kw)
  })
}

/** a panel rect in design px */
export interface HudRect { x: number; y: number; w: number; h: number }
/** the panels that sit over the arena's edge rows (top trainer cards and timer, bottom energy / attacks / keys) */
export const HUD_RECTS: Record<string, HudRect> = {
  me: { x: 20, y: 24, w: 520, h: 118 }, foe: { x: 1920 - 540, y: 24, w: 520, h: 118 }, timer: { x: 960 - 90, y: 24, w: 180, h: 88 },
  energy: { x: 20, y: 1080 - 146, w: 440, h: 128 }, attacks: { x: 960 - 520, y: 1080 - 124, w: 1040, h: 104 }, keys: { x: 1920 - 300, y: 1080 - 146, w: 280, h: 128 },
}
/** does an on-field fighter's drawn body (the sprite above its position, its shadow below) overlap the rect */
export function fighterUnder(s: SimState, rc: HudRect): boolean {
  return s.players.some((pl) => {
    if (pl.active < 0) return false
    const f = pl.fighter
    const x = f.x / 256, y = f.y / 256
    const x0 = x - f.r * 1.5, x1 = x + f.r * 1.5, y0 = y - f.r * 3.4, y1 = y + f.r * 1.2
    return x1 > rc.x && x0 < rc.x + rc.w && y1 > rc.y && y0 < rc.y + rc.h
  })
}
/** faded panels (render state only): a panel with a fighter under it eases to HUD_SEE_THROUGH so the fighter shows */
const HUD_SEE_THROUGH = 0.28
const fades = new Map<string, number>()
function faded(g: CanvasRenderingContext2D, s: SimState, key: string, draw: () => void): void {
  const want = fighterUnder(s, HUD_RECTS[key]) ? HUD_SEE_THROUGH : 1
  const cur = fades.get(key) ?? 1
  const a = cur + Math.sign(want - cur) * Math.min(Math.abs(want - cur), 0.12)
  fades.set(key, a)
  if (a >= 1) { draw(); return }
  g.save(); g.globalAlpha = a; draw(); g.restore()
}

export function drawHud(g: CanvasRenderingContext2D, s: SimState, def: MatchDef, hud: HudInfo, t = 0): void {
  const me = hud.me, foe = me === 0 ? 1 : 0
  faded(g, s, 'me', () => trainer(g, s, def, me, 20, false, hud.names[me] ?? 'You', true))
  faded(g, s, 'foe', () => trainer(g, s, def, foe, 1920 - 540, true, hud.names[foe] ?? 'Foe', false))
  teamRow(g, s, def, hud, me, 20, false, true, t)
  teamRow(g, s, def, hud, foe, 1920 - 540, true, false, t)
  faded(g, s, 'timer', () => timer(g, s, def, hud, t))
  faded(g, s, 'energy', () => energy(g, s, def, me, hud.evoPick ?? 1, t))
  faded(g, s, 'attacks', () => attacks(g, s, def, hud, t, 1080 - 124))
  if ((hud.mode ?? def.mode) === 'team' || s.players[me].members.length > 1) teamBar(g, s, def, hud, t)
  faded(g, s, 'keys', () => controls(g, s, me))
  // the aim prediction over the attack card stays at full strength when the panel fades over a fighter
  attackPrediction(g, s, def, hud)

  if (hud.peek) peek(g, s, def, hud.peek)
  picker(g, s, def, hud, t)
  intro(g, s, def, hud)
  // paused: the page's pause menu covers the arena (index.html #pause)
}

function timer(g: CanvasRenderingContext2D, s: SimState, def: MatchDef, hud: HudInfo, t: number): void {
  const T = tokens()

  // timer, and the arena on a paper tag under it
  const elapsed = s.phase === 'fight' ? s.phaseT : s.phase === 'over' ? s.fightT : 0
  const left = Math.max(0, (def.matchTicks ?? MATCH_TICKS) - elapsed)
  const secs = Math.ceil(left / 60)
  panel(g, 960 - 74, 24, 148, 58, 10)
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = `700 34px ${FONT_ROUND}`; g.fillStyle = secs <= 10 && s.phase === 'fight' && t % 30 < 15 ? T.foe : T.ink
  g.fillText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 960, 54)
  const label = `${hud.arenaName} · ${hud.difficulty}`
  g.font = `600 17px ${FONT_HAND}`
  const lw = g.measureText(label).width + 22
  rr(g, 960 - lw / 2, 88, lw, 22, 11); g.fillStyle = mix(T.paper, T.paper, 0, 0.9); g.fill()
  g.lineWidth = 1; g.strokeStyle = T.chipLine; g.stroke()
  g.fillStyle = T.inkSoft; g.fillText(label, 960, 99.5)
}
