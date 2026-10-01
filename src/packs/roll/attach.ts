// The roll over the pack scene, found by class name (docs/PACK_ROLL.md, "Integration"). This is the only place that
// knows the scene's DOM: if the scene renames these, change them here. Nothing found: the reel centres itself.
import { playRoll, type RollHandle } from './play';
import type { RollOptions } from './types';

export const SCENE = {
  /** the scene root: the reel's canvas goes in here, and touches / keys here interrupt it */
  scene: '.pk-scene',
  /** the centre slot: the pack's box */
  pack: '.pk-pack',
  /** hidden while the reel covers them: the pack's artwork, its ribbon and the tear hint's line (its text stays) */
  hide: ['.pk-pack__float', '.pk-packtag', '.pk-hint'],
};

export function attachRollToScene(container: HTMLElement, opts: Omit<RollOptions, 'anchor' | 'hide' | 'interruptOn'>): RollHandle {
  const root = (container.matches?.(SCENE.scene) ? container : container.querySelector<HTMLElement>(SCENE.scene)) ?? container;
  const pack = root.querySelector<HTMLElement>(SCENE.pack);
  const hide = SCENE.hide.map((s) => root.querySelector<HTMLElement>(s));
  return playRoll(root, { ...opts, anchor: pack, hide, interruptOn: root });
}
