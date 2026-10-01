// The tokens of src/theme.css (binder shapes, the arena's dark navy and gold; one theme) as plain strings for the
// canvas HUD, which can't use CSS variables. Read once and cached.
/** the canvas's view of the tokens */
export interface Tokens {
  ink: string
  inkSoft: string
  paper: string
  paper2: string
  paperEdge: string
  pocketLine: string
  chip: string
  chipLine: string
  cover: string
  cover2: string
  me: string
  foe: string
  good: string
  tabYellow: string
  tabYellowInk: string
  tabBlue: string
  tabBlueInk: string
  tabRed: string
  tabRedInk: string
  hpHi: string
  hpMid: string
  hpLo: string
  gold: string
  gold2: string
  goldInk: string
  modalBg: string
  dark: boolean
}

export const FONT_ROUND = 'Fredoka, "Segoe UI", system-ui, sans-serif'
export const FONT_PIX = 'Silkscreen, "Cascadia Mono", Consolas, monospace'
export const FONT_HAND = 'Caveat, "Segoe Print", "Comic Sans MS", cursive'

const FALLBACK: Tokens = {
  ink: '#eef2ff', inkSoft: 'rgba(238,242,255,.62)', paper: '#121828', paper2: '#1a2238', paperEdge: 'rgba(255,255,255,.12)',
  pocketLine: 'rgba(255,255,255,.13)', chip: 'rgba(255,255,255,.06)', chipLine: 'rgba(255,255,255,.12)', cover: '#161d33', cover2: '#0c1120',
  me: '#78dcff', foe: '#ff7a7a', good: '#7dff9a', tabYellow: '#ffd35a', tabYellowInk: '#1a1405', tabBlue: '#78dcff', tabBlueInk: '#042430',
  tabRed: '#ff7a7a', tabRedInk: '#2a0606', hpHi: '#5ee06a', hpMid: '#f5c542', hpLo: '#f0504a', gold: '#ffd35a', gold2: '#d9901e',
  goldInk: '#1a1405', modalBg: 'rgba(5,8,16,.62)', dark: true,
}

let cached: Tokens | null = null

export function tokens(): Tokens {
  if (cached) return cached
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return FALLBACK
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string, d: string) => cs.getPropertyValue(name).trim() || d
  const f = FALLBACK
  cached = {
    ink: v('--ink', f.ink), inkSoft: v('--ink-soft', f.inkSoft), paper: v('--paper', f.paper), paper2: v('--paper-2', f.paper2),
    paperEdge: v('--paper-edge', f.paperEdge), pocketLine: v('--pocket-line', f.pocketLine), chip: v('--chip', f.chip),
    chipLine: v('--chip-line', f.chipLine), cover: v('--cover', f.cover), cover2: v('--cover-2', f.cover2), me: v('--me', f.me),
    foe: v('--foe', f.foe), good: v('--good', f.good), tabYellow: v('--tab-yellow', f.tabYellow), tabYellowInk: v('--tab-yellow-ink', f.tabYellowInk),
    tabBlue: v('--tab-blue', f.tabBlue), tabBlueInk: v('--tab-blue-ink', f.tabBlueInk), tabRed: v('--tab-red', f.tabRed), tabRedInk: v('--tab-red-ink', f.tabRedInk), hpHi: v('--hp-hi', f.hpHi), hpMid: v('--hp-mid', f.hpMid),
    hpLo: v('--hp-lo', f.hpLo), gold: v('--gold', f.gold), gold2: v('--gold-2', f.gold2), goldInk: v('--gold-ink', f.goldInk),
    modalBg: v('--modal-bg', f.modalBg), dark: true,
  }
  return cached
}
