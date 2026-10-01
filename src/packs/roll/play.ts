// playRoll: the reel over the pack scene, from the first frame to the landing (docs/PACK_ROLL.md). It never holds
// the tear: the canvas takes no input, and any touch, key or `interrupt` resolves `settled` in the same tick.
import { MYSTERY_SET } from '../wrapper';
import type { SetInfo } from '../types';
import { ReelModel, type ReelConfig, type ReelEvent } from './reel';
import { RAYS_MS, Renderer, oneIn, type Geometry } from './render';
import { Strip } from './strip';
import { TileCache, asSetInfo } from './tiles';
import { injectRollStyles } from './styles';
import { type RollClock, type RollOptions, type RollOutcome, type RollSet, type RollSoundDetail, type RollSoundEvent } from './types';

export interface RollHandle {
  /** resolves when the reel lands, or at once on an interrupt (or the host failing) */
  settled: Promise<RollOutcome>;
  /** the player grabbed the pack: snap (or vanish) now */
  interrupt(): void;
  destroy(): void;
  /** the motion model, once the sets are known (tests, captures) */
  readonly model: ReelModel | null;
}

/** the exit after a landing: hold, then the neighbours slide away and the centre dissolves into the pack */
export const EXIT = { hold: 30, ms: 170 };
/** how long a vintage landing's rays burn (render.ts), and the odds slam's whole life */
export const FANFARE_MS = RAYS_MS;
const STAMP_MS = 1150;
const INTERRUPT_MS = 110, FAIL_MS = 150;
const IGNORE_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock']);

const defaultClock = (): RollClock => ({
  now: () => performance.now(),
  raf: (f) => requestAnimationFrame(f),
  caf: (id) => cancelAnimationFrame(id),
});

function startSet(s: SetInfo | undefined): RollSet {
  const x = s ?? MYSTERY_SET;
  return { id: x.id, name: x.name, series: x.series, packSize: x.packSize, art: x.art, hero: x.hero, chance: 0, oneIn: null };
}

export function playRoll(container: HTMLElement, opts: RollOptions & { config?: Partial<ReelConfig> }): RollHandle {
  injectRollStyles();
  const clock = opts.clock ?? defaultClock();
  const t0 = clock.now();
  const reduced = opts.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const seed = opts.seed ?? ((Math.random() * 2 ** 31) | 0);
  const start = startSet(opts.start);

  let model: ReelModel | null = null;
  let sets: RollSet[] = [];
  let tStart = 0;
  let raf = 0;
  let settledDone = false;
  let dead = false;
  let result: { set: RollSet; oneIn: number | null } | null = null;
  let cv: HTMLCanvasElement | null = null;
  let renderer: Renderer | null = null;
  let tiles: TileCache | null = null;
  let stamp: HTMLElement | null = null;
  let stampT = 0;
  const hidden: HTMLElement[] = [];
  const offs: (() => void)[] = [];

  let resolveSettled!: (o: RollOutcome) => void;
  const settled = new Promise<RollOutcome>((r) => { resolveSettled = r; });

  const emit = (event: RollSoundEvent, detail: RollSoundDetail = {}) => {
    try { opts.sound?.(event, detail); } catch (e) { console.error(e); }
    try { container.dispatchEvent(new CustomEvent('pk-roll-sound', { detail: { event, ...detail } })); } catch { /* no CustomEvent */ }
  };

  const settle = (set: string | null, interrupted: boolean) => {
    if (settledDone) return;
    settledDone = true;
    // a landing keeps the pack hidden until the landed wrapper has grown into its box (frame(), unhideAt); an
    // interrupt or a failure shows it at once
    if (interrupted || !cv || unhideAt < 0) unhide();
    const o: RollOutcome = { set, interrupted, ms: Math.round(clock.now() - t0) };
    try { opts.onSettle?.(o); } catch (e) { console.error(e); }
    resolveSettled(o);
  };

  const unhide = () => { for (const h of hidden) h.classList.remove('pkr-hidden'); hidden.length = 0; };

  // ---------------------------------------------------------------- geometry
  const measure = (): Geometry => {
    const R = container.getBoundingClientRect();
    const w = R.width || container.clientWidth || 1, h = R.height || container.clientHeight || 1;
    const a = opts.anchor;
    if (a && a.offsetWidth > 0 && a.offsetHeight > 0) {
      // the pack's layout box, ignoring its transforms (the idle bob, the tilt, an entrance animation): walk the
      // offset chain up to the container
      let x = 0, y = 0, e: HTMLElement | null = a;
      while (e && e !== container) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent as HTMLElement | null; }
      const tw = a.offsetWidth, th = a.offsetHeight;
      if (e === container) return { w, h, cx: x + tw / 2, cy: y + th / 2, tw, th };
      const r = a.getBoundingClientRect();
      return { w, h, cx: r.left - R.left + r.width / 2, cy: r.top - R.top + r.height / 2, tw, th };
    }
    const tw = Math.min(250, w * 0.55);
    return { w, h, cx: w / 2, cy: h / 2, tw, th: tw * 1.6 };
  };
  /** the canvas's backing scale: the device's, capped at 1.5 (a moving reel of pixel-art wrappers loses nothing
   *  visible, and a 2x backing store is 1.8x the pixels to fill every frame; the landed tile dissolves into the
   *  real, crisp pack) */
  const dpr = () => Math.min(1.5, Math.max(1, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1));

  // ---------------------------------------------------------------- the reel
  /**
   * The reel starts at once, whether or not the sets list is in: until it is (pokeshell pack sets can take ~4 s cold),
   * the strip is mystery foils, which is honest (we don't know the draw yet). When the list lands, tiles beyond the
   * visible edge come from the real, chance-weighted strip; the ones already on screen never change.
   */
  const begin = () => {
    if (dead || settledDone || model) return;
    model = new ReelModel(new Strip([{ ...start, chance: 1 }], seed), start, reduced, opts.config);
    tStart = clock.now();
    if (!opts.headless && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      const ctx = typeof c.getContext === 'function' ? (() => { try { return c.getContext('2d'); } catch { return null; } })() : null;
      if (ctx) {
        cv = c; cv.className = 'pkr-canvas';
        const geo = measure(), k = dpr();
        tiles = new TileCache(Math.min(480, Math.round(geo.tw * k)), opts.imageBase ?? '');
        tiles.prime([start]);
        renderer = new Renderer(cv, tiles, reduced, model.cfg.fade);
        renderer.resize(geo, k);
        container.appendChild(cv);
        const onResize = () => { if (renderer) renderer.resize(measure(), dpr()); };
        onResizeRef = onResize;
        window.addEventListener('resize', onResize);
        offs.push(() => window.removeEventListener('resize', onResize));
        // hide the pack under the reel (reduced motion keeps the scene's own "rolling a pack" ribbon)
        for (const h of opts.hide ?? []) if (h && !(reduced && h.classList.contains('pk-packtag'))) { h.classList.add('pkr-hidden'); hidden.push(h); }
      }
    }
    raf = clock.raf(frame);
  };
  let onResizeRef: (() => void) | null = null;
  let unhideAt = -1;
  let frameN = 0;

  /** the sets list is in: the draw becomes real from the next unseen tile on */
  const useSets = (list: RollSet[]) => {
    if (dead || !list.length) return;
    sets = list;
    const strip = new Strip(list, seed);
    if (!strip.pool.length) return;
    tiles?.prime(strip.pool);
    if (model) model.useStrip(strip);
    // a result that came before the list: give its landing tile the set's art
    if (result) {
      const full = list.find((s) => s.id === result!.set.id);
      if (full) { result.set = full; model?.upgradeLanding(full); }
    }
  };

  const handle = (ev: ReelEvent[], t: number) => {
    for (const e of ev) {
      switch (e.type) {
        case 'start': if (!reduced) emit('roll:start'); break;
        case 'tick':
          renderer?.tick(e.speed ?? 0);
          emit('roll:tick', { index: e.index, speed: e.speed, rare: e.rare, gold: !!model?.landing?.rare });
          break;
        case 'lock': emit('roll:lock', { set: e.set?.id, oneIn: model?.landing?.oneIn ?? null, rare: e.rare }); break;
        case 'tease': emit('roll:tease', { set: e.set?.id, oneIn: model?.landing?.oneIn ?? null }); break;
        case 'land': {
          const L = model!.landing!;
          renderer?.land(t, L.rare);
          renderer?.leave(t + EXIT.hold, EXIT.ms);
          if (renderer) unhideAt = t + EXIT.hold + EXIT.ms * 0.55;
          emit('roll:land', { set: L.set.id, oneIn: L.oneIn, rare: L.rare, interrupted: false });
          if (L.rare) { emit('roll:fanfare', { set: L.set.id, oneIn: L.oneIn }); showStamp(L.set, L.oneIn); }
          settle(L.set.id, false);
          break;
        }
        default: break;
      }
    }
  };

  const frame = () => {
    if (dead) return;
    const t = clock.now() - tStart;
    if (model) handle(model.update(t), t);
    if (unhideAt >= 0 && t >= unhideAt) { unhideAt = -1; unhide(); }
    // the scene may lay the pack out late (fonts, --pw): re-measure its box now and then (layout reads only)
    if (renderer && (++frameN % 20 === 0)) onResizeRef?.();
    if (renderer && model) {
      renderer.draw(t, model);
      if (renderer.gone(t)) { removeCanvas(); }
    }
    if (stamp && clock.now() - stampT > STAMP_MS + 50) { stamp.remove(); stamp = null; }
    const more = (!!model && model.active) || !!cv || !!stamp;
    if (more) raf = clock.raf(frame); else raf = 0;
  };

  const kick = () => { if (!raf && !dead) raf = clock.raf(frame); };

  const removeCanvas = () => {
    cv?.remove(); cv = null; renderer = null;
    tiles?.destroy(); tiles = null;
  };

  const showStamp = (set: RollSet, n: number | null) => {
    if (typeof document === 'undefined' || opts.headless) return;
    const geo = measure();
    const txt = oneIn(n).replace(/^1 in /, '');
    if (!txt) return;
    const s = document.createElement('div');
    s.className = `pkr-stamp${reduced ? ' is-reduced' : ''}`;
    s.style.top = `${geo.cy - geo.th * 0.02}px`;
    s.setAttribute('role', 'status');
    const small = document.createElement('small'); small.textContent = '1 in';
    const b = document.createElement('b'); b.textContent = txt;
    const sp = document.createElement('span'); sp.textContent = `${asSetInfo(set).name} · a vintage pack`;
    s.append(small, b, sp);
    container.appendChild(s);
    stamp = s; stampT = clock.now();
  };

  // ---------------------------------------------------------------- inputs
  const interrupt = () => {
    if (dead) return;
    // landed, still growing into the pack: a touch shows the real pack now
    if (settledDone) { unhideAt = -1; unhide(); return; }
    const t = clock.now() - tStart;
    if (model && model.active) {
      const ev = model.interrupt(t);
      const e = ev[0];
      emit('roll:interrupt', { snapped: !!e?.snapped, set: e?.set?.id });
      renderer?.leave(t, INTERRUPT_MS);
      settle(e?.snapped ? e.set!.id : null, true);
      kick();
      return;
    }
    // not spinning (already stopped): nothing to snap
    emit('roll:interrupt', { snapped: false });
    settle(null, true);
  };

  const target = opts.interruptOn === undefined ? container : opts.interruptOn;
  if (target) {
    const down = (e: Event) => {
      const el = e.target as Element | null;
      if (el && typeof el.closest === 'function' && el.closest('button, .pk-hud, [data-roll-ignore]')) return;
      interrupt();
    };
    const key = (e: Event) => { const k = (e as KeyboardEvent).key; if (!IGNORE_KEYS.has(k)) interrupt(); };
    target.addEventListener('pointerdown', down, true);
    target.addEventListener('keydown', key, true);
    offs.push(() => { target.removeEventListener('pointerdown', down, true); target.removeEventListener('keydown', key, true); });
  }
  if (opts.interrupt) {
    const i = opts.interrupt as AbortSignal | Promise<unknown>;
    if ('aborted' in i) {
      if (i.aborted) queueMicrotask(interrupt);
      else { const f = () => interrupt(); i.addEventListener('abort', f); offs.push(() => i.removeEventListener('abort', f)); }
    } else void Promise.resolve(i).then(interrupt, interrupt);
  }

  // ---------------------------------------------------------------- the host's answer
  opts.result.then((r) => {
    if (dead) return;
    const set = sets.find((s) => s.id === r.set)
      ?? { id: r.set, name: r.setName ?? r.set, chance: 0, oneIn: r.oneIn ?? null };
    result = { set, oneIn: r.oneIn ?? set.oneIn ?? null };
    if (settledDone) return;
    if (model) { model.resolve(set, result.oneIn, clock.now() - tStart); kick(); }
    else settle(r.set, false); // no reel on screen: nothing to wait for
  }, () => {
    if (dead) return;
    if (model) { model.fail(clock.now() - tStart); renderer?.leave(clock.now() - tStart, FAIL_MS); kick(); }
    settle(null, false);
  });

  // ---------------------------------------------------------------- the sets
  begin();
  if (Array.isArray(opts.sets)) useSets(opts.sets);
  else void Promise.resolve(opts.sets).then((l) => useSets(l ?? []), () => { /* keep the mystery strip */ });

  return {
    settled,
    interrupt,
    get model() { return model; },
    destroy() {
      if (dead) return;
      if (!settledDone) settle(model?.landing?.set.id ?? null, true);
      dead = true;
      if (raf) clock.caf(raf);
      offs.forEach((f) => f());
      removeCanvas();
      stamp?.remove(); stamp = null;
      unhide();
    },
  };
}

