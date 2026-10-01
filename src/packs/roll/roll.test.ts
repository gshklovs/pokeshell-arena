// The set roll's model (docs/PACK_ROLL.md): a deterministic, honest strip; the reel lands on the rolled set; it
// loops for as long as the host takes, then settles in about 0.8 s; an interrupt resolves at once.
import { describe, expect, it } from 'vitest';
import { ReelModel, REEL, type ReelEvent } from './reel';
import { Strip } from './strip';
import { oneIn, stripAt, stripLayout } from './render';
import { EXIT } from './play';
import { rollTier } from './types';
import type { RollSet } from './types';

// pokeshell docs/BOOSTERS.md, "The chances (k = 0.7, all eight sets openable)"
const SETS: RollSet[] = [
  { id: 'swsh9', name: 'Brilliant Stars', chance: 0.2138, oneIn: 4.7 },
  { id: 'me55', name: '30th Celebration', chance: 0.2078, oneIn: 4.8 },
  { id: 'swsh11', name: 'Lost Origin', chance: 0.1869, oneIn: 5.4 },
  { id: 'swsh12pt5', name: 'Crown Zenith', chance: 0.1538, oneIn: 6.5 },
  { id: 'swsh7', name: 'Evolving Skies', chance: 0.1064, oneIn: 9.4 },
  { id: 'sm115', name: 'Hidden Fates', chance: 0.1001, oneIn: 10 },
  { id: 'base1', name: 'Base Set', chance: 0.0165, oneIn: 60.7 },
  { id: 'neo1', name: 'Neo Genesis', chance: 0.0147, oneIn: 67.9 },
];
const MYSTERY: RollSet = { id: 'mystery', name: 'Mystery', chance: 0 };
const byId = (id: string) => SETS.find(s => s.id === id)!;

/** run the model on a 60 fps clock from `from` to `to` ms, collecting events and the positions seen */
function run(m: ReelModel, from: number, to: number, seen?: Map<number, string>) {
  const ev: (ReelEvent & { t: number })[] = [];
  for (let t = from; t <= to; t += 1000 / 60) {
    for (const e of m.update(t)) ev.push({ ...e, t });
    if (seen) for (let i = Math.floor(m.x - m.cfg.fade); i <= Math.ceil(m.x + m.cfg.fade); i++) if (Math.abs(i - m.x) < m.cfg.fade && !seen.has(i)) seen.set(i, m.setAt(i)!.id);
  }
  return ev;
}

describe('the strip', () => {
  it('is deterministic from a seed', () => {
    const a = new Strip(SETS, 7), b = new Strip(SETS, 7), c = new Strip(SETS, 8);
    const ids = (s: Strip) => Array.from({ length: 200 }, (_, i) => s.at(i)!.id);
    expect(ids(a)).toEqual(ids(b));
    expect(ids(a)).not.toEqual(ids(c));
    // and random access: tile 150 doesn't depend on having drawn 0..149
    expect(new Strip(SETS, 7).at(150)!.id).toBe(ids(a)[150]);
  });

  it('is visually honest: each set appears about as often as its chance', () => {
    const s = new Strip(SETS, 12345), n = 20000, count = new Map<string, number>();
    for (let i = 0; i < n; i++) { const id = s.at(i)!.id; count.set(id, (count.get(id) ?? 0) + 1); }
    for (const x of SETS) {
      const share = (count.get(x.id) ?? 0) / n, sd = Math.sqrt(x.chance * (1 - x.chance) / n);
      expect(Math.abs(share - x.chance)).toBeLessThan(4.5 * sd);
    }
  });

  it('never draws a set with no chance (the mystery wrapper, an unpriced set)', () => {
    const s = new Strip([...SETS, { id: 'x', name: 'Unpriced', chance: 0 }], 3);
    for (let i = 0; i < 5000; i++) expect(s.at(i)!.id).not.toBe('x');
  });
});

describe('the reel', () => {
  it('starts on the mystery wrapper, then lands on the rolled set, and that tile was never on screen as anything else', () => {
    const m = new ReelModel(new Strip(SETS, 42), MYSTERY);
    expect(m.setAt(0)!.id).toBe('mystery');
    const seen = new Map<number, string>();
    run(m, 0, 1000, seen);
    m.resolve(byId('swsh7'), 9.4, 1000);
    const ev = run(m, 1000, 3000, seen);
    const land = ev.find(e => e.type === 'land')!;
    expect(land.set!.id).toBe('swsh7');
    expect(m.phase).toBe('landed');
    expect(Math.round(m.x)).toBe(m.landing!.index);
    expect(m.setAt(Math.round(m.x))!.id).toBe('swsh7');
    // the landing tile's first appearance on screen was already the rolled set: no tile ever changes under your eyes
    expect(seen.get(m.landing!.index)).toBe('swsh7');
    // a common pack settles in about 0.4 s after the result (v2: half of v1's 0.8 s)
    expect(land.t - 1000).toBeGreaterThan(300);
    expect(land.t - 1000).toBeLessThan(520);
    expect(ev.filter(e => e.type === 'tease')).toHaveLength(0);
  });

  it('loops for as long as the host takes (elastic), then settles within about 0.4 s', () => {
    const m = new ReelModel(new Strip(SETS, 1), MYSTERY);
    const ev = run(m, 0, 6000);
    expect(m.phase).toBe('spinning');
    expect(ev.some(e => e.type === 'land')).toBe(false);
    // it has cruised the whole time: 13 tiles a second
    expect(m.v).toBeCloseTo(REEL.cruise, 5);
    expect(m.x).toBeGreaterThan(6 * REEL.cruise * 0.9);
    const ticks = ev.filter(e => e.type === 'tick').length;
    expect(ticks).toBeGreaterThan(70);
    m.resolve(byId('swsh9'), 4.7, 6000);
    const ev2 = run(m, 6000, 8000);
    const land = ev2.find(e => e.type === 'land')!;
    expect(land.set!.id).toBe('swsh9');
    expect(land.t - 6000).toBeLessThanOrEqual(520);
    // a clean deceleration: the position never goes backwards and the speed never grows after the lock
    const m2 = new ReelModel(new Strip(SETS, 1), MYSTERY);
    run(m2, 0, 2000);
    m2.resolve(byId('swsh9'), 4.7, 2000);
    let lastX = m2.x, lastV = Infinity;
    for (let t = 2000; t < 2000 + m2.cfg.settle + 50; t += 5) {
      m2.update(t);
      if (m2.phase !== 'settling') break;
      expect(m2.x).toBeGreaterThanOrEqual(lastX - 1e-9);
      expect(m2.v).toBeLessThanOrEqual(lastV + 1e-6);
      lastX = m2.x; lastV = m2.v;
    }
  });

  it('a result during the wind-up waits for the cruise, so the settle starts from full speed', () => {
    const m = new ReelModel(new Strip(SETS, 5), MYSTERY);
    m.resolve(byId('swsh11'), 5.4, 0);
    const ev = run(m, 0, 2500);
    const lock = ev.find(e => e.type === 'lock')!;
    expect(lock.t).toBeGreaterThanOrEqual(m.cruiseAt - 1);
    expect(ev.find(e => e.type === 'land')!.set!.id).toBe('swsh11');
  });

  it('a vintage pack is teased honestly: the long crawl and the tease only when it really is vintage', () => {
    const m = new ReelModel(new Strip(SETS, 9), MYSTERY);
    run(m, 0, 900);
    m.resolve(byId('base1'), 60.7, 900);
    const ev = run(m, 900, 3500);
    expect(ev.filter(e => e.type === 'tease')).toHaveLength(1);
    const land = ev.find(e => e.type === 'land')!;
    expect(land.set!.id).toBe('base1');
    expect(land.rare).toBe(true);
    expect(land.t - 900).toBeGreaterThan(550); // the longer, crawling settle
    expect(land.t - 900).toBeLessThan(800);
    expect(m.landing!.k).toBeGreaterThan(3.5); // a steeper tail: it creeps the last tile
  });

  it('an interrupt with the result in snaps onto the rolled set at once', () => {
    const m = new ReelModel(new Strip(SETS, 11), MYSTERY);
    run(m, 0, 800);
    m.resolve(byId('neo1'), 67.9, 800);
    run(m, 800, 900); // locked, mid-settle
    expect(m.phase).toBe('settling');
    const ev = m.interrupt(900);
    expect(ev[0]).toMatchObject({ type: 'interrupt', snapped: true });
    expect(ev[0].set!.id).toBe('neo1');
    expect(m.phase).toBe('interrupted');
    expect(m.x).toBe(m.landing!.index);
    expect(m.setAt(m.landing!.index)!.id).toBe('neo1');
    // and nothing more happens afterwards
    expect(run(m, 900, 3000).filter(e => e.type === 'land' || e.type === 'tick')).toHaveLength(0);
  });

  it('an interrupt with the result in but not locked yet (still winding up) snaps too', () => {
    const m = new ReelModel(new Strip(SETS, 11), MYSTERY);
    m.update(50);
    m.resolve(byId('swsh7'), 9.4, 50);
    const ev = m.interrupt(60);
    expect(ev[0]).toMatchObject({ snapped: true });
    expect(m.setAt(Math.round(m.x))!.id).toBe('swsh7');
  });

  it('an interrupt before the result stops where it is, snapping to nothing', () => {
    const m = new ReelModel(new Strip(SETS, 11), MYSTERY);
    run(m, 0, 700);
    const ev = m.interrupt(700);
    expect(ev[0]).toMatchObject({ type: 'interrupt', snapped: false });
    expect(m.landing).toBeNull();
    m.resolve(byId('swsh7'), 9.4, 800); // too late: ignored
    expect(run(m, 800, 2000)).toHaveLength(0);
  });

  it('a late sets list: mystery foils until it lands, then the real draw only beyond the visible edge', () => {
    const m = new ReelModel(new Strip([{ ...MYSTERY, chance: 1 }], 4), MYSTERY);
    const seen = new Map<number, string>();
    run(m, 0, 1500, seen);
    expect([...seen.values()].every(id => id === 'mystery')).toBe(true);
    m.useStrip(new Strip(SETS, 4));
    const before = new Map(seen);
    run(m, 1500, 3000, seen);
    // nothing already on screen changed identity; the new tiles are real sets
    for (const [i, id] of before) expect(m.setAt(i)!.id).toBe(id);
    expect([...seen.entries()].filter(([i]) => !before.has(i)).some(([, id]) => id !== 'mystery')).toBe(true);
    m.resolve(byId('swsh7'), 9.4, 3000);
    expect(run(m, 3000, 4500).find(e => e.type === 'land')!.set!.id).toBe('swsh7');
  });

  it('reduced motion: no travel, a cross-fade from wrapper to wrapper, then onto the result', () => {
    const m = new ReelModel(new Strip(SETS, 2), MYSTERY, true);
    run(m, 0, 1300);
    expect(m.v).toBe(0);
    expect(m.x).toBeGreaterThanOrEqual(2);
    m.resolve(byId('sm115'), 10, 1300);
    const ev = run(m, 1300, 2000);
    expect(ev.find(e => e.type === 'land')!.set!.id).toBe('sm115');
  });
});

describe('v2: a case-opening strip, half the time', () => {
  /** when it lands and when the reel has gone, host answering at `host` ms */
  function timeline(set: RollSet, host: number) {
    const m = new ReelModel(new Strip(SETS, 1), MYSTERY);
    let land = -1;
    for (let t = 0; t < 10000 && land < 0; t++) { if (t === host) m.resolve(set, set.oneIn, t); if (m.update(t).some(e => e.type === 'land')) land = t; }
    return { land, gone: land + EXIT.hold + EXIT.ms };
  }
  // v1, measured on its model before the change: host at once 1670 / 2220 ms; host at 1 s, 1250 / 1800 ms after it
  it('takes at most half of v1, end to end, for a common and a vintage pack', () => {
    expect(timeline(byId('swsh9'), 0).gone).toBeLessThanOrEqual(1670 / 2);
    expect(timeline(byId('base1'), 0).gone).toBeLessThanOrEqual(2220 / 2);
    expect(timeline(byId('swsh9'), 1000).gone - 1000).toBeLessThanOrEqual(1250 / 2);
    expect(timeline(byId('base1'), 1000).gone - 1000).toBeLessThanOrEqual(1800 / 2);
  });

  it('suspense: it visibly slows into the landing, the last tile crawling under the marker', () => {
    const m = new ReelModel(new Strip(SETS, 21), MYSTERY);
    run(m, 0, 600);
    m.resolve(byId('swsh11'), 5.4, 600);
    const speeds: number[] = [];
    for (let t = 600; m.phase !== 'landed' && t < 2000; t += 1000 / 60) { m.update(t); speeds.push(m.v); }
    const n = speeds.length;
    expect(speeds[0]).toBeGreaterThan(15);                 // still flying when it locks
    expect(speeds[Math.floor(n * 0.6)]).toBeLessThan(3);    // the last stretch crawls
  });

  it('stops anywhere on the rolled tile, sometimes near its edge, never off it (honest)', () => {
    let nearEdge = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const m = new ReelModel(new Strip(SETS, seed), MYSTERY);
      run(m, 0, 500);
      m.resolve(byId('swsh7'), 9.4, 500);
      run(m, 500, 1500);
      const off = m.x - m.landing!.index;
      expect(Math.abs(off)).toBeLessThan(0.5);
      expect(m.setAt(Math.round(m.x))!.id).toBe('swsh7');
      if (Math.abs(off) > 0.2) nearEdge++;
    }
    expect(nearEdge).toBeGreaterThan(10);
  });

  it('the rarity plates: common modern, mid (Evolving Skies, Hidden Fates), vintage (Base, Neo)', () => {
    expect(SETS.map(s => rollTier(s.oneIn))).toEqual(['common', 'common', 'common', 'common', 'mid', 'mid', 'vintage', 'vintage']);
    expect(rollTier(null)).toBe('unknown');
  });
});

describe('drawing helpers', () => {
  it('the strip: evenly spaced under a fixed marker, fading out at the window ends', () => {
    const L = stripLayout(300);
    expect(stripAt(0, 300, REEL.fade)).toMatchObject({ x: 0, alpha: 1 });
    expect(stripAt(1, 300, REEL.fade).x).toBeCloseTo(L.step, 6);
    expect(stripAt(-2, 300, REEL.fade).x).toBeCloseTo(-2 * L.step, 6);
    expect(stripAt(REEL.fade, 300, REEL.fade).alpha).toBe(0);
    expect(L.w).toBeLessThan(300);
  });
  it('"1 in N"', () => {
    expect(oneIn(60.7)).toBe('1 in 61');
    expect(oneIn(4.7)).toBe('1 in 4.7');
    expect(oneIn(null)).toBe('');
  });
});
