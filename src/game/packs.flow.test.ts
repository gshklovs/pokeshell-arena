// @vitest-environment happy-dom
// The random-pack flow without waiting: the scene opens before the host answers, the set roll's reel spins over it and
// a touch resolves it at once, the pack re-skins when the reel lands, closes
// cleanly on an error; and a plain tap on the pack doesn't open it (TAP_OPENS = false) while Enter does.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { openRandomPack, packErrorMessage, packSets, type RandomPack } from './packs'
import { TAP_OPENS, openPackScene, type PackResult } from '../packs'
import { revealBy, shakeCharge, shakeFlips } from '../packs/scene'

const card = (i: number, tier = 'common') => ({ id: `base1-${i}`, name: `Card ${i}`, rarity: 'Common', tier, slot: 'common', shiny: false, isNew: true, image: `img/pokemon/c${i}/base1-${i}.png` })
const PACK: RandomPack = { set: 'base1', setName: 'Base', packId: 'X', cards: [1, 2, 3].map((i) => card(i)), tokens: 4, setOneIn: 61, setChance: 1 / 61, random: true }
const BASE_SET = { id: 'base1', name: 'Base Set', series: 'Base', hero: 'img/pokemon/charizard/base1-4.png', art: { colors: ['#1c3f8f', '#e23b2e', '#ffcb05'], accent: '#ffffff', motif: 'classic' } }

function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

beforeAll(() => {
  // no 2D canvas in happy-dom: a context whose every method is a no-op
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? document.createElement('canvas') : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true })
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext']
  HTMLCanvasElement.prototype.toDataURL = () => 'data:,'
})

let container: HTMLElement
beforeEach(async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  vi.spyOn(api, 'sets').mockResolvedValue({ sets: [BASE_SET], tokens: 5 } as never)
  await packSets(true)
})
afterEach(() => { container.remove(); vi.restoreAllMocks() })

describe('a random pack opens without waiting', () => {
  it('(a) creates the scene before the host has answered', async () => {
    const host = deferred<PackResult>()
    const run = openRandomPack(container, { openRandomPack: () => host.promise as never })
    const scene = container.querySelector('.pk-scene')
    expect(scene).not.toBeNull()
    expect(scene!.classList.contains('pk-mystery')).toBe(true)
    expect(container.querySelector('.pk-pack')).not.toBeNull()
    expect(container.querySelector('.pk-packtag')!.textContent).toContain('rolling')
    host.reject({ status: 499 }); await run.catch(() => {})
  })

  it('(b) re-skins the wrapper to the rolled set when the roll lands', { timeout: 20000 }, async () => {
    const host = deferred<PackResult>()
    const run = openRandomPack(container, { openRandomPack: () => host.promise as never })
    expect(container.querySelector('.pk-hud__title')!.textContent).toContain('Mystery')
    // the set roll's reel spins over the pack (src/packs/roll) and the re-skin waits for its landing
    await tick(20)
    expect(container.querySelector('.pkr-canvas')).not.toBeNull()
    host.resolve(PACK)
    await tick(20)
    const scene = container.querySelector('.pk-scene')!
    expect(scene.classList.contains('pk-mystery')).toBe(true)
    await vi.waitFor(() => expect(scene.classList.contains('pk-mystery')).toBe(false), { timeout: 4000, interval: 20 })
    expect(container.querySelector('.pk-hud__title')!.textContent).toContain('Base Set')
    expect(container.querySelector('.pk-pack__body svg')!.innerHTML).toContain('BASE SET')
    const tag = container.querySelector('.pk-packtag')!
    expect(tag.textContent).toContain('Base Set pack!')
    expect(tag.textContent).toContain('1 in 61')
    expect(tag.classList.contains('is-rare')).toBe(true) // 1 in 61: the vintage fanfare, on the pack
    // the seam glow now carries the best card's aura, not the neutral leak
    expect((scene as HTMLElement).style.getPropertyValue('--leak')).not.toBe('')
    // straight to the summary and Done: the flow resolves and tears the scene down (no frame loop left running)
    ;(scene as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 's' }))
    ;(scene as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await vi.waitFor(() => expect(container.querySelector('.pk-summary .pk-btn--main')).not.toBeNull(), { timeout: 10000, interval: 100 })
    container.querySelector<HTMLButtonElement>('.pk-summary .pk-btn--main')!.click()
    const done = await run
    expect(done.pack.set).toBe('base1')
    expect(container.querySelector('.pk-scene')).toBeNull()
  })

  it('(b2) the set art shows after the roll lands, even when pokeshell pack sets answers late (the art never vanishes)', { timeout: 20000 }, async () => {
    const sets = deferred<unknown>()
    vi.spyOn(api, 'sets').mockReturnValue(sets.promise as never)
    void packSets(true) // the page asks for the sets; pokeshell takes its time
    const host = deferred<PackResult>()
    const run = openRandomPack(container, { openRandomPack: () => host.promise as never }, { roll: false })
    host.resolve(PACK)
    await tick(900) // past the art's wait: the pack is here, its set's art is not
    const img = () => container.querySelector('.pk-pack__body svg image')
    expect(container.querySelector('.pk-packtag')!.textContent).toContain('Base Set pack!')
    expect(container.querySelector('.pk-pack__body svg')!.innerHTML).toContain('MYSTERY') // still the full mystery art, not a bare wrapper
    sets.resolve({ sets: [BASE_SET], tokens: 5 })
    await tick(20)
    expect(img()?.getAttribute('href')).toBe('/pokeshell/img/pokemon/charizard/base1-4.png')
    expect(container.querySelector('.pk-pack__body svg')!.innerHTML).toContain('BASE SET')
    // and the peeling strip draws the same artwork
    const use = container.querySelector('.pk-seg__face use')!.getAttribute('href')!
    expect(container.querySelector(use)).not.toBeNull()
    expect(container.querySelector(use)!.querySelector('image')?.getAttribute('href')).toBe('/pokeshell/img/pokemon/charizard/base1-4.png')
    const scene = container.querySelector<HTMLElement>('.pk-scene')!
    scene.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }))
    scene.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await vi.waitFor(() => expect(container.querySelector('.pk-summary .pk-btn--main')).not.toBeNull(), { timeout: 10000, interval: 100 })
    container.querySelector<HTMLButtonElement>('.pk-summary .pk-btn--main')!.click()
    await run
  })

  it('(b3) grabbing the pack mid-roll resolves the reel at once: the re-skin follows the host, not the animation', { timeout: 20000 }, async () => {
    const host = deferred<PackResult>()
    const run = openRandomPack(container, { openRandomPack: () => host.promise as never })
    await tick(20)
    const scene = container.querySelector<HTMLElement>('.pk-scene')!
    host.resolve(PACK)
    await tick(5)
    expect(container.querySelector('.pkr-canvas')).not.toBeNull()
    // a touch on the pack's tear strip: the reel gets out of the way in the same tick
    container.querySelector('.pk-pack')!.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 1, pointerType: 'mouse', bubbles: true }))
    await tick(5)
    expect(scene.classList.contains('pk-mystery')).toBe(false)
    expect(container.querySelector('.pk-hud__title')!.textContent).toContain('Base Set')
    await vi.waitFor(() => expect(container.querySelector('.pkr-canvas')).toBeNull(), { timeout: 2000, interval: 20 })
    scene.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }))
    scene.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await vi.waitFor(() => expect(container.querySelector('.pk-summary .pk-btn--main')).not.toBeNull(), { timeout: 10000, interval: 100 })
    container.querySelector<HTMLButtonElement>('.pk-summary .pk-btn--main')!.click()
    expect((await run).pack.set).toBe('base1')
  })

  it('(c) an error closes the scene and says why; the flow shows the "No pack this time" stub', async () => {
    const host = deferred<PackResult>()
    const run = openRandomPack(container, { openRandomPack: () => host.promise as never })
    expect(container.querySelector('.pk-scene')).not.toBeNull()
    host.reject({ status: 402, error: 'no_tokens', message: 'no pack tokens' })
    const err = await run.then(() => null, (e) => e)
    expect(err).toMatchObject({ status: 402 })
    expect(container.querySelector('.pk-scene')).toBeNull()
    expect(packErrorMessage(err)).toBe('no packs left to open: wins earn tokens, 10 make a pack')
    expect(packErrorMessage({ status: 409, message: 'no sets' })).toBe('no pack to open: no sets')
    expect(packErrorMessage({ status: 502, message: 'pokeshell failed' })).toBe("couldn't open a pack: pokeshell failed")
  })
})

describe('tap vs drag', () => {
  it('(d) with TAP_OPENS = false a tap on the pack only nudges the hint; Enter opens it', async () => {
    expect(TAP_OPENS).toBe(false)
    const phases: string[] = []
    const scene = openPackScene(container, { set: BASE_SET, fetchPack: () => Promise.resolve(PACK), eager: true, sound: false, onPhase: (p) => phases.push(p) })
    await tick(10)
    const root = container.querySelector<HTMLElement>('.pk-scene')!
    const ev = (type: string) => new PointerEvent(type, { clientX: 0, clientY: 0, pointerId: 1, pointerType: 'mouse', bubbles: true })
    root.dispatchEvent(ev('pointerdown'))
    root.dispatchEvent(ev('pointerup'))
    await tick(1200)
    expect(root.classList.contains('pk-hint-nudge')).toBe(true)
    expect(phases).not.toContain('torn')
    expect(root.dataset.phase).toBe('idle')
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(phases).toContain('torn'), { timeout: 4000, interval: 50 })
    scene.destroy()
  })
})

describe('shake to reveal (pack v3b)', () => {
  const gold = { ...card(9, 'rare-secret'), fx: 'gold' as const, hit: 5, name: 'Gold 9' }
  const PACK_HIT: PackResult = { set: 'base1', packId: 'H', cards: [card(1), card(2), gold] }
  /** open a pack and play it up to the last (the hit) card, face down; returns the scene root */
  async function toLastCard(opts: { reducedMotion?: boolean } = {}) {
    const phases: { p: string; i?: number }[] = []
    const scene = openPackScene(container, { set: BASE_SET, fetchPack: () => Promise.resolve(PACK_HIT), eager: true, sound: false, ...opts, onPhase: (p, d) => phases.push({ p, i: d?.index }) })
    await tick(10)
    const root = container.querySelector<HTMLElement>('.pk-scene')!
    const key = (k: string, type = 'keydown') => root.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }))
    key('Enter')
    // the commons: face up at once, Enter sends each one on (unchanged)
    await vi.waitFor(() => {
      const now = phases[phases.length - 1]
      if (now?.p === 'reveal' && now.i! < 2) key('Enter')
      expect(now?.p === 'reveal' && now.i === 2).toBe(true)
    }, { timeout: 15000, interval: 120 })
    const commons = [...container.querySelectorAll('.pk-card')].filter((c) => (c as HTMLElement).dataset.hit === '0')
    expect(commons.every((c) => !c.classList.contains('is-down'))).toBe(true)
    await tick(500)
    const top = () => container.querySelector<HTMLElement>('.pk-card.is-top:not(.is-flung)')!
    return { scene, root, key, top }
  }
  const ev = (root: HTMLElement, type: string, x = 0, y = 0) => root.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 3, pointerType: 'mouse', bubbles: true }))

  it('the rule: full energy flips on its own, a good shake flips on letting go, a gentle one does not', () => {
    expect(shakeFlips(0.5, 'frame')).toBe(false)
    expect(shakeFlips(0.9, 'frame')).toBe(true)
    expect(shakeFlips(0.5, 'release')).toBe(true)
    expect(shakeFlips(0.2, 'release')).toBe(false)
    expect(revealBy(0, false)).toBe('tap')
    expect(revealBy(1, false)).toBe('tap')
    expect(revealBy(2, false)).toBe('shake')
    expect(revealBy(5, true)).toBe('hold')
    // the charge takes about a second of hard shaking, not a flick; it drains once let go
    let c = 0
    for (let t = 0; t < 0.3; t += 1 / 60) c = shakeCharge(c, 1, true, 1 / 60)
    expect(shakeFlips(c, 'frame')).toBe(false)
    for (let t = 0; t < 1; t += 1 / 60) c = shakeCharge(c, 1, true, 1 / 60)
    expect(shakeFlips(c, 'frame')).toBe(true)
    for (let t = 0; t < 2; t += 1 / 60) c = shakeCharge(c, 0, false, 1 / 60)
    expect(c).toBe(0)
  })

  it('a face-down hit stays down until it is shaken (or Enter); a gentle press does not flip it', { timeout: 30000 }, async () => {
    const { scene, root, key, top } = await toLastCard()
    expect(top().classList.contains('is-down')).toBe(true)
    expect(container.querySelector('.pk-shake-hint')?.textContent).toContain('shake to reveal')
    ev(root, 'pointerdown'); await tick(60); ev(root, 'pointerup'); await tick(900)
    expect(top().classList.contains('is-down')).toBe(true) // a press is not a reveal
    key('Enter')
    await vi.waitFor(() => expect(top().classList.contains('is-down')).toBe(false), { timeout: 3000, interval: 50 })
    scene.destroy()
  })

  it('shaking it hard flips it at the peak', { timeout: 30000 }, async () => {
    const { scene, root, top } = await toLastCard()
    expect(top().classList.contains('is-down')).toBe(true)
    ev(root, 'pointerdown')
    for (let k = 0; k < 150 && top().classList.contains('is-down'); k++) { ev(root, 'pointermove', k % 2 ? 160 : -160, k % 3 ? 70 : -70); await tick(16) }
    expect(top().classList.contains('is-down')).toBe(false)
    ev(root, 'pointerup')
    scene.destroy()
  })

  it('reduced motion: no shake needed, holding it reveals it', { timeout: 30000 }, async () => {
    const { scene, root, top } = await toLastCard({ reducedMotion: true })
    expect(top().classList.contains('is-down')).toBe(true)
    ev(root, 'pointerdown'); await tick(100); ev(root, 'pointerup'); await tick(400)
    expect(top().classList.contains('is-down')).toBe(true) // a tap is not enough
    ev(root, 'pointerdown')
    await vi.waitFor(() => expect(top().classList.contains('is-down')).toBe(false), { timeout: 3000, interval: 50 })
    ev(root, 'pointerup')
    scene.destroy()
  })
})

describe('the reveal payoff (pack v4)', () => {
  const gold = { ...card(9, 'rare-secret'), fx: 'gold' as const, hit: 5, name: 'Gold 9' }
  const PACK_HIT: PackResult = { set: 'base1', packId: 'H', cards: [card(1), gold] }
  async function flipLast(reducedMotion: boolean) {
    const phases: { p: string; i?: number }[] = []
    const scene = openPackScene(container, { set: BASE_SET, fetchPack: () => Promise.resolve(PACK_HIT), eager: true, sound: false, reducedMotion, onPhase: (p, d) => phases.push({ p, i: d?.index }) })
    await tick(10)
    const root = container.querySelector<HTMLElement>('.pk-scene')!
    const key = (k: string) => root.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
    key('Enter')
    await vi.waitFor(() => { const now = phases[phases.length - 1]; if (now?.p === 'reveal' && now.i === 0) key('Enter'); expect(now?.p === 'reveal' && now.i === 1).toBe(true) }, { timeout: 15000, interval: 120 })
    await tick(500)
    const top = container.querySelector<HTMLElement>('.pk-card.is-top:not(.is-flung)')!
    return { scene, root, top, key }
  }
  it('a gold flip: slow-mo, shockwave rings, the full-screen bloom, the sheen', { timeout: 30000 }, async () => {
    const { scene, top, key } = await flipLast(false)
    expect(top.classList.contains('pk-rv-top')).toBe(true)
    expect(top.querySelector('.pk-peek')).not.toBeNull()
    key('Enter')
    await vi.waitFor(() => expect(container.querySelector('.pk-bloomflash')).not.toBeNull(), { timeout: 3000, interval: 40 })
    expect(top.classList.contains('pk-slowmo')).toBe(true)
    expect(container.querySelectorAll('.pk-shock').length).toBe(2)
    expect(top.classList.contains('is-sheen')).toBe(true)
    scene.destroy()
  })
  it('reduced motion: no slow-mo, no rings or bloom, a soft glow instead', { timeout: 30000 }, async () => {
    const { scene, root, top } = await flipLast(true)
    root.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 4, pointerType: 'mouse', bubbles: true }))
    await vi.waitFor(() => expect(top.classList.contains('is-down')).toBe(false), { timeout: 3000, interval: 40 })
    await tick(900)
    expect(top.classList.contains('pk-slowmo')).toBe(false)
    expect(top.classList.contains('pk-soft-glow')).toBe(true)
    expect(container.querySelector('.pk-shock, .pk-bloomflash')).toBeNull()
    scene.destroy()
  })
})
