// The result screen: victory / defeat, both teams as they ended, the match stats, and the reward moment: the tokens
// the win earned filling the bar toward the next pack (10 = 1 pack), a celebration when it completes one, and the way to
// the pack opening.
import type { MatchResult } from './api'
import type { MatchRunner } from './match'
import type { RosterEntry } from './kits'
import { spriteHtml } from './loadout'
import { bindOdds, oddsPanelHtml } from './packs'
import { enemyOutcomes, type ElimLog } from './elim'

export type Reward =
  | { kind: 'pending' }
  /** a win: `points` tokens toward the next pack, `progress` where the bar stands now (out of `perPack`), `granted` the
   * packs that completed, `tokens` the packs to open */
  | { kind: 'granted'; granted: number; tokens: number; points: number; progress: number; perPack: number }
  | { kind: 'none'; reason: string; tokens?: number | null; progress?: number | null; perPack?: number }
  | { kind: 'error'; message: string }

export interface ResultHandlers { rematch(): void; newBots(): void; loadout(): void; openPack(): void }

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

function side(r: MatchRunner, p: number, entries: RosterEntry[]): string {
  const pl = r.s.players[p]
  return `<div class="res-team">${pl.members.map((m, i) => {
    const e = entries[i]
    const frac = Math.max(0, m.hp / m.maxHp)
    const col = frac > 0.5 ? 'var(--hp-hi)' : frac > 0.2 ? 'var(--hp-mid)' : 'var(--hp-lo)'
    return `<div class="res-mon ${m.ko ? 'ko' : ''}">${e ? spriteHtml(e) : ''}<div class="res-hp"><i style="width:${frac * 100}%;background:${col}"></i></div><span>${e ? esc(e.kit.name) : ''}</span></div>`
  }).join('')}</div>`
}

function confetti(n: number): string {
  // the binder's colours: tab yellow, Pokédex blue, cover red, and a few energy types
  const cols = ['#ffcb05', '#4f9be8', '#d23a3f', '#4e9e3a', '#9a57b8', '#fbf8f1']
  let out = ''
  for (let i = 0; i < n; i++) {
    const x = Math.round(Math.random() * 100), d = (Math.random() * 1.2).toFixed(2), r = Math.round(Math.random() * 360)
    out += `<i style="left:${x}%;background:${cols[i % cols.length]};animation-delay:${d}s;--r:${r}deg"></i>`
  }
  return `<div class="confetti">${out}</div>`
}

/** "3 packs to open" */
function packsText(n: number): string {
  return `<b>${n}</b> pack${n === 1 ? '' : 's'} to open`
}

/** where the bar starts and ends for a win's tokens: from `before`, filling `laps` whole packs, to `after` */
export function progressSteps(r: { points: number; progress: number; perPack: number; granted: number }): { before: number; after: number; laps: number } {
  const before = Math.max(0, r.progress + r.granted * r.perPack - r.points)
  return { before, after: r.progress, laps: r.granted }
}

function rewardHtml(reward: Reward, first: boolean): string {
  switch (reward.kind) {
    case 'pending': return '<div class="reward pending"><span class="spin"></span> recording the match…</div>'
    case 'granted': {
      const { before, after, laps } = progressSteps(reward)
      const per = reward.perPack
      // the bar: from where it was, filled by this win (round the track once per pack completed), to where it is
      const startW = first ? (before / per) * 100 : (after / per) * 100
      const bar = `<div class="prog" data-from="${before}" data-to="${after}" data-laps="${laps}" data-per="${per}" data-anim="${first ? 1 : 0}">
          <div class="prog-bar"><i style="width:${startW}%"></i></div><span class="prog-num"><b>${first ? before : after}</b> / ${per}</span></div>`
      if (laps <= 0) {
        return `<div class="reward won">
          <div class="token-pop"><div class="token3d"><span>★</span></div><div class="plus">+${reward.points}</div></div>
          <div class="reward-text"><b>token${reward.points === 1 ? '' : 's'} earned!</b><span>toward your next pack (${per} tokens = 1 pack)</span>${bar}</div>
          ${reward.tokens ? `<div class="pack-go"><span class="dim">${packsText(reward.tokens)}</span><button class="btn pack" id="open-pack">Open a pack<small>P · a random set</small></button>${oddsPanelHtml()}</div>` : ''}
        </div>`
      }
      return `<div class="reward won pack-done">
        <div class="token-pop"><div class="token3d"><span>★</span></div><div class="plus">+${reward.points}</div></div>
        <div class="reward-text"><b><span class="pack-earned">${laps > 1 ? `${laps} packs` : 'a pack'} earned!</span></b>
          <span>you have <b class="count-up" data-to="${reward.tokens}">${first ? Math.max(0, reward.tokens - reward.granted) : reward.tokens}</b> to open</span>${bar}</div>
        <div class="pack-go"><button class="btn pack" id="open-pack">Open a pack<small>P · a random set</small></button>${oddsPanelHtml()}</div>
      </div>`
    }
    case 'none': {
      const prog = reward.progress != null ? ` · <b>${reward.progress}</b> / ${reward.perPack ?? 10} tokens to the next pack` : ''
      return `<div class="reward"><span class="dim">${esc(reward.reason)}</span>${prog}${reward.tokens ? ` · ${packsText(reward.tokens)} <button class="mini" id="open-pack">Open a pack</button> ${oddsPanelHtml()}` : ''}</div>`
    }
    case 'error': return `<div class="reward"><span class="warn">couldn't record the match: ${esc(reward.message)}</span></div>`
  }
}

/** fill the bar: from `from` up through each completed pack (the bar fills, flashes, starts again) to `to` */
function animateProgress(el: HTMLElement, onPack: () => void): void {
  const p = el.querySelector<HTMLElement>('.prog')
  if (!p || p.dataset.anim !== '1') return
  const fill = p.querySelector<HTMLElement>('.prog-bar > i')!, num = p.querySelector<HTMLElement>('.prog-num b')!
  const per = +p.dataset.per!, to = +p.dataset.to!
  let laps = +p.dataset.laps!, at = +p.dataset.from!
  const step = () => {
    const target = laps > 0 ? per : to
    fill.style.transition = 'width 0.7s cubic-bezier(0.3, 0.9, 0.4, 1)'
    fill.style.width = `${(target / per) * 100}%`
    let k = at
    const count = () => { if (k < target) { k++; num.textContent = String(k); setTimeout(count, Math.max(40, 600 / Math.max(1, target - at))) } }
    count()
    if (laps <= 0) return
    setTimeout(() => {
      laps--
      p.classList.add('full')
      onPack()
      setTimeout(() => {
        p.classList.remove('full')
        fill.style.transition = 'none'
        fill.style.width = '0%'
        num.textContent = '0'
        at = 0
        void fill.offsetWidth
        step()
      }, 650)
    }, 800)
  }
  setTimeout(step, 1100)
}

/** how the match ended, in words: an elimination, or the time cap */
export function howItEnded(r: Pick<MatchRunner, 's' | 'def'>, won: boolean, draw: boolean): string {
  const out = (p: number) => r.s.players[p].members.every((m) => m.ko)
  const one = r.def.mode === '1v1'
  if (out(1) && !out(0)) return one ? 'The bot’s Pokémon was knocked out' : 'Bot team eliminated'
  if (out(0) && !out(1)) return one ? 'Your Pokémon was knocked out' : 'Your team was eliminated'
  // the time cap: never let it read like an early win (the user: "im still not having to kill all the enemies")
  if (draw) return 'Time! Dead even on HP'
  return won ? 'Time! You had more HP left' : 'Time! The bot had more HP left'
}

/** did the match end on the time cap (nobody eliminated) */
export function endedOnTime(r: Pick<MatchRunner, 's'>): boolean {
  return r.s.phase === 'over' && !r.s.players.some((p) => p.members.every((m) => m.ko))
}

/** the bot's team, each Pokémon with how it went down (by whom, or still standing when time ran out) */
export function enemyListHtml(r: Pick<MatchRunner, 's' | 'def'> & { elim?: ElimLog }): string {
  if (!r.elim || r.def.mode !== 'team') return ''
  const rows = enemyOutcomes(r.def, r.s, r.elim, 1)
  return `<ul class="res-foes">${rows.map((o) => `<li class="${o.outcome}"><b>${esc(o.name)}</b><span>${esc(o.text)}</span></li>`).join('')}</ul>`
}

/** what the host records for a finished match (POST /api/match/result). A forfeit is always a loss, and says so */
export function matchPayload(r: Pick<MatchRunner, 's' | 'def' | 'setup'>, won: boolean, forfeit = false): MatchResult {
  return {
    matchId: `${r.setup.seed.toString(16)}-${Date.now().toString(16)}`, mode: r.def.mode, difficulty: r.setup.difficulty,
    won: forfeit ? false : won, ...(forfeit ? { forfeit: true } : {}),
    prizes: r.s.players[0].kos, ticks: r.s.tick, seed: r.setup.seed, arena: r.setup.arena.def.id,
    team: (r.setup.mePicked ?? r.setup.me).map((e) => e.kit.card), opponent: (r.setup.foePicked ?? r.setup.foe).map((e) => e.kit.card),
  }
}

/** the result screen; `forfeit`: you quit the match (a loss, whatever the state of the fight) */
export function renderResult(el: HTMLElement, r: MatchRunner, reward: Reward, h: ResultHandlers, first: boolean, forfeit = false): void {
  const winner = forfeit ? r.s.players[1].team : r.s.winner
  const me = r.s.players[0].team
  const won = !forfeit && winner === me, draw = !forfeit && winner === 2
  const secs = Math.round((r.s.fightT || r.s.phaseT) / 60)
  const st = r.stats
  const onTime = !forfeit && endedOnTime(r)
  const title = forfeit ? 'FORFEIT' : draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT'
  // no prizes: a side wins by knocking out the other's whole team (the user: "full team elimination for now")
  const ko = r.s.players.map((p) => p.members.filter((m) => m.ko).length)
  const size = r.s.players.map((p) => p.members.length)
  const how = forfeit ? 'You quit the match: it counts as a loss' : howItEnded(r, won, draw)
  el.innerHTML = `<div class="result-box ${draw ? 'draw' : won ? 'win' : 'lose'} ${first ? 'enter' : ''}">
    ${won && first ? confetti(60) : ''}
    <div class="res-kicker">${onTime ? (draw ? 'TIME! · A DRAW ON HP' : won ? 'TIME! · WON ON HP, NOT BY ELIMINATION' : 'TIME! · LOST ON HP') : 'MATCH RESULT'}</div>
    <div class="res-title">${title}</div>
    <p class="res-how">${esc(how)}</p>
    <p class="res-sub">${esc(r.setup.arena.def.name)} · ${r.def.mode === 'team' ? `team ${r.def.players[0].members.length}v${r.def.players[1].members.length}` : '1v1'} · ${esc(r.setup.difficulty)} bots · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</p>
    <div class="res-vs">
      <div><h4>You <small>${ko[0]}/${size[0]} KO'd</small></h4>${side(r, 0, r.setup.me)}</div>
      <div class="vs">VS</div>
      <div><h4>Bot <small>${ko[1]}/${size[1]} KO'd</small></h4>${side(r, 1, r.setup.foe)}</div>
    </div>
    ${enemyListHtml(r)}
    <div class="res-stats">
      <div><b>${st.dealt[0]}</b><span>damage dealt</span></div>
      <div><b>${st.kos[0]}</b><span>knockouts</span></div>
      <div><b>${st.biggest[0]}</b><span>biggest hit</span></div>
      <div><b>${st.supers[0]}</b><span>super effective</span></div>
      <div><b>${st.dealt[1]}</b><span>damage taken</span></div>
    </div>
    ${rewardHtml(reward, first)}
    <div class="res-btns"><button class="btn" id="again">Rematch<small>R</small></button><button class="btn ghost" id="newbots">New bots<small>N</small></button><button class="btn ghost" id="back">Loadout<small>Esc</small></button></div>
  </div>`
  const $ = (s: string) => el.querySelector<HTMLButtonElement>(s)
  $('#again')!.onclick = h.rematch
  $('#newbots')!.onclick = h.newBots
  $('#back')!.onclick = h.loadout
  bindOdds(el)
  const pack = $('#open-pack')
  if (pack) pack.onclick = h.openPack
  // the bar fills with the win's tokens; completing a pack lights it up
  animateProgress(el, () => el.querySelector('.reward.pack-done')?.classList.add('celebrate'))
  // the pack counter ticks up
  const cu = el.querySelector<HTMLElement>('.count-up')
  if (cu) {
    const to = +cu.dataset.to!, from = +cu.textContent!
    let k = 0
    const tick = () => { k++; cu.textContent = String(Math.min(to, from + k)); if (from + k < to) setTimeout(tick, 220) }
    setTimeout(tick, 900)
  }
}
