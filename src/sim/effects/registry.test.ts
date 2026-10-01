import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { OPS, validateEffects } from './registry'

const dir = resolve(__dirname, 'ops')

it('every op file is registered under its file name, and has a test next to it', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => f.slice(0, -3))
  expect(Object.keys(OPS).sort()).toEqual(files.sort())
  for (const f of files) expect(readdirSync(dir), `${f}.test.ts`).toContain(`${f}.test.ts`)
})

it('the v1 library is all there', () => {
  for (const op of ['damage', 'selfDamage', 'heal', 'status', 'knockback', 'pull', 'slow', 'shield', 'buff', 'invulnerable',
    'coin', 'coins', 'chance', 'paint', 'benchDamage', 'discardEnergy', 'gainEnergy', 'bonusPerEnergy', 'bonus'])
    expect(OPS[op], op).toBeTruthy()
})

it('unknown ops are rejected with the known list', () => {
  const [e] = validateEffects([{ op: 'teleport' }], 'onHit')
  expect(e).toContain('onHit[0]: unknown op "teleport"')
  expect(e).toContain('damage')
})
