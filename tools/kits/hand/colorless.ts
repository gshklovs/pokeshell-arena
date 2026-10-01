// Colorless hand kits: normal-type brawlers, tackles and slams, wind from wings, and Lugia's Elemental Blast.
import type { HandSpec } from './index'

export const COLORLESS: HandSpec[] = [
  // ---- the Lugia line
  { name: 'Lugia', fantasy: 'The storm guardian: Elemental Blast, a long beam of fire, water and lightning that pushes foes back.',
    atk: { 'Elemental Blast': ['beam L760 W40 t12 wu28 kb120 water70', 'trimmed from W48 wu22 kb160: it won 83% of same-tier fights'] } },
  // ---- Eevee
  { name: 'Eevee', fantasy: 'A curious all-rounder: tackles, quick attacks, and searches for its evolutions.',
    atk: { 'Fetch and Hide': 'self', Tackle: 'melee R62 A72 l20', 'Quick Attack': 'dash D220 S21 r24', Curiosity: 'self', 'Spin Tackle': 'dash D240 S19 r26', Gnaw: 'melee R60 A64', 'Quick Draw': 'self', 'Vee-Search': 'self', Stampede: 'dash D240 S19 r26' } },
  { name: 'Eevee V', fantasy: 'A brave charge that grows when it has evolved friends.', atk: { Tackle: 'melee R66 A80 l30', 'Vee Brave': 'dash D280 S20 r30 kb80' } },
  // ---- heavyweights
  { name: 'Snorlax', fantasy: 'A mountain that sleeps: collapses and snores around itself, knocking everything away.',
    atk: { Collapse: 'area@self r160 wu14 kb100', 'Incredible Snore': 'area@self r170 wu16', 'Thumping Snore': 'area@self r170 wu16 kb120', 'Heavy Impact': 'area@self r170 wu14 kb120' } },
  { name: 'Chansey', fantasy: 'Curls up, then a double-edge charge that hurts it too.', atk: { Scrunch: 'self', 'Double-edge': 'dash D240 S16 r34 kb90', 'Double-Edge': 'dash D240 S16 r34 kb90' } },
  { name: 'Kangaskhan', fantasy: 'A parent that punches harder the angrier it gets.', atk: { Rage: 'melee R76 A90 l40', 'Mega Punch': 'melee R84 A90 l50 kb100', 'Parental Fury': 'melee R80 A110 l40' } },
  { name: 'Regigigas V', fantasy: 'A colossus: hammers in, then an angry whack.', atk: { 'Hammer In': 'melee R84 A90 l40 kb100', 'Angry Whack': 'melee R90 A120 l50 kb110' } },
  { name: 'Regigigas VSTAR', fantasy: 'Giga Impact: the heaviest charge, then a rest.', atk: { 'Giga Impact': 'dash D320 S16 r42 wu20 kb160' } },
  { name: 'Stoutland V', fantasy: 'Double-dip fangs that take extra prizes, a wild tackle.', atk: { 'Double Dip Fangs': 'melee R80 A96 l50', 'Wild Tackle': 'dash D320 S19 r36 wu14 kb130' } },
  { name: 'Greedent V', fantasy: 'A body slam that paralyzes, incisors that fill its cheeks with cards.', atk: { 'Body Slam': 'dash D240 S17 r34', 'Nom-Nom-Nom Incisors': 'melee R80 A90 l50' } },
  { name: 'Arceus V', fantasy: 'Charges its team, then a power edge.', atk: { 'Trinity Charge': 'self', 'Power Edge': 'melee R90 A120 l60 kb100' } },
  { name: 'Arceus VSTAR', fantasy: 'Trinity Nova: a burst on the aim point that charges its team.', atk: { 'Trinity Nova': ['area@aim r160 R520 wu18 !', 'pinned to the spec: the lexicon made it a ring around itself (nova), and it won 100% of VSTAR fights'] } },
  // ---- birds and tricksters
  { name: 'Pidgeotto', fantasy: 'A whirlwind that blows foes away; a mirror move that returns what it took.', atk: { Whirlwind: 'cone R240 A72 kb140', 'Mirror Move': 'beam L640 W26' } },
  { name: 'Pidgeot V', fantasy: 'A flight-surf dive.', atk: { 'Flight Surf': 'dash D320 S22 r30 kb80' } },
  { name: "Farfetch'd", fantasy: 'A duck with a leek sword: slaps, smashes, lashes.', atk: { 'Leek Slap': 'melee R80 A96 l40', 'Pot Smash': 'melee R76 A90 l40', 'Leek Lash': 'melee R90 A80 l40' } },
  { name: 'Raticate', fantasy: 'Bites, and Super Fang: halves a foe\'s remaining HP.', atk: { Bite: 'melee R66 A76 l30', 'Super Fang': 'melee R70 A72 l60' } },
  { name: 'Porygon', fantasy: 'A program: converts types, fires a beam.', atk: { 'Conversion 1': 'beam L620 W20', 'Conversion 2': 'self', 'Branch Calculation': 'self', Beam: 'beam L620 W18' } },
  { name: 'Ditto', fantasy: 'Transforms: it hits with the foe\'s own strongest attack.', atk: { 'Surprisingly Transform': 'beam L620 W26' } },
  { name: 'Silvally-GX', fantasy: 'A synthetic beast: a turbo drive, and Rebel that grows with the foe\'s bench.', atk: { 'Turbo Drive': 'dash D300 S20 r30', 'Rebel-GX': 'area@aim r150 R500' } },
  { name: 'Drampa-GX', fantasy: 'A gentle dragon: a righteous edge, a berserk breath when its team is hurt.', atk: { 'Righteous Edge': 'melee R80 A96 l40', Berserk: 'cone R240 A72', 'Big Wheel-GX': 'self' } },
  { name: 'Drampa V', fantasy: 'Spike draws, then a dragon pulse.', atk: { 'Spike Draw': 'proj s14 r12 R620', 'Dragon Pulse': ['beam L720 W28 wu14', 'W28 (was W38): Drampa V won 94% of V fights'] } },
  { name: 'Hisuian Zoroark V', fantasy: 'A void return, a shadow cyclone.', atk: { 'Void Return': 'melee R72 A96 l50', 'Shadow Cyclone': 'area@self r170 wu12' } },
  { name: 'Hisuian Zoroark VSTAR', fantasy: 'A ticking curse that grows with its team\'s wounds.', atk: { 'Ticking Curse': ['area@aim r140 R480 !', 'a big curse circle on the aim point (as the sticky cursed timer the name reads as, it fell from 44-47% to 12% of VSTAR fights)'] } },
]
