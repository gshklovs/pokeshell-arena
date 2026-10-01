import { expect, it } from 'vitest'
import { sfx, type SfxName } from './sfx'

it('sfx is a safe no-op without an AudioContext (node, headless)', () => {
  expect(() => sfx.unlock()).not.toThrow()
  const names: SfxName[] = ['cast', 'hit', 'superHit', 'ko', 'prize', 'swap', 'dodge', 'win', 'lose', 'token', 'shock', 'swing', 'tap', 'thud', 'parry', 'throw', 'splat', 'whiff']
  for (const n of names) expect(() => sfx.play(n, { element: 'Fire', pan: 0.5, big: true })).not.toThrow()
  expect(sfx.ready).toBe(false)
})
