// The arenas' colliders match what the player sees (src/sim/colliders.ts; tools/colliders/ renders the sheets):
// every walkable tile is reachable, only tall things stop shots, and the playable area reaches the painted edges.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseArena } from '../sim/arena'
import { auditColliders } from '../sim/colliders'
import { FP } from '../sim/fixed'
import { fixtureKit, hp, place, run, testArena, testMatch } from '../sim/testing'
import { TILE } from '../sim/types'

const ROOT = resolve(__dirname, '../../public/arenas')
const ids: string[] = JSON.parse(readFileSync(join(ROOT, 'index.json'), 'utf8')).arenas

/** the painted play area's edges (tiles), reviewed on shots/colliders/<id>-after.png: the first and last row and column
 * of ground the art shows as walkable. The grid must let a body reach at least that far (the top especially: the user
 * "can't cross through the top part of the map even though it looks like it can") */
const EDGES: Record<string, { top: number; bottom: number; left: number; right: number }> = {
  'growlithe-meadow': { top: 1, bottom: 24, left: 2, right: 45 },
  'lapras-lagoon': { top: 1, bottom: 25, left: 5, right: 42 },
  'zarude-jungle': { top: 2, bottom: 24, left: 4, right: 43 },
  'magmar-volcano': { top: 1, bottom: 25, left: 1, right: 46 },
  'kyogre-storm-sea': { top: 2, bottom: 23, left: 3, right: 43 },
  'sableye-crystal-cave': { top: 2, bottom: 25, left: 3, right: 44 },
  'liepard-night-city': { top: 1, bottom: 25, left: 3, right: 44 },
  'glastrier-ice-field': { top: 2, bottom: 25, left: 3, right: 44 },
  'cresselia-moonlit-sky': { top: 2, bottom: 24, left: 5, right: 42 },
  'herdier-temple': { top: 1, bottom: 25, left: 10, right: 37 },
}

function load(id: string) {
  const f = JSON.parse(readFileSync(join(ROOT, id, 'arena.json'), 'utf8'))
  const pj = join(ROOT, id, 'props.json')
  if (existsSync(pj)) f.propFrames = JSON.parse(readFileSync(pj, 'utf8')).frames
  return parseArena(f)
}

describe('arena colliders', () => {
  for (const id of ids) {
    it(`${id}: every walkable tile is reachable from every spawn, fliers reach every tile they may enter`, () => {
      const r = auditColliders(load(id))
      expect(r.unreachable, 'walkable tiles no walker reaches').toEqual([])
      expect(r.cutOff, 'spawns cut off from the others').toEqual([])
      expect(r.flierUnreachable, 'tiles no flier reaches').toEqual([])
    })
    it(`${id}: shots stop only on walls and props, and the play area reaches the painted edges`, () => {
      const a = load(id)
      const r = auditColliders(a)
      expect(r.oddStops).toEqual([])
      for (const [x, y] of r.shotStops) expect([TILE.WALL, TILE.PROP]).toContain(a.tiles[y * 48 + x])
      const e = EDGES[id]
      expect(e, `EDGES has no entry for ${id}`).toBeDefined()
      expect(r.bounds.top).toBeLessThanOrEqual(e.top)
      expect(r.bounds.bottom).toBeGreaterThanOrEqual(e.bottom)
      expect(r.bounds.left).toBeLessThanOrEqual(e.left)
      expect(r.bounds.right).toBeGreaterThanOrEqual(e.right)
    })
  }

  it('a shot flies over low obstacles, deep water and pits, and stops at a wall', () => {
    const shooter = fixtureKit({ shape: { kind: 'projectile', speed: 20, radius: 10, range: 1200 }, onHit: [{ op: 'damage', amount: 30 }] })
    const target = fixtureKit({ shape: { kind: 'self' } }, { hp: 200 })
    for (const ch of ['=', '~', '_', '#']) {
      // a full column of the tile between the two, so nothing goes round it
      const marks = Array.from({ length: 25 }, (_, k) => ({ x: 24, y: k + 1, ch }))
      const m = testMatch(shooter, target, { arena: testArena(marks) })
      place(m, 0, 600, 540)
      place(m, 1, 1300, 540)
      run(m, 90, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? 1 : 0 }, undefined])
      expect(hp(m, 1), `through a column of ${ch}`).toBe(ch === '#' ? 200 : 170)
    }
  })

  it('a low obstacle stops a walker and lets a flier cross', () => {
    const marks = Array.from({ length: 25 }, (_, k) => ({ x: 24, y: k + 1, ch: '=' }))
    for (const fly of [false, true]) {
      const k = fixtureKit({ shape: { kind: 'self' } })
      const m = testMatch(k, k, { arena: testArena(marks) })
      if (fly) m.s.players[0].fighter.move = { fly: true }
      place(m, 0, 900, 540)
      place(m, 1, 1700, 200)
      run(m, 120, () => [{ mx: 1, my: 0, aim: 0, buttons: 0 }, undefined])
      const x = m.s.players[0].fighter.x / FP
      if (fly) expect(x).toBeGreaterThan(1000)
      else expect(x).toBeLessThan(960)
    }
  })
})
