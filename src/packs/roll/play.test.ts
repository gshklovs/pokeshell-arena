// @vitest-environment happy-dom
// playRoll over a stand-in scene, on a hand-driven clock: it lands on the rolled set, an interrupt resolves in the
// same tick, a slow host just loops, and the touch that interrupts still reaches the scene underneath.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { playRoll } from './play';
import { attachRollToScene } from './attach';
import type { RollClock, RolledSet, RollSet, RollSoundEvent } from './types';

const SETS: RollSet[] = [
  { id: 'swsh9', name: 'Brilliant Stars', chance: 0.6, oneIn: 1.7 },
  { id: 'swsh7', name: 'Evolving Skies', chance: 0.38, oneIn: 2.6 },
  { id: 'base1', name: 'Base', chance: 0.02, oneIn: 50 },
];

function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

/** a manual clock: frames only run when the test advances time */
function fakeClock() {
  let now = 0, id = 0;
  const q = new Map<number, FrameRequestCallback>();
  const clock: RollClock = { now: () => now, raf: (f) => { q.set(++id, f); return id; }, caf: (i) => { q.delete(i); } };
  const advance = (ms: number) => {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 1000 / 60);
      const fs = [...q.values()]; q.clear();
      fs.forEach((f) => f(now));
    }
  };
  return { clock, advance, pending: () => q.size };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeAll(() => {
  // no 2D canvas in happy-dom: a context whose every method is a no-op
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
});

let host: HTMLElement;
function scene() {
  host = document.createElement('div');
  host.innerHTML = '<div class="pk-scene"><div class="pk-stage"><div class="pk-pack"><div class="pk-pack__float"></div><div class="pk-packtag"></div></div></div><div class="pk-hud"><button class="pk-btn">Skip</button></div></div>';
  document.body.appendChild(host);
  return host.querySelector<HTMLElement>('.pk-scene')!;
}
afterEach(() => host?.remove());

describe('playRoll', () => {
  it('lands on the rolled set, fires its sound events, and cleans up after itself', async () => {
    const root = scene();
    const { clock, advance, pending } = fakeClock();
    const result = deferred<RolledSet>();
    const sounds: RollSoundEvent[] = [];
    const r = attachRollToScene(root, { sets: SETS, result: result.promise, clock, seed: 3, sound: (e) => sounds.push(e) });
    expect(root.querySelector('.pkr-canvas')).not.toBeNull();
    expect(root.querySelector('.pk-pack__float')!.classList.contains('pkr-hidden')).toBe(true);
    advance(900);
    result.resolve({ set: 'swsh7', oneIn: 2.6 });
    await flush();
    advance(1000);
    const o = await r.settled;
    expect(o).toMatchObject({ set: 'swsh7', interrupted: false });
    expect(r.model!.setAt(Math.round(r.model!.x))!.id).toBe('swsh7');
    expect(root.querySelector('.pk-pack__float')!.classList.contains('pkr-hidden')).toBe(false);
    expect(sounds).toContain('roll:start');
    expect(sounds).toContain('roll:tick');
    expect(sounds).toContain('roll:lock');
    expect(sounds).toContain('roll:land');
    expect(sounds).not.toContain('roll:fanfare');
    advance(1000);
    expect(root.querySelector('.pkr-canvas')).toBeNull();
    expect(pending()).toBe(0);
    r.destroy();
  });

  it('a vintage landing gets the fanfare and the "1 in N" slam', async () => {
    const root = scene();
    const { clock, advance } = fakeClock();
    const sounds: RollSoundEvent[] = [];
    const r = attachRollToScene(root, { sets: SETS, result: Promise.resolve({ set: 'base1', oneIn: 60.7 }), clock, sound: (e) => sounds.push(e) });
    await flush();
    advance(1000);
    expect((await r.settled).set).toBe('base1');
    expect(sounds).toEqual(expect.arrayContaining(['roll:tease', 'roll:land', 'roll:fanfare']));
    const stamp = root.querySelector('.pkr-stamp')!;
    expect(stamp.textContent).toContain('61');
    expect(stamp.textContent).toContain('Base Set');
    r.destroy();
    expect(root.querySelector('.pkr-stamp')).toBeNull();
  });

  it('a touch interrupts in the same tick: settled resolves at once with the rolled set, and the touch still reaches the scene', async () => {
    const root = scene();
    const { clock, advance } = fakeClock();
    const result = deferred<RolledSet>();
    const r = attachRollToScene(root, { sets: SETS, result: result.promise, clock });
    advance(700);
    result.resolve({ set: 'swsh9', oneIn: 1.7 });
    await flush();
    advance(50); // locked, settling
    let settledAt = -1;
    void r.settled.then(() => { settledAt = clock.now(); });
    let sceneSaw = 0;
    root.addEventListener('pointerdown', () => sceneSaw++);
    const at = clock.now();
    root.querySelector('.pk-pack')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(sceneSaw).toBe(1); // the canvas takes no input: the tear starts as usual
    expect(r.model!.phase).toBe('interrupted');
    expect(root.querySelector('.pk-pack__float')!.classList.contains('pkr-hidden')).toBe(false);
    const o = await r.settled;
    expect(settledAt).toBe(at); // no frame had to pass
    expect(o).toMatchObject({ set: 'swsh9', interrupted: true });
    advance(400);
    expect(root.querySelector('.pkr-canvas')).toBeNull();
    r.destroy();
  });

  it('an interrupt before the result resolves with no set (the scene re-skins the mystery pack later)', async () => {
    const root = scene();
    const { clock, advance } = fakeClock();
    const ac = new AbortController();
    const r = playRoll(root, { sets: SETS, result: new Promise<RolledSet>(() => {}), clock, interrupt: ac.signal });
    advance(500);
    ac.abort();
    expect(await r.settled).toMatchObject({ set: null, interrupted: true });
    r.destroy();
  });

  it('the HUD buttons (mute) do not interrupt; a key does', async () => {
    const root = scene();
    const { clock, advance } = fakeClock();
    const r = attachRollToScene(root, { sets: SETS, result: new Promise<RolledSet>(() => {}), clock });
    advance(300);
    root.querySelector('.pk-btn')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(r.model!.active).toBe(true);
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
    expect(r.model!.active).toBe(true);
    root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(r.model!.active).toBe(false);
    r.destroy();
  });

  it('a slow host just keeps it spinning (elastic): 5 s later it still lands 0.42 s after the answer', async () => {
    const root = scene();
    const { clock, advance } = fakeClock();
    const result = deferred<RolledSet>();
    let settled = false;
    const r = attachRollToScene(root, { sets: SETS, result: result.promise, clock, onSettle: () => { settled = true; } });
    advance(5000);
    expect(settled).toBe(false);
    expect(r.model!.phase).toBe('spinning');
    result.resolve({ set: 'swsh7', oneIn: 2.6 });
    await flush();
    const t = clock.now();
    advance(1200);
    const o = await r.settled;
    expect(o.set).toBe('swsh7');
    expect(o.ms - t).toBeLessThanOrEqual(520);
    r.destroy();
  });

  it('never waits for the sets list: it spins at once and still lands on the rolled set when the list is late', async () => {
    const root = scene();
    const { clock, advance } = fakeClock();
    const list = deferred<RollSet[]>();
    const r = attachRollToScene(root, { sets: list.promise, result: Promise.resolve({ set: 'swsh7', setName: 'Evolving Skies', oneIn: 2.6 }), clock });
    expect(root.querySelector('.pkr-canvas')).not.toBeNull();
    await flush();
    advance(300);
    list.resolve(SETS); // arrives mid-settle: the landing tile gains the set's data, keeps its place
    await flush();
    advance(1500);
    expect((await r.settled).set).toBe('swsh7');
    expect(r.model!.landing!.set.chance).toBeCloseTo(0.38);
    r.destroy();
  });

  it('a host error fades the reel and settles with no set', async () => {
    const root = scene();
    const { clock, advance } = fakeClock();
    const result = deferred<RolledSet>();
    const r = attachRollToScene(root, { sets: SETS, result: result.promise, clock });
    advance(300);
    result.reject({ status: 402 });
    await flush();
    expect(await r.settled).toMatchObject({ set: null, interrupted: false });
    advance(600);
    expect(root.querySelector('.pkr-canvas')).toBeNull();
    r.destroy();
  });
});
