// All aiming is manual (the user): the player's attack goes exactly where the input aim points, wherever the foe is.
import { describe, expect, it } from 'vitest'
import { iatan2 } from './fixed'
import { fixtureKit, place, run, testMatch } from './testing'
import type { InputFrame } from './types'

const shot = fixtureKit({ shape: { kind: 'projectile', speed: 12, radius: 6, range: 900 }, windup: 6, onHit: [{ op: 'damage', amount: 10 }] })
const beam = fixtureKit({ shape: { kind: 'beam', length: 600, width: 10 }, windup: 6, onHit: [{ op: 'damage', amount: 10 }] })
const wall = fixtureKit({ shape: { kind: 'self' } }, { hp: 999 })

/** press attack 1 with a fixed aim and keep holding that aim through the windup */
const aimAt = (aim: number) => (t: number): InputFrame[] => [{ mx: 0, my: 0, aim, buttons: t === 0 ? 1 : 0 }, { mx: 0, my: 0, aim: 0, buttons: 0 }]

describe("the player's cast direction is the input aim", () => {
  it('projectiles fly along the input aim for every angle, with the foe elsewhere (no snapping)', () => {
    for (let aim = 0; aim < 256; aim += 7) {
      const m = testMatch(shot, wall)
      place(m, 0, 960, 540); place(m, 1, 1300, 300) // the foe is off to the upper right, whatever the aim
      m.s.players[0].pips = [10]
      run(m, 7, aimAt(aim)) // windup 6: released on the 7th tick
      const pr = m.s.projectiles.find((p) => p.owner === 0)
      expect(pr, `aim ${aim}`).toBeTruthy()
      expect(iatan2(pr!.vy, pr!.vx), `aim ${aim}`).toBe(aim)
    }
  })
  it('beams point along the input aim', () => {
    for (let aim = 0; aim < 256; aim += 16) {
      const m = testMatch(beam, wall)
      place(m, 0, 960, 540); place(m, 1, 400, 900)
      m.s.players[0].pips = [10]
      run(m, 7, aimAt(aim))
      const b = m.s.beams.find((x) => x.owner === 0)!
      expect(iatan2(b.y2 - b.y1, b.x2 - b.x1), `aim ${aim}`).toBe(aim)
    }
  })
})
