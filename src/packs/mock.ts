// A mock fetchPack for the standalone demo: rolls a real booster from pokeshell's own data (packs/pokemon/pack.json +
// boosters.json, the cards whose art is built), the same way `pokeshell pack open` does (pokeshell docs/BOOSTERS.md),
// without recording anything. Real cards only: every card it returns is a card pokeshell serves.
import type { PackCard, PackResult, SetInfo } from './types';
import { FX_HIT, fxOf } from './tiers';
import type { Fx } from './types';

interface Pick { label: string; rate?: number; printed?: number; base?: boolean; rarity?: string[]; sets?: string[]; ids?: string[]; exclude?: string[]; supertype?: string; finish?: string; fx?: Fx }
interface Slot { id: string; count?: number; finish?: string; pick: Pick[] }
interface BoosterSet { id: string; name: string; series?: string; released?: string; cardSets: string[]; art?: SetInfo['art']; slots: Slot[] }
interface PackJson { shiny_chance?: number; tiers: { id: string; label: string; shiny?: string }[]; cards: Record<string, { character: string; tier: string; name: string; number: string; rarity: string; set: string }> }

export interface MockData { pack: PackJson; boosters: { sets: BoosterSet[] }; built: Set<string> }

export async function loadMockData(base = '/pokeshell/'): Promise<MockData> {
  const [pack, boosters, built] = await Promise.all([
    fetch(base + 'pack.json').then(r => r.json()),
    fetch(base + 'boosters.json').then(r => r.json()),
    fetch(base + 'built.json').then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  return { pack, boosters, built: new Set<string>(built ?? Object.keys(pack.cards)) };
}

const cardSet = (id: string) => id.slice(0, id.lastIndexOf('-'));

export function mockSets(d: MockData): (SetInfo & { cards: number })[] {
  return d.boosters.sets.map(s => {
    const cards = Object.keys(d.pack.cards).filter(id => d.built.has(id) && s.cardSets.includes(cardSet(id)));
    const hero = s.art?.hero && d.pack.cards[s.art.hero] ? `img/pokemon/${d.pack.cards[s.art.hero].character}/${s.art.hero}.png` : undefined;
    let size = 0;
    for (const sl of s.slots) if (sl.pick.some(p => matchIds(d, s, p).length)) size += sl.count ?? 1;
    return { id: s.id, name: s.name, series: s.series, released: s.released, art: s.art, hero, packSize: size, cards: cards.length };
  });
}

const pools = new WeakMap<Pick, string[]>();
function matchIds(d: MockData, s: BoosterSet, p: Pick): string[] {
  const hit = pools.get(p);
  if (hit) return hit;
  const sets = p.sets ?? s.cardSets;
  const ids = Object.keys(d.pack.cards).filter(id => {
    if (!d.built.has(id)) return false;
    if (p.ids) return p.ids.includes(id);
    const c = d.pack.cards[id];
    if (!sets.includes(cardSet(id))) return false;
    if (p.exclude?.includes(id)) return false;
    if (p.rarity && !p.rarity.includes(c.rarity)) return false;
    if (p.supertype && p.supertype !== 'Pok') return false;
    return true;
  });
  pools.set(p, ids);
  return ids;
}

export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const secureRandom = () => { const b = new Uint32Array(2); crypto.getRandomValues(b); return (b[0] * 2 ** 21 + (b[1] >>> 11)) / 2 ** 53; };

/** one pack, in reveal order (rarest last) */
export function rollPack(d: MockData, setId: string, rand: () => number = secureRandom, caught: Set<string> = new Set()): PackResult {
  const s = d.boosters.sets.find(x => x.id === setId);
  if (!s) throw new Error(`no booster ${setId}`);
  const tierIx = new Map(d.pack.tiers.map((t, i) => [t.id, i]));
  const out: (PackCard & { _order: number })[] = [];
  let order = 0;
  for (const sl of s.slots) {
    const outcomes = sl.pick.map(p => ({ p, pool: matchIds(d, s, p), w: 0 }));
    let missing = 0; let base = -1;
    outcomes.forEach((o, i) => {
      const rate = o.p.rate ?? 1;
      const share = o.p.printed ? Math.min(1, o.pool.length / o.p.printed) : o.pool.length ? 1 : 0;
      if (o.p.base && base < 0) { base = i; o.w = rate; } else { o.w = rate * share; missing += rate - o.w; }
    });
    if (base >= 0 && outcomes[base].pool.length) outcomes[base].w += missing;
    const live = outcomes.filter(o => o.w > 0 && o.pool.length);
    const total = live.reduce((a, o) => a + o.w, 0);
    if (!total) continue;
    const used = new Set<string>();
    for (let k = 0; k < (sl.count ?? 1); k++) {
      let r = rand() * total, o = live[live.length - 1];
      for (const x of live) { r -= x.w; if (r < 0) { o = x; break; } }
      const left = o.pool.filter(id => !used.has(id));
      const from = left.length ? left : o.pool;
      const id = from[Math.floor(rand() * from.length)];
      used.add(id);
      const c = d.pack.cards[id];
      const finish = o.p.finish || sl.finish || 'normal';
      const shinyRoll = rand();
      const printedShiny = d.pack.tiers[tierIx.get(c.tier) ?? 0]?.shiny === 'printed';
      const shiny = shinyRoll < (d.pack.shiny_chance ?? 1 / 64) && !printedShiny;
      const card: PackCard = { id, name: c.name, number: c.number, rarity: c.rarity, tier: c.tier, tierLabel: d.pack.tiers[tierIx.get(c.tier) ?? 0]?.label,
        slot: sl.id, outcome: o.p.label, finish, shiny, isNew: !caught.has(id), setName: s.name, character: c.character,
        image: `img/pokemon/${c.character}/${id}${shiny ? '-shiny' : ''}.png`, oneIn: Math.round((total / o.w) * 10) / 10 };
      if (o.p.fx) card.fx = o.p.fx;
      let fx = fxOf(card);
      if (fx === 'plain' && finish !== 'normal') fx = 'reverse';
      card.fx = fx;
      let hit = FX_HIT[fx]; if (fx === 'plain' && c.tier === 'rare') hit = 1; if (shiny) hit = Math.min(5, hit + 1);
      card.hit = hit;
      caught.add(id);
      out.push({ ...card, _order: order++ });
    }
  }
  out.sort((a, b) => ((a.hit! + (a.shiny ? 0.5 : 0)) - (b.hit! + (b.shiny ? 0.5 : 0))) || ((a.oneIn ?? 1) - (b.oneIn ?? 1)) || (a._order - b._order));
  const packId = Array.from({ length: 26 }, () => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Math.floor(rand() * 32)]).join('');
  return { set: s.id, setName: s.name, packId, cards: out.map(({ _order, ...c }) => { void _order; return c; }) };
}

/** keep rolling until the pack's best card has this effect family (the demo's "big hit" button) */
export function rollPackWith(d: MockData, setId: string, fx: Fx, rand: () => number = secureRandom): PackResult {
  for (let i = 0; i < 20000; i++) {
    const p = rollPack(d, setId, rand);
    if (p.cards[p.cards.length - 1]?.fx === fx) return p;
  }
  return rollPack(d, setId, rand);
}

/** a mock fetchPack: a short delay like pokeshell's roll, NEW against what this browser has "caught" */
export function createMockFetchPack(d: MockData, setId: string, opts: { seed?: number; force?: Fx; delayMs?: number } = {}) {
  return async (): Promise<PackResult> => {
    await new Promise(r => setTimeout(r, opts.delayMs ?? 450));
    const rand = opts.seed !== undefined ? seededRandom(opts.seed) : secureRandom;
    let caught = new Set<string>();
    try { caught = new Set(JSON.parse(localStorage.getItem('pokeshell-arena-demo-caught') || '[]')); } catch { /* */ }
    const before = new Set(caught);
    const res = opts.force ? rollPackWith(d, setId, opts.force, rand) : rollPack(d, setId, rand, caught);
    res.cards.forEach(c => { c.isNew = !before.has(c.id); before.add(c.id); caught.add(c.id); });
    try { localStorage.setItem('pokeshell-arena-demo-caught', JSON.stringify([...caught])); } catch { /* */ }
    return res;
  };
}
