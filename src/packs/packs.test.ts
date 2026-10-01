import { describe, expect, it } from 'vitest';
import { rollPack, seededRandom, mockSets, type MockData } from './mock';
import { fxOf, hitOf, revealClass } from './tiers';
import { tearPolygons, wrapperSVG } from './wrapper';
import type { PackCard } from './types';

// a tiny pokeshell-shaped fixture: pack.json cards + a two-slot booster
const tiers = ['common', 'rare', 'rare-holo', 'rare-secret'].map(id => ({ id, label: id.replace('-', ' ') }));
const cards: MockData['pack']['cards'] = {};
for (let i = 1; i <= 8; i++) cards[`tst-${i}`] = { character: `c${i}`, tier: 'common', name: `Common ${i}`, number: `${i}/20`, rarity: 'Common', set: 'Test' };
cards['tst-10'] = { character: 'r', tier: 'rare', name: 'Rare', number: '10/20', rarity: 'Rare', set: 'Test' };
cards['tst-11'] = { character: 'h', tier: 'rare-holo', name: 'Holo', number: '11/20', rarity: 'Rare Holo', set: 'Test' };
cards['tst-21'] = { character: 'g', tier: 'rare-secret', name: 'Gold', number: '21/20', rarity: 'Rare Secret', set: 'Test' };
cards['tst-22'] = { character: 'g2', tier: 'rare-secret', name: 'Gold 2', number: '22/20', rarity: 'Rare Secret', set: 'Test' };
const data: MockData = {
  pack: { shiny_chance: 0, tiers, cards },
  boosters: { sets: [{ id: 'tst', name: 'Test Set', cardSets: ['tst'], slots: [
    { id: 'common', count: 4, pick: [{ label: 'common', rarity: ['Common'], base: true }] },
    { id: 'rare', pick: [
      { label: 'rare', rarity: ['Rare'], base: true, rate: 0.6 },
      { label: 'rare holo', rarity: ['Rare Holo'], rate: 0.3 },
      // 4 printed golds, 1 served (tst-22 has no built art): 0.1 x 1/4 rolls, the rest goes to the base
      { label: 'gold', rarity: ['Rare Secret'], rate: 0.1, printed: 4 },
    ] },
  ] }] },
  built: new Set(Object.keys(cards).filter(id => id !== 'tst-22')),
};

describe('mock booster roll (pokeshell docs/BOOSTERS.md)', () => {
  it('respects the slots: 4 different commons, then one rare-slot card, rarest last', () => {
    const rand = seededRandom(7);
    for (let n = 0; n < 300; n++) {
      const p = rollPack(data, 'tst', rand);
      expect(p.cards).toHaveLength(5);
      const commons = p.cards.filter(c => c.slot === 'common');
      expect(commons).toHaveLength(4);
      expect(new Set(commons.map(c => c.id)).size).toBe(4);
      expect(p.cards[4].slot).toBe('rare');
      expect(p.cards.every(c => data.built.has(c.id))).toBe(true);
      const hits = p.cards.map(hitOf);
      expect([...hits].sort((a, b) => a - b)).toEqual(hits);
    }
  });

  it('matches the configured odds, with the unserved share going to the base', () => {
    const rand = seededRandom(20260929), N = 20000, got: Record<string, number> = {};
    for (let n = 0; n < N; n++) { const o = rollPack(data, 'tst', rand).cards[4].outcome!; got[o] = (got[o] ?? 0) + 1; }
    const expect3 = { rare: 0.6 + 0.075, 'rare holo': 0.3, gold: 0.025 };
    for (const [k, p] of Object.entries(expect3)) {
      const sd = Math.sqrt((p * (1 - p)) / N);
      expect(Math.abs((got[k] ?? 0) / N - p)).toBeLessThan(4.5 * sd);
    }
  });

  it('lists the set with its served cards and pack size', () => {
    const [s] = mockSets(data);
    expect(s.cards).toBe(11);
    expect(s.packSize).toBe(5);
  });
});

describe('tiers', () => {
  const card = (tier: string, extra: Partial<PackCard> = {}): PackCard => ({ id: 'x', name: 'x', rarity: '', tier, slot: 'rare', shiny: false, isNew: false, image: '', ...extra });
  it('maps tiers to effect families and hit sizes', () => {
    expect(fxOf(card('common'))).toBe('plain');
    expect(fxOf(card('common', { finish: 'reverse' }))).toBe('reverse');
    expect(fxOf(card('rare-secret'))).toBe('gold');
    expect(hitOf(card('rare'))).toBe(1);
    expect(hitOf(card('rare-rainbow'))).toBe(4);
    expect(hitOf(card('rare-rainbow', { shiny: true }))).toBe(5);
    expect(hitOf(card('common', { fx: 'gold', hit: 2 }))).toBe(2);
  });
  it('picks the reveal: quick commons, a flip for the last card, a hold for the big hits', () => {
    expect(revealClass(0, false)).toBe('quick');
    expect(revealClass(0, true)).toBe('flip');
    expect(revealClass(3, false)).toBe('charged');
    expect(revealClass(5, true)).toBe('held');
  });
});

describe('pack wrapper', () => {
  it('draws our own SVG wrapper with the set name and hero image', () => {
    const svg = wrapperSVG({ id: 'tst', name: 'Evolving Skies', series: 'Sword & Shield', art: { colors: ['#000', '#111', '#222'], motif: 'sky' } }, '/export/img/x.png', 10);
    expect(svg).toContain('EVOLVING');
    expect(svg).toContain('SWORD &amp; SHIELD');
    expect(svg).toContain('/export/img/x.png');
  });
  it('tears along a jagged line: the flap and body clip polygons share it', () => {
    const t = tearPolygons('tst');
    expect(t.pts).toHaveLength(27);
    expect(t.flap.startsWith('polygon(')).toBe(true);
    expect(t.body.startsWith('polygon(')).toBe(true);
  });
});
