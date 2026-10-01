// The signature-move drawers' contract (docs/VFX.md "Signature moves"): per look, a drawer for each shape kind it can be
// cast as, and an impact flourish. Every drawer draws one frame of one live shape; render-only (Math.random is fine).
import type { AreaView, BeamView, ConeView, ShotView, Vfx } from '../vfxkit'

/** an impact of a signature attack, `t` frames after it landed (of `life`); `r` the impact radius (a blast's), px */
export interface ImpactView { id: number; x: number; y: number; r: number; t: number; life: number }

export interface SigDraw {
  /** a shot in flight (a split shard has `s.kid`) */
  shot?: (v: Vfx, el: string, c: string, s: ShotView) => void
  /** a beam while it shows */
  beam?: (v: Vfx, el: string, c: string, b: BeamView) => void
  /** an area on the ground, under the fighters (a fused shot stuck where it landed has `a.fuse` > 0) */
  area?: (v: Vfx, el: string, c: string, a: AreaView) => void
  /** an area's part up in the air, over the fighters */
  air?: (v: Vfx, el: string, c: string, a: AreaView) => void
  /** a cone's drawn swing */
  cone?: (v: Vfx, el: string, c: string, w: ConeView) => void
  /** a flourish where the attack lands (a Fire Blast star, a gem's glint), over the fighters, for `impactLife` frames */
  impact?: (v: Vfx, el: string, c: string, i: ImpactView) => void
  /** frames the impact flourish lasts (default 24) */
  impactLife?: number
}
