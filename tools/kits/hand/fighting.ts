// Fighting hand kits: close-range punches and kicks that lunge in and knock foes back, quakes around itself,
// rocks thrown from range.
import type { HandSpec } from './index'

const JAB = 'melee R66 A72 l30'
const SEISMIC = 'melee R82 A92 l50 kb130 wu12'
const CYCLONE = 'area@self r140 kb100'

export const FIGHTING: HandSpec[] = [
  { name: 'Machop', fantasy: 'A small fighter: low kicks and punches.', atk: { 'Low Kick': 'melee R66 A80', Punch: JAB } },
  { name: 'Machoke', fantasy: 'Karate chops that weaken as it is hurt, submission holds that hurt it too.',
    atk: { 'Karate Chop': 'melee R74 A84 l40', Submission: 'melee R80 A90 l50 kb90', Strength: 'melee R72 A84 l40', 'Seismic Toss': SEISMIC } },
  { name: 'Machamp', fantasy: 'Four arms: grabs and throws a foe across the arena, a lariat that clears everything around.',
    atk: { 'Seismic Toss': 'melee R84 A96 l50 kb150 wu12', 'Strong-Arm Lariat': 'melee R92 A150 l60 kb110' } },
  { name: 'Riolu', fantasy: 'An aura pup: detects attacks, jabs, low kicks.', atk: { Detect: 'self', Jab: 'melee R64 A72 l20', 'Low Kick': 'melee R68 A80 l30' } },
  { name: 'Lucario', fantasy: 'An aura master: Aura Sphere flies true and splashes the back line; Missile Jab closes the gap instantly.',
    atk: { 'Aura Sphere': 'proj s14 r18 R680', 'Missile Jab': 'melee R80 A80 l80', 'Aura Sphere Volley': 'proj s15 r14 R660' } },
  { name: 'Lucario-GX', fantasy: 'Aura strikes, a cyclone kick, and Cantankerous Beatdown that grows with its wounds.',
    atk: { 'Aura Strike': 'melee R74 A84 l50', 'Cyclone Kick': CYCLONE, 'Cantankerous Beatdown-GX': 'melee R88 A100 l70 kb120' } },
  { name: 'Hitmonchan', fantasy: 'A boxer: jabs, a special punch, a bullet-straight punch across the gap.',
    atk: { Jab: JAB, 'Special Punch': 'melee R76 A80 l50 kb80', 'Clean Hit': 'melee R70 A80 l40', 'Bullet Straight Punch': 'melee R80 A72 l80' } },
  { name: 'Hitmontop', fantasy: 'A spinning top: spinning draws and cyclone kicks all around.', atk: { 'Spinning Draw': 'melee R70 A160', 'Cyclone Kick': CYCLONE } },
  { name: 'Onix', fantasy: 'A rock snake: throws rocks, hardens, rages.', atk: { 'Rock Throw': 'proj s11 r14 R560', Harden: 'self', Screech: 'cone R210 A72', Rage: 'melee R80 A110 l40' } },
  { name: 'Onix-GX', fantasy: 'Binds foes in its coils; Heavy Impact shakes the ground; a rocky avalanche once per match.',
    atk: { Bind: 'melee R90 A120 slow350/90', 'Heavy Impact': 'area@self r170 wu16 kb120', 'Rocky Avalanche-GX': 'area@aim r160 R480 wu18 kb100' } },
  { name: 'Cubone', fantasy: 'Throws its bone at the back line.', atk: { Sharpshooting: 'proj s16 r12 R720' } },
  { name: 'Groudon', fantasy: 'The land itself: Break Ground, the biggest quake in the game, hits its own bench too.', atk: { 'Break Ground': 'area@self r200 wu24 kb160' } },
  { name: 'Zygarde-GX', fantasy: 'Cells connect, the land\'s wrath quakes around it, Verdict protects it from rule-box foes.',
    atk: { 'Cell Connector': 'melee R74 A90 l40', "Land's Wrath": 'area@self r170 wu14 kb110', 'Verdict-GX': 'area@aim r150 R480 wu16' } },
  { name: 'Lycanroc-GX', fantasy: 'A rock wolf: claw slashes, an accelerock charge, splintered shards everywhere.',
    atk: { 'Claw Slash': 'melee R78 A100 l50', 'Dangerous Rogue-GX': 'dash D320 S21 r32', Accelerock: 'dash D300 S22 r30 kb90', 'Splintered Shards-GX': 'area@aim r140 R460' } },
  { name: 'Lycanroc V', fantasy: 'Throws rocks, then crashing fangs.', atk: { 'Rock Throw': 'proj s12 r14 R600', 'Crashing Fangs': 'dash D300 S21 r32 kb100' } },
  { name: 'Lycanroc VMAX', fantasy: 'A hunting claw that finishes a weak foe, a Max Edge that also hits the bench.', atk: { 'Hunting Claw': 'melee R80 A100 l60', 'Max Edge': 'melee R90 A120 l70 kb110 wu12' } },
  { name: 'Buzzwole-GX', fantasy: 'Pure muscle: jet punches, a knuckle impact that needs a breather.',
    atk: { 'Jet Punch': 'melee R72 A80 l60', 'Knuckle Impact': 'melee R92 A96 l60 kb140 wu16', 'Absorption-GX': 'melee R86 A100 l60' } },
  { name: 'Aerodactyl V', fantasy: 'A fossil flier: bites, crushes rock.', atk: { Bite: 'melee R70 A80 l40', 'Rock Crush': 'dash D280 S20 r30 kb80' } },
  { name: 'Aerodactyl VSTAR', fantasy: 'Lost Dive: a huge dive from above; Ancient Star shuts off abilities.', atk: { 'Lost Dive': 'dash D340 S22 r34 wu14 kb120', 'Ancient Star': 'area@self r180' } },
  { name: 'Gallade V', fantasy: 'A blade knight: a rising sword, a buster swing that cuts through resistance.', atk: { 'Rising Sword': 'melee R78 A96 l60', 'Buster Swing': ['melee R92 A140 l70 kb110 wu12', 'l70 (was l40): Gallade V won 6% of V fights'] } },
  { name: 'Medicham V', fantasy: 'Yoga Loop: counters that take another turn; a smash uppercut.', atk: { 'Yoga Loop': 'area@aim r100 R460', 'Smash Uppercut': ['melee R84 A100 l80 kb120', 'wider and a longer step in (was R80 A80 l60): it won 0-14% of V fights'] } },
  { name: 'Galarian Zapdos V', fantasy: 'A fighting bird: a thunderous flying kick.', atk: { 'Thunderous Kick': 'dash D320 S22 r32 kb120' } },
  { name: 'Single Strike Urshifu V', fantasy: 'Focuses, then one impact blow.', atk: { 'Laser Focus': 'self', 'Impact Blow': 'melee R88 A90 l80 kb140 wu14' } },
  { name: 'Single Strike Urshifu VMAX', fantasy: 'G-Max One Blow: the slowest windup, the hardest single punch.', atk: { Beatdown: 'melee R84 A96 l60 kb90', 'G-Max One Blow': ['melee R98 A120 l100 wu22 kb180 !', 'pinned to the spec punch (the Max-move lexicon made it a pillar that landed 26 ticks after a 25-tick windup: 5% of VMAX fights), a little wider'] } },
  { name: 'Rapid Strike Urshifu VMAX', fantasy: 'A flurry: gale thrusts and two rapid water-fists at once.', atk: { 'Gale Thrust': ['dash D280 S22 r28 !', 'a gale-fast rush (the name reads as a horn thrust: as one it fell to 17-24% of VMAX fights)'], 'G-Max Rapid Flow': ['proj s20 r12 R760 n2 sp8', 'two of the opponent\'s Pokémon: two fists; both can hit one foe'] } },
]
