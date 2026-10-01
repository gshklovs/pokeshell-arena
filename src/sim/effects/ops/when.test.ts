import { expect, it } from 'vitest'
import { applyEffects, fixtureKit, hp, testMatch } from '../../testing'
import { validateEffects } from '../registry'

const pair = (sub: string[] = ['Basic']) => testMatch(fixtureKit({ shape: { kind: 'self' } }), fixtureKit({ shape: { kind: 'self' } }, { subtypes: sub }))
const bonus = { then: [{ op: 'bonus', amount: 50 }] }

it('when: damage conditions read the caster and the target', () => {
  const m = pair()
  expect(applyEffects(m, [{ op: 'when', cond: 'foeDamaged', ...bonus }]).bonus).toBe(0)
  m.s.players[1].members[0].hp = 90
  expect(applyEffects(m, [{ op: 'when', cond: 'foeDamaged', ...bonus }]).bonus).toBe(50)
  expect(applyEffects(m, [{ op: 'when', cond: 'selfDamaged', ...bonus, else: [{ op: 'bonus', amount: 5 }] }]).bonus).toBe(5)
})
it('when: card kinds, conditions, recent hits', () => {
  const m = pair(['Stage 1', 'VMAX'])
  expect(applyEffects(m, [{ op: 'when', cond: 'foeIs', kind: 'V', ...bonus }]).bonus).toBe(50)
  expect(applyEffects(m, [{ op: 'when', cond: 'foeIs', kind: 'Basic', ...bonus }]).bonus).toBe(0)
  expect(applyEffects(m, [{ op: 'when', cond: 'foeIs', kind: 'Evolution', ...bonus }]).bonus).toBe(50)
  expect(applyEffects(m, [{ op: 'when', cond: 'foeStatus', ...bonus }]).bonus).toBe(0)
  applyEffects(m, [{ op: 'status', status: 'poisoned' }])
  expect(applyEffects(m, [{ op: 'when', cond: 'foeStatus', ...bonus }]).bonus).toBe(50)
  expect(applyEffects(m, [{ op: 'when', cond: 'selfHurt', ...bonus }]).bonus).toBe(0)
  const f = m.s.players[1].fighter
  applyEffects({ def: m.def, s: m.s }, [{ op: 'damage', amount: 10 }], { target: 0, x: f.x, y: f.y })
  expect(applyEffects(m, [{ op: 'when', cond: 'selfHurt', ...bonus }]).bonus).toBe(50)
  expect(applyEffects(m, [{ op: 'when', cond: 'fresh', ...bonus }]).bonus).toBe(50) // just entered (tick 0)
})
it('when: else can fizzle the attack ("you can use this attack only if")', () => {
  const m = pair()
  expect(applyEffects(m, [{ op: 'when', cond: 'late', n: 10, else: [{ op: 'fizzle' }] }]).fizzle).toBe(true)
  m.s.phaseT = 90 * 10
  expect(applyEffects(m, [{ op: 'when', cond: 'late', n: 10, else: [{ op: 'fizzle' }] }]).fizzle).toBeUndefined()
  expect(hp(m, 1)).toBe(100)
})
it('when: validates the condition and its params', () => {
  expect(validateEffects([{ op: 'when', cond: 'raining', then: [] }], 'x')).toHaveLength(1)
  expect(validateEffects([{ op: 'when', cond: 'foeIs', kind: 'Mega', then: [] }], 'x')).toHaveLength(1)
  expect(validateEffects([{ op: 'when', cond: 'foeDamaged' }], 'x')).toHaveLength(1)
  expect(validateEffects([{ op: 'when', cond: 'foeIs', kind: 'ex', then: [{ op: 'bonus', amount: 10 }] }], 'x')).toEqual([])
})
