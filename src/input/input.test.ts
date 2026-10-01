// The device layer: no aim assist (the frame's aim is exactly the mouse direction), swaps on the number keys only
// (no Q / E, no clicking the team bar: every click over the arena attacks), and Tab picks the evolve option F takes.
import { beforeAll, describe, expect, it } from 'vitest'
import type { Input as InputT } from './input'
import { BTN, evolveChoice, swapSlot } from '../sim/types'
import { step } from '../sim/step'
import { FP } from '../sim/fixed'
import { PILOT_KITS, place, testMatch } from '../sim/testing'

type Handler = (e: Record<string, unknown>) => void
const handlers: Record<string, Handler> = {}
const win: Record<string, Handler> = {}

beforeAll(() => {
  // the smallest browser the Input class needs, in node
  const g = globalThis as Record<string, unknown>
  g.window = { addEventListener: (k: string, h: Handler) => { win[k] = h } }
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true })
  Object.defineProperty(globalThis, 'performance', { value: { now: () => Date.now() }, configurable: true })
})

async function input(): Promise<InputT> {
  const { Input } = await import('./input')
  const target = { addEventListener: (k: string, h: Handler) => { handlers[k] = h } }
  return new Input(target as unknown as HTMLElement)
}

const ATTACKS = BTN.ATTACK1 | BTN.ATTACK2 | BTN.ATTACK3
const quant = (dx: number, dy: number) => ((Math.round((Math.atan2(dy, dx) * 256) / (2 * Math.PI)) % 256) + 256) % 256
const key = (code: string, extra: Record<string, unknown> = {}) => {
  const e = { code, repeat: false, shiftKey: false, preventDefault: () => {}, ...extra }
  win.keydown(e)
  win.keyup(e)
}
const down = (x: number, y: number, button = 0) => handlers.mousedown({ clientX: x, clientY: y, button, preventDefault: () => {} })
const up = (button = 0) => win.mouseup({ button })
const click = (x: number, y: number, button = 0) => { down(x, y, button); up(button) }
const keyDown = (code: string) => win.keydown({ code, repeat: false, shiftKey: false, preventDefault: () => {} })
const keyUp = (code: string) => win.keyup({ code, repeat: false, shiftKey: false, preventDefault: () => {} })

describe('manual aim', () => {
  it('the aim is exactly toward the mouse, for any direction', async () => {
    const inp = await input()
    for (let deg = 0; deg < 360; deg += 13) {
      const x = 960 + Math.cos((deg * Math.PI) / 180) * 300, y = 540 + Math.sin((deg * Math.PI) / 180) * 300
      handlers.mousemove({ clientX: x, clientY: y })
      expect(inp.frame(960, 540).aim).toBe(quant(x - 960, y - 540))
    }
  })
  it('there is no aim assist to turn on, and frame() takes no enemy', async () => {
    const inp = await input()
    expect('aimAssist' in inp).toBe(false)
    expect(inp.frame.length).toBe(2)
  })
})

describe('swapping: number keys only', () => {
  it('1-6 swap to that team slot', async () => {
    const inp = await input()
    for (let n = 1; n <= 6; n++) {
      key(`Digit${n}`)
      expect(swapSlot(inp.frame(960, 540).buttons)).toBe(n)
      expect(swapSlot(inp.frame(960, 540).buttons)).toBe(0) // a press, not a hold
    }
  })
  it('Q and E do not swap', async () => {
    const inp = await input()
    for (const code of ['KeyQ', 'KeyE']) {
      key(code)
      const b = inp.frame(960, 540).buttons
      expect(b & (BTN.SWAP_PREV | BTN.SWAP_NEXT)).toBe(0)
      expect(swapSlot(b)).toBe(0)
    }
  })
  it('a click over the team bar (or anywhere on the HUD) attacks the arena, it never swaps', async () => {
    const inp = await input()
    expect('regionAt' in inp).toBe(false)
    // the team bar's slots sit around (760..1260, 850..920) in design px; the evolve prompt at the bottom left
    for (const [x, y] of [[900, 885], [1040, 885], [1180, 885], [200, 760], [960, 1010]]) {
      click(x, y)
      const b = inp.frame(960, 540).buttons
      expect(swapSlot(b)).toBe(0)
      expect(b & BTN.EVOLVE).toBe(0)
      expect(b & BTN.ATTACK1).toBe(BTN.ATTACK1)
    }
    click(900, 885, 2)
    expect(inp.frame(960, 540).buttons & BTN.ATTACK2).toBe(BTN.ATTACK2)
  })
})

describe('hold to aim, release to fire', () => {
  /** a 1v1 in the fight with a full meter; each tick asks the Input for player 0's frame */
  function match() {
    const m = testMatch(PILOT_KITS.pikachu, PILOT_KITS.charmander)
    place(m, 0, 600, 540); place(m, 1, 1400, 540)
    m.s.players[0].pips[0] = 10
    return m
  }
  function tick(m: ReturnType<typeof match>, inp: InputT): { casts: number; frame: ReturnType<InputT['frame']> } {
    const f = m.s.players[0].fighter
    const frame = inp.frame(f.x / FP, f.y / FP)
    step(m.def, m.s, [frame, { mx: 0, my: 0, aim: 0, buttons: 0 }])
    return { casts: m.s.events.filter((e) => e.k === 'cast' && e.p === 0).length, frame }
  }

  it('a press, hold and release casts exactly once, at the release, in the release-time aim', async () => {
    const inp = await input()
    const m = match()
    down(600, 200) // aim straight up while pressing
    let casts = 0
    for (let t = 0; t < 20; t++) {
      if (t === 10) handlers.mousemove({ clientX: 900, clientY: 540 }) // swing the aim to the right while holding
      const r = tick(m, inp)
      casts += r.casts
      expect(r.frame.buttons & BTN.ATTACK1).toBe(0) // nothing fires while held
      expect(r.frame.aimHeld).toBe(1)
    }
    expect(casts).toBe(0)
    up()
    const r = tick(m, inp)
    expect(r.frame.buttons & BTN.ATTACK1).toBe(BTN.ATTACK1)
    expect(r.frame.aim).toBe(quant(900 - 600, 0)) // the aim at the release
    expect(r.frame.aimHeld).toBe(0)
    casts += r.casts
    for (let t = 0; t < 30; t++) casts += tick(m, inp).casts
    expect(casts).toBe(1)
  })

  it('J / K / L hold and fire on release too', async () => {
    const inp = await input()
    keyDown('KeyK')
    expect(inp.frame(960, 540).buttons & BTN.ATTACK2).toBe(0)
    expect(inp.aiming()).toBe(2)
    keyUp('KeyK')
    expect(inp.frame(960, 540).buttons & BTN.ATTACK2).toBe(BTN.ATTACK2)
    expect(inp.frame(960, 540).buttons & BTN.ATTACK2).toBe(0)
  })

  it('a swap while holding drops the attack: no cast, no energy spent', async () => {
    const inp = await input()
    const m = match()
    down(900, 540)
    tick(m, inp)
    key('Digit2') // swap mid-aim
    const pips = m.s.players[0].pips[0]
    let casts = 0
    for (let t = 0; t < 5; t++) casts += tick(m, inp).casts
    up()
    for (let t = 0; t < 30; t++) {
      const r = tick(m, inp)
      casts += r.casts
      expect(r.frame.buttons & ATTACKS).toBe(0)
    }
    expect(casts).toBe(0)
    expect(m.s.players[0].pips[0]).toBeGreaterThanOrEqual(pips) // nothing spent (the meter only fills)
  })

  it('pausing (cancelAim) drops the attack too', async () => {
    const inp = await input()
    keyDown('KeyJ')
    inp.cancelAim()
    keyUp('KeyJ')
    expect(inp.frame(960, 540).buttons & ATTACKS).toBe(0)
  })

  it('a hold over the team bar aims (and fires on release), it never swaps', async () => {
    const inp = await input()
    down(1060, 885)
    const held = inp.frame(960, 540)
    expect(held.aimHeld).toBe(1)
    expect(swapSlot(held.buttons)).toBe(0)
    up()
    const b = inp.frame(960, 540).buttons
    expect(swapSlot(b)).toBe(0)
    expect(b & BTN.ATTACK1).toBe(BTN.ATTACK1)
  })
})

describe('the KO picker takes clicks', () => {
  it('during a forced swap, a click on a picker card swaps to it (and attacks nothing)', async () => {
    const inp = await input()
    inp.pickAt = (x, y) => (x > 1000 && x < 1190 && y > 410 && y < 640 ? 3 : 0) // the picker's card for slot 3
    click(1100, 500)
    const b = inp.frame(960, 540).buttons
    expect(swapSlot(b)).toBe(3)
    expect(b & ATTACKS).toBe(0)
  })
  it('mid-fight (no picker), a click on the team bar still goes to the arena', async () => {
    const inp = await input()
    inp.pickAt = () => 0
    click(1060, 885)
    const b = inp.frame(960, 540).buttons
    expect(swapSlot(b)).toBe(0)
    expect(b & BTN.ATTACK1).toBe(BTN.ATTACK1)
  })
  it('the picker hit test matches where the picker draws its cards', async () => {
    const { pickerCards, pickerSlotAt } = await import('../render/hud')
    const m = testMatch(PILOT_KITS.pikachu, PILOT_KITS.charmander)
    expect(pickerCards(m.s, 0)).toEqual([]) // no KO, no picker
    const pl = m.s.players[0]
    pl.members.push({ ...pl.members[0], ko: false }, { ...pl.members[0], ko: false })
    pl.members[0].ko = true
    pl.active = -1
    const cards = pickerCards(m.s, 0)
    expect(cards.map((c) => c.slot)).toEqual([2, 3])
    for (const c of cards) expect(pickerSlotAt(m.s, 0, c.x + c.w / 2, c.y + c.h / 2)).toBe(c.slot)
    expect(pickerSlotAt(m.s, 0, 1060, 885)).toBe(0) // the team bar is not the picker
  })
  it('the KO picker hover: the card under the mouse grows over frame time, and hover and click agree', async () => {
    const { pickerCards, pickerSlotAt, pickerHoverSlot, stepPickGrow, PICK_GROW_MS } = await import('../render/hud')
    const { hashState } = await import('../sim/state')
    const m = testMatch(PILOT_KITS.pikachu, PILOT_KITS.charmander)
    const pl = m.s.players[0]
    pl.members.push({ ...pl.members[0], ko: false }, { ...pl.members[0], ko: false }, { ...pl.members[0], ko: false })
    pl.members[0].ko = true
    pl.active = -1
    const cards = pickerCards(m.s, 0)
    expect(pickerHoverSlot(m.s, 0, null)).toBe(0) // no mouse (or a bot plays for you): nothing hovered
    for (const c of cards) {
      // hover and click use the same rects: whatever is hovered is what a click there sends in
      for (const [x, y] of [[c.x + 1, c.y + 1], [c.x + c.w / 2, c.y + c.h / 2], [c.x + c.w - 1, c.y + c.h - 1]]) {
        expect(pickerHoverSlot(m.s, 0, { x, y })).toBe(c.slot)
        expect(pickerSlotAt(m.s, 0, x, y)).toBe(c.slot)
      }
    }
    // the gap between two cards (where the grown card overhangs) is neither card: it never steals a neighbour's click
    const gapX = cards[0].x + cards[0].w + 4
    expect(pickerHoverSlot(m.s, 0, { x: gapX, y: cards[0].y + 50 })).toBe(0)
    expect(pickerSlotAt(m.s, 0, gapX, cards[0].y + 50)).toBe(0)
    // the grow eases in over PICK_GROW_MS of frame time and back out, clamped to 0..1
    let e = 0
    for (let f = 0; f < 4; f++) e = stepPickGrow(e, true, 16)
    expect(e).toBeGreaterThan(0.3); expect(e).toBeLessThan(1)
    expect(stepPickGrow(e, true, PICK_GROW_MS)).toBe(1)
    expect(stepPickGrow(0.5, false, 16)).toBeLessThan(0.5)
    expect(stepPickGrow(0.1, false, PICK_GROW_MS)).toBe(0)
    // hover is render state only: the sim never sees it
    const before = hashState(m.s)
    pickerHoverSlot(m.s, 0, { x: cards[1].x + 5, y: cards[1].y + 5 })
    expect(hashState(m.s)).toBe(before)
  })
})

describe('evolving: F, and Tab picks the option', () => {
  it('F evolves into option 1; Tab / Shift+Tab cycle the pick', async () => {
    const inp = await input()
    inp.evoCount = () => 3
    key('KeyF')
    let b = inp.frame(960, 540).buttons
    expect(b & BTN.EVOLVE).toBe(BTN.EVOLVE)
    expect(evolveChoice(b)).toBe(1)
    key('Tab')
    expect(inp.evoPick()).toBe(2)
    key('KeyF')
    b = inp.frame(960, 540).buttons
    expect(evolveChoice(b)).toBe(2)
    key('Tab'); key('Tab')
    expect(inp.evoPick()).toBe(1) // wraps
    key('Tab', { shiftKey: true })
    expect(inp.evoPick()).toBe(3)
  })
})
