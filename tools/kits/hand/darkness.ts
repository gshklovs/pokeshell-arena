// Darkness hand kits: lunging claws and fangs from the shadows, curses on the aim point, poison clouds.
import type { HandSpec } from './index'

export const DARKNESS: HandSpec[] = [
  // ---- the Umbreon line
  { name: 'Umbreon', fantasy: 'A moonlight hunter: retaliates when a teammate falls, darkness fangs.', atk: { Retaliate: 'melee R76 A96 l50', 'Darkness Fang': 'melee R80 A90 l60 kb70' } },
  { name: 'Umbreon V', fantasy: 'A mean look pins a foe in place; the moonlight blade cuts deeper into the wounded.', atk: { 'Mean Look': 'beam L600 W22', 'Moonlight Blade': 'melee R86 A110 l70' } },
  { name: 'Umbreon VMAX', fantasy: 'Max Darkness: a charge out of the night.', atk: { 'Max Darkness': 'dash D320 S20 r34 wu14 kb120' } },
  { name: 'Umbreon-GX', fantasy: 'Strafes and slips away, shadow bullets, and Dark Call.', atk: { Strafe: 'proj s14 r12 R620', 'Shadow Bullet': 'proj s14 r16 R680', 'Dark Call-GX': 'area@aim r140 R480' } },
  { name: 'Umbreon ex', fantasy: 'Lunatic Claw: a moonlit lunge that grows when the foe is a rule box.', atk: { 'Lunatic Claw': 'melee R86 A110 l70 kb90' } },
  // ---- dark legends
  { name: 'Darkrai', fantasy: 'Puts foes into nightmares, then a pitch-black blade.', atk: { Nightmare: 'proj s12 r14 R620', 'Pitch-Black Blade': 'melee R88 A120 l60 kb100 wu12' } },
  { name: 'Darkrai-GX', fantasy: 'A dark cleave through resistance; Dead End knocks out a foe under a condition.', atk: { 'Dark Cleave': 'melee R88 A120 l60', 'Dead End-GX': 'area@aim r120 R480 wu14' } },
  { name: 'Darkrai VSTAR', fantasy: 'A dark pulse that grows with the energy in play.', atk: { 'Dark Pulse': 'area@aim r140 R480' } },
  { name: 'Yveltal', fantasy: 'The destruction bird: a dark cutter of wing.', atk: { 'Dark Cutter': 'beam L660 W26' } },
  { name: 'Hoopa V', fantasy: 'Shadow Impact: a portal slam that hurts its own team.', atk: { 'Shadow Impact': 'area@aim r140 R480 wu14' } },
  { name: 'Galarian Moltres V', fantasy: 'An aura of dark fire that burns it too.', atk: { 'Aura Burn': 'cone R260 A72 wu14' } },
  { name: 'Eternatus V', fantasy: 'Accelerates energy, then Dynamax Cannon: stronger against evolved foes.', atk: { 'Power Accelerator': 'melee R78 A96 l40', 'Dynamax Cannon': 'beam L760 W44 wu18' } },
  // ---- others
  { name: 'Absol', fantasy: 'A disaster omen: slashes, claws that steal, a swirling disaster around it.',
    atk: { Slash: 'melee R74 A100 l40', 'Lost Claw': 'melee R80 A100 l50', 'Swirling Disaster': 'area@self r180', 'Claw Rend': 'melee R80 A100 l50' } },
  { name: 'Spiritomb', fantasy: 'A chain of spirits: curses that land on the aim point.', atk: { 'Chain of Spirits': 'area@aim r110 R460', 'Ticking Terror': 'cone R200 A72', 'Cursed Drop': 'area@aim r100 R460' } },
  { name: 'Guzzlord-GX', fantasy: 'A black hole that eats: a tyrannical hole around it, Glutton takes extra prizes.', atk: { 'Eat Sloppily': 'self', 'Tyrannical Hole': 'area@self r200 wu24 kb120', 'Glutton-GX': 'melee R100 A120 l60 wu18' } },
  { name: 'Drapion V', fantasy: 'A dynamic tail with a huge reach that also hits the back line.', atk: { 'Dynamic Tail': 'melee R100 A160 wu16 kb120' } },
  { name: 'Drapion VSTAR', fantasy: 'Big Bang Arm: weaker the more it is hurt, so strike first.', atk: { 'Big Bang Arm': ['melee R100 A140 l100 wu18 kb140', 'a wider, longer swing (was A100 l80): with its 22-tick windup it won 6-8% of VSTAR fights'] } },
  { name: 'Radiant Hisuian Sneasler', fantasy: 'A poison jab from a quick lunge.', atk: { 'Poison Jab': 'melee R76 A80 l60' } },
  { name: 'Crobat V', fantasy: 'A venomous fang in a swooping dash.', atk: { 'Venomous Fang': 'dash D280 S22 r26' } },
  { name: 'Hisuian Samurott V', fantasy: 'A shell-blade samurai: basket crash, a shadow slash.', atk: { 'Basket Crash': 'melee R74 A96 l40', 'Shadow Slash': 'melee R90 A120 l70 kb100 wu12' } },
  { name: 'Hisuian Samurott VSTAR', fantasy: 'Merciless Blade cuts deeper into the wounded.', atk: { 'Merciless Blade': 'melee R90 A120 l80 kb90' } },
  { name: 'Garbodor V', fantasy: 'A trash stench that poisons and pins; a sludge bomb.', atk: { 'Trash Stench': 'cone R200 A72', 'Sludge Bomb': 'proj s11 r20 R620 wu12' } },
  { name: 'Garbodor VMAX', fantasy: 'G-Max Malodor: a poison cloud around it.', atk: { 'G-Max Malodor': 'area@self r190 wu14' } },
  { name: 'Honchkrow V', fantasy: 'A fearsome shadow on the aim point.', atk: { 'Fearsome Shadow': 'area@aim r140 R480' } },
  { name: 'Morpeko V', fantasy: 'Gnaws and runs; a hangry spike.', atk: { 'Gnaw and Run': 'melee R66 A80 l30', 'Hangry Spike': 'proj s14 r16 R660' } },
]
