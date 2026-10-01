// Random packs: the rolled pack's odds text, which packs get the vintage fanfare, and the odds panel's rows.
import { describe, expect, it } from 'vitest'
import { isRarePack, oddsRows, oneInText, packName } from './packs'

describe('random packs', () => {
  it('says the odds the way the reveal shows them', () => {
    expect(oneInText(60.7)).toBe('1 in 61')
    expect(oneInText(9.4)).toBe('1 in 9.4')
    expect(oneInText(4.66)).toBe('1 in 4.7')
    expect(oneInText(null)).toBe('')
  })
  it('only the vintage packs (1 in 30 or rarer) get the big fanfare', () => {
    expect(isRarePack(60.7)).toBe(true)
    expect(isRarePack(67.9)).toBe(true)
    expect(isRarePack(10)).toBe(false)
    expect(isRarePack(null)).toBe(false)
  })
  it('calls base1 a Base Set pack', () => {
    expect(packName('Base')).toBe('Base Set')
    expect(packName('Evolving Skies')).toBe('Evolving Skies')
  })
  it('lists the sets likeliest first, without the unpriced ones', () => {
    const rows = oddsRows([
      { id: 'base1', name: 'Base', chance: 0.0165, oneIn: 60.7 },
      { id: 'swsh9', name: 'Brilliant Stars', chance: 0.2138, oneIn: 4.7 },
      { id: 'x', name: 'No price', chance: 0, oneIn: null },
    ])
    expect(rows.map((r) => r.name)).toEqual(['Brilliant Stars', 'Base Set'])
    expect(rows[0]).toEqual({ name: 'Brilliant Stars', percent: '21.4%', oneIn: '1 in 4.7', rare: false })
    expect(rows[1].rare).toBe(true)
  })
})
