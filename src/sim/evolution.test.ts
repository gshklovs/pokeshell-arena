import { describe, expect, it } from 'vitest'
import { canEvolveInto, isBasicCard, isTopStage, normName, speciesKey, type EvoCard } from './evolution'

const card = (name: string, evolvesFrom: string | null, ...subtypes: string[]): EvoCard => ({ name, evolvesFrom, subtypes: subtypes.length ? subtypes : [evolvesFrom ? 'Stage 1' : 'Basic'] })

describe('name normalisation', () => {
  it.each([
    ['Flabébé', 'flabebe'],
    ["Farfetch'd", 'farfetchd'],
    ['Farfetch’d', 'farfetchd'],
    ['Mr. Mime', 'mr mime'],
    ['Porygon-Z', 'porygon z'],
    ['Nidoran ♀', 'nidoran f'],
    ['Nidoran♀', 'nidoran f'],
    ['Nidoran ♂', 'nidoran m'],
    ['  Pikachu  VMAX ', 'pikachu vmax'],
    ['Type: Null', 'type null'],
    ['Ho-Oh', 'ho oh'],
  ])('%s -> %s', (a, b) => expect(normName(a)).toBe(b))

  it.each([
    ['Galarian Zigzagoon', 'zigzagoon'],
    ['Hisuian Growlithe', 'growlithe'],
    ['Alolan Vulpix', 'vulpix'],
    ['Paldean Wooper', 'wooper'],
    ['Dark Charmeleon', 'charmeleon'],
    ['Light Dragonite', 'dragonite'],
    ['Radiant Charizard', 'charizard'],
    ['Pikachu V', 'pikachu'],
    ['Pikachu VMAX', 'pikachu'],
    ['Lycanroc VSTAR', 'lycanroc'],
    ['Charizard-GX', 'charizard'],
    ['Charizard ex', 'charizard'],
    ['M Charizard-EX', 'charizard'],
    ['Flygon δ', 'flygon'],
    ["Team Rocket's Mewtwo", 'mewtwo'],
    ["Blaine's Charmander", 'charmander'],
    ['Origin Forme Dialga V', 'dialga'],
    ['Rapid Strike Urshifu VMAX', 'urshifu'],
    ['Flabébé', 'flabebe'],
    ["Galarian Farfetch'd", 'farfetchd'],
    ['Mr. Mime', 'mr mime'],
    ['Wormadam (Sandy Cloak)', 'wormadam'],
  ])('species of %s is %s', (a, b) => expect(speciesKey(a)).toBe(b))
})

describe('canEvolveInto: what a player expects, true to the TCG', () => {
  it('a Basic evolves into any Stage 1 of the next species, whatever the set or the name spelling', () => {
    expect(canEvolveInto(card('Charmander', null), card('Charmeleon', 'Charmander'))).toBe(true)
    expect(canEvolveInto(card('Flabébé', null), card('Floette', 'Flabebe'))).toBe(true)
    expect(canEvolveInto(card('Nidoran♀', null), card('Nidorina', 'Nidoran ♀'))).toBe(true)
    expect(canEvolveInto(card("Farfetch’d", null), card("Sirfetch'd", "Galarian Farfetch'd"))).toBe(true)
    expect(canEvolveInto(card('Mr Mime', null), card('Mr. Rime', 'Galarian Mr. Mime'))).toBe(true)
  })
  it('forms and prefixes do not block the line (Galarian, Dark, Hisuian)', () => {
    expect(canEvolveInto(card('Zigzagoon', null), card('Galarian Linoone', 'Galarian Zigzagoon'))).toBe(true)
    expect(canEvolveInto(card('Galarian Zigzagoon', null), card('Linoone', 'Zigzagoon'))).toBe(true)
    expect(canEvolveInto(card('Charmeleon', 'Charmander'), card('Dark Charizard', 'Dark Charmeleon', 'Stage 2'))).toBe(true)
    expect(canEvolveInto(card('Growlithe', null), card('Hisuian Arcanine', 'Hisuian Growlithe'))).toBe(true)
  })
  it('Stage 1 into Stage 2, but never skipping a stage or going sideways', () => {
    expect(canEvolveInto(card('Charmeleon', 'Charmander'), card('Charizard', 'Charmeleon', 'Stage 2'))).toBe(true)
    expect(canEvolveInto(card('Charmander', null), card('Charizard', 'Charmeleon', 'Stage 2'))).toBe(false)
    expect(canEvolveInto(card('Umbreon', 'Eevee'), card('Umbreon ex', 'Eevee', 'Stage 1', 'ex'))).toBe(false)
    expect(canEvolveInto(card('Squirtle', null), card('Charmeleon', 'Charmander'))).toBe(false)
  })
  it('V -> VMAX / VSTAR only through the V card (the TCG rule)', () => {
    const v = card('Umbreon V', null, 'Basic', 'V')
    const vmax = card('Umbreon VMAX', 'Umbreon V', 'VMAX')
    expect(canEvolveInto(v, vmax)).toBe(true)
    expect(canEvolveInto(card('Lycanroc V', null, 'Basic', 'V'), card('Lycanroc VSTAR', 'Lycanroc V', 'VSTAR'))).toBe(true)
    expect(canEvolveInto(card('Umbreon', 'Eevee'), vmax)).toBe(false) // a plain Umbreon: no (the open question)
    expect(canEvolveInto(card('Eevee', null), vmax)).toBe(false)
    // a Basic V never evolves into a regular stage, and a Basic V is not an evolution of anything
    expect(canEvolveInto(card('Pikachu V', null, 'Basic', 'V'), card('Raichu', 'Pikachu'))).toBe(false)
    expect(canEvolveInto(card('Eevee', null), card('Glaceon V', null, 'Basic', 'V'))).toBe(false)
    // "Rapid Strike Urshifu V" -> its VMAX, exact
    expect(canEvolveInto(card('Rapid Strike Urshifu V', null, 'Basic', 'V'), card('Rapid Strike Urshifu VMAX', 'Rapid Strike Urshifu V', 'VMAX'))).toBe(true)
    expect(canEvolveInto(card('Single Strike Urshifu V', null, 'Basic', 'V'), card('Rapid Strike Urshifu VMAX', 'Rapid Strike Urshifu V', 'VMAX'))).toBe(false)
  })
  it('rule-box cards (GX, ex, Radiant) evolve into nothing but their exact link', () => {
    expect(canEvolveInto(card('Radiant Charmander', null, 'Basic', 'Radiant'), card('Charmeleon', 'Charmander'))).toBe(false)
    expect(canEvolveInto(card('Tapu Fini-GX', null, 'Basic', 'GX'), card('Tapu Fini', null))).toBe(false)
  })
  it('a Neo Baby grows into its Basic', () => {
    expect(canEvolveInto(card('Magby', null, 'Baby'), card('Magmar', null))).toBe(true)
    expect(canEvolveInto(card('Pichu', null, 'Baby'), card('Pikachu', null))).toBe(true)
    expect(canEvolveInto(card('Pichu', null, 'Basic'), card('Pikachu', null))).toBe(false) // a modern Pichu is a plain Basic
    expect(canEvolveInto(card('Magby', null, 'Baby'), card('Pikachu', null))).toBe(false)
  })
  it('stages', () => {
    expect(isBasicCard(card('Umbreon V', null, 'Basic', 'V'))).toBe(true)
    expect(isBasicCard(card('Magby', null, 'Baby'))).toBe(true)
    expect(isBasicCard(card('Umbreon VMAX', 'Umbreon V', 'VMAX'))).toBe(false)
    expect(isTopStage(card('Charizard', 'Charmeleon', 'Stage 2'))).toBe(true)
    expect(isTopStage(card('Umbreon VMAX', 'Umbreon V', 'VMAX'))).toBe(true)
    expect(isTopStage(card('Umbreon V', null, 'Basic', 'V'))).toBe(false)
    // with every card: a Stage 1 nothing evolves from is a top stage too
    const all = [card('Charmeleon', 'Charmander'), card('Hypno', 'Drowzee')]
    expect(isTopStage(card('Hypno', 'Drowzee'), all)).toBe(true)
    expect(isTopStage(card('Charmander', null), all)).toBe(false)
  })
})
