// Devices -> InputFrame (docs/SPEC.md section 4). Outside the sim, so floats and Math.atan2 are fine here: the
// frame it produces is quantized (8-way move, a 0..255 aim) before the sim sees it.
import { BTN, swapTo, type Dir, type InputFrame } from '../sim/types'

const MOVE: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
}
/** attack keys: hold to aim, release to fire (the user: "aim by holding, the attack fires when I release") */
const ATTACK_KEY: Record<string, number> = { KeyJ: BTN.ATTACK1, KeyK: BTN.ATTACK2, KeyL: BTN.ATTACK3 }
const KEY_BTN: Record<string, number> = {
  Space: BTN.DODGE, ShiftLeft: BTN.DODGE, ShiftRight: BTN.DODGE,
  KeyF: BTN.EVOLVE,
  // swapping is the number keys only (the user): no Q / E cycling, no clicking the team bar
  Digit1: swapTo(1), Digit2: swapTo(2), Digit3: swapTo(3), Digit4: swapTo(4), Digit5: swapTo(5), Digit6: swapTo(6),
}
const MOUSE_BTN = [BTN.ATTACK1, BTN.ATTACK3, BTN.ATTACK2] // left, middle, right
/** gamepad buttons that attack (standard mapping): RT / A, RB / X, Y */
const PAD_ATTACK: [number, number][] = [[7, BTN.ATTACK1], [0, BTN.ATTACK1], [5, BTN.ATTACK2], [2, BTN.ATTACK2], [3, BTN.ATTACK3]]
const ATTACK_BITS = BTN.ATTACK1 | BTN.ATTACK2 | BTN.ATTACK3
/** hold to peek at the active Pokémon's attack sheet (the match keeps running); the pad's Back / Select button */
export const PEEK_KEY = 'KeyI'
const PAD_PEEK = 8
const attackIndex = (bit: number) => (bit === BTN.ATTACK1 ? 1 : bit === BTN.ATTACK2 ? 2 : bit === BTN.ATTACK3 ? 3 : 0)

function quantAngle(rad: number): number {
  return ((Math.round((rad * 256) / (2 * Math.PI)) % 256) + 256) % 256
}

export class Input {
  private keys = new Set<string>()
  private mouseBtns = 0
  /** buttons pressed since the last frame, so a click or tap shorter than a tick still counts */
  private latched = 0
  private mouse = { x: 0, y: 0, t: -1e9 }
  /** the mouse is over the canvas (for the KO picker's hover) */
  private over = false
  private lastMove: [number, number] = [1, 0]
  /** set by the page: design-space px from a client point */
  toDesign: (cx: number, cy: number) => { x: number; y: number } = (x, y) => ({ x, y })
  /** set by the match: how many evolve options there are now (Tab cycles which one F picks) */
  evoCount: () => number = () => 0
  private evoCycle = 0
  /** set by the match: the team slot (1..6) of the forced-swap picker card under a design-px point, else 0. Only
   * the KO picker takes clicks (the user: "clicking on cards is OK when dying"); the rest of the HUD passes them on */
  pickAt: (x: number, y: number) => number = () => 0
  /** attacks being aimed: source (a mouse button, key or pad button) -> its attack bit, newest last */
  private holds = new Map<string, number>()
  private padPrev = new Set<number>()

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (MOVE[e.code] || KEY_BTN[e.code] !== undefined || ATTACK_KEY[e.code] || e.code === PEEK_KEY) e.preventDefault()
      // Tab picks the evolve option only while a match offers some; elsewhere it keeps moving the page's focus
      if (e.code === 'Tab' && this.evoCount() > 0) {
        e.preventDefault()
        if (!e.repeat) this.evoCycle += e.shiftKey ? -1 : 1
      }
      if (!e.repeat && ATTACK_KEY[e.code]) this.hold(`k${e.code}`, ATTACK_KEY[e.code])
      if (!e.repeat && KEY_BTN[e.code] !== undefined) {
        if (KEY_BTN[e.code] >= 1 << 8) this.cancelAim() // a swap drops the attack being aimed
        this.latched |= KEY_BTN[e.code]
      }
      this.keys.add(e.code)
    })
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); if (ATTACK_KEY[e.code]) this.release(`k${e.code}`) })
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseBtns = 0; this.cancelAim() })
    target.addEventListener('mousemove', (e) => { const p = this.toDesign(e.clientX, e.clientY); this.mouse = { ...p, t: performance.now() }; this.over = true })
    target.addEventListener('mouseleave', () => { this.over = false })
    target.addEventListener('mousedown', (e) => {
      const p = this.toDesign(e.clientX, e.clientY)
      this.mouse = { ...p, t: performance.now() }
      e.preventDefault()
      // after a KO, a click on a picker card sends that Pokémon in
      const slot = e.button === 0 ? this.pickAt(p.x, p.y) : 0
      if (slot > 0) { this.cancelAim(); this.latched |= swapTo(slot); return }
      // every other click is the arena's: hold to aim at the cursor, release to fire (the HUD has no buttons)
      this.mouseBtns |= 1 << e.button
      if (e.button < 3) this.hold(`m${e.button}`, MOUSE_BTN[e.button])
    })
    window.addEventListener('mouseup', (e) => { this.mouseBtns &= ~(1 << e.button); this.release(`m${e.button}`) })
    target.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  private padStart = false
  /** the gamepad's Start button, as an edge (pause) */
  padPause(): boolean {
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null
    const down = !!pad?.buttons[9]?.pressed
    const edge = down && !this.padStart
    this.padStart = down
    return edge
  }

  /** start aiming an attack from a source (mouse button, key, pad button) */
  private hold(src: string, bit: number): void {
    this.holds.delete(src)
    this.holds.set(src, bit)
  }

  /** the source let go: its attack fires this frame, in the aim of this frame (unless it was cancelled) */
  private release(src: string): void {
    const bit = this.holds.get(src)
    if (bit === undefined) return
    this.holds.delete(src)
    this.latched |= bit
  }

  /** drop every attack being aimed: nothing fires and nothing is spent (a swap, the pause menu, losing focus) */
  cancelAim(): void {
    this.holds.clear()
    this.latched &= ~ATTACK_BITS
  }

  /** the attack being aimed now (1..3, the newest hold), or 0 */
  aiming(): number {
    let bit = 0
    for (const b of this.holds.values()) bit = b
    return attackIndex(bit)
  }

  /** the evolve option F picks, 1..n (Tab / Shift+Tab cycle it when there is more than one) */
  evoPick(): number {
    const n = this.evoCount()
    return n > 0 ? (((this.evoCycle % n) + n) % n) + 1 : 1
  }

  /** the attack sheet peek is held (I, or the pad's Back): render-only, the sim never sees it */
  peeking(): boolean {
    if (this.keys.has(PEEK_KEY)) return true
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null
    return !!pad?.buttons[PAD_PEEK]?.pressed
  }

  /** the mouse position in design px while it's over the canvas (the KO picker's hover), else null */
  pointer(): { x: number; y: number } | null {
    return this.over ? { x: this.mouse.x, y: this.mouse.y } : null
  }

  /** the mouse position in design px, when it moved recently (else null: aim follows movement) */
  cursor(): { x: number; y: number } | null {
    return performance.now() - this.mouse.t < 4000 || this.mouseBtns ? this.mouse : null
  }

  /** one frame for the player whose fighter is at (fx, fy) design px. The aim is exactly where the mouse, the right
   * stick or the last move direction points: no aim assist, no snapping (the user: all aiming is manual) */
  frame(fx: number, fy: number): InputFrame {
    let mx = 0, my = 0, buttons = 0
    for (const k of this.keys) {
      const m = MOVE[k]
      if (m) { mx += m[0]; my += m[1] }
      const b = KEY_BTN[k]
      if (b !== undefined) buttons |= b
    }

    let aimRad: number | null = null
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null
    if (pad) {
      const [lx, ly, rx, ry] = [pad.axes[0] ?? 0, pad.axes[1] ?? 0, pad.axes[2] ?? 0, pad.axes[3] ?? 0]
      if (Math.hypot(lx, ly) > 0.35) { mx += Math.abs(lx) > 0.38 ? Math.sign(lx) : 0; my += Math.abs(ly) > 0.38 ? Math.sign(ly) : 0 }
      if (Math.hypot(rx, ry) > 0.4) aimRad = Math.atan2(ry, rx)
      const b = (i: number) => !!pad.buttons[i]?.pressed
      // attack buttons: hold to aim (right stick), release to fire
      for (const [i, bit] of PAD_ATTACK) {
        if (b(i) && !this.padPrev.has(i)) this.hold(`p${i}`, bit)
        if (!b(i) && this.padPrev.has(i)) this.release(`p${i}`)
      }
      if (b(4)) buttons |= BTN.EVOLVE
      if (b(6) || b(1)) buttons |= BTN.DODGE
      // a pad has no number keys: the d-pad steps through the bench instead (and drops the attack being aimed)
      if ((b(14) && !this.padPrev.has(14)) || (b(15) && !this.padPrev.has(15))) this.cancelAim()
      if (b(14)) buttons |= BTN.SWAP_PREV
      if (b(15)) buttons |= BTN.SWAP_NEXT
      this.padPrev = new Set(pad.buttons.map((x, i) => (x?.pressed ? i : -1)).filter((i) => i >= 0))
    }
    // a press shorter than a tick, and an attack released: pressed for this frame; the sim sees the edge, and the
    // release comes next frame
    buttons |= this.latched
    this.latched = 0
    if (buttons & BTN.EVOLVE) buttons |= (this.evoPick() & 7) << 11 // evolveTo(evoPick())
    mx = Math.sign(mx); my = Math.sign(my)
    if (mx || my) this.lastMove = [mx, my]

    if (aimRad === null) {
      const c = this.cursor()
      aimRad = c ? Math.atan2(c.y - fy, c.x - fx) : Math.atan2(this.lastMove[1], this.lastMove[0])
    }
    return { mx: mx as Dir, my: my as Dir, aim: quantAngle(aimRad), buttons, aimHeld: this.aiming() }
  }
}
