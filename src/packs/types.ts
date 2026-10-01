// The pack-opening contract. PackResult is what `pokeshell pack open <set> --json` prints (pokeshell docs/BOOSTERS.md).

export type Fx = 'plain' | 'reverse' | 'holo' | 'full-art' | 'alt-art' | 'rainbow' | 'gold' | 'radiant' | 'shiny';

export interface PackCard {
  id: string;
  name: string;
  rarity: string;
  tier: string;
  slot: string;
  shiny: boolean;
  isNew: boolean;
  /** relative to imageBase: pokeshell's web export, img/<pack>/<character>/<card id>[-shiny].png */
  image: string;
  fx?: Fx;
  /** 0-5: how big the reveal is */
  hit?: number;
  number?: string;
  tierLabel?: string;
  finish?: 'normal' | 'reverse' | 'foil' | string;
  outcome?: string;
  oneIn?: number;
  setName?: string;
  character?: string;
}

export interface PackResult {
  set: string;
  packId: string;
  cards: PackCard[];
  setName?: string;
  tokens?: number;
}

export interface SetInfo {
  id: string;
  name: string;
  series?: string;
  released?: string;
  packSize?: number;
  art?: { colors?: string[]; accent?: string; motif?: string; hero?: string };
  /** the hero card's image path (relative to imageBase) */
  hero?: string;
}

export interface OpenPackOptions {
  set: string | SetInfo;
  /** called once, on the first touch of the tear (so the roll hides behind the gesture), or at once with `eager` */
  fetchPack: () => Promise<PackResult>;
  /** start fetchPack as the scene opens, not on the first touch (a random pack: the host rolls while you tear) */
  eager?: boolean;
  /**
   * `set` is a stand-in wrapper (a mystery pack) until the pack arrives: then the scene re-skins the pack, in place and
   * mid-tear, to what this returns. `tag` / `sub` go on a ribbon on the pack ("Base Set pack!" / "1 in 61"); `rare`
   * gets the gold fanfare (rays, a gold flash) on the pack itself, never a blocking card.
   */
  reskin?: (res: PackResult) => Reskin | null | undefined;
  imageBase?: string;
  sound?: boolean;
  reducedMotion?: boolean;
  onOpenAnother?: () => void;
  /** demo / capture hooks: 'auto' plays the whole opening by itself */
  autoplay?: boolean;
  /** called on every phase change (idle, tearing, stack, reveal, summary) */
  onPhase?: (phase: Phase, detail?: { index?: number; card?: PackCard }) => void;
}

export interface Reskin { set?: SetInfo; tag?: string; sub?: string; rare?: boolean }

export type Phase ='idle' | 'tearing' | 'torn' | 'stack' | 'reveal' | 'summary' | 'done';

export interface PackScene {
  done: Promise<PackResult>;
  /** re-skin the wrapper later (e.g. the set's art arrived after the pack did); a no-op once the scene is gone */
  reskin(k: Reskin): void;
  skip(): void;
  destroy(): void;
}
