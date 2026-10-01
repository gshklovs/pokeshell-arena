// The pack economy's UI: tokens toward the next pack (10 = 1 pack), the wallet chip and the result screen's bar.
import { describe, expect, it } from 'vitest'
import { TOKENS_PER_PACK, tokensFor, walletHtml } from './loadout'
import { progressSteps } from './result'

describe('tokens toward the next pack', () => {
  it('wins earn the same tokens as before, 10 to a pack', () => {
    expect(TOKENS_PER_PACK).toBe(10)
    expect(tokensFor('1v1', 'normal')).toBe(1)
    expect(tokensFor('team', 'expert')).toBe(4)
  })

  it('the bar runs from where it was, round once per completed pack, to where it is', () => {
    expect(progressSteps({ points: 3, progress: 7, perPack: 10, granted: 0 })).toEqual({ before: 4, after: 7, laps: 0 })
    // 8 + 4 = 12: one pack, 2 carried over
    expect(progressSteps({ points: 4, progress: 2, perPack: 10, granted: 1 })).toEqual({ before: 8, after: 2, laps: 1 })
  })

  it('the wallet chip shows 7 / 10 and the packs to open', () => {
    const h = walletHtml({ tokens: 2, progress: 7 })
    expect(h).toContain('<b>7</b><span class="of">/ 10</span>')
    expect(h).toContain('width:70%')
    expect(h).toContain('2 packs · open')
    expect(walletHtml({ tokens: 0, progress: null })).toContain('<b>–</b>')
  })
})
