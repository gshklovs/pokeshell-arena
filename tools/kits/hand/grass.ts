// Grass hand kits: seeds and leaves that curve and drain, powders that poison and put to sleep, vines that pull,
// and big solar beams that need a windup.
import type { HandSpec } from './index'

const RAZOR_LEAF = 'proj s14 r11 R620'
const TACKLE = 'melee R62 A72'
const POWDER = 'cone R200 A64'

export const GRASS: HandSpec[] = [
  // ---- the Bulbasaur line and other grass starters
  { name: 'Bulbasaur', fantasy: 'A seed that curves toward its target and drains a little life back.', atk: { 'Leech Seed': 'proj s10 r12 R520' } },
  { name: 'Ivysaur', fantasy: 'Vine whips that drag foes in, a cloud of poison powder.', atk: { 'Vine Whip': 'melee R110 A40 pull60', Poisonpowder: POWDER } },
  { name: 'Venusaur', fantasy: 'Solarbeam: stands still to gather light, then a long wide beam.', atk: { Solarbeam: 'beam L760 W40 wu20' } },
  { name: 'Chikorita', fantasy: 'A leaf-headed defender: growls foes weaker, throws razor leaves.',
    atk: { Tackle: TACKLE, Deflector: 'self', Growl: 'cone R200 A72', 'Razor Leaf': 'proj s14 r10 R600' } },
  { name: 'Bayleef', fantasy: 'Spice-scented: poison powder, a pollen shield, twin razor leaves.',
    atk: { Poisonpowder: POWDER, 'Pollen Shield': 'melee R70 A84', 'Sweet Scent': 'self', 'Double Razor Leaf': RAZOR_LEAF } },
  { name: 'Meganium', fantasy: 'A soothing giant: a body slam that paralyzes, a scent that puts everything around it to sleep.',
    atk: { 'Body Slam': 'dash D240 S18 r30', 'Soothing Scent': 'area@self r170' } },
  { name: 'Turtwig', fantasy: 'A sturdy sprout that bites and headbutts.', atk: { Bite: 'melee R66 A76 l20', 'Headbutt Bounce': 'melee R70 A80 l40 kb60' } },
  { name: 'Grotle', fantasy: 'Razor leaves from its back.', atk: { 'Razor Leaf': RAZOR_LEAF } },
  { name: 'Torterra', fantasy: 'A walking forest: an evolution-powered quake, a slow crushing hammer.',
    atk: { Evopress: 'area@self r160 kb100', 'Hammer In': 'melee R92 A100 l50 kb120 wu16' } },
  { name: 'Rowlet', fantasy: 'A little owl: tackles and leafage.', atk: { Tackle: TACKLE, Leafage: 'proj s13 r11 R580' } },
  { name: 'Dartrix', fantasy: 'Quills that snipe, a leaf blade up close.', atk: { 'Sharp Blade Quill': 'proj s18 r9 R760', 'Leaf Blade': 'melee R80 A100 l60' } },
  { name: 'Decidueye-GX', fantasy: 'An archer: long razor-leaf arrows.', atk: { 'Razor Leaf': ['proj s19 r12 R680', 'an archer: s19 (was s15), Decidueye-GX won 5% of rule-box fights'], 'Hollow Hunt-GX': 'self' } },
  // ---- the Leafeon family
  { name: 'Leafeon V', fantasy: 'A leaf swordsman: Leaf Blade lunges far; Leaf Guard hardens it as it strikes.',
    atk: { 'Leaf Blade': 'melee R84 A96 l90', 'Leaf Guard': 'melee R72 A96 l30', 'Slashing Strike': ['melee R88 A96 l50 kb90', 'A96 l50 (was A110 l70): Leafeon V won 92% of V fights'] } },
  { name: 'Leafeon VSTAR', fantasy: 'Leaf Guard with a sword\'s reach.', atk: { 'Leaf Guard': 'melee R80 A100 l50' } },
  { name: 'Leafeon VMAX', fantasy: 'Grass Knot trips heavy foes (it hits harder the more they weigh); Max Leaf is a beam that heals.',
    atk: { 'Grass Knot': 'proj s13 r14 R620 slow350/60', 'Max Leaf': 'beam L720 W40 wu16' } },
  { name: 'Leafeon-GX', fantasy: 'A solar beam, and Grand Bloom that grows its team.', atk: { 'Solar Beam': 'beam L720 W36 wu16', 'Grand Bloom-GX': 'self' } },
  // ---- bugs
  { name: 'Beedrill', fantasy: 'Twin needles, a poison sting: fast, thin shots.', atk: { Twineedle: 'proj s16 r9 R620', 'Poison Sting': 'proj s16 r10 R640' } },
  { name: 'Butterfree', fantasy: 'Wing gusts that blow foes away.', atk: { Gust: 'cone R240 A72 kb120' } },
  { name: 'Scyther', fantasy: 'A blur of blades: slashes, sharp scythes, agility.',
    atk: { Slash: 'melee R74 A96 l40', 'Sharp Scythe': 'melee R80 A100 l60', 'Twin Play': 'self', Agility: 'dash D240 S20 r26', 'Mach Cut': 'melee R80 A110 l60' } },
  { name: 'Heracross', fantasy: 'Megahorn: a charging horn that can miss, and flings foes when it lands.', atk: { Megahorn: 'dash D280 S19 r30 kb110' } },
  { name: 'Pinsir', fantasy: 'Grabs and throws.', atk: { 'Seismic Toss': 'melee R80 A90 l40 kb140 wu12' } },
  { name: 'Pinsir-GX', fantasy: 'Horns that toss foes, and a Guillotine.', atk: { 'Superpowered Horns': 'melee R82 A96 l50 kb100', 'Guillotine-GX': 'melee R92 A110 l70 wu16 kb140' } },
  { name: 'Golisopod-GX', fantasy: 'An armored knight: First Impression hits hard on the way in, then it cuts and retreats.',
    atk: { 'First Impression': 'melee R80 A100 l60', 'Armor Press': 'melee R82 A100 l40', 'Crossing Cut-GX': 'dash D300 S20 r32 kb100' } },
  { name: 'Orbeetle V', fantasy: 'A psychic beetle: strafes, then a mysterious wave on the aim point.', atk: { Strafe: 'proj s14 r11 R600', 'Mysterious Wave': 'area@aim r130 R460' } },
  { name: 'Orbeetle VMAX', fantasy: 'G-Max Wave: a wide psychic wave on the aim point.', atk: { 'G-Max Wave': 'area@aim r160 R480 wu14' } },
  // ---- others
  { name: 'Nidoking', fantasy: 'A thrashing brute with a toxic cloud.', atk: { Thrash: 'melee R82 A110 l40', Toxic: 'cone R210 A64' } },
  { name: 'Hisuian Electrode V', fantasy: 'A living bomb: a tantrum blast around itself, a solar shot.', atk: { 'Tantrum Blast': 'area@self r170 wu16 kb120', 'Solar Shot': 'beam L700 W34 wu14' } },
  { name: 'Trevenant V', fantasy: 'A haunted tree: drains life, claws from the shadows.', atk: { 'Absorb Life': 'melee R80 A90 l30', 'Shadow Claw': 'melee R84 A100 l50' } },
  { name: 'Trevenant VMAX', fantasy: 'Lost in the forest: an area that grows with its bench; Max Tree slams everything around it.',
    atk: { 'Missing in the Forest': 'area@aim r150 R460', 'Max Tree': 'area@self r190 wu20 kb120' } },
  { name: 'Tapu Bulu-GX', fantasy: 'A guardian bull: horns, a charging judgment, and a wilderness that heals.',
    atk: { 'Horn Attack': 'melee R72 A80 l40', "Nature's Judgment": 'dash D300 S19 r34 kb110', 'Tapu Wilderness-GX': 'area@self r180' } },
  { name: 'Shaymin V', fantasy: 'A hedgehog in a gale: flaps and a revenge blast.', atk: { Flap: 'proj s14 r11 R600 kb60', 'Revenge Blast': 'beam L660 W30' } },
  { name: 'Shaymin VSTAR', fantasy: 'Revenge Blast grows with every prize the foe has taken.', atk: { 'Revenge Blast': 'beam L720 W40 wu14' } },
  { name: 'Zarude V', fantasy: 'A jungle rogue: leaps from vine to vine, then rages.', atk: { 'Leap to Leap': 'dash D240 S20 r26', 'Jungle Rage': 'melee R86 A110 l60 kb90' } },
]
