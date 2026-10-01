// The signature-move looks by look id (docs/VFX.md "Signature moves"): one file per family, each a map of look ->
// drawers (types.ts). vfx.ts asks here first, so an entry here also redraws one of the lexicon's own looks.
import { PSYCHIC } from './psychic'
import { FIRE } from './fire'
import { WATER } from './water'
import { ELECTRIC } from './electric'
import { NATURE } from './nature'
import { SHADOW } from './shadow'
import { FORCE } from './force'
import { MAX } from './max'
import { ICONIC } from './iconic'
import type { SigDraw } from './types'

export type { ImpactView, SigDraw } from './types'

export const SIG: Record<string, SigDraw> = { ...PSYCHIC, ...FIRE, ...WATER, ...ELECTRIC, ...NATURE, ...SHADOW, ...FORCE, ...MAX, ...ICONIC }
