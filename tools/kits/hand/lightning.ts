// Lightning hand kits: the fastest shots and long bolts; lightning from the sky lands on the aim point; every
// Lightning impact on water electrifies it (the built-in reaction), so they pair with Water teammates.
import type { HandSpec } from './index'

const SHOCK = 'proj s16 r10 R620'
const THUNDERBOLT = 'beam L730 W38 wu16'
const THUNDER = 'area@aim r120 R520 wu16'
const QUICK = 'dash D220 S20 r24'

export const LIGHTNING: HandSpec[] = [
  { name: 'Pikachu', fantasy: 'Quick and electric: jolts and sparks from range, darting tackles, a bolt from the sky.',
    atk: {
      Gnaw: 'melee R60 A64 l16', 'Thunder Jolt': 'proj s15 r10 R640', Zzzap: 'beam L620 W18', 'Zap Kick': 'melee R72 A80 l40',
      'Wild Charge': 'dash D280 S20 r26 kb70', 'Whimsy Tackle': 'dash D240 S19 r24', 'Volt Tackle': 'dash D300 S21 r28 kb90',
      'Tropical Vibes': 'area@self r150', 'Tiny Charge': 'proj s15 r9 R560', Thunderbolt: THUNDERBOLT, Thunder: THUNDER,
      'Thunder Shock': SHOCK, 'Targeted Spark': 'proj s18 r9 R760', 'Store Up': 'self', 'Static Shock': SHOCK, Spark: 'beam L560 W18',
      'Smash Kick': 'melee R70 A80 l40', 'Slight Intrusion': 'dash D220 S19 r24', 'Scurry About': 'self', 'Satisfied Spark': 'beam L680 W34 wu14',
      Rollout: 'dash D240 S18 r26', 'Quick Attack': QUICK, 'Play Rough': 'melee R68 A84 l30', 'Pika Punch': 'melee R70 A80 l40',
      'Pika Chain': 'proj s16 r11 R640', 'Pika Bolt': 'beam L640 W26', 'Pika Ball': 'proj s12 r14 R600', 'Peer At': 'self',
      'Overwriting Bolt': 'proj s15 r10 R620', 'Nightime Stroll': 'self', Nap: 'self', 'Mach Bolt': 'proj s18 r10 R680',
      'Lightning Crash': 'area@aim r150 R480 wu16', 'Iron Tail': 'melee R78 A110 l30', 'Hang Down': 'melee R62 A72', 'Get Some Air': 'cone R180 A72',
      'Find a Friend': 'self', 'Fighting Lightning': 'beam L640 W28', 'Energized Tail': 'self', Energize: 'self', 'Electro Ball': 'proj s12 r16 R620',
      'Charge-Up Dash': 'self', 'Big Sparking': 'area@aim r140 R480', 'Angry Bolt': 'proj s15 r11 R620', Agility: QUICK, 'Ace Spark': 'beam L680 W32 wu12',
    } },
  { name: 'Raichu', fantasy: 'A heavier Pikachu: agility, sparks over the back line, thunder from above, a big bolt.',
    atk: { Agility: 'dash D240 S20 r26', Thunder: THUNDER, 'Thunder Shock': SHOCK, 'Ace Spark': 'beam L700 W34 wu12', 'Big Sparking': 'area@aim r140 R480', Thunderbolt: 'beam L740 W40 wu16' } },
  { name: 'Raichu-GX', fantasy: 'A Thunderbolt, then Spark Ball: a huge slow orb once per match.', atk: { Thunderbolt: 'beam L740 W40 wu16', 'Spark Ball-GX': 'proj s12 r24 R700 wu16 kb120' } },
  { name: 'Raichu V', fantasy: 'Charges fast, then a dynamic spark that spends its energy.', atk: { 'Fast Charge': 'self', 'Dynamic Spark': 'area@self r170 wu14' } },
  { name: 'Pikachu V', fantasy: 'Charges up, then a huge Thunderbolt.', atk: { Charge: 'self', Thunderbolt: 'beam L720 W38 wu16', 'Lightning Blast': 'beam L700 W34 wu14' } },
  { name: 'Pikachu VMAX', fantasy: 'G-Max Volt Tackle: a giant charge that grows with the energy it burns.', atk: { 'G-Max Volt Tackle': 'dash D340 S21 r36 wu14 kb140' } },
  { name: 'Pikachu ex', fantasy: 'A Tera Pikachu: parades its friends in, then thunder, bolts, and the Topaz Bolt.',
    atk: { 'Pika-Pika Parade': 'self', Thunderbolt: 'beam L740 W40 wu16', 'Zip-Zap Frenzy': 'self', Thunder: ['area@aim r160 R540 wu16', 'r160 (was r130): Pikachu ex won 0-10% of ex fights'], 'Topaz Bolt': 'beam L780 W46 t12 wu22 kb120' } },
  // ---- legends
  { name: 'Zapdos', fantasy: 'The thunderbird: bolts from the sky, a long Thunderbolt, sky-high claws.',
    atk: { Thunder: THUNDER, Thunderbolt: 'beam L740 W40 wu16', 'Thundering Lightning': 'area@aim r140 R540 wu18', 'Hurricane Call': 'self', 'Sky-High Claws': 'dash D300 S21 r30 kb90' } },
  { name: 'Zekrom', fantasy: 'The black lightning: slashes, a nitro thunder beam, a wild shock that hurts it too.',
    atk: { Slash: 'melee R80 A100 l50', 'Nitro Thunder': 'beam L700 W34', 'Wild Shock': 'dash D300 S20 r32 kb100' } },
  { name: 'Raikou V', fantasy: 'Lightning Rondo: a thunder-fast charge that grows with every Pokémon around.', atk: { 'Lightning Rondo': ['area@self r130 wu14 !', 'a tighter ring (the lexicon made the dash a 160 px nova): Raikou V won 88-100% of V fights'] } },
  { name: 'Regieleki', fantasy: 'Pure electricity: static shocks and a terasparking burst.', atk: { 'Static Shock': SHOCK, Teraspark: 'area@self r180 wu14' } },
  { name: 'Zeraora', fantasy: 'A thunder cat: quick draws, electrobullets, a wild charge.', atk: { 'Rapid Draw': 'melee R68 A80 l40', Electrobullet: 'proj s18 r10 R700', 'Wild Charge': 'dash D300 S21 r28 kb80' } },
  { name: 'Zeraora V', fantasy: 'Claw slashes, then a Thunderous Bolt that needs a rest.', atk: { 'Claw Slash': 'melee R76 A100 l50', 'Thunderous Bolt': 'beam L720 W40 wu16' } },
  { name: 'Zeraora VMAX', fantasy: 'Reactive Pulse punishes energy; Max Fist is a lightning haymaker.', atk: { 'Reactive Pulse': 'area@self r170', 'Max Fist': 'melee R96 A100 l90 wu14 kb140' } },
  { name: 'Zeraora VSTAR', fantasy: 'Crushing Beat smashes the Stadium; Lightning Storm Star rains four bolts.',
    atk: { 'Crushing Beat': ['melee R88 A110 l70 kb100 clear120 !', 'pinned to the spec swing: the lexicon made it a hammer on a small circle just ahead, and Zeraora VSTAR won 0%'], 'Lightning Storm Star': 'area@aim r160 R560 wu16' } },
  // ---- Eevee's lightning form
  { name: 'Jolteon', fantasy: 'Spiky and fast: a crackling Thunderbolt, electric balls.', atk: { Thunderbolt: 'beam L680 W30 wu10', 'Electric Ball': 'proj s14 r16 R640' } },
  { name: 'Jolteon V', fantasy: 'A thunder spear that snipes, pin missiles.', atk: { 'Thunder Spear': 'proj s20 r9 R780', 'Pin Missile': 'proj s18 r9 R680' } },
  { name: 'Jolteon VMAX', fantasy: 'Max Thunder Rumble: lightning all around it, and the back line.', atk: { 'Max Thunder Rumble': 'area@self r180 wu14' } },
  // ---- others
  { name: 'Electabuzz', fantasy: 'A boxer made of lightning.',
    atk: { Thundershock: SHOCK, Thunderpunch: 'melee R72 A84 l40', Punch: 'melee R68 A80 l30', Swift: 'proj s16 r10 R700', 'Thunder Wave': 'cone R200 A64', 'Head Bolt': 'melee R70 A80 l40' } },
  { name: 'Electrode', fantasy: 'A ball that explodes: shocks around itself, lightning balls.', atk: { 'Electric Shock': 'area@self r160', 'Lightning Ball': 'proj s14 r14 R620', Electroblast: 'area@self r170 wu12' } },
  { name: 'Electrode-GX', fantasy: 'Electro balls, and a once-per-match Crush and Burn.', atk: { 'Electro Ball': 'proj s14 r16 R640', 'Crush and Burn-GX': 'area@self r180 wu16 kb120' } },
  { name: 'Magneton', fantasy: 'A magnet cluster: paralyzing waves, a zap cannon, and a self-destruct.',
    atk: { 'Thunder Wave': 'cone R210 A64', Selfdestruct: 'area@self r180 wu14 kb140', Ram: 'dash D220 S18 r26', 'Zap Cannon': 'beam L720 W36 wu16' } },
  { name: 'Magnezone V', fantasy: 'Magnetic tension drags a foe in; a splitting beam.', atk: { 'Magnetic Tension': 'beam L680 W24', 'Splitting Beam': 'beam L700 W30' } },
  { name: 'Magnezone VSTAR', fantasy: 'Magnetic Grip pulls foes in; Electro Star hits the back line.', atk: { 'Magnetic Grip': ['beam L720 W38 wu14 pull120 !', 'pinned to the spec beam: the lexicon made it a close grab with a 19-tick windup, and Magnezone VSTAR won 7-20% of VSTAR fights'], 'Electro Star': 'area@aim r160 R520 wu16' } },
  { name: 'Rotom V', fantasy: 'Scrap short: throws junk that sparks.', atk: { 'Scrap Short': 'proj s14 r14 R620' } },
  { name: 'Rotom VSTAR', fantasy: 'A scrap pulse on the aim point.', atk: { 'Scrap Pulse': 'area@aim r130 R480' } },
  { name: 'Radiant Charjabug', fantasy: 'A battery on wheels: a linear shot at the back line.', atk: { 'Linear Attack': 'beam L740 W18' } },
  { name: 'Dracozolt V', fantasy: 'A fossil that bites and swings its tail like a mountain.', atk: { 'Primeval Beak': 'melee R72 A80 l30', 'Mountain Swing': 'melee R90 A120 l50 kb120 wu14' } },
  { name: 'Dracozolt VMAX', fantasy: 'A spark trap that bites back, then Max Impact.', atk: { 'Spark Trap': 'melee R72 A90', 'Max Impact': 'dash D320 S19 r36 wu16 kb140' } },
  { name: 'Xurkitree-GX', fantasy: 'Rumbling wires that jam a foe\'s energy.', atk: { 'Rumbling Wires': 'beam L700 W30', 'Lighting-GX': 'area@self r180' } },
  { name: 'Tapu Koko-GX', fantasy: 'Sky-high claws, and Tapu Thunder that grows with the foe\'s energy.', atk: { 'Sky-High Claws': ['dash D300 S21 r24 kb90', 'r24 (was r30): Tapu Koko-GX won 95% of rule-box fights'], 'Tapu Thunder-GX': 'area@aim r150 R520 wu16' } },
  { name: 'Boltund V', fantasy: 'A running dog: electrifies its team, then a bolt-storm charge.', atk: { Electrify: 'self', 'Bolt Storm': 'dash D300 S21 r30' } },
]
