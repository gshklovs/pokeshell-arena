// The pack opening's recorded sounds: a manifest of public/sfx/packs/ (built by tools/sfx/build_pack_sfx.py from CC0
// sources, credited in docs/SFX_CREDITS.md) and a Web Audio buffer bank. Everything here is optional: a sample that
// is missing, still loading or fails to decode leaves PackAudio on its synthesised version of that sound.
import type { RollSoundEvent } from './roll/types';

/** every recorded sound, and for the two grain sprites how many grains they hold (one per GRAIN_SLOT seconds) */
export const SAMPLES = {
  crinkle: { grains: 24 },   // foil / wrapper crinkle grains (tear)
  riffle: { grains: 12 },    // card riffle grains (fan, a shaken card)
  'rip-1': {}, 'rip-2': {}, 'rip-3': {}, 'rip-foil': {},
  'stack-1': {}, 'stack-2': {}, fan: {}, 'shove-1': {}, 'shove-2': {}, 'shove-3': {}, swish: {},
  'snap-1': {}, 'snap-2': {}, 'snap-3': {}, 'snap-4': {},
  'thump-1': {}, 'thump-2': {}, 'thump-3': {},
  riser: {}, 'magic-pop': {},
  musicbox: {}, glock: {},
  'sparkle-1': {}, 'sparkle-2': {}, wink: {},
  boom: {}, brass: {}, fanfare: {},
  sticker: {}, blip: {}, jingle: {},
  // the set roll (src/packs/roll)
  ratchet: { grains: 12 },   // prize-wheel clicks
  whirr: {}, clunk: {}, shimmer: {}, thunk: {}, ding: {}, vintage: {}, zip: {},
} satisfies Record<string, { grains?: number }>;

export type SampleName = keyof typeof SAMPLES;
export const SAMPLE_NAMES = Object.keys(SAMPLES) as SampleName[];

/** grain sprites: grain i starts at i * GRAIN_SLOT (tools/sfx/build_pack_sfx.py SLOT) */
export const GRAIN_SLOT = 0.1;
/** the measured pitch of the tuned samples, so playbackRate = wanted Hz / this */
export const PITCH_HZ = { musicbox: 796.6, glock: 3137.8 } as const;

/**
 * Which recordings each sound event the scene fires can play. An event with an empty list is synthesised by design
 * (the drone is a bed, not a sound effect). samples.test.ts checks every `this.audio.<event>(` in scene.ts is here.
 */
export const EVENT_SAMPLES = {
  crinkle: ['crinkle'],
  rip: ['rip-1', 'rip-2', 'rip-3', 'rip-foil', 'thump-1'],
  whoosh: ['stack-1', 'stack-2', 'fan', 'shove-1', 'shove-2', 'shove-3', 'swish'],
  tick: ['snap-1', 'snap-2', 'snap-3', 'snap-4', 'riffle', 'musicbox'],
  pulse: ['thump-1', 'thump-2', 'thump-3'],
  chargeStart: ['riser'],
  stinger: ['musicbox', 'glock', 'sparkle-1', 'sparkle-2', 'wink', 'magic-pop', 'boom', 'brass'],
  newBadge: ['sticker', 'blip'],
  summary: ['jingle'],
  rarePack: ['fanfare', 'sparkle-2'],
  shake: ['riffle'],
  droneOn: [],
  droneLevel: [],
  droneOff: [],
} as const satisfies Record<string, readonly SampleName[]>;
export type PackSoundEvent = keyof typeof EVENT_SAMPLES;

/** the set roll's sound events (src/packs/roll, docs/PACK_ROLL.md "Sound events"), voiced by PackAudio.roll() */
export const ROLL_SAMPLES = {
  'roll:start': ['whirr'],
  'roll:tick': ['ratchet', 'glock'],
  'roll:lock': ['clunk'],
  'roll:tease': ['shimmer'],
  'roll:land': ['thunk', 'ding'],
  'roll:fanfare': ['vintage', 'sparkle-2'],
  'roll:interrupt': ['zip'],
} as const satisfies Record<RollSoundEvent, readonly SampleName[]>;

/** PackAudio calls that aren't sounds (lifecycle and settings) */
export const CONTROL_CALLS = ['unlock', 'setMuted', 'chargeStop', 'close', 'muted'] as const;

function baseUrl(): string {
  let b = './';
  try { b = import.meta.env?.BASE_URL ?? './'; } catch { /* not under Vite */ }
  return `${b.endsWith('/') ? b : b + '/'}sfx/packs/`;
}

/** Ogg Opus where the browser plays it, else MP3 (Safari before Ogg support) */
export function preferredExt(): 'ogg' | 'mp3' {
  try {
    if (typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="opus"')) return 'ogg';
  } catch { /* no media element */ }
  return 'mp3';
}

type Fetcher = (url: string) => Promise<ArrayBuffer>;
const defaultFetch: Fetcher = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.arrayBuffer();
};

// shared by every scene: bytes are fetched once per page, buffers decoded once per sample rate
const bytes = new Map<string, Promise<ArrayBuffer>>();
const decoded = new Map<string, AudioBuffer>();

export class SampleBank {
  private buffers = new Map<SampleName, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private rr = new Map<string, number>();

  constructor(private base = baseUrl(), private fetcher: Fetcher = defaultFetch, private ext = preferredExt()) {}

  /** start downloading (no AudioContext needed, so it can run before the first gesture) */
  prefetch(): void {
    if (typeof fetch === 'undefined' && this.fetcher === defaultFetch) return;
    for (const n of SAMPLE_NAMES) void this.raw(n, this.ext).catch(() => {});
  }

  private raw(name: SampleName, ext: string): Promise<ArrayBuffer> {
    const url = `${this.base}${name}.${ext}`;
    let p = bytes.get(url);
    if (!p) { p = this.fetcher(url); bytes.set(url, p); p.catch(() => bytes.delete(url)); }
    return p;
  }

  /** fetch + decode everything into ctx; never rejects (what fails stays synthesised) */
  load(ctx: BaseAudioContext): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = Promise.all(SAMPLE_NAMES.map(async (n) => {
      const key = `${n}@${ctx.sampleRate}`;
      const hit = decoded.get(key);
      if (hit) { this.buffers.set(n, hit); return; }
      for (const ext of this.ext === 'ogg' ? ['ogg', 'mp3'] : ['mp3']) {
        try {
          const ab = await this.raw(n, ext);
          const buf = await ctx.decodeAudioData(ab.slice(0));   // decodeAudioData detaches its input
          decoded.set(key, buf); this.buffers.set(n, buf);
          return;
        } catch { /* try the next format, then give up on this one */ }
      }
    })).then(() => undefined);
    return this.loading;
  }

  has(name: SampleName): boolean { return this.buffers.has(name); }
  get(name: SampleName): AudioBuffer | undefined { return this.buffers.get(name); }
  /** how many of the samples are ready */
  get size(): number { return this.buffers.size; }

  /** a loaded one of several variants, round robin (never the same one twice in a row when there's a choice) */
  pick(names: readonly SampleName[]): SampleName | null {
    const ok = names.filter(n => this.buffers.has(n));
    if (!ok.length) return null;
    const key = names.join();
    const i = ((this.rr.get(key) ?? Math.floor(Math.random() * ok.length)) + 1) % ok.length;
    this.rr.set(key, i);
    return ok[i];
  }

  /** test hook: put a buffer in directly */
  put(name: SampleName, buf: AudioBuffer): void { this.buffers.set(name, buf); }
}

/** forget the shared caches (tests) */
export function resetSampleCache(): void { bytes.clear(); decoded.clear(); }
