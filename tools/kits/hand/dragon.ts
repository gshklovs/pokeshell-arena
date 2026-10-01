// Dragon hand kits: long beams and wide gales, crushing claws, the Lost Zone's slow, heavy impacts.
import type { HandSpec } from './index'

export const DRAGON: HandSpec[] = [
  // ---- the Giratina line
  { name: 'Giratina V', fantasy: 'Seeks the abyss, then shreds through every shield.', atk: { 'Abyss Seeking': 'self', Shred: 'melee R90 A120 l60' } },
  { name: 'Giratina VSTAR', fantasy: 'Lost Impact: a huge blast around it that sends its own energy to the Lost Zone; Star Requiem knocks a foe out once the fight has gone long.',
    atk: { 'Lost Impact': ['area@self r190 wu20 kb140', 'costs two extra pips: the energy it puts in the Lost Zone'], 'Star Requiem': ['area@aim r160 R520 wu24', 'usable once the fight has lasted 10 TURNs (the Lost Zone fills with time)'] } },
  // ---- the Rayquaza line
  { name: 'Rayquaza V', fantasy: 'A sky dragon: a dragon pulse, and a spiral burst fed by its energy.', atk: { 'Dragon Pulse': 'beam L680 W28', 'Spiral Burst': 'beam L720 W36' } },
  { name: 'Rayquaza VMAX', fantasy: 'Max Burst: burns its energy into a huge beam from the sky.', atk: { 'Max Burst': ['beam L780 W48 t12 wu20 kb130', 'no flat bonus any more: spendEnergy now counts the energy that paid for it (it was +60, and still at 21-54% of VMAX fights)'] } },
  // ---- the Garchomp line
  { name: 'Gible', fantasy: 'A land shark pup: gnaws, and ascends into its evolution.', atk: { Ascension: 'self', Gnaw: 'melee R66 A80 l20' } },
  { name: 'Gabite', fantasy: 'Claws, and ascension.', atk: { Ascension: 'self', Slash: 'melee R76 A100 l40', 'Dragon Claw': 'melee R80 A100 l60' } },
  { name: 'Garchomp', fantasy: 'A jet shark: quick dives and royal blades.', atk: { 'Quick Dive': 'dash D300 S23 r28', 'Royal Blades': 'melee R92 A120 l80', Dragonblade: 'melee R92 A120 l80 kb100' } },
  // ---- dragons
  { name: 'Dratini', fantasy: 'A small dragon that pounds.', atk: { Pound: 'melee R62 A72' } },
  { name: 'Dragonair', fantasy: 'Slams, and a hyper beam that strips energy.', atk: { Slam: 'melee R80 A110 l40', 'Hyper Beam': 'beam L660 W28' } },
  { name: 'Dragonite V', fantasy: 'Shreds, then Dragon Gale: a wide wind that blasts everything back.', atk: { Shred: 'melee R84 A110 l60', 'Dragon Gale': 'cone R270 A80 wu18 kb150' } },
  { name: 'Salamence ex', fantasy: 'Calls its friends, then a huge dragon pulse.', atk: { 'Booming Call': 'self', 'Dragon Pulse': 'beam L740 W40 wu16' } },
  { name: 'Altaria-GX', fantasy: 'A cloud singer: a bright tone, a sonic edge, and Euphoria.', atk: { 'Bright Tone': 'cone R220 A72', 'Sonic Edge': 'beam L700 W24', 'Euphoria-GX': 'area@self r180' } },
  { name: 'Noivern-GX', fantasy: 'Sound waves: distort, a sonic volume that blows foes back, Boomburst.', atk: { Distort: 'cone R220 A72', 'Sonic Volume': 'cone R260 A72 kb90', 'Boomburst-GX': 'area@self r200' } },
  { name: 'Noivern V', fantasy: 'Boomburst around it, a synchro loud cone.', atk: { Boomburst: 'area@self r190', 'Synchro Loud': 'cone R240 A72 kb80' } },
  { name: 'Hisuian Goodra V', fantasy: 'A slime shell: slips foes up, rolls in.', atk: { "Slip-'n'-Trip": 'beam L620 W30 slow400/60', 'Rolling Shell': 'dash D300 S16 r40 kb100' } },
  { name: 'Hisuian Goodra VSTAR', fantasy: 'Rolling Iron: a heavy roll that hardens it.', atk: { 'Rolling Iron': 'dash D320 S16 r42 wu14 kb130' } },
  { name: 'Duraludon V', fantasy: 'An alloy dragon: metal claws, a breaking swipe.', atk: { 'Metal Claw': 'melee R80 A96 l50', 'Breaking Swipe': 'melee R92 A140 l50 kb100' } },
  { name: 'Duraludon VMAX', fantasy: 'G-Max Pulverization: a tower falling around it.', atk: { 'G-Max Pulverization': 'area@self r190 wu20 kb150' } },
  { name: 'Radiant Eternatus', fantasy: 'A power beam from its core.', atk: { 'Power Beam': 'beam L760 W42 wu16' } },
  { name: 'Flygon V', fantasy: 'A desert spirit: sand spray, a draconic impulse.', atk: { 'Sand Spray': 'cone R230 A72', 'Draconic Impulse': 'area@aim r150 R500 wu16' } },
  { name: 'Dracovish V', fantasy: 'Jaws on a fish: slosh and crash, a dragon strike.', atk: { "Slosh 'n' Crash": 'melee R80 A96 l60 water60', 'Dragon Strike': 'melee R92 A110 l80 wu14 kb120' } },
  { name: 'Kyurem', fantasy: 'Extreme Freeze: burns energy into an ice storm.', atk: { 'Extreme Freeze': 'area@aim r140 R480 slow500/90' } },
  { name: 'Zygarde', fantasy: 'Bites, and a judgment surge around it.', atk: { Bite: 'melee R72 A80 l40', 'Judgment Surge': 'area@self r180' } },
  { name: 'Latias', fantasy: 'A dyna barrier: a gliding charge that shields it.', atk: { 'Dyna Barrier': 'dash D280 S21 r30' } },
  { name: 'Regidrago', fantasy: 'A dragon golem: hammers in, then Dragon Energy, weaker the more it is hurt.', atk: { 'Hammer In': 'melee R80 A90 l40 kb90', 'Dragon Energy': 'beam L760 W44 wu18' } },
]
