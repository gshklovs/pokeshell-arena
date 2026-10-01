// The light out of the tear, drawn crisp (docs/PACK_OPENING.md, 5a): thin vector rays with a falloff, rising from the
// torn part of the mouth only, in the colours and strength of the pack's best card (honest foreshadowing: how big,
// never what). Vector SVG in the pack's own coordinates, so it is sharp at any devicePixelRatio; no canvas, no blur
// blobs. The bright core line and its thin bloom live on the rim (scene.ts buildRim), clipped to the cut.
import type { Aura } from './tiers';
import { PACK_W, TEAR_Y, rng } from './wrapper';

/** how far the rays can reach above the pack's top edge, in pack units */
export const LEAK_UP = 300;
const SIDE = 90;

export interface Ray { x: number; el: SVGElement | null; on: boolean }

/** the rays for an aura (or the neutral light before the pack has arrived): pure data, for the SVG and the tests */
export function rayField(seed: string, aura: Aura | null) {
  const i = aura ? Math.max(0.1, aura.intensity) : 0.12;
  const r = rng(seed + ':rays');
  const n = Math.round(8 + 40 * i);
  const colors = aura ? (aura.prismatic ? aura.colors.filter(c => c !== '#ffffff') : [aura.a, aura.b, aura.colors[0]]) : ['#ffffff'];
  const rays = [];
  for (let k = 0; k < n; k++) {
    const x = 6 + r() * (PACK_W - 12);
    // fan outwards from the pack's middle, with some scatter; the longer ones for the bigger hits
    const lean = ((x - PACK_W / 2) / (PACK_W / 2)) * 0.5 + (r() - 0.5) * 0.35;
    const len = (50 + r() * 170) * (0.45 + 0.75 * i);
    const w = 0.35 + r() * (0.9 + 1.4 * i);
    rays.push({ x, lean, len, w, color: colors[k % colors.length], alpha: 0.35 + r() * 0.65 });
  }
  return { rays, intensity: i };
}

/** the leak's SVG, positioned over the pack by .pk-leak (it reaches LEAK_UP above the pack and SIDE past its sides) */
export function leakSVG(id: string, field: ReturnType<typeof rayField>): string {
  const grads: string[] = [];
  const polys = field.rays.map((ry, k) => {
    // a thin wedge: sharp at the mouth, tapering to nothing at its tip, its light falling off along its own length
    const tipX = ry.x + ry.lean * ry.len, tipY = TEAR_Y - ry.len;
    const a = Math.atan2(tipY - TEAR_Y, tipX - ry.x) + Math.PI / 2;
    const nx = Math.cos(a) * ry.w, ny = Math.sin(a) * ry.w;
    const g = `${id}g${k}`;
    grads.push(`<linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="${ry.x.toFixed(1)}" y1="${TEAR_Y}" x2="${tipX.toFixed(1)}" y2="${tipY.toFixed(1)}">`
      + `<stop offset="0" stop-color="#ffffff"/><stop offset=".07" stop-color="${ry.color}" stop-opacity=".95"/><stop offset=".45" stop-color="${ry.color}" stop-opacity=".32"/><stop offset="1" stop-color="${ry.color}" stop-opacity="0"/></linearGradient>`);
    return `<path data-k="${k}" d="M${(ry.x - nx).toFixed(2)} ${(TEAR_Y - ny).toFixed(2)} L${(ry.x + nx).toFixed(2)} ${(TEAR_Y + ny).toFixed(2)} L${tipX.toFixed(2)} ${tipY.toFixed(2)} Z" fill="url(#${g})" opacity="${ry.alpha.toFixed(2)}"/>`;
  }).join('');
  const defs = grads.join('');
  return `<svg class="pk-leak" viewBox="${-SIDE} ${-LEAK_UP} ${PACK_W + 2 * SIDE} ${LEAK_UP + TEAR_Y + 4}" preserveAspectRatio="none" aria-hidden="true"
 style="left:${(-SIDE / PACK_W) * 100}%;top:${(-LEAK_UP / 400) * 100}%;width:${((PACK_W + 2 * SIDE) / PACK_W) * 100}%;height:${((LEAK_UP + TEAR_Y + 4) / 400) * 100}%">
<defs>${defs}</defs><g class="pk-leak__rays">${polys}</g></svg>`;
}
