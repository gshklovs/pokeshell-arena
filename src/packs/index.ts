// pokeshell arena: the pack opening (docs/PACK_OPENING.md).
//   const scene = openPackScene(container, { set, fetchPack: () => host.openPack(set) });
//   const result = await scene.done;
import { Scene } from './scene';
import type { OpenPackOptions, PackScene } from './types';

export type { Fx, OpenPackOptions, PackCard, PackResult, PackScene, Phase, Reskin, SetInfo } from './types';
export { fxOf, hitOf } from './tiers';
export { MYSTERY_SET, wrapperSVG } from './wrapper';
export { TAP_OPENS } from './scene';

export function openPackScene(container: HTMLElement, opts: OpenPackOptions): PackScene {
  const s = new Scene(container, opts);
  return { done: s.done, skip: () => s.skip(), destroy: () => s.destroy(), reskin: (k) => s.reskin(k) };
}
