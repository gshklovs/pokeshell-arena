// The set roll's contract (docs/PACK_ROLL.md).
import type { SetInfo } from '../types';

/** a set in the draw: `chance` is its share of `pack open random` (pokeshell pack sets --json) */
export interface RollSet {
  id: string;
  name: string;
  chance: number;
  oneIn?: number | null;
  series?: string;
  packSize?: number;
  art?: SetInfo['art'];
  /** the hero card image, relative to imageBase */
  hero?: string;
}

/** what the host rolled: `pack open random --json`'s set, setName, setOneIn */
export interface RolledSet { set: string; setName?: string; oneIn?: number | null }

export type RollSoundEvent = 'roll:start' | 'roll:tick' | 'roll:lock' | 'roll:tease' | 'roll:land' | 'roll:fanfare' | 'roll:interrupt';

export interface RollSoundDetail {
  index?: number;
  /** 0..1: the reel's speed as a share of the cruise */
  speed?: number;
  /** the tile passing the pointer is a vintage pack */
  rare?: boolean;
  /** the landing is locked and vintage */
  gold?: boolean;
  set?: string;
  oneIn?: number | null;
  interrupted?: boolean;
  /** roll:interrupt: a result was there, so the reel snapped onto it */
  snapped?: boolean;
}

export interface RollOutcome {
  /** the set it landed on (null: grabbed before the result, or the host failed) */
  set: string | null;
  interrupted: boolean;
  /** ms from playRoll to settling */
  ms: number;
}

export interface RollClock {
  now(): number;
  raf(f: FrameRequestCallback): number;
  caf(id: number): void;
}

export interface RollOptions {
  sets: RollSet[] | Promise<RollSet[]>;
  /** the host's answer; the reel cruises until it resolves, then settles on it */
  result: Promise<RolledSet>;
  /** tile 0: the wrapper the scene opened with (default the mystery wrapper) */
  start?: SetInfo;
  /** the element whose box is the centre slot (the scene's pack) */
  anchor?: HTMLElement | null;
  /** hidden (opacity 0) while the reel covers them */
  hide?: (HTMLElement | null | undefined)[];
  imageBase?: string;
  seed?: number;
  reducedMotion?: boolean;
  sound?: (event: RollSoundEvent, detail: RollSoundDetail) => void;
  onSettle?: (o: RollOutcome) => void;
  /** aborting / resolving it interrupts the roll */
  interrupt?: AbortSignal | Promise<unknown>;
  /** listen for touches and keys on this element to interrupt (default: the container) */
  interruptOn?: HTMLElement | null;
  /** don't draw (tests / no canvas): the model and events still run */
  headless?: boolean;
  clock?: RollClock;
}

/** a vintage pack: 1 in 30 or rarer (the same line as game/packs.ts isRarePack) */
export const isRareOdds = (oneIn: number | null | undefined) => !!oneIn && oneIn >= 30;

/** how rare a pack is to roll, for its plate in the strip: common modern sets, the pricier modern ones, vintage */
export type RollTier = 'unknown' | 'common' | 'mid' | 'vintage';

/** by setOneIn: under 1 in 8 common (Brilliant Stars ... Crown Zenith), 1 in 8-30 mid (Evolving Skies, Hidden
 *  Fates), 1 in 30+ vintage (Base Set, Neo Genesis: isRareOdds) */
export function rollTier(oneIn: number | null | undefined): RollTier {
  if (!oneIn || !isFinite(oneIn)) return 'unknown';
  return oneIn >= 30 ? 'vintage' : oneIn >= 8 ? 'mid' : 'common';
}

/** each tier's plate: `a` the bright bar, `b` its ends and the plate's foot, `deep` the plate, `glow` the aura, `rim` */
export const TIER_COLOURS: Record<RollTier, { a: string; b: string; deep: string; glow: string; rim: string }> = {
  unknown: { a: '#b8c0d0', b: '#5a6275', deep: '#1b1f2b', glow: 'rgba(170,180,200,.28)', rim: '#9aa3b6' },
  common: { a: '#7fb2ff', b: '#3656a8', deep: '#141d38', glow: 'rgba(110,160,255,.34)', rim: '#8fb6f0' },
  mid: { a: '#c08bff', b: '#6a2fd6', deep: '#1e1238', glow: 'rgba(170,110,255,.42)', rim: '#cfa9ff' },
  vintage: { a: '#ffd35a', b: '#d8412c', deep: '#2e1406', glow: 'rgba(255,190,70,.55)', rim: '#ffe29a' },
};
