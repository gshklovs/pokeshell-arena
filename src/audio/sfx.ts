// Synthesised sound effects (Web Audio only: oscillators, noise, envelopes, filters; no audio files, nothing
// copyrighted). Render-side: the sim never hears any of this. Every call is a safe no-op without an AudioContext
// (node tests, headless browsers that block audio, before the first user gesture).

export type SfxName =
  | 'cast' | 'hit' | 'superHit' | 'resist' | 'ko' | 'prize' | 'swap' | 'dodge' | 'coin' | 'fizzle'
  | 'countdown' | 'fight' | 'shock' | 'ignite' | 'steam' | 'douse' | 'prop' | 'propBreak'
  | 'uiClick' | 'uiHover' | 'win' | 'lose' | 'token' | 'status' | 'heal' | 'evolve'
  // melee (docs/MELEE.md 3.5): the whoosh of a swing's release (pitch by weight), a tap's transient, the body thud of
  // a finisher (scaled by `big`), a parry's clang, a throw's whoomph, a wall splat's crunch, a thin whiff
  | 'swing' | 'tap' | 'thud' | 'parry' | 'throw' | 'splat' | 'whiff'

export interface SfxOpts { element?: string; pan?: number; big?: boolean }

type Ctx = AudioContext

class Sfx {
  volume = 0.7
  muted = false
  private ctx: Ctx | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private last = new Map<string, number>()

  /** create / resume the AudioContext; call from a user gesture (click, key) */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
          ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AC) return
        this.ctx = new AC()
        this.master = this.ctx.createGain()
        const comp = this.ctx.createDynamicsCompressor()
        comp.threshold.value = -14; comp.ratio.value = 4
        this.master.connect(comp).connect(this.ctx.destination)
        const n = this.ctx.sampleRate
        this.noiseBuf = this.ctx.createBuffer(1, n, n)
        const d = this.noiseBuf.getChannelData(0)
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume()
    } catch { this.ctx = null }
  }

  get ready(): boolean { return !!this.ctx && this.ctx.state === 'running' }

  play(name: SfxName, opts: SfxOpts = {}): void {
    const ctx = this.ctx
    if (!ctx || !this.master || this.muted || this.volume <= 0 || ctx.state !== 'running') return
    // throttle identical sounds (a shotgun of pellets, a whole pond electrifying)
    const key = name + (opts.element ?? '')
    const now = ctx.currentTime
    const gap = name === 'hit' || name === 'superHit' ? 0.045 : name === 'uiHover' ? 0.03 : name === 'tap' ? 0.035 : 0.06
    if (now - (this.last.get(key) ?? -1) < gap) return
    this.last.set(key, now)
    try {
      this.master.gain.value = this.volume * 0.55
      const out = ctx.createStereoPanner ? ctx.createStereoPanner() : null
      if (out) { out.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0)); out.connect(this.master) }
      const dest: AudioNode = out ?? this.master
      this.voice(ctx, dest, now, name, opts)
    } catch { /* never let audio break a frame */ }
  }

  // ------------------------------------------------------------------ building blocks
  private tone(dest: AudioNode, t: number, o: { type?: OscillatorType; f0: number; f1?: number; dur: number; gain?: number; attack?: number; curve?: 'exp' | 'lin' }): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = o.type ?? 'sine'
    osc.frequency.setValueAtTime(o.f0, t)
    if (o.f1 !== undefined) {
      if (o.curve === 'lin') osc.frequency.linearRampToValueAtTime(o.f1, t + o.dur)
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur)
    }
    const a = o.attack ?? 0.005
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.3, t + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
    osc.connect(g).connect(dest)
    osc.start(t); osc.stop(t + o.dur + 0.02)
  }

  private noise(dest: AudioNode, t: number, o: { dur: number; gain?: number; type?: BiquadFilterType; f0: number; f1?: number; q?: number; attack?: number }): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.playbackRate.value = 0.8 + Math.random() * 0.4
    const flt = ctx.createBiquadFilter()
    flt.type = o.type ?? 'bandpass'
    flt.frequency.setValueAtTime(o.f0, t)
    if (o.f1 !== undefined) flt.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur)
    flt.Q.value = o.q ?? 1
    const g = ctx.createGain()
    const a = o.attack ?? 0.004
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.3, t + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
    src.connect(flt).connect(g).connect(dest)
    src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.02)
  }

  private arp(dest: AudioNode, t: number, notes: number[], step: number, type: OscillatorType = 'square', gain = 0.12, len = 0.18): void {
    notes.forEach((f, i) => this.tone(dest, t + i * step, { type, f0: f, dur: len, gain }))
  }

  // ------------------------------------------------------------------ the sounds
  private voice(ctx: Ctx, d: AudioNode, t: number, name: SfxName, o: SfxOpts): void {
    const big = !!o.big
    switch (name) {
      case 'cast': return this.cast(d, t, o.element ?? 'Colorless', big)
      case 'hit':
        this.noise(d, t, { dur: 0.12, f0: 1800, f1: 300, type: 'lowpass', gain: big ? 0.5 : 0.35 })
        this.tone(d, t, { type: 'triangle', f0: big ? 180 : 240, f1: 60, dur: 0.14, gain: 0.35 })
        return
      case 'superHit':
        this.noise(d, t, { dur: 0.22, f0: 3000, f1: 200, type: 'lowpass', gain: 0.55 })
        this.tone(d, t, { type: 'square', f0: 320, f1: 50, dur: 0.25, gain: 0.25 })
        this.tone(d, t + 0.03, { type: 'sawtooth', f0: 880, f1: 1320, dur: 0.12, gain: 0.08 })
        return
      case 'resist':
        this.tone(d, t, { type: 'triangle', f0: 200, f1: 120, dur: 0.12, gain: 0.25 })
        this.noise(d, t, { dur: 0.06, f0: 600, type: 'lowpass', gain: 0.2 })
        return
      case 'ko':
        this.tone(d, t, { type: 'square', f0: 660, f1: 80, dur: 0.7, gain: 0.18, curve: 'exp' })
        this.noise(d, t, { dur: 0.5, f0: 1200, f1: 80, type: 'lowpass', gain: 0.45 })
        this.tone(d, t, { type: 'sine', f0: 90, f1: 30, dur: 0.6, gain: 0.5 })
        return
      case 'prize': return this.arp(d, t, [988, 1319, 1976], 0.06, 'square', 0.09, 0.14)
      case 'swap':
        this.tone(d, t, { type: 'sine', f0: 300, f1: 900, dur: 0.18, gain: 0.2 })
        this.noise(d, t, { dur: 0.2, f0: 800, f1: 4000, type: 'bandpass', q: 2, gain: 0.15 })
        return
      case 'dodge': return this.noise(d, t, { dur: 0.16, f0: 600, f1: 2400, type: 'bandpass', q: 1.5, gain: 0.25 })
      case 'coin':
        this.tone(d, t, { type: 'square', f0: 1318, dur: 0.06, gain: 0.08 })
        this.tone(d, t + 0.06, { type: 'square', f0: 1760, dur: 0.2, gain: 0.08 })
        return
      case 'fizzle': return this.tone(d, t, { type: 'square', f0: 220, f1: 110, dur: 0.12, gain: 0.07 })
      case 'countdown': return this.tone(d, t, { type: 'square', f0: 660, dur: 0.14, gain: 0.12 })
      case 'fight':
        this.tone(d, t, { type: 'square', f0: 880, dur: 0.35, gain: 0.14 })
        this.tone(d, t, { type: 'square', f0: 1320, dur: 0.35, gain: 0.08 })
        this.noise(d, t, { dur: 0.3, f0: 5000, type: 'highpass', gain: 0.1 })
        return
      case 'shock':
        for (let i = 0; i < 5; i++) this.noise(d, t + i * 0.035 + Math.random() * 0.02, { dur: 0.05, f0: 3000 + Math.random() * 3000, type: 'bandpass', q: 3, gain: 0.25 })
        this.tone(d, t, { type: 'sawtooth', f0: 120, f1: 60, dur: 0.3, gain: 0.1 })
        return
      case 'ignite':
        this.noise(d, t, { dur: 0.5, f0: 400, f1: 1600, type: 'bandpass', q: 0.8, gain: 0.3, attack: 0.05 })
        return
      case 'steam': return this.noise(d, t, { dur: 0.6, f0: 5000, f1: 2500, type: 'highpass', gain: 0.2, attack: 0.03 })
      case 'douse':
        this.noise(d, t, { dur: 0.3, f0: 1200, f1: 300, type: 'lowpass', gain: 0.3 })
        this.tone(d, t, { type: 'sine', f0: 500, f1: 200, dur: 0.2, gain: 0.1 })
        return
      case 'prop': return this.tone(d, t, { type: 'triangle', f0: 180, f1: 90, dur: 0.08, gain: 0.2 })
      case 'propBreak':
        this.noise(d, t, { dur: 0.35, f0: 900, f1: 120, type: 'lowpass', gain: 0.45 })
        this.tone(d, t, { type: 'triangle', f0: 140, f1: 50, dur: 0.3, gain: 0.3 })
        return
      case 'uiClick': return this.tone(d, t, { type: 'square', f0: 1200, f1: 900, dur: 0.05, gain: 0.07 })
      case 'uiHover': return this.tone(d, t, { type: 'sine', f0: 1600, dur: 0.03, gain: 0.03 })
      case 'win':
        this.arp(d, t, [523, 659, 784, 1047], 0.11, 'square', 0.1, 0.2)
        this.tone(d, t + 0.44, { type: 'square', f0: 1319, dur: 0.6, gain: 0.1 })
        this.tone(d, t + 0.44, { type: 'triangle', f0: 523, dur: 0.6, gain: 0.15 })
        return
      case 'lose': return this.arp(d, t, [392, 349, 311, 262], 0.16, 'triangle', 0.16, 0.3)
      case 'token':
        this.arp(d, t, [1047, 1319, 1568, 2093, 2637], 0.07, 'sine', 0.14, 0.4)
        this.noise(d, t + 0.3, { dur: 0.6, f0: 8000, type: 'highpass', gain: 0.05 })
        return
      case 'status': return this.tone(d, t, { type: 'sine', f0: 700, f1: 350, dur: 0.25, gain: 0.12 })
      case 'heal': return this.arp(d, t, [660, 880, 1100], 0.05, 'sine', 0.1, 0.2)
      // a swoosh: band-passed noise sweeping down (a heavy swing lower and longer)
      case 'swing':
        this.noise(d, t, { dur: big ? 0.2 : 0.13, f0: big ? 1400 : 2600, f1: big ? 300 : 700, type: 'bandpass', q: 1.4, gain: big ? 0.3 : 0.22, attack: 0.02 })
        return
      // a tap of a string: a short bright knock
      case 'tap':
        this.noise(d, t, { dur: 0.05, f0: 2600, f1: 900, type: 'bandpass', q: 1.2, gain: 0.3 })
        this.tone(d, t, { type: 'triangle', f0: 420, f1: 200, dur: 0.05, gain: 0.18 })
        return
      // the body of a melee finisher: a low sine drop under a short crunch (the element's hit plays on top)
      case 'thud':
        this.tone(d, t, { type: 'sine', f0: big ? 110 : 150, f1: 40, dur: big ? 0.3 : 0.18, gain: big ? 0.55 : 0.4 })
        this.noise(d, t, { dur: 0.07, f0: 3200, f1: 800, type: 'lowpass', gain: big ? 0.35 : 0.22 })
        return
      // a parry: a metallic clang (two detuned squares, a ring) over a click
      case 'parry':
        this.tone(d, t, { type: 'square', f0: 1480, f1: 1320, dur: 0.28, gain: 0.1 })
        this.tone(d, t, { type: 'square', f0: 1975, f1: 1760, dur: 0.22, gain: 0.07 })
        this.tone(d, t, { type: 'sine', f0: 2960, dur: 0.4, gain: 0.05 })
        this.noise(d, t, { dur: 0.04, f0: 6000, type: 'highpass', gain: 0.3 })
        return
      // a throw: a rising whoomph of air, then the landing's low thump
      case 'throw':
        this.noise(d, t, { dur: 0.3, f0: 300, f1: 1400, type: 'bandpass', q: 0.8, gain: 0.3, attack: 0.06 })
        this.tone(d, t + 0.22, { type: 'sine', f0: 120, f1: 45, dur: 0.25, gain: 0.45 })
        return
      // a wall splat: a crunch of noise and a heavy low hit
      case 'splat':
        this.noise(d, t, { dur: 0.25, f0: 1400, f1: 150, type: 'lowpass', gain: 0.55 })
        this.tone(d, t, { type: 'triangle', f0: 95, f1: 35, dur: 0.3, gain: 0.5 })
        for (let i = 0; i < 3; i++) this.noise(d, t + 0.02 + i * 0.03, { dur: 0.04, f0: 2500 + i * 700, type: 'bandpass', q: 2, gain: 0.18 })
        return
      case 'whiff': return this.noise(d, t, { dur: 0.1, f0: 4000, f1: 1800, type: 'highpass', gain: 0.07, attack: 0.02 })
      case 'evolve': {
        // a rising, accelerating arpeggio under a shimmer, then the arrival chord (about 1 s, lined up with the flash)
        const notes = [392, 440, 494, 523, 587, 659, 740, 784, 880, 988, 1047, 1175]
        let at = t
        notes.forEach((f, i) => { this.tone(d, at, { type: 'square', f0: f, dur: 0.1, gain: 0.07 }); at += Math.max(0.035, 0.1 - i * 0.006) })
        this.noise(d, t, { dur: 0.9, f0: 3000, f1: 9000, type: 'bandpass', q: 2, gain: 0.08, attack: 0.6 })
        for (const f of [523, 659, 784, 1047]) this.tone(d, at + 0.02, { type: 'triangle', f0: f, dur: 0.7, gain: 0.1 })
        this.tone(d, at + 0.02, { type: 'sine', f0: 2093, dur: 0.5, gain: 0.05 })
        return
      }
    }
  }

  private cast(d: AudioNode, t: number, el: string, big: boolean): void {
    const g = big ? 1.3 : 1
    switch (el) {
      case 'Fire':
        this.noise(d, t, { dur: 0.35, f0: 300, f1: 1500, type: 'bandpass', q: 0.7, gain: 0.35 * g, attack: 0.04 })
        this.tone(d, t, { type: 'sawtooth', f0: 90, f1: 60, dur: 0.3, gain: 0.08 })
        return
      case 'Water':
        for (let i = 0; i < 3; i++) this.tone(d, t + i * 0.05, { type: 'sine', f0: 400 + Math.random() * 300, f1: 1200, dur: 0.07, gain: 0.18 * g })
        this.noise(d, t, { dur: 0.2, f0: 1000, type: 'lowpass', gain: 0.12 })
        return
      case 'Lightning':
        this.tone(d, t, { type: 'sawtooth', f0: 1800, f1: 200, dur: 0.18, gain: 0.14 * g })
        this.noise(d, t, { dur: 0.15, f0: 4000, type: 'highpass', gain: 0.22 * g })
        return
      case 'Grass':
        this.noise(d, t, { dur: 0.22, f0: 2500, f1: 5000, type: 'bandpass', q: 1.2, gain: 0.22 * g, attack: 0.02 })
        return
      case 'Psychic':
        this.tone(d, t, { type: 'sine', f0: 600, f1: 1400, dur: 0.3, gain: 0.12 * g })
        this.tone(d, t, { type: 'sine', f0: 606, f1: 1414, dur: 0.3, gain: 0.12 * g })
        return
      case 'Fighting': case 'Metal':
        this.tone(d, t, { type: 'triangle', f0: 160, f1: 60, dur: 0.12, gain: 0.35 * g })
        this.noise(d, t, { dur: 0.08, f0: 900, type: 'lowpass', gain: 0.25 })
        return
      case 'Darkness':
        this.tone(d, t, { type: 'sawtooth', f0: 110, f1: 70, dur: 0.25, gain: 0.12 * g })
        this.noise(d, t, { dur: 0.2, f0: 600, f1: 2000, type: 'bandpass', gain: 0.18 })
        return
      case 'Dragon':
        this.tone(d, t, { type: 'sawtooth', f0: 80, f1: 160, dur: 0.4, gain: 0.15 * g })
        this.noise(d, t, { dur: 0.4, f0: 500, f1: 2500, type: 'bandpass', gain: 0.2 })
        return
      case 'Fairy':
        this.arp(d, t, [1568, 2093, 2637], 0.04, 'sine', 0.08 * g, 0.15)
        return
      default:
        this.noise(d, t, { dur: 0.12, f0: 800, f1: 2400, type: 'bandpass', gain: 0.22 * g })
    }
  }
}

export const sfx = new Sfx()
