import { expect, it } from 'vitest'
import { fixtureKit, hp, place, run, testMatch, applyEffects } from '../../testing'

it("blind: a blinded fighter's attacks miss with its chance", () => {
  const shooter = fixtureKit({ shape: { kind: 'projectile', speed: 30, radius: 10, range: 800 }, onHit: [{ op: 'damage', amount: 1 }] })
  const shots = (permille: number) => {
    const m = testMatch(shooter, fixtureKit({ shape: { kind: 'self' } }, { hp: 1000 }))
    place(m, 0, 400, 540); place(m, 1, 700, 540)
    // player 1 blinds player 0
    applyEffects({ def: m.def, s: m.s }, [{ op: 'blind', ticks: 5000, permille }], { target: 0 })
    let n = 0
    for (let i = 0; i < 60; i++) {
      m.s.players[0].pips = [10]
      run(m, 2, (t) => [{ mx: 0, my: 0, aim: 0, buttons: t === 0 ? 1 : 0 }])
      run(m, 20)
      n++
    }
    return { hits: 1000 - hp(m, 1), n }
  }
  expect(shots(1000).hits).toBe(0)
  const half = shots(500)
  expect(half.hits).toBeGreaterThan(15)
  expect(half.hits).toBeLessThan(45)
})
