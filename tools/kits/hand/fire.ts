// Fire hand kits: cones and columns of flame that set grass alight; heavy hitters wind up and leave fire behind.
import type { HandSpec } from './index'

const EMBER = 'cone R190 A44'
const FLAMETHROWER = 'cone R230 A56 fire40'
const FLARE = 'proj s13 r11 R560'
const SCRATCH = 'melee R64 A72'
const SLASH = 'melee R78 A100 l40'
const FIRE_PUNCH = 'melee R72 A84 l40'

export const FIRE: HandSpec[] = [
  // ---- the Charizard line
  { name: 'Charmander', fantasy: 'A scrappy starter: quick scratches up close, then a short breath of fire that lights the grass.',
    atk: { Scratch: SCRATCH, Ember: EMBER, Flare: FLARE, Rage: 'melee R70 A80 l30', Gnaw: 'melee R60 A64', 'Fire Fang': 'melee R70 A72 l30', 'Blazing Destruction': ['terrain@aim r120 R360 fire70', 'the Stadium it burns down is the terrain under the flames: clears the surface, then sets it alight'], 'Steady Firebreathing': 'cone R200 A48' } },
  { name: 'Charmeleon', fantasy: 'Claws and a real flamethrower: closes in with slashes, keeps foes off with a burning cone.',
    atk: { Slash: SLASH, Flamethrower: FLAMETHROWER } },
  { name: 'Charizard', fantasy: 'The classic: saves up for Fire Spin, a wide roaring cone that sets the whole field alight.',
    atk: { 'Fire Spin': ['cone R260 A72 wu20 fire70 kb70', 'the 4-energy commitment: a long windup, the widest cone in the game'], 'Royal Blaze': ['cone R250 A64 wu14 fire60 !', 'pinned to the spec cone: the lexicon made it an 84 px fireball, and this Charizard won 92% of Stage 2 fights'] } },
  { name: 'Charizard-GX', fantasy: 'A GX brawler: a scorching flamethrower, then a once-per-match Flare Blitz that crashes through everything.',
    atk: { Flamethrower: 'cone R240 A60 fire50', 'Flare Blitz-GX': 'dash D340 S20 r36 wu16 kb160 fire60', 'Wing Attack': 'cone R200 A72 kb90', 'Crimson Storm': 'area@self r190 wu24 fire90 kb120', 'Raging Out-GX': 'area@aim r120 R420' } },
  { name: 'Charizard V', fantasy: 'Incinerate burns through shields up close; Heat Blast is a long line of fire.',
    atk: { Incinerate: 'cone R220 A56', 'Heat Blast': 'beam L700 W40 wu18 fire60' } },
  { name: 'Charizard VSTAR', fantasy: 'Star Blaze: a falling star of flame on the aim point, once per match, that leaves the ground burning.',
    atk: { 'Explosive Fire': 'cone R240 A60 fire50', 'Star Blaze': 'area@aim r150 R480 wu24 fire90 kb140' } },
  { name: 'Radiant Charizard', fantasy: 'One huge Combustion Blast: the longest, widest fire beam, then a turn to cool down.',
    atk: { 'Combustion Blast': ['beam L780 W48 t12 wu28 fire60 kb110 pips3', 'three pips (see overrides); wu28 as before: at wu26 and five pips it won 94% of same-tier fights, at five pips and a pip per 160 ticks 14-21%'] },
    overrides: { 'Combustion Blast.cost': 'its Excited Heart ability (the attack costs 1 less for each Prize card the opponent has taken) is not simulated: 3 of its 5 energy, the cost it has midway through a fight' } },
  // ---- Johto / Sinnoh fire starters
  { name: 'Cyndaquil', fantasy: 'A nervous spark: stares foes down, flicks homing sparks, darts in.',
    atk: { Leer: 'cone R200 A64', Swift: 'proj s16 r10 R700', Fireworks: 'cone R190 A56', 'Quick Attack': 'dash D220 S20 r24' } },
  { name: 'Quilava', fantasy: 'Smoke and embers: blinds with a smokescreen, fans fire across the field.',
    atk: { Ember: EMBER, 'Fire Wind': 'cone R230 A72 kb60', Smokescreen: 'cone R200 A64', Char: 'proj s11 r14 R560 fire50' } },
  { name: 'Typhlosion', fantasy: 'An eruption on legs: bursts of flame on the aim point, a burning wheel around itself.',
    atk: { 'Flame Burst': 'area@aim r110 R440 fire60', 'Flame Wheel': 'area@self r170 wu16 fire80' } },
  { name: 'Chimchar', fantasy: 'A flicker of flame: one quick ember.', atk: { Ember: EMBER } },
  { name: 'Monferno', fantasy: 'Fireballs and a flamethrower, always moving.', atk: { Flare: FLARE, Flamethrower: FLAMETHROWER } },
  { name: 'Infernape', fantasy: 'A fire-fist martial artist: a burning vortex around itself and a flying Burning Kick.',
    atk: { 'Infernal Vortex': 'area@self r160 fire60', 'Burning Kick': 'melee R86 A100 l90 kb110 wu14' } },
  // ---- legends
  { name: 'Moltres', fantasy: 'A firebird: sweeping wings of flame.',
    atk: { 'Fire Spin': 'cone R250 A70 wu16 fire60', 'Inferno Wings': 'cone R220 A72 kb70' } },
  { name: 'Ho-Oh', fantasy: 'A rainbow phoenix: sacred breath that heals, wings of fire.', atk: { 'Sacred Breath': 'self', 'Fire Wing': 'cone R220 A72 kb90' } },
  { name: 'Ho-Oh-GX', fantasy: 'A phoenix that rains sacred fire from above and rises again.',
    atk: { 'Sacred Fire': 'proj s14 r14 R700 fire50', 'Phoenix Burn': 'area@aim r140 R460 wu20 fire80', 'Eternal Light-GX': 'self' } },
  { name: 'Reshiram', fantasy: 'The white flame: a clean slash and a searing laser.', atk: { Slash: 'melee R80 A100 l50', 'Laser Flame': 'beam L680 W30' } },
  { name: 'Reshiram-GX', fantasy: 'Columns of blue-white fire on the aim point; Vermilion is a beam that fuels its next move.',
    atk: { 'Flame Charge': 'self', 'Scorching Column': 'area@aim r90 R460 wu14 fire60', 'Vermilion-GX': 'beam L760 W44 wu20 fire70' } },
  { name: 'Entei', fantasy: 'A volcano beast: fangs that grow with its wounds, a charging heat tackle.',
    atk: { 'Claw Slash': 'melee R80 A100 l50', 'Angry Fang': 'melee R72 A84 l40', 'Heat Tackle': 'dash D300 S19 r30 kb80' } },
  { name: 'Entei V', fantasy: 'Burning Rondo: a blazing charge that hits harder the more Pokémon are around.', atk: { 'Burning Rondo': 'dash D300 S19 r30 fire40' } },
  { name: 'Victini', fantasy: 'A victory spark: V-Flame and a diving tackle.', atk: { 'Call for Family': 'self', 'V-Flame': ['cone R180 A60 fire40', 'R180 (was R210): Victini won 94% of basic fights'], 'Victory Dive': 'dash D260 S19 r26' } },
  // ---- others
  { name: 'Growlithe', fantasy: 'A loyal pup that spits little fireballs.', atk: { Flare: FLARE } },
  { name: 'Arcanine', fantasy: 'A legendary dog: a flamethrower, then a charging Take Down that hurts it too.',
    atk: { Flamethrower: FLAMETHROWER, 'Take Down': 'dash D300 S19 r30 kb90' } },
  { name: 'Vulpix', fantasy: 'A trickster fox: a confusing ray, a quick kick.', atk: { 'Confuse Ray': 'beam L540 W16', 'Wild Kick': 'melee R70 A80 l30' } },
  { name: 'Ninetales', fantasy: 'Lures a foe in, then a heavy Fire Blast; a sweeping flame tail.',
    atk: { Lure: 'beam L600 W18', 'Fire Blast': 'proj s12 r22 R640 wu16 fire70', 'Flame Tail': 'melee R84 A140 l30' } },
  { name: 'Magmar', fantasy: 'A brawler with burning fists.',
    atk: { 'Fire Punch': FIRE_PUNCH, Flamethrower: FLAMETHROWER, 'Tail Slap': 'melee R76 A120', 'Magma Punch': 'melee R76 A84 l50 fire40', 'Low Kick': 'melee R66 A80', 'Fiery Punch': 'melee R80 A90 l60 fire40' } },
  { name: 'Flareon', fantasy: 'A fluffy furnace: a mane of fire.', atk: { 'Fire Mane': 'cone R230 A60 fire40' } },
  { name: 'Flareon V', fantasy: 'Breathes fire to charge up, then burns a column on the aim point.', atk: { 'Flaming Breath': 'cone R180 A50', 'Scorching Column': 'area@aim r90 R440 fire60' } },
  { name: 'Flareon VMAX', fantasy: 'Max Detonate: gathers its energy and explodes around itself.', atk: { 'Max Detonate': 'area@self r170 wu20 fire80 kb120' } },
  { name: 'Volcarona V', fantasy: 'A sun moth: surging flames, then a slow, heavy Fire Blast.', atk: { 'Surging Flames': 'cone R200 A64', 'Fire Blast': ['proj s12 r22 R660 wu16 fire70 kb60 ~straight', 'a straight shot (the fireball archetype gave it an 84 px blast): Volcarona V won 88-100% of V fights'] } },
  { name: 'Delphox V', fantasy: 'A fire mage: an eerie homing glow that burns and confuses, a magical fireball that splashes.',
    atk: { 'Eerie Glow': 'proj s11 r14 R620', 'Magical Fire': 'proj s12 r18 R680 fire60' } },
  { name: 'Centiskorch V', fantasy: 'A burning train of a centipede: radiant heat up close, then it rolls right through you.',
    atk: { 'Radiating Heat': 'cone R170 A64', 'Burning Train': 'dash D320 S18 r34 wu18 fire60 kb100' } },
  { name: 'Centiskorch VMAX', fantasy: 'G-Max Centiferno: a ring of fire around itself that grows with its energy.', atk: { 'G-Max Centiferno': 'area@self r180 wu14 fire80' } },
  { name: 'Simisear V', fantasy: 'A juggler: charges up, then tosses fireballs that grow with its energy.', atk: { 'Bursting Power': 'melee R70 A84', 'Flare Juggling': 'proj s12 r16 R620' } },
  { name: 'Simisear VSTAR', fantasy: 'Fireball Fever burns energy for power; Ember Star rains fire once per match.',
    atk: { 'Fireball Fever': 'proj s12 r18 R620 fire40', 'Ember Star': 'area@aim r140 R460 wu16 fire80' } },
  { name: 'Turtonator-GX', fantasy: 'A spiked shell: hit it and the shell trap bites back; Bright Flame is a heavy cone.',
    atk: { 'Shell Trap': 'melee R70 A90', 'Bright Flame': 'cone R240 A60 wu14 fire60', 'Nitro Tank-GX': 'self' } },
]
