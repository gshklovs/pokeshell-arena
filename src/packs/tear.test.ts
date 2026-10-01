import { describe, expect, it } from 'vitest';
import { TearModel, curlChain, cutSpan, leakGlow } from './tear';
import { CardShake } from './shake';
import { tapAdvances } from './scene';
import { auraLevel, auraOf, revealFx } from './tiers';
import { tearEdge, tearShapes, wrapperSVG, PACK_W, TEAR_Y, STRIP_H } from './wrapper';
import type { PackCard } from './types';

// a pack 200 px wide at x = 100..300
const L = 100, W = 200;
const settle = (m: TearModel, s = 1.5) => { for (let t = 0; t < s; t += 1 / 60) m.step(1 / 60); };

describe('tear state machine', () => {
  it('follows the pointer along the strip once past the dead zone', () => {
    const m = new TearModel(); m.ready = true;
    m.begin(102, L, W);
    expect(m.move(105)).toBe(false);
    expect(m.dir).toBe(0);
    m.move(150); settle(m, 0.4);
    expect(m.dir).toBe(1);
    expect(m.state).toBe('dragging');
    expect(m.progress).toBeCloseTo(0.25, 2);
    m.move(250); settle(m, 0.4);
    expect(m.progress).toBeCloseTo(0.75, 2);
  });

  it('is reversible: dragging back closes the tear and the glow with it', () => {
    const m = new TearModel(); m.ready = true;
    m.begin(102, L, W); m.move(260); settle(m, 0.4);
    const openGlow = leakGlow(m.progress, 1).alpha;
    m.move(130); settle(m, 0.4);
    expect(m.progress).toBeCloseTo(0.15, 2);
    expect(leakGlow(m.progress, 1).alpha).toBeLessThan(openGlow);
    m.move(90); settle(m, 0.4);
    expect(m.progress).toBeLessThan(0.01);
    expect(m.state).toBe('dragging');
  });

  it('commits only when the pointer crosses the far end', () => {
    const m = new TearModel(); m.ready = true;
    m.begin(102, L, W);
    for (let x = 110; x < 300; x += 10) expect(m.move(x)).toBe(false);
    expect(m.move(299)).toBe(false);
    expect(m.state).toBe('dragging');
    expect(m.move(301)).toBe(true);
    expect(m.state).toBe('committed');
    settle(m, 0.3);
    expect(m.progress).toBeCloseTo(1, 3);
  });

  it('tears right to left too, committing at the left end', () => {
    const m = new TearModel(); m.ready = true;
    m.begin(298, L, W); m.move(250); settle(m, 0.4);
    expect(m.dir).toBe(-1);
    expect(m.progress).toBeCloseTo(0.25, 2);
    expect(m.move(99)).toBe(true);
  });

  it('springs back closed on an early release, then can be torn again', () => {
    const m = new TearModel(); m.ready = true;
    m.begin(102, L, W); m.move(270); settle(m, 0.4);
    m.release();
    expect(m.state).toBe('settling');
    m.step(1 / 60);
    expect(m.progress).toBeGreaterThan(0.5); // eases, never snaps
    settle(m, 2);
    expect(m.state).toBe('sealed');
    expect(m.progress).toBe(0);
    expect(m.dir).toBe(0);
    m.begin(102, L, W); m.move(200); settle(m, 0.4);
    expect(m.progress).toBeCloseTo(0.5, 2);
  });

  it('holds at 92% past the end until the pack arrives, then commits if still past it', () => {
    const m = new TearModel();
    m.begin(102, L, W);
    expect(m.move(320)).toBe(false);
    settle(m, 0.5);
    expect(m.progress).toBeCloseTo(0.92, 2);
    expect(m.setReady()).toBe(true);
    expect(m.state).toBe('committed');
  });

  it('does not commit on arrival if the pointer went back', () => {
    const m = new TearModel();
    m.begin(102, L, W); m.move(320); m.move(200);
    expect(m.setReady()).toBe(false);
    expect(m.state).toBe('dragging');
  });

  it('drives an auto-tear to a commit', () => {
    const m = new TearModel(); m.ready = true;
    expect(m.drive(0.5)).toBe(false);
    expect(m.dir).toBe(1);
    expect(m.drive(1.02)).toBe(true);
  });
});

describe('the peeling strip', () => {
  it('stays flat when sealed and bends only the torn part', () => {
    expect(curlChain(0, 20).every(s => s.rz === 0 && s.ry === 0 && s.torn === 0)).toBe(true);
    const c = curlChain(0.5, 20);
    // chain order: hinge (untorn) first, the free end last
    expect(c.slice(0, 9).every(s => s.torn === 0)).toBe(true);
    expect(c[19].torn).toBe(1);
    expect(c[19].rz).toBeGreaterThan(0);
  });
  it('curls more the further it tears, and lifts with the pointer, without flipping over', () => {
    const total = (p: number, lift = 0) => curlChain(p, 24, lift).reduce((a, s) => a + s.rz, 0);
    expect(total(0.8)).toBeGreaterThan(total(0.3));
    expect(total(0.6, 1)).toBeGreaterThan(total(0.6, -1));
    expect(total(1, 1)).toBeLessThan(130);
    expect(Math.max(...curlChain(1, 24, 1).map(s => s.rz))).toBeLessThan(25); // no hard kinks between segments
  });
  it('has a jagged, seeded edge that the flap and the body share', () => {
    const a = tearEdge('swsh7'), b = tearEdge('swsh7');
    expect(a.front).toEqual(b.front);
    expect(a.front.length).toBe(129);
    expect(a.front[0][0]).toBe(0);
    expect(a.front[a.front.length - 1][0]).toBeCloseTo(PACK_W);
    const ys = a.front.map(p => p[1]);
    expect(Math.max(...ys)).toBeLessThanOrEqual(STRIP_H);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(2);
    expect(Math.abs(ys[0] - TEAR_Y)).toBeLessThan(0.01);
    // the back panel tears a little higher: the mouth has a height
    expect(a.back.every((p, i) => p[1] < a.front[i][1] + 0.6)).toBe(true);
    const s = tearShapes('swsh7');
    expect(s.bodyClip.startsWith('polygon(')).toBe(true);
    expect(s.flap.startsWith('M0 0')).toBe(true);
  });
});

describe('the leak glow', () => {
  it('is dark when sealed and grows with the tear and the size of the hit', () => {
    expect(leakGlow(0, 1).alpha).toBe(0);
    expect(leakGlow(0.8, 0.5).alpha).toBeGreaterThan(leakGlow(0.3, 0.5).alpha);
    expect(leakGlow(0.8, 1).sy).toBeGreaterThan(leakGlow(0.8, 0.1).sy);
    expect(leakGlow(1, 0.2).rays).toBe(0);
    expect(leakGlow(1, 1).rays).toBeGreaterThan(0.5);
  });
});

describe('rarity auras', () => {
  const card = (tier: string, extra: Partial<PackCard> = {}): PackCard => ({ id: 'x', name: 'x', rarity: '', tier, slot: 'rare', shiny: false, isNew: false, image: '', ...extra });
  it('maps each tier to its aura', () => {
    expect(auraOf(card('common')).level).toBe('none');
    expect(auraOf(card('uncommon')).level).toBe('soft');
    expect(auraOf(card('rare')).level).toBe('soft');
    expect(auraOf(card('rare-holo')).level).toBe('cool');
    expect(auraOf(card('rare-ultra')).level).toBe('strong');
    expect(auraOf(card('special-illustration-rare')).level).toBe('strong');
    expect(auraOf(card('rare-rainbow')).level).toBe('prismatic');
    expect(auraOf(card('rare-secret')).level).toBe('gold');
    expect(auraOf(card('hyper-rare')).level).toBe('gold');
    expect(auraLevel('plain', 3)).toBe('strong');
  });
  it('gets stronger with rarity; only the top tiers get rays and prismatic colour', () => {
    const order = ['common', 'uncommon', 'rare-holo', 'rare-ultra', 'rare-secret'].map(t => auraOf(card(t)));
    for (let i = 1; i < order.length; i++) expect(order[i].intensity).toBeGreaterThan(order[i - 1].intensity);
    expect(order[0].intensity).toBeLessThan(0.1);
    expect(order[0].particles).toBe(0);
    expect(order.slice(0, 4).some(a => a.rays)).toBe(false);
    expect(order[4].rays).toBe(true);
    expect(auraOf(card('rare-rainbow')).prismatic).toBe(true);
    expect(auraOf(card('rare-secret')).prismatic).toBe(false);
  });
  it('a shiny roll brightens the aura', () => {
    const plain = auraOf(card('rare-holo')), shiny = auraOf(card('rare-holo', { shiny: true }));
    expect(shiny.intensity).toBeGreaterThan(plain.intensity);
    expect(shiny.particles).toBeGreaterThan(plain.particles);
  });
});

describe('shaking a card', () => {
  const run = (s: CardShake, secs: number, f?: (t: number) => void) => { let pose = s.step(0); for (let t = 0; t < secs; t += 1 / 60) { f?.(t); pose = s.step(1 / 60); } return pose; };
  it('follows the pointer with inertia, and springs home on release', () => {
    const s = new CardShake();
    s.grab(); s.drag(100, 0);
    const early = s.step(1 / 60);
    expect(early.x).toBeGreaterThan(0);
    expect(early.x).toBeLessThan(50); // it lags
    run(s, 1);
    expect(s.x).toBeCloseTo(100, 0);
    s.release();
    run(s, 2.5);
    expect(s.resting).toBe(true);
  });
  it('builds energy when shaken, not when held still, and it decays', () => {
    const still = new CardShake(); still.grab(); still.drag(40, 0);
    expect(run(still, 1).energy).toBeLessThan(0.05);
    const shaken = new CardShake(); shaken.grab();
    const e = run(shaken, 1, t => shaken.drag(Math.sin(t * 30) * 120, Math.cos(t * 23) * 50)).energy;
    expect(e).toBeGreaterThan(0.5);
    shaken.release();
    expect(run(shaken, 2).energy).toBeLessThan(e * 0.2);
  });
  it('tilts with its velocity and flings only when thrown off the side', () => {
    const s = new CardShake(); s.grab(); s.drag(300, 0);
    const pose = s.step(1 / 30);
    expect(pose.ry).toBeGreaterThan(0);
    expect(new CardShake().flingOnRelease(200)).toBe(0);
    run(s, 1);
    expect(s.flingOnRelease(200)).toBe(1);
  });
  it('moves less under reduced motion', () => {
    const s = new CardShake(0.3); s.grab(); s.drag(100, 0); run(s, 1);
    expect(s.x).toBeCloseTo(30, 0);
  });
});


describe('the cut exists only behind the pointer (pack v3)', () => {
  const tornSegs = (p: number, n = 28) => curlChain(p, n).reduce((a, s) => a + s.torn, 0) / n;
  const cutLen = (p: number, dir: -1 | 1) => { const [a, b] = cutSpan(p, dir); return b - a; };

  it('the visible cut length equals the pointer progress while dragging, both ways and both directions', () => {
    for (const dir of [1, -1] as const) {
      const m = new TearModel(); m.ready = false;
      const x0 = dir > 0 ? L + 2 : L + W - 2;
      m.begin(x0, L, W);
      const path = [0.1, 0.3, 0.55, 0.8, 0.6, 0.35, 0.15, 0.45, 0.05];
      for (const f of path) {
        m.move(dir > 0 ? L + f * W : L + W - f * W); settle(m, 0.35);
        expect(m.progress).toBeCloseTo(f, 2);           // the tear front sits on the pointer (a light spring)
        expect(cutLen(m.progress, dir)).toBeCloseTo(f, 2);  // the rim, the mouth and the light: exactly that long
        expect(tornSegs(m.progress)).toBeCloseTo(f, 2);     // the peeled strip: exactly that much of it
        const [a, b] = cutSpan(m.progress, dir);
        if (dir > 0) { expect(a).toBe(0); expect(b).toBeCloseTo(f, 2); } else { expect(b).toBe(1); expect(a).toBeCloseTo(1 - f, 2); }
      }
    }
  });

  it('mends: dragging back seals the columns ahead of the pointer again, none stay cut', () => {
    const n = 28;
    const open = curlChain(0.8, n), back = curlChain(0.25, n);
    const cut = (c: ReturnType<typeof curlChain>) => c.filter(s => s.torn > 0).length;
    expect(cut(open)).toBeGreaterThan(cut(back));
    expect(cut(back)).toBe(Math.ceil(0.25 * n));
    // the sealed columns carry no bend at all: nothing ahead of the tear front is lifted or pre-cut
    back.filter(s => s.torn === 0).forEach(s => { expect(s.rz).toBe(0); expect(s.ry).toBe(0); });
    expect(cutLen(0, 1)).toBe(0);
  });

  it('nothing on the wrapper pre-draws the cut (no perforation line across the pack)', () => {
    const svg = wrapperSVG({ id: 'base1', name: 'Base Set' }, '', 10);
    expect(svg).not.toContain('pk-w-perf');
    expect(svg).not.toContain('stroke-dasharray');
  });
});

describe('holding a hit (pack v3)', () => {
  it('a short press on a hit keeps it (lift, shake); commons, taps off the card and reduced motion move on', () => {
    expect(tapAdvances(2, true, false)).toBe(false);
    expect(tapAdvances(5, true, false)).toBe(false);
    expect(tapAdvances(1, true, false)).toBe(true);
    expect(tapAdvances(4, false, false)).toBe(true);
    expect(tapAdvances(4, true, true)).toBe(true);
  });
  it('shaking builds energy past the peak, calm lets it fall back under the re-arm level', () => {
    const sh = new CardShake(1); sh.grab();
    let peak = 0;
    for (let i = 0; i < 180; i++) { sh.drag(Math.sin(i * 0.9) * 140, Math.cos(i * 1.3) * 60); peak = Math.max(peak, sh.step(1 / 60).energy); }
    expect(peak).toBeGreaterThan(0.8);
    for (let i = 0; i < 180; i++) sh.step(1 / 60);
    expect(sh.energy).toBeLessThan(0.4);
  });
});

describe('reveal escalation by tier (pack v4)', () => {
  const mk = (fx: PackCard['fx'], hit: number, shiny = false): PackCard => ({ id: 'x', name: 'X', rarity: 'R', tier: 'rare', slot: 's', shiny, isNew: false, image: '', fx, hit });
  it('commons and low tiers stay calm and quick; mid tiers get some; the top tiers get everything', () => {
    const plain = revealFx(mk('plain', 0)), rev = revealFx(mk('reverse', 1)), holo = revealFx(mk('holo', 2)), full = revealFx(mk('full-art', 3));
    for (const c of [plain, rev]) { expect(c.tier).toBe('calm'); expect(c.leak || c.rays || c.floor || c.bloom).toBe(false); expect(c.rings + c.shards + c.slowmoMs).toBe(0); expect(c.idleSparks).toBe(0); }
    expect(holo.tier).toBe('mid'); expect(full.tier).toBe('mid');
    for (const fx of ['radiant', 'shiny', 'alt-art', 'rainbow', 'gold'] as const) {
      const t = revealFx(mk(fx, fx === 'gold' ? 5 : 4));
      expect(t.tier).toBe('top');
      expect(t.rays && t.breathe && t.floor && t.leak).toBe(true);
      expect(t.idleSparks).toBeGreaterThan(holo.idleSparks);
      expect(t.shards).toBeGreaterThan(full.shards);
      expect(t.rings).toBeGreaterThan(full.rings);
      expect(t.slowmoMs).toBeGreaterThan(0);
    }
    expect(revealFx(mk('gold', 5)).flecks).toBe(true);
    expect(revealFx(mk('gold', 5)).bloom).toBe(true);
    expect(revealFx(mk('alt-art', 4)).bloom).toBe(true); // SIR
    expect(revealFx(mk('rainbow', 4)).prism).toBe(true);
    expect(revealFx(mk('holo', 2)).bloom).toBe(false);
  });
});
