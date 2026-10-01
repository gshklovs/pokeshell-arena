// The loadout screen: pick 3-6 Pokémon (team) or one (1v1 quick match) from the cards you caught, the bots' level
// and the arena; see which evolutions you own; save loadouts to teams.json. Plain DOM, re-rendered on change.
import { BOT_LEVELS, type DifficultyName } from '../bots/bot'
import { TYPE_COLOR } from '../render/sprites'
import { costPips } from '../sim/energy'
import { ENERGY_TYPES, type EnergyType, type FighterKit } from '../sim/types'
import { canEvolveInto } from '../sim/evolution'
import { kitFor, playerSide, type DeckMode, type RosterCard, type Side } from './botteams'
import { bindSheets, closeSheet, INFO_BTN } from './attacksheet'
import type { RosterEntry } from './kits'
import { lineText } from './lines'
import { bindOdds, oddsPanelHtml } from './packs'
import { newTeamId, TEAM_MAX, TEAM_MIN, teamProblems, type SavedTeam, type TeamsFile } from './teams'

export type Mode = 'team' | '1v1'

/** the card list's orders; 'pulled' is newest pull first (cards with no known pull time last) */
export const SORTS = ['hp', 'stage', 'name', 'set', 'pulled'] as const
export type SortKey = (typeof SORTS)[number]
const SORT_LABEL: Record<SortKey, string> = { hp: 'hp', stage: 'stage', name: 'name', set: 'set', pulled: 'last pulled' }

export interface LoadoutState {
  mode: Mode
  /** random: both teams rolled (yours from your cards, the bot's from all); choose: you pick, the bot rolls good cards */
  deck: DeckMode
  /** the rolled team's size in random team mode (3-6) */
  size: number
  /** card ids, lead first, per mode */
  picks: Record<Mode, string[]>
  difficulty: DifficultyName
  /** an arena id, or 'random' */
  arena: string
  search: string
  type: string
  sort: SortKey
  /** the saved team being edited, per mode */
  teamId: Record<Mode, string | null>
  teamName: Record<Mode, string>
}

export interface LoadoutCtx {
  el: HTMLElement
  roster: RosterEntry[]
  arenas: { id: string; name: string }[]
  teams: TeamsFile
  status: string
  note: string
  /** packs to open (the wallet's pack tokens) */
  tokens: number | null
  /** the tokens toward the next pack (null: unknown) */
  progress?: number | null
  /** a transient message under the team panel */
  flash: string
  onStart(): void
  onSave(f: TeamsFile): void
  onChange(): void
  onClick(): void
  /** the token chip: open the packs you've won */
  onPacks(): void
  /** every card there is (the bot roster, loaded lazily): lends the lower stages you don't own to start lines */
  allCards?: readonly RosterCard[]
}

const PREFS = 'pokearena.loadout'

export function defaultLoadout(roster: RosterEntry[]): LoadoutState {
  const first = roster.map((e) => e.kit.card)
  const st: LoadoutState = {
    mode: 'team', deck: 'random', size: 3, picks: { team: first.slice(0, 3), '1v1': first.slice(0, 1) },
    difficulty: 'normal', arena: 'random', search: '', type: '', sort: 'hp',
    teamId: { team: null, '1v1': null }, teamName: { team: 'My team', '1v1': 'My pick' },
  }
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? 'null') as Partial<LoadoutState> | null
    if (p) {
      if (p.mode === 'team' || p.mode === '1v1') st.mode = p.mode
      if (p.difficulty && (BOT_LEVELS as string[]).includes(p.difficulty)) st.difficulty = p.difficulty
      if (typeof p.arena === 'string') st.arena = p.arena
      if (p.deck === 'random' || p.deck === 'choose') st.deck = p.deck
      if (typeof p.sort === 'string' && (SORTS as readonly string[]).includes(p.sort)) st.sort = p.sort
      if (typeof p.size === 'number' && p.size >= TEAM_MIN && p.size <= TEAM_MAX) st.size = p.size
      const owned = new Set(first)
      const keep = (ids: string[] | undefined) => (ids ?? []).filter((id) => owned.has(id))
      if (keep(p.picks?.team).length) st.picks.team = keep(p.picks?.team).slice(0, TEAM_MAX)
      if (keep(p.picks?.['1v1']).length) st.picks['1v1'] = keep(p.picks?.['1v1']).slice(0, 1)
    }
  } catch { /* first visit */ }
  return st
}

export function savePrefs(st: LoadoutState): void {
  try {
    const { mode, deck, size, picks, difficulty, arena, sort } = st
    localStorage.setItem(PREFS, JSON.stringify({ mode, deck, size, picks, difficulty, arena, sort }))
  } catch { /* not kept */ }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function pipsHtml(cost: readonly string[]): string {
  return cost.map((c) => `<span class="pip" title="${c}" style="background:${TYPE_COLOR[c] ?? '#ccc'}"></span>`).join('')
}

/** every cost is energy pips now; a cost shows as that many pips (the card's own symbols, as flavour) */
export function costHtml(cost: readonly string[]): string {
  return costPips(cost) ? pipsHtml(cost) : '<i class="free">free</i>'
}

function spriteUrl(e: RosterEntry): string {
  return `${import.meta.env.BASE_URL}sprites/${e.kit.character}${e.shiny ? '-shiny' : ''}.png`
}

/** the battle sprite (with a base-species retry, then a disc fallback) */
export function spriteHtml(e: { kit: FighterKit; shiny: boolean }, cls = ''): string {
  const col = TYPE_COLOR[e.kit.types[0]] ?? '#ccc'
  const disc = `<div class=&quot;disc ${cls}&quot; style=&quot;background:${col}&quot;>${esc(e.kit.name[0])}</div>`
  const base = e.kit.character.replace(/-(v|vmax|vstar|gx|ex)$/, '')
  const alt = `${import.meta.env.BASE_URL}sprites/${base}.png`
  return `<img class="sprite ${cls}" src="${spriteUrl(e as RosterEntry)}" alt="" onerror="if(this.dataset.f){this.outerHTML='${disc}'}else{this.dataset.f=1;this.src='${alt}'}">`
}

/** the card face from pokeshell's web export, else the sprite */
function faceHtml(e: RosterEntry): string {
  if (e.face) return `<img class="face" src="${e.face}" alt="" onerror="this.remove()">${spriteHtml(e, 'under')}`
  return spriteHtml(e)
}

/** the card's tint (its first type), for the binder-style frame */
export function tintStyle(k: FighterKit): string {
  return `--tint:${TYPE_COLOR[k.types[0]] ?? '#9aa4b5'}`
}

function typeDots(k: FighterKit): string {
  return k.types.map((t) => `<span class="type" style="--c:${TYPE_COLOR[t] ?? '#ccc'}">${t}</span>`).join('')
}

export function picked(st: LoadoutState, roster: RosterEntry[]): RosterEntry[] {
  return st.picks[st.mode].map((id) => roster.find((e) => e.kit.card === id)).filter((e): e is RosterEntry => !!e)
}

function loan(c: RosterCard): RosterEntry | null {
  try { return { kit: kitFor(c), shiny: false, owned: false, loaner: true } } catch { return null }
}

/** the team as it enters a match: each slot's start line (docs/SPEC.md section 6) and the other cards you own that it
 * can evolve into mid-match */
export function sideOf(st: LoadoutState, roster: RosterEntry[], all: readonly RosterCard[] = []): Side<RosterEntry> {
  return playerSide(picked(st, roster), roster, all, loan)
}

/** the cards you own that the team can evolve into mid-match, beyond each slot's own line */
export function evolutionsOf(st: LoadoutState, roster: RosterEntry[], all: readonly RosterCard[] = []): RosterEntry[] {
  return sideOf(st, roster, all).evolutions
}

/** what the loadout lacks before it can battle */
export function problems(st: LoadoutState, roster: RosterEntry[]): string[] {
  if (st.deck === 'random') {
    const need = st.mode === 'team' ? TEAM_MIN : 1
    return roster.length < need ? [`a rolled team needs ${need} caught cards (you have ${roster.length})`] : []
  }
  const n = picked(st, roster).length
  if (st.mode === 'team' && n < TEAM_MIN) return [`pick ${TEAM_MIN - n} more (a team has ${TEAM_MIN}-${TEAM_MAX})`]
  if (n < 1) return ['pick a Pokémon']
  return []
}

const stageN = (k: FighterKit) => (k.subtypes.includes('Stage 2') || k.subtypes.includes('VMAX') ? 2 : k.subtypes.includes('Stage 1') || k.subtypes.includes('VSTAR') ? 1 : 0)

/** the card list: the search / type filter, then the chosen order (ties by card id) */
export function sorted(st: Pick<LoadoutState, 'search' | 'type' | 'sort'>, roster: RosterEntry[]): RosterEntry[] {
  const q = st.search.trim().toLowerCase()
  const list = roster.filter((e) => {
    if (st.type && !e.kit.types.includes(st.type as EnergyType)) return false
    if (!q) return true
    return e.kit.name.toLowerCase().includes(q) || e.kit.card.toLowerCase().includes(q) || e.kit.attacks.some((a) => a.name.toLowerCase().includes(q))
  })
  const by = {
    stage: (a: RosterEntry, b: RosterEntry) => stageN(a.kit) - stageN(b.kit) || a.kit.name.localeCompare(b.kit.name),
    hp: (a: RosterEntry, b: RosterEntry) => b.kit.hp - a.kit.hp,
    name: (a: RosterEntry, b: RosterEntry) => a.kit.name.localeCompare(b.kit.name),
    set: (a: RosterEntry, b: RosterEntry) => a.kit.card.localeCompare(b.kit.card, undefined, { numeric: true }),
    // the times are fixed-width local ISO strings, so string order is time order; unknown sorts last
    pulled: (a: RosterEntry, b: RosterEntry) => (a.pulled ? (b.pulled ? (a.pulled < b.pulled ? 1 : a.pulled > b.pulled ? -1 : 0) : -1) : b.pulled ? 1 : 0),
  }[st.sort] ?? ((_a: RosterEntry, _b: RosterEntry) => 0)
  return list.sort((a, b) => by(a, b) || a.kit.card.localeCompare(b.kit.card))
}

function evoLine(k: FighterKit, evos: RosterEntry[], line?: { start: RosterEntry; path: RosterEntry[] }): string {
  // an evolved card enters as the Basic of its line ("Charmander → Charizard"); then the other owned evolutions
  const enters = line && line.path.length
    ? `<div class="evo-line" title="enters the match as ${esc(line.start.kit.name)}: fill the evolve charge, then press F to evolve toward ${esc(k.name)}${line.start.loaner || line.path.some((x) => x.loaner) ? ' (a loaner is a card you don\'t own, lent for the line)' : ''}">starts ▸ ${esc(lineText(line))}</div>`
    : ''
  const next = evos.filter((x) => canEvolveInto(k, x.kit))
  return enters + (next.length ? `<div class="evo-line" title="you own it: fill the evolve charge in battle, then press F">evolves ▸ ${next.map((x) => esc(x.kit.name)).join(' / ')}</div>` : '')
}

function slotHtml(e: RosterEntry | undefined, i: number, lead: boolean, evos: RosterEntry[], line?: { start: RosterEntry; path: RosterEntry[] }): string {
  if (!e) return `<div class="slot empty" data-slot="${i}"><span class="slot-n">${i + 1}</span><span class="slot-add">+ add a Pokémon</span></div>`
  const k = e.kit
  return `<div class="slot" data-slot="${i}" draggable="true" data-card="${k.card}" data-sheet style="${tintStyle(k)}">
    <span class="slot-n">${i + 1}</span>${lead ? '<span class="lead">LEAD</span>' : ''}${INFO_BTN}
    <div class="slot-art">${spriteHtml(e)}</div>
    <div class="slot-name">${esc(k.name)}</div>
    <div class="slot-meta">${k.hp} HP · ${typeDots(k)}</div>
    <div class="slot-meta">retreat ${pipsHtml(new Array(k.retreat).fill('Colorless'))}${k.retreat ? '' : '<i>free</i>'}</div>
    ${evoLine(k, evos, line)}
    <div class="slot-ctl"><button data-act="left" title="move earlier">◀</button><button data-act="remove" title="remove">✕</button><button data-act="right" title="move later">▶</button></div>
  </div>`
}

function cardHtml(e: RosterEntry, at: number): string {
  const k = e.kit
  return `<div class="card ${at >= 0 ? 'in' : ''}" data-card="${k.card}" data-sheet style="${tintStyle(k)}">
    ${at >= 0 ? `<span class="in-n">${at + 1}</span>` : ''}${INFO_BTN}
    <div class="art">${faceHtml(e)}</div>
    <div class="name">${esc(k.name)}</div>
    <div class="meta">${k.hp} HP · ${typeDots(k)}${e.shiny ? ' <span class="tag own">shiny</span>' : ''}${k.evolvesFrom ? ` <span class="tag">from ${esc(k.evolvesFrom)}</span>` : ''}</div>
    ${k.attacks.slice(0, 3).map((a) => `<div class="atk">${costHtml(a.cost)} <span class="an">${esc(a.name)}</span> <span class="dmg">${esc(a.damage || '—')}</span></div>`).join('')}
  </div>`
}

/** tokens to one pack: a win's tokens fill the bar, every TOKENS_PER_PACK of them make a pack (docs/SPEC.md section 9) */
export const TOKENS_PER_PACK = 10

/** the tokens a win earns toward the next pack (the host counts them; the same table as docs/SPEC.md section 9) */
export function tokensFor(mode: Mode, difficulty: DifficultyName): number {
  return (mode === 'team' ? 2 : 1) + (difficulty === 'hard' ? 1 : difficulty === 'expert' ? 2 : 0)
}

/** the wallet chip: the tokens toward the next pack ("★ 7 / 10" and its bar), and the packs ready to open */
export function walletHtml(c: Pick<LoadoutCtx, 'tokens' | 'progress'>): string {
  const p = Math.max(0, Math.min(TOKENS_PER_PACK, c.progress ?? 0))
  const packs = c.tokens ?? 0
  const tip = `tokens: wins earn them, ${TOKENS_PER_PACK} make a pack${packs ? `; ${packs} pack${packs === 1 ? '' : 's'} to open: click to open one` : ''}`
  return `<button class="tokens ${packs ? 'has' : ''}" id="tokens" title="${tip}"><span class="tok">★</span>
    <span class="tok-prog"><b>${c.progress == null ? '–' : p}</b><span class="of">/ ${TOKENS_PER_PACK}</span><i class="tok-bar"><i style="width:${(p / TOKENS_PER_PACK) * 100}%"></i></i></span>
    ${packs ? `<small>${packs} pack${packs === 1 ? '' : 's'} · open</small>` : ''}</button>`
}

export function renderLoadout(st: LoadoutState, c: LoadoutCtx): void {
  const team = picked(st, c.roster)
  const max = st.mode === 'team' ? TEAM_MAX : 1
  const probs = problems(st, c.roster)
  const side = sideOf(st, c.roster, c.allCards)
  const evos = side.evolutions
  const hpSum = team.reduce((n, e) => n + e.kit.hp, 0)
  const saved = c.teams.teams.filter((t) => t.mode === st.mode)
  const inTeam = new Map(st.deck === 'random' ? [] : st.picks[st.mode].map((id, i) => [id, i]))
  const list = sorted(st, c.roster)
  const types = ENERGY_TYPES.filter((t) => c.roster.some((e) => e.kit.types.includes(t)))
  const arenaTiles = [{ id: 'random', name: 'Random arena' }, ...c.arenas]
  const win = tokensFor(st.mode, st.difficulty)
  closeSheet()

  c.el.innerHTML = `
  <header class="lo-head">
    <div class="brand"><span class="ball"></span><div><h1>pokeshell <span>arena</span></h1><p>battle with the cards in your binder</p></div></div>
    <div class="modes" id="mode">
      <button data-v="team" class="${st.mode === 'team' ? 'on' : ''}"><b>Team battle</b><small>3-6 Pokémon · bench swaps · KO the whole team</small></button>
      <button data-v="1v1" class="${st.mode === '1v1' ? 'on' : ''}"><b>1v1 quick match</b><small>one Pokémon each · first KO wins</small></button>
    </div>
    <div class="status">${c.status}${c.note ? `<br>${esc(c.note)}` : ''}</div>
    ${walletHtml(c)}
  </header>
  <main class="lo-main">
    <section class="panel team-panel">
      <div class="decks" id="deck">
        <button data-v="random" class="${st.deck === 'random' ? 'on' : ''}"><b>🎲 Random decks</b><small>yours rolled from your cards · the bot's from every card</small></button>
        <button data-v="choose" class="${st.deck === 'choose' ? 'on' : ''}"><b>✋ You choose</b><small>you pick yours · the bot rolls good cards for its level</small></button>
      </div>
      ${st.deck === 'random' ? randomPanel(st, c) : `
      <div class="panel-head"><h2>${st.mode === 'team' ? 'Your team' : 'Your Pokémon'}</h2>
        <span class="count">${team.length} / ${max}</span></div>
      <div class="saved">
        <select id="saved"><option value="">${saved.length ? 'saved loadouts…' : 'no saved loadouts yet'}</option>${saved.map((t) => `<option value="${esc(t.id)}" ${t.id === st.teamId[st.mode] ? 'selected' : ''}>${esc(t.name)} · ${t.members.length}</option>`).join('')}</select>
        <input id="tname" maxlength="32" value="${esc(st.teamName[st.mode])}" placeholder="name">
        <button class="mini" id="save">${st.teamId[st.mode] ? 'Save' : 'Save as new'}</button>
        ${st.teamId[st.mode] ? '<button class="mini ghost" id="saveas">Copy</button><button class="mini ghost danger" id="del">Delete</button>' : ''}
      </div>
      <div class="slots mode-${st.mode}">${Array.from({ length: max }, (_, i) => slotHtml(team[i], i, st.mode === 'team' && i === 0, evos, team[i] ? { start: side.members[i], path: side.paths[i] } : undefined)).join('')}</div>
      <div class="power"><span>total HP <b>${hpSum}</b></span>${st.mode === 'team' ? `<span>KO all <b>${team.length || TEAM_MIN}</b> of the bot's team to win</span>` : '<span>first KO wins</span>'}</div>
      <h3>Evolutions you own</h3>
      <div class="evos">${evos.length ? evos.map((e) => `<div class="evo" title="evolves from ${esc(e.kit.evolvesFrom ?? '')}">${spriteHtml(e)}<span>${esc(e.kit.name)}</span><small>from ${esc(e.kit.evolvesFrom ?? '')}</small></div>`).join('') : '<p class="note">None for this team yet. Catch a card that evolves from one of them and it can evolve mid-battle.</p>'}</div>
      <p class="note">Hover a card (or click its <b>i</b>) for its attacks: the card text and what each does in the arena. Deal damage and take KOs to fill the evolve charge, then press <b>F</b>: your Pokémon keeps its damage and becomes the next stage. One energy meter fills over time; an attack costs its card's energy count, and swapping out costs the leaving Pokémon's retreat.</p>`}
      ${c.flash ? `<p class="flash">${esc(c.flash)}</p>` : ''}
    </section>
    <section class="panel coll-panel">
      <div class="panel-head"><h2>Your cards</h2><span class="count">${list.length} of ${c.roster.length} caught</span></div>
      <div class="filters">
        <input id="search" type="search" placeholder="search name, card id or attack" value="${esc(st.search)}">
        <div class="chips" id="types"><button data-v="" class="${st.type ? '' : 'on'}">all</button>${types.map((t) => `<button data-v="${t}" class="${st.type === t ? 'on' : ''}"><span class="pip" style="background:${TYPE_COLOR[t]}"></span>${t}</button>`).join('')}</div>
        <select id="sort">${SORTS.map((s) => `<option value="${s}" ${st.sort === s ? 'selected' : ''}>sort: ${SORT_LABEL[s]}</option>`).join('')}</select>
      </div>
      <div class="roster" id="roster">${list.map((e) => cardHtml(e, inTeam.get(e.kit.card) ?? -1)).join('') || '<p class="note">No cards match.</p>'}</div>
    </section>
  </main>
  <footer class="lo-foot">
    <div class="arenas" id="arenas">${arenaTiles.map((a) => `<button class="arena ${a.id === st.arena ? 'on' : ''} ${a.id === 'random' ? 'rand' : ''}" data-id="${a.id}" ${a.id === 'random' ? '' : `style="background-image:url('${import.meta.env.BASE_URL}arenas/${a.id}/bg.png')"`}><span>${esc(a.name)}</span></button>`).join('')}</div>
    <div class="foot-row">
      <div class="opt"><label>Bots</label><div class="seg" id="diff">${BOT_LEVELS.map((d) => `<button data-v="${d}" class="${st.difficulty === d ? 'on' : ''}">${d}</button>`).join('')}</div></div>
      <div class="opt reward">a win earns <b>${win}</b> token${win > 1 ? 's' : ''} <span class="dim">(${TOKENS_PER_PACK} = 1 pack)</span><span class="dim"> · ${st.deck === 'random' ? 'the bot rolls from every card' : BOT_ROLLS[st.difficulty]}</span> ${oddsPanelHtml()}</div>
      <button class="btn go" id="go" ${probs.length ? 'disabled' : ''}>${st.deck === 'random' ? 'Roll the teams!' : st.mode === 'team' ? 'Battle!' : 'Quick match!'}<small>${probs.length ? esc(probs[0]) : 'Enter'}</small></button>
    </div>
  </footer>`

  const $ = <T extends HTMLElement>(s: string) => c.el.querySelector(s) as T
  const all = (s: string) => [...c.el.querySelectorAll<HTMLElement>(s)]
  const change = (fn: () => void) => () => { c.onClick(); c.flash = ''; fn(); savePrefs(st); c.onChange() }
  const picks = () => st.picks[st.mode]

  all('#mode button').forEach((b) => b.onclick = change(() => { st.mode = b.dataset.v as Mode }))
  all('#deck button').forEach((b) => b.onclick = change(() => { st.deck = b.dataset.v as DeckMode }))
  all('#size button').forEach((b) => b.onclick = change(() => { st.size = +b.dataset.v! }))
  all('#diff button').forEach((b) => b.onclick = change(() => { st.difficulty = b.dataset.v as DifficultyName }))
  all('#arenas .arena').forEach((b) => b.onclick = change(() => { st.arena = b.dataset.id! }))
  all('#types button').forEach((b) => b.onclick = change(() => { st.type = b.dataset.v! }))
  $<HTMLSelectElement>('#sort').onchange = change(() => { st.sort = $<HTMLSelectElement>('#sort').value as LoadoutState['sort'] })
  const search = $<HTMLInputElement>('#search')
  search.oninput = () => {
    st.search = search.value
    const pos = search.selectionStart
    c.onChange()
    const s2 = c.el.querySelector<HTMLInputElement>('#search')!
    s2.focus(); s2.setSelectionRange(pos, pos)
  }
  all('#roster .card').forEach((el) => el.onclick = change(() => {
    const id = el.dataset.card!
    if (st.deck === 'random') { st.deck = 'choose'; c.flash = 'switched to You choose' }
    const p = picks()
    const at = p.indexOf(id)
    if (at >= 0) p.splice(at, 1)
    else if (st.mode === '1v1') st.picks['1v1'] = [id]
    else if (p.length < TEAM_MAX) p.push(id)
    else c.flash = `a team has at most ${TEAM_MAX}: remove one first`
  }))
  all('.slot').forEach((el) => {
    const i = +el.dataset.slot!
    el.querySelectorAll<HTMLButtonElement>('.slot-ctl button').forEach((b) => b.onclick = (ev) => {
      ev.stopPropagation()
      change(() => {
        const p = picks()
        if (b.dataset.act === 'remove') p.splice(i, 1)
        const j = b.dataset.act === 'left' ? i - 1 : b.dataset.act === 'right' ? i + 1 : -1
        if (j >= 0 && j < p.length) [p[i], p[j]] = [p[j], p[i]]
      })()
    })
    // drag a slot onto another to reorder
    el.ondragstart = (ev) => { ev.dataTransfer?.setData('text/plain', String(i)) }
    el.ondragover = (ev) => ev.preventDefault()
    el.ondrop = (ev) => {
      ev.preventDefault()
      const from = +(ev.dataTransfer?.getData('text/plain') ?? -1)
      const p = picks()
      if (from >= 0 && from < p.length && i < p.length && from !== i) change(() => { const [x] = p.splice(from, 1); p.splice(i, 0, x) })()
    }
  })

  // attack sheets: hover a card (or its ⓘ to pin) for every attack's cost, damage, card text and arena line
  bindSheets(c.el, (el) => c.roster.find((e) => e.kit.card === el.dataset.card)?.kit)

  // saved loadouts (teams.json)
  if (c.el.querySelector('#saved')) bindSaved(st, c, team, change)
  bindOdds(c.el)
  $<HTMLButtonElement>('#tokens').onclick = () => { if (c.tokens) { c.onClick(); c.onPacks() } }
  $<HTMLButtonElement>('#go').onclick = () => { if (!problems(st, c.roster).length) { c.onClick(); c.onStart() } }
}

function bindSaved(st: LoadoutState, c: LoadoutCtx, team: RosterEntry[], change: (fn: () => void) => () => void): void {
  const $ = <T extends HTMLElement>(s: string) => c.el.querySelector(s) as T
  $<HTMLSelectElement>('#saved').onchange = change(() => {
    const t = c.teams.teams.find((x) => x.id === $<HTMLSelectElement>('#saved').value)
    if (!t) { st.teamId[st.mode] = null; return }
    applyTeam(st, t)
    c.teams.selected = t.id
    c.onSave(c.teams)
  })
  const tname = $<HTMLInputElement>('#tname')
  tname.oninput = () => { st.teamName[st.mode] = tname.value }
  const save = (asNew: boolean) => change(() => {
    const id = !asNew && st.teamId[st.mode] ? st.teamId[st.mode]! : newTeamId(c.teams)
    const t: SavedTeam = {
      id, name: (st.teamName[st.mode] || 'My team').slice(0, 27) + (asNew && st.teamId[st.mode] ? ' copy' : ''), mode: st.mode,
      members: team.map((e) => ({ card: e.kit.card, ...(e.shiny ? { shiny: true } : {}) })),
    }
    const errs = teamProblems(t)
    if (errs.length) { c.flash = `can't save: ${errs[0]}`; return }
    const i = c.teams.teams.findIndex((x) => x.id === id)
    if (i >= 0) c.teams.teams[i] = t
    else c.teams.teams.push(t)
    c.teams.selected = id
    st.teamId[st.mode] = id
    st.teamName[st.mode] = t.name
    c.flash = `saved “${t.name}”`
    c.onSave(c.teams)
  })()
  $<HTMLButtonElement>('#save').onclick = () => save(false)
  const saveas = c.el.querySelector<HTMLButtonElement>('#saveas')
  if (saveas) saveas.onclick = () => save(true)
  const del = c.el.querySelector<HTMLButtonElement>('#del')
  if (del) del.onclick = change(() => {
    const id = st.teamId[st.mode]
    c.teams.teams = c.teams.teams.filter((t) => t.id !== id)
    if (c.teams.selected === id) c.teams.selected = null
    st.teamId[st.mode] = null
    c.flash = 'deleted'
    c.onSave(c.teams)
  })
}

const BOT_ROLLS: Record<DifficultyName, string> = {
  easy: 'easy bots roll modest cards', normal: 'normal bots roll solid cards', hard: 'hard bots roll strong cards',
  expert: 'expert bots roll premium V, VMAX and ex cards',
}

/** Random decks: your team is rolled from your caught cards when you start; this shows what will be rolled */
function randomPanel(st: LoadoutState, c: LoadoutCtx): string {
  const n = st.mode === 'team' ? st.size : 1
  const sizes = st.mode === 'team' ? `<div class="opt"><label>Team size</label><div class="seg" id="size">${[3, 4, 5, 6].map((k) => `<button data-v="${k}" class="${st.size === k ? 'on' : ''}">${k}</button>`).join('')}</div></div>` : ''
  return `<div class="panel-head"><h2>${st.mode === 'team' ? 'Your rolled team' : 'Your rolled Pokémon'}</h2><span class="count">from ${c.roster.length} caught</span></div>
    ${sizes}
    <div class="slots mode-${st.mode} rolled">${Array.from({ length: n }, (_, i) => `<div class="slot empty mystery"><span class="slot-n">${i + 1}</span><span class="q">?</span></div>`).join('')}</div>
    <p class="note">When you start, ${n === 1 ? 'one of your caught cards is' : `${n} of your caught cards are`} rolled at random for you, and the bot rolls its ${n === 1 ? 'Pokémon' : 'team'} from every card there is. You see both before the fight, with one free reroll. Evolutions you own come along.</p>`
}

/** load a saved team into the loadout (cards you no longer own are dropped) */
export function applyTeam(st: LoadoutState, t: SavedTeam, owned?: Set<string>): void {
  st.mode = t.mode
  st.picks[t.mode] = t.members.map((m) => m.card).filter((id) => !owned || owned.has(id)).slice(0, t.mode === 'team' ? TEAM_MAX : 1)
  st.teamId[t.mode] = t.id
  st.teamName[t.mode] = t.name
}
