// The page: the loadout (your caught cards, team or 1v1, bots, arena), a match, the pause menu, the result and its
// reward, the way to the pack opening. You battle only with cards you own: without pokeshell or without caught
// cards the page explains how to get some.
// URL params drive it for automation (screenshots, tests):
//   ?auto=1&mode=team&me=<card>,<card>,<card>&foe=<card>,...&arena=<id>&diff=hard&seed=5&bots=1
//   (`bots=1`: a bot plays your side too, a demo with no rewards; `me` may then name bot-roster cards)
import { BOT_LEVELS, type DifficultyName } from './bots/bot'
import { sfx } from './audio/sfx'
import { api, probeHost, startHeartbeat, type Health } from './game/api'
import { arenaIndex, loadArena, loadArenaFile } from './game/arena'
import { botSideOf, kitFor, loadBotRoster, playerSide, rollAnyTeam, rollBotTeam, rollMyTeam, type BotEntry, type BotTeam, type DeckMode, type RosterCard, type Side } from './game/botteams'
import { bindSheets, closeSheet, INFO_BTN, rememberCardTexts, sheetHtml } from './game/attacksheet'
import { collectionRoster, type RosterEntry } from './game/kits'
import { applyTeam, defaultLoadout, picked, renderLoadout, spriteHtml, tintStyle, type LoadoutCtx, type LoadoutState, type Mode } from './game/loadout'
import { lineText } from './game/lines'
import { MatchRunner, type MatchSetup } from './game/match'
import { bindOdds, oddsPanelHtml, openRandomPack, packErrorMessage, packSets } from './game/packs'
import { matchPayload, renderResult, type Reward } from './game/result'
import { emptyTeams, loadTeams, saveTeams, TEAM_MAX, type TeamsFile } from './game/teams'
import { Input } from './input/input'
import { preload, TYPE_COLOR } from './render/sprites'
import type { FighterKit } from './sim/types'
import { randInt, seedRng } from './sim/rng'
import { toggleDebugOverlay } from './render/debug'

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T
const canvas = $<HTMLCanvasElement>('#game')
const menu = $<HTMLDivElement>('#menu')
const resultEl = $<HTMLDivElement>('#result')
const pauseEl = $<HTMLDivElement>('#pause')
const packEl = $<HTMLDivElement>('#packs')
const revealEl = $<HTMLDivElement>('#reveal')
const input = new Input(canvas)
/** the HUD's Quit button: the one thing over the arena that takes a click (a DOM button in the canvas's corner) */
const quitBtn = $<HTMLButtonElement>('#quit')
quitBtn.onclick = () => { sfx.play('uiClick'); askForfeit() }
quitBtn.addEventListener('mousedown', (e) => e.stopPropagation())
input.toDesign = (cx, cy) => {
  const r = canvas.getBoundingClientRect()
  return { x: ((cx - r.left) / r.width) * 1920, y: ((cy - r.top) / r.height) * 1080 }
}

const params = new URLSearchParams(location.search)
let host: Health | null = null
let roster: RosterEntry[] = []
let arenas: { id: string; name: string }[] = []
let teams: TeamsFile = emptyTeams()
/** packs to open (the wallet's pack tokens) */
let tokens: number | null = null
/** the tokens toward the next pack (10 = 1 pack) */
let progress: number | null = null
let perPack = 10
/** why there are no cards to battle with (null: there are); `packs`: the way out is opening packs (the standalone
 * arena's welcome: its starter packs) */
let blocked: { title: string; body: string; packs?: boolean } | null = null
let collectionNote = ''
let st: LoadoutState = defaultLoadout([])
let runner: MatchRunner | null = null
let lastSetup: MatchSetup | null = null
/** every card there is (the bot roster): the loadout's start lines borrow lower stages you don't own from it */
let botCards: RosterCard[] | null = null
void loadBotRoster().then((c) => { botCards = c; if (screen === 'loadout') renderMenu() }).catch(() => {})
let screen: 'loadout' | 'reveal' | 'match' | 'result' | 'packs' = 'loadout'
/** the heartbeat runs once per page (boot() runs again on "Check again") */
let beating = false
let reward: Reward = { kind: 'pending' }

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

function setVolume(): void {
  try {
    const v = JSON.parse(localStorage.getItem('pokearena.audio') ?? 'null') as { volume?: number; muted?: boolean } | null
    if (v) { sfx.volume = v.volume ?? sfx.volume; sfx.muted = !!v.muted }
  } catch { /* defaults */ }
}
function saveVolume(): void {
  try { localStorage.setItem('pokearena.audio', JSON.stringify({ volume: sfx.volume, muted: sfx.muted })) } catch { /* not kept */ }
}

// ------------------------------------------------------------------ screens
function show(which: typeof screen): void {
  screen = which
  closeSheet()
  quitBtn.classList.toggle('hidden', which !== 'match')
  menu.classList.toggle('hidden', which !== 'loadout')
  resultEl.classList.toggle('hidden', which !== 'result')
  packEl.classList.toggle('hidden', which !== 'packs')
  revealEl.classList.toggle('hidden', which !== 'reveal')
  if (which !== 'match') pauseEl.classList.add('hidden')
}

/** the downloadable arena: its own wallet and packs, no pokeshell (docs/RELEASE.md) */
function standalone(): boolean {
  return host?.mode === 'standalone'
}

function statusLine(): string {
  if (!host) return 'no arena-host: run <b>pokearena</b>'
  if (host.web) return 'pokeshell arena <b>web</b> · your cards and packs are saved in this browser'
  if (standalone()) return `pokeshell arena <b>${esc(host.version)}</b> · your own collection`
  const ps = host.pokeshell
  return `host <b>${esc(host.version)}</b> · pokeshell ${ps.found ? `<b>found</b>${ps.version ? ' ' + esc(ps.version) : ''}` : '<b>not found</b>'}`
}

function renderBlocked(): void {
  const b = blocked!
  menu.innerHTML = `<div class="blocked">
    <h1><span class="ball"></span>pokeshell <span>arena</span></h1>
    <div class="blocked-card">
      <div class="pokeball"></div>
      <h2>${esc(b.title)}</h2>
      ${b.body}
      <div class="row">${b.packs && (tokens ?? 0) > 0
        ? `<button class="btn" id="open-packs">Open a pack<small>★ ${tokens} to open</small></button>`
        : '<button class="btn" id="retry">Check again</button>'}</div>
      <p class="note">${statusLine()}</p>
    </div></div>`
  const retry = document.querySelector<HTMLButtonElement>('#retry')
  if (retry) retry.onclick = () => { sfx.play('uiClick'); void boot() }
  const open = document.querySelector<HTMLButtonElement>('#open-packs')
  if (open) open.onclick = () => { sfx.unlock(); sfx.play('uiClick'); void packFlow('loadout') }
}

/** the standalone arena with no cards yet: the welcome, pointing at its starter packs (or why there are none) */
function welcomeBlock(): NonNullable<typeof blocked> {
  const n = tokens ?? 0
  const starter = host?.starter?.packs ?? 3
  if (n <= 0) return { title: 'No cards yet', packs: true, body: '<p>You battle with the cards you own, and you have none yet and no packs to open. Check again in a moment.</p>' }
  return {
    title: 'Welcome to the arena!', packs: true,
    body: `<p>You battle with the cards you own. To start your collection you get <b>${starter} free booster packs</b>: open them to pull real cards (a random set each, rolled by its pack's price), then pick your team and fight the bots.</p>
      <p class="note">You have ${n} pack${n === 1 ? '' : 's'} to open. After that, wins earn tokens toward more: 1 for a 1v1, 2 for a team battle, +1 on hard and +2 on expert, and every 10 tokens make a pack.</p>${host?.web ? '<p class="note">Everything is saved in this browser: no account, no install.</p>' : ''}`,
  }
}

function collectionNoteFor(n: number): string {
  return `${n} caught card${n === 1 ? '' : 's'} ready to battle`
}

/** the collection again (after packs were opened): new cards join the roster; the first ones end the welcome */
async function refreshCollection(): Promise<void> {
  if (!host) return
  try {
    const c = await api.collection()
    const had = roster.length
    roster = collectionRoster(c.cards)
    rememberCardTexts(c.cards)
    if (!roster.length) return
    collectionNote = collectionNoteFor(roster.length)
    if (blocked || !had) {
      blocked = null
      const mode = st.mode, difficulty = st.difficulty
      st = defaultLoadout(roster)
      st.mode = mode
      st.difficulty = difficulty
      flash = standalone() ? 'your first cards are in: pick a team and battle (wins earn more packs)' : ''
    }
  } catch { /* keep what we had */ }
}

/** the host stopped answering (it exits a while after the last game tab closes): say how to get it back */
function hostLost(): void {
  if (document.querySelector('#host-lost')) return
  const d = document.createElement('div')
  d.id = 'host-lost'
  d.className = 'host-lost'
  d.innerHTML = standalone()
    ? '<b>The arena has closed.</b> Open <b>pokeshell arena</b> again to keep playing (your cards and packs are saved).'
    : '<b>The arena host has stopped.</b> Run <code>pokearena</code> again to keep playing.'
  document.body.appendChild(d)
}

let flash = ''
function renderMenu(): void {
  if (blocked) { renderBlocked(); return }
  const ctx: LoadoutCtx = {
    el: menu, roster, arenas, teams, status: statusLine(), note: collectionNote, tokens, progress, flash,
    onStart: () => { void startFromLoadout() },
    onSave: (f) => { teams = f; void saveTeams(f, !!host).then((r) => { if (!r.ok) { flash = `not saved: ${r.message}`; renderMenu() } }) },
    onChange: () => { flash = ctx.flash; renderMenu() },
    onClick: () => { sfx.unlock(); sfx.play('uiClick') },
    onPacks: () => { void packFlow('loadout') },
    allCards: botCards ?? undefined,
  }
  renderLoadout(st, ctx)
  flash = ''
}

// ------------------------------------------------------------------ matches
function seedNow(): number {
  return (Date.now() & 0x7fffffff) >>> 0
}

function pickArena(id: string, seed: number): string {
  if (id !== 'random' && arenas.some((a) => a.id === id)) return id
  return arenas[randInt({ rng: seedRng(seed ^ 0xa7e) }, Math.max(1, arenas.length))]?.id ?? 'growlithe-meadow'
}

async function botSide(level: DifficultyName, size: number, seed: number, ids?: string[]): Promise<BotTeam> {
  const cards = await loadBotRoster()
  if (ids?.length) {
    const byId = new Map(cards.map((c) => [c.id, c]))
    const own = new Map(roster.map((e) => [e.kit.card, e]))
    const members = ids.map((id) => own.get(id) ?? (byId.get(id) ? { kit: kitFor(byId.get(id)!), shiny: false, owned: false } : null)).filter((e): e is BotEntry => !!e)
    return botSideOf(cards, members)
  }
  return rollBotTeam(cards, level, size, seed)
}

/** a roster card lent to your start line (you own no card of that stage) */
function loanOf(c: RosterCard): RosterEntry | null {
  try { return { kit: kitFor(c), shiny: false, owned: false, loaner: true } } catch { return null }
}

/** both sides' part of a MatchSetup: the cards each slot enters as, the lines, the evolutions, the picked cards */
function setupSides(me: Side<RosterEntry> | BotTeam, foe: BotTeam, cards: readonly RosterCard[]): Pick<MatchSetup, 'me' | 'foe' | 'meEvolutions' | 'foeEvolutions' | 'mePaths' | 'foePaths' | 'mePicked' | 'foePicked' | 'allCards'> {
  return {
    me: me.members as RosterEntry[], foe: foe.members as RosterEntry[],
    meEvolutions: me.evolutions as RosterEntry[], foeEvolutions: foe.evolutions as RosterEntry[],
    mePaths: me.paths as RosterEntry[][], foePaths: foe.paths as RosterEntry[][],
    mePicked: me.picked as RosterEntry[], foePicked: foe.picked as RosterEntry[], allCards: cards,
  }
}

async function launch(setup: MatchSetup): Promise<void> {
  lastSetup = setup
  runner?.stop()
  show('match')
  sfx.unlock()
  const r = new MatchRunner(canvas, input, setup)
  runner = r
  reward = { kind: 'pending' }
  r.onEnd = (s) => { void onMatchEnd(r, s.winner) }
  ;(window as unknown as { __arena: unknown }).__arena = {
    runner: r, state: () => r.s, hash: () => r.hash(), screen: () => screen, reward: () => reward,
  }
  await r.start()
}

// ------------------------------------------------------------------ rolling the teams, the reveal
/** both sides of a bot match before the fight, as the reveal screen shows them */
interface Rolled {
  mode: Mode
  deck: DeckMode
  difficulty: DifficultyName
  /** your side: the cards picked or rolled, what they enter as (start lines), the evolutions; the bot's */
  me: Side<RosterEntry>
  foe: BotTeam
  seed: number
  arena: string
  /** free rerolls left */
  rerolls: number
}
let rolled: Rolled | null = null
/** the reveal shows every card's attack sheet under the teams (I, or the Attacks button) */
let revealDetails = false
/** free rerolls per match reveal */
const FREE_REROLLS = 1

/** roll the teams for the loadout's deck mode: random (yours from your cards, the bot's from all cards) or choose
 * (your pick, the bot rolls good cards for its level) */
async function rollTeams(seed: number, prev?: Rolled): Promise<Rolled> {
  const cards = await loadBotRoster()
  const mode = prev?.mode ?? st.mode, deck = prev?.deck ?? st.deck, difficulty = prev?.difficulty ?? st.difficulty
  let me: Side<RosterEntry>
  if (deck === 'random') {
    const n = prev ? prev.me.picked.length : mode === 'team' ? st.size : 1
    me = rollMyTeam(roster, n, seed, cards, loanOf)
  } else {
    me = prev?.me ?? playerSide(picked(st, roster), roster, cards, loanOf)
  }
  const size = me.picked.length
  const foe = deck === 'random' ? rollAnyTeam(cards, size, seed) : rollBotTeam(cards, difficulty, size, seed)
  return {
    mode, deck, difficulty, me, foe, seed,
    arena: prev?.arena ?? pickArena(st.arena, seed), rerolls: prev ? prev.rerolls : FREE_REROLLS,
  }
}

function monHtml(e: { kit: FighterKit; shiny: boolean }, i: number, side: string, start?: { kit: FighterKit; loaner?: boolean }, path: { kit: FighterKit; loaner?: boolean }[] = []): string {
  const k = e.kit
  // a slot picked as an evolved card enters as the Basic of its line: "Charmander → Charizard"
  const line = start && path.length ? `<span class="rv-line" title="enters as ${esc(start.kit.name)}: fill the evolve charge and press F to evolve toward ${esc(k.name)}">${esc(lineText({ start, path }))}</span>` : ''
  return `<div class="rv-mon" data-sheet data-i="${i}" style="animation-delay:${0.15 + i * 0.12}s;${tintStyle(k)}">${INFO_BTN}
    <div class="rv-art">${spriteHtml(e)}</div>
    <b>${esc(k.name)}</b>${line}
    <span>${k.hp} HP · ${k.types.map((t) => `<i style="color:${TYPE_COLOR[t] ?? '#ccc'}">${t}</i>`).join('/')}</span>
    <span class="rv-atk">${k.attacks.map((a) => `${esc(a.name)} <em>${esc(a.damage || '—')}</em>`).join(' · ')}</span>
  </div>`.replace('rv-mon"', `rv-mon ${side}"`)
}

function evoLineHtml(list: { kit: FighterKit; shiny: boolean }[]): string {
  if (!list.length) return '<p class="rv-evo dim">no evolutions</p>'
  return `<p class="rv-evo">can evolve into ${list.slice(0, 6).map((e) => `<span>${spriteHtml(e)}${esc(e.kit.name)}</span>`).join('')}${list.length > 6 ? ` +${list.length - 6}` : ''}</p>`
}

function renderReveal(): void {
  const r = rolled!
  const arenaName = arenas.find((a) => a.id === r.arena)?.name ?? r.arena
  const title = r.deck === 'random' ? 'Random decks' : 'The bot rolled its cards'
  const sub = r.deck === 'random'
    ? `yours from your ${roster.length} caught cards · the bot's from every card`
    : `${r.difficulty} bots roll ${r.difficulty === 'expert' ? 'premium' : r.difficulty === 'hard' ? 'strong' : r.difficulty === 'normal' ? 'solid' : 'modest'} cards`
  const rerollLabel = r.deck === 'random' ? 'Reroll both' : 'Reroll the bot'
  revealEl.innerHTML = `<div class="reveal-box">
    <div class="rv-kicker">THE REVEAL · ${r.deck === 'random' ? 'RANDOM DECKS' : 'YOU CHOOSE'}</div>
    <h1>${title}</h1><p class="rv-sub">${esc(sub)} · ${esc(arenaName)} · ${r.mode === 'team' ? `team of ${r.me.picked.length}` : '1v1'}</p>
    <div class="rv-sides">
      <section class="rv-side me"><h2>You</h2><div class="rv-team">${r.me.picked.map((e, i) => monHtml(e, i, 'me', r.me.members[i], r.me.paths[i])).join('')}</div>${evoLineHtml(r.me.evolutions)}</section>
      <div class="rv-vs">VS</div>
      <section class="rv-side foe"><h2>Bot <small>${esc(r.difficulty)}</small></h2><div class="rv-team">${r.foe.picked.map((e, i) => monHtml(e, i + r.me.picked.length, 'foe', r.foe.members[i], r.foe.paths[i])).join('')}</div>${evoLineHtml(r.foe.evolutions)}</section>
    </div>
    ${revealDetails ? `<div class="rv-details"><section class="rv-dcol me"><h2>Your attacks</h2>${r.me.picked.map((e) => sheetHtml(e.kit)).join('')}</section>
      <section class="rv-dcol foe"><h2>The bot's attacks</h2>${r.foe.picked.map((e) => sheetHtml(e.kit)).join('')}</section></div>` : ''}
    <div class="res-btns">
      <button class="btn" id="rv-fight">Fight!<small>Enter</small></button>
      <button class="btn ghost" id="rv-info">${revealDetails ? 'Hide attacks' : 'Attacks'}<small>I · hover a card</small></button>
      <button class="btn ghost" id="rv-reroll" ${r.rerolls > 0 ? '' : 'disabled'}>${rerollLabel}<small>${r.rerolls > 0 ? `R · ${r.rerolls} free` : 'no rerolls left'}</small></button>
      <button class="btn ghost" id="rv-back">Loadout<small>Esc</small></button>
    </div></div>`
  $<HTMLButtonElement>('#rv-fight').onclick = () => { void fightRolled() }
  $<HTMLButtonElement>('#rv-reroll').onclick = () => { void reroll() }
  $<HTMLButtonElement>('#rv-back').onclick = () => { sfx.play('uiClick'); toLoadout() }
  $<HTMLButtonElement>('#rv-info').onclick = () => { sfx.play('uiClick'); toggleRevealDetails() }
  const mons = [...r.me.picked, ...r.foe.picked]
  bindSheets(revealEl, (el) => mons[+(el.dataset.i ?? -1)]?.kit)
}

function toggleRevealDetails(): void {
  revealDetails = !revealDetails
  closeSheet()
  renderReveal()
  if (revealDetails) revealEl.querySelector('.rv-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function showReveal(r: Rolled): Promise<void> {
  rolled = r
  runner?.stop()
  show('reveal')
  await preload([...r.me.picked, ...r.foe.picked].map((e) => ({ character: e.kit.character, shiny: e.shiny })))
  renderReveal()
  ;(window as unknown as { __arena: unknown }).__arena = { rolled: () => rolled, screen: () => screen }
}

async function reroll(): Promise<void> {
  if (!rolled || rolled.rerolls <= 0) return
  sfx.play('uiClick')
  const next = await rollTeams(seedNow(), rolled)
  next.rerolls = rolled.rerolls - 1
  await showReveal(next)
}

async function fightRolled(): Promise<void> {
  if (!rolled) return
  sfx.play('uiClick')
  const r = rolled
  await launch({
    arena: await loadArena(r.arena), mode: r.mode, ...setupSides(r.me, r.foe, await loadBotRoster()), difficulty: r.difficulty, seed: r.seed,
  })
}

async function startFromLoadout(): Promise<void> {
  await showReveal(await rollTeams(seedNow()))
}

/** the same teams and arena with a new seed (Rematch), or a fresh roll shown on the reveal (New bots / new decks) */
async function again(newBots: boolean): Promise<void> {
  if (!lastSetup) return
  if (newBots && rolled) {
    const next = await rollTeams(seedNow(), { ...rolled, arena: pickArena(st.arena, seedNow()) })
    next.rerolls = FREE_REROLLS
    await showReveal(next)
    return
  }
  await launch({ ...lastSetup, seed: seedNow() })
}

async function onMatchEnd(r: MatchRunner, winner: number): Promise<void> {
  const won = winner === r.s.players[0].team
  const draw = winner === 2
  setTimeout(() => sfx.play(draw ? 'lose' : won ? 'win' : 'lose'), 500)
  forfeited = false
  const box = () => { if (screen === 'result' && runner === r) renderResult(resultEl, r, reward, handlers, false) }
  // the KO gets a beat on screen before the result slides in
  setTimeout(() => {
    if (runner !== r || screen !== 'match') return
    show('result')
    renderResult(resultEl, r, reward, handlers, true)
  }, 1600)
  if (r.setup.botVsBot) { reward = { kind: 'none', reason: 'demo match (bot vs bot): no rewards' }; box(); return }
  if (!host) { reward = { kind: 'none', reason: 'no arena-host: nothing recorded' }; box(); return }
  try {
    const res = await api.matchResult(matchPayload(r, won))
    if (res.tokens != null) tokens = res.tokens
    if (res.progress) { progress = res.progress.points; perPack = res.progress.perPack }
    if (typeof res.tokens === 'number') tokens = res.tokens
    if ((res.points ?? 0) > 0 && !res.error && res.progress) {
      reward = { kind: 'granted', granted: res.granted, tokens: res.tokens ?? 0, points: res.points!, progress: res.progress.points, perPack: res.progress.perPack }
      setTimeout(() => sfx.play(res.granted > 0 ? 'win' : 'token'), res.granted > 0 ? 2000 : 1400)
    } else if (res.error) reward = { kind: 'none', reason: `no tokens: ${res.message ?? res.error}`, tokens: res.tokens, progress, perPack }
    else reward = { kind: 'none', reason: won ? 'no new tokens' : 'win to earn tokens', tokens: res.tokens, progress, perPack }
  } catch (e) {
    reward = { kind: 'error', message: (e as { message?: string }).message ?? 'error' }
  }
  box()
}

// ------------------------------------------------------------------ quitting a match (the user: "there should also be a
// quit match button"): the pause menu's Quit match (Q) and the HUD's small Quit button ask first, then the match ends
// as a forfeit: a loss, no pack tokens, recorded as `forfeit` in matches.jsonl; then a short result screen
/** the match on the result screen was a forfeit */
let forfeited = false

/** end the running match as a forfeit */
async function forfeit(): Promise<void> {
  const r = runner
  if (!r || screen !== 'match') return
  input.cancelAim()
  r.stop()
  forfeited = true
  pauseEl.classList.add('hidden')
  sfx.play('lose')
  reward = r.setup.botVsBot ? { kind: 'none', reason: 'demo match (bot vs bot): no rewards' }
    : !host ? { kind: 'none', reason: 'no arena-host: nothing recorded' } : { kind: 'pending' }
  show('result')
  renderResult(resultEl, r, reward, handlers, true, true)
  const w = window as unknown as { __arena?: Record<string, unknown> }
  if (w.__arena) w.__arena.forfeited = () => forfeited
  if (reward.kind !== 'pending') return
  try {
    const res = await api.matchResult(matchPayload(r, false, true))
    if (res.tokens != null) tokens = res.tokens
    reward = { kind: 'none', reason: 'a forfeit earns no tokens', tokens: res.tokens, progress, perPack }
  } catch (e) {
    reward = { kind: 'error', message: (e as { message?: string }).message ?? 'error' }
  }
  if ((screen as string) === 'result' && runner === r) renderResult(resultEl, r, reward, handlers, false, true)
}

/** the confirmation, in the pause menu (the match is paused while it asks) */
function askForfeit(): void {
  if (!runner || screen !== 'match') return
  if (!runner.paused) setPaused(true)
  input.cancelAim()
  pauseEl.innerHTML = `<div class="pause-box confirm"><div class="kicker">QUIT MATCH</div><h2>Forfeit?</h2>
    <p class="note">This counts as a loss, and a forfeit earns no pack tokens.</p>
    <div class="row"><button class="btn danger" id="forfeit-yes">Forfeit<small>Q · Enter</small></button>
    <button class="btn ghost" id="forfeit-no">Keep playing<small>Esc</small></button></div></div>`
  $<HTMLButtonElement>('#forfeit-yes').onclick = () => { void forfeit() }
  $<HTMLButtonElement>('#forfeit-no').onclick = () => setPaused(false)
}

function toLoadout(): void {
  runner?.stop()
  show('loadout')
  renderMenu()
  if (host) api.wallet().then((w) => { takeWallet(w); if (screen === 'loadout') renderMenu() }).catch(() => {})
}

/** the wallet's packs and the tokens toward the next one */
function takeWallet(w: { tokens: number; progress?: { points: number; perPack: number } }): void {
  tokens = w.tokens
  if (w.progress) { progress = w.progress.points; perPack = w.progress.perPack }
}

// ------------------------------------------------------------------ packs
/** where the pack screens go back to */
let packReturn: 'result' | 'loadout' = 'result'

function packBack(): void {
  sfx.play('uiClick')
  // the packs' cards join the roster (the first ones end the standalone welcome)
  const fresh = refreshCollection()
  if (packReturn === 'result' && runner) { show('result'); renderResult(resultEl, runner, rewardWithTokens(), handlers, false, forfeited) }
  else { toLoadout(); void fresh.then(() => { if (screen === 'loadout') renderMenu() }) }
}

/** the reward line with the wallet's current balance (after packs were opened) */
function rewardWithTokens(): Reward {
  if (reward.kind === 'granted' && tokens != null) return { ...reward, tokens }
  if (reward.kind === 'none') return { ...reward, tokens, progress, perPack }
  return reward
}

/** spend a token on a random pack (pokeshell rolls the set by pack price, then the pack) and open it in the scene;
 * after it, back to where it was asked for. The wallet is pokeshell's. No waiting: the scene (a mystery pack you can
 * already tear) opens at once, and the roll lands on it */
async function packFlow(from: 'result' | 'loadout' = 'result'): Promise<void> {
  packReturn = from
  show('packs')
  packEl.innerHTML = ''
  const stage = document.createElement('div')
  stage.className = 'pack-stage' // the scene lives in here
  packEl.appendChild(stage)
  let again = false, message = ''
  try {
    const r = await openRandomPack(stage)
    again = r.again
    if (typeof r.pack.tokens === 'number') tokens = r.pack.tokens
  } catch (e) {
    message = packErrorMessage(e)
  }
  try { takeWallet(await api.wallet()) } catch { /* keep the last known */ }
  if (again && !message && (tokens ?? 0) > 0) { void packFlow(packReturn); return }
  if (message) {
    packEl.innerHTML = `<div class="pack-stub"><div class="kicker">PACKS</div><h2>No pack this time</h2><p class="warn">${esc(message)}</p>
      ${oddsPanelHtml()}<div class="row"><button class="btn ghost" id="pk-back">Back<small>Esc</small></button></div></div>`
    bindOdds(packEl)
    packEl.querySelector<HTMLButtonElement>('#pk-back')!.onclick = packBack
    return
  }
  packBack()
}

const handlers = {
  rematch: () => { sfx.play('uiClick'); void again(false) },
  newBots: () => { sfx.play('uiClick'); void again(true) },
  loadout: () => { sfx.play('uiClick'); toLoadout() },
  openPack: () => { sfx.play('uiClick'); void packFlow('result') },
}

// ------------------------------------------------------------------ pause
function renderPause(): void {
  pauseEl.innerHTML = `<div class="pause-box"><h2>Paused</h2>
    <button class="btn" id="resume">Resume<small>Esc</small></button>
    <label class="vol">volume <input id="vol" type="range" min="0" max="100" value="${Math.round(sfx.volume * 100)}"></label>
    <label class="vol"><input id="mute" type="checkbox" ${sfx.muted ? 'checked' : ''}> mute <small>(M)</small></label>
    <button class="btn ghost" id="forfeit">Quit match<small>Q · counts as a loss</small></button>
    <p class="note"><span class="kbd">WASD</span> move · mouse aims · hold <span class="kbd">click</span> / <span class="kbd">J K L</span> to aim, release to fire · <span class="kbd">1-6</span> or a swap cancels · <span class="kbd">Space</span> dodge · <span class="kbd">1-6</span> swap (click a card after a KO) · <span class="kbd">F</span> evolve (<span class="kbd">Tab</span> picks) · hold <span class="kbd">I</span> for your attacks: card text, what they do here, and their damage on the foe (cyan while you aim)</p></div>`
  $<HTMLButtonElement>('#resume').onclick = () => setPaused(false)
  $<HTMLInputElement>('#vol').oninput = () => { sfx.volume = +$<HTMLInputElement>('#vol').value / 100; saveVolume() }
  $<HTMLInputElement>('#mute').onchange = () => { sfx.muted = $<HTMLInputElement>('#mute').checked; saveVolume() }
  $<HTMLButtonElement>('#forfeit').onclick = () => askForfeit()
}

function setPaused(p: boolean): void {
  if (!runner || screen !== 'match') return
  runner.paused = p
  if (p) input.cancelAim() // pausing drops the attack being aimed
  pauseEl.classList.toggle('hidden', !p)
  if (p) renderPause()
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  if (e.code === 'KeyM') { sfx.muted = !sfx.muted; saveVolume(); return }
  if (e.code === 'F3') { e.preventDefault(); toggleDebugOverlay(); return }
  if (screen === 'match' && runner?.paused && document.querySelector('#forfeit-yes')) {
    // the forfeit question: Q / Enter quits, Esc keeps playing
    if (e.code === 'KeyQ' || e.code === 'Enter') void forfeit()
    else if (e.code === 'Escape') setPaused(false)
    return
  }
  if (screen === 'match' && runner?.paused && e.code === 'KeyQ') { askForfeit(); return }
  if (screen === 'match' && e.code === 'Escape') { setPaused(!runner?.paused); return }
  if (screen === 'reveal') {
    if (e.code === 'Enter') void fightRolled()
    else if (e.code === 'KeyR') void reroll()
    else if (e.code === 'KeyI') toggleRevealDetails()
    else if (e.code === 'Escape') toLoadout()
    return
  }
  if (screen === 'result') {
    if (e.code === 'KeyR') handlers.rematch()
    else if (e.code === 'KeyN') handlers.newBots()
    else if (e.code === 'Escape') handlers.loadout()
    else if (e.code === 'KeyP' && (tokens ?? 0) > 0) handlers.openPack()
  } else if (screen === 'loadout' && e.code === 'Enter' && !(e.target instanceof HTMLInputElement)) {
    $<HTMLButtonElement>('#go')?.click()
  } else if (screen === 'packs' && e.code === 'Escape' && document.querySelector('#pk-back')) {
    packBack()
  }
})
setInterval(() => { if (screen === 'match' && input.padPause()) setPaused(!runner?.paused) }, 50)
window.addEventListener('pointerdown', () => sfx.unlock(), { once: true })
window.addEventListener('keydown', () => sfx.unlock(), { once: true })

// ------------------------------------------------------------------ boot
const HOWTO = `<ol class="howto">
  <li><b>Install pokeshell</b>, the Pokémon card game that lives in your terminal: every new Windows Terminal tab pulls a card.</li>
  <li><b>Catch cards</b>: open tabs (and use them) to catch what you pull, or open a booster with <code>pokeshell pack open &lt;set&gt;</code>.</li>
  <li><b>Come back</b>: every Pokémon card you caught is ready to battle here, and wins earn more packs.</li></ol>`

async function boot(): Promise<void> {
  setVolume()
  if (!arenas.length) {
    const ids = await arenaIndex().catch(() => ['growlithe-meadow'])
    arenas = await Promise.all(ids.map(async (id) => { try { return { id, name: (await loadArenaFile(id)).name } } catch { return { id, name: id } } }))
  }
  host = await probeHost()
  blocked = null
  collectionNote = ''
  if (!host) {
    blocked = { title: 'Start the arena with pokearena', body: `<p>The arena reads the cards you caught in pokeshell through its host. Run <code>pokearena</code> (it starts the host and opens this page).</p>${HOWTO}` }
  } else {
    if (!beating) { beating = true; startHeartbeat(hostLost) }
    void packSets() // warm it: pokeshell pack sets takes ~4 s, and a rolled pack's wrapper art needs it at once
    const wallet = api.wallet().then((w) => { takeWallet(w); if (screen === 'loadout') renderMenu() }).catch(() => {})
    teams = await loadTeams(true)
    try {
      const c = await api.collection()
      roster = collectionRoster(c.cards)
      rememberCardTexts(c.cards)
      if (!roster.length && standalone()) { await wallet; blocked = welcomeBlock() }
      else if (!roster.length) blocked = { title: 'No Pokémon caught yet', body: `<p>You battle with the cards you own, and your pokeshell binder has no caught Pokémon cards yet.</p>${HOWTO}` }
      else collectionNote = collectionNoteFor(roster.length)
    } catch (e) {
      const err = e as { status?: number; need?: string }
      if (err.status === 503) blocked = { title: 'pokeshell is not installed', body: `<p>The arena battles with the cards you caught in pokeshell, and it couldn't find pokeshell on this PC.</p>${HOWTO}` }
      else if (err.status === 501) blocked = { title: 'Update pokeshell', body: `<p>This pokeshell is too old to share its collection (the arena needs <code>${esc(err.need ?? 'pokeshell collection --json')}</code>). Update it, then check again.</p>` }
      else blocked = { title: "Couldn't read your collection", body: `<p class="note">${esc((e as { message?: string }).message ?? 'error')}</p>` }
    }
  }
  st = defaultLoadout(roster)
  const sel = teams.teams.find((t) => t.id === teams.selected)
  if (sel) applyTeam(st, sel, new Set(roster.map((e) => e.kit.card)))
  if (params.get('mode') === 'team' || params.get('mode') === '1v1') st.mode = params.get('mode') as Mode
  const d = params.get('diff')
  if (d && (BOT_LEVELS as string[]).includes(d)) st.difficulty = d as DifficultyName
  if (params.get('arena')) st.arena = params.get('arena')!
  if (params.get('deck') === 'random' || params.get('deck') === 'choose') st.deck = params.get('deck') as DeckMode
  if (params.get('team')) st.picks[st.mode] = params.get('team')!.split(',').filter((id) => roster.some((e) => e.kit.card === id)).slice(0, TEAM_MAX)
  show('loadout')
  renderMenu()
  if (params.get('auto')) await autoStart()
}

/** a URL-driven match (screenshots, tests) */
async function autoStart(): Promise<void> {
  const seed = parseInt(params.get('seed') ?? '1', 10)
  const demo = params.get('bots') === '1'
  const mode: Mode = params.get('mode') === 'team' ? 'team' : '1v1'
  const meIds = (params.get('me') ?? '').split(',').filter(Boolean)
  const cards = await loadBotRoster()
  let me: Side<RosterEntry> | BotTeam
  if (demo) {
    me = await botSide(st.difficulty, meIds.length || (mode === 'team' ? 3 : 1), seed + 99, meIds.length ? meIds : undefined)
  } else {
    if (blocked) return
    const mine = meIds.length ? meIds.map((id) => roster.find((e) => e.kit.card === id)).filter((e): e is RosterEntry => !!e) : picked({ ...st, mode }, roster)
    me = playerSide(mine, roster, cards, loanOf)
  }
  if (!me.members.length) return
  const foeIds = (params.get('foe') ?? '').split(',').filter(Boolean)
  const foe = await botSide(st.difficulty, mode === 'team' ? me.members.length : 1, seed, foeIds.length ? foeIds : undefined)
  const arena = await loadArena(pickArena(params.get('arena') ?? 'random', seed))
  await launch({ arena, mode, ...setupSides(me, foe, cards), difficulty: st.difficulty, seed, botVsBot: demo })
}

void boot()
