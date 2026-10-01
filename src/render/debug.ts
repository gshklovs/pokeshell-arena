// The collision debug overlay (F3, or ?debug=1 in the URL): the tile grid as the sim sees it, and every fighter's
// hitbox and collision body, for playtesting where the grid and the painting disagree. Render-only.
import { FP } from '../sim/fixed'
import { bodyRadiusPx, footOffsetPx, traitsOf } from '../sim/movement'
import { COLS, ROWS } from '../sim/terrain'
import { TILE, type SimState } from '../sim/types'
import { drawnPx, type Snapshot } from './pose'

const T = 40
const KEY = 'pokeshell-arena.debugOverlay'

function initial(): boolean {
  try {
    if (typeof location !== 'undefined' && /[?&]debug=1\b/.test(location.search)) return true
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1'
  } catch { return false }
}

export const debugOverlay = { on: initial() }

/** flip the overlay (F3); remembered per browser */
export function toggleDebugOverlay(): boolean {
  debugOverlay.on = !debugOverlay.on
  try { localStorage.setItem(KEY, debugOverlay.on ? '1' : '0') } catch { /* private window: not remembered */ }
  return debugOverlay.on
}

const FILL: Record<number, string> = {
  [TILE.WALL]: 'rgba(255,40,40,0.38)', [TILE.PROP]: 'rgba(255,0,220,0.38)', [TILE.WATER]: 'rgba(40,120,255,0.38)',
  [TILE.HAZARD]: 'rgba(255,150,0,0.22)', [TILE.GRASS]: 'rgba(60,220,60,0.16)', [TILE.PIT]: 'rgba(140,60,255,0.42)',
  [TILE.LOW]: 'rgba(255,170,0,0.34)',
}

export function drawDebugOverlay(g: CanvasRenderingContext2D, prev: Snapshot, s: SimState, alpha: number): void {
  g.save()
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const fill = FILL[s.tiles[ty * COLS + tx]]
      if (fill) { g.fillStyle = fill; g.fillRect(tx * T, ty * T, T, T) }
    }
  }
  g.strokeStyle = 'rgba(255,255,255,0.18)'
  g.lineWidth = 1
  g.beginPath()
  for (let x = 0; x <= COLS; x++) { g.moveTo(x * T + 0.5, 0); g.lineTo(x * T + 0.5, ROWS * T) }
  for (let y = 0; y <= ROWS; y++) { g.moveTo(0, y * T + 0.5); g.lineTo(COLS * T, y * T + 0.5) }
  g.stroke()
  g.font = '10px monospace'
  g.fillStyle = 'rgba(255,255,255,0.7)'
  for (let x = 0; x < COLS; x += 2) g.fillText(String(x), x * T + 2, 10)
  for (let y = 1; y < ROWS; y++) g.fillText(String(y), 2, y * T + 11)
  // fighters: hitbox (yellow, what attacks hit) and collision body at the feet (cyan, what walls stop)
  s.players.forEach((pl, p) => {
    if (pl.active < 0) return
    const f = pl.fighter
    const p0 = prev.fighters[p]
    const x = drawnPx(p0?.on ? p0.x : f.x, f.x, alpha), y = drawnPx(p0?.on ? p0.y : f.y, f.y, alpha)
    g.lineWidth = 2
    g.strokeStyle = 'rgba(255,230,0,0.95)'
    g.beginPath(); g.arc(x, y, f.r, 0, Math.PI * 2); g.stroke()
    const by = y + footOffsetPx(f.r), br = bodyRadiusPx(f.r)
    g.strokeStyle = 'rgba(0,255,255,1)'
    g.fillStyle = 'rgba(0,255,255,0.18)'
    g.beginPath(); g.arc(x, by, br, 0, Math.PI * 2); g.fill(); g.stroke()
    g.fillStyle = '#fff'
    g.fillRect(x - 1, y - 1, 3, 3)
    const t = traitsOf(f)
    const tags = [t.fly && 'fly', t.crossWater && 'crossWater', t.hover && 'hover'].filter(Boolean).join(' ')
    g.fillText(`p${p} r${f.r} body${br} (${Math.floor(f.x / FP / T)},${Math.floor((f.y / FP + footOffsetPx(f.r)) / T)})${tags ? ' ' + tags : ''}`, x - 40, by + br + 12)
  })
  g.strokeStyle = 'rgba(255,255,255,0.9)'
  g.lineWidth = 1
  for (const pr of s.projectiles) { g.beginPath(); g.arc(pr.x / FP, pr.y / FP, pr.r, 0, Math.PI * 2); g.stroke() }
  for (const a of s.areas) { g.beginPath(); g.arc(a.x / FP, a.y / FP, a.r, 0, Math.PI * 2); g.stroke() }
  g.font = 'bold 14px monospace'
  g.fillStyle = 'rgba(0,0,0,0.6)'
  g.fillRect(680, 1050, 580, 22)
  g.fillStyle = '#fff'
  g.fillText('F3 collision: red wall  orange low  magenta prop  blue water  violet pit | yellow hitbox  cyan body', 706, 1066)
  g.restore()
}
