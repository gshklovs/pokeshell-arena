// The auto-kit: a card with no hand kit gets one from its own data (docs/SPEC.md section 7, docs/KITS.md).
//   effects: the card-text parser (cardtext.ts) turns the attack's rules text into effect ops;
//   shape:   the move lexicon (lexicon.ts: the attack's name, then its text -> one of its archetypes, each a
//            shape with a trajectory); only when that says nothing, the older name/text/type families below;
//   sizes:   grow with the energy cost and the damage, so a 4-energy attack reaches further than a 1-energy jab.
// Everything is a pure function of the card data, so the same card always gets the same kit.
import { parseAttackText, type ParsedText } from './cardtext'
import { lexShape } from './lexicon'
import { TURN } from './rules'
import { ENERGY_TYPES, type CardData, type Effect, type EnergyType, type Kit, type KitAttack, type Shape, type ShapeKind } from './types'

function asType(t: string | undefined): EnergyType {
  return (ENERGY_TYPES as string[]).includes(t ?? '') ? (t as EnergyType) : 'Colorless'
}

/** the printed damage as a number: "90+" -> 90, "30×" -> 30, "" -> 0 */
function baseOf(d: string | undefined): number {
  const m = /\d+/.exec(d ?? '')
  return m ? parseInt(m[0], 10) : 0
}

// ------------------------------------------------------------------ name keywords -> shape family
const WORDS: [ShapeKind | 'areaSelf', RegExp][] = [
  ['dash', /\b(?:tackle|rush|charge|dash|ram|crash|take down|double-edge|dive|flying|fly|rocket|sprint|leap|pounce|lunge|gallop|stampede|raid|assault|trample|quick attack|blitz|smash|brave bird|giga impact|head smash|full[- ]?force|all[- ]out|u-turn|volt switch|zoom|slide|skid|stomp(?:ede)?|roll(?:out)?|bound|jump|hop)\b/i],
  ['beam', /\b(?:beam|ray|cannon|laser|pulse|pump|hydro|solar|prism|aurora|psybeam|zap|thunderbolt|thunder|lightning|bolt|stream|jet|spear|lance|blast|railgun|photon|light|spectrum|shine|gleam|flash|hyper voice|eye|gaze)\b/i],
  ['areaSelf', /\b(?:earthquake|magnitude|quake|explosion|self-destruct|selfdestruct|eruption|shock ?wave|nova|dance|stomp|tremor|seismic|burst|roar|outrage|thrash|rampage|frenzy|tantrum|spin|whirl|twister|cyclone|tornado)\b/i],
  ['area', /\b(?:storm|meteor|avalanche|rain|hail|blizzard|spikes|field|wave|tsunami|typhoon|vortex|bloom|garden|forest|grove|impact|fall|crater|bomb|missile|drop|shower|swarm|psychic|miracle|mystic|curse|nightmare|dream|requiem|chronos|star|galaxy|cosmic|void|abyss|lost|zone|pressure|gravity|flood|surf|tide|geyser|volcano|inferno|firestorm|sandstorm|downpour|rainbow|fairy)\b/i],
  ['cone', /\b(?:breath|flame|fire|flamethrower|burn|scorch|blaze|heat|ember|gust|wind|powder|spore|spray|scald|smog|gas|sand|screech|howl|voice|song|sing|scream|glare|leer|scary|frost|freeze|icy|chill|whirlwind|hurricane|pollen|scent|aroma|mist|smoke|poison|toxic|acid|splash|wing|feather|tailwind|cheer|melody|chorus|hypno|lullaby)\b/i],
  ['melee', /\b(?:punch|kick|scratch|claw|slash|bite|fang|cut|chop|tail|horn|peck|headbutt|head|slap|smack|strike|hit|blow|fist|knuckle|hammer|crush|slam|jab|beak|pound|lick|wrap|bind|squeeze|grab|rend|blade|sword|edge|drill|hug|bash|swipe|scrape|gnaw|nuzzle|chomp|crunch|mangle|maul|tear|rip|swing|sting|pinch|clamp|vise|scissor|hook|uppercut|chop|palm|elbow|knee|throw|toss|grip|wring|snap|whip|lash|vine|club|bone|smite|knock|thump|wallop|press|body)\b/i],
  ['projectile', /\b(?:shot|ball|bullet|gun|seed|needle|pin|spike|shard|bubble|orb|arrow|dart|shuriken|rock|stone|boulder|sludge|jolt|spark|spit|snowball|shell|cutter|leaf|razor|blade leaf|gem|jewel|coin|pellet|slug|mud|web|string|shoot|sniper|snipe|fling|launch|pitch|star|bomb|bolt)\b/i],
]

/** the shape family an attack's name suggests, or null */
export function nameFamily(name: string): ShapeKind | 'areaSelf' | null {
  for (const [kind, re] of WORDS) if (re.test(name)) return kind
  return null
}

// ------------------------------------------------------------------ type defaults
const CHEAP: Record<EnergyType, ShapeKind | 'areaSelf'> = {
  Fire: 'cone', Water: 'projectile', Lightning: 'projectile', Grass: 'projectile', Psychic: 'projectile', Fighting: 'melee',
  Darkness: 'melee', Metal: 'melee', Dragon: 'beam', Fairy: 'area', Colorless: 'melee',
}
const BIG: Record<EnergyType, ShapeKind | 'areaSelf'> = {
  Fire: 'cone', Water: 'beam', Lightning: 'beam', Grass: 'area', Psychic: 'area', Fighting: 'areaSelf', Darkness: 'dash',
  Metal: 'projectile', Dragon: 'beam', Fairy: 'areaSelf', Colorless: 'projectile',
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)))

/** a sized shape of a family: bigger with the cost (c = energy count) and the damage (d) */
export function sizedShape(kind: ShapeKind | 'areaSelf', c: number, d: number, type: EnergyType, spread = false): Shape {
  const cost = Math.max(1, c)
  switch (kind) {
    case 'projectile': {
      return { kind, speed: clamp(type === 'Lightning' ? 16 : type === 'Grass' ? 11 : 13, 9, 17), radius: clamp(9 + d / 30, 9, 22), range: clamp(520 + 40 * cost, 520, 760) }
    }
    case 'beam': return { kind, length: clamp(460 + 50 * cost, 480, 780), width: clamp(16 + d / 8, 16, 46), ...(d >= 150 ? { ticks: 10 } : {}) }
    case 'cone': return { kind, range: clamp(150 + 22 * cost, 150, 270), arc: clamp(38 + 5 * cost + (spread ? 16 : 0), 38, 80) }
    case 'melee': return { kind, range: clamp(62 + 5 * cost, 62, 92), arc: clamp(64 + 6 * cost, 64, 104), ...(cost >= 2 || d >= 50 ? { lunge: clamp(20 + 15 * cost, 30, 90) } : {}) }
    case 'dash': return { kind, distance: clamp(200 + 25 * cost, 220, 340), speed: clamp(16 + cost, 16, 20), radius: clamp(26 + d / 25, 26, 36) }
    case 'area': return { kind, at: 'aim', radius: clamp(70 + 12 * cost + (spread ? 30 : 0), 76, 170), range: clamp(320 + 30 * cost, 340, 480) }
    case 'areaSelf': return { kind: 'area', at: 'self', radius: clamp(100 + 15 * cost + (spread ? 30 : 0), 110, 200) }
    case 'terrain': return { kind, at: 'aim', radius: clamp(80 + 15 * cost, 90, 160), range: 360 }
    case 'self': return { kind: 'self' }
    default: return { kind: 'self' }
  }
}

/** does the parsed text touch the target (so the attack needs a shape that hits) */
function hitsTarget(p: ParsedText): boolean {
  return p.pre.length > 0 || p.post.length > 0
}

/** the shape family for an attack: text first (it says what the attack does), then the name, then the type */
export function familyFor(a: { name: string; damage?: string; cost?: string[] }, p: ParsedText, type: EnergyType, index: number): ShapeKind | 'areaSelf' {
  const d = baseOf(a.damage)
  const cost = (a.cost ?? []).filter((x) => x && x !== 'Free').length
  const mechs = new Set(p.mechs)
  const onlySelf = d === 0 && !hitsTarget(p)
  if (onlySelf) return p.onImpact.length ? 'terrain' : 'self'
  const spreadAll = p.post.some((e) => e.op === 'benchDamage' && e.count === undefined && e.side !== 'self')
  const recoil = p.onCast.some((e) => e.op === 'selfDamage' && (e.amount as number) >= 20)
  const named = nameFamily(a.name)
  if (spreadAll) return named === 'cone' || named === 'areaSelf' ? named : 'area'
  if (mechs.has('counters') && d === 0) return named === 'cone' ? 'cone' : 'area'
  if (named) return named
  if (recoil && (type === 'Fighting' || type === 'Colorless' || type === 'Darkness' || type === 'Metal')) return 'dash'
  if (mechs.has('status') && d <= 30 && type !== 'Psychic') return 'cone'
  if (mechs.has('gust')) return 'beam'
  const big = index > 0 || cost >= 3
  return (big ? BIG : CHEAP)[type]
}

/** flavor effects a shape family carries by type and name (knockback on big hits, water floods, ice slows) */
function extras(a: { name: string }, family: ShapeKind | 'areaSelf', type: EnergyType, element: EnergyType, d: number, cost: number): { onHit: Effect[]; onImpact: Effect[] } {
  const onHit: Effect[] = []
  const onImpact: Effect[] = []
  const nm = a.name
  if (d >= 60 && (family === 'melee' || family === 'dash' || family === 'areaSelf')) onHit.push({ op: 'knockback', px: clamp(40 + d / 3, 60, 160) })
  else if (/\b(?:gust|whirlwind|wind|roar|blow|push|repel|hurricane|typhoon|twister|tornado|cyclone|wave)\b/i.test(nm) && d > 0) onHit.push({ op: 'knockback', px: clamp(80 + d / 3, 90, 180) })
  if (/\b(?:ice|icy|frost|freeze|frozen|blizzard|aurora|chill|cold|snow|glacial|hail)\b/i.test(nm)) onHit.push({ op: 'slow', permille: 400, ticks: TURN })
  else if (/\b(?:wrap|bind|vine|web|string|sticky|squeeze|constrict|entangle|mud|quicksand|tar)\b/i.test(nm)) onHit.push({ op: 'slow', permille: 350, ticks: TURN })
  if (/\b(?:whip|hook|grab|grip|drag|tongue|lasso|reel|magnet|gravity|vacuum|attract)\b/i.test(nm) && d > 0) onHit.push({ op: 'pull', px: 90 })
  if (element === 'Water' && family !== 'self' && family !== 'melee') onImpact.push({ op: 'paint', terrain: 'water', radius: clamp(50 + 12 * cost, 60, 120) })
  if (element === 'Fire' && (cost >= 3 || /\b(?:inferno|eruption|blaze|fire spin|volcano|magma|lava|burn|scorch|flare)\b/i.test(nm)) && family !== 'self') onImpact.push({ op: 'paint', terrain: 'fire', radius: clamp(30 + 8 * cost, 40, 80), ticks: 150 })
  void type
  return { onHit, onImpact }
}

/** the effect lists for one attack from its text: onCast, onHit (pre + the damage op + post), onImpact */
export function attackEffects(a: { name: string; damage?: string; text?: string }, cardName: string, p = parseAttackText(a.text, cardName)): { onCast: Effect[]; onHit: Effect[]; onImpact: Effect[] } {
  const d = baseOf(a.damage)
  const amount = p.perUnit || p.noDirect ? 0 : d
  const dmg: Effect[] = []
  const bonuses = p.pre.length > 0 || p.onCast.some((e) => e.op === 'bonus' || e.op === 'spendEnergy' || e.op === 'bonusPer')
  if (amount > 0 || (!p.noDirect && bonuses)) {
    const e: Effect = { op: 'damage', amount }
    if (p.wr !== true) e.wr = p.wr
    if (p.pierce) e.pierce = true
    dmg.push(e)
  } else if (p.noDirect && (p.wr !== true || p.pierce)) {
    // the damage ops the text made (spread / snipes) carry the modifiers
    for (const e of p.post) if (e.op === 'damage') { if (p.wr !== true) e.wr = p.wr; if (p.pierce) e.pierce = true }
  }
  return { onCast: p.onCast, onHit: [...p.pre, ...dmg, ...p.post], onImpact: p.onImpact }
}

/** a kit for a card that has none: its own numbers, effects from its text, a shape from its name, text and type */
export function autoKit(card: CardData): Kit {
  const type = asType(card.types?.[0])
  const attacks = (card.attacks ?? []).map((a, i): KitAttack => {
    const p = parseAttackText(a.text, card.name)
    const cost = (a.cost ?? []).filter((x) => x && x !== 'Free').length
    const el = asType((a.cost ?? []).find((c) => c && c !== 'Colorless' && c !== 'Free') ?? type)
    const d = baseOf(a.damage)
    // layer 2: the move lexicon (name, then text); layer 1, the type default, only when it has nothing to say
    const lex = lexShape(a.name, p, cost, d, el)
    const family: ShapeKind | 'areaSelf' = lex
      ? lex.shape.kind === 'area' && lex.shape.at === 'self' ? 'areaSelf' : lex.shape.kind
      : familyFor(a, p, el, i)
    const fx = attackEffects(a, card.name, p)
    const ex = extras(a, family, type, el, d, cost)
    const shape = lex ? lex.shape : sizedShape(family, cost, d, el, p.post.some((e) => e.op === 'benchDamage'))
    const out: KitAttack = { name: a.name, shape }
    if (fx.onCast.length) out.onCast = fx.onCast
    // the feel: the name's extras (ice slows, gusts push), then the archetype's (a punch shoves, a whip reels in),
    // one of each op
    const feel = [...ex.onHit, ...(lex?.hit ?? []).filter((e) => !ex.onHit.some((x) => x.op === e.op))]
    const onHit = shape.kind === 'self' ? [] : [...fx.onHit, ...feel.filter((e) => !fx.onHit.some((x) => x.op === e.op))]
    if (onHit.length) out.onHit = onHit
    const onImpact = [...fx.onImpact, ...(shape.kind === 'self' ? [] : ex.onImpact)]
    if (onImpact.length) out.onImpact = onImpact
    const wu = Math.max(d >= 120 || cost >= 4 ? clamp(8 + 3 * cost, 12, 26) : 0, lex?.windup ?? 0)
    if (wu > 0) out.windup = wu
    return out
  })
  return { version: 1, card: card.id, character: card.character, name: card.name, attacks }
}
