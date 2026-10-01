// The move lexicon (docs/MOVES.md): an attack's own qualities -> how it travels and hits. Layered:
//   1. the type default (flavors.ts, and the auto-kit's type fallback)
//   2. this lexicon: the attack's NAME (hand-picked whole names, then ordered keyword rules and stems), then its
//      TEXT (what it does), then its damage and cost for the size
//   3. the hand kit (tools/kits/hand), which overrides the shape; the lexicon's trajectory still rides along when
//      the shape kinds agree (build.ts)
// Every archetype is a shape (kind + trajectory + sizes) sized by the energy cost and the damage, plus the feel
// effects an auto-kit adds (a punch shoves, a whip reels in, a web sticks). Deterministic: pure functions of the
// card data. The move language merges this branch's trajectory lexicon with the unfinished move-design pass
// (branch pack-redesign-restore, src/sim/moves.ts): its archetypes, its hand-picked names and its keyword rules.
import type { ParsedText } from './cardtext'
import { SIGNATURES } from './signatures'
import type { Effect, EnergyType, Shape, ShapeKind } from './types'

export interface Archetype {
  id: string
  /** what it looks like in play, for docs and the report */
  what: string
  shape: (c: number, d: number, t: EnergyType) => Shape
  /** a longer tell for the big ones (ticks; the sim's minimum windup applies anyway) */
  windup?: (c: number, d: number) => number
  /** the feel on hit an auto-kit adds (knockback, slow, pull); a hand kit keeps its own */
  hit?: (c: number, d: number) => Effect[]
  /** a broad bucket (a plain orb, beam, blow...): many unlike names share its look, so it says little about the move.
   * A hand kit keeps its own shape under one (kit.resolveKit), and the coverage report counts it as generic */
  generic?: boolean
}

const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)))
const heavy = (c: number, d: number) => c >= 3 || d >= 100
const proj = (c: number, d: number, extra: Record<string, unknown> = {}, speed = 13): Shape =>
  ({ kind: 'projectile', speed, radius: cl(9 + d / 30, 9, 22), range: cl(520 + 40 * c, 520, 760), ...extra })
const melee = (range: number, arc: number, lunge = 0): Shape => ({ kind: 'melee', range, arc, ...(lunge ? { lunge } : {}) })
const dash = (distance: number, speed: number, radius: number, extra: Record<string, unknown> = {}): Shape =>
  ({ kind: 'dash', distance, speed, radius, invulnerable: 0, ...extra })
const kb = (px: number): Effect => ({ op: 'knockback', px })
const slow = (permille: number, ticks: number): Effect => ({ op: 'slow', permille, ticks })
const pull = (px: number): Effect => ({ op: 'pull', px })
const A = (id: string, what: string, shape: Archetype['shape'], more: Partial<Archetype> = {}): Archetype => ({ id, what, shape, ...more })

/** the broad buckets (Archetype.generic) */
export const GENERIC = new Set(['orb', 'beam', 'blast', 'ball', 'bullet', 'nova', 'max', 'strike', 'slam', 'jab'])

/** every archetype, by id: the lexicon's own, then the signature moves (signatures.ts) */
export const ARCHETYPES: Record<string, Archetype> = Object.fromEntries([
  // ---------------------------------------------------------------- melee: close, fast, readable
  A('jab', 'a quick close poke with a little shove', () => melee(66, 90, 24), { hit: () => [kb(24)] }),
  A('peck', 'a fast narrow beak stab with a short step in', () => melee(78, 52, 30)),
  A('scratch', 'a 135° claw rake', () => melee(70, 96, 20)),
  A('slash', 'a wide 180° slash with a step in', (c, d) => melee(heavy(c, d) ? 94 : 80, 128, heavy(c, d) ? 40 : 24), { windup: (c, d) => (heavy(c, d) ? 10 : 7) }),
  A('blade', 'a long lunge that ends in a slice', (c, d) => melee(96, 80, heavy(c, d) ? 110 : 80), { windup: (c, d) => (heavy(c, d) ? 12 : 9) }),
  A('bite', 'a snapping lunge', (c) => melee(cl(62 + 3 * c, 62, 78), 84, cl(50 + 10 * c, 50, 90))),
  A('punch', 'a straight lunging punch that shoves', (c, d) => melee(68, 64, heavy(c, d) ? 56 : 40), { windup: (c, d) => (heavy(c, d) ? 12 : 7), hit: (c, d) => [kb(heavy(c, d) ? 120 : 70)] }),
  A('uppercut', 'a rising blow that launches', () => melee(66, 76, 34), { windup: () => 10, hit: () => [kb(170)] }),
  A('kick', 'a lunging kick with a solid push', () => melee(78, 72, 48), { hit: () => [kb(60)] }),
  A('chop', 'a narrow chop that staggers', () => melee(74, 56, 26), { hit: () => [slow(300, 30)] }),
  A('tail', 'a wide tail sweep that knocks away', () => melee(88, 160), { windup: () => 9, hit: () => [kb(70)] }),
  A('spin', 'a spin that hits all around', (c) => melee(cl(74 + 5 * c, 74, 100), 255), { hit: () => [kb(50)] }),
  A('flail', 'thrashing about, all around, short', () => melee(62, 255)),
  A('horn', 'a long narrow thrust', (c, d) => melee(heavy(c, d) ? 124 : 108, 36, heavy(c, d) ? 70 : 40), { windup: () => 8, hit: (c, d) => (heavy(c, d) ? [kb(70)] : []) }),
  A('whip', 'a very long, very narrow lash that reels the foe in', (c) => melee(cl(130 + 10 * c, 130, 170), 28), { hit: () => [pull(30)] }),
  A('grab', 'a grab that pulls in and holds', () => melee(70, 90, 28), { hit: () => [pull(24), slow(400, 45)] }),
  A('throw', 'grab and hurl far', () => melee(70, 96, 36), { windup: () => 10, hit: () => [kb(200)] }),
  A('combo', 'a flurry of blows (its coins decide the damage)', () => melee(66, 80, 28)),
  A('counter', 'a wide counter-swing that pushes back', () => melee(76, 110, 24), { hit: () => [kb(60)] }),
  A('slam', 'a heavy close blow', (c, d) => melee(cl(78 + 5 * c, 78, 100), cl(90 + 6 * c, 90, 130), 20 + Math.min(40, Math.round(d / 5)))),
  A('strike', 'a melee blow that dashes in', (c, d) => melee(cl(70 + 4 * c, 70, 92), cl(70 + 6 * c, 70, 104), cl(40 + 15 * c + d / 10, 50, 110))),
  A('hammer', 'an overhead smash on a circle just ahead', (c, d) => ({ kind: 'area', at: 'aim', range: heavy(c, d) ? 84 : 72, radius: cl(72 + d / 10, 72, 100), delay: 8 }), { windup: (c, d) => (heavy(c, d) ? 16 : 12), hit: () => [kb(60), slow(300, 30)] }),
  A('stomp', 'a short quake around the feet (slows)', (c) => ({ kind: 'area', at: 'self', radius: cl(100 + 10 * c, 100, 140) }), { windup: () => 10, hit: () => [kb(50), slow(350, 40)] }),
  // ---------------------------------------------------------------- dashes: you are the projectile
  A('tackle', 'a short body charge (no i-frames)', (c, d) => dash(heavy(c, d) ? 210 : 150, 15, 32), { hit: (c, d) => [kb(heavy(c, d) ? 90 : 50)] }),
  A('quick', 'a blink-fast dash with i-frames', () => ({ kind: 'dash', distance: 180, speed: 28, radius: 22 })),
  A('charge', 'a long heavy charge that bowls over, committed (no i-frames)', (c, d) => dash(cl(240 + 20 * c, 260, 320), 20, cl(30 + d / 25, 30, 40)), { windup: () => 12, hit: () => [kb(110)] }),
  A('roll', 'a long rolling run', () => dash(300, 13, 28), { hit: () => [kb(45)] }),
  A('leap', 'leaps / digs out of reach, then crashes down where it lands', (c, d) => ({ kind: 'dash', distance: cl(240 + 20 * c, 260, 340), speed: cl(12 + c, 12, 16), radius: 28, path: 'leap', blast: cl(50 + d / 6, 50, 100) })),
  A('blink', 'vanishes and reappears with a strike', () => ({ kind: 'dash', distance: 280, speed: 40, radius: 28, path: 'leap', blast: 64 })),
  A('wing', 'a swoop with wide wings', () => dash(200, 20, 34), { hit: () => [kb(40)] }),
  A('jet', 'a jet-propelled rush', (c, d) => dash(250, 24, 32), { hit: (c, d) => [kb(heavy(c, d) ? 110 : 60)] }),
  A('rage', 'a furious rush', () => dash(200, 17, 34), { hit: () => [kb(70)] }),
  A('flamecharge', 'a burning charge that scorches where it stops', (c, d) => dash(heavy(c, d) ? 280 : 220, 19, 36), { hit: (c, d) => [kb(heavy(c, d) ? 110 : 60)] }),
  // ---------------------------------------------------------------- projectiles
  A('bullet', 'a quick straight shot', (c, d) => proj(c, d, {}, 16)),
  A('bolt', 'a fast thin crackling bolt', (c) => ({ kind: 'projectile', speed: 18, radius: 8, range: cl(620 + 20 * c, 640, 720), path: 'zigzag', amp: 8, period: 4 })),
  A('zigzag', 'a jagged bolt that zigzags', (c, d) => proj(c, d, { path: 'zigzag', amp: 14, period: 5 }, 18)),
  A('ball', 'a slow big orb that bursts', (c, d) => ({ kind: 'projectile', speed: heavy(c, d) ? 10 : 11, radius: cl(14 + d / 20, 14, 22), range: 580, blast: cl(56 + d / 5, 56, 90) })),
  A('orb', 'a slow, big orb', (c, d) => ({ ...proj(c, d, {}, 9), radius: cl(16 + d / 20, 16, 28) })),
  A('blast', 'an energy orb that detonates', (c, d) => ({ kind: 'projectile', speed: 12, radius: 16, range: 620, blast: heavy(c, d) ? 80 : 64 }), { windup: () => 12, hit: () => [kb(50)] }),
  A('fireball', 'a big fireball that explodes and scorches', (c, d) => ({ kind: 'projectile', speed: 11, radius: heavy(c, d) ? 20 : 16, range: 580, blast: heavy(c, d) ? 84 : 64 }), { windup: () => 14 }),
  A('sphere', 'a heavy orb that bursts (Aura Sphere)', () => ({ kind: 'projectile', speed: 10, radius: 18, range: 620, blast: 56 }), { windup: () => 12 }),
  A('fan', 'a short fan of three fast embers', (c, d) => ({ kind: 'projectile', count: 3, spread: 6, speed: 14, radius: 8, range: heavy(c, d) ? 300 : 250 })),
  A('barrage', 'a tight burst of needles / icicles', (c, d) => ({ kind: 'projectile', count: heavy(c, d) ? 5 : 3, spread: 5, speed: 16, radius: 6, range: 540 })),
  A('leaves', 'three spinning blades that cut through', () => ({ kind: 'projectile', count: 3, spread: 14, speed: 14, radius: 9, range: 480, pierce: 1 })),
  A('bubble', 'slow floaty bubbles', () => ({ kind: 'projectile', count: 3, spread: 18, speed: 9, radius: 13, range: 440 })),
  A('spit', 'a gob that clings and slows', () => ({ kind: 'projectile', speed: 11, radius: 12, range: 440 }), { hit: () => [slow(300, 60)] }),
  A('web', 'a sticky net (slows hard)', () => ({ kind: 'projectile', speed: 10, radius: 16, range: 480 }), { hit: () => [slow(500, 90)] }),
  A('seed', 'a slow seed that wobbles on its way', () => ({ kind: 'projectile', speed: 10, radius: 10, range: 520, path: 'weave', amp: 10, period: 12 })),
  A('stars', 'three fluttering stars (Swift)', () => ({ kind: 'projectile', count: 3, spread: 20, speed: 14, radius: 9, range: 580, path: 'weave', amp: 12, period: 10 })),
  A('hypno', 'a slow wide wave that sways (sleep)', () => ({ kind: 'projectile', speed: 11, radius: 20, range: 520, path: 'weave', amp: 10, period: 14 })),
  // walls (shape.wall, docs/VFX.md): a band `wall` px either side of the shot's line, `radius` px deep, across its path
  A('ripple', 'a broad ring of force rolling forward through everything', () => ({ kind: 'projectile', speed: 11, radius: 12, wall: 30, range: 440, pierce: 9 })),
  A('wave', 'a wide wall of water that rolls forward through everything', (c, d) => ({ kind: 'projectile', speed: 7, radius: 16, wall: cl(48 + d / 7, 50, 78), range: cl(420 + 30 * c, 440, 580), pierce: 9 }), { hit: () => [kb(70)] }),
  A('sniper', 'a long aim, then a very fast piercing shot', (c) => ({ kind: 'projectile', speed: 24, radius: 7, range: cl(760 + 20 * c, 780, 880), pierce: 1 }), { windup: () => 14 }),
  A('lance', 'a fast spear that pierces through', (c, d) => ({ ...proj(c, d, { pierce: 2 }, 19), radius: 9, range: cl(620 + 30 * c, 640, 780) })),
  A('lob', 'an arcing lob over walls and props that bursts where it lands', (c, d) => proj(c, d, { path: 'lob', blast: cl(56 + d / 4, 56, 110), range: cl(360 + 30 * c, 380, 520) }, 11)),
  A('boomerang', 'flies out and returns, hitting on both legs', (c, d) => proj(c, d, { path: 'boomerang', range: cl(440 + 30 * c, 460, 600) }, 14)),
  A('weave', 'a weaving, fluttering shot', (c, d) => proj(c, d, { path: 'weave', amp: 18, period: 12 }, 13)),
  A('spiral', 'a shot that corkscrews around its line, wider as it goes', (c, d) => proj(c, d, { path: 'spiral', amp: 24, period: 8, range: cl(440 + 30 * c, 460, 580) }, 12)),
  A('bounce', 'ricochets off walls', (c, d) => proj(c, d, { path: 'bounce', bounces: c >= 3 ? 3 : 2 }, 14)),
  A('phase', 'a slow shadow that passes through walls', (c, d) => ({ ...proj(c, d, { path: 'phase' }, 9), radius: cl(8 + d / 40, 8, 16), range: cl(420 + 30 * c, 440, 560) })),
  // ---------------------------------------------------------------- beams
  A('beam', 'an instant line', (c, d) => ({ kind: 'beam', length: cl(460 + 50 * c, 480, 760), width: cl(16 + d / 8, 16, 40) })),
  A('zap', 'a crackling bolt beam, quick to fire (Thunderbolt)', () => ({ kind: 'beam', length: 580, width: 18, ticks: 10 })),
  A('stream', 'a thin stream that nudges', () => ({ kind: 'beam', length: 380, width: 14, ticks: 10 }), { hit: () => [kb(24)] }),
  A('hydro', 'a long thick jet that blasts the foe away', (c, d) => ({ kind: 'beam', length: 660, width: heavy(c, d) ? 44 : 36, ticks: 16 }), { windup: () => 18, hit: () => [kb(150)] }),
  A('hyperbeam', 'a huge, wide beam after a long charge', (c, d) => ({ kind: 'beam', length: cl(600 + 40 * c, 640, 790), width: cl(30 + d / 8, 34, 52), ticks: 12 }), { windup: () => 20, hit: () => [kb(100)] }),
  A('solar', 'the longest charge, then a huge beam', () => ({ kind: 'beam', length: 790, width: 46, ticks: 20 }), { windup: () => 28, hit: () => [kb(80)] }),
  A('pulse', 'a thick, shorter beam', () => ({ kind: 'beam', length: 460, width: 34 })),
  A('drain', 'a tether that siphons', () => ({ kind: 'beam', length: 320, width: 16, ticks: 16 })),
  // ---------------------------------------------------------------- cones
  A('breath', 'a cone of breath', (c) => ({ kind: 'cone', range: cl(170 + 20 * c, 170, 260), arc: cl(44 + 4 * c, 44, 64) })),
  A('flame', 'a long narrow jet of fire', () => ({ kind: 'cone', range: 250, arc: 30 })),
  A('gust', 'a wide blast of wind that blows the foe away', () => ({ kind: 'cone', range: 220, arc: 72 }), { hit: (c, d) => [kb(heavy(c, d) ? 180 : 130)] }),
  A('snow', 'a wide freezing flurry (slows)', (c, d) => ({ kind: 'cone', range: heavy(c, d) ? 280 : 220, arc: heavy(c, d) ? 80 : 64 }), { windup: () => 12, hit: () => [slow(400, 60)] }),
  A('mud', 'grit in the face (slows)', () => ({ kind: 'cone', range: 150, arc: 64 }), { hit: () => [slow(300, 60)] }),
  A('heat', 'a close burst of heat', () => ({ kind: 'cone', range: 180, arc: 70 })),
  A('glare', 'a long narrow glare', () => ({ kind: 'cone', range: 280, arc: 36 })),
  A('roar', 'a short, wide blast of sound', (c) => ({ kind: 'cone', range: cl(160 + 15 * c, 160, 230), arc: cl(80 + 4 * c, 80, 100) })),
  // ---------------------------------------------------------------- areas: rings, clouds, strikes from above
  A('quake', 'a shockwave ring through the ground (slows)', (c, d) => ({ kind: 'area', at: 'self', radius: cl(150 + 10 * c + d / 10, 160, 230) }), { windup: () => 16, hit: () => [kb(70), slow(300, 40)] }),
  A('sound', 'a sound ring from you', (c, d) => ({ kind: 'area', at: 'self', radius: cl(160 + 12 * c, 165, 215) }), { windup: (c, d) => (heavy(c, d) ? 14 : 10), hit: (c, d) => [kb(heavy(c, d) ? 90 : 40)] }),
  A('nova', 'a burst of energy all around', (c, d) => ({ kind: 'area', at: 'self', radius: heavy(c, d) ? 190 : 160 }), { windup: (c, d) => (heavy(c, d) ? 14 : 12) }),
  A('explode', 'a huge blast after a long fuse', () => ({ kind: 'area', at: 'self', radius: 230 }), { windup: () => 22, hit: () => [kb(140)] }),
  A('surf', 'a great wave surging out from you', () => ({ kind: 'area', at: 'self', radius: 220 }), { windup: () => 14, hit: () => [kb(110)] }),
  A('gas', 'a lingering cloud around you', () => ({ kind: 'area', at: 'self', radius: 100, ticks: 120, every: 60 }), { windup: () => 14 }),
  A('powder', 'a lingering cloud just ahead', () => ({ kind: 'area', at: 'aim', range: 110, radius: 84, ticks: 90, every: 45, delay: 8 })),
  A('cloud', 'a lingering cloud on the aim point', (c) => ({ kind: 'area', at: 'aim', radius: cl(80 + 10 * c, 80, 130), range: 380, ticks: 150, every: 45 })),
  A('vortex', 'a lingering vortex on the aim point (Whirlpool, Fire Spin)', () => ({ kind: 'area', at: 'aim', range: 300, radius: 92, ticks: 100, every: 45 }), { windup: () => 12 }),
  A('hazard', 'a drifting storm that moves along the aim', (c) => ({ kind: 'area', at: 'aim', radius: cl(80 + 10 * c, 80, 130), range: 300, ticks: 150, every: 40, path: 'drift', drift: 2 })),
  A('rain', 'a cloudburst on the aim point', () => ({ kind: 'area', at: 'aim', range: 280, radius: 76, delay: 12 })),
  A('thunder', 'a bolt from the sky a beat after you call it', (c, d) => ({ kind: 'area', at: 'aim', range: 340, radius: heavy(c, d) ? 108 : 92, delay: 20 })),
  A('meteor', 'a strike from above on the aim point', (c, d) => ({ kind: 'area', at: 'aim', radius: cl(90 + 12 * c + d / 10, 100, 170), range: cl(360 + 30 * c, 380, 520) })),
  A('pillar', 'a column / eruption on the aim point, telegraphed', (c, d) => ({ kind: 'area', at: 'aim', radius: cl(60 + 6 * c + d / 10, 64, 96), range: cl(420 + 30 * c, 440, 560), delay: 24 }), { hit: () => [kb(70)] }),
  A('rockslide', 'a line of rocks crashing down one after another', () => ({ kind: 'area', at: 'aim', range: 380, radius: 58, count: 3, delay: 18, stagger: 8 }), { hit: () => [kb(40)] }),
  A('max', 'a colossal pillar crashing down (Max / G-Max, VSTAR)', (c, d) => ({ kind: 'area', at: 'aim', range: 360, radius: cl(110 + d / 10, 120, 150), delay: 20 }), { windup: () => 16, hit: () => [kb(110)] }),
  // ---------------------------------------------------------------- self and ground
  A('aura', 'a self move (heal, charge, draw, guard)', () => ({ kind: 'self' })),
  A('field', 'reshapes the ground (a Stadium)', (c) => ({ kind: 'terrain', at: 'aim', radius: cl(90 + 15 * c, 90, 160), range: 360 })),
  ...SIGNATURES,
].map((a): [string, Archetype] => [a.id, GENERIC.has(a.id) ? { ...a, generic: true } : a]))

/** the signature moves' whole names, and their keyword rules in order (ahead of every table below) */
const SIG_NAMES: Record<string, string> = Object.fromEntries(SIGNATURES.flatMap((g) => g.names.map((n) => [n, g.id])))
const SIG_RULES: [RegExp, string][] = SIGNATURES.filter((g) => g.rule).map((g) => [g.rule!, g.id])

// ------------------------------------------------------------------ 1. hand-picked whole names (lowercase)
/** the move-design pass's archetype ids that this lexicon names differently */
const REMAP: Record<string, string> = {
  strike: 'pillar', aura: 'sphere', snipe: 'sniper', volley: 'barrage', hyper: 'hyperbeam', shot: 'bullet', trap: 'pillar',
  guard: 'aura', heal: 'aura', power: 'aura', draw: 'aura', mimic: 'orb',
}
/** this lexicon's own picks (win over the move-design table) */
const NAMES: Record<string, string> = {
  aeroblast: 'hyperbeam', 'spacial rend': 'hyperbeam', 'roar of time': 'hyperbeam', 'leaf boomerang': 'boomerang',
  'shadow ball': 'ball', 'lost impact': 'nova', 'psychic javelin': 'lance', 'cyclone kick': 'spin', 'ticking terror': 'phase', 'ticking curse': 'phase', 'fade to black': 'phase', 'furtive drop': 'phase',
}
/** the move-design pass's hand-picked names (ids in its vocabulary, REMAP applies) */
const EXACT: Record<string, string> = {
  'confuse ray': 'orb', 'double-edge': 'charge', 'laser focus': 'power', scrunch: 'guard', melt: 'spit', blockface: 'tackle',
  'big wheel': 'draw', 'nightime stroll': 'draw', 'hurricane call': 'draw', 'power stone': 'power', 'clear tone': 'draw',
  eeeeeeek: 'draw', 'flail around': 'flail', 'resolute spite': 'counter', 'swing around': 'spin', 'buster swing': 'slash',
  'mountain swing': 'tail', claw: 'scratch', 'sharp claws': 'scratch', 'fasten claws': 'grab', 'seed bomb': 'lob',
  'mud shot': 'spit', 'dragon rage': 'breath', 'heavy impact': 'leap', 'impact blow': 'punch', 'crab impact': 'hammer',
  'moon impact': 'blast', 'elemental blast': 'hyper', 'energy burst': 'nova', 'full burst': 'nova', 'spiral burst': 'blast',
  'fire mane': 'flamecharge', 'inferno wings': 'wing', 'burning rondo': 'nova', 'lightning rondo': 'nova',
  'infinite force': 'beam', 'geo cannon': 'blast', 'solar shot': 'blast', 'muscular slap': 'punch', 'coinciding figures': 'orb',
  'bull dash': 'charge', 'rocky tackle': 'charge', 'wild tackle': 'charge', 'iron tackle': 'charge', "nature's judgment": 'strike',
  'moon raker': 'strike', 'hangry spike': 'horn', cablegram: 'zap', 'targeted spark': 'bolt', 'shorting spark': 'nova',
  'hydro shot': 'snipe', 'longhair shot': 'snipe', sharpshooting: 'snipe', 'shoot through': 'snipe', 'pressure shot': 'snipe',
  'hydro jet': 'snipe', 'water arrow': 'snipe', 'linear attack': 'snipe', 'shadowy hunter': 'snipe',
  'star blaze': 'max', 'star chronos': 'max', 'crystal star': 'max', 'sword star': 'max',
  'ancient star': 'power', 'wave summoning': 'power', 'energized tail': 'power', 'flame charge': 'power', 'nitro tank': 'power',
  'into the deep': 'power', 'charge-up dash': 'power', 'sparkling wish': 'power', psypump: 'power', 'crescent glow': 'power',
  'ferry across': 'draw', 'quick draw': 'draw', 'rapid hunt': 'draw', 'falling bubbles': 'draw',
  'sweet nectar': 'heal', 'sweet scent': 'heal', 'comforting aroma': 'heal', 'moonlit miracle': 'heal', 'eat sloppily': 'heal',
  'get some air': 'heal', 'knockout reviver': 'guard', amnesia: 'glare',
  'luring glow': 'whip', taunt: 'whip', lure: 'whip', 'drag off': 'whip', 'magnetic tension': 'whip', 'invite out': 'whip',
  "king's instructions": 'orb', 'lordly songleader': 'sound', 'baton pass': 'quick', 'rapid draw': 'bolt', 'spike draw': 'volley',
  'aurora gain': 'beam', 'tiny charge': 'tackle', coil: 'grab', meditate: 'orb', 'power accelerator': 'jab',
  'barrier attack': 'hammer', 'cotton guard': 'tackle', 'leaf guard': 'leaves', 'frost barrier': 'snow', 'dyna barrier': 'pulse',
  'fluff gets in the way': 'tackle', 'splashing dodge': 'flail', 'guard claw': 'slash', 'guard press': 'hammer',
  'bursting power': 'heat', 'cell connector': 'blast', 'battle step': 'quick', 'frost charge': 'tackle', 'energy stream': 'beam',
  'turbo drive': 'charge', 'weather force': 'ball', strafe: 'quick', 'reverse thrust': 'quick', 'aqua ring': 'nova',
  'splash loop': 'wave', shakedown: 'throw', 'pot smash': 'hammer',
  'zip-zap frenzy': 'power', metronome: 'mimic', 'super metronome': 'mimic', 'mirror move': 'mimic', 'cross fusion strike': 'mimic', 'primate acting': 'mimic',
  absorption: 'blast', 'abyss seeking': 'draw', 'alluring dance': 'sound', 'ancient freeze': 'snow', ascension: 'power',
  "assassin's rose": 'blink', 'assault gate': 'charge', assembly: 'blast', 'aura strike': 'punch', 'battle legion': 'rage',
  'beast raid': 'rage', 'big bang arm': 'punch', 'big hand': 'grab', 'big sparking': 'nova', 'bouncy circle': 'leap',
  'branch calculation': 'draw', 'chaotic pain': 'orb', chilly: 'snow', 'clean hit': 'punch', 'colorful harmony': 'stars',
  'creepy-crawly congregation': 'draw', 'crossing cut': 'slash', 'dangerous rogue': 'slash', 'dead end': 'blink',
  'destiny bond': 'glare', 'destructive finish': 'explode', distort: 'orb', divide: 'orb', 'divine paper': 'blade',
  'dragon energy': 'charge', 'dragon gale': 'gust', 'draw in': 'power', 'element chain': 'power', 'energy drive': 'blast',
  'eternal light': 'draw', euphoria: 'sound', 'extreme freeze': 'snow', 'fickle attack': 'jab',
  'fierce dragon': 'charge', 'fighting lightning': 'zap', 'flare juggling': 'fireball', floatify: 'draw', 'floe return': 'wave',
  'flower dance': 'spin', freeze: 'beam', 'freeze down': 'beam', 'gale thrust': 'horn',
  'garbage attack': 'lob', 'gear cutter': 'slash', glutton: 'bite', 'grand bloom': 'power', 'grass knot': 'trap',
  guillotine: 'blade', 'hand of djinn': 'power', 'hang down': 'jab', 'happy mime': 'draw', 'hollow hunt': 'draw',
  horoscope: 'power', 'ice path': 'beam', impound: 'grab', lighting: 'nova', 'limit break': 'blast',
  'line force': 'beam', 'live painting': 'lob', "lord's valley": 'quake', 'loving sympathy': 'orb', 'lunge out': 'tackle',
  'magical ribbon': 'draw', 'mirror pain': 'orb', 'missing in the forest': 'blink', 'moon dance': 'nova',
  'moonglow reverse': 'orb', 'night footsteps': 'blink', 'ominous numbers': 'orb', pandemonium: 'nova',
  'pika-pika parade': 'draw', pilfer: 'draw', plea: 'gust', 'precious touch': 'heal', prophecy: 'draw', 'psychic powers': 'hyper',
  'raging freeze': 'snow', raid: 'rage', 'rainbow flavor': 'stars', 'rally back': 'counter', ransack: 'blink', 'rapid freeze': 'power',
  rebel: 'rage', 'reversed clock': 'power', 'rising lunge': 'uppercut', 'rocket poison': 'spit', 'rocket tail': 'tail',
  rout: 'rage', 'rumbling wires': 'zap', 'scrap short': 'zap', shatter: 'hammer', shiftadieu: 'blink', 'showboating pose': 'power',
  'shrieking poison': 'sound', 'slight intrusion': 'tackle', 'spill out': 'flail', 'splintered shards': 'volley', sprout: 'draw',
  stampede: 'roll', 'star force': 'stars', 'star freeze': 'beam', 'star requiem': 'orb', 'surprisingly transform': 'blink',
  'sweep away': 'wave', 'sweep the leg': 'kick', symbiont: 'orb', 'tapu thunder': 'thunder', 'tapu wilderness': 'quake',
  'tomb hunt': 'draw', 'treasure rush': 'tackle', 'trinity charge': 'power',
  'tumbling attack': 'roll', twilight: 'power', 'twin play': 'draw', 'tyrannical hole': 'vortex', 'upstream spirits': 'wave',
  'vee brave': 'charge', verdict: 'punch', vermilion: 'fireball', 'very vulnerable': 'rage', 'wild axe': 'blade',
  'wild shock': 'charge', 'wish granter': 'draw', 'worst gift': 'orb',
}

// ------------------------------------------------------------------ 2. keyword rules (first match wins)
/** the move-design pass's ordered rules over the lowercase name (ids in its vocabulary, REMAP applies); ghostly
 * names go to `phase` (through walls) here, not a homing orb: homing is the Psychic type's alone */
const RULES: [RegExp, string][] = [
  [/^(g-)?max /, 'max'],
  [/hydro (pump|jet|burn|splash|cannon)|aqua typhoon|into the deep/, 'hydro'],
  [/solar ?beam/, 'solar'],
  [/hyper beam|zap cannon|dynamax cannon|geo cannon|photon laser|eternabeam|infinite force|assault laser/, 'hyper'],
  [/\bsurf\b/, 'surf'],
  [/wave splash|aqua wave|dynamic wave|wave summoning|undulate|tidal/, 'wave'],
  [/thunder wave|psywave|water pulse|shaky wave|mysterious wave|reactive pulse/, 'ripple'],
  [/^thunder$|thundering lightning|windup thunder|nitro thunder|lightning storm|thunder storm|judgment|lightning crash|bolt storm/, 'thunder'],
  [/thunderbolt|thunderous bolt|lightning blast|gigaspark|teraspark|electroblast|electric current|high-voltage|extreme current/, 'zap'],
  [/thunder ?(jolt|shock)|thundershock|static shock|zzzap|electric shock|\bbolt\b|electrobullet|topaz/, 'bolt'],
  [/aura sphere/, 'aura'],
  [/(electro|electric|lightning|pika|shadow|energy|weather|spore|mist|spark) ?ball|bubble bomb|psychic sphere|zen shot/, 'ball'],
  [/uppercut/, 'uppercut'],
  [/high jump kick|jumping kick/, 'leap'],
  [/kick/, 'kick'],
  [/punch|\bfist\b|knuckle|lariat/, 'punch'],
  [/pincer|vise grip|clamp|\bbind\b|wrap$|clutch|grip|lock up|string bind|constrict|^hook$|bind down/, 'grab'],
  [/tail (whap|slap|smack|smash|crush|rap|whip)|iron tail|flame tail|dynamic tail|blossom tail|mischievous tail|energized tail|aqua tail|tail trickery/, 'tail'],
  [/flamethrower|fire ?breath|flaming breath|sacred breath|steady firebreathing|firebreathing/, 'flame'],
  [/fire blast|flame burst|combustion blast|explosive fire|bright flame|magical fire|fireball|burning rondo|aura burn|phoenix burn|royal blaze|sacred fire|blazing destruction|fiery wrath|fire mane|inferno wings/, 'fireball'],
  [/flame charge|flame wheel|flare blitz|heat tackle|burning train|v-flame|burning kick/, 'flamecharge'],
  [/fire spin|infernal vortex|whirlpool|sand tomb|swirling|vortex|maelstrom/, 'vortex'],
  [/hurricane|twister|cyclone|tornado|typhoon|storm$/, 'hazard'],
  [/scorching column|desert pillar|volcanic|volcano|eruption|geyser|pillar/, 'strike'],
  [/heat blast|heat wave|radiating heat|incinerate|surging flames|melt$/, 'heat'],
  [/ember|singe|sputter|live coal|^flare$|^char$|combustion$|kindling/, 'fan'],
  [/waterfall|aqua jet|aqua return|riptide|quick dive|jet headbutt|swim freely|ferry across/, 'jet'],
  [/water gun|water drip|dual splash|numbing water|psypump|water spout/, 'stream'],
  [/rain splash|rain dance|glistening droplets|falling bubbles/, 'rain'],
  [/bubble ?beam/, 'beam'],
  [/bubble/, 'bubble'],
  [/icy snow|powder snow|heavy snow|blizzard|^hail$|freezing wind|sheer cold|diamond storm|frost breath|icy wind/, 'snow'],
  [/crystal breath|ice breath|dragon breath|breath$/, 'breath'],
  [/icicle|ice shard|frost bullet|ice ball/, 'volley'],
  [/ice beam|aurora beam|frost beam/, 'beam'],
  [/razor leaf|leafage|magical leaf|leaf storm|petal|cutting wind|air slash|air cutter|razor wind|leaf tornado|gale blade|razor fin|sharp blade quill/, 'leaves'],
  [/vine whip|power whip|poisonous whip|triple whip|leek lash|suctioning vines|tongue (slap|lash)|^lick$|\bwhip\b/, 'whip'],
  [/leech seed|worry seed/, 'seed'],
  [/seed bomb|egg bomb|sludge bomb|mud bomb|rock throw|scrap drop|stone edge|boulder toss|bomb$/, 'lob'],
  [/mega drain|giga drain|absorb|leech life|drain|life sucker|dream eater|devour|super absorption|horn leech/, 'drain'],
  [/poison ?powder|sleep powder|stun spore|^spore$|strange powder|nadir powder|scent$|aroma|pollen|dizzying flower|allergy|sweet nectar|sticky nectar/, 'powder'],
  [/poison gas|smog|foul gas|stench|sleeping gas|^toxic$|smokescreen|^haze$|malodor|poisonous prison/, 'gas'],
  [/poison sting|poison barb|twineedle|pin missile|kaboom needles|needles$|photon bullets|spike cannon/, 'volley'],
  [/venomous fang|poison fang|poison bite|fang|bite|gnaw|chomp|crunch|incisors|nibble|nom-nom|jaws?\b/, 'bite'],
  [/poison jab|jet needle|spike sting|^sting|stinger|pierce|piercing|^pike$|joust|megahorn|horn|lance|spear|missile jab/, 'horn'],
  [/sludge$|acid|\bspit\b|mucus|saliva|drool|^blot$|octazooka|^ink/, 'spit'],
  [/string shot|spider web|entangling string|electroweb|\bweb\b/, 'web'],
  [/hypnosis|hypnotic|^sing$|lovely kiss|yawn|perplex|sleep/, 'hypno'],
  [/teleport|phantom|feint|sucker|surprise attack|shadow sneak|ambush|stealth|wormhole|subspace|void return|vanish|astonish|shadow flicker/, 'blink'],
  [/psybeam|psylaser|signal beam|power beam|\bbeam$|laser|\bray$|core beam|power gem|prismatic/, 'beam'],
  [/flash cannon|metal blast|mirror shot/, 'bounce'],
  [/eerie|will-o-wisp|wisp|spooky|cursed drop|doom curse|nightmare|shadow chant|hex$|\bcurse\b|haunt|spite|resentment|shadow (?!slash|claw|sneak|flicker)/, 'phase'],
  [/^psychic$|psyshock|psystrike|psycrush|confuse ray|glow$|magical shot|psyshot|psy ?bolt|super psy|mind blast|kinesis|mysterious signal|psyray|photon boost|chain of spirits|psydrive|psyburn|psy purge/, 'orb'],
  [/swift|star stream|shooting star|stars?$|fireworks/, 'stars'],
  [/earthquake|magnitude|bulldoze|break ground|land's wrath|tectonic|quaking|land crush|fissure|mudslide/, 'quake'],
  [/rock slide|avalanche|shoot meteors|meteor|star raid|rock tomb/, 'rockslide'],
  [/seismic toss|overhead throw|submission|^strength$|circle throw|knock away|fend off|^shove$|push|slap push|throw$/, 'throw'],
  [/karate chop|chop$|^chop/, 'chop'],
  [/stomp|trample/, 'stomp'],
  [/boulder crush|rock crush|crush|hammer|smash|press$|pulverize|collapse|whap down|beatdown|crushing beat/, 'hammer'],
  [/mud-? ?slap|sand-? ?attack|sand spray|mud splash|mud shot|pocket sand/, 'mud'],
  [/leaf blade|aqua edge|moonlight blade|sacred sword|behemoth blade|slashing strike|hardened blade|ice blade|dragonblade|dark cutter|sonic edge|night slash|blade|sword|edge$|cleave|merciless/, 'blade'],
  [/slash|cross-?cut|scissor|rend$|shred|scythe|breaking swipe|claws?\b|talons/, 'slash'],
  [/fury swipes|scratch/, 'scratch'],
  [/dragon pulse|dark pulse|scrap pulse|\bpulse\b/, 'pulse'],
  [/gyro|rolling|rollout|\broll$|wheel|tumble|slider|spin tackle/, 'roll'],
  [/quick attack|agility|\bmach\b|extreme speed|first impression|fake out|quick|accelerock|rapid hunt|electrostep|tricky steps/, 'quick'],
  [/take down|double-edge|giga impact|wild charge|volt tackle|brave bird|head smash|reckless|raging charge|skull bash|impact$|collision|sunsteel|nitro|victory dive|dragon strike|draconic|outrage|crash$/, 'charge'],
  [/body slam|heavy impact|\bleap\b|^hop$|bounce|jump|^fly$|\bdive\b|^dig$|gravitational drop|get some air|float up|splash jump/, 'leap'],
  [/tackle|^ram$|headbutt|bull dash|head bolt|hard head|charge-up dash|spark$|^spark/, 'tackle'],
  [/rage$|^rage|thrash|berserk|tantrum|jungle rage|get angry|raging out|angry whack|wreak havoc|rampage/, 'rage'],
  [/\bwing|^flap$|glide|swoop|aerial/, 'wing'],
  [/gust|whirlwind|wind$|breeze|fairy wind|blasting wind/, 'gust'],
  [/peck|drill|beak|pluck|nitpick|fury attack/, 'peck'],
  [/hyper voice|boomburst|screech|supersonic|growl|^roar|snore|voice|sonic|volume|loud|woofer|bug buzz|\btone$|mumble|eee+k|screaming|howl|round$|echo/, 'sound'],
  [/selfdestruct|explosion|explode|boltsplosion|detonate|burst$|splosion/, 'explode'],
  [/earth power|spire|spike$|spikes|mine$|trap$/, 'trap'],
  [/discharge|dazzl|moonlit|miraculous|bloomshine|floodlight|crescent glow|shine$|flash$|night daze|nova$|radiance/, 'nova'],
  [/moonblast|lunar blast|moon impact|moon raker|blast$|energy crush/, 'blast'],
  [/spinning|spin$|twirl|squaredance|swing around|double spin|rapid spin/, 'spin'],
  [/splash$|flail|flop|struggle|trip over|slip|eat sloppily/, 'flail'],
  [/double ?slap|comet|fury|double kick|triple axel|beat up|play rough|zip-zap|scar strikes|pika chain|yoga loop/, 'combo'],
  [/counter|revenge|retaliate|matron|parental fury|resolute|payback|avenge/, 'counter'],
  [/leer|glare|mean look|scary face|taunt|peer|jealous eyes|matching look|fearsome|confront|corner|block/, 'glare'],
  [/withdraw|harden|protect|detect|barrier|iron defense|cotton guard|defense curl|stiffen|rigidify|endure|guard$|shield$|deflector|^hide$|well-hidden|fluff|dodge$|minimize/, 'guard'],
  [/recover|^rest$|^nap$|milk drink|synthesis|feelin' fine|soothing|heal|moonlight$|cure/, 'heal'],
  [/growth|^charge$|energize|fast charge|recharge|store up|empower|energy gift|tiny charge|power accelerator|focus|swords dance|calm mind|^coil$|amnesia|work up|cheerful charge|geonavigation|aurora gain|awakening|ultra evolution|energy mix|electrify|static electricity|conversion|meditate/, 'power'],
  [/call for family|collect|draw$|find a friend|find it|^lead$|vee-search|fetch|lucky find|call sign|call$|cablegram|instructions|songleader|select a snack|scurry|curiosity|dredge|grab$|gather|search|beacon|invite out|^lure$|call back|baton pass|stroll|tropical|signal$|summon/, 'draw'],
  [/^pound$|^jab$|slap|smack|^beat$|knock|^hit$|pay day|^punch$|whack|gentle|nuzzle|headache|kiss$/, 'jab'],
  [/^slam$|\bslam\b/, 'tail'],
  [/pay ?day|coin/, 'jab'],
  [/shot$|shoot|bullet|cannon/, 'shot'],
]

// ------------------------------------------------------------------ 3. this lexicon's stems (what the rules leave)
const W: [string, RegExp][] = [
  ['leap', /\b(dig|fly|dive|bounce|jump|hop|pounce|leap|sky|aerial|glide|float up|swoop|drop in|nitro dive|lost dive|victory dive|quick dive|splash jump|high jump)/],
  ['boomerang', /(boomerang|cutter|razor|\bdisc|\bring\b|\bwheel|chakram|slicer|return|bonemerang)/],
  ['lob', /(bomb|ball\b|boulder|rock throw|stone|egg|mud shot|mud splash|grenade|cannonball|\blob\b|lost mine|seed bomb|scrap drop|power stone|shoot meteors|droplets|bubbles galore|falling|dredge|spit)/],
  ['hazard', /(storm|\brain\b|\bhail|blizzard|sandstorm|hurricane|typhoon|tempest|weather|thundercloud|cyclone|tornado|twister|whirlpool|vortex)/],
  ['cloud', /(spore|powder|pollen|gas|smog|mist|fog|smoke|scent|aroma|dust|stench|malodor|toxic|nectar|mucus|saliva|web|string|yawn|sleep|drool|perplex)/],
  ['phase', /(shadow|phantom|ghost|spirit|curse|haunt|hex|ominous|night|spook|soul|eerie|spite|resentment|creepy|doom|fade|furtive|cursed|tomb|void)/],
  ['zigzag', /(thunder|bolt|spark|zap|jolt|volt|(?<!psy)shock|static|electr|discharge|current|lightning|wires|zzzap|zip)/],
  ['bounce', /(mirror|reflect|ricochet|gem|crystal|prism|shine|shatter|gear)/],
  ['orb', /(sphere|orb|pod|moon|lunar|psychic\b|psyshock|psyburn|psystrike|psycrush|psydrive|psy purge|photon boost|aura|mind|mystic|zen|kinesis|telekinesis|miracle|wonder)/],
  ['weave', /(swift|ribbon|wish|kiss|flutter|wisp|glow|dance|flower|petal|blossom|fairy|charm|harmony|melody|song|\bsing\b|\btone\b|voice|loud|chant|dazzle|sparkling|rainbow|magical)/],
  ['spiral', /(spiral|swirl|whirl|corkscrew|twirl|spin draw|drill|screw)/],
  ['wave', /(\bwaves?\b|surf|tidal|tsunami|flood|riptide|torrent|waterfall|sweep away|avalanche|mudslide|slide|flow|stream|current)/],
  ['hyperbeam', /(hyper beam|dynamax cannon|star chronos|elemental blast|combustion blast|topaz bolt|power beam|dragon energy|psystrike)/],
  ['beam', /(beam|ray\b|psyray|laser|cannon|pulse|blast|pump|hydro|solar|aurora|flash|photon|jet\b|line|linear|javelin)/],
  ['lance', /(spear|lance|pierce|piercing|horn drill|needle|sting|barb|arrow|quill|pike|joust|missile jab|thrust)/],
  ['fan', /(\bfan\b|spread|seeds?\b|feather|shower|scatter shot|sprinkle|confetti|leaves|leaf storm|shards? spray)/],
  ['barrage', /(multi|double(?!-edge)|triple|barrage|fury|twin|volley|bullets|missile|icicle|shards|splinter|scar strikes|pin |rapid|flurry|kaboom|parade|fireworks|juggling|fever|bubble shower|scatter)/],
  ['sniper', /(snipe|sharpshoot|target|arrow|long|focus)/],
  ['bullet', /(shot|bullet|gun|shoot|drip|water gun|splash|spit|squirt|sputter|pellet)/],
  ['roar', /(roar|screech|howl|scream|shriek|growl|leer|glare|scary|boom|sonic|synchro loud|eeeek|taunt|confront|mumble|hypno)/],
  ['breath', /(breath|flame|fire|burn|scorch|blaze|ember|heat|singe|incinerate|inferno|flare|gust|wind|breeze|spray|frost|freeze|icy|chill|cold|snow|smother|column|live coal|kindling|melt|v-flame)/],
  ['quake', /(quake|earthquake|stomp|magnitude|tremor|land|ground|explosion|selfdestruct|self-destruct|eruption|nova|boomburst|pulverization|collapse|snore|tantrum|detonate|crush and burn|impact\b|land crush|crater|trinity nova)/],
  ['meteor', /(meteor|impact|requiem|judgment|verdict|star|galaxy|comet|drop|gravitational|chaotic|pandemonium|havoc|disaster|smite|mindstorm|swell|wormhole|hole|lost impact|lost volcano|volcan)/],
  ['pillar', /(pillar|column|geyser|spike|thorn|root|erupt|burst)/],
  ['whip', /(whip|vine|tongue|\blash|\bbind|\bwrap|grab|hook|tentacle|clutch|grip|clamp|coil|entangl|tail slap|slap push|\blure|\blead\b|magnet)/],
  ['spin', /(spin|cyclone kick|rapid spin|swing around|tumble|roll\b|rolling)/],
  ['bite', /(bite|fang|chomp|crunch|gnaw|jaw|nibble|munch|peck|beak|lick|nip|incisors|devour|eat)/],
  ['charge', /(tackle|rush|charge|ram\b|take down|double-edge|stampede|rollout|gallop|blitz|trample|crash|dash|train|headbutt|skull bash|bull|raid|assault|rocket|reckless|full|brave bird|giga impact|wild|turbo|drive|run\b|scurry)/],
  ['quick', /(quick|agility|feint|fake out|sucker|surprise|first impression|mach|swift strike|flicker|strafe|electrostep|night footsteps)/],
  ['slam', /(slam|smash|hammer|crush|press|body|sledge|mountain|heavy|seismic|submission|lariat|throw|bash|pound|beat|whack|wallop|knock)/],
  ['strike', /(punch|kick|blade|slash|strike|cut|chop|claw|sword|edge|scratch|swipe|slice|scissor|fist|knuckle|uppercut|jab|axe|talon|pincer|rend|shred|scythe|cleave|slap|smack|hit\b|blow|tail)/],
  ['aura', /(recover|rest|nap|heal|drink|absorb|withdraw|harden|protect|detect|barrier|guard|shield|endure|stiffen|rigidify|curl|meditate|growth|charge-up|energize|charge\b|store up|draw|search|find|call|collect|gather|evolution|ascension|awakening|summon|ferry|hide|pose|focus|amnesia)/],
  ['field', /(field|garden|stadium|terrain|trap)/],
]
/** the attack names in the data that everything above leaves over (npx vite-node tools/kits/lexicon.ts --leftovers),
 * each given its feel by hand */
const EXTRA_NAMES: Record<string, string> = {
  'bug buzz': 'roar', combustion: 'breath', 'conversion 1': 'beam', flap: 'breath', flop: 'slam',
  headache: 'orb', 'horn attack': 'lance', 'horn hazard': 'lance', 'ice wing': 'breath', leafage: 'weave',
  megahorn: 'charge', 'mysterious signal': 'weave', 'pay day': 'bullet', 'play rough': 'spin', 'sand-attack': 'breath',
  shove: 'slam', strength: 'slam', 'super psy': 'orb', 'superpowered horns': 'charge', thrash: 'spin', 'trip over': 'slam',
  vermilion: 'hyperbeam', 'whap down': 'slam', 'wing attack': 'wing',
}

// ------------------------------------------------------------------ 4. text: what it does, when the name says nothing
function fromText(p: ParsedText, d: number): string | null {
  const m = new Set(p.mechs)
  const hitsFoe = p.pre.length > 0 || p.post.length > 0
  if (d === 0 && !hitsFoe) return p.onImpact.length ? 'field' : 'aura'
  if (m.has('bench') && p.post.some((e) => e.op === 'benchDamage' && e.count === undefined)) return 'meteor'
  if (m.has('bench')) return 'lob'
  if (m.has('counters')) return 'phase'
  if (m.has('status') && d <= 30) return 'cloud'
  if (m.has('gust') || m.has('retreatLock') || m.has('cantAttack')) return 'whip'
  if (m.has('selfDamage')) return 'charge'
  if (m.has('coins') || m.has('flipUntilTails')) return 'barrage'
  if (m.has('drain') || m.has('heal')) return 'weave'
  if (m.has('switch')) return 'quick'
  if (m.has('spendEnergy') || m.has('discardEnergy')) return 'hyperbeam'
  if (m.has('foeEnergy') || m.has('disrupt')) return 'bite'
  if (m.has('prevent')) return 'slam'
  if (m.has('scaling') || m.has('conditional')) return 'strike'
  return null
}

/** where an archetype came from: a signature move's name or rule, a hand-picked whole name, a keyword rule, a coarse
 * stem, the attack's text, or none (the type default) */
export type LexSource = 'signature' | 'names' | 'name' | 'stem' | 'text' | 'type'

/** "Hydro Pump-GX" -> "hydro pump": lowercase, the GX tag dropped, curly quotes straightened */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[’`]/g, "'").replace(/[-\s]?gx$/, '').replace(/\s+/g, ' ').trim()
}

/** the archetype for an attack: from a hand-picked name, the keyword rules, its text, else null (the type default).
 * A self move (no damage, nothing on the foe) is always a self move; an attack that hits never becomes one */
export function archetypeFor(name: string, p: ParsedText, damage: number): { id: string; source: LexSource } | null {
  const n = normalizeName(name)
  const hits = damage > 0 || p.pre.length > 0 || p.post.length > 0
  if (!hits) return { id: p.onImpact.length ? 'field' : 'aura', source: 'text' }
  const ok = (id: string | undefined): id is string => !!id && !!ARCHETYPES[id] && id !== 'aura' && id !== 'field'
  const pick = (id: string | undefined) => (id === undefined ? undefined : REMAP[id] ?? id)
  if (ok(SIG_NAMES[n])) return { id: SIG_NAMES[n], source: 'signature' }
  for (const [re, id] of SIG_RULES) if (re.test(n)) return { id, source: 'signature' }
  for (const id of [NAMES[n], pick(EXACT[n]), EXTRA_NAMES[n]]) if (ok(id)) return { id, source: 'names' }
  for (const [re, id] of RULES) if (re.test(n) && ok(pick(id))) return { id: pick(id)!, source: 'name' }
  for (const [id, re] of W) if (re.test(n) && ok(id)) return { id, source: 'stem' }
  const t = fromText(p, damage)
  return ok(t ?? undefined) ? { id: t!, source: 'text' } : null
}

/** the lexicon's shape for an attack, with its windup and feel effects (null: leave it to the type default) */
export function lexShape(name: string, p: ParsedText, cost: number, damage: number, type: EnergyType): { shape: Shape; id: string; source: LexSource; windup?: number; hit: Effect[] } | null {
  const a = archetypeFor(name, p, damage)
  if (!a) return null
  const ar = ARCHETYPES[a.id]
  return { shape: ar.shape(cost, damage, type), id: a.id, source: a.source, windup: ar.windup?.(cost, damage), hit: ar.hit?.(cost, damage) ?? [] }
}

/** the shape kind each archetype produces (a hand kit's shape keeps the lexicon's trajectory only when they agree) */
export function archetypeKind(id: string): ShapeKind {
  return ARCHETYPES[id].shape(1, 30, 'Colorless').kind
}
