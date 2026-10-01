// A booster wrapper per set, drawn in SVG from pokeshell's set data (name, colours, motif, hero card image).
// Our own design: never a scan of an official wrapper.
import type { SetInfo } from './types';

export const PACK_W = 250, PACK_H = 400, TEAR_Y = 62;

export function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function motif(kind: string, r: () => number, c: string[], accent: string): string {
  const out: string[] = [];
  switch (kind) {
    case 'sky':
      for (let i = 0; i < 9; i++) {
        const y = 40 + i * 42 + r() * 20, a = 20 + r() * 30;
        out.push(`<path d="M-20 ${y} C 60 ${y - a}, 120 ${y + a}, 270 ${y - a * 0.6}" stroke="${i % 3 ? c[2] : accent}" stroke-opacity="${0.12 + r() * 0.18}" stroke-width="${2 + r() * 6}" fill="none" stroke-linecap="round"/>`);
      }
      break;
    case 'confetti':
      for (let i = 0; i < 70; i++) out.push(`<rect x="${r() * 250}" y="${r() * 400}" width="${3 + r() * 7}" height="${2 + r() * 4}" rx="1" fill="${[accent, c[2], '#ffffff', c[1]][i % 4]}" fill-opacity="${0.25 + r() * 0.45}" transform="rotate(${r() * 180} ${r() * 250} ${r() * 400})"/>`);
      break;
    case 'crown':
      for (let i = 0; i < 26; i++) { const x = r() * 250, y = r() * 400, s = 2 + r() * 5; out.push(star4(x, y, s, accent, 0.35 + r() * 0.5)); }
      out.push(`<path d="M70 312 L85 282 L105 300 L125 270 L145 300 L165 282 L180 312 Z" fill="${accent}" fill-opacity=".22"/>`);
      break;
    case 'vault':
      for (let x = 0; x <= 250; x += 25) out.push(`<line x1="${x}" y1="0" x2="${x}" y2="400" stroke="${c[2]}" stroke-opacity=".1"/>`);
      for (let y = 0; y <= 400; y += 25) out.push(`<line x1="0" y1="${y}" x2="250" y2="${y}" stroke="${c[2]}" stroke-opacity=".1"/>`);
      for (let i = 0; i < 30; i++) out.push(star4(r() * 250, r() * 400, 1.5 + r() * 4, '#ffffff', 0.25 + r() * 0.6));
      break;
    case 'classic':
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; out.push(`<path d="M125 200 L${125 + Math.cos(a) * 420} ${200 + Math.sin(a) * 420} L${125 + Math.cos(a + 0.12) * 420} ${200 + Math.sin(a + 0.12) * 420} Z" fill="${i % 2 ? accent : c[2]}" fill-opacity=".13"/>`); }
      break;
    case 'stars':
      for (let i = 0; i < 60; i++) out.push(star4(r() * 250, r() * 400, 1 + r() * 4.5, i % 5 ? '#ffffff' : accent, 0.2 + r() * 0.7));
      break;
    case 'leaves':
      for (let i = 0; i < 22; i++) { const x = r() * 250, y = r() * 400; out.push(`<ellipse cx="${x}" cy="${y}" rx="${6 + r() * 10}" ry="${3 + r() * 4}" fill="${i % 3 ? c[1] : accent}" fill-opacity="${0.18 + r() * 0.25}" transform="rotate(${r() * 180} ${x} ${y})"/>`); }
      break;
    case 'mystery':
      // silver foil: diagonal sheen bands and a scatter of question marks
      for (let i = -4; i < 12; i++) out.push(`<path d="M${i * 34} 0 L${i * 34 + 18} 0 L${i * 34 - 132} 400 L${i * 34 - 150} 400 Z" fill="#ffffff" fill-opacity="${(0.05 + r() * 0.09).toFixed(2)}"/>`);
      for (let i = 0; i < 22; i++) { const x = r() * 250, y = 150 + r() * 250, s = 12 + r() * 20; out.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${s.toFixed(1)}" class="pk-w-q" fill="${i % 3 ? '#ffffff' : accent}" fill-opacity="${(0.1 + r() * 0.2).toFixed(2)}" transform="rotate(${((r() - 0.5) * 40).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">?</text>`); }
      for (let i = 0; i < 26; i++) out.push(star4(r() * 250, r() * 400, 1.2 + r() * 3.5, '#ffffff', 0.3 + r() * 0.6));
      break;
    case 'void':
      for (let i = 1; i < 12; i++) out.push(`<circle cx="125" cy="200" r="${i * 26}" fill="none" stroke="${i % 2 ? c[2] : accent}" stroke-opacity="${0.06 + i * 0.012}" stroke-width="${1 + (i % 3)}"/>`);
      break;
  }
  return out.join('');
}

function star4(x: number, y: number, s: number, fill: string, op: number) {
  return `<path d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s}Z" fill="${fill}" fill-opacity="${op.toFixed(2)}"/>`;
}

/**
 * The wrapper shown while a random pack is still being rolled: silver foil with a question mark. It re-skins to the
 * rolled set when the pack arrives (OpenPackOptions.reskin).
 */
export const MYSTERY_SET: SetInfo = {
  id: 'mystery', name: 'Mystery', series: 'a random pack',
  art: { colors: ['#3d4452', '#9aa4b6', '#eef2f8'], accent: '#fff4c2', motif: 'mystery' },
};

/** the crimped outline: a zigzag along the top and bottom seals */
function crimpPath() {
  const teeth = 25, tw = PACK_W / teeth;
  let d = `M0 6`;
  for (let i = 0; i < teeth; i++) d += ` L${(i + 0.5) * tw} 0 L${(i + 1) * tw} 6`;
  d += ` L${PACK_W} ${PACK_H - 6}`;
  for (let i = teeth; i > 0; i--) d += ` L${(i - 0.5) * tw} ${PACK_H} L${(i - 1) * tw} ${PACK_H - 6}`;
  return d + ' Z';
}

/** the id prefix of a set's wrapper SVG; `${wrapperId(set)}art` is its artwork group (reused by the peeling strip) */
export const wrapperId = (set: SetInfo) => `pk${set.id.replace(/[^a-z0-9]/gi, '')}`;

export function wrapperSVG(set: SetInfo, heroUrl: string, cards: number): string {
  const c = set.art?.colors?.length ? [...set.art.colors] : ['#1b2340', '#3a5bd9', '#9fd0ff'];
  while (c.length < 3) c.push(c[c.length - 1]);
  const accent = set.art?.accent ?? '#ffd35a';
  const r = rng(set.id);
  const name = set.name.toUpperCase();
  const words = name.split(' ');
  // one or two title lines, sized to fit
  const lines = words.length > 1 && name.length > 11 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [name];
  const longest = Math.max(...lines.map(l => l.length));
  const fs = Math.min(34, 215 / (longest * 0.62));
  const id = wrapperId(set);
  const title = lines.map((l, i) => `<text x="125" y="${104 + i * (fs + 2) - (lines.length - 1) * (fs / 2)}" text-anchor="middle" class="pk-w-title" font-size="${fs.toFixed(1)}">${esc(l)}</text>`).join('');
  return `<svg viewBox="0 0 ${PACK_W} ${PACK_H}" xmlns="http://www.w3.org/2000/svg" class="pk-wrapper-svg" aria-hidden="true">
<defs>
  <linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[0]}"/></linearGradient>
  <linearGradient id="${id}crimp" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c[2]}"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>
  <radialGradient id="${id}glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${accent}" stop-opacity=".85"/><stop offset=".6" stop-color="${c[2]}" stop-opacity=".25"/><stop offset="1" stop-color="${c[2]}" stop-opacity="0"/></radialGradient>
  <pattern id="${id}ridge" width="3" height="10" patternUnits="userSpaceOnUse"><rect width="1.4" height="10" fill="#000" fill-opacity=".22"/></pattern>
  <clipPath id="${id}clip"><path d="${crimpPath()}"/></clipPath>
  <clipPath id="${id}win"><rect x="30" y="140" width="190" height="160" rx="14"/></clipPath>
</defs>
<g clip-path="url(#${id}clip)" id="${id}art">
  <rect width="${PACK_W}" height="${PACK_H}" fill="url(#${id}bg)"/>
  ${motif(set.art?.motif ?? 'stars', r, c, accent)}
  <ellipse cx="125" cy="220" rx="150" ry="120" fill="url(#${id}glow)" opacity=".7"/>
  <rect x="0" y="0" width="${PACK_W}" height="${TEAR_Y - 30}" fill="url(#${id}crimp)" opacity=".85"/>
  <rect x="0" y="0" width="${PACK_W}" height="${TEAR_Y - 30}" fill="url(#${id}ridge)"/>
  <rect x="0" y="${PACK_H - 32}" width="${PACK_W}" height="32" fill="url(#${id}crimp)" opacity=".85"/>
  <rect x="0" y="${PACK_H - 32}" width="${PACK_W}" height="32" fill="url(#${id}ridge)"/>
  ${title}
  <text x="125" y="${lines.length > 1 ? 136 : 128}" text-anchor="middle" class="pk-w-series">${esc((set.series ?? 'Pokemon TCG').toUpperCase())}</text>
  <rect x="26" y="136" width="198" height="168" rx="17" fill="${c[0]}" fill-opacity=".55" stroke="${accent}" stroke-width="2.5"/>
  <g clip-path="url(#${id}win)">
    <rect x="30" y="140" width="190" height="160" fill="${c[1]}"/>
    <ellipse cx="125" cy="220" rx="110" ry="90" fill="url(#${id}glow)"/>
    ${heroUrl ? `<image href="${esc(heroUrl)}" x="30" y="140" width="190" height="160" preserveAspectRatio="xMidYMid slice" style="image-rendering:pixelated"/>` : set.art?.motif === 'mystery' ? `<text x="125" y="262" text-anchor="middle" class="pk-w-bigq" fill="${accent}">?</text>` : ''}
  </g>
  <rect x="30" y="140" width="190" height="160" rx="14" fill="none" stroke="#ffffff" stroke-opacity=".35"/>
  <text x="125" y="330" text-anchor="middle" class="pk-w-booster">BOOSTER</text>
  <text x="125" y="350" text-anchor="middle" class="pk-w-meta">pokeshell · ${cards} cards</text>
  <rect x="${PACK_W - 12}" y="0" width="12" height="${PACK_H}" fill="#000" fill-opacity=".12"/>
</g>
</svg>`;
}

/** a jagged tear line across the wrapper at TEAR_Y, as clip polygons (in % of the pack) for the flap and the body */
export function tearPolygons(seed: string) {
  const r = rng(seed + ':tear');
  const pts: [number, number][] = [];
  const n = 26;
  for (let i = 0; i <= n; i++) pts.push([(i / n) * 100, (TEAR_Y / PACK_H) * 100 + (i === 0 || i === n ? 0 : (r() - 0.5) * 2.6)]);
  const line = pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`);
  const flap = `polygon(0% 0%, 100% 0%, ${[...line].reverse().join(', ')})`;
  const body = `polygon(${line.join(', ')}, 100% 100%, 0% 100%)`;
  return { flap, body, pts };
}

/** how far below TEAR_Y the torn edge can dip (user units): the peeling strip is this much taller than TEAR_Y */
export const TEAR_DIP = 5;
export const STRIP_H = TEAR_Y + TEAR_DIP;

/**
 * The torn edge at full resolution (user units, 0..PACK_W): a slow wander, a mid zigzag and fine foil teeth, seeded
 * per set so a pack always tears the same way. `back` is the back panel's edge, torn with it a little higher.
 */
export function tearEdge(seed: string, n = 128) {
  const r = rng(seed + ':edge');
  const p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28;
  const front: [number, number][] = [], back: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * PACK_W;
    const end = Math.min(1, Math.min(i, n - i) / 3);
    const wander = 1.5 * Math.sin(x * 0.041 + p1) + 0.9 * Math.sin(x * 0.117 + p2);
    const tooth = (i % 2 ? 1 : -1) * (0.45 + r() * 0.95) + (r() < 0.08 ? (r() - 0.3) * 3.2 : 0);
    const y = TEAR_Y + (wander + tooth) * end;
    front.push([x, Math.min(STRIP_H - 0.5, y)]);
    back.push([x, y - 2.4 - 1.2 * Math.abs(Math.sin(x * 0.07 + p3)) + (i % 2 ? 0.5 : -0.3) * end]);
  }
  return { front, back };
}

const pt = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;

/** SVG paths and CSS clips from the torn edge */
export function tearShapes(seed: string, n = 128) {
  const { front, back } = tearEdge(seed, n);
  const line = front.map(pt).join(' L');
  const rev = [...front].reverse().map(pt).join(' L');
  return {
    front, back,
    /** the torn edge as an open path */
    edge: `M${line}`,
    /** the strip that peels off (above the edge) */
    flap: `M0 0 L${PACK_W} 0 L${rev} Z`,
    /** the pack's mouth: between the back panel's edge and the front's */
    mouth: `M${back.map(pt).join(' L')} L${rev} Z`,
    /** the body, as a CSS clip (below the edge) */
    bodyClip: `polygon(${front.map(([x, y]) => `${((x / PACK_W) * 100).toFixed(2)}% ${((y / PACK_H) * 100).toFixed(2)}%`).join(', ')}, 100% 100%, 0% 100%)`,
  };
}
