// One match on the page: the fixed 60 Hz loop (sim steps from an accumulator, at most 5 per frame), bots, input,
// and the renderer interpolating between the last two ticks. 1v1 (one Pokémon each) or team (3-6 each, bench swaps).
// Hit-stop and pause only hold the page loop back: the sim never sees them, so a replay (seed + inputs) is unchanged.
import { BotDriver, DIFFICULTY, type DifficultyName } from '../bots/bot'
import { createBot } from '../bots'
import type { Input } from '../input/input'
import { pickerSlotAt, type AimPrediction, type PeekInfo } from '../render/hud'
import { TickLoop } from '../render/pose'
import { Renderer } from '../render/renderer'
import { preload } from '../render/sprites'
import { FP } from '../sim/fixed'
import { createState, hashState } from '../sim/state'
import { isTopStage, type EvoCard } from '../sim/evolution'
import { evolveOptions, step } from '../sim/step'
import { aimBlocked, aimTarget, predictDamage } from '../sim/predict'
import { aimInfo, type AimInfo } from './aiminfo'
import { sheetOf } from './attacksheet'
import type { InputFrame, MatchDef, SimState } from '../sim/types'
import type { LoadedArena } from './arena'
import type { RosterEntry } from './kits'
import { ElimLog } from './elim'

export interface MatchSetup {
  arena: LoadedArena
  mode: '1v1' | 'team'
  /** your Pokémon, lead first (one in 1v1) */
  me: RosterEntry[]
  foe: RosterEntry[]
  /** owned cards your Pokémon can evolve into mid-match (docs/SPEC.md section 6), and the bot's */
  meEvolutions?: RosterEntry[]
  foeEvolutions?: RosterEntry[]
  /** per slot: the steps from the card it enters as (`me[i]`) up to the card picked for it (docs/SPEC.md section 6,
   * start lines), and the bot's */
  mePaths?: RosterEntry[][]
  foePaths?: RosterEntry[][]
  /** the cards picked or rolled for each slot (what `me[i]` evolves toward), for the result record */
  mePicked?: RosterEntry[]
  foePicked?: RosterEntry[]
  /** every card there is, to tell a top stage from a card whose evolution you don't own (the HUD's reason) */
  allCards?: readonly EvoCard[]
  difficulty: DifficultyName
  seed: number
  /** a bot plays you too (demo / screenshots): no rewards */
  botVsBot?: boolean
  matchTicks?: number
}

/** what happened, for the result screen (render-side bookkeeping from sim events) */
export interface MatchStats { dealt: number[]; kos: number[]; biggest: number[]; supers: number[]; swaps: number[]; evolves: number[] }

export class MatchRunner {
  readonly def: MatchDef
  readonly s: SimState
  readonly renderer: Renderer
  private loop: TickLoop
  private bots: (BotDriver | null)[]
  private raf = 0
  private ended = false
  paused = false
  readonly inputLog: InputFrame[][] = []
  readonly stats: MatchStats = { dealt: [0, 0], kos: [0, 0], biggest: [0, 0], supers: [0, 0], swaps: [0, 0], evolves: [0, 0] }
  onEnd: (s: SimState) => void = () => {}
  /** the aim prediction (render-only): recomputed at most every PREDICT_EVERY frames while an attack is held */
  private pred: AimPrediction | null = null
  /** the aim info (render-only): the held attack's badges and strip, refreshed with the prediction */
  private info: AimInfo | null = null
  private peekInfo: PeekInfo | null = null
  private frameN = 0
  private predAt = -1e9
  private peekAt = -1e9
  /** who has been on the field and how each Pokémon went down (the team strip, the KO banner, the result list) */
  readonly elim: ElimLog

  constructor(readonly canvas: HTMLCanvasElement, readonly input: Input, readonly setup: MatchSetup) {
    const mine = setup.mode === '1v1' ? setup.me.slice(0, 1) : setup.me
    const theirs = setup.mode === '1v1' ? setup.foe.slice(0, 1) : setup.foe
    const evA = setup.meEvolutions ?? [], evB = setup.foeEvolutions ?? []
    const pathA = mine.map((_, i) => setup.mePaths?.[i] ?? []), pathB = theirs.map((_, i) => setup.foePaths?.[i] ?? [])
    const kits = [...mine, ...theirs, ...evA, ...evB, ...pathA.flat(), ...pathB.flat()].map((e) => e.kit)
    const idx = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i)
    const nA = mine.length, nB = theirs.length
    // each slot's line cards get their own kit indexes, after the evolutions
    let at = nA + nB + evA.length + evB.length
    const place = (paths: RosterEntry[][]) => paths.map((p) => p.map(() => at++))
    const pA = place(pathA), pB = place(pathB)
    const topKits = setup.allCards ? kits.map((k, i) => (isTopStage(k, setup.allCards) ? i : -1)).filter((i) => i >= 0) : undefined
    this.def = {
      mode: setup.mode, seed: setup.seed, arena: setup.arena.def, kits, matchTicks: setup.matchTicks,
      players: [
        { team: 0, name: setup.botVsBot ? `Bot (${botLevel(setup)})` : 'You', members: idx(0, nA), shiny: mine.map((e) => e.shiny), energy: [],
          evolutions: idx(nA + nB, evA.length), evolutionShiny: evA.map((e) => e.shiny),
          paths: pA, pathShiny: pathA.map((p) => p.map((e) => e.shiny)), pathLoaner: pathA.map((p) => p.map((e) => !!e.loaner)), loanerMembers: mine.map((e) => !!e.loaner) },
        { team: 1, name: `Bot (${setup.difficulty})`, members: idx(nA, nB), shiny: theirs.map((e) => e.shiny), energy: [],
          evolutions: idx(nA + nB + evA.length, evB.length), evolutionShiny: evB.map((e) => e.shiny),
          paths: pB, pathShiny: pathB.map((p) => p.map((e) => e.shiny)) },
      ],
      topKits,
    }
    this.s = createState(this.def)
    this.elim = new ElimLog(this.s)
    this.loop = new TickLoop(this.s, () => this.runTick())
    this.renderer = new Renderer(canvas, setup.arena, this.def)
    const diff = DIFFICULTY[setup.difficulty]
    const mirror = DIFFICULTY[botLevel(setup)]
    this.bots = [
      setup.botVsBot ? new BotDriver(createBot(botLevel(setup)), this.def, 0, mirror, setup.seed * 7 + 1) : null,
      new BotDriver(createBot(setup.difficulty), this.def, 1, diff, setup.seed * 7 + 2),
    ]
    input.evoCount = () => (this.bots[0] ? 0 : evolveOptions(this.def, this.s, 0).length)
    input.pickAt = (x, y) => (this.bots[0] ? 0 : pickerSlotAt(this.s, 0, x, y))
  }

  async start(): Promise<void> {
    const all = [...this.setup.me, ...this.setup.foe, ...(this.setup.meEvolutions ?? []), ...(this.setup.foeEvolutions ?? []), ...(this.setup.mePaths ?? []).flat(), ...(this.setup.foePaths ?? []).flat()]
    await preload(all.map((e) => ({ character: e.kit.character, shiny: e.shiny })))
    this.loop.reset(performance.now())
    const loop = (t: number) => {
      this.frame(t)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
    this.input.evoCount = () => 0
    this.input.pickAt = () => 0
    this.input.cancelAim()
  }

  private humanFrame(): InputFrame {
    const f = this.s.players[0].fighter
    return this.input.frame(f.x / FP, f.y / FP)
  }

  /** advance one tick (also used by tests and the screenshot tool through window.__arena) */
  tick(): void {
    this.loop.tick()
  }

  private runTick(): number {
    const inputs = [this.bots[0] ? this.bots[0].input(this.s) : this.humanFrame(), this.bots[1]!.input(this.s)]
    this.inputLog.push(inputs)
    step(this.def, this.s, inputs)
    this.count()
    this.elim.feed(this.s, this.s.events)
    this.renderer.feed(this.s.events, this.s)
    if (this.s.phase === 'over' && !this.ended) {
      this.ended = true
      this.onEnd(this.s)
    }
    return this.renderer.takeHitstop()
  }

  private count(): void {
    const team = (p: number) => this.s.players[p]?.team ?? p
    for (const e of this.s.events) {
      if (e.k === 'dmg' && (e.src ?? -1) >= 0 && e.src !== e.p) {
        const t = team(e.src!)
        this.stats.dealt[t] += e.amount
        this.stats.biggest[t] = Math.max(this.stats.biggest[t], e.amount)
        if (e.eff > 0) this.stats.supers[t]++
      } else if (e.k === 'ko') this.stats.kos[1 - team(e.p)]++
      else if (e.k === 'swap') this.stats.swaps[team(e.p)]++
      else if (e.k === 'evolve') this.stats.evolves[team(e.p)]++
    }
  }

  /** the damage the held attack would do to the foe it's aimed at (or the nearest, dimmed): a dry run of the sim's own
   * pipeline on a copy of the state (src/sim/predict.ts), a few times a second, never touching the match */
  private predict(held: number): AimPrediction | null {
    if (!held || this.s.phase !== 'fight') { this.pred = null; this.info = null; return null }
    const pl = this.s.players[0]
    if (pl.active < 0) { this.pred = null; this.info = null; return null }
    if (this.info && this.info.attack === held - 1 && this.frameN - this.predAt < PREDICT_EVERY) return this.pred
    this.predAt = this.frameN
    const f = pl.fighter
    const { target, onPath } = aimTarget(this.def, this.s, 0, held - 1, f.aim)
    const p = target >= 0 ? predictDamage(this.def, this.s, 0, held - 1, target) : null
    const blocked = !!p && onPath && aimBlocked(this.def, this.s, 0, held - 1, target)
    this.pred = p ? { attack: held - 1, target, onPath, p, blocked } : null
    this.info = aimInfo(this.def, this.s, 0, held - 1, p, blocked)
    return this.pred
  }

  /** the peek (hold I): the active Pokémon's sheet, with each attack's prediction against the nearest foe */
  private peek(on: boolean): PeekInfo | null {
    const pl = this.s.players[0]
    if (!on || pl.active < 0 || this.bots[0]) { this.peekInfo = null; return null }
    const kit = this.def.kits[pl.members[pl.active].kit]
    if (this.peekInfo && this.peekInfo.kit === kit && this.frameN - this.peekAt < PEEK_EVERY) return this.peekInfo
    this.peekAt = this.frameN
    const { target } = aimTarget(this.def, this.s, 0, 0, pl.fighter.aim)
    const fight = this.s.phase === 'fight' && target >= 0
    this.peekInfo = {
      kit, target, sheet: sheetOf(kit),
      predictions: kit.attacks.map((_, i) => (fight ? predictDamage(this.def, this.s, 0, i, target) : null)),
    }
    return this.peekInfo
  }

  private frame(t: number): void {
    const alpha = this.loop.frame(t, this.paused)
    this.frameN++
    const held = this.bots[0] ? 0 : this.input.aiming()
    this.renderer.render(this.loop.prev, this.s, alpha, {
      me: 0,
      names: [this.def.players[0].name, this.def.players[1].name],
      difficulty: this.setup.difficulty,
      arenaName: this.setup.arena.def.name,
      keys: ['LMB · J', 'RMB · K', 'MMB · L'],
      mode: this.setup.mode,
      paused: this.paused,
      evoPick: this.input.evoPick(),
      aiming: held,
      predict: this.predict(held),
      aimInfo: held ? this.info : null,
      peek: this.peek(!this.paused && this.input.peeking()),
      seen: this.elim.seen,
      pointer: this.bots[0] ? null : this.input.pointer(),
    })
  }

  hash(): string {
    return hashState(this.s)
  }
}

/** frames between aim predictions (each is a few dry runs of the cast; ~10 a second at 60 fps) */
const PREDICT_EVERY = 6
/** frames between peek refreshes (every attack of the active Pokémon) */
const PEEK_EVERY = 15

/** in a bot-vs-bot demo your side is played by a Normal bot (a Hard one against Expert) */
function botLevel(setup: MatchSetup): DifficultyName {
  return setup.difficulty === 'expert' ? 'hard' : 'normal'
}
