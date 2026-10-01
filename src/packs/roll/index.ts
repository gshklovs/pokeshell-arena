// The set roll: a reel of the real wrappers that lands on the rolled set, over the live pack scene
// (docs/PACK_ROLL.md). Never blocks the tear.
export { playRoll, type RollHandle } from './play';
export { attachRollToScene, SCENE } from './attach';
export { ReelModel, REEL, type ReelConfig, type ReelEvent, type ReelPhase } from './reel';
export { Strip, hash01 } from './strip';
export { oneIn, stripAt, stripLayout } from './render';
export { isRareOdds, rollTier, TIER_COLOURS, type RollTier } from './types';
export type { RollSet, RolledSet, RollOptions, RollOutcome, RollSoundEvent, RollSoundDetail, RollClock } from './types';
