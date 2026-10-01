// Every sound of the opening. Recorded CC0 samples (public/sfx/packs/, docs/SFX_CREDITS.md) played through Web Audio
// with per-play pitch and volume variation, and the original synthesised version of each sound (oscillators and
// noise) as the fallback: before the samples have loaded, when a file is missing or fails to decode, or without fetch.
// The event API is the one the scene has always called; rarePack() and shake() are new and optional.
import type { Fx } from './types';
import { GRAIN_SLOT, PITCH_HZ, SAMPLES, SampleBank, type SampleName } from './samples';
import type { RollSoundDetail, RollSoundEvent } from './roll/types';

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic steps: the per-card climb
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** the master level at the arena's default volume (0.7) */
const MASTER = 0.8;
/** the last fanfare (a vintage roll landing, or the rare-pack reskin right after it): one per landing, not two */
let lastFanfare = -1e9;
const FANFARE_GAP_MS = 2500;
function fanfareFree(): boolean {
  const now = performance.now();
  if (now - lastFanfare < FANFARE_GAP_MS) return false;
  lastFanfare = now;
  return true;
}

interface Played { src: AudioBufferSourceNode; gain: GainNode }

/** the arena's own volume / mute (src/main.ts, localStorage 'pokearena.audio') */
function arenaAudio(): { volume: number; muted: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem('pokearena.audio') ?? 'null') as { volume?: number; muted?: boolean } | null;
    return { volume: clamp(v?.volume ?? 0.7, 0, 1), muted: !!v?.muted };
  } catch { return { volume: 0.7, muted: false }; }
}

export class PackAudio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  private noise!: AudioBuffer;
  private drone: { gain: GainNode; stop: () => void } | null = null;
  private charge: { stop: (ok: boolean) => void } | null = null;
  muted: boolean;
  /** 0-1, the arena's volume slider (1 = its default 0.7 scaled up to full) */
  private volume: number;
  private lastGrain = 0;
  private lastShake = 0;
  private lastSlot = new Map<SampleName, number>();
  readonly bank: SampleBank;

  constructor(enabled = true, bank?: SampleBank) {
    let stored: string | null = null;
    try { stored = localStorage.getItem('pokeshell-arena-mute'); } catch { /* storage may be off */ }
    const arena = arenaAudio();
    this.volume = arena.volume;
    // the pack's own toggle wins when it's been used; otherwise the arena's mute (and the host's sound option) decide
    this.muted = stored === null ? (!enabled || arena.muted) : stored === '1';
    this.bank = bank ?? new SampleBank();
    const canPlay = typeof window !== 'undefined' && !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
    if (!this.muted && canPlay) this.bank.prefetch();
  }

  private level() { return this.muted ? 0 : MASTER * clamp(this.volume / 0.7, 0, 1.25); }

  /** browsers only start audio from a user gesture: call from the first pointerdown / keydown */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    if (this.muted) return;   // no AudioContext until the sound is on (setMuted(false) comes first)
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.level();
    this.master.connect(comp);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    void this.bank.load(ctx);
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem('pokeshell-arena-mute', m ? '1' : '0'); } catch { /* ignore */ }
    if (!m) this.bank.prefetch();
    if (this.ctx) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.05);
  }

  private get ok() { return !!this.ctx && !this.muted; }
  private t() { return this.ctx!.currentTime; }

  // ------------------------------------------------------------ the sample player
  /** play a loaded sample; null when it isn't loaded (the caller then synthesises) */
  private play(name: SampleName | null, o: { gain?: number; rate?: number; at?: number; offset?: number; dur?: number; dest?: AudioNode } = {}): Played | null {
    const buf = name ? this.bank.get(name) : undefined;
    if (!buf) return null;
    const ctx = this.ctx!, t0 = o.at ?? this.t();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = clamp(o.rate ?? 1, 0.25, 4);
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0.0001, o.gain ?? 1);
    src.connect(gain).connect(o.dest ?? this.master);
    if (o.dur !== undefined) src.start(t0, o.offset ?? 0, o.dur); else src.start(t0, o.offset ?? 0);
    return { src, gain };
  }

  /** one grain of a sprite (crinkle, riffle): a random slot, never the last one again */
  private grain(name: 'crinkle' | 'riffle' | 'ratchet', gain: number, rate: number, at?: number): Played | null {
    const n = SAMPLES[name].grains;
    let i = Math.floor(Math.random() * n);
    if (i === this.lastSlot.get(name)) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
    this.lastSlot.set(name, i);
    return this.play(name, { gain, rate, at, offset: i * GRAIN_SLOT, dur: GRAIN_SLOT });
  }

  /** a tuned sample (music box, glockenspiel) at freq Hz, fading out after dur seconds */
  private note(name: 'musicbox' | 'glock', freq: number, at: number, dur: number, gain: number): Played | null {
    const p = this.play(name, { gain, rate: freq / PITCH_HZ[name], at });
    if (p) {
      p.gain.gain.setValueAtTime(gain, at + dur);
      p.gain.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.35);
      p.src.stop(at + dur + 0.4);
    }
    return p;
  }

  // ------------------------------------------------------------ synth building blocks (the fallback)
  private env(g: GainNode, t0: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  private noiseSrc() {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise; s.loop = true;
    s.loopStart = Math.random(); s.loopEnd = s.loopStart + 0.9;
    return s;
  }

  private tone(freq: number, t0: number, dur: number, peak: number, type: OscillatorType = 'sine', dest?: AudioNode, attack = 0.005) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    const g = ctx.createGain(); this.env(g, t0, attack, peak, dur);
    o.connect(g).connect(dest ?? this.master);
    o.start(t0); o.stop(t0 + attack + dur + 0.05);
    return o;
  }

  /** a bell: the music box sample at freq, else a sine plus inharmonic partials */
  private bell(freq: number, t0: number, dur: number, peak: number) {
    // the music box covers the chords; the top notes (past its comfortable range) ring on the glockenspiel
    if (freq < PITCH_HZ.musicbox * 2.5 ? this.note('musicbox', freq, t0, dur, peak * 4.5) : this.note('glock', freq, t0, dur, peak * 3.5)) return;
    this.tone(freq, t0, dur, peak, 'sine');
    this.tone(freq * 2.76, t0, dur * 0.5, peak * 0.35, 'sine');
    this.tone(freq * 5.4, t0, dur * 0.25, peak * 0.12, 'sine');
  }

  // ------------------------------------------------------------ ambience (synthesised by design: a bed, not an effect)
  droneOn(level = 0.06) {
    if (!this.ctx) return;
    if (this.drone) { this.drone.gain.gain.setTargetAtTime(this.muted ? 0 : level, this.t(), 0.6); return; }
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 3;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lfoG = ctx.createGain(); lfoG.gain.value = 140; lfo.connect(lfoG).connect(lp.frequency);
    const oscs = [55, 55.4, 82.6].map((f, i) => { const o = ctx.createOscillator(); o.type = i === 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); return o; });
    lp.connect(g).connect(this.master);
    lfo.start();
    g.gain.setTargetAtTime(level, this.t(), 0.8);
    this.drone = { gain: g, stop: () => { oscs.forEach(o => o.stop()); lfo.stop(); } };
  }
  droneLevel(level: number, time = 0.5) { if (this.drone && this.ctx) this.drone.gain.gain.setTargetAtTime(level, this.t(), time); }
  droneOff() {
    if (!this.drone || !this.ctx) return;
    const d = this.drone; this.drone = null;
    d.gain.gain.setTargetAtTime(0.0001, this.t(), 0.4);
    setTimeout(() => d.stop(), 2500);
  }

  // ------------------------------------------------------------ the tear
  /** one foil crinkle grain; speed in px/ms decides density and loudness */
  crinkle(speed: number) {
    if (!this.ok) return;
    const now = performance.now();
    const gap = Math.max(14, 70 - speed * 60);
    if (now - this.lastGrain < gap) return;
    this.lastGrain = now;
    const peak = Math.min(0.5, 0.12 + speed * 0.3) * (0.5 + Math.random() * 0.5);
    // faster drags crinkle brighter (a touch higher) as well as louder and denser
    if (this.grain('crinkle', peak * 1.6, rnd(0.85, 1.2) + clamp(speed, 0, 1.5) * 0.08)) return;
    const ctx = this.ctx!, t0 = this.t();
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000 + Math.random() * 3500; bp.Q.value = 1.4 + Math.random() * 3;
    const g = ctx.createGain(); this.env(g, t0, 0.002, peak, 0.012 + Math.random() * 0.02);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t0); n.stop(t0 + 0.06);
  }

  /** the strip tearing off; strength 1-1.5 grows with the pack's best card */
  rip(strength = 1) {
    if (!this.ok) return;
    const t0 = this.t();
    const main = this.play(this.bank.pick(['rip-1', 'rip-2', 'rip-3']), { gain: 0.85 * strength, rate: rnd(0.94, 1.06) });
    if (main) {
      // big packs: a foil boom under the tear, and the body of the pack thumping
      if (strength > 1.15) this.play('rip-foil', { gain: (strength - 1) * 1.8, rate: rnd(0.9, 1), at: t0 + 0.02 });
      this.play('thump-1', { gain: 0.35 * strength, rate: 0.8, at: t0 + 0.01 });
      return;
    }
    const ctx = this.ctx!;
    const n = this.noiseSrc();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(400, t0); hp.frequency.exponentialRampToValueAtTime(6000, t0 + 0.25);
    const g = ctx.createGain(); this.env(g, t0, 0.01, 0.6 * strength, 0.28);
    n.connect(hp).connect(g).connect(this.master); n.start(t0); n.stop(t0 + 0.4);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.22);
    const og = ctx.createGain(); this.env(og, t0, 0.005, 0.55 * strength, 0.25);
    o.connect(og).connect(this.master); o.start(t0); o.stop(t0 + 0.35);
  }

  /**
   * the stack sliding out (dur >= 0.45), the fan closing (0.3), a card flung off (shorter): kind picks the recording
   * and defaults from dur, which is what the scene has always passed
   */
  whoosh(dur = 0.35, level = 0.25, kind: 'stack' | 'fan' | 'fling' = dur >= 0.45 ? 'stack' : dur >= 0.3 ? 'fan' : 'fling') {
    if (!this.ok) return;
    const t0 = this.t();
    if (kind === 'stack' && this.play(this.bank.pick(['stack-1', 'stack-2']), { gain: level * 2.6, rate: rnd(0.95, 1.05) })) return;
    // the fan's riffle builds to a snap at its end: start near it
    if (kind === 'fan' && this.play('fan', { gain: level * 2.8, rate: rnd(0.97, 1.05), offset: 0.55 })) return;
    if (kind === 'fling') {
      const card = this.play(this.bank.pick(['shove-1', 'shove-2', 'shove-3']), { gain: level * 2.4, rate: rnd(0.95, 1.1) });
      const air = this.play('swish', { gain: level * 1.4, rate: rnd(1, 1.2) });
      if (card || air) return;
    }
    const ctx = this.ctx!;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(2400, t0); bp.frequency.exponentialRampToValueAtTime(300, t0 + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(level, t0 + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    n.connect(bp).connect(g).connect(this.master); n.start(t0); n.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------------------ the cards
  private pitch(step: number, base = 392) { // G4, climbing the pentatonic scale
    const oct = Math.floor(step / PENTA.length), s = PENTA[((step % PENTA.length) + PENTA.length) % PENTA.length];
    return base * Math.pow(2, oct + s / 12);
  }

  /**
   * the flip / swipe tick, one pentatonic step higher per card. Quiet ticks (level < 0.12) are the fan's riffle;
   * the loud ones a card snap plus a music-box note on the climbing scale.
   */
  tick(step: number, level = 0.22) {
    if (!this.ok) return;
    const t0 = this.t();
    if (level < 0.12) {
      if (this.grain('riffle', level * 5, clamp(1 + step * 0.03, 0.75, 1.4) * rnd(0.97, 1.03))) return;
    } else {
      const snap = this.play(this.bank.pick(['snap-1', 'snap-2', 'snap-3', 'snap-4']), { gain: level * 3.2, rate: rnd(0.95, 1.08) });
      const tone = this.note('musicbox', this.pitch(step, 392), t0, 0.25, level * 1.6);
      if (snap || tone) return;
    }
    const ctx = this.ctx!;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 2;
    const g = ctx.createGain(); this.env(g, t0, 0.001, level * 0.8, 0.02);
    n.connect(bp).connect(g).connect(this.master); n.start(t0); n.stop(t0 + 0.05);
    this.tone(this.pitch(step, 196), t0, 0.12, level * 0.9, 'sine');
    this.tone(this.pitch(step, 392), t0, 0.08, level * 0.25, 'triangle');
  }

  /** the pulse of a face-down hit: a soft heartbeat in the tier's register */
  pulse(hit: number) {
    if (!this.ok) return;
    const t0 = this.t();
    if (this.play(this.bank.pick(['thump-1', 'thump-2', 'thump-3']), { gain: 0.4 + hit * 0.09, rate: clamp(0.72 + hit * 0.05, 0.6, 1.1) })) return;
    this.tone(55 + hit * 6, t0, 0.18, 0.18 + hit * 0.04, 'sine');
    this.tone(110 + hit * 12, t0 + 0.02, 0.1, 0.05, 'triangle');
  }

  /** hold-to-reveal charge: a riser; stop(true) when it completes, stop(false) if released early */
  chargeStart(hit: number, dur: number) {
    if (!this.ok) return;
    this.chargeStop(false);
    const ctx = this.ctx!, t0 = this.t();
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.16 + hit * 0.02, t0 + dur);
    const trem = ctx.createGain(); trem.gain.value = 1;
    const lfo = ctx.createOscillator(); lfo.frequency.setValueAtTime(4, t0); lfo.frequency.linearRampToValueAtTime(18, t0 + dur);
    const lg = ctx.createGain(); lg.gain.value = 0.45; lfo.connect(lg).connect(trem.gain);
    const rec = this.play('riser', { gain: 1, rate: clamp(0.9 + hit * 0.05, 0.8, 1.3), dest: trem });
    let oscs: OscillatorNode[] = [];
    if (rec) {
      // the recording already rises: the envelope only needs to swell with it, bigger hits louder and faster tremolo
      g.gain.cancelScheduledValues(t0);
      g.gain.setValueAtTime(0.25, t0); g.gain.linearRampToValueAtTime(0.55 + hit * 0.07, t0 + dur);
      lg.gain.value = hit >= 4 ? 0.35 : 0.15;
      trem.connect(g).connect(this.master);
    } else {
      const f0 = hit >= 5 ? 220 : 196;
      oscs = (['sine', 'triangle', 'sawtooth'] as OscillatorType[]).map((type, i) => {
        const o = ctx.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(f0 * (i === 2 ? 0.5 : 1) * (1 + i * 0.003), t0);
        o.frequency.exponentialRampToValueAtTime(f0 * 2 * (i === 2 ? 0.5 : 1), t0 + dur);
        const og = ctx.createGain(); og.gain.value = i === 2 ? 0.25 : 0.5; o.connect(og).connect(trem); o.start(t0); return o;
      });
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t0); lp.frequency.exponentialRampToValueAtTime(5000, t0 + dur);
      trem.connect(lp).connect(g).connect(this.master);
    }
    lfo.start(t0);
    this.charge = {
      stop: (_done: boolean) => {
        const t = this.t();
        g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, 0.05);
        setTimeout(() => {
          oscs.forEach(o => { try { o.stop(); } catch { /* */ } });
          try { rec?.src.stop(); } catch { /* */ }
          try { lfo.stop(); } catch { /* */ }
        }, 400);
      },
    };
  }
  chargeStop(done: boolean) { if (this.charge) { this.charge.stop(done); this.charge = null; } }

  /** the reveal stinger per effect family; step keeps it in the climbing key. Rarer families layer more. */
  stinger(fx: Fx, step: number, shiny: boolean) {
    if (!this.ok) return;
    const t0 = this.t();
    const root = this.pitch(step, 261.63);
    const chord = (ratios: number[], at: number, dur: number, peak: number, spread = 0) =>
      ratios.forEach((r, i) => this.bell(root * r, at + i * spread, dur, peak));
    const s = (name: SampleName, gain: number, at = t0, rate = 1) => this.play(name, { gain, at, rate: rate * rnd(0.98, 1.02) });
    switch (fx) {
      case 'plain': if (!this.note('musicbox', root, t0, 0.3, 0.35)) this.tone(root, t0, 0.25, 0.12, 'triangle'); break;
      case 'reverse': chord([1, 1.5], t0, 0.5, 0.1, 0.03); s('wink', 0.3); break;
      case 'holo': chord([1, 1.25, 1.5], t0, 0.9, 0.12, 0.04); s('sparkle-1', 0.35); break;
      case 'full-art': chord([1, 1.25, 1.5, 2], t0, 1.3, 0.12, 0.05); this.shimmer(t0 + 0.1, root * 4, 6, 0.04); s('sparkle-1', 0.5); break;
      case 'radiant': chord([1, 1.26, 1.5, 1.89], t0, 1.4, 0.12, 0.02); this.shimmer(t0, root * 3, 10, 0.05); s('magic-pop', 0.45); s('sparkle-2', 0.45, t0 + 0.05); break;
      case 'shiny': chord([1, 1.5, 2, 3], t0, 1.2, 0.1, 0.07); this.shimmer(t0 + 0.05, root * 4, 12, 0.05); s('sparkle-2', 0.55); s('wink', 0.35, t0 + 0.1, 1.1); break;
      case 'alt-art': chord([1, 1.25, 1.5, 1.875, 2.5], t0, 1.8, 0.1, 0.12); s('sparkle-1', 0.45, t0 + 0.2); break;
      case 'rainbow': chord([1, 1.125, 1.25, 1.5, 1.68, 2, 2.5, 3], t0, 1.1, 0.09, 0.06); this.shimmer(t0 + 0.3, root * 4, 14, 0.04); s('magic-pop', 0.6); s('sparkle-2', 0.5, t0 + 0.25); break;
      case 'gold': {
        if (!s('boom', 0.95)) {
          const ctx = this.ctx!;
          const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t0); o.frequency.exponentialRampToValueAtTime(38, t0 + 0.8);
          const og = ctx.createGain(); this.env(og, t0, 0.01, 0.7, 1.1); o.connect(og).connect(this.master); o.start(t0); o.stop(t0 + 1.3);
        }
        s('brass', 0.6, t0 + 0.06);
        chord([0.5, 1, 1.25, 1.5, 2], t0 + 0.04, 2.4, 0.13);
        this.bell(root * 4, t0 + 0.35, 1.6, 0.1);
        this.shimmer(t0 + 0.2, root * 4, 16, 0.05);
        s('sparkle-2', 0.55, t0 + 0.3);
        break;
      }
    }
    if (shiny) { this.shimmer(t0 + 0.15, root * 6, 8, 0.05); s('wink', 0.3, t0 + 0.2, 1.2); }
  }

  /** sparkle ticks: glockenspiel notes (else short high sines) at random times */
  private shimmer(t0: number, f: number, n: number, peak: number) {
    const rec = this.bank.has('glock');
    for (let i = 0; i < n; i++) {
      const at = t0 + Math.random() * 0.9, fr = f * (1 + Math.random() * 0.6), p = peak * (0.5 + Math.random());
      if (rec) { if (i % 2 === 0) this.note('glock', clamp(fr, 800, 12000), at, 0.25, p * 5); } // half as many: the glock rings longer
      else this.tone(fr, at, 0.08 + Math.random() * 0.1, p, 'sine', undefined, 0.002);
    }
  }

  newBadge() {
    if (!this.ok) return;
    const t0 = this.t() + 0.05;
    const slap = this.play('sticker', { gain: 0.7, at: t0, rate: rnd(0.95, 1.05) });
    const blip = this.play('blip', { gain: 0.4, at: t0 + 0.06, rate: 1.1 });
    if (slap || blip) return;
    this.tone(1318.5, t0, 0.14, 0.12, 'square', undefined, 0.002);
    this.tone(1975.5, t0 + 0.09, 0.3, 0.1, 'square', undefined, 0.002);
  }

  summary() {
    if (!this.ok) return;
    const t0 = this.t();
    if (this.play('jingle', { gain: 0.6 })) return;
    [1, 1.25, 1.5, 2].forEach((r, i) => this.bell(392 * r, t0 + i * 0.07, 1, 0.07));
  }

  /** a rare pack (a sub-set or a special pack) announcing itself: a short fanfare and sparkles */
  rarePack() {
    if (!this.ok || !fanfareFree()) return;
    const t0 = this.t();
    const fan = this.play('fanfare', { gain: 0.5 });
    const spark = this.play('sparkle-2', { gain: 0.4, at: t0 + 0.1 });
    if (fan || spark) return;
    [1, 1.25, 1.5, 2, 2.5].forEach((r, i) => this.bell(392 * r, t0 + i * 0.09, 1.2, 0.08));
    this.shimmer(t0 + 0.3, 392 * 6, 10, 0.04);
  }

  /** a revealed card being shaken: card rattle grains, denser and louder with the shaking (speed, energy 0-1) */
  shake(speed: number, energy: number) {
    if (!this.ok || speed < 0.12) return;
    const now = performance.now();
    if (now - this.lastShake < Math.max(30, 130 - speed * 90 - energy * 40)) return;
    this.lastShake = now;
    const peak = clamp(0.08 + speed * 0.25 + energy * 0.3, 0, 0.6) * rnd(0.6, 1);
    if (this.grain('riffle', peak * 1.8, rnd(0.9, 1.15) + energy * 0.2)) return;
    const ctx = this.ctx!, t0 = this.t();
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600 + Math.random() * 1800; bp.Q.value = 2.5;
    const g = ctx.createGain(); this.env(g, t0, 0.001, peak * 0.6, 0.018);
    n.connect(bp).connect(g).connect(this.master); n.start(t0); n.stop(t0 + 0.05);
  }

  // ------------------------------------------------------------ the set roll (src/packs/roll, docs/PACK_ROLL.md)
  private lastTick = 0;

  /** the pack's mute toggle may have been flipped by another PackAudio (the scene's): follow it */
  private syncMute() {
    let stored: string | null = null;
    try { stored = localStorage.getItem('pokeshell-arena-mute'); } catch { /* storage off */ }
    if (stored !== null && (stored === '1') !== this.muted) {
      this.muted = stored === '1';
      if (this.ctx) this.master.gain.setTargetAtTime(this.level(), this.t(), 0.05);
    }
  }

  /** one of the reel's sound events: the recording where it's loaded, the synth otherwise */
  roll(event: RollSoundEvent, d: RollSoundDetail = {}) {
    this.syncMute();
    if (!this.ok) return;
    const ctx = this.ctx!, t0 = this.t();
    const speed = clamp(d.speed ?? 0.5, 0, 1);
    switch (event) {
      case 'roll:tick': {
        // a ratchet click per tile, higher and louder with the speed; at cruise the ear can't split them past ~40/s
        const now = performance.now();
        if (now - this.lastTick < 25) return;
        this.lastTick = now;
        const level = 0.12 + speed * 0.22;
        const click = this.grain('ratchet', level * 2.2, (0.8 + speed * 0.55) * rnd(0.97, 1.03) * (d.gold ? 1.06 : 1));
        if (d.rare) this.note('glock', 2637 * rnd(0.99, 1.01), t0, 0.12, 0.18);   // a vintage tile: a tiny bell
        if (click) return;
        const n = this.noiseSrc();
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3500; bp.Q.value = 1.5;
        const g = ctx.createGain(); this.env(g, t0, 0.001, level, 0.004 + (1 - speed) * 0.002);
        n.connect(bp).connect(g).connect(this.master); n.start(t0); n.stop(t0 + 0.03);
        this.tone(1800 + speed * 800, t0, 0.025, level * 0.5, 'triangle', undefined, 0.001);
        if (d.rare && !this.bank.has('glock')) this.tone(2637, t0, 0.1, 0.03, 'sine', undefined, 0.002);
        return;
      }
      case 'roll:start': {
        const p = this.play('whirr', { gain: 0.5, rate: 0.85 });
        if (p) { p.src.playbackRate.setValueAtTime(0.85, t0); p.src.playbackRate.linearRampToValueAtTime(1.25, t0 + 0.6); return; }
        const n = this.noiseSrc();
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
        bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(2000, t0 + 0.4);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
        n.connect(bp).connect(g).connect(this.master); n.start(t0); n.stop(t0 + 0.45);
        return;
      }
      case 'roll:lock':
        if (this.play('clunk', { gain: 0.55, rate: rnd(0.95, 1.05) })) return;
        this.tone(80, t0, 0.06, 0.35, 'sine', undefined, 0.003);
        return;
      case 'roll:tease': {
        if (this.play('shimmer', { gain: 0.55 })) return;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12, t0 + 1); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
        g.connect(this.master);
        for (const type of ['sine', 'triangle'] as OscillatorType[]) {
          const o = ctx.createOscillator(); o.type = type;
          o.frequency.setValueAtTime(392, t0); o.frequency.exponentialRampToValueAtTime(784, t0 + 1.2);
          o.connect(g); o.start(t0); o.stop(t0 + 1.45);
        }
        return;
      }
      case 'roll:land': {
        const thunk = this.play('thunk', { gain: 0.7, rate: rnd(0.95, 1.02) });
        const ding = this.play('ding', { gain: d.rare ? 0.55 : 0.4, at: t0 + 0.03, rate: d.rare ? 1.12 : 1 });
        if (thunk || ding) return;
        const n = this.noiseSrc();
        const g = ctx.createGain(); this.env(g, t0, 0.001, 0.4, 0.02);
        n.connect(g).connect(this.master); n.start(t0); n.stop(t0 + 0.04);
        this.tone(120, t0, 0.12, 0.5, 'sine', undefined, 0.002);
        this.bell(784, t0 + 0.03, 0.6, 0.08);
        return;
      }
      case 'roll:fanfare': {
        if (!fanfareFree()) return;
        const fan = this.play('vintage', { gain: 0.6 });
        const spark = this.play('sparkle-2', { gain: 0.35, at: t0 + 0.2 });
        if (fan || spark) return;
        const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t0); o.frequency.exponentialRampToValueAtTime(38, t0 + 0.8);
        const og = ctx.createGain(); this.env(og, t0, 0.01, 0.6, 1.1); o.connect(og).connect(this.master); o.start(t0); o.stop(t0 + 1.3);
        [0.5, 1, 1.25, 1.5, 2].forEach(r => this.bell(392 * r, t0 + 0.04, 2, 0.11));
        this.bell(392 * 4, t0 + 0.35, 1.4, 0.08);
        this.shimmer(t0 + 0.2, 392 * 4, 12, 0.05);
        return;
      }
      case 'roll:interrupt': {
        if (this.play('zip', { gain: 0.5, rate: d.snapped ? 1.12 : 1 })) return;
        const n = this.noiseSrc();
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
        const g = ctx.createGain(); this.env(g, t0, 0.001, 0.45, 0.015);
        n.connect(hp).connect(g).connect(this.master); n.start(t0); n.stop(t0 + 0.03);
        return;
      }
    }
  }

  close() { this.droneOff(); if (this.ctx) setTimeout(() => void this.ctx?.close(), 2600); }
}
