import { describe, expect, it } from 'vitest'
import { angleDiff, iatan2, icos, isin, isqrt, wrapAngle } from './fixed'
import { flip, nextRng, randInt, seedRng } from './rng'

describe('fixed-point math', () => {
  it('isqrt is exact', () => {
    for (const n of [0, 1, 2, 3, 4, 15, 16, 17, 99, 100, 101, 2 ** 40, 2 ** 40 - 1, 123456789012])
      expect(isqrt(n)).toBe(Math.floor(Math.sqrt(n)))
    const big = 94906265 ** 2
    expect(isqrt(big)).toBe(94906265)
    expect(isqrt(big - 1)).toBe(94906264)
  })
  it('the sine table is symmetric and matches sin within rounding', () => {
    for (let a = 0; a < 256; a++) {
      expect(Math.abs(isin(a) - Math.sin((2 * Math.PI * a) / 256) * 65536)).toBeLessThanOrEqual(0.5)
      expect(isin(a)).toBe(-isin(256 - a === 256 ? 0 : 256 - a) || 0)
      expect(icos(a)).toBe(isin(a + 64))
    }
    expect(isin(64)).toBe(65536)
  })
  it('iatan2 inverts the table', () => {
    for (let a = 0; a < 256; a++) expect(iatan2(isin(a), icos(a))).toBe(a)
    expect(iatan2(0, 1)).toBe(0)
    expect(iatan2(1, 0)).toBe(64)
    expect(iatan2(0, -1)).toBe(128)
  })
  it('angle helpers wrap', () => {
    expect(wrapAngle(-1)).toBe(255)
    expect(angleDiff(250, 5)).toBe(11)
    expect(angleDiff(5, 250)).toBe(-11)
  })
})

describe('rng', () => {
  it('is a fixed sequence per seed', () => {
    const a = { rng: seedRng(42) }, b = { rng: seedRng(42) }
    const xs = Array.from({ length: 20 }, () => randInt(a, 1000))
    expect(Array.from({ length: 20 }, () => randInt(b, 1000))).toEqual(xs)
    expect(seedRng(1)).not.toBe(seedRng(2))
    expect(nextRng(seedRng(7))).not.toBe(0)
  })
  it('flips are roughly fair', () => {
    const h = { rng: seedRng(3) }
    let heads = 0
    for (let i = 0; i < 10000; i++) if (flip(h)) heads++
    expect(heads).toBeGreaterThan(4800)
    expect(heads).toBeLessThan(5200)
  })
})
