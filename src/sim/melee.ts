// Melee flavour (docs/MELEE.md): how a close-range attack plays, read from its name. The move lexicon decides THAT an
// attack is melee and its sizes; this decides HOW it plays: a live swing with active frames and a step-in, strings of
// taps with a finisher, flinch and interrupts (with an immunity and armour, so no stunlock), holds, throws along the
// aim, wall splats, a parry window, and the body-blow / charge / swoop / hop / slam / burrow dashes, plus the per-type
// melee flavour. Everything is integer math on plain state (deterministic); the card's printed damage lands once, on
// the finisher. The melee constants live here (not rules.ts) on purpose: the balance pass tunes rules.ts.
import { armored, attackDamage, behind, hurt, kitOf, onField, shove } from './combat'
import { costPips } from './energy'
import type { CastInfo, EffectCtx } from './effects/define'
import { FP, ONE, iatan2, icos, idiv, ilen, isin, wrapAngle } from './fixed'
import { ENERGY_CAP } from './rules'
import type { Effect, MatchDef, ResolvedAttack, Shape, SimState, Swing } from './types'

// ------------------------------------------------------------------ the user's calls (docs/MELEE.md section 6)
/** 1. a string's taps do no damage and the finisher lands the card's printed damage once (true: the damage is split
 * across the strikes, the finisher gets what is left) */
export const STRING_SPLIT: boolean = false
/** 2. a flinch that cancels a windup keeps the energy spent (true: it is refunded) */
export const FLINCH_REFUND: boolean = false
/** 3. a throw goes where the thrower aims during the hold (false: always back over its shoulder) */
export const THROW_AIMED: boolean = true
/** 4. a parry blocks melee and dash hits only (true: shots, beams and areas too) */
export const PARRY_BLOCKS_RANGED: boolean = false
/** 5. charge-and-release (hold longer for a stronger heavy): later */
export const CHARGE_RELEASE: boolean = false

// ------------------------------------------------------------------ landing (the user: "landing melees already felt a bit
// hard"; tools/melee/human.ts measures each lever against a human-like player). Attack assist, never aim assist: the
// player's aim decides, these only make an honest aim land
/** the melee step-in's magnetism (the user's call: "sure"): a swing's step-in bends toward the foe you are aimed at
 * when it is within this many degrees of your aim, at most that much. The arc stays on your aim (no aim snapping) and
 * shots get nothing; 0 turns it off */
export const MELEE_STEP_MAGNET_DEG = 15
export const LANDING = {
  /** a close attack's windup (melee, dash) keeps following the held aim until it releases (false: locked on press) */
  track: true,
  /** the hitbox reaches this much past the drawn arc's edge, px */
  padPx: 6,
  /** ...and this much wider on each side, binary degrees (256 = a full turn) */
  padArc: 4,
  /** the step-in bends toward a foe within this many binary degrees of the aim (MELEE_STEP_MAGNET_DEG; 0 = off) */
  magnet: Math.round((MELEE_STEP_MAGNET_DEG * 256) / 360),
}

// ------------------------------------------------------------------ tuning (melee only)
/** the default live ticks of a strike (its hitbox tests every tick until it connects) */
export const ACTIVE = 3
/** ticks between a string's strikes when the style names none */
export const EVERY = 6
/** a tap's flinch, ticks */
export const TAP_FLINCH = 10
/** after a flinch ends, new flinches are ignored this long (no stunlock)... */
export const FLINCH_GUARD = 30
/** ...except a string's taps, which may flinch again once this much of the guard has passed (the foe always gets
 * this long free between flinches: time to roll or strike back) */
export const TAP_GUARD = 12
/** the most a single flinch may be, ticks */
export const FLINCH_MAX = 36
/** the most ticks a fighter can be kept flinched in a row (taps chaining, a hold, a splat) */
export const FLINCH_CHAIN = 48
/** a fighter flinched this many ticks in a row is a stunlock (the tournament flags it; FLINCH_CHAIN keeps it at 0) */
export const STUNLOCK_TICKS = 60
/** a strong melee knockback (px) that runs into a wall splats: extra damage and a flinch */
export const SPLAT_MIN_PX = 100
export const SPLAT_DAMAGE = 10
export const SPLAT_FLINCH = 20
/** a counter's parry window, ticks */
export const PARRY_TICKS = 18
/** the attacker a parry blocks is flinched (and its windup broken) this long */
export const RIPOSTE_FLINCH = 16
/** holds: a bite latches, a grab drags, a throw holds before it hurls */
export const BITE_HOLD = 24
export const GRAB_HOLD = 36
export const THROW_HOLD = 20
/** a bite's gnaw when it lets go, damage */
export const GNAW_DAMAGE = 10
/** a throw's distance when the card's knockback is less, px */
export const THROW_PX = 180
/** a body blow's bounce back off the foe, px */
export const BONK_PX = 44
/** a swoop's turn, binary degrees a tick */
export const SWOOP_TURN = 3
/** Grass melee: a hit with no knockback reels the foe in this far, px */
export const VINE_PULL_PX = 24
/** Psychic melee: a telekinetic shove, this much more reach and this push, px */
export const PSY_REACH = 40
export const PSY_PUSH = 60
/** Dragon melee: this much wider, binary degrees */
export const DRAGON_ARC = 32
/** Lightning melee: every hit flinches at least this long (a static flicker) */
export const STATIC_FLINCH = 6
/** Metal melee: knockback x this, permille */
export const METAL_KNOCK = 1250
/** Darkness melee: a backstab flinches this long and breaks the windup */
export const BACKSTAB_FLINCH = 12

// ------------------------------------------------------------------ styles by name
export const STYLES = [
  'jab', 'punch', 'uppercut', 'kick', 'slash', 'chop', 'thrust', 'bite', 'grab', 'throw', 'counter', 'flurry', 'whip',
  'tail', 'spin', 'headbutt', 'strike', 'smash', 'tackle', 'charge', 'swoop', 'slam', 'stomp', 'burrow', 'fly', 'quick',
  'roll',
] as const
export type MeleeStyle = (typeof STYLES)[number]

/** what each style does, for the explainer and docs */
export const STYLE_WHAT: Record<MeleeStyle, string> = {
  jab: 'a quick 1-2: a tap, then the hit',
  punch: 'a punch string; the last punch lands the damage',
  uppercut: 'a launcher: the foe is popped up and reeling',
  kick: 'an arcing sweep that knocks the foe sideways',
  slash: 'a wide slash with a trail',
  chop: "an overhead chop that breaks the foe's windup",
  thrust: 'a fast narrow stab with a long step-in',
  bite: 'a snapping lunge that latches on and gnaws',
  grab: 'a grab that holds the foe and drags it',
  throw: 'grab, then throw the foe where you aim',
  counter: 'a parry: block the next close hit and strike back',
  flurry: 'a flurry of blows; the last lands the damage',
  whip: 'a long lash that reels the foe in',
  tail: 'a wide tail sweep that knocks the foe sideways',
  spin: 'spins, hitting all around twice',
  headbutt: "a short bonk that breaks the foe's windup",
  strike: 'a clean strike with a step-in',
  smash: 'an overhead smash that staggers',
  tackle: 'a body blow that bounces you back off the foe',
  charge: 'a charge that plows through',
  swoop: 'a curving swoop',
  slam: 'a leap that lands in a shockwave',
  stomp: 'a hop that stomps a ring where you land',
  burrow: 'digs under, then bursts up where you aim',
  fly: 'flies up out of reach, then dives',
  quick: 'a blink-fast dash',
  roll: 'a rolling run',
}

const MELEE_NAMES: [MeleeStyle, RegExp][] = [
  ['counter', /counter|revenge|retaliat|payback|avenge|rally back|mirror coat|vengeance/],
  ['throw', /toss|throw|submission|shakedown|suplex|knock away|fend off|^shove$|^strength$|slam down|seismic|judo|flip over/],
  ['grab', /grab|\bbind|\bwrap|vise|vice grip|clamp|squeeze|constrict|pincer|\bgrip\b|\bhug\b|clutch|lock up|big hand|impound|\bcoil|crush grip|pinch/],
  ['bite', /bite|fang|chomp|crunch|gnaw|\bjaws?\b|nibble|incisor|munch|\bnom\b|glutton|devour|\bnip\b/],
  ['slam', /body slam|heavy impact/],
  ['strike', /double-edge|take down/],
  ['kick', /kick|sweep the leg|\bsweep\b|\btrip\b/],
  ['flurry', /fury|double|triple|barrage|flurry|rapid|multi|frenzy|beat up|combo|swipes|scar strikes|pika chain|twin|dual/],
  ['uppercut', /uppercut|rising|sky ?upper/],
  ['chop', /chop|guillotine/],
  ['punch', /punch|\bfists?\b|knuckle|lariat|hammer arm|big bang arm|aura strike|clean hit|\bjab\b/],
  ['jab', /^pound$|slap|smack|^hit$|^beat$|whack|knock|nuzzle|\bpat\b|\bpoke\b|\btap\b|swat/],
  ['headbutt', /headbutt|head ?bolt|hard head|iron head|skull|head smash|zen head/],
  ['whip', /whip|\blash|vine|tongue|tentacle|\blick\b/],
  ['tail', /tail|\bslam\b/],
  ['spin', /spin|thrash|flail|whirl|twirl|swing around|rampage/],
  ['thrust', /horn|peck|drill|beak|sting|pierce|piercing|spear|lance|thrust|needle|joust|pluck|\bpike\b|\bstab/],
  ['slash', /slash|claw|\bcut|scratch|swipe|rake|scythe|shred|rend\b|talon|cleave|blade|sword|edge|slice|scissor|cross|cutter|\baxe|scrape|maul|tear|sabre|saber/],
]
const DASH_NAMES: [MeleeStyle, RegExp][] = [
  ['headbutt', /headbutt|head ?bolt|hard head|iron head|skull|head smash|zen head/],
  ['swoop', /wing|swoop|aerial|glide|\bair\b|brave bird|flap|feather|sky attack/],
  ['roll', /roll|gyro|wheel|tumble|spin/],
  ['tackle', /treasure rush|body blow|tackle$/],
  ['charge', /take down|double-edge|giga impact|charge|rush|\bbull|stampede|wild|volt|impact|rage|rampage|raid|assault|nitro|\bjet\b|return|riptide|waterfall|flare|blitz|megahorn|horn|drive|crash|reckless|outrage|train|gallop/],
  ['tackle', /tackle|\bram\b|bump|spark|body blow|shove|treasure|\bblow\b|lunge/],
]
const SMASH_NAMES = /hammer|crush|smash|pound|press|pulverize|whap|beatdown|shatter|collapse|club|bash/

const nm = (name: string) => name.toLowerCase().replace(/[’`]/g, "'").replace(/[-\s]?gx$/, '').replace(/\s+/g, ' ').trim()
const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)))
const numOf = (sh: Shape, k: string, d: number) => (typeof sh[k] === 'number' ? (sh[k] as number) : d)
const has = (list: readonly Effect[], op: string) => list.some((e) => e.op === op)

/** is this a style name */
export function isStyle(v: unknown): v is MeleeStyle {
  return typeof v === 'string' && (STYLES as readonly string[]).includes(v)
}

/** the melee style for an attack by its name and resolved shape (null: not a close-range attack). A shape may name
 * its style by hand (`style`) */
export function meleeStyleFor(name: string, sh: Shape): MeleeStyle | null {
  if (isStyle(sh.style)) return sh.style
  const n = nm(name)
  if (sh.kind === 'melee') {
    for (const [st, re] of MELEE_NAMES) if (re.test(n)) return st
    return 'strike'
  }
  if (sh.kind === 'dash') {
    if (sh.path === 'leap') {
      if (/\bdig\b|burrow|underground|tunnel|\bdive\b|mole|drill run/.test(n)) return 'burrow'
      if (/body slam|heavy impact|slam|press|crash|impact|drop|pound|stomp|trample|crush|quake/.test(n)) return 'slam'
      return 'fly'
    }
    if (sh.invulnerable !== 0 && numOf(sh, 'speed', 0) >= 24) return 'quick'
    for (const [st, re] of DASH_NAMES) if (re.test(n)) return st
    return numOf(sh, 'distance', 200) >= 240 ? 'charge' : 'tackle'
  }
  if (sh.kind === 'area' && sh.at === 'self' && /stomp|trample/.test(n)) return 'stomp'
  if (sh.kind === 'area' && sh.at === 'aim' && numOf(sh, 'range', 300) <= 110 && SMASH_NAMES.test(n)) return 'smash'
  return null
}

/** how many coins an effect list flips (a flurry's strikes), 0 when none */
function coinsIn(list: readonly Effect[]): number {
  for (const e of list) {
    if (e.op === 'coins' && typeof e.count === 'number') return e.count as number
    if (e.op === 'coinsUntilTails') return 4
  }
  return 0
}

/** is an attack a close one (a melee swing or a body dash) for the parry and the hit feel */
export function closeHit(atk: ResolvedAttack): boolean {
  return atk.shape.kind === 'melee' || atk.shape.kind === 'dash'
}

/** the attack with its melee style applied (a new object; `a` is not changed). `typed`: also the per-type melee
 * flavour (off when the kit or the attack opts out of the type flavours). Data only: the sim reads the shape params
 * (`style`, `strikes`, `every`, `active`, `flinch`, `interrupt`, `hold`, `throw`, `gnaw`, `parry`, `bonk`, `turn`,
 * `sideways`, `backstab`, `burnarc`, ...) */
export function applyMelee(a: ResolvedAttack, typed = true): ResolvedAttack {
  const style = meleeStyleFor(a.name, a.shape)
  if (!style) return a
  let sh: Shape = { ...a.shape, style }
  let onHit = a.onHit
  let windup = a.windup
  const traits = [...(a.traits ?? [])]
  const n = nm(a.name)
  const d = a.baseDamage, c = a.cost.length
  const heavy = c >= 3 || d >= 60
  const set = (k: string, v: number) => { sh[k] = v }
  const cap = (op: string, px: number) => { onHit = onHit.map((e) => (e.op === op && typeof e.px === 'number' ? { ...e, px: Math.min(e.px as number, px) } : e)) }
  switch (style) {
    case 'jab': set('strikes', 2); set('every', 6); break
    case 'punch':
      if (c <= 2 && d < 60) { set('strikes', 3); set('every', 6) } else { set('flinch', 16); set('interrupt', 1); windup += 3 }
      break
    case 'uppercut': set('flinch', 24); set('interrupt', 1); set('lift', 1); cap('knockback', 60); break
    case 'kick':
      set('sideways', 1)
      if (/double|twin/.test(n)) { set('strikes', 2); set('every', 7) } else if (/triple/.test(n)) { set('strikes', 3); set('every', 7) }
      set('flinch', /low|sweep|trip/.test(n) ? 14 : 8)
      break
    case 'slash':
      if (/claw|scratch|swipe|rake|talon|maul|scrape/.test(n)) set('claw', 1)
      if (/blade|sword|edge|cleave|axe|cutter|guillotine|sabre|saber/.test(n)) { set('blade', 1); set('active', 4) }
      if (heavy) set('flinch', 8)
      break
    case 'chop': set('flinch', 14); set('interrupt', 1); set('active', 4); set('arc', Math.max(48, numOf(sh, 'arc', 64))); break
    case 'thrust':
      set('active', 4); set('arc', Math.max(32, numOf(sh, 'arc', 64)))
      if (/peck|pluck/.test(n)) { set('strikes', 2); set('every', 5) }
      break
    case 'bite': set('hold', BITE_HOLD); if (c >= 2) set('gnaw', GNAW_DAMAGE); break
    case 'grab': set('hold', GRAB_HOLD); cap('pull', 0); onHit = onHit.filter((e) => e.op !== 'pull'); break
    case 'throw': set('hold', THROW_HOLD); set('throw', 1); break
    case 'counter': set('parry', PARRY_TICKS); break
    case 'flurry': {
      const k = coinsIn(onHit) || coinsIn(a.onCast)
      set('strikes', cl(k || (/triple/.test(n) ? 3 : /double|twin|dual/.test(n) ? 2 : 4), 2, 5))
      set('every', 5)
      break
    }
    case 'whip': set('active', 4); break
    case 'tail': set('sideways', 1); set('flinch', 8); break
    case 'spin': set('strikes', 2); set('every', 8); break
    case 'headbutt': set('flinch', 12); set('interrupt', 1); if (sh.kind === 'dash') set('bonk', 1); break
    case 'strike': break
    case 'smash': set('flinch', 12); break
    case 'tackle': set('bonk', 1); set('flinch', 6); break
    case 'charge': set('flinch', cl(8 + d / 12, 8, 16)); break
    case 'swoop': set('turn', SWOOP_TURN); set('flinch', 6); break
    case 'slam':
      if (sh.kind === 'melee') {
        // a Body Slam in melee reach: the lunge becomes a short leap that lands in a shockwave where the swing was
        const reach = numOf(sh, 'range', 80) + numOf(sh, 'lunge', 0)
        sh = { kind: 'dash', distance: cl(reach * 0.75, 60, 160), speed: 12, radius: 28, path: 'leap', blast: cl(numOf(sh, 'range', 80) * 0.9, 64, 110), style }
      }
      set('flinch', 12)
      break
    case 'burrow': set('flinch', 8); break
    case 'fly': set('flinch', 6); break
    case 'roll': break
    case 'quick': break
    case 'stomp': {
      // a hop into a small ring where it lands: the lexicon's quake at your feet becomes a short leap
      const r = numOf(sh, 'radius', 110)
      sh = { kind: 'dash', distance: 70, speed: 10, radius: 28, path: 'leap', blast: cl((r * 3) / 4, 70, 110), style, flinch: 8 }
      break
    }
  }
  // ---------------------------------------------------------------- per-type melee flavour (docs/MELEE.md 3.4)
  if (typed) {
    const contact = sh.kind === 'melee' || sh.kind === 'dash'
    const swing = sh.kind === 'melee'
    switch (a.element) {
      case 'Fighting':
        // combos and armour: one more tap on a string; the windup's armour lasts through the live frames
        if (numOf(sh, 'strikes', 1) > 1) set('strikes', Math.min(5, numOf(sh, 'strikes', 1) + 1))
        break
      case 'Fire':
        if (swing) set('burnarc', 1)
        break
      case 'Lightning':
        if (contact) set('flinch', Math.max(STATIC_FLINCH, numOf(sh, 'flinch', 0)))
        break
      case 'Grass':
        if (contact && !has(onHit, 'knockback') && !has(onHit, 'pull')) onHit = [...onHit, { op: 'pull', px: VINE_PULL_PX }]
        break
      case 'Psychic':
        if (swing && style !== 'counter') {
          set('range', numOf(sh, 'range', 64) + PSY_REACH); set('lunge', 0); set('psy', 1)
          if (!has(onHit, 'knockback') && !has(onHit, 'pull') && !numOf(sh, 'hold', 0)) onHit = [...onHit, { op: 'knockback', px: PSY_PUSH }]
        }
        break
      case 'Darkness': if (contact) set('backstab', 1); break
      case 'Metal':
        if (contact) {
          if (!traits.includes('armor')) traits.push('armor')
          onHit = onHit.map((e) => (e.op === 'knockback' ? { ...e, px: Math.min(600, Math.trunc(((e.px as number) * METAL_KNOCK) / 1000)) } : e))
        }
        break
      case 'Dragon': if (swing) set('arc', Math.min(255, numOf(sh, 'arc', 64) + DRAGON_ARC)); break
      case 'Colorless': if (swing) set('active', numOf(sh, 'active', ACTIVE) + 1); break
      default: break
    }
  }
  return { ...a, shape: sh, onHit, windup, traits }
}

// ------------------------------------------------------------------ flinch
/** flinch player p for `ticks` (no walking, no attack start, no dodge; knockback still moves it); `interrupt` also
 * cancels a windup (its energy stays spent unless FLINCH_REFUND). Armour (a Fighting / Metal windup, a live
 * armoured swing) shrugs it off; a fighter just out of a flinch is immune for FLINCH_GUARD; a flinch never runs past
 * FLINCH_CHAIN ticks in a row. True if it took */
export function flinch(def: MatchDef, s: SimState, p: number, ticks: number, interrupt = false, tap = false): boolean {
  const f = onField(s, p)
  const kit = kitOf(def, s, p)
  if (!f || !kit || f.invuln > 0 || ticks <= 0) return false
  if (armored(kit, f)) return false
  const cur = f.flinch ?? 0
  if (cur === 0 && (f.flinchGuard ?? 0) > (tap ? FLINCH_GUARD - TAP_GUARD : 0)) return false
  const room = FLINCH_CHAIN - (f.flinchRun ?? 0)
  const next = Math.min(FLINCH_MAX, Math.max(cur, ticks), room)
  if (next <= cur && !(interrupt && f.cast && cur > 0)) return cur > 0
  f.flinch = Math.max(cur, next)
  let broke = 0
  if (interrupt && f.cast) {
    const atk = kit.attacks[f.cast.attack]
    if (FLINCH_REFUND && atk) s.players[p].pips[0] = Math.min(ENERGY_CAP, (s.players[p].pips[0] ?? 0) + costPips(atk.cost))
    f.cast = null
    broke = 1
    s.events.push({ k: 'fizzle', p, why: 'flinched' })
  }
  s.events.push({ k: 'flinch', p, ticks: f.flinch, interrupt: broke })
  return true
}

/** a tick of the melee counters on a fighter (step.decay): the flinch (the guard starts when it ends), the parry
 * window, a live swing's armour */
export function decayMelee(f: { flinch?: number; flinchGuard?: number; flinchRun?: number; parry?: number; armor?: number }): void {
  if (f.flinch) {
    f.flinchRun = (f.flinchRun ?? 0) + 1
    if (--f.flinch === 0) { f.flinchGuard = FLINCH_GUARD; f.flinchRun = 0 }
  } else if (f.flinchGuard) f.flinchGuard--
  if (f.parry) f.parry--
  if (f.armor) f.armor--
}

/** is the fighter flinched (can't walk, start an attack or dodge) */
export function flinched(f: { flinch?: number }): boolean {
  return (f.flinch ?? 0) > 0
}

// ------------------------------------------------------------------ after a hit (every styled attack, from shapes.hit)
function rot(vx: number, vy: number, a: number): [number, number] {
  const c = icos(a), sn = isin(a)
  return [idiv(vx * c - vy * sn, ONE), idiv(vx * sn + vy * c, ONE)]
}

/** the style's extras once a hit (a finisher, a dash's blow, a landing) landed: flinch / interrupt, a sideways
 * sweep, the splat mark on a strong knock, a backstab. `knock0`: the target's knock before the hit's effects ran
 * (a different one is this hit's) */
export function afterHit(def: MatchDef, s: SimState, cast: CastInfo, target: number, atk: ResolvedAttack, knock0: unknown): void {
  const tf = onField(s, target)
  const cf = onField(s, cast.player)
  if (!tf) return
  const sh = atk.shape
  const k = tf.knock && tf.knock !== knock0 ? tf.knock : null
  if (k && sh.sideways) {
    // the sweep carries the foe along it: the knock turns 45° with the sweep
    ;[k.vx, k.vy] = rot(k.vx, k.vy, 32)
  }
  if (k && idiv(ilen(k.vx, k.vy) * k.t, FP) >= SPLAT_MIN_PX) k.src = cast.player
  let fl = numOf(sh, 'flinch', 0)
  let intr = !!sh.interrupt
  if (sh.backstab && cf && (behind(tf, cf) || tf.cast !== null)) {
    fl = Math.max(fl, BACKSTAB_FLINCH); intr = true
    s.events.push({ k: 'strike', p: cast.player, t: target, x: tf.x, y: tf.y, fin: 1, style: 'backstab' })
  }
  if (fl > 0) flinch(def, s, target, fl, intr)
}

// ------------------------------------------------------------------ parry
/** a hit on a parrying fighter is blocked: no damage, the attacker flinched, the counter fires at it (the riposte).
 * Only close hits unless PARRY_BLOCKS_RANGED. True if blocked */
export function parried(def: MatchDef, s: SimState, cast: CastInfo, target: number, atk: ResolvedAttack | null): boolean {
  const tf = onField(s, target)
  if (!tf || !(tf.parry ?? 0) || cast.player === target) return false
  if (!PARRY_BLOCKS_RANGED && !(atk && closeHit(atk))) return false
  tf.parry = 0
  // "if this Pokémon was damaged by an attack last turn": a blocked blow counts, so a Counter's bonus rides the riposte
  tf.hurtAt = s.tick
  const af = onField(s, cast.player)
  s.events.push({ k: 'parry', p: target, by: cast.player, x: tf.x, y: tf.y })
  const w = s.swings.find((x) => x.owner === target && x.wait > 0)
  if (w) {
    if (af) { w.aim = iatan2(af.y - tf.y, af.x - tf.x) & 255; tf.aim = w.aim }
    w.wait = 0
    w.live = w.active
    w.ln = 0
  }
  if (af) {
    af.dash = null // a blocked charge stops dead
    flinch(def, s, cast.player, RIPOSTE_FLINCH, true)
  }
  return true
}

// ------------------------------------------------------------------ the live swing
/** a swing that is only drawn (a cone's): already finished */
export function drawnSwing(s: SimState, p: number, ai: number, x: number, y: number, aim: number, range: number, arc: number): Swing {
  return {
    id: s.nextId++, owner: p, attack: ai, x, y, aim, range, arc, t: 10, dur: 10, age: 0, live: -1, active: 0, strike: 0,
    strikes: 1, every: 0, next: 0, wait: 0, lx: 0, ly: 0, ln: 0, hit: [], landed: 0, held: -1, hold: 0, bonus: 0, sx: x, sy: y,
  }
}

/** the step-in's heading this tick: the swing's aim, bent (LANDING.magnet, at most that much) toward the foe nearest
 * the aim line within the swing's reach. The arc itself stays on the aim */
function stepHeading(s: SimState, p: number, aim: number, reachPx: number, foes: readonly number[]): number {
  const m = LANDING.magnet
  if (m <= 0) return aim
  const f = s.players[p].fighter
  let best = 0, bestOff = m + 1
  for (const e of foes) {
    const ef = s.players[e].fighter
    if (ef.invuln > 0) continue
    const dx = ef.x - f.x, dy = ef.y - f.y
    if (ilen(dx, dy) > (reachPx + ef.r) * FP) continue
    const off = wrapAngle(iatan2(dy, dx) - aim + 128) - 128
    if (Math.abs(off) < Math.abs(bestOff)) { bestOff = off; best = off }
  }
  return Math.abs(bestOff) <= m ? wrapAngle(aim + best) : aim
}

/** a new live swing from a released melee attack (shapes.release), aimed along the fighter's aim (`foes`: for the
 * step-in's magnetism) */
export function newSwing(s: SimState, p: number, ai: number, atk: ResolvedAttack, bonus: number, foes: readonly number[] = []): Swing {
  const f = s.players[p].fighter
  const sh = atk.shape
  void foes
  const active = Math.max(1, numOf(sh, 'active', ACTIVE))
  const strikes = Math.max(1, Math.min(5, numOf(sh, 'strikes', 1)))
  const every = Math.max(active + 1, numOf(sh, 'every', EVERY))
  const lunge = numOf(sh, 'lunge', 0)
  const wait = numOf(sh, 'parry', 0)
  if (wait > 0) f.parry = wait
  // the step-in: motion over the first strike's live ticks (a string walks forward a little more per strike)
  const ln = lunge > 0 ? active : 0
  const per = ln ? idiv(lunge * FP, ln) : 0
  const hold = numOf(sh, 'hold', 0)
  const dur = wait + (strikes - 1) * every + active + hold + 12
  return {
    id: s.nextId++, owner: p, attack: ai, x: f.x, y: f.y, aim: f.aim,
    range: numOf(sh, 'range', 64), arc: numOf(sh, 'arc', 64), t: dur, dur, age: 0,
    active, live: wait > 0 ? 0 : active, strike: 0, strikes, every, next: every, wait,
    lx: idiv(icos(f.aim) * per, ONE), ly: idiv(isin(f.aim) * per, ONE), ln: wait > 0 ? 0 : ln,
    hit: [], landed: 0, held: -1, hold: 0, bonus, sx: f.x, sy: f.y,
  }
}

/** is (px, py) within the arc from (x, y) facing aim (range px, arc binary degrees; padPx widens the range) */
export function inArc(x: number, y: number, aim: number, rangePx: number, arc: number, px: number, py: number, padPx: number): boolean {
  const dx = px - x, dy = py - y
  const L = ilen(dx, dy)
  if (L > (rangePx + padPx) * FP) return false
  if (L <= padPx * FP) return true
  if (arc >= 255) return true
  const dot = dx * icos(aim) + dy * isin(aim)
  return dot >= L * icos(idiv(arc, 2))
}

/** what advanceSwings needs from shapes.ts (passed in: shapes imports this file) */
export interface SwingHooks {
  /** runs the attack's onHit on the target (shapes.hit: the parry check, onHit, afterHit) */
  hit(def: MatchDef, s: SimState, cast: CastInfo, target: number, x: number, y: number): void
  /** the terrain / props / impact of a finisher's swing, at the attacker (shapes: props, reactions, onImpact) */
  land(def: MatchDef, s: SimState, cast: CastInfo, atk: ResolvedAttack, w: Swing): void
  move(s: SimState, p: number, dx: number, dy: number): void
  enemies(s: SimState, p: number): number[]
  attackOf(def: MatchDef, s: SimState, p: number, i: number): ResolvedAttack | null
}

/** a plain context to deal melee damage outside onHit (a gnaw, a split string's tap) */
function ctxFor(def: MatchDef, s: SimState, cast: CastInfo, target: number): EffectCtx {
  const tf = s.players[target].fighter
  return { def, s, caster: cast.player, target, x: tf.x, y: tf.y, cast, run: () => {} }
}

/** the knock's length in px (0 for none) */
function knockPx(k: { vx: number; vy: number; t: number } | null): number {
  return k ? idiv(ilen(k.vx, k.vy) * k.t, FP) : 0
}

/** advance every swing one tick: the step-in, the strikes' hitboxes (taps, the finisher), holds and throws, the
 * parry window. Swings past their drawing time are dropped */
export function advanceSwings(def: MatchDef, s: SimState, h: SwingHooks): void {
  const keep: Swing[] = []
  for (const w of s.swings) {
    w.t--
    w.age++
    // a finished swing (or a cone's, which is only drawn) fades out
    if (w.live < 0) { if (w.t > 0) keep.push(w); continue }
    const atk = h.attackOf(def, s, w.owner, w.attack)
    const f = onField(s, w.owner)
    if (!atk || !f) { w.live = -1; w.held = -1; w.t = Math.min(w.t, 10); if (w.t > 0) keep.push(w); continue }
    const sh = atk.shape
    const cast: CastInfo = { player: w.owner, attack: w.attack, element: atk.element, bonus: w.bonus }
    if (w.wait > 0) {
      // a counter's parry window: if nothing hit it (parried() ends it), it swings at the end anyway
      if (--w.wait === 0) { w.live = w.active; f.parry = 0 }
      w.x = f.x; w.y = f.y
      keep.push(w)
      continue
    }
    if (w.ln > 0) {
      // the step-in, bent a little toward the foe it is aimed at (LANDING.magnet)
      const hd = stepHeading(s, w.owner, w.aim, w.range + numOf(sh, 'lunge', 0), h.enemies(s, w.owner))
      const per = ilen(w.lx, w.ly)
      h.move(s, w.owner, hd === w.aim ? w.lx : idiv(icos(hd) * per, ONE), hd === w.aim ? w.ly : idiv(isin(hd) * per, ONE))
      w.ln--
    }
    w.x = f.x; w.y = f.y
    // a Fighting / Metal swing keeps its windup's armour through the live frames
    if (atk.traits?.includes('armor') && (w.live > 0 || w.held >= 0)) f.armor = Math.max(f.armor ?? 0, 2)
    if (w.live > 0) {
      const fin = w.strike === w.strikes - 1
      if (fin && w.live === w.active) h.land(def, s, cast, atk, w)
      w.live--
      for (const e of h.enemies(s, w.owner)) {
        if (w.hit.includes(e)) continue
        const ef = s.players[e].fighter
        if (ef.invuln > 0) continue
        if (!inArc(f.x, f.y, w.aim, w.range + LANDING.padPx, Math.min(255, w.arc + 2 * LANDING.padArc), ef.x, ef.y, ef.r)) continue
        w.hit.push(e)
        w.landed++
        if (!fin) {
          // a tap: a spark, a flinch, no card damage (unless STRING_SPLIT)
          if (!parried(def, s, cast, e, atk)) {
            s.events.push({ k: 'strike', p: w.owner, t: e, x: ef.x, y: ef.y, fin: 0, style: String(sh.style ?? '') })
            if (STRING_SPLIT && atk.baseDamage > 0) {
              const part = Math.trunc(atk.baseDamage / w.strikes)
              attackDamage(ctxFor(def, s, { ...cast, bonus: 0 }, e), part)
              w.bonus -= part
            }
            flinch(def, s, e, TAP_FLINCH, false, true)
          }
          continue
        }
        s.events.push({ k: 'strike', p: w.owner, t: e, x: ef.x, y: ef.y, fin: 1, style: String(sh.style ?? '') })
        const hold = numOf(sh, 'hold', 0)
        if (hold > 0 && !(ef.parry ?? 0)) {
          // a bite / grab / throw: the foe is held at the attacker's front (a throw's damage comes at the throw)
          if (!sh.throw) h.hit(def, s, { ...cast, bonus: w.bonus }, e, ef.x, ef.y)
          const g = onField(s, e)
          if (g && flinch(def, s, e, Math.min(FLINCH_MAX, hold + 2))) { g.knock = null; w.held = e; w.hold = hold }
          else if (g && sh.throw) h.hit(def, s, { ...cast, bonus: w.bonus }, e, ef.x, ef.y) // armour or the guard: no grip, a plain hit
        } else h.hit(def, s, { ...cast, bonus: w.bonus }, e, ef.x, ef.y)
      }
    }
    // the next strike of a string, `every` ticks after the last one started: a fresh hitbox and a little more step-in
    if (w.strike < w.strikes - 1 && --w.next <= 0 && w.live === 0) {
      w.strike++
      w.hit = []
      w.live = w.active
      w.next = w.every
      const step = idiv(numOf(sh, 'lunge', 0) * FP, 3 * Math.max(1, w.active))
      if (step > 0) { w.lx = idiv(icos(w.aim) * step, ONE); w.ly = idiv(isin(w.aim) * step, ONE); w.ln = w.active }
    }
    // a hold: the foe stays at the attacker's front (the attacker may walk and turn in its recovery, dragging it)
    if (w.held >= 0) {
      const g = onField(s, w.held)
      if (!g || g.invuln > 0) { w.held = -1; w.hold = 0 }
      else {
        const dd = (f.r + g.r + 2) * FP
        const tx = f.x + idiv(icos(f.aim) * dd, ONE), ty = f.y + idiv(isin(f.aim) * dd, ONE)
        h.move(s, w.held, tx - g.x, ty - g.y)
        g.flinch = Math.max(g.flinch ?? 0, 2)
        if (--w.hold <= 0) {
          const e = w.held
          w.held = -1
          if (sh.throw) {
            // the throw: the card's hit, then the foe flies along the thrower's aim (at least THROW_PX)
            const k0 = g.knock
            h.hit(def, s, { ...cast, bonus: w.bonus }, e, g.x, g.y)
            const px = Math.max(THROW_PX, g.knock && g.knock !== k0 ? knockPx(g.knock) : 0)
            const kit = kitOf(def, s, e)
            const gg = onField(s, e)
            if (gg && !kit?.move?.noKnockback) {
              const dir = THROW_AIMED ? f.aim : wrapAngle(f.aim + 128)
              shove(s, e, gg.x - idiv(icos(dir) * FP, ONE), gg.y - idiv(isin(dir) * FP, ONE), Math.min(600, px), 12)
              if (gg.knock) gg.knock.src = w.owner
            }
            s.events.push({ k: 'throw', p: w.owner, t: e, x: g.x, y: g.y })
          } else {
            // a bite lets go with a gnaw; a grab lets go with a shove
            const gnaw = numOf(sh, 'gnaw', 0)
            if (gnaw > 0) attackDamage(ctxFor(def, s, { ...cast, bonus: 0 }, e), gnaw)
            if (onField(s, e)) shove(s, e, f.x, f.y, 40, 6)
          }
        }
      }
    }
    const done = w.live === 0 && w.strike >= w.strikes - 1 && w.held < 0 && w.wait === 0 && w.ln === 0
    if (done) {
      if (w.landed === 0) s.events.push({ k: 'whiff', p: w.owner, x: f.x + idiv(icos(w.aim) * w.range * FP, ONE), y: f.y + idiv(isin(w.aim) * w.range * FP, ONE) })
      w.live = -1
      w.t = Math.min(w.t, 10)
    }
    if (w.t > 0 || !done) keep.push(w)
  }
  s.swings = keep
}

/** player p left the field (a swap, an evolution, a KO): its swings end, and whoever holds it lets go */
export function dropSwings(s: SimState, p: number): void {
  s.swings = s.swings.filter((w) => w.owner !== p)
  for (const w of s.swings) if (w.held === p) { w.held = -1; w.hold = 0 }
}

/** is player p holding someone (a grab, a bite, a throw) */
export function holding(s: SimState, p: number): number {
  const w = s.swings.find((x) => x.owner === p && x.held >= 0)
  return w ? w.held : -1
}

/** is player p committed to a swing (its strikes or a parry window still to come): it can't walk meanwhile (the
 * step-in moves it). A hold is not: the holder walks and drags */
export function swinging(s: SimState, p: number): boolean {
  return s.swings.some((w) => w.owner === p && w.live >= 0 && w.held < 0 && (w.live > 0 || w.wait > 0 || w.strike < w.strikes - 1 || w.ln > 0))
}

/** a live swing of player p (its hitbox, a hold or a parry window still going), else null */
export function liveSwing(s: SimState, p: number): Swing | null {
  return s.swings.find((x) => x.owner === p && x.live >= 0) ?? null
}

/** the splat: a strong melee knock that ran into a wall (step.movement calls it when the knock stops short) */
export function splat(def: MatchDef, s: SimState, p: number, src: number): void {
  const f = onField(s, p)
  if (!f) return
  f.knock = null
  s.events.push({ k: 'splat', p, by: src, x: f.x, y: f.y })
  hurt(s, p, SPLAT_DAMAGE, 0, '', src)
  flinch(def, s, p, SPLAT_FLINCH)
}

/** a body blow's hit (shapes.advanceDash): the dash stops on the foe and bounces back off it */
export function dashBonk(s: SimState, p: number, ex: number, ey: number): void {
  const f = onField(s, p)
  if (!f) return
  f.dash = null
  const inv = f.invuln
  f.invuln = 0
  shove(s, p, ex, ey, BONK_PX, 8)
  f.invuln = inv
}

/** a swoop's first heading: it turns `turn` binary degrees a tick for `t` ticks, so it starts that much the other
 * way and its chord still points along the aim */
export function swoopStart(aim: number, turn: number, t: number): number {
  return wrapAngle(aim - idiv(turn * t, 2))
}

/** turn a dash's velocity by `a` binary degrees */
export function turnVel(d: { vx: number; vy: number }, a: number): void {
  ;[d.vx, d.vy] = rot(d.vx, d.vy, a)
}
