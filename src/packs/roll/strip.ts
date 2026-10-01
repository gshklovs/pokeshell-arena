// The reel's strip: an infinite, seeded, chance-weighted sequence of sets (docs/PACK_ROLL.md, "The strip").
// Tile i is a draw from the sets' real chances, from a hash of (seed, i): the same seed always gives the same strip,
// and over a spin every set shows up as often as it really comes up. No DOM.
import type { RollSet } from './types';

/** a 0..1 hash of (seed, i): mulberry32 over a mixed key */
export function hash01(seed: number, i: number): number {
  let t = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(i | 0, 0x85ebca6b)) >>> 0;
  t = (t + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export class Strip {
  /** the sets that can appear (chance > 0), and their cumulative chances (normalised to 1) */
  readonly pool: RollSet[];
  private cum: number[];

  constructor(sets: RollSet[], readonly seed: number) {
    this.pool = sets.filter(s => (s.chance ?? 0) > 0);
    if (!this.pool.length) this.pool = sets.length ? [...sets] : [];
    const tot = this.pool.reduce((a, s) => a + Math.max(0, s.chance || 0), 0);
    let acc = 0;
    this.cum = this.pool.map(s => (acc += tot > 0 ? Math.max(0, s.chance || 0) / tot : 1 / this.pool.length));
  }

  /** the set on tile i (null with no sets) */
  at(i: number): RollSet | null {
    if (!this.pool.length) return null;
    const r = hash01(this.seed, i);
    for (let k = 0; k < this.cum.length; k++) if (r < this.cum[k]) return this.pool[k];
    return this.pool[this.pool.length - 1];
  }
}
