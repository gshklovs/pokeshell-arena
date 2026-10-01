// Playtest shots of the collision grid (tools/movement/shots.mjs drives it): an arena with a heavy and a medium
// fighter that each walked up to the top wall from below, drawn by the game's renderer with the F3 overlay on.
//   /tools/movement/overlay.html?arena=<id>
import { loadArena } from '../../src/game/arena'
import { Renderer, snapshot } from '../../src/render/renderer'
import { preload } from '../../src/render/sprites'
import { debugOverlay } from '../../src/render/debug'
import { resolveKit } from '../../src/sim/kit'
import { createState } from '../../src/sim/state'
import { step } from '../../src/sim/step'
import { fixtureKit } from '../../src/sim/testing'
import { FP } from '../../src/sim/fixed'
import type { MatchDef } from '../../src/sim/types'

const q = new URLSearchParams(location.search)
const id = q.get('arena') ?? 'herdier-temple'
debugOverlay.on = q.get('debug') !== '0'
const arena = await loadArena(id)
const heavy = { ...resolveKit(null, fixtureKit({ shape: { kind: 'self' } }, { retreat: 5 })), character: 'snorlax', name: 'Heavy (retreat 5)' }
// ?flier=1: player 1 is a Charizard (a flier) that heads out over the water / void instead
const flier = q.get('flier') === '1'
const mid = flier
  ? { ...resolveKit(null, fixtureKit({ shape: { kind: 'self' } }, { retreat: 2 })), character: 'charizard', name: 'Flier (Charizard)' }
  : { ...resolveKit(null, fixtureKit({ shape: { kind: 'self' } }, { retreat: 1 })), character: 'charmander', name: 'Medium (retreat 1)' }
await preload([{ character: 'snorlax' }, { character: mid.character }])
const def: MatchDef = {
  mode: '1v1', seed: 1, arena: arena.def, kits: [heavy, mid], raw: true, matchTicks: 1 << 30,
  players: [{ team: 0, name: 'heavy', members: [0], energy: ['Colorless'] }, { team: 1, name: 'medium', members: [1], energy: ['Colorless'] }],
}
const s = createState(def)
s.phase = 'fight'; s.phaseT = 0
const g = arena.def
const walk = (tx: number, ty: number) => { const t = g.tiles[ty * 48 + tx]; return t === 0 || t === 3 || t === 4 }
/** the top-edge tile (wall above, 3 open tiles below) nearest a column */
function topEdge(col: number): { tx: number; ty: number } {
  let best = { tx: col, ty: 13 }, bd = 1e9
  for (let ty = 1; ty < 14; ty++) for (let tx = 2; tx < 46; tx++) {
    if (!walk(tx, ty) || walk(tx, ty - 1) || !walk(tx, ty + 1) || !walk(tx, ty + 2) || !walk(tx, ty + 3)) continue
    const d = Math.abs(tx - col) * 4 + ty
    if (d < bd) { bd = d; best = { tx, ty } }
  }
  return best
}
const a = topEdge(14), b = topEdge(33)
s.players[0].fighter.x = (a.tx * 40 + 20) * FP; s.players[0].fighter.y = ((a.ty + 3) * 40 + 20) * FP
s.players[1].fighter.x = (b.tx * 40 + 20) * FP; s.players[1].fighter.y = ((b.ty + 3) * 40 + 20) * FP
if (flier) { const sp = def.arena.spawns.find((x) => x.team === 1)!; s.players[1].fighter.x = sp.x * FP; s.players[1].fighter.y = sp.y * FP }
const ticks = Number(q.get('ticks') ?? 120)
for (let t = 0; t < ticks; t++) {
  s.players.forEach((p) => (p.members[0].hp = p.members[0].maxHp))
  step(def, s, [{ mx: 0, my: -1, aim: 192, buttons: 0 }, flier ? { mx: 1, my: t < ticks / 3 ? -1 : 0, aim: 0, buttons: 0 } : { mx: 0, my: -1, aim: 192, buttons: 0 }])
}
const r = new Renderer(document.getElementById('c') as HTMLCanvasElement, arena, def)
const prev = snapshot(s)
for (let i = 0; i < 10; i++) r.render(prev, s, 1, { me: 0, names: ['heavy', 'medium'], difficulty: '', arenaName: arena.def.name, keys: [] })
;(window as unknown as { ready: unknown }).ready = { a, b, feet: s.players.map((p) => ({ x: p.fighter.x / FP, y: p.fighter.y / FP, r: p.fighter.r })) }
