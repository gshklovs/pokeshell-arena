// The web arena's backend: the standalone host's rules (host/src/standalone.rs, main.rs, state.rs tests) in the browser
import { describe, expect, it } from 'vitest'
import { Backend, POINTS_PER_PACK, STARTER_PACKS, pointsFor } from './backend'
import { seededDice } from './booster'
import { memoryKv, STATE_KEY, Store } from './store'

type J = Record<string, any>

function fresh(kv = memoryKv(), faces = false) {
  return new Backend({ store: new Store(kv), dice: seededDice(7), faces })
}
const body = async (b: Backend, method: string, path: string, x?: unknown) => (await b.handle(method, path, x)).body as J
const result = (id: string, mode = 'team', difficulty = 'normal', won = true, extra: J = {}) =>
  ({ matchId: id, mode, difficulty, won, prizes: 3, ticks: 100, seed: 1, arena: 'growlithe-meadow', team: ['base1-58'], opponent: ['base1-63'], ...extra })

describe('web backend', () => {
  it('a new visitor gets the starter packs once, and they survive a reload', async () => {
    const kv = memoryKv()
    const b = fresh(kv)
    const h = await body(b, 'GET', '/api/health')
    expect(h.mode).toBe('standalone')
    expect(h.web).toBe(true)
    expect(h.starter).toMatchObject({ packs: STARTER_PACKS, granted: true })
    await body(b, 'GET', '/api/health')
    expect((await body(b, 'GET', '/api/wallet')).tokens).toBe(STARTER_PACKS)
    // a reload: a new backend on the same storage
    const again = fresh(kv)
    await body(again, 'GET', '/api/health')
    expect((await body(again, 'GET', '/api/wallet')).tokens).toBe(STARTER_PACKS)
    expect((await body(again, 'GET', '/api/collection')).cards).toEqual([])
  })

  it('opening packs spends tokens, records the cards, refuses at zero', async () => {
    const kv = memoryKv()
    const b = fresh(kv, true)
    await body(b, 'GET', '/api/health')
    const opened: J[] = []
    for (let i = 0; i < STARTER_PACKS; i++) {
      const r = await b.handle('POST', '/api/pack/open', { random: true })
      expect(r.status).toBe(200)
      opened.push(r.body as J)
    }
    expect(opened.map((p) => p.tokens)).toEqual([2, 1, 0])
    expect(opened.every((p) => p.random && p.cards.length > 0 && p.imageBase === '/pokeshell/' && typeof p.setOneIn === 'number')).toBe(true)
    const no = await b.handle('POST', '/api/pack/open', { random: true })
    expect(no.status).toBe(402)
    expect((no.body as J).error).toBe('no_tokens')
    const c = await body(b, 'GET', '/api/collection')
    const pulled = opened.flatMap((p) => p.cards.map((x: J) => x.id))
    expect(c.counts.pulls).toBe(pulled.length)
    expect(c.cards.length).toBe(new Set(pulled).size)
    const one = c.cards[0]
    expect(one.data?.hp, 'gameplay data from carddata.json').toBeTruthy()
    expect(one.art.img).toBe(`pokemon/${one.character}/${one.card}.png`)
    expect(one.firstCaught <= one.lastCaught).toBe(true)
    const w = await body(b, 'GET', '/api/wallet')
    expect(w.recent.map((t: J) => t.delta)).toEqual([3, -1, -1, -1])
    // the stored document is plain JSON under one key
    expect(JSON.parse(kv.get(STATE_KEY)!).pulls).toBe(pulled.length)
  })

  it('no card faces without the art: the collection says so', async () => {
    const b = fresh()
    await body(b, 'GET', '/api/health')
    await b.handle('POST', '/api/pack/open', { random: true })
    const c = await body(b, 'GET', '/api/collection')
    expect(c.cards.every((x: J) => x.art.img === null && x.art.imgShiny === null)).toBe(true)
  })

  it('wins earn tokens, 10 to a pack, the rest carries over; a result counts once; a forfeit earns nothing', async () => {
    const b = fresh()
    await body(b, 'GET', '/api/health')
    expect(pointsFor('team', 'expert', true)).toBe(4)
    let r = await body(b, 'POST', '/api/match/result', result('m-1', 'team', 'expert'))
    expect(r).toMatchObject({ granted: 0, points: 4, progress: { points: 4, perPack: POINTS_PER_PACK }, tokens: 3 })
    r = await body(b, 'POST', '/api/match/result', result('m-1', 'team', 'expert'))
    expect(r.duplicate).toBe(true)
    await body(b, 'POST', '/api/match/result', result('m-2', 'team', 'expert'))
    r = await body(b, 'POST', '/api/match/result', result('m-3', 'team', 'expert'))
    expect(r).toMatchObject({ granted: 1, points: 4, progress: { points: 2 }, tokens: 4 })
    r = await body(b, 'POST', '/api/match/result', result('m-4', 'team', 'expert', true, { forfeit: true }))
    expect(r).toMatchObject({ granted: 0, points: 0 })
    r = await body(b, 'POST', '/api/match/result', result('m-5', '1v1', 'easy', false))
    expect(r.points).toBe(0)
    const bad = await b.handle('POST', '/api/match/result', result('../x'))
    expect(bad.status).toBe(400)
    expect((await body(b, 'GET', '/api/wallet')).progress.points).toBe(2)
  })

  it('teams are validated and kept', async () => {
    const b = fresh()
    expect(await body(b, 'GET', '/api/teams')).toEqual({ version: 1, selected: null, teams: [] })
    const t = { version: 1, selected: 't1', teams: [{ id: 't1', name: 'A', mode: 'team', members: [{ card: 'base1-58' }, { card: 'base1-63' }, { card: 'base1-46' }] }] }
    expect((await b.handle('PUT', '/api/teams', t)).status).toBe(200)
    expect(await body(b, 'GET', '/api/teams')).toEqual(t)
    const r = await b.handle('PUT', '/api/teams', { version: 2, selected: 'zz', teams: [{ id: '', mode: 'x', members: [], energy: ['Nope'] }] })
    expect(r.status).toBe(400)
    expect((r.body as J).problems.length).toBe(6)
  })

  it('sets, odds, and unknown routes', async () => {
    const b = fresh()
    const s = await body(b, 'GET', '/api/sets')
    expect(s.sets.length).toBeGreaterThan(5)
    expect((await body(b, 'GET', '/api/pack/odds')).set).toBe('random')
    expect((await body(b, 'GET', '/api/pack/odds?set=swsh7')).set).toBe('swsh7')
    expect((await b.handle('GET', '/api/pack/odds?set=nope')).status).toBe(404)
    expect((await b.handle('GET', '/api/nope')).status).toBe(404)
    expect((await b.handle('POST', '/api/pack/open', { set: 'base1' })).status).toBe(402) // no starter yet: health grants it
  })

  it('a broken stored document starts over (and is kept aside)', async () => {
    const kv = memoryKv()
    kv.set(STATE_KEY, '{not json')
    const b = fresh(kv)
    await body(b, 'GET', '/api/health')
    expect((await body(b, 'GET', '/api/wallet')).tokens).toBe(STARTER_PACKS)
  })
})
