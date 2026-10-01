// Quitting a match: the report a forfeit sends the host is a loss that says it was a forfeit (the host then records it
// as `forfeit` in matches.jsonl and grants nothing: tests/test-host.ps1, host/src/main.rs forfeit_is_a_loss).
import { describe, expect, it } from 'vitest'
import { matchPayload } from './result'

type R = Parameters<typeof matchPayload>[0]

function runner(): R {
  const entry = (card: string) => ({ kit: { card }, shiny: false })
  return {
    s: { players: [{ kos: 1 }, { kos: 0 }], tick: 900 },
    def: { mode: 'team' },
    setup: { seed: 7, difficulty: 'expert', arena: { def: { id: 'lapras-lagoon' } }, me: [entry('base1-58')], foe: [entry('base1-4')] },
  } as unknown as R
}

describe('the match report', () => {
  it('a finished match reports its result, with no forfeit flag', () => {
    const p = matchPayload(runner(), true)
    expect(p.won).toBe(true)
    expect('forfeit' in p).toBe(false)
    expect(p).toMatchObject({ mode: 'team', difficulty: 'expert', arena: 'lapras-lagoon', team: ['base1-58'], opponent: ['base1-4'] })
  })
  it('a forfeit is always a loss, flagged as a forfeit', () => {
    expect(matchPayload(runner(), false, true)).toMatchObject({ won: false, forfeit: true })
    expect(matchPayload(runner(), true, true)).toMatchObject({ won: false, forfeit: true })
  })
})
