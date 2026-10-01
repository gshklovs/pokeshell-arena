// Effect families per tier, mirroring pokeshell's scripts/lib/booster.ps1 (used when a PackCard has no fx/hit).
import type { Fx, PackCard } from './types';

const TIER_FX: Record<string, Fx> = {
  common: 'plain', uncommon: 'plain', rare: 'plain',
  'rare-holo': 'holo', promo: 'holo', 'trainer-gallery-rare-holo': 'holo', 'pikachu-rare': 'holo',
  'rare-holo-v': 'holo', 'rare-holo-vmax': 'holo', 'rare-holo-vstar': 'holo', 'rare-holo-gx': 'holo', 'rare-holo-ex': 'holo',
  'double-rare': 'holo', 'rare-holo-lv-x': 'holo', 'rare-prime': 'holo', 'rare-break': 'holo', legend: 'holo',
  'rare-holo-star': 'holo', 'rare-prism-star': 'holo', 'ace-spec-rare': 'holo', 'futuristic-rare': 'rainbow',
  'rare-ultra': 'full-art', 'ultra-rare': 'full-art', 'illustration-rare': 'full-art',
  'special-illustration-rare': 'alt-art',
  'rare-rainbow': 'rainbow', 'shiny-ultra-rare': 'rainbow',
  'rare-secret': 'gold', 'hyper-rare': 'gold',
  'radiant-rare': 'radiant', 'amazing-rare': 'radiant', 'rare-shining': 'radiant',
  'rare-shiny': 'shiny', 'rare-shiny-gx': 'shiny', 'shiny-rare': 'shiny',
};

export const FX_HIT: Record<Fx, number> = { plain: 0, reverse: 1, holo: 2, 'full-art': 3, radiant: 3, shiny: 3, 'alt-art': 4, rainbow: 4, gold: 5 };

export function fxOf(c: PackCard): Fx {
  if (c.fx) return c.fx;
  let fx: Fx = TIER_FX[c.tier] ?? 'holo';
  if (fx === 'plain' && c.finish && c.finish !== 'normal') fx = 'reverse';
  return fx;
}

export function hitOf(c: PackCard): number {
  if (typeof c.hit === 'number') return c.hit;
  const fx = fxOf(c);
  let h = FX_HIT[fx];
  if (fx === 'plain' && c.tier === 'rare') h = 1;
  if (c.shiny) h = Math.min(5, h + 1);
  return h;
}

/** the tier's light: the colour the card back pulses in, the tear leaks, the ribbon wears */
export const FX_COLOR: Record<Fx, { a: string; b: string; glow: string; name: string }> = {
  plain: { a: '#e9edf5', b: '#9aa4b5', glow: 'rgba(255,255,255,.55)', name: 'common' },
  reverse: { a: '#dfe8f5', b: '#8fa3c0', glow: 'rgba(200,220,255,.7)', name: 'reverse holo' },
  holo: { a: '#8fe3ff', b: '#3f7cff', glow: 'rgba(110,190,255,.85)', name: 'holo' },
  'full-art': { a: '#ffffff', b: '#b58cff', glow: 'rgba(210,180,255,.9)', name: 'full art' },
  radiant: { a: '#fff6b0', b: '#ff9e3d', glow: 'rgba(255,200,110,.9)', name: 'radiant' },
  shiny: { a: '#f4f0ff', b: '#6b5a9a', glow: 'rgba(235,225,255,.9)', name: 'shiny' },
  'alt-art': { a: '#ffd6f0', b: '#7ad7c8', glow: 'rgba(255,190,230,.95)', name: 'alternate art' },
  rainbow: { a: '#ff7ad9', b: '#6ef0ff', glow: 'rgba(255,140,230,.95)', name: 'rainbow' },
  gold: { a: '#fff1a8', b: '#d99a1e', glow: 'rgba(255,205,80,1)', name: 'gold' },
};

/** the card chassis' frame gradient per fx (the terminal's frame presets: plain, silver, holo, rainbow, gold) */
export const FRAME: Record<Fx, string[]> = {
  plain: ['#f4e7a1', '#e7cf62', '#d9b43a', '#e7cf62', '#f4e7a1'],
  reverse: ['#eef2f7', '#b9c4d2', '#ffffff', '#9eabbd', '#e6ebf2'],
  holo: ['#f7e28b', '#e0b83a', '#fff3c4', '#c89a26', '#f2d777'],
  'full-art': ['#e8e2ff', '#b7c4ff', '#ffe3f6', '#a6f0ff', '#e8e2ff'],
  radiant: ['#fff4c2', '#ffb347', '#fffbe6', '#ff8a3d', '#ffe08a'],
  shiny: ['#d8d2ea', '#8d82ad', '#f7f4ff', '#6c618c', '#cfc8e6'],
  'alt-art': ['#ffe3f1', '#bff0e6', '#fff6d6', '#d3c6ff', '#ffe3f1'],
  rainbow: ['#ff9ad5', '#ffe38a', '#9dffb0', '#8ad8ff', '#d49aff'],
  gold: ['#fff3b0', '#e7b93a', '#fffbe0', '#b8821a', '#f6d66a'],
};

export const TIER_SYMBOL: Record<string, string> = {
  common: '●', uncommon: '◆', rare: '★', 'rare-holo': '★', 'rare-holo-v': '★★', 'rare-holo-vmax': '★★', 'rare-holo-vstar': '★★',
  'rare-holo-gx': '★★', 'double-rare': '★★', 'rare-ultra': '★★', 'ultra-rare': '★★', 'illustration-rare': '★',
  'special-illustration-rare': '★★', 'rare-rainbow': '★★★', 'rare-secret': '★★★', 'hyper-rare': '★★★', 'radiant-rare': '★',
  'rare-shiny': '☆', 'rare-shiny-gx': '☆☆', 'shiny-rare': '☆', 'trainer-gallery-rare-holo': '★', 'pikachu-rare': '★',
  'futuristic-rare': '★★', 'amazing-rare': '★',
};

export type RevealClass = 'quick' | 'flip' | 'charged' | 'held';
export function revealClass(hit: number, last: boolean): RevealClass {
  if (hit >= 4) return 'held';
  if (hit >= 3) return 'charged';
  if (hit >= 1 || last) return 'flip';
  return 'quick';
}

export function fxLabel(c: PackCard): string {
  const fx = fxOf(c);
  if (c.outcome && !['common', 'uncommon', 'rare', 'reverse holo', 'foil common'].includes(c.outcome)) return c.outcome;
  return c.tierLabel ?? FX_COLOR[fx].name;
}

/**
 * The rarity aura: the light a card (and, before that, the pack's seam) gives off. Common barely glows, uncommon
 * softly, rare and holo blue-white, the ultras gold-magenta and strong, rainbow / secret / hyper prismatic or gold
 * with rays and a constant sparkle. `intensity` (0-1) scales the glow, `particles` is sparkles per second at rest
 * (shaking the card multiplies it), `rays` puts god rays behind the card, `prismatic` cycles the hue.
 */
export type AuraLevel = 'none' | 'soft' | 'cool' | 'strong' | 'prismatic' | 'gold';
export interface Aura {
  level: AuraLevel;
  /** the core and the rim colour of the glow */
  a: string; b: string;
  /** the sparkle palette */
  colors: string[];
  intensity: number;
  particles: number;
  rays: boolean;
  prismatic: boolean;
}

const AURA: Record<AuraLevel, Omit<Aura, 'level'>> = {
  none: { a: 'rgba(255,255,255,.9)', b: 'rgba(200,210,230,.4)', colors: ['#ffffff'], intensity: 0.06, particles: 0, rays: false, prismatic: false },
  soft: { a: 'rgba(235,245,255,.95)', b: 'rgba(170,200,230,.5)', colors: ['#ffffff', '#e4efff'], intensity: 0.24, particles: 1, rays: false, prismatic: false },
  cool: { a: 'rgba(225,245,255,1)', b: 'rgba(90,160,255,.75)', colors: ['#ffffff', '#bfe9ff', '#7fb4ff'], intensity: 0.52, particles: 5, rays: false, prismatic: false },
  strong: { a: 'rgba(255,226,140,1)', b: 'rgba(255,80,200,.8)', colors: ['#fff3c0', '#ffd35a', '#ff8ad8', '#ffffff'], intensity: 0.8, particles: 12, rays: false, prismatic: false },
  prismatic: { a: 'rgba(255,255,255,1)', b: 'rgba(255,120,230,.9)', colors: ['#ff6fb5', '#ffb86b', '#fff27a', '#7dff9c', '#6fd8ff', '#9f8bff', '#ffffff'], intensity: 1, particles: 26, rays: true, prismatic: true },
  gold: { a: 'rgba(255,246,200,1)', b: 'rgba(255,184,40,.95)', colors: ['#fff6c8', '#ffe07a', '#f5c542', '#ffffff'], intensity: 1, particles: 26, rays: true, prismatic: false },
};

export function auraLevel(fx: Fx, hit: number, tier = ''): AuraLevel {
  if (fx === 'rainbow') return 'prismatic';
  if (fx === 'gold') return 'gold';
  if (fx === 'full-art' || fx === 'alt-art' || fx === 'radiant' || fx === 'shiny' || hit >= 3) return 'strong';
  if (fx === 'holo' || hit === 2) return 'cool';
  if (fx === 'reverse' || hit === 1 || tier === 'uncommon') return 'soft';
  return 'none';
}

/** the aura of a card, from its effect family, hit size, tier and shiny roll */
export function auraOf(c: PackCard): Aura {
  const fx = fxOf(c), hit = hitOf(c);
  const level = auraLevel(fx, hit, c.tier);
  const base = AURA[level];
  const aura: Aura = { level, ...base, colors: [...base.colors] };
  // each family keeps its own hue inside its level
  if (fx === 'radiant') { aura.a = 'rgba(255,240,170,1)'; aura.b = 'rgba(255,140,50,.85)'; aura.colors = ['#fff7c2', '#ffb347', '#ffffff']; }
  if (fx === 'alt-art') { aura.intensity = 0.9; aura.particles = 16; aura.rays = true; }
  if (fx === 'shiny') { aura.a = 'rgba(250,245,255,1)'; aura.b = 'rgba(190,120,255,.8)'; aura.colors = ['#ffffff', '#efe6ff', '#ff9ae6']; }
  if (c.shiny) {
    aura.intensity = Math.min(1, aura.intensity + 0.12);
    aura.particles += 6;
    if (!aura.colors.includes('#ffffff')) aura.colors.push('#ffffff');
  }
  return aura;
}

/**
 * How much show a card gets before and during its reveal (docs/PACK_OPENING.md, 4b), escalating steeply by tier. It
 * reads the aura (so it's honest: how rare, never which card). calm: commons and low tiers, quick and quiet. mid: holo,
 * full art. top: prismatic, gold, alt art / SIR, rainbow, radiant, shiny.
 */
export interface RevealFx {
  tier: 'calm' | 'mid' | 'top';
  /** 0-1: the aura's intensity */
  power: number;
  /** face down: an edge leak, rays peeking from behind, a coloured floor glow, a breathing pulse */
  leak: boolean; rays: boolean; floor: boolean; breathe: boolean;
  /** face down: floating gold flecks; a hue sweep across the back */
  flecks: boolean; prism: boolean;
  /** face down: idle sparkles per second (before any shaking) */
  idleSparks: number;
  /** the flip: extra ms of slow-mo, shockwave rings, shards, a ray sweep, the push-in scale, a foil sheen, a full-screen bloom and glitter */
  slowmoMs: number; rings: number; shards: number; sweep: boolean; push: number; sheen: boolean; bloom: boolean;
}

export function revealFx(c: PackCard): RevealFx {
  const fx = fxOf(c), aura = auraOf(c), p = aura.intensity;
  const top = aura.level === 'prismatic' || aura.level === 'gold' || ['alt-art', 'rainbow', 'radiant', 'shiny'].includes(fx) || c.shiny && p >= 0.5;
  const tier: RevealFx['tier'] = top ? 'top' : p >= 0.5 ? 'mid' : 'calm';
  const grand = aura.level === 'gold' || fx === 'gold' || fx === 'alt-art';
  return {
    tier, power: p,
    leak: tier !== 'calm', rays: top, floor: tier !== 'calm', breathe: top,
    flecks: aura.level === 'gold' || fx === 'gold', prism: aura.prismatic || fx === 'rainbow' || fx === 'alt-art',
    idleSparks: top ? 22 : tier === 'mid' ? 4 : 0,
    slowmoMs: top ? (grand ? 650 : 400) : 0,
    rings: top ? 2 : tier === 'mid' ? 1 : 0,
    shards: top ? Math.round(60 + 40 * p) : tier === 'mid' ? 24 : 0,
    sweep: tier !== 'calm', push: top ? 1.07 : tier === 'mid' ? 1.03 : 1,
    sheen: p >= 0.24, bloom: grand,
  };
}
