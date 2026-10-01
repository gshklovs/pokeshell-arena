// Integer math for the sim: sub-pixel positions, binary-degree angles, a committed sine table, integer sqrt.
// Nothing here uses floating-point trig, so every platform gets bit-identical results (docs/SPEC.md section 3).

/** sub-pixels per design pixel */
export const FP = 256
/** fixed-point scale of the trig table */
export const ONE = 65536

// sin(2*pi*i/256) * 65536, rounded, for i = 0..64 (a quarter wave; the rest is symmetry). Committed, never computed.
const QSIN = [
  0, 1608, 3216, 4821, 6424, 8022, 9616, 11204, 12785, 14359, 15924, 17479, 19024, 20557, 22078, 23586, 25080,
  26558, 28020, 29466, 30893, 32303, 33692, 35062, 36410, 37736, 39040, 40320, 41576, 42806, 44011, 45190, 46341,
  47464, 48559, 49624, 50660, 51665, 52639, 53581, 54491, 55368, 56212, 57022, 57798, 58538, 59244, 59914, 60547,
  61145, 61705, 62228, 62714, 63162, 63572, 63944, 64277, 64571, 64827, 65043, 65220, 65358, 65457, 65516, 65536,
]

/** an angle 0..255 (256 = a full turn); 0 points +x (right), 64 points +y (down, screen space) */
export function wrapAngle(a: number): number {
  return ((a % 256) + 256) % 256
}

/** sin(a) x 65536 for a binary-degree angle */
export function isin(a: number): number {
  const i = wrapAngle(a)
  if (i <= 64) return QSIN[i]
  if (i <= 128) return QSIN[128 - i]
  if (i <= 192) return -QSIN[i - 128]
  return -QSIN[256 - i]
}

/** cos(a) x 65536 */
export function icos(a: number): number {
  return isin(a + 64)
}

/** floor(sqrt(n)) for a non-negative integer (exact up to 2^53) */
export function isqrt(n: number): number {
  if (n <= 0) return 0
  let x = Math.floor(Math.sqrt(n)) // a first guess only; corrected below, so the result is exact everywhere
  while (x * x > n) x--
  while ((x + 1) * (x + 1) <= n) x++
  return x
}

/** integer length of (dx, dy) */
export function ilen(dx: number, dy: number): number {
  return isqrt(dx * dx + dy * dy)
}

/** the binary-degree angle closest to the direction (dx, dy); 0 for a zero vector. Integer-only (a max-dot search) */
export function iatan2(dy: number, dx: number): number {
  if (dx === 0 && dy === 0) return 0
  // coarse search over 32 directions, then refine within +-8
  let best = 0
  let bestDot = -Infinity
  for (let a = 0; a < 256; a += 8) {
    const d = dx * icos(a) + dy * isin(a)
    if (d > bestDot) { bestDot = d; best = a }
  }
  const base = best
  for (let k = -8; k <= 8; k++) {
    const a = wrapAngle(base + k)
    const d = dx * icos(a) + dy * isin(a)
    if (d > bestDot) { bestDot = d; best = a }
  }
  return best
}

/** the signed difference b - a in -128..127 */
export function angleDiff(a: number, b: number): number {
  const d = wrapAngle(b - a)
  return d >= 128 ? d - 256 : d
}

/** trunc division for integers (the sim never keeps a fraction) */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b)
}

/** px/second -> sub-pixels/tick at 60 Hz */
export function pxPerSec(px: number): number {
  return idiv(px * FP, 60)
}

/** degrees -> binary degrees (rounded) */
export function deg(d: number): number {
  return Math.round((d * 256) / 360)
}
