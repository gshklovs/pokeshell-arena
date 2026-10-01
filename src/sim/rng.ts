// The sim's PRNG: xorshift32 over a 32-bit integer kept in state (so clone/rollback carries it).

/** a non-zero 32-bit seed from any integer */
export function seedRng(seed: number): number {
  let s = (seed | 0) ^ 0x9e3779b9
  s = Math.imul(s ^ (s >>> 16), 0x85ebca6b)
  s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35)
  s ^= s >>> 16
  return s === 0 ? 0x6d2b79f5 : s | 0
}

/** the next state */
export function nextRng(s: number): number {
  let x = s | 0
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  return x | 0
}

/** anything with an `rng` field: SimState, or a bot's own state */
export interface HasRng { rng: number }

/** a uniform integer in [0, n) */
export function randInt(h: HasRng, n: number): number {
  h.rng = nextRng(h.rng)
  return (h.rng >>> 0) % n
}

/** true with probability permille/1000 */
export function roll(h: HasRng, permille: number): boolean {
  return randInt(h, 1000) < permille
}

/** a coin flip: true = heads */
export function flip(h: HasRng): boolean {
  return randInt(h, 2) === 0
}
