// The result data lists every enemy with how it went down (src/game/elim.ts), and a time-cap finish says so.
import { describe, expect, it } from 'vitest'
import { hurt } from '../sim/combat'
import { defaultEnergy } from '../sim/energy'
import { resolveKit } from '../sim/kit'
import { parseArena } from '../sim/arena'
import * as R from '../sim/rules'
import { createState } from '../sim/state'
import { step } from '../sim/step'
import { fixtureKit, testArena } from '../sim/testing'
import type { MatchDef } from '../sim/types'
import { ElimLog, enemyOutcomes } from './elim'
import { endedOnTime, enemyListHtml, howItEnded } from './result'

function match() {
  const kits = [resolveKit(null, fixtureKit({ shape: { kind: 'self' } })), resolveKit(null, fixtureKit({ shape: { kind: 'self' } }, { hp: 60 }))]
    .map((k, i) => ({ ...k, hp: k.printedHp ?? k.hp, name: i ? 'Togepi' : 'Pikachu' }))
  const def: MatchDef = {
    mode: 'team', seed: 5, arena: parseArena(testArena()), kits, matchTicks: 3 * 60 * 60,
    players: [
      { team: 0, name: 'A', members: [0, 0, 0], energy: defaultEnergy([kits[0]]) },
      { team: 1, name: 'B', members: [1, 1, 1], energy: defaultEnergy([kits[1]]) },
    ],
  }
  const s = createState(def)
  const log = new ElimLog(s)
  const tick = () => { step(def, s, []); log.feed(s, s.events) }
  return { def, s, log, tick }
}

describe('enemy outcomes', () => {
  it('lists every enemy: KO\'d by whom and when, still standing, or never came in; the time cap is labelled', () => {
    const m = match()
    while (m.s.phase === 'countdown') m.tick()
    for (let i = 0; i < 60; i++) m.tick()
    hurt(m.s, 1, 10000, 0, 'Lightning', 0)
    m.log.feed(m.s, m.s.events)
    m.tick()
    while (m.s.players[1].active < 0) m.tick()
    // run out the clock
    m.s.phaseT = (m.def.matchTicks ?? R.MATCH_TICKS) - 1
    m.tick()
    expect(m.s.phase).toBe('over')
    const out = enemyOutcomes(m.def, m.s, m.log, 1)
    expect(out.map((o) => o.outcome)).toEqual(['ko', 'standing', 'unseen'])
    expect(out[0].text).toBe("KO'd by Pikachu at 0:01")
    expect(out[1].text).toBe('still standing at 60/60 HP when time ran out')
    expect(out[2].text).toBe('never came in (60/60 HP when time ran out)')
    expect(m.log.kos[0]).toMatchObject({ p: 1, member: 0, where: 'active', by: { p: 0, kit: 0 } })
    const r = { s: m.s, def: m.def, elim: m.log }
    expect(endedOnTime(r)).toBe(true)
    expect(howItEnded(r, true, false)).toBe('Time! You had more HP left')
    const html = enemyListHtml(r)
    expect(html.match(/<li/g)).toHaveLength(3)
    expect(html).toContain('never came in')
  })

  it('an elimination is not a time finish', () => {
    const m = match()
    while (m.s.phase === 'countdown') m.tick()
    for (let n = 0; n < 3; n++) {
      hurt(m.s, 1, 10000, 0, 'Lightning', 0)
    m.log.feed(m.s, m.s.events)
      m.tick()
      while (m.s.phase === 'fight' && m.s.players[1].active < 0) m.tick()
    }
    expect(m.s.phase).toBe('over')
    expect(endedOnTime({ s: m.s })).toBe(false)
    expect(enemyOutcomes(m.def, m.s, m.log, 1).every((o) => o.outcome === 'ko' && o.text.startsWith("KO'd by Pikachu"))).toBe(true)
  })
})
