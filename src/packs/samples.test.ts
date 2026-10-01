import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PackAudio } from './audio';
import { CONTROL_CALLS, EVENT_SAMPLES, GRAIN_SLOT, ROLL_SAMPLES, SAMPLE_NAMES, SAMPLES, SampleBank, resetSampleCache, type PackSoundEvent, type SampleName } from './samples';
import type { RollSoundEvent } from './roll/types';
import type { Fx } from './types';

const ROOT = join(__dirname, '..', '..');
const DIR = join(ROOT, 'public', 'sfx', 'packs');

// ------------------------------------------------------------------ a fake Web Audio graph that records what plays
class Param {
  value = 0;
  setValueAtTime(v: number) { this.value = v; return this; }
  linearRampToValueAtTime(v: number) { this.value = v; return this; }
  exponentialRampToValueAtTime(v: number) { this.value = v; return this; }
  setTargetAtTime(v: number) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
}
class Node {
  constructor(public ctx: FakeCtx, public kind: string) {}
  connect<T>(n: T): T { return n; }
  disconnect() {}
}
class FakeBuffer {
  constructor(public name: string, public duration = 1, public sampleRate = 48000) {}
  getChannelData() { return new Float32Array(16); }
}
class FakeCtx {
  sampleRate = 48000; currentTime = 0; state = 'running'; destination = new Node(this, 'dest');
  played: { buffer: FakeBuffer | null; offset: number; dur?: number; rate: number }[] = [];
  oscillators = 0;
  createGain() { return Object.assign(new Node(this, 'gain'), { gain: new Param() }); }
  createBiquadFilter() { return Object.assign(new Node(this, 'filter'), { type: '', frequency: new Param(), Q: new Param() }); }
  createDynamicsCompressor() { return Object.assign(new Node(this, 'comp'), { threshold: new Param(), ratio: new Param(), attack: new Param(), release: new Param() }); }
  createOscillator() {
    this.oscillators++;
    return Object.assign(new Node(this, 'osc'), { type: 'sine', frequency: new Param(), start() {}, stop() {} });
  }
  createBufferSource() {
    const ctx = this;
    const s = Object.assign(new Node(this, 'src'), {
      buffer: null as FakeBuffer | null, loop: false, loopStart: 0, loopEnd: 0, playbackRate: new Param(),
      start(_t: number, offset = 0, dur?: number) { ctx.played.push({ buffer: s.buffer, offset, dur, rate: s.playbackRate.value }); },
      stop() {},
    });
    return s;
  }
  createBuffer(_c: number, len: number, sr: number) { return new FakeBuffer('noise', len / sr, sr); }
  decodeAudioData(ab: ArrayBuffer) { return Promise.resolve(new FakeBuffer(new TextDecoder().decode(ab))); }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

/** a PackAudio on a fake context; loaded = which samples the bank has (all, none, or a list) */
async function audioWith(loaded: 'all' | 'none' | SampleName[]) {
  let ctx!: FakeCtx;
  vi.stubGlobal('window', { AudioContext: class { constructor() { ctx = new FakeCtx(); return ctx; } } });
  const names = loaded === 'all' ? SAMPLE_NAMES : loaded === 'none' ? [] : loaded;
  // the fetcher answers with the file's name as its bytes, and fails the ones that aren't "on disk"
  const bank = new SampleBank('/sfx/packs/', async (url) => {
    const n = url.split('/').pop()!.replace(/\.(ogg|mp3)$/, '');
    if (!names.includes(n as SampleName)) throw new Error('404');
    return new TextEncoder().encode(n).buffer as ArrayBuffer;
  }, 'ogg');
  const a = new PackAudio(true, bank);
  a.setMuted(false);
  a.unlock();
  await bank.load(ctx as unknown as BaseAudioContext);
  return { a, ctx, bank };
}

/** fire one scene event with typical arguments */
function fire(a: PackAudio, e: PackSoundEvent, fx: Fx = 'gold') {
  switch (e) {
    case 'crinkle': a.crinkle(1); break;
    case 'rip': a.rip(1.5); break;
    case 'whoosh': a.whoosh(0.5, 0.3); a.whoosh(0.3, 0.18); a.whoosh(0.28, 0.2); break;
    case 'tick': a.tick(4, 0.2); a.tick(-3, 0.08); break;
    case 'pulse': a.pulse(4); break;
    case 'chargeStart': a.chargeStart(5, 0.95); a.chargeStop(true); break;
    case 'stinger': a.stinger(fx, 4, true); break;
    case 'newBadge': a.newBadge(); break;
    case 'summary': a.summary(); break;
    case 'rarePack': a.rarePack(); break;
    case 'shake': a.shake(0.8, 0.6); break;
    case 'droneOn': a.droneOff(); a.droneOn(); break;
    case 'droneLevel': a.droneOff(); a.droneOn(); a.droneLevel(0.03); break;
    case 'droneOff': a.droneOff(); a.droneOn(); a.droneOff(); break;
  }
}

const EVENTS = Object.keys(EVENT_SAMPLES) as PackSoundEvent[];
const FXS: Fx[] = ['plain', 'reverse', 'holo', 'full-art', 'alt-art', 'rainbow', 'gold', 'radiant', 'shiny'];

// one clock for the whole file, always moving on (the fanfare de-dupe is module state)
let clock = 1e9;
beforeEach(() => { resetSampleCache(); vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} }); vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5000)); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('pack sound events and their samples', () => {
  it('every this.audio.<call> in scene.ts is a mapped sound event or a control call', () => {
    const scene = readFileSync(join(__dirname, 'scene.ts'), 'utf8');
    const calls = new Set([...scene.matchAll(/this\.audio\.(\w+)/g)].map(m => m[1]));
    expect(calls.size).toBeGreaterThan(10);
    for (const c of calls) expect(c in EVENT_SAMPLES || (CONTROL_CALLS as readonly string[]).includes(c), `scene calls audio.${c}`).toBe(true);
  });

  it('every sample an event uses is in the manifest and on disk as .ogg and .mp3, under ~1.5 MB in all', () => {
    let total = 0;
    for (const [e, names] of Object.entries(EVENT_SAMPLES)) for (const n of names) expect(SAMPLES, `${e} -> ${n}`).toHaveProperty(n);
    for (const n of SAMPLE_NAMES) for (const ext of ['ogg', 'mp3']) {
      const p = join(DIR, `${n}.${ext}`);
      expect(existsSync(p), p).toBe(true);
      total += statSync(p).size;
    }
    expect(total).toBeLessThan(1.5 * 1024 * 1024);
    expect(existsSync(join(ROOT, 'docs', 'SFX_CREDITS.md'))).toBe(true);
    const credits = readFileSync(join(ROOT, 'docs', 'SFX_CREDITS.md'), 'utf8');
    for (const n of SAMPLE_NAMES) expect(credits, `credits for ${n}`).toContain(`\`${n}\``);
  });

  it('the grain sprites hold whole slots', () => {
    expect(SAMPLES.crinkle.grains * GRAIN_SLOT).toBeCloseTo(2.4);
    expect(SAMPLES.riffle.grains * GRAIN_SLOT).toBeCloseTo(1.2);
  });

  it('with the samples loaded, every sound event plays a recording (the drone stays synthesised)', async () => {
    const { a, ctx } = await audioWith('all');
    for (const e of EVENTS) {
      ctx.played = []; ctx.oscillators = 0;
      fire(a, e);
      const rec = ctx.played.filter(p => p.buffer && p.buffer.name !== 'noise').map(p => p.buffer!.name);
      if (EVENT_SAMPLES[e].length) {
        expect(rec.length, e).toBeGreaterThan(0);
        for (const r of rec) expect((EVENT_SAMPLES[e] as readonly string[]).includes(r), `${e} played ${r}`).toBe(true);
      } else expect(ctx.oscillators, e).toBeGreaterThan(0);
    }
  });

  it('every effect family has its own recorded stinger, and the rarer ones layer more', async () => {
    const { a, ctx } = await audioWith('all');
    const layers: Record<string, number> = {};
    for (const fx of FXS) { ctx.played = []; a.stinger(fx, 4, false); layers[fx] = ctx.played.length; expect(layers[fx], fx).toBeGreaterThan(0); }
    expect(layers.gold).toBeGreaterThan(layers.holo);
    expect(layers.holo).toBeGreaterThan(layers.plain);
    ctx.played = []; a.stinger('gold', 4, false);
    expect(ctx.played.map(p => p.buffer?.name)).toContain('boom');
  });

  it('with nothing loaded (files missing or undecodable), every event falls back to the synthesiser', async () => {
    const { a, ctx, bank } = await audioWith('none');
    expect(bank.size).toBe(0);
    for (const e of EVENTS) {
      ctx.played = []; ctx.oscillators = 0;
      fire(a, e);
      const rec = ctx.played.filter(p => p.buffer && p.buffer.name !== 'noise');
      expect(rec, e).toEqual([]);
      expect(ctx.oscillators + ctx.played.length, `${e} made no sound`).toBeGreaterThan(0);
    }
    for (const fx of FXS) { ctx.oscillators = 0; a.stinger(fx, 4, false); expect(ctx.oscillators, fx).toBeGreaterThan(0); }
  });

  it('a partly loaded bank plays what it has and synthesises the rest', async () => {
    const { a, ctx } = await audioWith(['crinkle']);
    ctx.played = []; a.crinkle(1);
    expect(ctx.played[0].buffer?.name).toBe('crinkle');
    expect(ctx.played[0].dur).toBeCloseTo(GRAIN_SLOT);
    ctx.played = []; ctx.oscillators = 0; a.rip(1);
    expect(ctx.played.every(p => p.buffer?.name === 'noise')).toBe(true);
    expect(ctx.oscillators).toBeGreaterThan(0);
  });

  it('crinkle grains follow the drag: faster is denser, louder and a little higher', async () => {
    const { a, ctx } = await audioWith('all');
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const now = vi.spyOn(performance, 'now');
    const run = (speed: number) => {
      ctx.played = [];
      for (let t = 0; t < 1000; t += 5) { now.mockReturnValue(2e6 + speed * 1e5 + t); a.crinkle(speed); }
      return ctx.played;
    };
    const slow = run(0.1), fast = run(1.2);
    expect(fast.length).toBeGreaterThan(slow.length * 2);
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(avg(fast.map(p => p.rate))).toBeGreaterThan(avg(slow.map(p => p.rate)));
    // every grain is one slot of the sprite
    for (const p of fast) { expect(p.dur).toBeCloseTo(GRAIN_SLOT); expect(Math.round(p.offset / GRAIN_SLOT) * GRAIN_SLOT).toBeCloseTo(p.offset); }
  });

  it('the flip ticks climb the scale', async () => {
    const { a, ctx } = await audioWith('all');
    const rates = [2, 3, 4, 5, 6].map(step => { ctx.played = []; a.tick(step, 0.2); return ctx.played.find(p => p.buffer?.name === 'musicbox')!.rate; });
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThan(rates[i - 1]);
  });

  it('muted: nothing plays, and no context is made', async () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'pokeshell-arena-mute' ? '1' : null), setItem: () => {} });
    let made = 0;
    vi.stubGlobal('window', { AudioContext: class { constructor() { made++; return new FakeCtx(); } } });
    const a = new PackAudio(true, new SampleBank('/x/', async () => { throw new Error('no'); }, 'ogg'));
    a.unlock(); a.crinkle(1); a.stinger('gold', 3, true);
    expect(made).toBe(0);
    expect(a.muted).toBe(true);
  });

  it("the arena's mute and volume carry over", async () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'pokearena.audio' ? JSON.stringify({ volume: 0.35, muted: true }) : null), setItem: () => {} });
    const a = new PackAudio(true, new SampleBank('/x/', async () => { throw new Error('no'); }, 'ogg'));
    expect(a.muted).toBe(true);
    let ctx!: FakeCtx;
    vi.stubGlobal('window', { AudioContext: class { constructor() { ctx = new FakeCtx(); return ctx; } } });
    a.setMuted(false); a.unlock();
    expect(a.master.gain.value).toBeCloseTo(0.4);   // 0.8 at the default 0.7, halved at 0.35
    void ctx;
  });

  it('an Ogg that fails to decode falls back to the MP3', async () => {
    const urls: string[] = [];
    const bank = new SampleBank('/s/', async (u) => { urls.push(u); return new TextEncoder().encode(u.endsWith('.ogg') ? 'bad' : 'good').buffer as ArrayBuffer; }, 'ogg');
    const ctx = new FakeCtx();
    ctx.decodeAudioData = (ab: ArrayBuffer) => {
      const s = new TextDecoder().decode(ab);
      return s === 'bad' ? Promise.reject(new Error('EncodingError')) : Promise.resolve(new FakeBuffer(s));
    };
    await bank.load(ctx as unknown as BaseAudioContext);
    expect(bank.size).toBe(SAMPLE_NAMES.length);
    expect(urls.some(u => u.endsWith('crinkle.mp3'))).toBe(true);
  });
});

describe('the set roll sound events (docs/PACK_ROLL.md)', () => {
  const ROLL = Object.keys(ROLL_SAMPLES) as RollSoundEvent[];
  const detail = { index: 3, speed: 0.8, rare: true, gold: true, snapped: true };

  it('every event the reel emits is voiced', () => {
    const play = readFileSync(join(__dirname, 'roll', 'play.ts'), 'utf8');
    const emitted = new Set([...play.matchAll(/emit\('(roll:\w+)'/g)].map(m => m[1]));
    expect(emitted.size).toBe(7);
    for (const e of emitted) expect(ROLL_SAMPLES, e).toHaveProperty([e]);
  });

  it('with the samples loaded every roll event plays its recordings', async () => {
    const { a, ctx } = await audioWith('all');
    for (const e of ROLL) {
      ctx.played = [];
      a.roll(e, detail);
      const rec = ctx.played.filter(p => p.buffer && p.buffer.name !== 'noise').map(p => p.buffer!.name);
      expect(rec.length, e).toBeGreaterThan(0);
      for (const r of rec) expect((ROLL_SAMPLES[e] as readonly string[]).includes(r), `${e} played ${r}`).toBe(true);
    }
  });

  it('with nothing loaded every roll event falls back to the synth', async () => {
    const { a, ctx } = await audioWith('none');
    for (const e of ROLL) {
      ctx.played = []; ctx.oscillators = 0;
      a.roll(e, detail);
      expect(ctx.played.filter(p => p.buffer && p.buffer.name !== 'noise'), e).toEqual([]);
      expect(ctx.oscillators + ctx.played.length, `${e} made no sound`).toBeGreaterThan(0);
    }
  });

  it('the ratchet clicks rise with the reel speed, capped at ~40 a second', async () => {
    const { a, ctx } = await audioWith('all');
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const rate = (speed: number) => { ctx.played = []; a.roll('roll:tick', { speed }); return ctx.played.find(p => p.buffer?.name === 'ratchet')!.rate; };
    expect(rate(1)).toBeGreaterThan(rate(0.5));
    expect(rate(0.5)).toBeGreaterThan(rate(0.1));
    const now = vi.spyOn(performance, 'now');
    ctx.played = [];
    for (let t = 0; t < 1000; t += 5) { now.mockReturnValue(5e7 + t); a.roll('roll:tick', { speed: 1 }); }
    expect(ctx.played.length).toBeLessThanOrEqual(41);
  });

  it('a vintage landing gets one fanfare, not the roll one and the reskin one on top of each other', async () => {
    const { a, ctx } = await audioWith('all');
    vi.spyOn(performance, 'now').mockReturnValue((clock += 1e7));
    ctx.played = [];
    a.roll('roll:fanfare', {});
    a.rarePack();
    const names = ctx.played.map(p => p.buffer?.name);
    expect(names).toContain('vintage');
    expect(names).not.toContain('fanfare');
  });

  it("follows the pack's mute toggle set by another PackAudio", async () => {
    const { a, ctx } = await audioWith('all');
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'pokeshell-arena-mute' ? '1' : null), setItem: () => {} });
    ctx.played = [];
    a.roll('roll:land', {});
    expect(ctx.played).toEqual([]);
  });
});
