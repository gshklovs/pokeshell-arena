// Signature moves (docs/MOVES.md "Signature moves"): the iconic and frequent attacks that the lexicon's broad buckets
// drew alike (Psychic and Power Gem were both a plain shot; every Electro Ball, Shadow Ball and Zen Shot the same
// orb), each given its own trajectory and look, true to its name. An entry is a lexicon archetype (lexicon.ts) plus
// the names it claims: whole names first, then its keyword rule, both ahead of the lexicon's own tables. The look
// is drawn by src/render/sig/*.ts under the same id. Shapes are sized like the lexicon's (c = energy, d = damage)
// and use the sim's shape features: count / spread volleys, paths (helix braids, weaves, lobs, phases), `split`
// shards, a `fuse`, `grow`, `blast`, walls, and `scatter`ed impacts. Deterministic: pure functions of the card data.
import type { Archetype } from './lexicon'
import type { Effect, Shape } from './types'

export interface Signature extends Archetype {
  /** the family it is drawn with (src/render/sig/<family>.ts) and listed under in the docs */
  family: 'psychic' | 'fire' | 'water' | 'electric' | 'nature' | 'shadow' | 'force' | 'max'
  /** whole names it claims (lowercase, the GX tag dropped: lexicon.normalizeName) */
  names: string[]
  /** a keyword rule over the normalized name (after every signature's whole names) */
  rule?: RegExp
}

const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)))
const heavy = (c: number, d: number) => c >= 3 || d >= 100
const kb = (px: number): Effect => ({ op: 'knockback', px })
const slow = (permille: number, ticks: number): Effect => ({ op: 'slow', permille, ticks })
const shot = (speed: number, radius: number, range: number, extra: Record<string, unknown> = {}): Shape => ({ kind: 'projectile', speed, radius, range, ...extra })
const range = (c: number, base = 520, lo = 520, hi = 760) => cl(base + 40 * c, lo, hi)
const S = (family: Signature['family'], id: string, what: string, shape: Archetype['shape'], names: string[], rule?: RegExp, more: Partial<Archetype> = {}): Signature =>
  ({ family, id, what, shape, names, ...(rule ? { rule } : {}), ...more })

/** a Max / G-Max move's colossal strike (the lexicon's `max`): each element's own column, drawn by its look */
const maxShape: Archetype['shape'] = (c, d) => ({ kind: 'area', at: 'aim', range: 360, radius: cl(110 + d / 10, 120, 150), delay: 20 })
const MAX = { windup: () => 16, hit: () => [kb(110)] }

export const SIGNATURES: Signature[] = [
  // ---------------------------------------------------------------- psychic and fairy
  S('psychic', 'psychic', 'a mind-orb that bends after its target (the Psychic homing), rippling the air',
    (c, d) => shot(10, cl(14 + d / 20, 14, 24), range(c, 540)), ['psychic', 'psyshock', 'psystrike', 'psycrush', 'telekinesis', 'synchro kinesis', 'moon kinesis'], /^psychic$|psyshock|psystrike|psycrush|kinesis/),
  S('psychic', 'powergem', 'a prismatic gem that refracts into a fan of shards where it strikes',
    (c) => shot(15, 10, range(c, 600, 620, 760), { split: 5, splitSpread: 14, splitRange: 150, splitSpeed: 13, splitR: 5, splitPower: 400 }), ['power gem', 'prismatic', 'gem shot', 'jewel shot'], /power gem|prism|\bgems?\b|jewel/),
  S('psychic', 'psybeam', 'a beam of rippling rainbow rings', (c, d) => ({ kind: 'beam', length: cl(480 + 40 * c, 500, 700), width: cl(18 + d / 8, 18, 34), ticks: 12 }),
    ['psybeam', 'psylaser', 'psyray', 'signal beam', 'midnight ray', 'rewind beam'], /psybeam|psylaser|psyray|signal beam|midnight ray|rewind beam/),
  S('psychic', 'confuse', 'a woozy wisp that wobbles its way to the foe, trailing dizzy stars',
    () => shot(10, 12, 520, { path: 'weave', amp: 16, period: 9 }), ['confuse ray', 'headache', 'distort', 'chaotic pain', 'mirror pain', 'perplex'], /confus|headache|distort|chaotic pain|mirror pain/),
  S('psychic', 'psyshot', 'a quick psionic dart that leaves rings in its wake',
    (c) => shot(16, 9, range(c, 560)), ['psyshot', 'psy shot', 'magical shot', 'zen shot', 'mind blast', 'psydrive', 'psy purge', 'psyburn', 'photon boost', 'super psy', 'psychic sphere'],
    /psyshot|psy shot|magical shot|zen shot|mind blast|psydrive|psy purge|psyburn|photon boost|^super psy$/),
  S('psychic', 'heart', 'a pair of floating hearts that braid toward the foe (a kiss, a charm)',
    () => shot(11, 11, 460, { count: 2, spread: 0, path: 'helix', amp: 14, period: 10 }), ['lovely kiss', 'draining kiss', 'sweet kiss', 'charm', 'loving sympathy', 'heart stamp', 'lovely star'], /\bkiss\b|\bcharm\b|heart|loving/),
  S('psychic', 'sing', 'three musical notes that sway toward the foe (a song)',
    () => shot(10, 11, 480, { count: 3, spread: 0, path: 'helix', amp: 16, period: 12 }), ['sing', 'singing voice', 'lullaby', 'perish song', 'round', 'alluring dance', 'lordly songleader'], /^sing$|singing|song|lullaby|melody|chorus/),
  S('psychic', 'moonblast', 'a pale moon that swells as it flies and bursts in moonlight',
    (c, d) => shot(10, 12, 600, { grow: 2, growMax: 12, blast: cl(56 + d / 5, 56, 84) }), ['moonblast', 'lunar blast', 'moon impact', 'moonglow reverse', 'moon dance'], /moonblast|lunar blast|moon impact|moonglow/, { windup: () => 12 }),
  S('psychic', 'gleam', 'a flash of prismatic light bursting out all around you (Dazzling Gleam)',
    (c, d) => ({ kind: 'area', at: 'self', radius: heavy(c, d) ? 190 : 165 }), ['dazzling gleam', 'dazzle blast', 'miraculous shine', 'wonder shine', 'bloomshine', 'floodlight', 'dede-flash', 'lighting', 'flash'],
    /dazzl|shine$|floodlight|dede-flash|^flash$|gleam|radiance/, { windup: () => 12 }),
  S('psychic', 'mimic', 'a mirror-bright shard that ricochets off walls, flickering with the move it copies',
    (c, d) => shot(13, 11, range(c, 520), { path: 'bounce', bounces: 2 }), ['metronome', 'super metronome', 'mirror move', 'cross fusion strike', 'coinciding figures', 'copycat'], /metronome|mirror move|copycat/),
  S('psychic', 'fairywind', 'a glittering breeze of petals and sparkles that blows the foe back',
    () => ({ kind: 'cone', range: 210, arc: 70 }), ['fairy wind', 'trick wind', 'sweet breeze', 'plea'], /fairy wind|trick wind|sweet breeze/, { hit: () => [kb(100)] }),
  // ---------------------------------------------------------------- fire
  S('fire', 'fireblast', 'a fireball that bursts into the five-armed star of Fire Blast',
    (c, d) => shot(11, heavy(c, d) ? 18 : 15, 600, { blast: heavy(c, d) ? 88 : 70 }), ['fire blast', 'explosive fire', 'blast burn', 'magical fire', 'bright flame'], /fire blast|explosive fire|blast burn/, { windup: () => 14 }),
  S('fire', 'willowisp', 'three ghost-fire wisps that braid toward the foe',
    () => shot(9, 9, 500, { count: 3, spread: 0, path: 'helix', amp: 18, period: 10 }), ['will-o-wisp', 'flickering glow', 'eerie glow', 'eerie light', 'wisp'], /will-o-wisp|wisp|flickering glow|eerie (glow|light)|ghost ?fire/),
  S('fire', 'fireworks', 'a rocket that bursts into a ring of sparks',
    () => shot(14, 10, 520, { split: 8, splitSpread: 0, splitRange: 110, splitSpeed: 11, splitR: 5, splitPower: 400 }), ['fireworks', 'firecracker', 'sparkler', 'kaboom needles'], /firework|firecracker|sparkler/),
  S('fire', 'juggle', 'three fireballs lobbed in a spread that burst where they land',
    (c, d) => shot(11, 12, cl(360 + 30 * c, 380, 480), { count: 3, spread: 12, path: 'lob', blast: cl(44 + d / 6, 44, 64) }), ['flare juggling', 'fireball fever', 'flame juggling'], /juggl|fireball fever/),
  S('fire', 'sacredfire', 'a rainbow-edged phoenix flame that sears in a line', (c, d) => ({ kind: 'beam', length: cl(520 + 40 * c, 540, 720), width: cl(22 + d / 8, 24, 42), ticks: 14 }),
    ['sacred fire', 'phoenix burn', 'royal blaze', 'sacred flame', 'rainbow burn', 'laser flame'], /sacred fire|phoenix|royal blaze|rainbow burn/, { windup: () => 16 }),
  // ---------------------------------------------------------------- water and ice
  S('water', 'bubblebeam', 'a rushing stream of bubbles, braided', () => shot(12, 8, 480, { count: 5, spread: 0, path: 'helix', amp: 10, period: 6 }),
    ['bubblebeam', 'bubble beam', 'bubble shower', 'bubble drain'], /bubble ?beam|bubble shower|bubble drain/),
  S('water', 'icebeam', 'a crystalline beam that frosts over along its line (slows)', (c, d) => ({ kind: 'beam', length: cl(520 + 40 * c, 540, 720), width: cl(16 + d / 10, 16, 30), ticks: 14 }),
    ['ice beam', 'frost beam', 'freeze', 'freeze down', 'ice path', 'cold beam', 'freezing ray'], /ice beam|frost beam|^freeze$|freeze down|ice path|freezing ray/, { windup: () => 12, hit: () => [slow(400, 60)] }),
  S('water', 'aurora', 'a shimmering rainbow ribbon of a beam (slows a little)', (c) => ({ kind: 'beam', length: cl(520 + 40 * c, 540, 720), width: 24, ticks: 16 }),
    ['aurora beam', 'aurora gain', 'white ray', 'rainbow beam'], /aurora (beam|gain)|white ray|rainbow beam/, { hit: () => [slow(250, 45)] }),
  S('water', 'starfreeze', 'a spinning star of ice that freezes what it hits', () => shot(14, 11, 600, { path: 'spiral', amp: 10, period: 10 }),
    ['star freeze', 'ice star', 'frost star', 'crystal star shot'], /star freeze|ice star|frost star/, { hit: () => [slow(350, 60)] }),
  S('water', 'icicle', 'a volley of icicles that shatter into ice where they hit',
    () => shot(16, 7, 540, { count: 3, spread: 6, split: 3, splitSpread: 22, splitRange: 80, splitSpeed: 12, splitR: 4, splitPower: 300 }), ['icicle missile', 'icicle shot', 'frost bullet', 'ice shard', 'icicle spear', 'icicle crash'], /^(?!(g-)?max )(?!.*punch).*(icicle|ice shard|frost bullet)/),
  S('water', 'hail', 'hailstones pelting the ground around the aim point (slows)',
    (c) => ({ kind: 'area', at: 'aim', range: cl(280 + 20 * c, 300, 380), radius: 64, count: 4, scatter: 176, delay: 14, stagger: 5 }), ['hail', 'hailstorm', 'ice hail'], /^hail$|hailstorm|ice hail/, { hit: () => [slow(300, 40)] }),
  S('water', 'crabhammer', 'a giant pincer slamming down just ahead',
    (c, d) => ({ kind: 'area', at: 'aim', range: heavy(c, d) ? 92 : 80, radius: cl(72 + d / 10, 72, 98), delay: 8 }), ['crabhammer', 'crab impact', 'raging pincer', 'cyclone pincers', 'pincer smash'], /^(?!(g-)?max ).*(crab|pincer)/, { windup: () => 12, hit: () => [kb(80)] }),
  S('water', 'watershuriken', 'three spinning stars of water that fly in a tight fan', () => shot(15, 9, 520, { count: 3, spread: 7 }),
    ['water shuriken', 'water shot', 'schooling shot', 'water arrow', 'water drip'], /shuriken|water shot|schooling shot/),
  // ---------------------------------------------------------------- electric
  S('electric', 'electroball', 'a crackling electric sphere that swells as it flies and bursts in sparks',
    (c, d) => shot(11, cl(12 + d / 25, 12, 18), 580, { grow: 2, growMax: 8, blast: cl(50 + d / 5, 50, 80) }), ['electro ball', 'electric ball', 'pika ball', 'lightning ball', 'spark ball', 'plasma ball'], /(electro|electric|lightning|pika|spark|volt|plasma) ?ball/, { windup: () => 10 }),
  S('electric', 'discharge', 'arcs of lightning crackling out all around you',
    (c, d) => ({ kind: 'area', at: 'self', radius: heavy(c, d) ? 185 : 160 }), ['discharge', 'shorting spark', 'big sparking', 'lightning rondo', 'parabolic charge', 'electric storm'], /discharge|shorting spark|big sparking|lightning rondo|parabolic/, { windup: () => 12 }),
  S('electric', 'zapcannon', 'a huge, slow ball of lightning that swells and bursts',
    (c, d) => shot(8, 18, 620, { grow: 1, growMax: 8, blast: cl(64 + d / 6, 70, 96) }), ['zap cannon', 'electro cannon', 'electroblast', 'teraspark'], /zap cannon|electro cannon|electroblast|teraspark/, { windup: () => 18, hit: () => [kb(90)] }),
  S('electric', 'pinmissile', 'a salvo of darts that braid toward the foe',
    () => shot(17, 6, 560, { count: 4, spread: 0, path: 'helix', amp: 11, period: 5 }), ['pin missile', 'twineedle', 'spike cannon', 'missile barrage', 'photon bullets'], /pin missile|twineedle|spike cannon|photon bullets/),
  S('electric', 'poisonsting', 'a quick burst of dripping venom barbs', () => shot(16, 7, 520, { count: 3, spread: 4 }), ['poison sting', 'poison barb', 'venom barb', 'poison needle'], /poison (sting|barb|needle)|venom barb/),
  // ---------------------------------------------------------------- nature: grass, poison, ground, rock
  S('nature', 'airslash', 'two crescent blades of wind that cut through', () => shot(15, 10, 520, { count: 2, spread: 10, pierce: 1 }),
    ['air slash', 'air cutter', 'cutting wind', 'gale blade', 'razor wind', 'wind blade', 'razor wing'], /air slash|air cutter|cutting wind|gale blade|razor wind|wind blade|razor wing/),
  S('nature', 'petals', 'a whirl of petals spinning around you (Petal Dance)', (c) => ({ kind: 'area', at: 'self', radius: cl(120 + 10 * c, 120, 170), ticks: 18, every: 60 }),
    ['petal dance', 'flower dance', 'petal blizzard', 'flower spin', 'blossom storm'], /petal dance|flower dance|petal blizzard|flower spin|blossom storm/, { windup: () => 10 }),
  S('nature', 'seedbomb', 'a seed lobbed onto the foe that sprouts and bursts a beat later',
    (c, d) => shot(11, 11, cl(360 + 30 * c, 380, 520), { path: 'lob', blast: cl(58 + d / 4, 58, 100), fuse: 18 }), ['seed bomb', 'egg bomb', 'spore bomb'], /seed bomb|egg bomb|spore bomb/),
  S('nature', 'sludgebomb', 'a lobbed glob of sludge that splatters into toxic droplets',
    (c, d) => shot(11, 13, cl(360 + 30 * c, 380, 520), { path: 'lob', blast: cl(56 + d / 5, 56, 90), split: 6, splitSpread: 0, splitRange: 70, splitSpeed: 8, splitR: 6, splitPower: 300 }),
    ['sludge bomb', 'gunk shot', 'garbage attack', 'dredge up', 'sludge wave', 'trash bomb'], /sludge bomb|gunk shot|garbage attack|dredge up|sludge wave/),
  S('nature', 'grassknot', 'a root racing along under the ground (through walls) that bursts up in snaring vines under the foe (slows)',
    (c, d) => shot(12, cl(11 + d / 30, 11, 18), range(c, 440, 460, 600), { path: 'phase' }), ['grass knot', 'frenzy plant', 'tempting trap', 'root trap', 'vine trap'], /grass knot|frenzy plant|tempting trap|vine trap|root trap/, { hit: () => [slow(450, 45)] }),
  S('nature', 'stoneedge', 'jagged stone spikes bursting up in a line toward the aim', () => ({ kind: 'area', at: 'aim', range: 360, radius: 44, count: 3, delay: 16, stagger: 5 }),
    ['stone edge', 'splintered shards', 'rock wrecker', 'stone spikes', 'rocky avalanche'], /stone edge|splintered shards|stone spikes|rock wrecker/, { hit: () => [kb(40)] }),
  // ---------------------------------------------------------------- shadow and dragon
  S('shadow', 'shadowball', 'a roiling ball of shadow that swells and bursts', (c, d) => shot(10, 16, 580, { grow: 1, growMax: 6, blast: cl(56 + d / 5, 56, 84) }),
    ['shadow ball', 'dark ball', 'night ball', 'shadow bullet', 'shadow impact'], /shadow ball|dark ball|night ball|shadow bullet/, { windup: () => 12 }),
  S('shadow', 'darkpulse', 'rings of dark energy rolling out through everything', () => shot(11, 12, 460, { wall: 34, pierce: 9 }),
    ['dark pulse', 'night daze', 'dark wave', 'dyna barrier'], /dark pulse|night daze|dark wave/),
  S('shadow', 'tickingcurse', 'a cursed timer that drifts through walls, clings to the foe it touches and blows a beat later',
    (c, d) => shot(12, 10, cl(420 + 30 * c, 440, 560), { path: 'phase', fuse: 30, stick: 1, blast: cl(64 + d / 6, 64, 96) }), ['ticking curse', 'ticking terror', 'time bomb', 'cursed bomb'], /ticking|time bomb|cursed bomb/),
  S('shadow', 'dragonpulse', 'twin serpents of dragon energy coiling along a thick beam', () => ({ kind: 'beam', length: 480, width: 34, ticks: 14 }),
    ['dragon pulse', 'draco pulse', 'spiral burst'], /dragon pulse|draco pulse/),
  S('shadow', 'dracometeor', 'meteors raining down around the aim point',
    (c) => ({ kind: 'area', at: 'aim', range: cl(380 + 30 * c, 400, 520), radius: 50, count: 4, scatter: 148, delay: 18, stagger: 7 }), ['draco meteor', 'shoot meteors', 'meteor shower', 'star raid', 'meteor storm', 'comet shower', 'meteor'],
    /draco meteor|shoot meteors|meteor (shower|storm)|star raid|comet shower|^meteor$/, { windup: () => 16, hit: () => [kb(40)] }),
  // ---------------------------------------------------------------- force: normal, steel, fighting
  S('force', 'payday', 'a spray of glinting coins', () => shot(15, 8, 480, { count: 3, spread: 9 }), ['pay day', 'coin toss', 'coin shot', 'lucky coin'], /pay ?day|coin (shot|toss)/),
  S('force', 'triattack', 'three orbs of fire, ice and thunder braiding together', () => shot(12, 10, 560, { count: 3, spread: 0, path: 'helix', amp: 18, period: 8 }),
    ['tri attack', 'trinity burst', 'tri-attack', 'elemental blast', 'trinity nova'], /tri-? ?attack|trinity burst/),
  S('force', 'flashcannon', 'a blinding blast of silver light', (c, d) => ({ kind: 'beam', length: cl(500 + 40 * c, 520, 700), width: cl(24 + d / 8, 26, 44), ticks: 10 }),
    ['flash cannon', 'mirror shot', 'steel beam', 'light cannon', 'core beam', 'power beam', 'windup beam', 'energy stream', 'blinding beam'], /flash cannon|mirror shot|steel beam|light cannon|core beam/, { windup: () => 12 }),
  S('force', 'aurasphere', 'a sphere of blue aura that bores through the air and bursts', () => shot(10, 18, 620, { blast: 56, grow: 1, growMax: 4 }),
    ['aura sphere', 'aura sphere volley', 'focus blast', 'aura ball'], /aura sphere|focus blast|aura ball/, { windup: () => 12 }),
  S('force', 'revengeblast', 'a crimson orb of vengeance that swells as it flies and bursts',
    (c, d) => shot(11, 15, 600, { grow: 2, growMax: 10, blast: cl(56 + d / 6, 56, 80) }), ['revenge blast', 'vengeful blast', 'spite blast'], /revenge blast/, { windup: () => 12 }),
  S('force', 'hypervoice', 'a roar that rolls out as a wall of sound through everything', () => shot(12, 14, 420, { wall: 40, pierce: 9 }),
    ['hyper voice', 'boomburst', 'synchro loud', 'sonic volume', 'bug buzz', 'echoed voice'], /hyper voice|boomburst|synchro loud|sonic volume|bug buzz|echoed voice/, { windup: () => 10, hit: () => [kb(60)] }),
  // ---------------------------------------------------------------- Max / G-Max: every element its own column
  S('max', 'maxfire', 'a colossal eruption of flame on the aim point (Max Flare)', maxShape, ['star blaze', 'ember star'], /^(g-)?max (flare|fire|burn|blaze|detonate)|centiferno|wildfire/, MAX),
  S('max', 'maxwater', 'a colossal geyser bursting on the aim point (Max Geyser)', maxShape, ['g-max rapid flow'], /^(g-)?max (geyser|torrent|tyrant|wave|pincer)|cannonade|hydrosnipe|rapid flow/, MAX),
  S('max', 'maxice', 'a colossal spike of ice crashing down (Max Hailstorm)', maxShape, ['crystal star'], /^(g-)?max (icicle|frost|hail)/, MAX),
  S('max', 'maxleaf', 'a colossal tree bursting up out of the ground (Max Overgrowth)', maxShape, [], /^(g-)?max (leaf|tree|overgrowth|drum|vine)/, MAX),
  S('max', 'maxbolt', 'a colossal pillar of lightning (Max Lightning)', maxShape, [], /^(g-)?max (lightning|thunder|volt)/, MAX),
  S('max', 'maxpsy', 'a colossal psychic storm (Max Mindstorm)', maxShape, ['g-max smite'], /^(g-)?max (mindstorm|miracle|harmony|smite)/, MAX),
  S('max', 'maxdark', 'a colossal pit of darkness opening underfoot (Max Darkness)', maxShape, ['g-max malodor'], /^(g-)?max (darkness|shadow|malodor)/, MAX),
  S('max', 'maxfist', 'a colossal fist smashing down (Max Knuckle)', maxShape, ['g-max one blow', 'g-max pulverization'], /^(g-)?max (fist|knuckle|impact|edge|take down)|one blow|pulverization/, MAX),
  S('max', 'maxsteel', 'colossal steel blades falling from the sky (Max Steelspike)', maxShape, ['sword star', 'star chronos'], /^(g-)?max (steel|meltdown)/, MAX),
  S('max', 'maxdragon', 'a colossal draconic storm (Max Wyrmwind)', maxShape, ['max burst'], /^(g-)?max (burst|wyrm)/, MAX),
]
