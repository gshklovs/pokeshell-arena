// Psychic and Fairy hand kits: homing shots that curve around, psychic bursts that land on the aim point from
// afar, ghosts that place damage counters, and songs that put foes to sleep.
import type { HandSpec } from './index'

const PSYCHIC = 'proj s12 r14 R660'
const PSY_AREA = 'area@aim r120 R480'
const SUPER_PSY = 'beam L700 W32'
const SLAP = 'melee R68 A90'
const MAGICAL_SHOT = 'proj s13 r13 R640'

export const PSYCHIC_SPECS: HandSpec[] = [
  // ---- Mewtwo and Mew
  { name: 'Mewtwo', fantasy: 'A psychic weapon: homing Psychic that hits harder the more energy the foe holds, bursts on the aim point, barriers.',
    atk: { Psychic: PSYCHIC, Barrier: 'self', Empower: 'self', Psydrive: 'beam L720 W40 wu14', Psypump: 'self', 'Limit Break': 'area@aim r120 R480 wu12', 'Life Sucker': 'beam L600 W22', Psyburn: 'area@aim r120 R480 wu12' } },
  { name: 'Mewtwo-GX', fantasy: 'Psy bolts, a draining absorption, and Psystrike: a beam that ignores every shield.',
    atk: { 'Super Psy Bolt': 'beam L700 W34', 'Psycrush-GX': 'area@aim r140 R480 wu14', 'Full Burst': 'area@self r160', 'Super Absorption': 'beam L640 W28', 'Psystrike-GX': 'beam L780 W46 t12 wu20 kb120' } },
  { name: 'Mewtwo ex', fantasy: 'Photon bullets pick off the back line; Psychic Powers is a crushing burst that needs a rest after.',
    atk: { 'Photon Bullets': 'proj s17 r12 R740', 'Psychic Powers': 'area@aim r150 R500 wu18 kb100' } },
  { name: 'Mewtwo VSTAR', fantasy: 'Psy Purge burns energy into a huge beam; Star Raid hits every foe once per match.', atk: { 'Psy Purge': 'beam L760 W44 wu18', 'Star Raid': 'area@aim r160 R520 wu16' } },
  { name: 'Mew', fantasy: 'A playful mirage: homing psychic shots.', atk: { Psychic: PSYCHIC, Psyshot: 'proj s13 r12 R620' } },
  { name: 'Mew ex', fantasy: 'Teleportation Burst: a shot, then it blinks away.', atk: { 'Teleportation Burst': 'proj s14 r12 R640' } },
  { name: 'Mew V', fantasy: 'Mixes energy in, then a psychic leap that returns it to the bench.', atk: { 'Energy Mix': 'self', 'Psychic Leap': 'dash D280 S21 r26' } },
  { name: 'Mew VMAX', fantasy: 'Cross Fusion Strike copies the strongest attack in play; Max Miracle ignores every effect on the foe.',
    atk: { 'Cross Fusion Strike': ['beam L680 W30 wu12', 'copies a benched Fusion Strike attack: the arena copies the strongest attack in play (mimic)'], 'Max Miracle': 'area@aim r150 R500 wu16' } },
  // ---- ghosts
  { name: 'Gastly', fantasy: 'A gas cloud: puts foes to sleep and curses whoever knocks it out. It does almost no damage of its own.',
    atk: { 'Sleeping Gas': 'cone R190 A72', 'Destiny Bond': 'self', 'Furtive Drop': 'area@aim r90 R460' } },
  { name: 'Haunter', fantasy: 'Hypnotizes, then eats the dream; drops curses from afar.', atk: { Hypnosis: 'proj s11 r12 R600', 'Dream Eater': 'area@aim r100 R460', 'Cursed Drop': 'area@aim r100 R460' } },
  { name: 'Gengar', fantasy: 'Screaming Circle: a ring of dread around it that grows with the foe\'s bench.', atk: { 'Screaming Circle': 'area@self r200' } },
  { name: 'Gengar ex', fantasy: 'Chaotic Pain: damage counters rain on the aim point.', atk: { 'Chaotic Pain': 'area@aim r140 R500 wu14' } },
  { name: 'Banette-GX', fantasy: 'A cursed doll: chants that grow with the dead.', atk: { 'Shadow Chant': 'area@aim r110 R460', 'Tomb Hunt-GX': 'self' } },
  { name: 'Mimikyu V', fantasy: 'Jealous eyes: its curse copies the foe\'s own damage.', atk: { 'Jealous Eyes': 'area@aim r110 R460' } },
  { name: 'Mimikyu VMAX', fantasy: 'Ominous numbers: counters on the aim point; Max Shadow wipes the foe\'s hand.', atk: { 'Ominous Numbers': 'area@aim r120 R480', 'Max Shadow': 'area@aim r150 R500 wu14' } },
  // ---- the Abra line
  { name: 'Abra', fantasy: 'A sleepy teleporter: a psyshock that may paralyze.', atk: { Psyshock: 'proj s12 r11 R600' } },
  { name: 'Kadabra', fantasy: 'Heals itself, bends a spoon into a psy beam.', atk: { Recover: 'self', 'Super Psy': 'beam L660 W30' } },
  { name: 'Alakazam', fantasy: 'A confusing ray from afar.', atk: { 'Confuse Ray': 'beam L640 W20 wu10' } },
  // ---- Eevee's psychic and fairy forms
  { name: 'Espeon', fantasy: 'Shines foes into view, then a psy bolt.', atk: { 'Miraculous Shine': 'beam L660 W24', 'Super Psy Bolt': SUPER_PSY } },
  { name: 'Espeon V', fantasy: 'A zen shot at the back line, a psy bolt.', atk: { 'Zen Shot': 'proj s17 r10 R760', 'Super Psy Bolt': 'beam L700 W34' } },
  { name: 'Espeon VMAX', fantasy: 'Max Mindstorm: a storm on the aim point that grows with its energy.', atk: { 'Max Mindstorm': ['area@aim r160 R520 wu16 cast={"op":"bonus","amount":60}', 'a flat +60 (one energy on the foe): it scales on the unspent pips of the foe, nearly always 0, and Espeon VMAX won 0% of VMAX fights'] } },
  { name: 'Espeon-GX', fantasy: 'Psybeams that confuse, psychic bursts, and Divide: counters spread across the field.',
    atk: { Psybeam: 'beam L620 W22', Psychic: PSY_AREA, 'Divide-GX': 'area@aim r160 R520' } },
  { name: 'Espeon ex', fantasy: 'Solar Beatdown: a sun beam that grows with its energy.', atk: { 'Solar Beatdown': ['beam L720 W40 wu14 !', 'a sun beam (the name reads as a hammer: on a small circle just ahead Espeon ex won 0%)'] } },
  { name: 'Sylveon V', fantasy: 'A ribbon fairy: magical homing shots.', atk: { 'Magical Shot': MAGICAL_SHOT } },
  { name: 'Sylveon VMAX', fantasy: 'Heals its bench, then Max Harmony: a harmony on the aim point that grows with its team\'s types.', atk: { 'Precious Touch': 'self', 'Max Harmony': 'area@aim r150 R500' } },
  { name: 'Sylveon-GX', fantasy: 'Fairy wind, and Plea: it asks a foe to leave.', atk: { 'Magical Ribbon': 'self', 'Fairy Wind': 'cone R240 A72 kb90', 'Plea-GX': 'beam L680 W30' } },
  { name: 'Sylveon ex', fantasy: 'Colorful Harmony: a chord on the aim point that grows with its team\'s types.', atk: { 'Colorful Harmony': 'area@aim r150 R500 wu14' } },
  // ---- fairies
  { name: 'Clefairy', fantasy: 'Sings foes to sleep and waves Metronome: it copies the foe\'s strongest attack.',
    atk: { Sing: 'cone R200 A72', Metronome: ['beam L640 W28 wu12', 'copies the Defending Pokémon\'s strongest attack (mimic)'], Doubleslap: SLAP, Squaredance: 'self', Lead: 'self', Pound: 'melee R62 A72', 'Moon Dance': 'area@self r130', 'Wonder Storm': 'area@aim r120 R460', 'Magical Shot': MAGICAL_SHOT } },
  { name: 'Clefable', fantasy: 'Moon Impact: moonlight lands on the aim point.', atk: { 'Moon Impact': 'area@aim r120 R480 wu12', Pound: 'melee R70 A80 l30', 'Moonlit Miracle': 'self', 'Magical Shot': 'proj s13 r14 R640' } },
  { name: 'Jigglypuff', fantasy: 'Sings, then rolls in.', atk: { 'Singing Voice': 'cone R200 A72', Rollout: 'dash D240 S18 r26' } },
  { name: 'Wigglytuff-GX', fantasy: 'Rolls in again and again (flip until tails); Lovely Star puts foes to sleep and heals.', atk: { 'Rolling Rush': 'dash D300 S19 r32 kb90', 'Lovely Star-GX': 'area@self r180' } },
  { name: 'Mr. Mime', fantasy: 'A mime: slaps, and a trick that makes attacks miss it.', atk: { 'Happy Mime': 'self', 'Double Slap': SLAP, Pound: 'melee R64 A72', 'Tricky Slap': 'melee R74 A96 l30' } },
  { name: 'Gardevoir-GX', fantasy: 'Infinite Force: a burst that grows with every energy on both sides.', atk: { 'Infinite Force': 'area@aim r120 R500', 'Twilight-GX': 'self' } },
  { name: 'Radiant Gardevoir', fantasy: 'A radiant Psychic burst.', atk: { Psychic: PSY_AREA } },
  { name: 'Xerneas', fantasy: 'The life deer: geonavigation, then a charge with aurora horns.', atk: { Geonavigation: 'self', 'Aurora Horns': 'dash D300 S20 r32 kb90' } },
  { name: 'Enamorus V', fantasy: 'A blossom tail that sweeps and charges its team.', atk: { 'Blossom Tail': 'melee R84 A120 l40' } },
  { name: 'Hatterene V', fantasy: 'Reads the stars, then a teleportation burst.', atk: { Horoscope: 'self', 'Teleportation Burst': 'proj s14 r14 R660' } },
  { name: 'Hatterene VMAX', fantasy: 'G-Max Smite confuses everything on the aim point.', atk: { 'G-Max Smite': 'area@aim r150 R500 wu14' } },
  { name: 'Whimsicott V', fantasy: 'Fluff gets in the way; a cotton guard that softens hits.', atk: { 'Fluff Gets in the Way': 'cone R200 A72', 'Cotton Guard': 'proj s11 r16 R620' } },
  { name: 'Whimsicott VSTAR', fantasy: 'A trick wind that jams items, a fluffball star once per match.', atk: { 'Trick Wind': 'cone R240 A72 kb100', 'Fluffball Star': 'area@aim r150 R500' } },
  { name: 'Granbull V', fantasy: 'A bulldog: chomps, then a bull dash that hurts it too.', atk: { Chomp: 'melee R76 A90 l40', 'Bull Dash': 'dash D320 S20 r34 kb120' } },
  { name: 'Tapu Lele', fantasy: 'An energy burst that grows with both sides\' energy, a draining spiral.', atk: { 'Energy Burst': 'proj s14 r14 R640', 'Spiral Drain': 'beam L660 W30' } },
  { name: 'Tapu Lele-GX', fantasy: 'An energy drive, and Tapu Cure for its team.', atk: { 'Energy Drive': 'proj s14 r14 R640', 'Tapu Cure-GX': 'self' } },
  // ---- other psychics
  { name: 'Lunala', fantasy: 'The moon: a midnight ray and a lunar blast.', atk: { 'Midnight Ray': 'beam L680 W24', 'Lunar Blast': 'beam L740 W40 wu16' } },
  { name: 'Deoxys', fantasy: 'A DNA alien: a photon boost beam.', atk: { 'Photon Boost': 'beam L700 W30' } },
  { name: 'Deoxys VMAX', fantasy: 'Max Drain: a beam that heals it.', atk: { 'Max Drain': 'beam L740 W42 wu16' } },
  { name: 'Deoxys VSTAR', fantasy: 'A psychic javelin that also hits the back line; Star Force grows with the foe\'s energy.', atk: { 'Psychic Javelin': 'proj s18 r14 R780 wu12', 'Star Force': 'area@aim r160 R520 wu16' } },
  { name: 'Jynx', fantasy: 'Slaps, kisses and a dance that draws a foe in.',
    atk: { Doubleslap: SLAP, Meditate: 'area@aim r110 R460', Slap: 'melee R66 A80', 'Lovely Kiss': 'melee R70 A72 l30', 'Alluring Dance': 'area@self r170', 'Super Psy Bolt': 'beam L680 W30' } },
  { name: 'Weezing', fantasy: 'A slow gas cloud that tackles.', atk: { Tackle: 'dash D220 S16 r30' } },
  { name: 'Wobbuffet', fantasy: 'Mirror pain turns the damage on it back on the foe.', atk: { 'Mirror Pain': 'area@aim r110 R460', 'Headbutt Bounce': 'melee R70 A80 l40 kb60' } },
  { name: 'Marshadow', fantasy: 'A shadow that flickers in and steals a prize.', atk: { 'Rapid Hunt': 'self', 'Shadow Flicker': 'melee R72 A96 l40' } },
  { name: 'Golurk V', fantasy: 'A golem: mega punches, and a rewind beam that turns back evolution.', atk: { 'Mega Punch': 'melee R84 A90 l50 kb100', 'Rewind Beam': 'beam L740 W40 wu16' } },
  { name: 'Galarian Articuno V', fantasy: 'A psychic bird: a psyray that confuses.', atk: { Psyray: 'beam L700 W30' } },
  { name: 'Nihilego-GX', fantasy: 'A parasite: locks a foe in place.', atk: { 'Lock Up': 'beam L680 W32', 'Symbiont-GX': 'area@self r180' } },
  { name: 'Naganadel-GX', fantasy: 'A poison jet: beast raids, jet needles that ignore resistance.', atk: { 'Beast Raid': 'proj s16 r10 R640', 'Jet Needle': 'proj s20 r10 R780', 'Stinger-GX': 'area@self r180' } },
]
export { PSYCHIC_SPECS as PSYCHIC }
