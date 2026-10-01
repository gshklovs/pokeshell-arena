// Metal hand kits: heavy blades and shields, slow crushing charges, star-born beams.
import type { HandSpec } from './index'

export const METAL: HandSpec[] = [
  // ---- the heroes
  { name: 'Zacian', fantasy: 'The sword hero: hardened blades and slashing strikes.',
    atk: { 'Hardened Blade': 'melee R78 A96 l40', 'Slashing Strike': 'melee R86 A110 l60', 'Battle Legion': 'melee R80 A100 l50', 'Slicing Blade': 'melee R86 A110 l60' } },
  { name: 'Zacian V', fantasy: 'A piercing thrust that ignores resistance, a behemoth blade, a storm slash.',
    atk: { 'Piercing Strike': 'melee R86 A40 l60', 'Behemoth Blade': 'melee R90 A110 l60', 'Storm Slash': 'melee R90 A120 l60' } },
  { name: 'Zacian VSTAR', fantasy: 'Break Edge cuts through everything; Sword Star is a flying sword that hurts it too.', atk: { 'Break Edge': 'melee R92 A110 l70', 'Sword Star': 'dash D340 S22 r34 wu16 kb140' } },
  { name: 'Zamazenta', fantasy: 'The shield hero: fends off, presses with its shield, retaliates.', atk: { 'Fend Off': 'melee R74 A90 l40 kb90', 'Shield Press': 'dash D260 S18 r34 kb100', Retaliate: 'melee R80 A96 l50' } },
  { name: 'Zamazenta V', fantasy: 'A shield rush that grows with its fallen friends.', atk: { 'Revenge Blast': 'dash D280 S19 r34 kb100' } },
  { name: 'Zamazenta VSTAR', fantasy: 'Giga Impact with a shield: huge, then a rest.', atk: { 'Giga Impact': 'dash D320 S19 r38 wu18 kb150' } },
  // ---- time and sun
  { name: 'Dialga', fantasy: 'The time dragon: turns back the clock, a heavy impact, a chrono wind.', atk: { 'Reversed Clock': 'self', 'Heavy Impact': 'area@self r180 wu16 kb120', 'Chrono Wind': 'cone R240 A72' } },
  { name: 'Origin Forme Dialga VSTAR', fantasy: 'Metal blasts, and Star Chronos: a huge beam, then it gets another go.', atk: { 'Metal Blast': 'beam L700 W30', 'Star Chronos': 'beam L780 W50 t12 wu24 kb150' } },
  { name: 'Solgaleo', fantasy: 'The sun lion: Sunsteel Strike, a charge that burns all its energy.', atk: { 'Sunsteel Strike': 'dash D340 S20 r38 wu18 kb150' } },
  { name: 'Jirachi ex', fantasy: 'A wish star: grants a wish, fires a swift star.', atk: { 'Wish Granter': 'self', Swift: ['proj s16 r12 R720 ~straight', 'straight (the stars archetype made it weave): Jirachi ex won 6% of ex fights'] } },
  // ---- steel
  { name: 'Scizor', fantasy: 'Pincers: an X-scissor, dangerous claws.', atk: { 'X-Scissor': 'melee R78 A110 l50', 'Dangerous Claws': 'melee R82 A110 l60' } },
  { name: 'Scizor-GX', fantasy: 'A steel wing that shields it, a cross-cut.', atk: { 'Steel Wing': 'cone R200 A80', 'Cross-Cut-GX': 'melee R88 A120 l70 kb90' } },
  { name: 'Kartana-GX', fantasy: 'A paper blade: gale-fast cuts.', atk: { 'Gale Blade': 'dash D280 S22 r26', 'Blade-GX': 'melee R84 A120 l60' } },
  { name: 'Stakataka-GX', fantasy: 'A wall of stones: gigaton stomps.', atk: { 'Gigaton Stomp': 'area@self r170 wu14 kb120', 'Assembly-GX': 'area@self r180' } },
  { name: 'Radiant Steelix', fantasy: 'An iron snake: an energy stream, then a crushing destructive finish.', atk: { 'Energy Stream': 'melee R80 A90 l40', 'Destructive Finish': ['area@self r180 wu20 kb140 !', 'a ring (the lexicon reads it as an explosion) but 180 px, not 230: Radiant Steelix won 93% of rule-box fights'] } },
  { name: 'Galarian Perrserker V', fantasy: 'A treasure rush of metal claws.', atk: { "Feelin' Fine": 'self', 'Treasure Rush': 'melee R78 A96 l50' } },
  { name: 'Aggron V', fantasy: 'An iron beast: a rock slide, a merciless strike.', atk: { 'Rock Slide': 'area@aim r120 R460', 'Merciless Strike': 'melee R92 A100 l50 wu16 kb140' } },
  { name: 'Aggron VMAX', fantasy: 'Cracking stomps, and Max Take Down that hurts it too.', atk: { 'Cracking Stomp': 'area@self r180 wu14 kb110', 'Max Take Down': 'dash D320 S18 r40 wu18 kb160' } },
]
