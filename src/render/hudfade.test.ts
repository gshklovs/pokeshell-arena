import { expect, it } from 'vitest'
import { fighterUnder, HUD_RECTS } from './hud'
import { place, PILOT_KITS, testMatch } from '../sim/testing'

it('a fighter standing in the top rows under a trainer card or the timer is detected (the panel fades)', () => {
  const m = testMatch(PILOT_KITS.pikachu, PILOT_KITS.squirtle)
  place(m, 0, 960, 540); place(m, 1, 1400, 700)
  for (const k of Object.keys(HUD_RECTS)) expect(fighterUnder(m.s, HUD_RECTS[k]), k).toBe(false)
  place(m, 0, 300, 90) // row 2, under the left trainer card
  expect(fighterUnder(m.s, HUD_RECTS.me)).toBe(true)
  place(m, 1, 960, 150) // just below the timer: its sprite reaches up into it
  expect(fighterUnder(m.s, HUD_RECTS.timer)).toBe(true)
  place(m, 1, 1800, 1030) // bottom-right corner, under the key panel
  expect(fighterUnder(m.s, HUD_RECTS.keys)).toBe(true)
})
