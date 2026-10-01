// From a won match to the pack opening (src/packs, docs/PACK_OPENING.md). pokeshell holds the pack-token wallet.
// Spending a token opens a RANDOM pack: `/api/pack/open {random: true}` runs `pokeshell pack open random --json`,
// which rolls the set weighted by its sealed pack's price, then the pack (it spends one token and records the
// pulls). No waiting: the pack scene opens at once with a mystery wrapper you can start tearing, while the host rolls in
// the background; a reel of the real wrappers spins over it and lands on the rolled set (src/packs/roll,
// docs/PACK_ROLL.md), never holding the tear. When it lands the wrapper re-skins to the rolled set with a ribbon
// ("Base Set pack! · 1 in 61", gold fanfare on the pack for the rare vintage ones). `/api/sets` (pokeshell pack sets --json) gives each set's art
// and its chance, for the odds panel and the wrapper.
import { sfx } from '../audio/sfx'
import { MYSTERY_SET, openPackScene, type PackResult, type SetInfo } from '../packs'
import { PackAudio } from '../packs/audio'
import { attachRollToScene, type RollHandle, type RollSet, type RollSoundDetail, type RollSoundEvent } from '../packs/roll'
import { api } from './api'

export interface ArenaSet extends SetInfo { openable?: boolean; cards?: number; price?: number; chance?: number; oneIn?: number | null }

/** what `pack open random --json` adds to a pack: which set was rolled and how likely it was */
export interface RandomPack extends PackResult { setChance?: number; setOneIn?: number | null; setPrice?: number; random?: boolean }

type SetsAnswer = { sets: ArenaSet[]; tokens: number | null; error?: string }
let setsCache: Promise<SetsAnswer> | null = null

/** the sets packs can be opened from (with their chance in a random pack), or why not; cached for the page */
export function packSets(fresh = false): Promise<SetsAnswer> {
  if (!setsCache || fresh) setsCache = loadSets()
  return setsCache
}

async function loadSets(): Promise<SetsAnswer> {
  try {
    const r = (await api.sets()) as { sets: ArenaSet[]; tokens?: number }
    const sets = (r.sets ?? []).filter((x) => x && typeof x.id === 'string' && x.openable !== false)
    return { sets, tokens: typeof r.tokens === 'number' ? r.tokens : null }
  } catch (e) {
    setsCache = null
    const err = e as { status?: number; need?: string; message?: string }
    if (err.status === 501) return { sets: [], tokens: null, error: `update pokeshell for pack opening (needs ${err.need ?? 'pokeshell pack sets --json'})` }
    if (err.status === 503) return { sets: [], tokens: null, error: 'pokeshell is not installed: packs need it' }
    return { sets: [], tokens: null, error: err.message ?? 'no sets' }
  }
}

/** "1 in 61", "1 in 9.4" */
export function oneInText(n: number | null | undefined): string {
  if (!n || !isFinite(n)) return ''
  return `1 in ${n >= 10 ? Math.round(n) : Math.round(n * 10) / 10}`
}

/** a pack rare enough for the big fanfare: the vintage sets (1 in 30 or rarer; about 1 in 60 each today) */
export function isRarePack(oneIn: number | null | undefined): boolean {
  return !!oneIn && oneIn >= 30
}

/** the set's name as a pack: pokeshell calls base1 "Base"; the game says "Base Set" */
export function packName(name: string): string {
  return name === 'Base' ? 'Base Set' : name
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

/** the "pack odds" panel: a closed disclosure; its table loads when it's opened */
export function oddsPanelHtml(): string {
  return '<details class="odds-panel"><summary>pack odds</summary><div class="odds-body"><span class="spin"></span></div></details>'
}

/** fill every odds panel under `root` when it's opened */
export function bindOdds(root: ParentNode): void {
  root.querySelectorAll<HTMLDetailsElement>('details.odds-panel').forEach((d) => {
    d.addEventListener('toggle', () => { if (d.open) void fillOdds(d) })
  })
}

/** the odds table's rows: every set with a chance, likeliest first */
export function oddsRows(sets: ArenaSet[]): { name: string; percent: string; oneIn: string; rare: boolean }[] {
  return sets
    .filter((x) => (x.chance ?? 0) > 0)
    .sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0))
    .map((x) => ({ name: packName(x.name), percent: `${((x.chance ?? 0) * 100).toFixed(1)}%`, oneIn: oneInText(x.oneIn), rare: isRarePack(x.oneIn) }))
}

async function fillOdds(d: HTMLDetailsElement): Promise<void> {
  const body = d.querySelector<HTMLElement>('.odds-body')
  if (!body || body.dataset.done) return
  const { sets, error } = await packSets()
  const rows = oddsRows(sets)
  body.dataset.done = '1'
  if (!rows.length) { body.innerHTML = `<p class="note">${esc(error ?? 'this pokeshell gives no pack odds yet')}</p>`; return }
  body.innerHTML = `<p class="note">A token opens a random pack: the set is rolled by its pack's price (cheap packs often, vintage ones rarely), then its cards.</p>
    <table>${rows.map((x) => `<tr class="${x.rare ? 'rare' : ''}"><td>${esc(x.name)}</td><td>${x.percent}</td><td>${x.oneIn}</td></tr>`).join('')}</table>`
}

/** why a pack didn't open, for the "No pack this time" card (402 no tokens, 409 no sets, 502 ...); no token was spent */
export function packErrorMessage(e: unknown): string {
  const err = (e ?? {}) as { status?: number; message?: string; error?: string }
  return err.status === 402 ? 'no packs left to open: wins earn tokens, 10 make a pack'
    : err.status === 409 ? `no pack to open: ${err.message ?? 'pokeshell has no set to roll'}`
    : `couldn't open a pack: ${err.message ?? err.error ?? 'error'}`
}

/** the ribbon on the pack once the roll lands: "Base Set pack!" / "1 in 61", and whether it gets the gold fanfare */
export function rollTag(res: RandomPack): { tag: string; sub: string; rare: boolean } {
  return { tag: `${packName(res.setName ?? res.set)} pack!`, sub: oneInText(res.setOneIn), rare: isRarePack(res.setOneIn) }
}

/** how long the rolled set's art may hold up the re-skin; after that the ribbon says which pack it was and the art
 * follows when `pokeshell pack sets` answers (it takes ~4 s cold, so main.ts warms it when the host is found) */
const SETS_WAIT_MS = 600

/** a set as the reel draws it (src/packs/roll): its chance in a random pack, and the pack name */
export function rollSetOf(x: ArenaSet): RollSet {
  return { id: x.id, name: packName(x.name), chance: x.chance ?? 0, oneIn: x.oneIn ?? null, series: x.series, packSize: x.packSize, art: x.art, hero: x.hero }
}

/** the roll's events voiced by the pack audio (src/packs/audio.ts roll(): CC0 samples, synth fallback; docs/PACK_ROLL.md
 * "Sound events"). One PackAudio for the page's rolls, made on the first event (the player has just clicked). */
let rollAudio: PackAudio | null = null
function rollSound(e: RollSoundEvent, d: RollSoundDetail = {}): void {
  try {
    rollAudio ??= new PackAudio()
    rollAudio.unlock()
    rollAudio.roll(e, d)
  } catch { /* never let a sound break the roll */ }
}

export interface RandomPackOptions {
  /** the set roll's reel over the pack (default on; docs/PACK_ROLL.md) */
  roll?: boolean
  /** a fixed reel strip (demo / captures) */
  seed?: number
  reducedMotion?: boolean
  autoplay?: boolean
}

/**
 * spend a token on a random pack and open it in the scene, inside `container`. The scene opens AT ONCE with a mystery
 * wrapper and the host call runs in the background: you can tear right away (the tear holds at 92% until the pack is
 * there). Over the pack, the set roll's reel (src/packs/roll, docs/PACK_ROLL.md) spins through the real wrappers and
 * lands on the rolled set; any touch resolves it at once. When it lands (or you grab it), the wrapper re-skins to the
 * rolled set with its ribbon, a rare vintage pack gets its gold fanfare in place. Resolves with the pack when the
 * player closes the summary, `again` when they pick "open another", or rejects with the host's error (402 no_tokens,
 * 409 no_sets, 502 ...), the scene already gone.
 */
export async function openRandomPack(container: HTMLElement, host: Pick<typeof api, 'openRandomPack'> = api, opts: RandomPackOptions = {}): Promise<{ pack: RandomPack; again: boolean }> {
  const setsP = packSets()
  let info: SetInfo | null = null
  let again = false
  let roll: RollHandle | null = null
  let skinned = false
  // the host rolls from the first frame; the reel only decides where it stops once this is in
  const hostP = host.openRandomPack() as unknown as Promise<RandomPack>
  hostP.catch(() => { /* the scene reports it */ })
  const fetchPack = async (): Promise<PackResult> => {
    const res = await hostP
    const late = new Promise<null>((r) => setTimeout(() => r(null), SETS_WAIT_MS))
    const got = await Promise.race([setsP, late])
    info = got?.sets.find((x) => x.id === res.set) ?? null
    if (!info) {
      // the art is late: keep the mystery foil for now (never a bare, artless wrapper) and re-skin when it comes
      void setsP.then(({ sets }) => {
        const s = sets.find((x) => x.id === res.set)
        if (s && !skinned) { skinned = true; scene.reskin({ set: s }) }
      })
    } else skinned = true
    // re-skin when the reel lands, not under it; a touch settles it at once, so this never holds the tear
    if (roll) await roll.settled
    return res
  }
  // the host serves pokeshell's web export at /pokeshell/ (a card's image URL = imageBase + card.image)
  const scene = openPackScene(container, {
    set: MYSTERY_SET,
    imageBase: '/pokeshell/',
    eager: true,
    fetchPack,
    reducedMotion: opts.reducedMotion,
    autoplay: opts.autoplay,
    reskin: (res) => {
      const t = rollTag(res as RandomPack)
      sfx.play(t.rare ? 'win' : 'token')
      return { set: info ?? undefined, ...t }
    },
    // autoplay, Skip, the reduced-motion Open button: the tear has started, the reel gets out of the way
    onPhase: (p) => { if (p !== 'idle') roll?.interrupt() },
    onOpenAnother: () => { again = true },
  })
  if (opts.roll !== false) {
    roll = attachRollToScene(container, {
      sets: setsP.then((a) => a.sets.map(rollSetOf)),
      result: hostP.then((r) => ({ set: r.set, setName: r.setName, oneIn: r.setOneIn })),
      imageBase: '/pokeshell/',
      seed: opts.seed,
      reducedMotion: opts.reducedMotion,
      sound: rollSound,
    })
  }
  try {
    const pack = (await scene.done) as RandomPack
    return { pack, again }
  } finally {
    roll?.destroy()
    scene.destroy()
  }
}
