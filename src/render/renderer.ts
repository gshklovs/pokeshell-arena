// The Canvas2D renderer (docs/SPEC.md section 1). It reads sim states and never writes them. Positions are
// interpolated between the previous and current tick. Everything here is render-only: particles, trails, shake,
// hit flash, squash, afterimages, telegraphs, KO animations, sounds. Math.random is fine in here; the
// sim never sees any of it (the one thing the page reads back is takeHitstop(), which only pauses the page loop).
import { sfx, type SfxName } from '../audio/sfx'
import type { LoadedArena } from '../game/arena'
import { FP, icos, isin } from '../sim/fixed'
import { COLS, solid } from '../sim/terrain'
import { TILE, evoShiny, type FighterKit, type MatchDef, type ResolvedAttack, type SimEvent, type SimState } from '../sim/types'
import { drawnPx, walkHop, simTime, type Snapshot } from './pose'
import { debugOverlay, drawDebugOverlay } from './debug'
import { airborne } from '../sim/movement'
import { drawHud, drawMini, FONT, PREDICT, predictLabel, teamRowSlot, type HudInfo } from './hud'
import { TYPE_COLOR, boundsOf, hexA, sprite, tintOf, whiteOf } from './sprites'
import { TerrainFx } from './terrainfx'
import { drawConfirm, drawDashGlyph, drawImpact, drawLandGlyph, drawMeleeTelegraph, drawMound, drawReel, drawSwingView, swoopPath } from './meleefx'
import { LANDING } from '../sim/melee'
import { drawArea, drawAreaAir, drawBeam, drawCone, drawShot, type Vfx } from './vfx'
import { SIG } from './sig'
import { drawAimStrip, drawBadges, drawBenchMarks, stepAimFade, type Anchor } from './aimfx'
import type { AimInfo } from '../game/aiminfo'

export type { HudInfo } from './hud'

export const W = 1920
export const H = 1080
const T = 40
const TAU = Math.PI * 2

export { snapshot, type Snapshot } from './pose'

type PKind = 'dot' | 'spark' | 'ember' | 'drop' | 'leaf' | 'star' | 'smoke' | 'shard'
interface Particle { x: number; y: number; vx: number; vy: number; t: number; life: number; color: string; r: number; kind: PKind; g: number; rot: number; vr: number }
interface Floater { x: number; y: number; vx: number; vy: number; text: string; color: string; t: number; life: number; size: number; pop: boolean }
interface Ring { x: number; y: number; r0: number; r1: number; t: number; life: number; color: string; w: number }
interface FighterFx {
  flash: number
  squash: number
  sqx: number
  sqy: number
  pop: number
  after: { x: number; y: number; facing: number; t: number; img: HTMLImageElement | null; scale: number }[]
  dodging: boolean
  lastHp: number
}
interface EvoAnim { p: number; from: FighterKit; to: FighterKit; fromShiny: boolean; toShiny: boolean; t: number }
const EVO_ANIM = 64
interface KoAnim { x: number; y: number; kit: FighterKit; shiny: boolean; facing: number; t: number; life: number }

/** a trajectory preview (render-only, floats): the path a shot of this shape would take from (x, y) along angle a,
 * following the sim's path math (shapes.ts advanceProjectiles) closely enough to be honest about where it goes */
interface PathPreview { pts: { x: number; y: number }[]; land?: { x: number; y: number; r: number }; arc?: boolean; back?: boolean }
function pathPreview(s: SimState, x: number, y: number, aim: number, sh: ResolvedAttack['shape'], r: number, foe: { x: number; y: number } | null, ph = 0): PathPreview {
  const n = (key: string, d: number) => (typeof sh[key] === 'number' ? (sh[key] as number) : d)
  const path = (sh.path as string | undefined) ?? 'straight'
  const bdeg = (b: number) => (b / 256) * TAU
  const blocked = (px: number, py: number) => solid(s, Math.floor(px / T), Math.floor(py / T))
  if (sh.kind === 'dash') {
    const d = n('distance', 200), a = bdeg(aim)
    const end = { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d }
    return path === 'leap' ? { pts: [{ x, y }, end], land: { ...end, r: n('blast', n('radius', r) + 30) }, arc: true } : { pts: [{ x, y }, end] }
  }
  const range = n('range', 600), speed = Math.max(1, n('speed', 12))
  const amp = n('amp', 20), period = Math.max(2, n('period', 10)), homing = n('homing', 0)
  if (path === 'lob') {
    const a = bdeg(aim)
    const end = { x: x + Math.cos(a) * range, y: y + Math.sin(a) * range }
    return { pts: [{ x, y }, end], land: { ...end, r: n('blast', 60) }, arc: true }
  }
  let px = x, py = y, head = bdeg(aim), left = range, age = 0, bounces = path === 'bounce' ? n('bounces', 2) : 0
  const base0 = head
  let base = base0
  const pts = [{ x, y }]
  for (let i = 0; i < 400 && left > 0; i++) {
    if (homing > 0 && foe) {
      const want = Math.atan2(foe.y - py, foe.x - px)
      let d = want - head
      while (d > Math.PI) d -= TAU
      while (d < -Math.PI) d += TAU
      head += Math.max(-bdeg(homing), Math.min(bdeg(homing), d))
    }
    if (path === 'zigzag') head = base + (Math.trunc(age / period) % 2 === 0 ? bdeg(amp) : -bdeg(amp))
    else if (path === 'weave') head = base + Math.sin((age / (period * 2)) * TAU) * bdeg(amp)
    else if (path === 'spiral') head = base + Math.sin((age / period) * TAU) * bdeg(amp) * Math.min(age, 24) / 24
    else if (path === 'helix') head = base + Math.sin((age / (period * 2)) * TAU + TAU / 4 + ph) * bdeg(amp)
    else if (path === 'boomerang' && left <= range / 2) {
      pts.push({ x: px, y: py }, { x, y })
      return { pts, back: true }
    }
    age++
    const nx = px + Math.cos(head) * speed, ny = py + Math.sin(head) * speed
    if (path !== 'phase' && blocked(nx, ny)) {
      if (bounces-- > 0) {
        const vx = Math.cos(head), vy = Math.sin(head)
        const flipY = blocked(px, ny), flipX = blocked(nx, py) || !flipY
        head = Math.atan2(flipY ? -vy : vy, flipX ? -vx : vx)
        base = head
        pts.push({ x: px, y: py })
        continue
      }
      pts.push({ x: px, y: py })
      return { pts }
    }
    px = nx; py = ny; left -= speed
    if (path !== 'straight' || homing > 0 || i % 8 === 0) pts.push({ x: px, y: py })
  }
  pts.push({ x: px, y: py })
  return { pts }
}

/** a fused shot's fuse (shape.fuse): where it stuck, the area it bursts from is drawn as the stuck shot */
function fuseOf(atk: ResolvedAttack | undefined): number {
  return atk?.shape.kind === 'projectile' && typeof atk.shape.fuse === 'number' ? atk.shape.fuse : 0
}

const DEFAULT_PALETTE = { floor: '#6f8f55', wall: '#2e3a28', water: '#2f6fb8', grass: '#3f7c34', hazard: '#c2532a', prop: '#8a6a3a', pit: '#0c0818', low: '#5a5a48' }
const MAX_PARTICLES = 900

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }
const rnd = (a: number, b: number) => a + Math.random() * (b - a)

/** the element's particle look */
function elementKind(el: string): { kind: PKind; g: number; colors: string[] } {
  switch (el) {
    case 'Fire': return { kind: 'ember', g: -0.08, colors: ['#ffcf4a', '#ff8a2a', '#ff5a1e'] }
    case 'Water': return { kind: 'drop', g: 0.18, colors: ['#bfe6ff', '#6cb8ff', '#3f8fe0'] }
    case 'Lightning': return { kind: 'spark', g: 0, colors: ['#fffbd0', '#ffe94a', '#ffd21e'] }
    case 'Grass': return { kind: 'leaf', g: 0.05, colors: ['#9be870', '#5dbb4f', '#3f8f36'] }
    case 'Psychic': return { kind: 'star', g: -0.02, colors: ['#f0c8ff', '#c98cff', '#ff8ad8'] }
    case 'Fairy': return { kind: 'star', g: -0.02, colors: ['#ffe0f4', '#ff9fd6', '#ffffff'] }
    case 'Fighting': return { kind: 'shard', g: 0.2, colors: ['#e8b080', '#c07840', '#8a5a30'] }
    case 'Darkness': return { kind: 'smoke', g: -0.03, colors: ['#8a7fb0', '#4a4068', '#2a2440'] }
    case 'Metal': return { kind: 'spark', g: 0.12, colors: ['#ffffff', '#d0dce6', '#9fb0bd'] }
    case 'Dragon': return { kind: 'ember', g: -0.04, colors: ['#ffe28a', '#c9a13a', '#8a5ad0'] }
    default: return { kind: 'dot', g: 0.05, colors: ['#ffffff', '#e8e4d8', '#c8c4b8'] }
  }
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D
  private floaters: Floater[] = []
  private particles: Particle[] = []
  private rings: Ring[] = []
  private kos: KoAnim[] = []
  private evos: EvoAnim[] = []
  private banner: { text: string; sub: string; t: number } | null = null
  /** "Zeraora VMAX KO'd · 2/3" when an enemy goes down (full elimination: every KO counts toward the end) */
  private koBanner: { text: string; sub: string; last: boolean; t: number } | null = null
  private whiteout = 0
  private trails = new Map<number, { x: number; y: number }[]>()
  private fx: FighterFx[] = []
  private base: HTMLCanvasElement | null = null
  private terrain: TerrainFx
  private frame = 0
  private me = 0
  private lastCount = -1
  private hitstop = 0
  // melee juice (meleefx.ts, docs/MELEE.md 3.5): swings already heard (the whoosh plays once), last tick's dashes,
  // impact frames, hit-confirm brackets, the camera punch-in and the shake's direction
  private seenSwings = new Set<number>()
  private lastDash: boolean[] = []
  private impacts: { x: number; y: number; t: number; life: number; dir: number; color: string }[] = []
  private confirms: { p: number; t: number; life: number }[] = []
  /** live signature-move impact flourishes (sig/*.ts) */
  private sigFx: { look: string; el: string; x: number; y: number; r: number; t: number; life: number; id: number }[] = []
  private punch = 0
  private punchAt = { x: W / 2, y: H / 2 }
  private shakeDir = { x: 0, y: 0 }
  private delayed: { t: number; name: SfxName; pan: number }[] = []
  /** the aim info's fade (0..1) and the last info shown, kept to fade out after a release or cancel */
  private aimA = 0
  private aimLast: AimInfo | null = null
  /** the attack whose shape the aim telegraph previews for the local player (the last one they cast) */
  previewAttack = 0
  shake = 0
  /** clickable team-bar / picker slots, in design px, rebuilt every render */

  constructor(readonly canvas: HTMLCanvasElement, readonly arena: LoadedArena, readonly def: MatchDef) {
    canvas.width = W
    canvas.height = H
    this.ctx = canvas.getContext('2d')!
    this.terrain = new TerrainFx(arena.def.tiles)
    this.buildBase()
  }

  /** sim ticks the page loop should freeze for (render-only hit-stop); resets to 0 */
  takeHitstop(): number {
    const n = this.hitstop
    this.hitstop = 0
    return n
  }

  private fighterFx(p: number): FighterFx {
    while (this.fx.length <= p) this.fx.push({ flash: 0, squash: 0, sqx: 0, sqy: 0, pop: 0, after: [], dodging: false, lastHp: -1 })
    return this.fx[p]
  }

  /** the static layer: bg.png, or the grid drawn procedurally from the palette */
  private buildBase(): void {
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const g = c.getContext('2d')!
    g.imageSmoothingEnabled = false
    if (this.arena.bg) {
      g.drawImage(this.arena.bg, 0, 0, W, H)
    } else {
      const pal = { ...DEFAULT_PALETTE, ...(this.arena.def.file.palette ?? {}) }
      const tiles = this.arena.def.tiles
      for (let ty = 0; ty < 27; ty++) for (let tx = 0; tx < COLS; tx++) {
        const t = tiles[ty * COLS + tx]
        const col = t === TILE.WALL ? pal.wall : t === TILE.WATER ? pal.water : t === TILE.GRASS ? pal.grass : t === TILE.HAZARD ? pal.hazard : t === TILE.PIT ? pal.pit : t === TILE.LOW ? pal.low : pal.floor
        g.fillStyle = col
        g.fillRect(tx * T, ty * T, T, T)
        const n = (tx * 73856093) ^ (ty * 19349663)
        g.fillStyle = 'rgba(255,255,255,0.05)'
        if (n & 1) g.fillRect(tx * T + (n & 15) * 2, ty * T + ((n >> 4) & 15) * 2, 4, 4)
        if (t === TILE.WALL) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(tx * T, ty * T + T - 8, T, 8) }
        if (t === TILE.LOW) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(tx * T, ty * T + T - 4, T, 4) }
        if (t === TILE.GRASS) { g.fillStyle = 'rgba(20,60,20,0.6)'; for (let k = 0; k < 4; k++) g.fillRect(tx * T + 6 + k * 9, ty * T + 12 + (k % 2) * 8, 3, 14) }
      }
    }
    const tint = (this.arena.def.file.ambient as { tint?: string } | undefined)?.tint
    if (tint && /^#[0-9a-f]{6}$/i.test(tint)) { g.globalCompositeOperation = 'multiply'; g.fillStyle = hexA(tint, 0.12); g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over' }
    // a soft vignette
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05)
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)')
    g.fillStyle = v; g.fillRect(0, 0, W, H)
    this.base = c
  }

  private pan(x: number): number { return (x / W) * 2 - 1 }
  private play(name: SfxName, x = W / 2, opts: { element?: string; big?: boolean } = {}): void { sfx.play(name, { ...opts, pan: this.pan(x) * 0.7 }) }

  private kitAt(s: SimState, p: number, member: number): FighterKit | null {
    const m = s.players[p]?.members[member]
    return m ? this.def.kits[m.kit] : null
  }

  /** events from one sim tick -> numbers, particles, flashes, sounds */
  feed(events: SimEvent[], s: SimState): void {
    // hit flash and squash run on sim ticks (they decayed per animation frame: 2.4x shorter at 144 Hz)
    for (const fx of this.fx) { if (fx.flash > 0) fx.flash--; if (fx.squash > 0) fx.squash = Math.max(0, fx.squash - 0.12) }
    // countdown beeps and the FIGHT! call
    if (s.phase === 'countdown') {
      const n = Math.ceil(s.phaseT / 60)
      if (n !== this.lastCount) { this.lastCount = n; if (n <= 3 && n > 0) this.play('countdown') }
    } else if (s.phase === 'fight' && s.phaseT === 1) this.play('fight')
    for (const d of this.delayed) d.t--
    for (const d of this.delayed.filter((d) => d.t <= 0)) this.play(d.name, (d.pan + 1) * W / 2)
    this.delayed = this.delayed.filter((d) => d.t > 0)
    const meleeNow = this.meleeStart(events, s)

    for (const e of events) {
      switch (e.k) {
        case 'dmg': {
          const x = e.x / FP, y = e.y / FP
          const big = e.amount >= 40
          const color = e.eff > 0 ? '#ffd23f' : e.eff < 0 ? '#a8b8c8' : '#ffffff'
          this.float(x + rnd(-10, 10), y - 70, `${e.amount}${e.eff > 0 ? '!' : ''}`, color, e.eff > 0 ? 50 : big ? 44 : 36, true)
          if (e.eff > 0) this.float(x, y - 128, 'SUPER EFFECTIVE!', '#ffd23f', 26, false)
          else if (e.eff < 0) this.float(x, y - 122, 'resisted', '#a8b8c8', 22, false)
          const el = e.el || ''
          const fx = this.fighterFx(e.p)
          fx.flash = 8
          fx.squash = 1
          if (el) {
            this.burstEl(x, y - 20, el, e.eff > 0 ? 26 : 16, 6)
            this.ring(x, y - 20, 10, 60 + e.amount, TYPE_COLOR[el] ?? '#fff', 16, 5)
            // squash direction: away from the attacker
            const src = e.src ?? -1
            const sf = src >= 0 ? s.players[src]?.fighter : null
            const dx = sf ? e.x - sf.x : 1, dy = sf ? e.y - sf.y : 0
            const L = Math.hypot(dx, dy) || 1
            fx.sqx = dx / L; fx.sqy = dy / L
            this.shake = Math.max(this.shake, Math.min(22, 3 + e.amount / 5 + (e.eff > 0 ? 6 : 0)))
            if (e.amount >= 30 || e.eff > 0) this.hitstop = Math.max(this.hitstop, e.eff > 0 ? 5 : e.amount >= 60 ? 5 : 3)
            this.play(e.eff > 0 ? 'superHit' : e.eff < 0 ? 'resist' : 'hit', x, { big })
            if (src >= 0 && src !== e.p && meleeNow.has(src)) this.meleeHit(e.p, x, y, e.amount, e.eff, el, fx.sqx, fx.sqy)
          } else {
            this.burst(x, y - 20, '#ffffff', 6)
            fx.sqx = 0; fx.sqy = -1
            this.play('hit', x)
          }
          break
        }
        case 'heal': { const f = s.players[e.p].fighter; this.float(f.x / FP, f.y / FP - 80, `+${e.amount}`, '#7dff9a', 32, true); this.burstEl(f.x / FP, f.y / FP - 30, 'Grass', 10, 3); this.play('heal', f.x / FP); break }
        case 'status': {
          const f = s.players[e.p].fighter
          const label: Record<string, [string, string]> = { paralyzed: ['PARALYZED', '#fff27a'], asleep: ['ASLEEP', '#a8c8ff'], confused: ['CONFUSED', '#ff9ad8'], burned: ['BURNED', '#ff8a3c'], poisoned: ['POISONED', '#c07aff'] }
          const [text, color] = label[e.status] ?? [e.status.toUpperCase(), '#ffb3ff']
          this.float(f.x / FP, f.y / FP - 150, text, color, 26, false)
          this.play('status', f.x / FP)
          break
        }
        case 'coin': { const f = s.players[e.p].fighter; this.float(f.x / FP, f.y / FP - 170, e.heads ? 'HEADS' : 'TAILS', e.heads ? '#ffe066' : '#c0c0c0', 26, true); this.play('coin', f.x / FP); break }
        case 'fizzle': {
          if (e.p !== this.me) break
          const f = s.players[e.p].fighter
          this.float(f.x / FP, f.y / FP - 140, e.why === 'energy' ? 'not enough energy' : e.why === 'retreat' ? 'need energy to retreat' : e.why, '#ff9a9a', 22, false)
          this.play('fizzle', f.x / FP)
          break
        }
        case 'cast': {
          const f = s.players[e.p].fighter
          const kit = this.kitAt(s, e.p, s.players[e.p].active)
          const atk = kit?.attacks[e.attack]
          if (atk) {
            this.play('cast', f.x / FP, { element: atk.element, big: atk.cost.length >= 3 })
            this.ring(f.x / FP, f.y / FP, 8, 50, TYPE_COLOR[atk.element] ?? '#fff', 12, 3)
          }
          if (e.p === this.me) this.previewAttack = e.attack
          break
        }
        case 'impact': {
          const x = e.x / FP, y = e.y / FP
          // a signature move's flourish where it lands (sig/*.ts impact), drawn over the fighters for a while
          const ia = e.p !== undefined && e.a !== undefined ? this.atkOf(s, e.p, e.a) : undefined
          const sig = ia?.look ? SIG[ia.look] : undefined
          // a telegraphed area's (or a fused shot's) flourish waits for it to land ('landed')
          const later = ia && ((ia.shape.kind === 'area' && ia.shape.at === 'aim') || (ia.shape.kind === 'projectile' && typeof ia.shape.fuse === 'number' && ia.shape.fuse > 0))
          if (ia && !later && sig?.impact && this.sigFx.length < 40) this.sigFx.push({ look: ia.look!, el: ia.element, x, y, r: Math.max(24, typeof ia.shape.blast === 'number' ? ia.shape.blast : 0), t: 0, life: sig.impactLife ?? 24, id: this.frame * 7 + this.sigFx.length })
          this.burstEl(x, y, e.element, 14, 5)
          this.ring(x, y, 6, 56, TYPE_COLOR[e.element] ?? '#fff', 14, 4)
          break
        }
        case 'landed': {
          const ia = this.atkOf(s, e.p, e.a)
          const sig = ia?.look ? SIG[ia.look] : undefined
          if (ia && sig?.impact && this.sigFx.length < 40) this.sigFx.push({ look: ia.look!, el: ia.element, x: e.x / FP, y: e.y / FP, r: Math.max(24, typeof ia.shape.blast === 'number' ? ia.shape.blast : typeof ia.shape.radius === 'number' ? ia.shape.radius : 0), t: 0, life: sig.impactLife ?? 24, id: this.frame * 7 + this.sigFx.length })
          break
        }
        case 'react': {
          const label: Record<string, [string, string, SfxName]> = { shock: ['ELECTRIFIED!', '#fff27a', 'shock'], ignite: ['IGNITED!', '#ff8a3c', 'ignite'], steam: ['STEAM', '#e8f4ff', 'steam'], douse: ['DOUSED', '#8fd0ff', 'douse'] }
          const [text, color, snd] = label[e.what] ?? [e.what, '#fff', 'hit' as SfxName]
          const x = e.x / FP, y = e.y / FP
          this.float(x, y - 40, text, color, 32, true)
          if (e.what === 'shock') { this.burstEl(x, y, 'Lightning', 30, 7); this.ring(x, y, 10, 160, '#fff27a', 20, 6) }
          else if (e.what === 'ignite') this.burstEl(x, y, 'Fire', 30, 5)
          else if (e.what === 'steam') for (let i = 0; i < 24; i++) this.spawn({ x: x + rnd(-40, 40), y: y + rnd(-20, 20), vx: rnd(-0.6, 0.6), vy: rnd(-2.2, -0.6), life: rnd(30, 60), color: '#eef6ff', r: rnd(8, 18), kind: 'smoke', g: -0.01 })
          else this.burstEl(x, y, 'Water', 20, 4)
          this.play(snd, x)
          break
        }
        case 'prop': {
          const x = e.x / FP, y = e.y / FP
          if (e.broken) {
            for (let i = 0; i < 26; i++) this.spawn({ x: x + rnd(-20, 20), y: y + rnd(-20, 20), vx: rnd(-5, 5), vy: rnd(-7, -1), life: rnd(30, 50), color: ['#e0c080', '#a08050', '#6a5030'][i % 3], r: rnd(4, 9), kind: 'shard', g: 0.35 })
            for (let i = 0; i < 10; i++) this.spawn({ x: x + rnd(-20, 20), y: y + rnd(-10, 10), vx: rnd(-1, 1), vy: rnd(-1.5, -0.3), life: rnd(30, 50), color: '#c8b89a', r: rnd(10, 18), kind: 'smoke', g: -0.01 })
            this.shake = Math.max(this.shake, 8)
            this.play('propBreak', x)
          } else { this.burst(x, y, '#b09060', 6); this.play('prop', x) }
          break
        }
        case 'swap': {
          const f = s.players[e.p].fighter
          const fx = this.fighterFx(e.p)
          fx.pop = 1; fx.flash = 0; fx.after = []
          const x = f.x / FP, y = f.y / FP
          this.ring(x, y - 20, 10, 90, '#ffffff', 18, 5)
          for (let i = 0; i < 18; i++) { const a = rnd(0, TAU); this.spawn({ x: x + Math.cos(a) * 20, y: y - 20 + Math.sin(a) * 14, vx: Math.cos(a) * rnd(1, 3), vy: Math.sin(a) * rnd(0.5, 2) - 0.6, life: rnd(24, 40), color: '#f4f4ff', r: rnd(8, 16), kind: 'smoke', g: -0.01 }) }
          this.play('swap', x)
          break
        }
        case 'evolve': {
          const f = s.players[e.p].fighter
          const from = this.def.kits[e.from], to = this.def.kits[e.to]
          if (!from || !to) break
          const pd = this.def.players[e.p]
          this.evos = this.evos.filter((a) => a.p !== e.p)
          this.evos.push({ p: e.p, from, to, fromShiny: !!pd?.shiny?.[e.member], toShiny: evoShiny(pd, e.to), t: 0 })
          this.banner = { text: `${from.name} evolved into ${to.name}!`, sub: e.p === this.me ? 'You' : (pd?.name ?? ''), t: 0 }
          this.play('evolve', f.x / FP)
          break
        }
        case 'ko': {
          const pl = s.players[e.p]
          const kit = this.kitAt(s, e.p, e.member)
          if (!kit) break
          const wasActive = pl.active < 0 || pl.active === e.member
          const f = pl.fighter
          const x = f.x / FP, y = f.y / FP
          if (wasActive) {
            this.kos.push({ x, y, kit, shiny: !!this.def.players[e.p]?.shiny?.[e.member], facing: f.facing, t: 0, life: 60 })
            this.float(x, y - 200, 'KO!', '#ff4d4d', 76, true)
            this.ring(x, y - 30, 20, 260, '#ffffff', 30, 10)
            this.burst(x, y - 30, '#ffffff', 40)
            this.shake = 22
            this.hitstop = Math.max(this.hitstop, 8)
          }
          this.play('ko', x)
          this.koCall(s, e.p, e.member)
          break
        }
        case 'bench': this.benchCall(s, e.p, e.member, e.amount); break
        // ---- melee (melee.ts): taps, whiffs, parries, splats, throws, interrupts
        case 'strike': {
          const x = e.x / FP, y = e.y / FP
          if (e.style === 'backstab') { this.float(x, y - 150, 'BACKSTAB!', '#c9a0ff', 26, true); break }
          const af = s.players[e.p]?.fighter
          const dx = af ? e.x - af.x : 1, dy = af ? e.y - af.y : 0, L = Math.hypot(dx, dy) || 1
          if (!e.fin) {
            // a tap: a small spark along the blow, a knock, the briefest pause
            this.sparks(x, y - 20, dx / L, dy / L, 7, TYPE_COLOR[this.elOf(s, e.p)] ?? '#ffffff')
            const fx = this.fighterFx(e.t); fx.flash = Math.max(fx.flash, 3); fx.squash = Math.max(fx.squash, 0.5); fx.sqx = dx / L; fx.sqy = dy / L
            this.hitstop = Math.max(this.hitstop, 2)
            this.play('tap', x)
          }
          if (e.p === this.me) { this.confirms = this.confirms.filter((c) => c.p !== e.t); this.confirms.push({ p: e.t, t: 0, life: 22 }) }
          break
        }
        case 'whiff': {
          const x = e.x / FP, y = e.y / FP
          this.float(x, y - 30, 'WHIFF', 'rgba(200,210,225,0.9)', 22, false)
          this.play('whiff', x)
          break
        }
        case 'parry': {
          const x = e.x / FP, y = e.y / FP
          this.float(x, y - 150, 'PARRY!', '#9fe8ff', 34, true)
          this.ring(x, y - 20, 12, 110, '#ffffff', 16, 6)
          this.impacts.push({ x, y: y - 20, t: 0, life: 6, dir: 0, color: '#9fe8ff' })
          this.hitstop = Math.max(this.hitstop, 6)
          this.shake = Math.max(this.shake, 8)
          this.play('parry', x)
          break
        }
        case 'splat': {
          const x = e.x / FP, y = e.y / FP
          this.float(x, y - 150, 'SPLAT!', '#ffb070', 34, true)
          this.impacts.push({ x, y: y - 20, t: 0, life: 7, dir: 0, color: '#ffb070' })
          for (let i = 0; i < 18; i++) this.spawn({ x: x + rnd(-16, 16), y: y - 20 + rnd(-16, 16), vx: rnd(-5, 5), vy: rnd(-6, 1), life: rnd(20, 34), color: ['#d8c0a0', '#a08060', '#ffffff'][i % 3], r: rnd(3, 7), kind: 'shard', g: 0.3 })
          this.punch = Math.max(this.punch, 0.035); this.punchAt = { x, y: y - 20 }
          this.shake = Math.max(this.shake, 16)
          this.hitstop = Math.max(this.hitstop, 8)
          this.play('splat', x)
          break
        }
        case 'throw': {
          const x = e.x / FP, y = e.y / FP
          this.ring(x, y - 20, 10, 90, '#ffffff', 14, 5)
          this.punch = Math.max(this.punch, 0.025); this.punchAt = { x, y: y - 20 }
          this.play('throw', x)
          break
        }
        case 'flinch': {
          if (!e.interrupt) break
          const f = s.players[e.p].fighter
          this.float(f.x / FP, f.y / FP - 150, 'INTERRUPTED', '#ffd23f', 24, true)
          break
        }
      }
    }
    s.players.forEach((pl, p) => { this.lastDash[p] = pl.active >= 0 && !!pl.fighter.dash })
  }

  /** the first type of player p's active Pokemon (a tap's spark colour) */
  private elOf(s: SimState, p: number): string {
    const pl = s.players[p]
    return pl && pl.active >= 0 ? this.def.kits[pl.members[pl.active].kit].types[0] ?? 'Colorless' : 'Colorless'
  }

  /** this tick's new swings and dashes (the whoosh), and the attackers whose close blow can land now */
  private meleeStart(events: SimEvent[], s: SimState): Set<number> {
    const now = new Set<number>()
    for (const e of events) if ((e.k === 'strike' && e.fin) || e.k === 'throw') now.add(e.p)
    const live = new Set<number>()
    for (const w of s.swings) {
      if (w.active <= 0) continue
      live.add(w.id)
      if (this.seenSwings.has(w.id)) continue
      this.seenSwings.add(w.id)
      const atk = this.atkOf(s, w.owner, w.attack)
      this.play('swing', w.x / FP, { big: !!atk && (atk.cost.length >= 3 || atk.baseDamage >= 60) })
    }
    for (const id of [...this.seenSwings]) if (!live.has(id)) this.seenSwings.delete(id)
    s.players.forEach((pl, p) => {
      const f = pl.active >= 0 ? pl.fighter : null
      if (f?.dash || this.lastDash[p]) now.add(p) // a dash's blows and its landing are melee hits
      if (f?.dash && !this.lastDash[p]) {
        const atk = this.atkOf(s, p, f.dash.attack)
        this.play('swing', f.x / FP, { big: !!atk && (atk.cost.length >= 3 || atk.baseDamage >= 60) })
      }
    })
    return now
  }

  /** white-and-type sparks along a direction */
  private sparks(x: number, y: number, ux: number, uy: number, n: number, color: string): void {
    const dir = Math.atan2(uy, ux)
    for (let i = 0; i < n; i++) {
      const a = dir + rnd(-0.55, 0.55), v = rnd(5, 12)
      this.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(8, 16), color: i % 3 ? '#ffffff' : color, r: rnd(2, 4), kind: 'spark', g: 0 })
    }
  }

  /** a close blow landed (a finisher, a dash, a landing, a throw): hit-stop by damage, sparks along the blow, an impact
   * frame and a punch-in for heavy ones, a directional shake, the body thud */
  private meleeHit(p: number, x: number, y: number, amount: number, eff: number, el: string, dx: number, dy: number): void {
    this.hitstop = Math.max(this.hitstop, Math.min(12, 3 + Math.floor(amount / 15) + (eff > 0 ? 3 : 0)))
    this.sparks(x, y - 20, dx, dy, 14, TYPE_COLOR[el] ?? '#ffffff')
    this.shakeDir = { x: dx, y: dy }
    this.shake = Math.max(this.shake, Math.min(24, 2 + amount / 6))
    if (amount >= 40 || eff > 0) {
      this.impacts.push({ x, y: y - 20, t: 0, life: amount >= 80 ? 7 : 5, dir: Math.atan2(dy, dx), color: TYPE_COLOR[el] ?? '#ffffff' })
      this.fighterFx(p).flash = 12
      this.punch = Math.max(this.punch, Math.min(0.04, 0.012 + amount / 3000))
      this.punchAt = { x, y: y - 20 }
    }
    this.play('thud', x, { big: amount >= 60 })
  }

  private float(x: number, y: number, text: string, color: string, size: number, pop: boolean): void {
    // one label per spot: an attack that ignites a whole patch reports it once
    if (!/^\d/.test(text) && this.floaters.some((f) => f.text === text && f.t < 20 && Math.abs(f.x - x) < 160 && Math.abs(f.y - y) < 120)) return
    this.floaters.push({ x, y, vx: pop ? rnd(-0.8, 0.8) : 0, vy: pop ? -3.2 : -0.9, text, color, t: 0, life: pop ? 58 : 70, size, pop })
    if (this.floaters.length > 60) this.floaters.shift()
  }

  private ring(x: number, y: number, r0: number, r1: number, color: string, life: number, w: number): void {
    this.rings.push({ x, y, r0, r1, t: 0, life, color, w })
  }

  private spawn(p: Partial<Particle> & { x: number; y: number; life: number; color: string }): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift()
    this.particles.push({ vx: 0, vy: 0, t: 0, r: 3, kind: 'dot', g: 0, rot: rnd(0, TAU), vr: rnd(-0.2, 0.2), ...p })
  }

  private burst(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = rnd(1, 6)
      this.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(16, 34), color, r: rnd(2, 5), kind: 'dot', g: 0.05 })
    }
  }

  /** type-coloured particles: embers rise, drops fall, sparks zip, leaves flutter */
  private burstEl(x: number, y: number, el: string, n: number, speed: number): void {
    const k = elementKind(el)
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = rnd(0.5, speed)
      this.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (k.kind === 'ember' ? 1 : 0), life: rnd(18, k.kind === 'leaf' || k.kind === 'smoke' ? 60 : 38), color: k.colors[i % k.colors.length], r: rnd(2.5, k.kind === 'smoke' ? 14 : k.kind === 'leaf' ? 7 : 5), kind: k.kind, g: k.g })
    }
  }

  render(prev: Snapshot, s: SimState, alpha: number, hud: HudInfo): void {
    const g = this.ctx
    this.frame++
    this.me = hud.me
    g.save()
    g.imageSmoothingEnabled = false
    if (this.shake > 0) {
      const k = this.shake
      // a melee blow shakes along its direction (a kick you feel), everything else at random
      const d = this.shakeDir, j = Math.sin(this.frame * 2.1)
      g.translate(rnd(-0.5, 0.5) * k * 0.6 + d.x * j * k * 0.5, rnd(-0.5, 0.5) * k * 0.6 + d.y * j * k * 0.5)
      this.shake *= 0.86
      if (this.shake < 0.4) { this.shake = 0; this.shakeDir = { x: 0, y: 0 } }
    }
    if (this.punch > 0.001) {
      // the camera punches in toward a heavy melee hit, then eases back
      const c = this.punchAt
      g.translate(c.x, c.y); g.scale(1 + this.punch, 1 + this.punch); g.translate(-c.x, -c.y)
      this.punch *= 0.84
    } else this.punch = 0
    g.drawImage(this.base!, -20, -20, W + 40, H + 40) // oversized a touch so shake never shows an edge
    this.terrain.update(s)
    this.terrain.draw(g, this.frame)
    this.drawProps(s)
    this.terrain.drawFlames(g, this.frame)
    this.ambient()
    this.drawAreas(s)
    this.drawTelegraphs(prev, s, alpha, hud)
    this.drawSwings(s, false)
    this.drawBeams(s)
    this.drawShots(prev, s, alpha)
    this.drawFighters(prev, s, alpha, hud)
    // melee swings over the fighters: the cut reads across the target it lands on
    this.drawSwings(s, true)
    this.drawAreasAir(s)
    this.drawSigFx(s)
    this.drawKos()
    this.drawMeleeFx(prev, s, alpha)
    this.drawFx()
    if (debugOverlay.on) drawDebugOverlay(g, prev, s, alpha)
    g.restore()
    drawHud(g, s, this.def, { mode: this.def.mode, ...hud }, this.frame)
    // over the HUD, so it reads where a panel fades over the target; the peek (hold I) has its own numbers
    // the aim info's strip under the prediction chip, its badges over everything
    this.drawAimInfo(prev, s, alpha, hud, false)
    if (!hud.peek) this.drawPrediction(prev, s, alpha, hud)
    this.drawAimInfo(prev, s, alpha, hud, true)
    for (const a of this.evos) if (++a.t === EVO_ANIM - 12) this.fighterFx(a.p).pop = 1
    this.evos = this.evos.filter((a) => a.t < EVO_ANIM)
    if (this.whiteout > 0) { g.fillStyle = `rgba(255,255,255,${this.whiteout * 0.8})`; g.fillRect(0, 0, W, H); this.whiteout = Math.max(0, this.whiteout - 0.08) }
    this.drawBanner()
    this.drawKoBanner()
  }

  /** embers from burning tiles, sparks off shocked water */
  private ambient(): void {
    const fs = this.terrain.fireSpots
    if (fs.length && this.frame % 2 === 0) {
      for (let k = 0; k < Math.min(4, fs.length); k++) {
        const s = fs[(Math.random() * fs.length) | 0]
        this.spawn({ x: s.x + rnd(-16, 16), y: s.y + rnd(-6, 10), vx: rnd(-0.4, 0.4), vy: rnd(-2.2, -0.8), life: rnd(30, 60), color: ['#ffd24a', '#ff8a2a', '#ffb050'][k % 3], r: rnd(2, 4), kind: 'ember', g: -0.02 })
      }
    }
    const ss = this.terrain.shockSpots
    if (ss.length && this.frame % 3 === 0) {
      const s = ss[(Math.random() * ss.length) | 0]
      for (let k = 0; k < 3; k++) { const a = rnd(0, TAU); this.spawn({ x: s.x + rnd(-14, 14), y: s.y + rnd(-14, 14), vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: rnd(8, 14), color: '#fff6a0', r: 3, kind: 'spark', g: 0 }) }
    }
  }

  private drawProps(s: SimState): void {
    const g = this.ctx
    const a = this.arena
    const inFrame = new Set<number>()
    for (const fr of a.frames) {
      const cells = fr.tiles.map(([tx, ty]) => ty * COLS + tx)
      cells.forEach((c) => inFrame.add(c))
      if (!cells.some((c) => s.tiles[c] === TILE.PROP)) continue
      if (a.props) g.drawImage(a.props, fr.x, fr.y, fr.w, fr.h, fr.at.x, fr.at.y, fr.w, fr.h)
      const root = a.def.propGroup[cells[0]]
      const full = a.def.propHp[root], left = s.propHp[root]
      if (left < full) { g.fillStyle = `rgba(0,0,0,${0.35 * (1 - left / full)})`; g.fillRect(fr.at.x, fr.at.y, fr.w, fr.h) }
    }
    for (let i = 0; i < s.tiles.length; i++) {
      if (s.tiles[i] !== TILE.PROP || inFrame.has(i)) continue
      if (a.bg && a.def.tiles[i] === TILE.PROP && !a.frames.length) continue // painted into the bg, no atlas
      const x = (i % COLS) * T, y = Math.floor(i / COLS) * T
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + T / 2, y + T - 4, T / 2 - 2, 6, 0, 0, TAU); g.fill()
      g.fillStyle = '#8a6a3a'; g.beginPath(); g.roundRect(x + 4, y + 2, T - 8, T - 8, 6); g.fill()
      g.fillStyle = '#5a4020'; g.fillRect(x + 4, y + T / 2 - 4, T - 8, 4); g.fillRect(x + T / 2 - 2, y + 2, 4, T - 8)
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 7, y + 5, T - 20, 3)
    }
  }

  /** the archetype drawers' handle (vfx.ts): the context, the frame, this renderer's particles */
  private get vfx(): Vfx {
    return { g: this.ctx, frame: this.frame, spawn: (p) => this.spawn(p) }
  }

  /** the attack a live shape belongs to (its owner's active Pokémon's), for its look */
  private atkOf(s: SimState, owner: number, attack: number): ResolvedAttack | undefined {
    const pl = s.players[owner]
    return pl.active >= 0 ? this.def.kits[pl.members[pl.active].kit].attacks[attack] : undefined
  }

  private elColor(s: SimState, owner: number, attack: number): string {
    const pl = s.players[owner]
    if (pl.active < 0) return '#ffffff'
    const a = this.def.kits[pl.members[pl.active].kit].attacks[attack]
    return TYPE_COLOR[a?.element ?? 'Colorless'] ?? '#ffffff'
  }

  private drawAreas(s: SimState): void {
    const g = this.ctx
    for (const a of s.areas) {
      const c = this.elColor(s, a.owner, a.attack)
      const fade = a.t < 12 ? a.t / 12 : 1
      const x = a.x / FP, y = a.y / FP
      const atk = this.atkOf(s, a.owner, a.attack)
      const ticks = Math.max(1, typeof atk?.shape.ticks === 'number' ? atk.shape.ticks : 1)
      if (drawArea(this.vfx, atk?.look, atk?.element ?? 'Colorless', c, { id: a.id, x, y, r: a.r, t: a.t, land: a.land ?? 0, fade, ticks, fuse: fuseOf(atk) })) continue
      const pulse = 0.5 + 0.5 * Math.sin(this.frame * 0.25)
      const grad = g.createRadialGradient(x, y, a.r * 0.2, x, y, a.r)
      grad.addColorStop(0, hexA(c, 0.08 * fade)); grad.addColorStop(0.8, hexA(c, (0.22 + 0.1 * pulse) * fade)); grad.addColorStop(1, hexA(c, 0.45 * fade))
      g.fillStyle = grad
      g.beginPath(); g.arc(x, y, a.r, 0, TAU); g.fill()
      g.save()
      g.strokeStyle = hexA(c, 0.9 * fade); g.lineWidth = 3
      g.setLineDash([14, 10]); g.lineDashOffset = -this.frame * 1.5
      g.beginPath(); g.arc(x, y, a.r - 2, 0, TAU); g.stroke()
      g.restore()
      if (this.frame % 3 === 0) {
        const an = rnd(0, TAU), rr = rnd(0, a.r)
        const pl = s.players[a.owner]
        const el = pl.active >= 0 ? this.def.kits[pl.members[pl.active].kit].attacks[a.attack]?.element ?? 'Colorless' : 'Colorless'
        this.burstEl(x + Math.cos(an) * rr, y + Math.sin(an) * rr, el, 1, 1.5)
      }
    }
  }

  /** impact frames and hit-confirm brackets (over the fighters) */
  private drawMeleeFx(prev: Snapshot, s: SimState, alpha: number): void {
    const g = this.ctx
    this.impacts = this.impacts.filter((i) => ++i.t < i.life)
    for (const i of this.impacts) drawImpact(g, i.x, i.y, i.t, i.life, i.dir, i.color)
    this.confirms = this.confirms.filter((c) => ++c.t < c.life)
    for (const c of this.confirms) {
      const pl = s.players[c.p]
      if (!pl || pl.active < 0) continue
      const f = pl.fighter, p0 = prev.fighters[c.p]
      const x = drawnPx(p0?.on ? p0.x : f.x, f.x, alpha), y = drawnPx(p0?.on ? p0.y : f.y, f.y, alpha)
      drawConfirm(g, x, y + f.r * 0.6, 84, 120, c.t, c.life, PREDICT)
    }
  }

  /** the signature moves' impact flourishes (sig/*.ts), over the fighters */
  private drawSigFx(s: SimState): void {
    this.sigFx = this.sigFx.filter((f) => f.t++ < f.life)
    for (const f of this.sigFx) SIG[f.look]?.impact?.(this.vfx, f.el, TYPE_COLOR[f.el] ?? '#ffffff', { id: f.id, x: f.x, y: f.y, r: f.r, t: f.t, life: f.life })
    void s
  }

  /** what an area has up in the air (a storm cloud, a falling rock, a rising column), over the fighters */
  private drawAreasAir(s: SimState): void {
    for (const a of s.areas) {
      const atk = this.atkOf(s, a.owner, a.attack)
      if (!atk?.look) continue
      const ticks = Math.max(1, typeof atk.shape.ticks === 'number' ? atk.shape.ticks : 1)
      drawAreaAir(this.vfx, atk.look, atk.element, this.elColor(s, a.owner, a.attack), { id: a.id, x: a.x / FP, y: a.y / FP, r: a.r, t: a.t, land: a.land ?? 0, fade: a.t < 12 ? a.t / 12 : 1, ticks, fuse: fuseOf(atk) })
    }
  }

  /** `live`: the melee swings (over the fighters), else the cones' drawn swings (under them) */
  private drawSwings(s: SimState, live: boolean): void {
    const g = this.ctx
    for (const w of s.swings) {
      if ((w.active > 0) !== live) continue
      const c = this.elColor(s, w.owner, w.attack)
      const k = 1 - w.t / 10 // 0 -> 1 over the swing
      const x = w.x / FP, y = w.y / FP
      const atk = this.atkOf(s, w.owner, w.attack)
      if (w.active > 0) {
        // a live melee swing (melee.ts), drawn as the move it is named for (meleefx.ts)
        const sh = atk?.shape
        const hf = w.held >= 0 ? s.players[w.held]?.fighter : null
        drawSwingView(g, {
          x, y, sx: w.sx / FP, sy: w.sy / FP, a: (w.aim / 256) * TAU, range: w.range, arc: (w.arc / 256) * TAU,
          style: String(sh?.style ?? 'strike'), age: w.age, wait: w.wait, every: w.every, active: w.active, strike: w.strike,
          strikes: w.strikes, live: w.live, landed: w.landed, held: hf ? { x: hf.x / FP, y: hf.y / FP } : null, color: c, el: atk?.element ?? 'Colorless',
          claw: !!sh?.claw, blade: !!sh?.blade, t: w.t, dur: w.dur,
        }, this.frame)
        continue
      }
      if (atk?.shape.kind === 'cone' && drawCone(this.vfx, atk.look, atk.element, c, { x, y, aim: (w.aim / 256) * TAU, range: w.range, arc: (w.arc / 256) * TAU, k })) continue
      const a0 = ((w.aim - w.arc / 2) / 256) * TAU, a1 = ((w.aim + w.arc / 2) / 256) * TAU
      const sweep = a0 + (a1 - a0) * Math.min(1, k * 1.6)
      const fade = 1 - Math.max(0, k - 0.5) * 2
      // a light fill of the whole arc
      g.fillStyle = hexA(c, 0.16 * fade)
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, w.range, a0, a1); g.closePath(); g.fill()
      // the crescent slash
      g.save()
      g.lineCap = 'round'
      g.strokeStyle = hexA(c, 0.85 * fade); g.lineWidth = 16
      g.beginPath(); g.arc(x, y, w.range * 0.82, a0, sweep); g.stroke()
      g.strokeStyle = `rgba(255,255,255,${0.9 * fade})`; g.lineWidth = 5
      g.beginPath(); g.arc(x, y, w.range * 0.82, Math.max(a0, sweep - 0.5), sweep); g.stroke()
      g.restore()
    }
  }

  private drawBeams(s: SimState): void {
    const g = this.ctx
    for (const b of s.beams) {
      const c = this.elColor(s, b.owner, b.attack)
      const x1 = b.x1 / FP, y1 = b.y1 / FP, x2 = b.x2 / FP, y2 = b.y2 / FP
      const batk = this.atkOf(s, b.owner, b.attack)
      if (drawBeam(this.vfx, batk?.look, batk?.element ?? 'Colorless', c, { id: b.id, x1, y1, x2, y2, w: b.w, t: b.t, ticks: typeof batk?.shape.ticks === 'number' ? batk.shape.ticks : 8 })) continue
      const flick = rnd(0.8, 1.15)
      g.save()
      g.lineCap = 'round'
      g.globalCompositeOperation = 'lighter'
      g.strokeStyle = hexA(c, 0.35); g.lineWidth = b.w * 2.2 * flick
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke()
      g.strokeStyle = hexA(c, 0.85); g.lineWidth = b.w * flick
      g.stroke()
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = Math.max(3, b.w * 0.35 * flick)
      g.stroke()
      g.restore()
      if (this.frame % 2 === 0) {
        const pl = s.players[b.owner]
        const el = pl.active >= 0 ? this.def.kits[pl.members[pl.active].kit].attacks[b.attack]?.element ?? 'Colorless' : 'Colorless'
        const k = Math.random()
        this.burstEl(lerp(x1, x2, k), lerp(y1, y2, k), el, 2, 3)
      }
    }
  }

  private drawShots(prev: Snapshot, s: SimState, alpha: number): void {
    const g = this.ctx
    const alive = new Set<number>()
    for (const pr of s.projectiles) {
      alive.add(pr.id)
      const p0 = prev.shots.get(pr.id)
      const gx = (p0 ? lerp(p0.x, pr.x, alpha) : pr.x) / FP, gy = (p0 ? lerp(p0.y, pr.y, alpha) : pr.y) / FP
      const c = this.elColor(s, pr.owner, pr.attack)
      const opl = s.players[pr.owner]
      const atk = opl.active >= 0 ? this.def.kits[opl.members[opl.active].kit].attacks[pr.attack] : undefined
      const path = (atk?.shape.path as string | undefined) ?? 'straight'
      // a lob is drawn up in the air over its shadow (height from how far along its range it is)
      let lift = 0
      if (path === 'lob' && atk) {
        const range = typeof atk.shape.range === 'number' ? atk.shape.range : 600
        const t = Math.min(1, Math.max(0, 1 - pr.left / FP / range))
        lift = Math.sin(Math.PI * t) * range * 0.18
        g.fillStyle = 'rgba(0,0,0,0.28)'
        g.beginPath(); g.ellipse(gx, gy + pr.r * 0.6, pr.r * (1.1 - lift / (range * 0.4)), pr.r * 0.45, 0, 0, TAU); g.fill()
      }
      const x = gx, y = gy - lift
      g.save()
      if (path === 'phase') g.globalAlpha = 0.6 // a shadow: it passes through walls
      let tr = this.trails.get(pr.id)
      if (!tr) { tr = []; this.trails.set(pr.id, tr) }
      tr.push({ x, y })
      if (tr.length > 12) tr.shift()
      // the archetype's own look (a wave's wall, a fireball's flames, spinning leaves...): vfx.ts
      const wall = path === 'lob' ? 0 : typeof atk?.shape.wall === 'number' ? atk.shape.wall : 0
      const heading = Math.atan2(pr.vy, pr.vx)
      if (drawShot(this.vfx, atk?.look, atk?.element ?? 'Colorless', c, { id: pr.id, x, y, a: heading, r: pr.r, wall, age: pr.age, trail: tr, kid: !!pr.kid, count: typeof atk?.shape.count === 'number' ? atk.shape.count : 1 })) { g.restore(); continue }
      // the trail: a tapering ribbon
      g.save()
      g.lineCap = 'round'
      g.globalCompositeOperation = 'lighter'
      for (let i = 1; i < tr.length; i++) {
        const k = i / tr.length
        g.strokeStyle = hexA(c, 0.5 * k)
        g.lineWidth = pr.r * 1.7 * k
        g.beginPath(); g.moveTo(tr[i - 1].x, tr[i - 1].y); g.lineTo(tr[i].x, tr[i].y); g.stroke()
      }
      const glow = g.createRadialGradient(x, y, 0, x, y, pr.r * 2.4)
      glow.addColorStop(0, hexA(c, 0.7)); glow.addColorStop(1, hexA(c, 0))
      g.fillStyle = glow
      g.beginPath(); g.arc(x, y, pr.r * 2.4, 0, TAU); g.fill()
      g.restore()
      g.fillStyle = c
      g.beginPath(); g.arc(x, y, pr.r, 0, TAU); g.fill()
      g.fillStyle = 'rgba(255,255,255,0.9)'
      g.beginPath(); g.arc(x - pr.r / 4, y - pr.r / 4, pr.r / 2.2, 0, TAU); g.fill()
      // the type's mark on the shot (the flavour, render-only): Psychic a pulsing ring (it homes), Lightning crackle,
      // Metal a hard rim, Darkness a dark core, Dragon a piercing tip
      const el0 = atk?.element ?? 'Colorless'
      g.lineWidth = 2
      if (el0 === 'Psychic') { g.strokeStyle = hexA(c, 0.8); g.beginPath(); g.arc(x, y, pr.r * (1.5 + 0.25 * Math.sin(this.frame / 4)), 0, TAU); g.stroke() }
      else if (el0 === 'Lightning') {
        g.strokeStyle = '#fff7a8'; g.beginPath()
        for (let j = 0; j < 2; j++) { const a0 = Math.random() * TAU; g.moveTo(x, y); g.lineTo(x + Math.cos(a0) * pr.r * 1.2, y + Math.sin(a0) * pr.r * 1.2); g.lineTo(x + Math.cos(a0 + 0.6) * pr.r * 1.9, y + Math.sin(a0 + 0.6) * pr.r * 1.9) }
        g.stroke()
      } else if (el0 === 'Metal') { g.strokeStyle = '#e8eef4'; g.beginPath(); g.arc(x, y, pr.r, 0, TAU); g.stroke() }
      else if (el0 === 'Darkness') { g.fillStyle = 'rgba(20,10,30,0.8)'; g.beginPath(); g.arc(x, y, pr.r * 0.45, 0, TAU); g.fill() }
      else if (el0 === 'Dragon') {
        const ha = Math.atan2(pr.vy, pr.vx)
        g.fillStyle = hexA(c, 0.9); g.beginPath(); g.moveTo(x + Math.cos(ha) * pr.r * 2, y + Math.sin(ha) * pr.r * 2)
        g.lineTo(x + Math.cos(ha + 2.4) * pr.r, y + Math.sin(ha + 2.4) * pr.r); g.lineTo(x + Math.cos(ha - 2.4) * pr.r, y + Math.sin(ha - 2.4) * pr.r); g.fill()
      }
      g.restore()
      if (this.frame % 2 === 0) {
        const el = el0
        const k = elementKind(el)
        this.spawn({ x: x + rnd(-pr.r, pr.r) * 0.6, y: y + rnd(-pr.r, pr.r) * 0.6, vx: -pr.vx / FP * 0.08 + rnd(-0.5, 0.5), vy: -pr.vy / FP * 0.08 + rnd(-0.5, 0.5), life: rnd(12, 24), color: k.colors[(Math.random() * 3) | 0], r: rnd(2, 4), kind: k.kind === 'smoke' ? 'dot' : k.kind, g: k.g * 0.5 })
      }
    }
    for (const id of [...this.trails.keys()]) if (!alive.has(id)) this.trails.delete(id)
  }

  /** where a line from (x, y) along angle a stops (first solid tile), up to len px */
  private reachLine(s: SimState, x: number, y: number, a: number, len: number): number {
    const cx = Math.cos(a), cy = Math.sin(a)
    for (let d = 8; d <= len; d += 8) {
      if (solid(s, Math.floor((x + cx * d) / T), Math.floor((y + cy * d) / T))) return d - 8
    }
    return len
  }

  /** where a shot ends, what it does there (the telegraph): a split's fan of shards, a fused shot's burst ring with a
   * clock mark */
  private shotEnd(sh: ResolvedAttack['shape'], x: number, y: number, a: number, edge: string): void {
    const g = this.ctx
    const n = (key: string, d: number) => (typeof sh[key] === 'number' ? (sh[key] as number) : d)
    g.save(); g.setLineDash([4, 6]); g.strokeStyle = edge; g.lineWidth = 2
    const split = n('split', 0)
    if (split > 0) {
      const spread = (n('splitSpread', 0) / 256) * TAU, L = Math.min(90, n('splitRange', 140) * 0.6)
      for (let k = 0; k < Math.min(8, split); k++) {
        const b = spread > 0 ? a + (k - (split - 1) / 2) * spread : a + (k / split) * TAU
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(b) * L, y + Math.sin(b) * L); g.stroke()
      }
    }
    if (n('fuse', 0) > 0) {
      const r = n('blast', 60)
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke()
      g.setLineDash([]); g.beginPath(); g.arc(x, y, 9, 0, TAU); g.moveTo(x, y); g.lineTo(x, y - 7); g.moveTo(x, y); g.lineTo(x + 5, y); g.stroke()
    }
    g.restore()
  }

  /** a shape preview along the aim: faint for the local player's aim, filling while any fighter winds up */
  private telegraph(s: SimState, x: number, y: number, aim: number, atk: ResolvedAttack, r: number, color: string, k: number | null, mine: boolean, foe: { x: number; y: number } | null = null): void {
    const g = this.ctx
    const sh = atk.shape
    const n = (key: string, d: number) => (typeof sh[key] === 'number' ? (sh[key] as number) : d)
    const a = (aim / 256) * TAU
    const cx = Math.cos(a), cy = Math.sin(a)
    const charging = k !== null
    const edge = charging ? hexA(color, 0.9) : mine ? 'rgba(255,255,255,0.5)' : hexA(color, 0.4)
    const body = charging ? hexA(color, 0.14) : 'rgba(255,255,255,0.07)'
    const fill = hexA(color, 0.35)
    g.save()
    g.lineWidth = charging ? 3 : 2
    g.strokeStyle = edge
    if (!charging) g.setLineDash([10, 8])
    const capsule = (len: number, w: number) => {
      g.save(); g.translate(x, y); g.rotate(a)
      g.beginPath(); g.roundRect(r * 0.5, -w / 2, Math.max(w, len - r * 0.5), w, w / 2)
      g.fillStyle = body; g.fill(); g.stroke()
      if (charging) { g.beginPath(); g.roundRect(r * 0.5, -w / 2, Math.max(1, (len - r * 0.5) * k!), w, w / 2); g.fillStyle = fill; g.fill() }
      // arrow tip
      g.setLineDash([]); g.beginPath(); g.moveTo(len - 14, -10); g.lineTo(len, 0); g.lineTo(len - 14, 10); g.stroke()
      g.restore()
    }
    // a shaped trajectory (a lob, leap, homing curve, zigzag, boomerang, bounce, ...): draw the path it takes
    const fancy = (sh.kind === 'projectile' && ((sh.path && sh.path !== 'straight') || n('homing', 0) > 0)) || (sh.kind === 'dash' && sh.path === 'leap')
    if (fancy) {
      const count = sh.kind === 'projectile' ? Math.max(1, n('count', 1)) : 1, spread = n('spread', 0)
      for (let i = 0; i < count; i++) {
        const aa = aim + i * spread - ((count - 1) * spread) / 2
        const pv = pathPreview(s, x, y, aa, sh, r, foe, sh.path === 'helix' ? (i / count) * TAU : 0)
        const w = sh.kind === 'dash' ? n('radius', r) * 2 : n('radius', 10) * 2
        const trace = (upto: number) => {
          g.beginPath()
          if (pv.arc) {
            // an arc through the air (height ~ a third of the distance) over its ground shadow
            const a0 = pv.pts[0], a1 = pv.pts[pv.pts.length - 1]
            const mx = (a0.x + a1.x) / 2, my = (a0.y + a1.y) / 2 - Math.hypot(a1.x - a0.x, a1.y - a0.y) * 0.35
            g.moveTo(a0.x, a0.y)
            if (upto >= 1) g.quadraticCurveTo(mx, my, a1.x, a1.y)
            else { const t = upto, qx = lerp(lerp(a0.x, mx, t), lerp(mx, a1.x, t), t), qy = lerp(lerp(a0.y, my, t), lerp(my, a1.y, t), t); g.quadraticCurveTo(lerp(a0.x, mx, t), lerp(a0.y, my, t), qx, qy) }
          } else {
            const last = Math.max(1, Math.round((pv.pts.length - 1) * upto))
            g.moveTo(pv.pts[0].x, pv.pts[0].y)
            for (let j = 1; j <= last; j++) g.lineTo(pv.pts[j].x, pv.pts[j].y)
          }
        }
        g.save()
        g.lineCap = 'round'; g.lineJoin = 'round'
        if (pv.arc) {
          // the ground line under the arc: the shot is above everything on the way
          g.setLineDash([4, 10]); g.lineWidth = 2; g.strokeStyle = hexA(color, 0.35)
          g.beginPath(); g.moveTo(pv.pts[0].x, pv.pts[0].y); g.lineTo(pv.pts[1].x, pv.pts[1].y); g.stroke()
        }
        g.setLineDash([]); g.lineWidth = w; g.strokeStyle = body; trace(1); g.stroke()
        if (charging) { g.lineWidth = w; g.strokeStyle = fill; trace(k!); g.stroke() }
        g.lineWidth = charging ? 3 : 2; g.strokeStyle = edge
        if (!charging) g.setLineDash([10, 8])
        trace(1); g.stroke()
        // the end: a landing circle, a return arrow, or an arrow tip along the last segment
        g.setLineDash([])
        if (pv.land) {
          g.beginPath(); g.arc(pv.land.x, pv.land.y, pv.land.r, 0, TAU); g.fillStyle = body; g.fill(); g.stroke()
          if (sh.style) drawLandGlyph(g, pv.land.x, pv.land.y, pv.land.r, String(sh.style), edge)
          g.beginPath(); g.moveTo(pv.land.x - 8, pv.land.y); g.lineTo(pv.land.x + 8, pv.land.y); g.moveTo(pv.land.x, pv.land.y - 8); g.lineTo(pv.land.x, pv.land.y + 8); g.stroke()
        } else {
          const e1 = pv.pts[pv.pts.length - 1], e0 = pv.pts[Math.max(0, pv.pts.length - 2)]
          const ea = Math.atan2(e1.y - e0.y, e1.x - e0.x)
          g.save(); g.translate(e1.x, e1.y); g.rotate(ea)
          g.beginPath(); g.moveTo(-14, -10); g.lineTo(0, 0); g.lineTo(-14, 10); g.stroke()
          g.restore()
          if (pv.back) { g.beginPath(); g.arc(pv.pts[1].x, pv.pts[1].y, 10, 0, TAU); g.stroke() } // the turn point
          else this.shotEnd(sh, e1.x, e1.y, ea, edge)
        }
        if (pv.land && sh.kind === 'projectile') this.shotEnd(sh, pv.land.x, pv.land.y, (aa / 256) * TAU, edge)
        g.restore()
      }
      g.restore()
      return
    }
    switch (sh.kind) {
      case 'projectile': {
        const count = Math.max(1, n('count', 1)), spread = n('spread', 0)
        for (let i = 0; i < count; i++) {
          const aa = aim + i * spread - ((count - 1) * spread) / 2
          const len = this.reachLine(s, x, y, (aa / 256) * TAU, n('range', 600))
          const save = a
          g.save(); g.translate(x, y); g.rotate((aa / 256) * TAU - save); g.translate(-x, -y)
          if (n('wall', 0) > 0) {
            // a wall (a wave): the band it sweeps, as wide as the wall, and the crest line where it ends
            const wd = n('wall', 0) * 2
            capsule(len, wd)
            g.save(); g.translate(x, y); g.rotate(a); g.setLineDash([]); g.lineWidth = charging ? 5 : 3
            g.beginPath(); g.moveTo(len - n('radius', 10), -wd / 2 + 4); g.quadraticCurveTo(len + 6, 0, len - n('radius', 10), wd / 2 - 4); g.stroke()
            g.restore()
          } else capsule(len, n('radius', 10) * 2)
          g.restore()
          // a detonating shot: its blast where it ends
          if (n('blast', 0) > 0 && !n('fuse', 0)) {
            const ea = (aa / 256) * TAU
            g.save(); g.setLineDash([4, 8]); g.beginPath(); g.arc(x + Math.cos(ea) * len, y + Math.sin(ea) * len, n('blast', 0), 0, TAU); g.stroke(); g.restore()
          }
          { const ea = (aa / 256) * TAU; this.shotEnd(sh, x + Math.cos(ea) * len, y + Math.sin(ea) * len, ea, edge) }
        }
        break
      }
      case 'beam': capsule(this.reachLine(s, x, y, a, n('length', 500)), n('width', 20)); break
      case 'dash': {
        const style = String(sh.style ?? '')
        if (n('turn', 0) > 0) {
          // a swoop: the curved run it takes (melee.ts turns its heading every tick)
          const speed = n('speed', 16), t = Math.max(1, Math.trunc(n('distance', 200) / speed))
          const pts = swoopPath(x, y, a, speed, t, (n('turn', 0) / 256) * TAU)
          g.save(); g.lineCap = 'round'; g.lineJoin = 'round'
          const trace = (upto: number) => { g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i <= Math.max(1, Math.round((pts.length - 1) * upto)); i++) g.lineTo(pts[i].x, pts[i].y) }
          g.setLineDash([]); g.lineWidth = n('radius', r) * 2; g.strokeStyle = body; trace(1); g.stroke()
          if (charging) { g.strokeStyle = fill; trace(k!); g.stroke() }
          g.lineWidth = charging ? 3 : 2; g.strokeStyle = edge; if (!charging) g.setLineDash([10, 8]); trace(1); g.stroke()
          const e1 = pts[pts.length - 1], e0 = pts[pts.length - 2]
          g.setLineDash([]); g.translate(e1.x, e1.y); g.rotate(Math.atan2(e1.y - e0.y, e1.x - e0.x)); g.beginPath(); g.moveTo(-14, -10); g.lineTo(0, 0); g.lineTo(-14, 10); g.stroke()
          g.restore()
          break
        }
        capsule(n('distance', 200), n('radius', r) * 2)
        drawDashGlyph(g, x, y, a, n('distance', 200), n('radius', r) * 2, style, edge)
        break
      }
      case 'melee': {
        // the real swing (melee.ts): the step-in arrow, the arc from where it happens, the style's glyph, xN strikes
        drawMeleeTelegraph(g, x, y, a, n('range', 64), n('lunge', 0), (n('arc', 64) / 256) * TAU, r, body, edge, fill, charging ? k! : null,
          String(sh.style ?? 'strike'), n('strikes', 1), { px: LANDING.padPx, arc: (LANDING.padArc / 256) * TAU })
        break
      }
      case 'cone': {
        const range = n('range', 160) + n('lunge', 0)
        const arc = (n('arc', 64) / 256) * TAU
        g.beginPath(); g.moveTo(x, y); g.arc(x, y, range, a - arc / 2, a + arc / 2); g.closePath()
        g.fillStyle = body; g.fill(); g.stroke()
        if (charging) { g.beginPath(); g.moveTo(x, y); g.arc(x, y, Math.max(1, range * k!), a - arc / 2, a + arc / 2); g.closePath(); g.fillStyle = fill; g.fill() }
        break
      }
      case 'area': case 'terrain': {
        const rad = n('radius', 80)
        let px = x, py = y
        if (sh.at === 'aim') {
          const d = this.reachLine(s, x, y, a, n('range', 300))
          px = x + cx * d; py = y + cy * d
          g.beginPath(); g.moveTo(x + cx * r, y + cy * r); g.lineTo(px, py); g.stroke()
        }
        g.beginPath(); g.arc(px, py, rad, 0, TAU); g.fillStyle = body; g.fill(); g.stroke()
        if (charging) { g.beginPath(); g.arc(px, py, Math.max(1, rad * k!), 0, TAU); g.fillStyle = fill; g.fill() }
        // scattered impacts (a hailstorm, a meteor shower): the ring round the aim point (shapes.release)
        const scat = sh.at === 'aim' && n('count', 1) > 1 && n('scatter', 0) > 0 ? Math.max(n('scatter', 0), 2 * (rad + 24)) : 0
        for (let i = 1; scat > 0 && i < Math.min(5, n('count', 1)); i++) {
          const a2 = a + TAU / 4 + ((i - 1) / (Math.min(5, n('count', 1)) - 1)) * TAU
          g.beginPath(); g.arc(px + Math.cos(a2) * scat, py + Math.sin(a2) * scat, rad, 0, TAU); g.fillStyle = body; g.fill(); g.stroke()
        }
        // a rock slide: the line of impacts before the aim point (the sim spaces them 2 x (radius + 24))
        for (let i = 1; sh.at === 'aim' && !scat && i < Math.min(5, n('count', 1)); i++) {
          const back = i * 2 * (rad + 24)
          g.beginPath(); g.arc(px - cx * back, py - cy * back, rad, 0, TAU); g.fillStyle = body; g.fill(); g.stroke()
        }
        if (sh.path === 'drift') {
          // a drifting storm: where it heads (drift px a tick for its lifetime, stopped by walls)
          const d = this.reachLine(s, px, py, a, n('drift', 2) * n('ticks', 60))
          g.setLineDash([]); g.beginPath(); g.moveTo(px, py); g.lineTo(px + cx * d, py + cy * d); g.stroke()
          g.save(); g.translate(px + cx * d, py + cy * d); g.rotate(a)
          g.beginPath(); g.moveTo(-14, -10); g.lineTo(0, 0); g.lineTo(-14, 10); g.stroke()
          g.restore()
          g.beginPath(); g.arc(px + cx * d, py + cy * d, rad, 0, TAU); g.setLineDash([4, 10]); g.stroke()
        }
        break
      }
      default: {
        g.beginPath(); g.arc(x, y, r + 16, 0, TAU); g.stroke()
        if (charging) { g.beginPath(); g.arc(x, y, r + 16, -Math.PI / 2, -Math.PI / 2 + TAU * k!); g.lineWidth = 6; g.setLineDash([]); g.stroke() }
      }
    }
    g.restore()
  }

  private drawTelegraphs(prev: Snapshot, s: SimState, alpha: number, hud: HudInfo): void {
    if (s.phase === 'over') return
    s.players.forEach((pl, p) => {
      if (pl.active < 0) return
      const f = pl.fighter
      const kit = this.def.kits[pl.members[pl.active].kit]
      // whole canvas pixels, rounded once (pose.ts): sub-pixel positions made the nearest-neighbour sprite and its
      // anti-aliased shadow and ring snap differently every frame
      const p0 = prev.fighters[p]
      const x = drawnPx(p0?.on ? p0.x : f.x, f.x, alpha)
      const y = drawnPx(p0?.on ? p0.y : f.y, f.y, alpha)
      // the nearest foe, for a homing shot's curve (the sim homes on the nearest foe the same way)
      let foe: { x: number; y: number } | null = null, best = Infinity
      s.players.forEach((q, j) => {
        if (j === p || q.active < 0 || this.def.players[j]?.team === this.def.players[p]?.team) return
        const d = Math.hypot(q.fighter.x - f.x, q.fighter.y - f.y)
        if (d < best) { best = d; foe = { x: q.fighter.x / FP, y: q.fighter.y / FP } }
      })
      if (f.cast) {
        const atk = kit.attacks[f.cast.attack]
        if (!atk) return
        const k = 1 - f.cast.t / Math.max(1, atk.windup)
        this.telegraph(s, x, y, f.aim, atk, f.r, TYPE_COLOR[atk.element] ?? '#ffffff', Math.max(0.05, k), p === hud.me, foe)
      } else if (p === hud.me && s.phase === 'fight') {
        // holding an attack to aim: its telegraph at full strength, following the aim; else a faint preview
        const held = hud.aiming ?? 0
        const atk = kit.attacks[Math.min(held ? held - 1 : this.previewAttack, kit.attacks.length - 1)]
        if (atk) this.telegraph(s, x, y, f.aim, atk, f.r, TYPE_COLOR[atk.element] ?? '#ffffff', held ? 1 : null, true, foe)
      }
    })
  }

  /** the held attack's predicted damage, over the foe it's aimed at: a cyan chip (the printed "30+" stays gold on the
   * attack card), dimmed with "nearest" when no foe is on the aim path */
  private drawPrediction(prev: Snapshot, s: SimState, alpha: number, hud: HudInfo): void {
    const pr = hud.predict
    if (!pr || s.phase !== 'fight') return
    const at = this.anchor(prev, s, alpha, pr.target)
    if (!at) return
    const x = at.x, head = at.head
    const p = pr.p
    const main = p.max > 0 ? predictLabel(p) : 'no damage'
    const tags = [pr.blocked ? 'blocked by wall' : '', p.eff > 0 ? 'weak!' : p.eff < 0 ? 'resists' : '', p.ko === 'always' ? 'KO' : p.ko === 'maybe' ? 'may KO' : '', p.hits > 1 ? `${p.hits} hits` : '', p.confused ? 'confused' : '', pr.onPath ? '' : 'nearest · off aim'].filter(Boolean).join(' · ')
    const g = this.ctx
    g.save()
    g.globalAlpha = pr.onPath && !pr.blocked ? 1 : 0.5
    g.font = `700 26px ${FONT}`
    const mw = g.measureText(main).width
    g.font = `700 13px ${FONT}`
    const tw = tags ? g.measureText(tags).width : 0
    const w = Math.max(mw, tw) + 28, h = tags ? 52 : 36
    const cx = x, top = Math.max(8, head - 34 - h)
    g.beginPath(); g.roundRect(cx - w / 2, top, w, h, 10)
    g.fillStyle = 'rgba(4,14,22,0.86)'; g.fill()
    g.lineWidth = 2; g.strokeStyle = PREDICT; g.stroke()
    // a little pointer down to the target
    g.beginPath(); g.moveTo(cx - 7, top + h); g.lineTo(cx, top + h + 8); g.lineTo(cx + 7, top + h); g.closePath(); g.fillStyle = PREDICT; g.fill()
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.font = `700 26px ${FONT}`; g.fillStyle = PREDICT
    g.fillText(main, cx, top + 19)
    if (tags) { g.font = `700 13px ${FONT}`; g.fillStyle = p.ko !== 'no' ? '#ffb4a8' : 'rgba(200,245,255,0.85)'; g.fillText(tags, cx, top + 40) }
    g.restore()
  }

  /** where player p's fighter is drawn: its feet, the top of its sprite, the sprite's half width (null: off the field) */
  private anchor(prev: Snapshot, s: SimState, alpha: number, p: number): Anchor | null {
    const pl = s.players[p]
    if (!pl || pl.active < 0) return null
    const f = pl.fighter
    const p0 = prev.fighters[p]
    const x = drawnPx(p0?.on ? p0.x : f.x, f.x, alpha)
    const y = drawnPx(p0?.on ? p0.y : f.y, f.y, alpha)
    const img = sprite(this.def.kits[pl.members[pl.active].kit].character, !!this.def.players[p]?.shiny?.[pl.active])
    const geo = img ? this.spriteGeom(img) : null
    // the sprite stands on the body's feet (y + r * 0.6); a flier over water or a pit is drawn lifted
    const head = y - (geo ? geo.b.h * geo.scale : 60) + f.r * 0.6 - (airborne(s, f) ? 19 : 0)
    return { x, y, head, half: geo ? (geo.b.w * geo.scale) / 2 : f.r * 1.5 }
  }

  /** the held attack's aim info (src/game/aiminfo.ts, drawn by aimfx.ts): the strip at the top, badges by the foe
   * it's aimed at and by you, marks on the team rows. Fades in while aiming, out on release or cancel; the peek
   * (hold I) hides it */
  private drawAimInfo(prev: Snapshot, s: SimState, alpha: number, hud: HudInfo, badges: boolean): void {
    if (!badges) {
      // once a frame, before anything of it is drawn: the fade
      const on = !!hud.aimInfo && !hud.peek && s.phase === 'fight'
      if (on) this.aimLast = hud.aimInfo!
      this.aimA = stepAimFade(this.aimA, on)
      if (this.aimA <= 0) this.aimLast = null
    }
    const info = this.aimLast
    if (!info || this.aimA <= 0) return
    const g = this.ctx
    const a = this.aimA
    const ft = info.target >= 0 ? this.anchor(prev, s, alpha, info.target) : null
    const me = this.anchor(prev, s, alpha, hud.me)
    if (!badges) {
      // the strip goes see-through over the prediction chip and the badges by a fighter near the top
      const near = (at: Anchor | null) => (at ? [{ x: at.x - 170, y: at.head - 100, w: 340 + at.half + 200, h: 130 }] : [])
      drawAimStrip(g, s, info, a, [...near(ft), ...near(me)])
      return
    }
    // the foe's badges dim with its prediction (off the aim path, or behind a wall)
    const pr = hud.predict
    const dim = !pr || !pr.onPath || !!pr.blocked ? 0.55 : 1
    if (ft) drawBadges(g, info.foe, ft, a * dim)
    if (me) drawBadges(g, info.self, me, a)
    drawBenchMarks(g, info.bench, hud.me, a)
  }

  /** the sprite's draw geometry: integer scale ~3x, feet on the fighter's circle */
  private spriteGeom(img: HTMLImageElement): { scale: number; b: { x: number; y: number; w: number; h: number } } {
    const b = boundsOf(img)
    const scale = Math.max(2, Math.min(3, Math.round(120 / Math.max(b.h, b.w * 0.8))))
    return { scale, b }
  }

  private drawFighters(prev: Snapshot, s: SimState, alpha: number, hud: HudInfo): void {
    const g = this.ctx
    const order = s.players.map((pl, p) => ({ pl, p })).filter((o) => o.pl.active >= 0).sort((a, b) => a.pl.fighter.y - b.pl.fighter.y)
    for (const { pl, p } of order) {
      const f = pl.fighter
      const member = pl.active
      const kit = this.def.kits[pl.members[member].kit]
      const fx = this.fighterFx(p)
      // whole canvas pixels, rounded once (pose.ts): sub-pixel positions made the nearest-neighbour sprite and its
      // anti-aliased shadow and ring snap differently every frame
      const p0 = prev.fighters[p]
      const x = drawnPx(p0?.on ? p0.x : f.x, f.x, alpha)
      const y = drawnPx(p0?.on ? p0.y : f.y, f.y, alpha)
      const col = TYPE_COLOR[kit.types[0]] ?? '#fff'
      const img = sprite(kit.character, !!this.def.players[p]?.shiny?.[member])
      const geo = img ? this.spriteGeom(img) : null
      const evo = this.evos.find((a) => a.p === p)
      if (evo && evo.t < EVO_ANIM - 12) { this.drawEvolving(evo, x, y, f.r); continue }
      // a burrow (melee.ts Dig): under the ground, only a moving mound shows
      if (f.dash && kit.attacks[f.dash.attack]?.shape.style === 'burrow') { drawMound(g, x, y, f.r, this.frame); continue }
      // dodge: afterimages + sound on the first frame
      if (f.dodge) {
        if (!fx.dodging) { this.play('dodge', x); fx.dodging = true }
        if (this.frame % 2 === 0) fx.after.push({ x, y, facing: f.facing, t: 14, img, scale: geo?.scale ?? 2 })
      } else fx.dodging = false
      fx.after = fx.after.filter((a) => --a.t > 0)
      const teamTint = p === hud.me ? '#78dcff' : '#ff8a8a'
      for (const a of fx.after) {
        if (!a.img) continue
        const gg = this.spriteGeom(a.img)
        g.save()
        g.globalAlpha = (a.t / 14) * 0.5
        g.translate(a.x, a.y)
        if (a.facing > 0) g.scale(-1, 1)
        const w = gg.b.w * gg.scale, h = gg.b.h * gg.scale
        g.drawImage(tintOf(a.img, teamTint), gg.b.x, gg.b.y, gg.b.w, gg.b.h, -w / 2, -h + f.r * 0.6, w, h)
        g.restore()
      }
      // pop-in on swap
      let pop = 1
      if (fx.pop > 0) { fx.pop = Math.max(0, fx.pop - 1 / 14); const k = 1 - fx.pop; pop = k < 0.7 ? (k / 0.7) * 1.18 : 1.18 - ((k - 0.7) / 0.3) * 0.18 }
      // a flier over water or a pit is drawn lifted: a smaller, fainter shadow on the surface and a slow bob
      const air = airborne(s, f)
      const lift = air ? 16 + Math.round(3 * Math.sin(simTime(prev.tick, s.tick, alpha) * 0.07 + p)) : 0
      // shadow + team ring
      g.fillStyle = air ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.38)'
      const sk = air ? 0.7 : 1
      g.beginPath(); g.ellipse(x, y + f.r * 0.55, f.r * 1.35 * pop * sk, f.r * 0.5 * pop * sk, 0, 0, TAU); g.fill()
      g.strokeStyle = p === hud.me ? 'rgba(120,220,255,0.95)' : 'rgba(255,110,110,0.95)'
      g.lineWidth = 3
      g.beginPath(); g.ellipse(x, y + f.r * 0.55, f.r * 1.35 * pop, f.r * 0.5 * pop, 0, 0, TAU); g.stroke()
      // foe's aim tick (the local player's aim is the telegraph)
      if (p !== hud.me && !f.cast) {
        const ax = icos(f.aim) / 65536, ay = isin(f.aim) / 65536
        g.strokeStyle = 'rgba(255,160,160,0.6)'; g.lineWidth = 3
        g.beginPath(); g.moveTo(x + ax * (f.r + 12), y + ay * (f.r + 12)); g.lineTo(x + ax * (f.r + 28), y + ay * (f.r + 28)); g.stroke()
      }
      // body motion: the walk hop (whole px, on sim time) and the hit squash. The sprite otherwise stays at its
      // whole-number scale: the old idle "breathing" scaled it by 0.97-1.03 every frame, which re-sampled the
      // nearest-neighbour art each frame and made every fighter standing still shimmer (faster at 120/144 Hz, as it
      // and the hop ran on animation frames, not time)
      const t = this.frame
      const hop = walkHop(!!f.moving && !f.dodge && !air, simTime(prev.tick, s.tick, alpha), p) + lift
      let sx = 1, sy = 1
      let ox = 0, oy = 0
      if (fx.squash > 0) {
        const q = fx.squash
        sx *= 1 + 0.28 * q; sy *= 1 - 0.22 * q
        ox = Math.round(fx.sqx * 10 * q); oy = Math.round(fx.sqy * 6 * q)
      }
      if (f.dodge) { sx *= 1.1; sy *= 0.9 }
      // a flinch (melee.ts): the body reels, a small shudder
      const reel = f.flinch ?? 0
      if (reel > 0) ox += Math.round(Math.sin(this.frame * 1.7) * 2)
      const invuln = f.invuln > 0
      const topY = geo ? y + f.r * 0.6 - geo.b.h * geo.scale * sy * pop - hop : y - f.r * 2
      g.save()
      g.translate(x + ox, Math.round(y + oy + f.r * 0.6) - hop)
      if (sx !== 1 || sy !== 1 || pop !== 1) g.scale(sx * pop, sy * pop)
      if (invuln && !f.dodge) g.globalAlpha = 0.55 + 0.35 * Math.sin(t * 0.6)
      if (geo && img) {
        if (f.facing > 0) g.scale(-1, 1) // colorscripts sprites face left
        const w = geo.b.w * geo.scale, h = geo.b.h * geo.scale
        const left = -Math.floor(w / 2)
        // a dark outline, one art pixel wide, so the sprite reads over busy arena art
        const ink = tintOf(img, '#10131c')
        const o = geo.scale
        for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) g.drawImage(ink, geo.b.x, geo.b.y, geo.b.w, geo.b.h, left + dx, -h + dy, w, h)
        g.drawImage(img, geo.b.x, geo.b.y, geo.b.w, geo.b.h, left, -h, w, h)
        if (fx.flash > 0) { g.globalAlpha = Math.min(0.85, fx.flash / 6); g.drawImage(whiteOf(img), geo.b.x, geo.b.y, geo.b.w, geo.b.h, left, -h, w, h) }
        if (f.status.paralyzed > 0 && t % 10 < 5) { g.globalAlpha = 0.35; g.globalCompositeOperation = 'lighter'; g.drawImage(whiteOf(img), geo.b.x, geo.b.y, geo.b.w, geo.b.h, left, -h, w, h) }
      } else {
        g.fillStyle = fx.flash > 0 ? '#ffffff' : col
        g.beginPath(); g.arc(0, -f.r, f.r * 1.3, 0, TAU); g.fill()
        g.fillStyle = 'rgba(0,0,0,0.6)'
        g.font = `bold 26px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
        g.fillText(kit.name[0], 0, -f.r)
      }
      g.restore()
      if (reel > 0) drawReel(g, x, topY - 6, this.frame, reel / 6)
      // a counter's parry window: a bright guard around the body
      if ((f.parry ?? 0) > 0) {
        g.save(); g.strokeStyle = `rgba(160,232,255,${0.6 + 0.3 * Math.sin(t * 0.6)})`; g.lineWidth = 4
        g.beginPath(); g.ellipse(x, (topY + y) / 2 + 6, f.r * 1.8, (y - topY) * 0.62, 0, 0, TAU); g.stroke(); g.restore()
      }
      // i-frame shimmer ring
      if (invuln) {
        g.save()
        g.strokeStyle = `rgba(200,240,255,${0.5 + 0.3 * Math.sin(t * 0.5)})`; g.lineWidth = 2
        g.setLineDash([6, 6]); g.lineDashOffset = -t
        g.beginPath(); g.ellipse(x, y + f.r * 0.55, f.r * 1.7, f.r * 0.7, 0, 0, TAU); g.stroke()
        g.restore()
      }
      if (f.shield) {
        g.save()
        const grad = g.createRadialGradient(x, (topY + y) / 2, 10, x, (topY + y) / 2, (y - topY) * 0.75)
        grad.addColorStop(0, 'rgba(160,220,255,0)'); grad.addColorStop(0.85, 'rgba(160,220,255,0.18)'); grad.addColorStop(1, 'rgba(200,240,255,0.7)')
        g.fillStyle = grad
        g.beginPath(); g.arc(x, (topY + y) / 2 + 10, (y - topY) * 0.75, 0, TAU); g.fill()
        g.restore()
      }
      // status visuals over the body
      const st = f.status
      if (st.asleep > 0 && t % 40 === 0) this.float(x + 20, topY + 10, 'z', '#cfe0ff', 22, false)
      if (st.burned > 0 && t % 4 === 0) this.burstEl(x + rnd(-12, 12), y - 20, 'Fire', 1, 1)
      if (st.poisoned > 0 && t % 8 === 0) this.spawn({ x: x + rnd(-14, 14), y: y - rnd(10, 50), vx: 0, vy: -0.6, life: 30, color: '#b070e8', r: 4, kind: 'dot', g: -0.01 })
      if (st.confused > 0) { for (let k = 0; k < 3; k++) { const a = t * 0.12 + (k * TAU) / 3; g.fillStyle = '#ffe28a'; g.beginPath(); g.arc(x + Math.cos(a) * 24, topY + 4 + Math.sin(a) * 7, 4, 0, TAU); g.fill() } }
      // overhead HP bar + status badges
      const m = pl.members[member]
      const bw = 84, by = topY - 16
      g.fillStyle = 'rgba(0,0,0,0.65)'; g.beginPath(); g.roundRect(x - bw / 2 - 3, by - 3, bw + 6, 12, 4); g.fill()
      const frac = m.hp / m.maxHp
      if (fx.lastHp < 0 || fx.lastHp < frac) fx.lastHp = frac
      fx.lastHp = Math.max(frac, fx.lastHp - 0.008)
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(x - bw / 2, by, bw * fx.lastHp, 6)
      g.fillStyle = frac > 0.5 ? '#5ee06a' : frac > 0.2 ? '#f5c542' : '#f0504a'
      g.fillRect(x - bw / 2, by, bw * frac, 6)
      this.badges(x, by - 16, f.status)
    }
  }

  /** the classic evolution: white silhouettes of the old and new forms swapping faster and faster in a pillar of
   * light, a flash, then the new form pops out (drawFighters takes over for the last frames) */
  private drawEvolving(a: EvoAnim, x: number, y: number, r: number): void {
    const g = this.ctx
    const t = a.t
    const peak = EVO_ANIM - 14
    const k = Math.min(1, t / peak)
    const pw = 70 + 70 * k
    const grad = g.createLinearGradient(x - pw, 0, x + pw, 0)
    const al = t < peak ? 0.25 + 0.45 * k : Math.max(0, 0.7 - (t - peak) / 12)
    grad.addColorStop(0, 'rgba(200,170,255,0)'); grad.addColorStop(0.5, `rgba(255,255,255,${al})`); grad.addColorStop(1, 'rgba(200,170,255,0)')
    g.save()
    g.globalCompositeOperation = 'lighter'
    g.fillStyle = grad; g.fillRect(x - pw, 0, pw * 2, y + 30)
    g.restore()
    const period = Math.max(2, Math.round(14 - k * 12))
    const showNew = Math.floor(t / period) % 2 === 1
    const kit = showNew ? a.to : a.from
    const img = sprite(kit.character, showNew ? a.toShiny : a.fromShiny)
    const pulse = 1 + 0.06 * Math.sin(t * 0.8)
    g.save()
    g.translate(x, y + r * 0.6)
    g.scale(pulse, pulse)
    if (img) {
      const geo = this.spriteGeom(img)
      const w = geo.b.w * geo.scale, h = geo.b.h * geo.scale
      g.shadowColor = '#c8a8ff'; g.shadowBlur = 30
      g.drawImage(whiteOf(img), geo.b.x, geo.b.y, geo.b.w, geo.b.h, -w / 2, -h, w, h)
    } else {
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -r, r * 1.4, 0, TAU); g.fill()
    }
    g.restore()
    if (t % 4 === 0) { const an = rnd(0, TAU); this.spawn({ x: x + Math.cos(an) * 70, y: y - 50 + Math.sin(an) * 70, vx: -Math.cos(an) * 2, vy: -Math.sin(an) * 2, life: 26, color: '#e8dcff', r: 5, kind: 'star', g: 0 }) }
    if (t === peak) {
      this.whiteout = 1
      this.ring(x, y - 40, 20, 300, '#ffffff', 34, 12)
      this.ring(x, y - 40, 10, 180, '#c8a8ff', 26, 8)
      for (let i = 0; i < 40; i++) { const an = rnd(0, TAU), v = rnd(2, 9); this.spawn({ x, y: y - 40, vx: Math.cos(an) * v, vy: Math.sin(an) * v, life: rnd(30, 60), color: ['#ffffff', '#e8dcff', '#ffe28a'][i % 3], r: rnd(4, 8), kind: 'star', g: 0.02 }) }
      this.shake = Math.max(this.shake, 10)
    }
  }

  private badges(x: number, y: number, st: SimState['players'][number]['fighter']['status']): void {
    const g = this.ctx
    const list: [string, string][] = []
    if (st.paralyzed) list.push(['par', '#f7d038'])
    if (st.asleep) list.push(['slp', '#7f9fe0'])
    if (st.confused) list.push(['cnf', '#e070c0'])
    if (st.burned) list.push(['brn', '#f0643c'])
    if (st.poisoned) list.push(['psn', '#a060d8'])
    list.forEach(([k, c], i) => {
      const cx = x - ((list.length - 1) * 24) / 2 + i * 24
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(cx, y, 11, 0, TAU); g.fill()
      g.fillStyle = c; g.beginPath(); g.arc(cx, y, 9, 0, TAU); g.fill()
      g.strokeStyle = '#1a1020'; g.fillStyle = '#1a1020'; g.lineWidth = 2
      g.beginPath()
      if (k === 'par') { g.moveTo(cx + 2, y - 6); g.lineTo(cx - 3, y + 1); g.lineTo(cx + 1, y + 1); g.lineTo(cx - 2, y + 7); g.lineTo(cx + 4, y - 1); g.lineTo(cx, y - 1); g.closePath(); g.fill() }
      else if (k === 'slp') { g.font = `900 11px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Zz', cx, y + 1) }
      else if (k === 'cnf') { g.arc(cx, y, 5, 0, Math.PI * 1.5); g.stroke(); g.beginPath(); g.arc(cx, y, 2, 0, TAU); g.fill() }
      else if (k === 'brn') { g.moveTo(cx, y - 7); g.quadraticCurveTo(cx + 7, y, cx + 4, y + 6); g.lineTo(cx - 4, y + 6); g.quadraticCurveTo(cx - 7, y, cx, y - 7); g.fill() }
      else { g.moveTo(cx, y - 7); g.quadraticCurveTo(cx + 6, y + 1, cx, y + 6); g.quadraticCurveTo(cx - 6, y + 1, cx, y - 7); g.fill() }
    })
  }

  private drawKos(): void {
    const g = this.ctx
    this.kos = this.kos.filter((k) => ++k.t < k.life)
    for (const k of this.kos) {
      const img = sprite(k.kit.character, k.shiny)
      const q = k.t / k.life
      const flash = k.t < 18 && Math.floor(k.t / 3) % 2 === 0
      g.save()
      g.globalAlpha = 1 - Math.max(0, q - 0.4) / 0.6
      g.translate(k.x, k.y + q * 30)
      g.rotate(q * 0.5 * (k.facing > 0 ? 1 : -1))
      g.scale(1 - q * 0.6, 1 - q * 0.8)
      if (img) {
        const geo = this.spriteGeom(img)
        if (k.facing > 0) g.scale(-1, 1)
        const w = geo.b.w * geo.scale, h = geo.b.h * geo.scale
        g.drawImage(flash ? whiteOf(img) : img, geo.b.x, geo.b.y, geo.b.w, geo.b.h, -w / 2, -h + 14, w, h)
      } else {
        g.fillStyle = flash ? '#fff' : TYPE_COLOR[k.kit.types[0]] ?? '#ccc'
        g.beginPath(); g.arc(0, -20, 26, 0, TAU); g.fill()
      }
      g.restore()
      if (k.t === 20) { for (let i = 0; i < 16; i++) { const a = rnd(0, TAU); this.spawn({ x: k.x + Math.cos(a) * 20, y: k.y - 20 + Math.sin(a) * 14, vx: Math.cos(a) * 2, vy: Math.sin(a) * 1.5 - 0.5, life: 40, color: '#e8e8f0', r: rnd(10, 18), kind: 'smoke', g: -0.01 }) } }
    }
  }

  private drawFx(): void {
    const g = this.ctx
    // rings
    this.rings = this.rings.filter((r) => ++r.t < r.life)
    g.save()
    for (const r of this.rings) {
      const k = r.t / r.life
      const e = 1 - Math.pow(1 - k, 3)
      g.strokeStyle = hexA(r.color.startsWith('#') ? r.color : '#ffffff', (1 - k) * 0.9)
      g.lineWidth = r.w * (1 - k) + 1
      g.beginPath(); g.arc(r.x, r.y, lerp(r.r0, r.r1, e), 0, TAU); g.stroke()
    }
    // particles
    this.particles = this.particles.filter((p) => ++p.t < p.life)
    for (const p of this.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += p.g
      p.vx *= p.kind === 'leaf' ? 0.96 : 0.93; if (p.kind !== 'drop' && p.kind !== 'shard') p.vy *= 0.95
      p.rot += p.vr
      const a = 1 - p.t / p.life
      const c = p.color.startsWith('#') ? p.color : '#ffffff'
      switch (p.kind) {
        case 'spark':
          g.strokeStyle = hexA(c, a); g.lineWidth = 2
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 3, p.y - p.vy * 3); g.stroke()
          break
        case 'ember':
          g.globalCompositeOperation = 'lighter'
          g.fillStyle = hexA(c, a); g.beginPath(); g.arc(p.x, p.y, p.r * (0.5 + a * 0.5), 0, TAU); g.fill()
          g.globalCompositeOperation = 'source-over'
          break
        case 'drop':
          g.fillStyle = hexA(c, a); g.beginPath(); g.ellipse(p.x, p.y, p.r * 0.7, p.r, Math.atan2(p.vy, p.vx) + Math.PI / 2, 0, TAU); g.fill()
          break
        case 'leaf':
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot + Math.sin(p.t * 0.2))
          g.fillStyle = hexA(c, a); g.beginPath(); g.ellipse(0, 0, p.r, p.r * 0.45, 0, 0, TAU); g.fill(); g.restore()
          break
        case 'star':
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot)
          g.fillStyle = hexA(c, a); g.beginPath()
          for (let i = 0; i < 8; i++) { const rr = i % 2 ? p.r * 0.4 : p.r; g.lineTo(Math.cos((i * Math.PI) / 4) * rr, Math.sin((i * Math.PI) / 4) * rr) }
          g.closePath(); g.fill(); g.restore()
          break
        case 'smoke':
          g.fillStyle = hexA(c, a * 0.35); g.beginPath(); g.arc(p.x, p.y, p.r * (1.4 - a * 0.4), 0, TAU); g.fill()
          break
        case 'shard':
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot)
          g.fillStyle = hexA(c, a); g.fillRect(-p.r / 2, -p.r / 3, p.r, p.r * 0.66); g.restore()
          break
        default:
          g.fillStyle = hexA(c, a); g.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r)
      }
    }
    // floating text: pop in, arc up, fade
    this.floaters = this.floaters.filter((f) => ++f.t < f.life)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineJoin = 'round'
    for (const f of this.floaters) {
      const k = f.t / f.life
      f.x += f.vx; f.y += f.vy
      f.vy += f.pop ? 0.11 : 0
      if (f.pop && f.vy > 0.6) f.vy = 0.6
      const sc = f.pop ? (f.t < 6 ? 0.4 + (f.t / 6) * 1.0 : f.t < 12 ? 1.4 - ((f.t - 6) / 6) * 0.4 : 1) : f.t < 8 ? f.t / 8 : 1
      g.save()
      g.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
      g.translate(f.x, f.y); g.scale(sc, sc)
      g.font = `900 ${f.size}px ${FONT}`
      g.lineWidth = Math.max(5, f.size / 6); g.strokeStyle = 'rgba(10,8,20,0.85)'
      g.strokeText(f.text, 0, 0)
      g.fillStyle = f.color
      g.fillText(f.text, 0, 0)
      g.restore()
    }
    g.restore()
  }

  /** "<Old> evolved into <New>!" */
  private drawBanner(): void {
    const b = this.banner
    if (!b) return
    const g = this.ctx
    const life = 170, start = EVO_ANIM - 14
    b.t++
    if (b.t > start + life) { this.banner = null; return }
    if (b.t < start) return
    const t = b.t - start
    const inK = Math.min(1, t / 12), outK = Math.max(0, (t - life + 20) / 20)
    const w = 900, h = 96, y = 220
    g.save()
    g.globalAlpha = 1 - outK
    g.translate(960, y)
    g.scale(1, Math.max(0.01, inK))
    const grad = g.createLinearGradient(-w / 2, 0, w / 2, 0)
    grad.addColorStop(0, 'rgba(60,30,120,0)'); grad.addColorStop(0.15, 'rgba(60,30,120,0.92)'); grad.addColorStop(0.85, 'rgba(60,30,120,0.92)'); grad.addColorStop(1, 'rgba(60,30,120,0)')
    g.fillStyle = grad; g.fillRect(-w / 2, -h / 2, w, h)
    g.fillStyle = 'rgba(220,200,255,0.9)'; g.fillRect(-w / 2 + 80, -h / 2, w - 160, 3); g.fillRect(-w / 2 + 80, h / 2 - 3, w - 160, 3)
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.font = `900 40px ${FONT}`; g.lineWidth = 6; g.strokeStyle = 'rgba(20,10,40,0.8)'; g.lineJoin = 'round'
    g.strokeText(b.text, 0, -6); g.fillStyle = '#fff'; g.fillText(b.text, 0, -6)
    g.font = `700 16px ${FONT}`; g.fillStyle = 'rgba(230,220,255,0.8)'
    g.fillText(b.sub, 0, 30)
    g.restore()
  }

  /** an enemy KO: its name and the count toward full elimination, LAST ONE! when one is left */
  private koCall(s: SimState, p: number, member: number): void {
    const pl = s.players[p]
    const n = pl.members.length
    if (p === this.me || n <= 1) return
    const kit = this.kitAt(s, p, member)
    const k = pl.members.filter((m) => m.ko).length
    const left = n - k
    const text = `${kit?.name ?? 'Pokémon'} KO'd · ${k}/${n}`
    const sub = left === 0 ? 'TEAM ELIMINATED!' : left === 1 ? 'LAST ONE!' : `${left} to go`
    this.koBanner = { text, sub, last: left === 1, t: 0 }
  }

  /** bench damage can't reach the arena, so it gets a callout by the team row: "−30 to bench: Togepi" */
  private benchCall(s: SimState, p: number, member: number, amount: number): void {
    const kit = this.kitAt(s, p, member)
    const right = p !== this.me
    const { cx, cy } = teamRowSlot(right ? W - 540 : 20, right, member)
    this.float(cx, cy + 34, `−${amount} to bench: ${kit?.name ?? '?'}`, '#ffb070', 20, false)
  }

  private drawKoBanner(): void {
    const b = this.koBanner
    if (!b) return
    const g = this.ctx
    const life = 130
    if (++b.t > life) { this.koBanner = null; return }
    const inK = Math.min(1, b.t / 8), outK = Math.max(0, (b.t - life + 18) / 18)
    const w = 820, h = b.last ? 118 : 92, y = 176
    g.save()
    g.globalAlpha = 1 - outK
    g.translate(W / 2, y)
    g.scale(1, Math.max(0.01, inK))
    const grad = g.createLinearGradient(-w / 2, 0, w / 2, 0)
    grad.addColorStop(0, 'rgba(120,20,24,0)'); grad.addColorStop(0.15, 'rgba(120,20,24,0.92)'); grad.addColorStop(0.85, 'rgba(120,20,24,0.92)'); grad.addColorStop(1, 'rgba(120,20,24,0)')
    g.fillStyle = grad; g.fillRect(-w / 2, -h / 2, w, h)
    g.fillStyle = 'rgba(255,200,190,0.9)'; g.fillRect(-w / 2 + 80, -h / 2, w - 160, 3); g.fillRect(-w / 2 + 80, h / 2 - 3, w - 160, 3)
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'
    g.font = `900 40px ${FONT}`; g.lineWidth = 6; g.strokeStyle = 'rgba(30,6,8,0.8)'
    const ty = b.last ? -20 : -8
    g.strokeText(b.text, 0, ty); g.fillStyle = '#fff'; g.fillText(b.text, 0, ty)
    if (b.last) {
      const pulse = 1 + 0.06 * Math.sin(b.t * 0.3)
      g.save(); g.translate(0, 28); g.scale(pulse, pulse)
      g.font = `900 36px ${FONT}`; g.lineWidth = 6; g.strokeStyle = 'rgba(40,20,0,0.85)'
      g.strokeText(b.sub, 0, 0); g.fillStyle = '#ffd23f'; g.fillText(b.sub, 0, 0)
      g.restore()
    } else {
      g.font = `700 18px ${FONT}`; g.fillStyle = 'rgba(255,225,220,0.9)'
      g.fillText(b.sub, 0, 30)
    }
    g.restore()
  }

  /** a static preview of a fighter's sprite (menus): exported for convenience */
  static mini = drawMini
}
