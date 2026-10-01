// Attack sheets (the user: "a way to understand the X+ attacks"): every attack of a card with its cost, its printed
// damage, the card's own text and an "in the arena" line generated from the kit (src/sim/explain.ts). The loadout and
// the reveal show them on hover (and pinned with the ⓘ button); the match draws the same content on the canvas while
// you hold I (src/render/hud.ts).
// The card text comes at runtime from pokeshell's collection (`collection --json`): it is never stored in this repo.
// A card that isn't in your collection (a bot's) has no text here; its arena line still says what it does.
import { explainAttack, type AttackExplained } from '../sim/explain'
import type { FighterKit, ResolvedAttack } from '../sim/types'
import { costHtml, tintStyle } from './loadout'
import type { CollectionCard } from './kits'

/** card id -> attack name -> the card's rules text */
const TEXTS = new Map<string, Map<string, string>>()

/** remember the attack texts of every card in the collection answer (caught or only seen) */
export function rememberCardTexts(cards: readonly CollectionCard[]): void {
  for (const c of cards) {
    const atks = c.data?.attacks
    if (!atks?.length) continue
    const m = new Map<string, string>()
    for (const a of atks) m.set(a.name, a.text ?? '')
    TEXTS.set(c.card, m)
  }
}

/** the card's text for an attack: a string ('' = the card prints no text), or null when the card isn't known */
export function cardText(card: string, attack: string): string | null {
  const m = TEXTS.get(card)
  if (!m) return null
  return m.get(attack) ?? null
}

export interface SheetAttack {
  atk: ResolvedAttack
  text: string | null
  arena: AttackExplained
}

const cache = new WeakMap<ResolvedAttack, AttackExplained>()

/** a kit's attacks with their texts and explanations (explanations cached per attack) */
export function sheetOf(kit: FighterKit): SheetAttack[] {
  return kit.attacks.map((atk) => {
    let arena = cache.get(atk)
    if (!arena) { arena = explainAttack(atk); cache.set(atk, arena) }
    return { atk, text: cardText(kit.card, atk.name), arena }
  })
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** the printed damage, with the X+ / X× kind named ("30+" -> "30+ (more by its text)") */
export function damageKind(d: string): string {
  if (/\+$/.test(d)) return 'or more'
  if (/[×x]$/.test(d)) return 'times a count'
  if (/-$/.test(d)) return 'or less'
  return ''
}

/** the sheet of one card, as HTML */
export function sheetHtml(kit: FighterKit, opts: { title?: boolean } = {}): string {
  const rows = sheetOf(kit).map(({ atk, text, arena }) => {
    const kind = damageKind(atk.damage)
    const card = text === null
      ? '<p class="as-text none">card text: not in your binder</p>'
      : text ? `<p class="as-text">${esc(text)}</p>` : '<p class="as-text none">no card text: its printed damage</p>'
    return `<div class="as-atk">
      <div class="as-top">${costHtml(atk.cost)}<b class="as-name">${esc(atk.name)}</b><span class="as-dmg" title="printed damage${kind ? ` (${kind})` : ''}">${esc(atk.damage || '—')}</span></div>
      ${card}
      <div class="as-arena"><span class="as-k">IN THE ARENA</span>
        <p class="as-shape">${esc(arena.shape)}</p>
        ${arena.does.map((d) => `<p>${esc(d)}</p>`).join('')}
        ${arena.curve ? `<p class="as-curve">${esc(arena.curve)}</p>` : ''}
      </div>
    </div>`
  }).join('')
  const head = opts.title === false ? '' : `<header class="as-head"><b>${esc(kit.name)}</b><span>${kit.hp} HP · ${esc(kit.types.join(' / '))}${kit.weaknesses.length ? ` · weak ${esc(kit.weaknesses.map((w) => `${w.type} ${w.value}`).join(', '))}` : ''}${kit.resistances.length ? ` · resists ${esc(kit.resistances.map((w) => `${w.type} ${w.value}`).join(', '))}` : ''}</span></header>`
  return `<div class="atk-sheet" style="${tintStyle(kit)}">${head}${rows}</div>`
}

// ------------------------------------------------------------------ the hover popover (one, on the body)
let pop: HTMLDivElement | null = null
let pinned: HTMLElement | null = null
let showT = 0

function popEl(): HTMLDivElement {
  if (pop) return pop
  pop = document.createElement('div')
  pop.id = 'atk-pop'
  pop.className = 'atk-pop hidden'
  document.body.appendChild(pop)
  document.addEventListener('mousedown', (e) => {
    if (!pinned || !pop) return
    const t = e.target as HTMLElement
    if (pop.contains(t) || t.closest('.as-info')) return
    pinned = null
    hideSheet()
  })
  return pop
}

function place(el: HTMLElement): void {
  const p = popEl()
  const r = el.getBoundingClientRect()
  p.style.left = '0px'; p.style.top = '0px'
  const w = p.offsetWidth, h = p.offsetHeight
  const vw = window.innerWidth, vh = window.innerHeight
  let x = r.right + 12
  if (x + w > vw - 8) x = r.left - w - 12
  if (x < 8) x = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2))
  let y = Math.min(Math.max(8, r.top), vh - h - 8)
  if (y < 8) y = 8
  p.style.left = `${Math.round(x)}px`; p.style.top = `${Math.round(y)}px`
}

export function showSheet(el: HTMLElement, kit: FighterKit): void {
  const p = popEl()
  p.innerHTML = sheetHtml(kit)
  p.classList.remove('hidden')
  place(el)
}

export function hideSheet(): void {
  window.clearTimeout(showT)
  if (pinned) return
  pop?.classList.add('hidden')
}

/** hide it whatever (a screen change) */
export function closeSheet(): void {
  pinned = null
  hideSheet()
}

/** hover (after a beat) shows the sheet of `[data-sheet]` elements under root; their `.as-info` button pins it */
export function bindSheets(root: HTMLElement, kitOf: (el: HTMLElement) => FighterKit | null | undefined): void {
  root.querySelectorAll<HTMLElement>('[data-sheet]').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      if (pinned) return
      window.clearTimeout(showT)
      showT = window.setTimeout(() => { const k = kitOf(el); if (k) showSheet(el, k) }, 280)
    })
    el.addEventListener('mouseleave', () => hideSheet())
    const info = el.querySelector<HTMLElement>('.as-info')
    if (info) {
      info.addEventListener('mousedown', (e) => e.stopPropagation())
      info.addEventListener('click', (e) => {
        e.stopPropagation()
        e.preventDefault()
        const k = kitOf(el)
        if (!k) return
        if (pinned === el) { pinned = null; hideSheet(); return }
        pinned = null
        showSheet(el, k)
        pinned = el
      })
    }
  })
}

/** the ⓘ button a card carries (pins its attack sheet) */
export const INFO_BTN = '<button class="as-info" title="attack details (hover the card, or click to pin)">i</button>'
