// Builds the hand kits: data/kits/<card id>.json for every printing of every Pokémon in tools/kits/hand/*.ts.
//   npx vite-node tools/kits/build.ts [--check]
// A spec is authored per Pokémon name: a fantasy note and, per attack name, a shape in a small DSL plus any
// extra effects. The effects the card's own text asks for come from the card-text parser (src/sim/cardtext.ts) at
// build time, so a kit = the card's mechanics + the authored shape and feel. Numbers (HP, costs, damage) stay in the
// card data: a kit only carries a number when the translation needs it, listed in its `overrides` with the reason.
// --check: build in memory and report differences / missing attacks, without writing.
//
// Shape DSL (sizes in design px, ticks at 60 Hz; 1 TURN = 90 ticks):
//   proj s<speed> r<radius> R<range> [n<count> sp<spread>] [p<pierce>]
//   beam L<length> W<width> [t<ticks>]        cone R<range> A<arc>          melee R<range> A<arc> [l<lunge>]
//   dash D<distance> S<speed> r<radius>        area@aim r<radius> R<range> [t<ticks> e<every>]
//   area@self r<radius> [t e]                  terrain@aim r R / terrain@self r        self
// Extras: kb<px> knockback, pull<px>, slow<permille>/<ticks>, water<r> fire<r> shock<r> clear<r> (paint on impact),
//   wu<ticks> windup, cd<ticks> cooldown, rc<ticks> recovery, nohit (drop parsed hit effects: a self move),
//   pips<n> the attack costs only the card's first n energy symbols (an override: the spec's `overrides` must say why),
//   ~<path> the trajectory (lob, boomerang, zigzag, ..., ~straight to refuse the lexicon's), ! pin this shape (the
//   lexicon replaces a hand shape of the wrong range class otherwise, and resolveKit adopts its archetype's
//   trajectory; the kit carries `pin` with the attack's note as the reason),
//   hit=<json> cast=<json> imp=<json> (one more effect, JSON without spaces).
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { attackEffects } from '../../src/sim/autokit'
import { parseAttackText } from '../../src/sim/cardtext'
import { parseDamage, validateKit } from '../../src/sim/kit'
import { lexShape } from '../../src/sim/lexicon'
import { TURN } from '../../src/sim/rules'
import type { Effect, Kit, KitAttack, Shape } from '../../src/sim/types'
import { loadCards, type Card } from './cards'
import { HAND, type HandSpec } from './hand'

const ROOT = resolve(__dirname, '../..')
const KITS = join(ROOT, 'data/kits')
/** the practice-roster pilots carry their own numbers and stay hand-edited */
export const PILOTS = new Set(['base1-58', 'base1-46', 'base1-63', 'base1-44', 'swsh7-7'])

const num = (tok: string, key: string): number | undefined => {
  const m = new RegExp(`^${key}(-?\\d+)$`).exec(tok)
  return m ? parseInt(m[1], 10) : undefined
}

/** the lexicon's trajectory params a hand shape inherits (sizes, counts and pierce stay the spec's own) */
const TRAJECTORY = ['path', 'amp', 'period', 'blast', 'bounces', 'drift'] as const

/** a shape's range class: close (melee, cone, dash), a ring around yourself, ranged (shot, beam), aimed (a strike on
 * the aim point), self */
function rangeClass(s: Shape): string {
  if (s.kind === 'melee' || s.kind === 'cone' || s.kind === 'dash') return 'close'
  if (s.kind === 'area') return s.at === 'aim' ? 'aimed' : 'ring'
  if (s.kind === 'projectile' || s.kind === 'beam') return 'ranged'
  return s.kind
}
/** a hand shape grossly off its name: another range class (ranged and aimed both reach far: not gross) */
export function gross(hand: Shape, lex: Shape): boolean {
  const a = rangeClass(hand), b = rangeClass(lex)
  if (a === b || a === 'self' || b === 'self' || a === 'terrain' || b === 'terrain') return false
  return !((a === 'ranged' && b === 'aimed') || (a === 'aimed' && b === 'ranged'))
}

export interface ParsedDsl { shape: Shape; windup?: number; cooldown?: number; recovery?: number; pips?: number; onHit: Effect[]; onCast: Effect[]; onImpact: Effect[]; nohit: boolean; keep?: boolean }

export function parseDsl(src: string): ParsedDsl {
  const toks = src.trim().split(/\s+/)
  const head = toks.shift() ?? 'self'
  const [kind, at] = head.split('@')
  const shape: Shape = { kind: kind as Shape['kind'] }
  if (at) shape.at = at
  const out: ParsedDsl = { shape, onHit: [], onCast: [], onImpact: [], nohit: false }
  const KEYS: Record<string, [string, string][]> = {
    proj: [['s', 'speed'], ['r', 'radius'], ['R', 'range'], ['n', 'count'], ['sp', 'spread'], ['p', 'pierce']],
    beam: [['L', 'length'], ['W', 'width'], ['t', 'ticks']],
    cone: [['R', 'range'], ['A', 'arc']],
    melee: [['R', 'range'], ['A', 'arc'], ['l', 'lunge']],
    dash: [['D', 'distance'], ['S', 'speed'], ['r', 'radius']],
    area: [['r', 'radius'], ['R', 'range'], ['t', 'ticks'], ['e', 'every']],
    terrain: [['r', 'radius'], ['R', 'range']],
    self: [],
  }
  if (kind === 'proj') shape.kind = 'projectile'
  const keys = KEYS[kind]
  if (!keys) throw new Error(`unknown shape "${head}" in "${src}"`)
  for (const t of toks) {
    let used = false
    for (const [k, name] of keys) {
      const v = num(t, k)
      if (v !== undefined && /^[a-zA-Z]+/.exec(t)?.[0] === k) { shape[name] = v; used = true; break }
    }
    if (used) continue
    let m: RegExpExecArray | null
    if ((m = /^kb(\d+)$/.exec(t))) out.onHit.push({ op: 'knockback', px: +m[1] })
    else if ((m = /^pull(\d+)$/.exec(t))) out.onHit.push({ op: 'pull', px: +m[1] })
    else if ((m = /^slow(\d+)\/(\d+)$/.exec(t))) out.onHit.push({ op: 'slow', permille: +m[1], ticks: +m[2] })
    else if ((m = /^(water|fire|shock|clear)(\d+)$/.exec(t))) out.onImpact.push({ op: 'paint', terrain: m[1] === 'clear' ? 'none' : m[1], radius: +m[2], ...(m[1] === 'fire' ? { ticks: 150 } : {}) })
    else if ((m = /^wu(\d+)$/.exec(t))) out.windup = +m[1]
    else if ((m = /^cd(\d+)$/.exec(t))) out.cooldown = +m[1]
    else if ((m = /^rc(\d+)$/.exec(t))) out.recovery = +m[1]
    else if ((m = /^pips(\d+)$/.exec(t))) out.pips = +m[1]
    else if (t === 'nohit') out.nohit = true
    else if (t === '!') out.keep = true
    else if ((m = /^~([a-z]+)$/.exec(t))) shape.path = m[1]
    else if ((m = /^(hit|cast|imp)=(.+)$/.exec(t))) {
      const e = JSON.parse(m[2]) as Effect
      ;(m[1] === 'hit' ? out.onHit : m[1] === 'cast' ? out.onCast : out.onImpact).push(e)
    } else throw new Error(`unknown token "${t}" in "${src}"`)
  }
  return out
}

/** the hand kit for one card from its spec */
export function buildKit(card: Card, spec: HandSpec): { kit: Kit; missing: string[]; relexed: string[] } {
  const missing: string[] = []
  const relexed: string[] = []
  const attacks = (card.attacks ?? []).map((a): KitAttack => {
    const src = spec.atk[a.name]
    if (src === undefined) missing.push(a.name)
    const dsl = parseDsl(typeof src === 'string' ? src : (src?.[0] ?? 'self'))
    const p = parseAttackText(a.text, card.name)
    const fx = attackEffects(a, card.name, p)
    // layer 2 under the hand shape: the lexicon's trajectory rides along when its archetype makes the same kind of
    // shape and the spec didn't pick a path (`~straight` keeps a hand shape plain)
    const lex = lexShape(a.name, p, (a.cost ?? []).filter((x) => x && x !== 'Free').length, parseDamage(a.damage) || 0, 'Colorless')
    // the move reads wrong (docs/MOVES.md "Audit"): a hand shape of another range class than its name (an Earthquake
    // as a shot, a Tackle as a ring) takes the name's archetype; the spec's effects and timing stay. `!` pins it
    if (lex && !dsl.keep && gross(dsl.shape, lex.shape)) { dsl.shape = lex.shape; relexed.push(`${a.name} (${lex.id})`) }
    if (lex && dsl.shape.path === undefined && lex.shape.kind === dsl.shape.kind && (lex.shape.at ?? null) === (dsl.shape.at ?? null)) {
      for (const k of TRAJECTORY) if (lex.shape[k] !== undefined) dsl.shape[k] = lex.shape[k]
    }
    const out: KitAttack = { name: a.name, shape: dsl.shape }
    // `!`: the spec's shape on purpose, the note says why (KitAttack.pin: resolveKit keeps it, the look still applies)
    if (dsl.keep) out.pin = (Array.isArray(src) && src[1]) || 'pinned in the hand spec'
    const onCast = [...fx.onCast, ...dsl.onCast]
    const onHit = dsl.shape.kind === 'self' || dsl.nohit ? [] : [...fx.onHit, ...dsl.onHit]
    const onImpact = [...fx.onImpact, ...dsl.onImpact]
    if (dsl.windup !== undefined) out.windup = dsl.windup
    if (dsl.recovery !== undefined) out.recovery = dsl.recovery
    if (dsl.cooldown !== undefined) out.cooldown = dsl.cooldown
    if (dsl.pips !== undefined) out.cost = (a.cost ?? []).filter((x) => x && x !== 'Free').slice(0, dsl.pips) as KitAttack['cost']
    if (onCast.length) out.onCast = onCast
    if (onHit.length) out.onHit = onHit
    if (onImpact.length) out.onImpact = onImpact
    return out
  })
  const notes: string[] = []
  for (const a of card.attacks ?? []) {
    const src = spec.atk[a.name]
    if (Array.isArray(src) && src[1]) notes.push(`${a.name}: ${src[1]}`)
  }
  const kit: Kit = {
    version: 1, card: card.id, character: card.character, name: card.name,
    fantasy: spec.fantasy,
    attacks,
    notes: notes.join('; ') || undefined,
  }
  if (spec.overrides) kit.overrides = spec.overrides
  if (!kit.notes) delete kit.notes
  return { kit, missing, relexed }
}

// ------------------------------------------------------------------ main
{
  const check = process.argv.includes('--check')
  const cards = loadCards()
  const byName = new Map<string, Card[]>()
  for (const c of cards) byName.set(c.name, [...(byName.get(c.name) ?? []), c])
  const wrote = new Set<string>()
  let problems = 0
  const relex = new Set<string>()
  const seen = new Set<string>()
  for (const spec of HAND) {
    for (const nm of [spec.name, ...(spec.also ?? [])]) {
      if (seen.has(nm)) { console.log(`spec for ${nm} appears twice`); problems++ }
      seen.add(nm)
      const list = (byName.get(nm) ?? []).filter((c) => !spec.only || spec.only.includes(c.id))
      if (!list.length) { console.log(`no cards named ${nm}`); problems++ }
      for (const c of list) {
        if (PILOTS.has(c.id)) continue
        const { kit, missing, relexed } = buildKit(c, spec)
        for (const r of relexed) relex.add(`${c.name}: ${r}`)
        if (process.argv.includes('--relexed')) for (const r of relexed) console.log(`relexed ${c.id} ${c.name}: ${r}`)
        if (missing.length) { console.log(`${c.id} ${c.name}: no shape for ${missing.join(', ')}`); problems++ }
        const errs = validateKit(kit)
        if (errs.length) { console.log(`${c.id} ${c.name}: ${errs.join('; ')}`); problems++ }
        wrote.add(c.id)
        const file = join(KITS, `${c.id}.json`)
        const text = JSON.stringify(kit, null, 1) + '\n'
        if (!check) writeFileSync(file, text)
      }
    }
  }
  // generated kits whose card no longer has a spec
  for (const f of readdirSync(KITS)) {
    const id = f.replace(/\.json$/, '')
    if (!f.endsWith('.json') || PILOTS.has(id) || wrote.has(id)) continue
    const k = JSON.parse(readFileSync(join(KITS, f), 'utf8')) as Kit
    if (k.fantasy !== undefined) { console.log(`stale: ${f}`); if (!check && existsSync(join(KITS, f))) unlinkSync(join(KITS, f)) }
  }
  const specs = HAND.length
  console.log(`${specs} specs, ${wrote.size} kit files${check ? ' (checked, not written)' : ''}, ${problems} problems; ${relex.size} hand shapes of the wrong range class took their name's archetype; TURN = ${TURN} ticks`)
  if (problems) process.exitCode = 1
}
