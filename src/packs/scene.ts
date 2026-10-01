// The opening, as a state machine: idle -> tear -> stack + fan -> reveal each card -> summary (docs/PACK_OPENING.md).
import type { OpenPackOptions, PackCard, PackResult, PackScene, Phase, Reskin, SetInfo } from './types';
import { FX_COLOR, auraOf, fxLabel, hitOf, revealClass, type Aura } from './tiers';
import { PackAudio } from './audio';
import { Particles } from './particles';
import { makeCard, type CardView } from './card';
import { PACK_H, PACK_W, STRIP_H, TEAR_Y, rng, tearShapes, wrapperId, wrapperSVG } from './wrapper';
import { TearModel, curlChain, cutSpan, leakGlow } from './tear';
import { CardShake } from './shake';
import { leakSVG, rayField } from './leak';
import { injectStyles } from './styles';

const SHAKE = [0, 0, 1, 2, 3.5, 5];
/**
 * Does a plain mouse tap on the pack tear it open? The spec: "only when crossing the right end of the pack does the
 * pack actually pop open", so no: a tap pulses the "drag across the top" hint. Keyboard (Space / Enter / Right), the
 * reduced-motion "Open the pack" button and a touch long-press still open it by themselves (accessibility).
 */
export const TAP_OPENS = false;
/** a touch held this long (without moving) opens the pack by itself */
const LONG_PRESS_MS = 450;
/** a revealed card this big (hit >= 2: holo and up) is one to hold: a tap on it never sends it away */
const HOLD_HIT = 2;
/** shake to reveal: the shake energy that flips a face-down hit by itself, and what letting go needs to flip it */
export const SHAKE_FLIP_EN = 0.85, SHAKE_RELEASE_EN = 0.45;
/** is a face-down hit shaken enough to flip? on a frame it takes the full peak; on letting go, a good shake */
export function shakeFlips(energy: number, on: 'frame' | 'release'): boolean { return energy >= (on === 'frame' ? SHAKE_FLIP_EN : SHAKE_RELEASE_EN); }
/** the reveal charge: builds with the shake energy while held (full after about a second of hard shaking), drains
 * slowly while held still and quickly once let go */
export function shakeCharge(charge: number, energy: number, held: boolean, dt: number): number {
  const up = held ? Math.min(1, energy * 1.3) : 0;
  return Math.max(0, Math.min(1, charge + (up - (held ? 0.12 : 0.6)) * dt));
}
/** which reveals are shaken open (face down, holo and up), and which are held open instead (reduced motion) */
export function revealBy(hit: number, reduced: boolean): 'shake' | 'hold' | 'tap' {
  if (hit < HOLD_HIT) return 'tap';
  return reduced ? 'hold' : 'shake';
}
/** does a short press send this revealed card away? Not on a hit you pressed (it lifts, to be shaken); yes otherwise */
export function tapAdvances(hit: number, onCard: boolean, reduced: boolean): boolean { return reduced || hit < HOLD_HIT || !onCard; }
const SHOOK_KEY = 'pokeshell-arena-packs-shook';
/** has this player shaken a card before? (then the "grab & shake it" hint stays away) */
function hasShaken(): boolean { try { return localStorage.getItem(SHOOK_KEY) === '1'; } catch { return false; } }
function markShaken() { try { localStorage.setItem(SHOOK_KEY, '1'); } catch { /* private window: the hint comes back */ } }
/** segments of the peeling strip: enough for a smooth curl, few enough to move 60 times a second */
const SEGS = 28;
/** how far each segment's face reaches into its neighbours (a fraction of a segment) */
const EXT = 0.25;
let UID = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string) {
  const e = document.createElement(tag); e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const noise = (t: number) => Math.sin(t * 13.1) * 0.5 + Math.sin(t * 29.7 + 1.3) * 0.3 + Math.sin(t * 51.3 + 2.1) * 0.2;
const RAD = Math.PI / 180;

class Cancel extends Error {}

interface Seg { el: HTMLElement; spec: HTMLElement; shade: HTMLElement; edge: HTMLElement; last: string; lastSpec: number; lastShade: number; lastEdge: string }

export class Scene implements PackScene {
  done: Promise<PackResult>;
  private resolveDone!: (r: PackResult) => void;
  private rejectDone!: (e: unknown) => void;
  private root: HTMLElement;
  private stage!: HTMLElement;
  private pack!: HTMLElement;
  private flap!: HTMLElement;
  private glow!: HTMLElement;
  private beams!: HTMLElement;
  private bloom!: HTMLElement;
  private rim!: SVGSVGElement;
  private rimClip!: SVGRectElement;
  private rimLine!: SVGLinearGradientElement;
  private rimLight!: SVGPathElement;
  private rimShadow!: SVGRectElement;
  private rimCore!: SVGGElement;
  private head!: HTMLElement;
  private deck!: HTMLElement;
  private pile!: HTMLElement;
  private ribbon!: HTMLElement;
  private prompt!: HTMLElement;
  private pips!: HTMLElement;
  private rays!: HTMLElement;
  private flash!: HTMLElement;
  private ring!: HTMLElement;
  private skipBtn!: HTMLButtonElement;
  private audio: PackAudio;
  private fx!: Particles;
  private set: SetInfo;
  private reduced: boolean;
  private imageBase: string;
  private result: PackResult | null = null;
  private fetching: Promise<PackResult> | null = null;
  private views: CardView[] = [];
  private maxHit = 0;
  private phase: Phase = 'idle';
  private fast = false;
  private jumped = false;
  private destroyed = false;
  private raf = 0;
  private t0 = performance.now();
  private lastFrame = 0;
  // the tear
  private tear = new TearModel();
  private shapes!: ReturnType<typeof tearShapes>;
  private segs: Seg[] = [];
  private chainDir: 1 | -1 = 1;
  private jitter: number[] = [];
  private lift = 0; private liftTarget = 0;
  private leakI = 0.3;
  private leakAura: Aura | null = null;
  private lastShown = -1;
  private sparkAcc = 0;
  private flapFree: { x: number; y: number; vx: number; vy: number; r: number; vr: number; t: number } | null = null;
  private shake = 0; private shakeKick = 0;
  private packTilt = { x: 0, y: 0, tx: 0, ty: 0 };
  private box = { left: 0, top: 0, width: 1, height: 1 };
  private body!: HTMLElement;
  /** the crisp light out of the tear (leak.ts): its rays, each shown only while its foot is inside the cut */
  private leak!: HTMLElement;
  private leakRays: { x: number; el: SVGElement; on: boolean }[] = [];
  private leakRaysG: SVGGElement | null = null;
  private lastRayScale = '';
  /** the sealed part of the strip, unclipped under the peeling one: no seam ahead of the tear front */
  private seal!: HTMLElement;
  private lastSeal = '';
  private float!: HTMLElement;
  private title!: HTMLElement;
  private tag!: HTMLElement;
  private rimEdge!: SVGPathElement;
  /** the tear gesture's commit, while it's listening: the pack arriving can finish a tear held at the far end */
  private finishTear: (() => void) | null = null;
  private wakers = new Set<() => void>();
  private listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];

  constructor(container: HTMLElement, private opts: OpenPackOptions) {
    injectStyles();
    this.done = new Promise((res, rej) => { this.resolveDone = res; this.rejectDone = rej; });
    this.set = typeof opts.set === 'string' ? { id: opts.set, name: opts.set } : opts.set;
    this.imageBase = opts.imageBase ?? '';
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false;
    this.reduced = opts.reducedMotion ?? mq;
    this.audio = new PackAudio(opts.sound !== false);
    this.root = el('div', `pk-scene${this.reduced ? ' pk-reduced' : ''}`);
    this.build();
    container.appendChild(this.root);
    this.fx = new Particles(this.root);
    this.fx.enabled = !this.reduced;
    this.layout();
    this.on(window, 'resize', () => { this.layout(); this.fx.resize(); });
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    this.run().catch(e => { if (!(e instanceof Cancel)) { console.error(e); this.rejectDone(e); } });
    if (opts.eager) void this.fetchOnce().catch(() => { /* rejects done: the host closes the scene */ });
  }

  // ------------------------------------------------------------------ plumbing
  private on(t: EventTarget, type: string, fn: EventListener, o?: AddEventListenerOptions) { t.addEventListener(type, fn, o); this.listeners.push([t, type, fn, o]); }
  private setPhase(p: Phase, detail?: { index?: number; card?: PackCard }) {
    this.phase = p; this.root.dataset.phase = p;
    this.opts.onPhase?.(p, detail);
  }
  private speed() { return this.fast ? 0.25 : 1; }
  /** a pause that skip / destroy cut short */
  private wait(ms: number) {
    if (this.destroyed) return Promise.reject(new Cancel());
    return new Promise<void>(res => {
      const wake = () => { clearTimeout(t); this.wakers.delete(wake); res(); };
      const t = setTimeout(wake, ms * this.speed());
      this.wakers.add(wake);
    }).then(() => { if (this.destroyed) throw new Cancel(); });
  }
  private wakeAll() { const w = [...this.wakers]; this.wakers.clear(); w.forEach(f => f()); }
  private check() { if (this.destroyed) throw new Cancel(); }

  private build() {
    const r = this.root;
    const c = this.paintSet();
    r.tabIndex = 0;
    if (this.set.art?.motif === 'mystery') r.classList.add('pk-mystery');
    el('div', 'pk-bg', r);
    this.rays = el('div', 'pk-rays', r);
    this.stage = el('div', 'pk-stage', r);
    // the light behind the pack while it tears
    this.bloom = el('div', 'pk-bloom', this.stage);
    // the pack
    this.pack = el('div', 'pk-pack', this.stage);
    const float = this.float = el('div', 'pk-pack__float', this.pack);
    const svg = wrapperSVG(this.set, this.set.hero ? this.imageBase + this.set.hero : '', this.set.packSize ?? 10);
    this.shapes = tearShapes(this.set.id);
    const tearPct = `${(TEAR_Y / PACK_H) * 100}%`;
    const bodyEl = this.body = el('div', 'pk-pack__body', float); bodyEl.innerHTML = svg; bodyEl.style.clipPath = this.shapes.bodyClip;
    this.seal = el('div', 'pk-pack__seal', float); this.seal.style.height = `${(STRIP_H / PACK_H) * 100}%`;
    this.glow = el('div', 'pk-pack__glow', float); this.glow.style.top = tearPct;
    this.beams = el('div', 'pk-pack__beams', float); this.beams.style.bottom = `${100 - (TEAR_Y / PACK_H) * 100}%`;
    this.leak = el('div', 'pk-leak-wrap', float);
    this.paintLeak();
    this.buildRim(float, c);
    el('div', 'pk-pack__glare', float).style.clipPath = this.shapes.bodyClip;
    this.flap = el('div', 'pk-pack__flap', float);
    this.flap.style.height = `${(STRIP_H / PACK_H) * 100}%`;
    this.head = el('div', 'pk-tearhead', float); this.head.style.top = tearPct;
    // the ribbon on the pack: "rolling a pack" on a mystery pack, then which pack it was ("Base Set pack! / 1 in 61")
    this.tag = el('div', 'pk-packtag', this.pack);
    if (this.opts.reskin) { this.tag.innerHTML = '<b>rolling a pack</b><span class="pk-packtag__dots"><i></i><i></i><i></i></span>'; this.tag.classList.add('is-on', 'is-rolling'); }
    const jr = rng(this.set.id + ':crinkle');
    this.jitter = Array.from({ length: SEGS }, () => jr() * 2 - 1);
    this.buildChain(1);
    const hint = el('div', 'pk-hint', this.pack);
    hint.style.top = tearPct;
    el('div', 'pk-hint__line', hint);
    el('div', 'pk-hint__hand', hint);
    el('div', 'pk-hint__text', this.pack, this.reduced ? '' : 'drag across the top to open');
    if (this.reduced) { const b = el('button', 'pk-btn pk-open-btn', this.pack, 'Open the pack'); b.type = 'button'; }
    this.deck = el('div', 'pk-deck', this.stage);
    this.pile = el('div', 'pk-pile', this.root);
    this.ribbon = el('div', 'pk-ribbon', this.root);
    this.prompt = el('div', 'pk-prompt', this.root);
    this.ring = el('div', 'pk-ring', this.stage);
    this.ring.innerHTML = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" class="pk-ring__track"/><circle cx="50" cy="50" r="46" class="pk-ring__fill"/></svg>';
    this.flash = el('div', 'pk-flash', r);
    this.pips = el('div', 'pk-pips', r);
    // the HUD
    const hud = el('div', 'pk-hud', r);
    this.title = el('div', 'pk-hud__title', hud);
    this.paintTitle();
    const btns = el('div', 'pk-hud__btns', hud);
    const mute = el('button', 'pk-btn pk-btn--icon', btns) as HTMLButtonElement; mute.type = 'button';
    const paintMute = () => { mute.innerHTML = this.audio.muted ? SVG_MUTED : SVG_SOUND; mute.setAttribute('aria-label', this.audio.muted ? 'Sound off' : 'Sound on'); };
    paintMute();
    this.on(mute, 'click', (e) => { e.stopPropagation(); this.audio.setMuted(!this.audio.muted); this.audio.unlock(); paintMute(); if (!this.audio.muted && this.phase !== 'summary') this.audio.droneOn(); });
    this.skipBtn = el('button', 'pk-btn', btns, 'Skip') as HTMLButtonElement; this.skipBtn.type = 'button';
    this.on(this.skipBtn, 'click', (e) => { e.stopPropagation(); this.skip(); });
    this.on(this.root, 'keydown', (e) => this.onKey(e as KeyboardEvent));
    this.on(this.root, 'pointermove', (e) => this.onHover(e as PointerEvent));
  }

  /** the set's colours as CSS variables on the scene; returns them */
  private paintSet(): string[] {
    const r = this.root, c = this.set.art?.colors ?? ['#141a33', '#2b3a8f', '#8fb6ff'];
    r.style.setProperty('--s0', c[0]); r.style.setProperty('--s1', c[1] ?? c[0]); r.style.setProperty('--s2', c[2] ?? c[1] ?? c[0]);
    r.style.setProperty('--sa', this.set.art?.accent ?? '#ffd35a');
    return c;
  }
  private paintTitle() {
    this.title.innerHTML = '';
    el('b', '', this.title, this.set.name); if (this.set.series) el('span', '', this.title, this.set.series);
  }

  /**
   * The pack arrived for a stand-in (mystery) wrapper: re-skin it to the rolled set, in place, even mid-tear. The torn
   * edge keeps its shape (same foil); the artwork, the peeling strip's face, the colours and the title change under a
   * foil flash, and the ribbon says which pack it was. A rare one gets its fanfare right here on the pack.
   */
  private applySkin(k: Reskin) {
    if (this.destroyed) return;
    if (k.set) {
      this.set = k.set;
      const c = this.paintSet();
      this.root.classList.remove('pk-mystery');
      this.body.innerHTML = wrapperSVG(this.set, this.set.hero ? this.imageBase + this.set.hero : '', this.set.packSize ?? 10);
      this.buildChain(this.chainDir);
      this.rimEdge?.setAttribute('stroke', c[2] ?? c[0]);
      this.paintTitle();
      this.lastShown = -1;
    }
    if (k.tag !== undefined || k.sub !== undefined) {
      this.tag.classList.remove('is-rolling');
      this.tag.innerHTML = '';
      if (k.tag) el('b', '', this.tag, k.tag);
      if (k.sub) el('span', '', this.tag, k.sub);
      this.tag.classList.toggle('is-on', !!(k.tag || k.sub) && !this.pack.classList.contains('is-torn'));
      this.tag.classList.toggle('is-rare', !!k.rare);
      this.root.classList.toggle('pk-rare-pack', !!k.rare);
    } else if (!k.set) return;
    // the foil flash over the pack as it changes
    this.float.classList.remove('is-reskin'); void this.float.offsetWidth; this.float.classList.add('is-reskin');
    this.tag.classList.remove('is-pop'); void this.tag.offsetWidth; this.tag.classList.add('is-pop');
    if (k.rare) this.audio.rarePack();
    if (k.rare && !this.reduced) {
      this.rays.classList.add('is-on', 'is-gold');
      this.shakeKick = 6;
      const r = this.measurePack(), R = this.rootBox;
      const x0 = r.left - R.left, y0 = r.top - R.top;
      for (const col of ['#ffe07a', '#ffd35a', '#ffffff']) this.fx.tearSparks(x0 + r.width * 0.1, x0 + r.width * 0.9, y0 + r.height * 0.45, col, 14);
      setTimeout(() => { if (this.phase === 'idle' || this.phase === 'tearing') this.rays.classList.remove('is-on'); this.rays.classList.remove('is-gold'); }, 2600);
    }
  }

  /** the torn rim of the pack body: the mouth (back panel's silver lining inside), the foil layers at the cut, the
   *  flap's shadow and the stylised tear line; clipped to the torn part */
  private buildRim(parent: HTMLElement, c: string[]) {
    const u = `pkt${++UID}`, s = this.shapes;
    const r = rng(this.set.id + ':fibre');
    const fibres = s.front.filter((_, i) => i % 2 === 1 && r() < 0.7).map(([x, y]) => `M${x.toFixed(1)} ${y.toFixed(1)}l${((r() - 0.5) * 1.4).toFixed(2)} ${(-(0.6 + r() * 2)).toFixed(2)}`).join('');
    const back = `M${s.back.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L')}`;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<svg class="pk-rim" viewBox="0 0 ${PACK_W} ${PACK_H}" preserveAspectRatio="none" aria-hidden="true">
<defs>
  <clipPath id="${u}c"><rect x="0" y="0" width="0" height="${PACK_H}"/></clipPath>
  <linearGradient id="${u}sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".6"/><stop offset=".35" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
  <linearGradient id="${u}in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3f5f9"/><stop offset=".45" stop-color="#9ba3b2"/><stop offset="1" stop-color="#3c3f4c"/></linearGradient>
  <linearGradient id="${u}ag" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${PACK_W}" y2="0">
    <stop offset="0" stop-color="#c9d0db"/><stop offset=".18" stop-color="#ffffff"/><stop offset=".33" stop-color="#98a2b3"/><stop offset=".5" stop-color="#f7f9fc"/><stop offset=".68" stop-color="#a9b2c0"/><stop offset=".84" stop-color="#ffffff"/><stop offset="1" stop-color="#b8c0cc"/></linearGradient>
  <linearGradient id="${u}ln" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${PACK_W}" y2="0">
    <stop offset="0" style="stop-color:var(--leak-hi);stop-opacity:0"/><stop offset=".72" style="stop-color:var(--leak);stop-opacity:.75"/><stop offset=".94" style="stop-color:var(--leak-hi);stop-opacity:1"/><stop offset="1" style="stop-color:#fff;stop-opacity:1"/></linearGradient>
</defs>
<g clip-path="url(#${u}c)">
  <rect class="pk-rim__shadow" x="0" y="${TEAR_Y - 4}" width="${PACK_W}" height="26" fill="url(#${u}sh)"/>
  <path d="${s.mouth}" fill="url(#${u}in)"/>
  <path class="pk-rim__light" d="${s.mouth}"/>
  <path d="${back}" fill="none" stroke="#ffffff" stroke-width=".7" stroke-opacity=".85"/>
  <path class="pk-rim__edge" d="${s.edge}" fill="none" stroke="${c[2] ?? c[0]}" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="${s.edge}" fill="none" stroke="url(#${u}ag)" stroke-width="1.15" stroke-linejoin="round"/>
  <path d="${fibres}" fill="none" stroke="#ffffff" stroke-width=".45" stroke-opacity=".85" stroke-linecap="round"/>
  <g class="pk-rim__core">
    <path d="${s.edge}" fill="none" style="stroke:var(--leak)" stroke-width="3.6" stroke-opacity=".22" stroke-linejoin="round"/>
    <path d="${s.edge}" fill="none" style="stroke:var(--leak-hi)" stroke-width="1.6" stroke-opacity=".6" stroke-linejoin="round"/>
    <path d="${s.edge}" fill="none" stroke="#ffffff" stroke-width=".45" stroke-linejoin="round"/>
  </g>
  <path class="pk-rim__slash" d="${s.edge}" fill="none" stroke="url(#${u}ln)" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>
</g></svg>`;
    this.rim = wrap.firstElementChild as SVGSVGElement;
    parent.appendChild(this.rim);
    this.rimClip = this.rim.querySelector('clipPath rect')!;
    this.rimLine = this.rim.querySelector(`#${u}ln`)!;
    this.rimLight = this.rim.querySelector('.pk-rim__light')!;
    this.rimShadow = this.rim.querySelector('.pk-rim__shadow')!;
    this.rimCore = this.rim.querySelector('.pk-rim__core')!;
    this.rimEdge = this.rim.querySelector('.pk-rim__edge')!;
  }

  /**
   * The strip that peels off, as a chain of SEGS nested segments: each is a column of the wrapper's own artwork (an
   * SVG <use> of it, so nothing is drawn twice), with a silver back face (the inner lining you see when it curls
   * over), a specular and a shade layer. Nesting runs from the hinge (the untorn end) to the free end, so rotating
   * one segment carries all the ones after it: the strip bends like foil instead of turning as one piece.
   */
  private buildChain(dir: 1 | -1) {
    this.chainDir = dir;
    this.paintSeal();
    this.flap.innerHTML = '';
    this.segs = [];
    const art = `${wrapperId(this.set)}art`;
    const sw = PACK_W / SEGS;
    // the strip's outline and its silver back, defined once and <use>d by every segment (clipped inside the SVG,
    // so no segment needs a CSS clip-path mask)
    const u = `pkf${++UID}`;
    const defs = el('div', 'pk-seg__defs', this.flap);
    defs.innerHTML = `<svg width="0" height="0" aria-hidden="true"><defs>
  <clipPath id="${u}c" clipPathUnits="userSpaceOnUse"><path d="${this.shapes.flap}"/></clipPath>
  <linearGradient id="${u}ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f9fc"/><stop offset=".38" stop-color="#a7afbd"/><stop offset=".62" stop-color="#eef1f6"/><stop offset="1" stop-color="#8a93a3"/></linearGradient>
  <pattern id="${u}rg" width="3" height="${STRIP_H}" patternUnits="userSpaceOnUse"><rect width="1.1" height="${TEAR_Y - 30}" fill="#000" fill-opacity=".16"/><rect y="${TEAR_Y - 30}" width="3" height=".7" fill="#fff" fill-opacity=".35"/></pattern>
  <g id="${u}edge"><path d="${this.shapes.edge}" fill="none" stroke="#1b1f2c" stroke-opacity=".35" stroke-width="3.2"/><path d="${this.shapes.edge}" fill="none" stroke="url(#${u}ag)" stroke-width="1.7"/></g>
  <g id="${u}back"><rect width="${PACK_W}" height="${STRIP_H}" fill="url(#${u}ag)"/><rect width="${PACK_W}" height="${STRIP_H}" fill="url(#${u}rg)"/></g>
</defs></svg>`;
    let parent: HTMLElement = this.flap;
    for (let k = 0; k < SEGS; k++) {
      const col = dir > 0 ? SEGS - 1 - k : k;
      const x0 = col * sw;
      // each face reaches a quarter segment into its neighbours, so the bend never opens a gap at a joint
      const vb = `${(x0 - sw * EXT).toFixed(3)} 0 ${(sw * (1 + 2 * EXT)).toFixed(3)} ${STRIP_H}`;
      const seg = el('div', 'pk-seg', parent);
      if (k === 0) { seg.style.left = `${(col / SEGS) * 100}%`; seg.style.width = `${100 / SEGS}%`; }
      else seg.style.left = dir > 0 ? '-100%' : '100%';
      seg.style.transformOrigin = dir > 0 ? '100% 62%' : '0% 62%';
      const face = el('div', 'pk-seg__face', seg);
      face.innerHTML = `<svg viewBox="${vb}" preserveAspectRatio="none" aria-hidden="true"><g clip-path="url(#${u}c)"><use href="#${art}"/></g></svg>`;
      const spec = el('i', 'pk-seg__spec', face);
      const shade = el('i', 'pk-seg__shade', face);
      // the torn edge of this column: only drawn over the part of it that is actually torn (curl() clips it)
      const edge = el('div', 'pk-seg__edge', face);
      edge.innerHTML = `<svg viewBox="${vb}" preserveAspectRatio="none" aria-hidden="true"><use href="#${u}edge"/></svg>`;
      const backEl = el('div', 'pk-seg__back', seg);
      backEl.innerHTML = `<svg viewBox="${vb}" preserveAspectRatio="none" aria-hidden="true"><g clip-path="url(#${u}c)"><use href="#${u}back"/></g></svg>`;
      this.segs.push({ el: seg, spec, shade, edge, last: '', lastSpec: -1, lastShade: -1, lastEdge: '' });
      parent = seg;
    }
  }

  private paintSeal() {
    if (!this.seal) return;
    this.seal.innerHTML = `<svg viewBox="0 0 ${PACK_W} ${STRIP_H}" preserveAspectRatio="none" aria-hidden="true"><use href="#${wrapperId(this.set)}art"/></svg>`;
    this.lastSeal = '';
  }

  /** (re)draw the rays for what's in the pack: neutral white until it arrives, then the best card's aura */
  private paintLeak() {
    const field = rayField(this.set.id + ':' + (this.result?.packId ?? ''), this.leakAura);
    this.leak.innerHTML = leakSVG(`pkl${++UID}`, field);
    this.leakRaysG = this.leak.querySelector('.pk-leak__rays');
    this.leakRays = [...this.leak.querySelectorAll<SVGElement>('.pk-leak__rays path')].map((e, k) => ({ x: field.rays[k].x / PACK_W, el: e, on: true }));
    this.lastRayScale = '';
    this.lastShown = -1;
  }

  private layout() {
    const w = this.root.clientWidth || window.innerWidth, hgt = this.root.clientHeight || window.innerHeight;
    // big screens get a bigger pack and card (up to 1440p-ish), phones fill the width
    const cw = Math.round(Math.min(w * 0.46, hgt * 0.56 * 63 / 88, 400));
    const pw = Math.round(Math.min(w * 0.56, hgt * 0.64 * 250 / 400, 420));
    this.root.style.setProperty('--cw', `${cw}px`);
    this.root.style.setProperty('--pw', `${pw}px`);
    this.pw = pw;
  }
  private pw = 280;

  private onHover(e: PointerEvent) {
    if (this.phase === 'idle' || this.phase === 'tearing') {
      const r = this.box.width > 1 ? this.box : this.measurePack();
      const k = this.tear.state === 'dragging' ? 0.35 : 1;
      this.packTilt.tx = clamp((e.clientX - (r.left + r.width / 2)) / r.width, -1, 1) * k;
      this.packTilt.ty = clamp((e.clientY - (r.top + r.height / 2)) / r.height, -1, 1) * k;
    }
  }
  /** the pack's box on screen, read once per press (never per frame) */
  private measurePack() {
    const r = this.pack.getBoundingClientRect(), R = this.root.getBoundingClientRect();
    this.box = { left: r.left, top: r.top, width: r.width, height: r.height };
    this.rootBox = { left: R.left, top: R.top };
    return this.box;
  }
  private rootBox = { left: 0, top: 0 };

  private keyWaiter: ((k: string, down: boolean) => void) | null = null;
  private onKey(e: KeyboardEvent) {
    if (e.repeat) return;
    const k = e.key;
    if (k === 's' || k === 'S') { this.skip(); e.preventDefault(); return; }
    if (k === 'Escape') { this.jumpToSummary(); e.preventDefault(); return; }
    if ([' ', 'Enter', 'ArrowRight'].includes(k)) { e.preventDefault(); this.audio.unlock(); this.keyWaiter?.(k, true); }
  }

  // ------------------------------------------------------------------ the frame loop: bob, tilt, shake, the tear
  private loop(now: number) {
    this.raf = requestAnimationFrame(this.loop);
    const t = (now - this.t0) / 1000;
    const dt = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;
    const pt = this.packTilt;
    pt.x += (pt.tx - pt.x) * 0.08; pt.y += (pt.ty - pt.y) * 0.08;
    const tearing = this.phase === 'idle' || this.phase === 'tearing' || this.phase === 'torn';
    if (!this.reduced && tearing) {
      const bob = Math.sin(t * 1.55) * 6, turn = Math.sin(t * 0.7) * 2.5;
      const amp = (this.shake * this.tear.progress) + this.shakeKick;
      const sx = noise(t * 3) * amp, sy = noise(t * 3 + 7) * amp;
      this.pack.style.transform = `translate(${sx}px, ${bob + sy}px) rotateY(${pt.x * 16 + turn}deg) rotateX(${-pt.y * 12}deg) rotateZ(${noise(t * 2.2) * amp * 0.25}deg)`;
      this.pack.style.setProperty('--gx', `${50 + pt.x * 40}%`); this.pack.style.setProperty('--gy', `${40 + pt.y * 30}%`);
    }
    this.shakeKick *= 0.9;
    if (tearing || this.flapFree) this.stepTear(dt, t);
  }

  /** the tear, drawn: the strip's curl, the rim, the glow and its rays, the tear head, sparks and shreds */
  private stepTear(dt: number, t: number) {
    const m = this.tear;
    m.step(dt);
    const p = m.progress;
    this.lift += (this.liftTarget - this.lift) * Math.min(1, dt * 10);
    if (this.flapFree) {
      const f = this.flapFree;
      f.t += dt;
      f.vy += 2200 * dt; f.vx *= Math.pow(0.6, dt); f.vy *= Math.pow(0.7, dt); f.x += f.vx * dt; f.y += f.vy * dt; f.r += f.vr * dt;
      this.flap.style.transform = `translate3d(${f.x}px, ${f.y}px, 4px) rotate(${f.r}deg)`;
      // the torn strip keeps curling as it flutters away
      this.curl(1, 0.4 + 0.3 * Math.sin(f.t * 9), Math.min(1.4, f.t * 2.2));
      if (f.y > window.innerHeight * 1.3 || f.t > 2.4) { this.flapFree = null; this.flap.style.display = 'none'; }
    } else if (p !== this.lastShown || m.state === 'dragging') {
      this.curl(p, this.lift, 0);
    }
    if (p === this.lastShown && m.state !== 'dragging' && !this.flapFree) return;
    this.lastShown = p;
    const dir = this.chainDir;
    // the rim and the tear line, clipped to the torn part
    const [c0, c1] = cutSpan(p, dir);
    const fx = dir > 0 ? c1 * PACK_W : c0 * PACK_W;
    this.rimClip.setAttribute('x', (c0 * PACK_W).toFixed(2));
    this.rimClip.setAttribute('width', ((c1 - c0) * PACK_W).toFixed(2));
    // the seal: the untorn rest of the strip, drawn whole, so nothing ahead of the pointer shows a cut
    const sealClip = c1 - c0 <= 0 ? '' : dir < 0 ? `inset(0 ${((1 - c0) * 100).toFixed(2)}% 0 0)` : `inset(0 0 0 ${(c1 * 100).toFixed(2)}%)`;
    if (sealClip !== this.lastSeal) { this.seal.style.clipPath = sealClip; this.lastSeal = sealClip; }
    const tail = 30 + 70 * p;
    this.rimLine.setAttribute('x1', (fx - dir * tail).toFixed(1)); this.rimLine.setAttribute('x2', fx.toFixed(1));
    // the leak: the light inside the pack, a plume over the opening, rays for the big ones, a bloom behind the pack
    const g = leakGlow(p, this.leakI);
    const waiting = m.state === 'dragging' && m.raw >= 1 && !m.ready;
    const pulse = waiting && !this.reduced ? 0.85 + 0.15 * Math.sin(t * 9) : 1;
    const cx = dir * (-0.5 + p / 2) * this.pw;
    this.rimLight.style.opacity = (Math.min(1, g.alpha * 1.4) * pulse).toFixed(3);
    this.rimCore.style.opacity = Math.min(1, p * 8).toFixed(2);
    for (const ry of this.leakRays) {
      const on = ry.x >= c0 - 0.004 && ry.x <= c1 + 0.004;
      if (on !== ry.on) { ry.on = on; ry.el.style.display = on ? '' : 'none'; }
    }
    this.leak.style.opacity = (Math.min(1, g.alpha * 1.25) * pulse).toFixed(3);
    const rs = (0.3 + 0.7 * Math.min(1, p * 1.3)).toFixed(2);
    if (rs !== this.lastRayScale && this.leakRaysG) { this.lastRayScale = rs; this.leakRaysG.setAttribute('transform', `translate(0 ${TEAR_Y}) scale(1 ${rs}) translate(0 ${-TEAR_Y})`); }
    this.rimShadow.style.opacity = Math.min(1, p * 3).toFixed(3);
    this.glow.style.opacity = (g.alpha * pulse).toFixed(3);
    this.glow.style.transform = `translateX(${cx.toFixed(1)}px) scale(${g.sx.toFixed(3)}, ${g.sy.toFixed(3)})`;
    this.beams.style.opacity = (g.rays * 0.9).toFixed(3);
    this.beams.style.transform = `translateX(${cx.toFixed(1)}px) scale(${(0.3 + 0.7 * p).toFixed(3)}, ${(0.35 + 0.65 * p).toFixed(3)})`;
    this.bloom.style.opacity = (g.alpha * 0.4).toFixed(3);
    this.bloom.style.transform = `translateY(-18%) scale(${(0.55 + 0.6 * p * (0.5 + this.leakI)).toFixed(3)})`;
    const headOn = m.state === 'dragging' && p > 0.01 && p < 0.999;
    this.head.style.opacity = headOn ? '1' : '0';
    this.head.style.transform = `translateX(${((fx / PACK_W) * this.pw).toFixed(1)}px)`;
    // sparks and foil shreds fly off the tear front while it moves forward
    const dp = p - this.prevP; this.prevP = p;
    if (!this.reduced && dp > 0.0005 && m.state !== 'committed') {
      this.sparkAcc += dp * (60 + 50 * this.leakI);
      const n = Math.min(6, Math.floor(this.sparkAcc));
      if (n > 0) {
        this.sparkAcc -= n;
        const R = this.rootBox;
        const x = this.box.left - R.left + (fx / PACK_W) * this.box.width, y = this.box.top - R.top + this.box.height * (TEAR_Y / PACK_H);
        this.fx.tearSparks(x - 4, x + 4, y, this.leakColor(), Math.ceil(n * 0.7));
        if (this.leakAura && this.leakAura.intensity >= 0.3) {
          const x0 = this.box.left - R.left + (dir > 0 ? 0 : fx / PACK_W) * this.box.width, x1 = this.box.left - R.left + (dir > 0 ? fx / PACK_W : 1) * this.box.width;
          this.fx.glints(x0, x1, y - 2, this.leakAura.colors, Math.ceil(n * this.leakAura.intensity), this.leakAura.level === 'gold');
        }
        this.fx.shreds(x - 3, x + 3, y, this.printColor(), Math.ceil(n * 0.6), dir);
      }
    }
  }
  private prevP = 0;

  /** pose the peeling strip for tear progress p */
  private curl(p: number, lift: number, boost: number) {
    const chain = curlChain(p, SEGS, lift, this.jitter, boost);
    const d = this.chainDir;
    let cy = 0, cz = 0;
    for (let k = 0; k < SEGS; k++) {
      const s = chain[k], seg = this.segs[k];
      if (!seg) break;
      cy += s.ry; cz += s.rz;
      const tr = s.torn > 0 || s.rz > 0.01 ? `rotateZ(${(d * s.rz).toFixed(2)}deg) rotateY(${(d * s.ry).toFixed(2)}deg) rotateX(${s.rx.toFixed(2)}deg)` : '';
      if (tr !== seg.last) { seg.el.style.transform = tr; seg.last = tr; }
      // light: a specular glint where the foil faces the light, darker as it rolls away
      // quantised to 1/16 steps: each change restyles a 3D layer, so small wobbles are not worth a frame
      const spec = s.torn > 0 ? Math.round(Math.pow(Math.max(0, Math.sin((cy * 1.6 + cz * 0.8 + 20) * RAD)), 6) * 0.85 * 16) / 16 : 0;
      const shade = s.torn > 0 ? Math.round(clamp((1 - Math.cos(cy * RAD)) * 0.55 + cz * 0.0015, 0, 0.6) * 16) / 16 : 0;
      if (spec !== seg.lastSpec) { seg.spec.style.opacity = String(spec); seg.lastSpec = spec; }
      if (shade !== seg.lastShade) { seg.shade.style.opacity = String(shade); seg.lastShade = shade; }
      // the torn edge: none on a sealed column, a partial one on the column at the tear front (clipped to exactly the
      // torn fraction of it, so the cut stops at the pointer), all of it behind. The face box reaches EXT into each
      // neighbour, hence the offsets.
      const tornPx = s.torn >= 1 ? 1 : s.torn;
      let clip = 'hidden';
      if (tornPx >= 1) clip = '';
      else if (tornPx > 0.001) {
        const keep = (EXT + tornPx) / (1 + 2 * EXT), cut = ((1 - keep) * 100).toFixed(1);
        clip = d > 0 ? `inset(0 ${cut}% 0 0)` : `inset(0 0 0 ${cut}%)`;
      }
      if (clip !== seg.lastEdge) {
        seg.lastEdge = clip;
        seg.edge.style.visibility = clip === 'hidden' ? 'hidden' : '';
        seg.edge.style.clipPath = clip === 'hidden' ? '' : clip;
      }
    }
  }

  // ------------------------------------------------------------------ the run
  private async run() {
    this.setPhase('idle');
    this.root.focus({ preventScroll: true });
    await this.tearGesture();
    let res: PackResult;
    try { res = await this.fetchOnce(); }
    catch (e) {
      this.setPhase('done');
      const box = el('div', 'pk-error', this.root);
      el('b', '', box, "Couldn't open the pack");
      el('p', '', box, e instanceof Error ? e.message : String(e));
      const b = el('button', 'pk-btn', box, 'Close') as HTMLButtonElement; b.type = 'button';
      b.addEventListener('click', () => this.destroy());
      throw new Cancel();
    }
    this.check();
    await this.stackOut(res);
    for (let i = 0; i < this.views.length && !this.jumped; i++) await this.reveal(i);
    await this.summary();
  }

  private fetchOnce(): Promise<PackResult> {
    if (!this.fetching) {
      this.fetching = this.opts.fetchPack().then(r => {
        this.result = r;
        this.maxHit = Math.max(0, ...r.cards.map(hitOf));
        const best = r.cards.reduce((a, c) => (hitOf(c) >= hitOf(a) ? c : a), r.cards[0]);
        // the seam leaks the best card's aura: how big, never what (docs/PACK_OPENING.md, honest foreshadowing)
        const aura = best ? auraOf(best) : null;
        this.leakAura = aura;
        this.leakI = aura ? Math.max(0.12, aura.intensity) : 0.12;
        if (aura) {
          this.root.style.setProperty('--leak', aura.b);
          this.root.style.setProperty('--leak-hi', aura.a);
          this.root.classList.toggle('pk-leak-prism', aura.prismatic);
          this.root.classList.toggle('pk-leak-gold', aura.level === 'gold');
        }
        this.root.style.setProperty('--leak-w', `${2 + this.maxHit * 2.2}px`);
        this.shake = this.reduced ? 0 : SHAKE[this.maxHit] ?? 0;
        this.paintLeak();
        this.lastShown = -1;
        if (this.opts.reskin && !this.destroyed) {
          let k: Reskin | null | undefined = null;
          try { k = this.opts.reskin(r); } catch (e) { console.error(e); }
          if (k) this.applySkin(k);
        }
        // the tear can commit now: one held at the far end commits at once
        if (this.tear.setReady()) this.finishTear?.();
        return r;
      });
      this.fetching.catch(e => this.rejectDone(e));
      this.done.catch(() => { /* the host handles it */ });
    }
    return this.fetching;
  }

  // ------------------------------------------------------------------ 1-2. idle and the tear
  private tearGesture(): Promise<void> {
    return new Promise<void>((resolve) => {
      const m = this.tear;
      let lastX = 0, lastY = 0, lastT = 0, vx = 0, vy = 0, downAt = 0, moved = 0, pointer = -1;
      let auto = false, finished = false, armed = false, longT = 0;
      const idleHint = setTimeout(() => this.root.classList.add('pk-hint-pulse'), 6000);
      const first = () => {
        this.audio.unlock(); this.audio.droneOn(); clearTimeout(idleHint); this.root.classList.remove('pk-hint-pulse');
        if (!this.fetching) void this.fetchOnce().catch(() => { /* shown by run() */ });
      };
      const finish = () => {
        if (finished) return; finished = true;
        clearTimeout(idleHint);
        m.commit();
        const r = this.measurePack(), R = this.rootBox;
        const dir = this.chainDir;
        this.flapFree = { x: 0, y: 0, t: 0, vx: (Math.abs(vx) > 0.2 ? vx * 1000 : 620 * dir) * 0.8, vy: Math.min(-420, vy * 1000 - 620), r: 0, vr: dir * (160 + Math.random() * 200) };
        this.audio.rip(1 + this.maxHit * 0.1);
        const y = r.top - R.top + r.height * (TEAR_Y / PACK_H);
        this.fx.tearSparks(r.left - R.left, r.left + r.width - R.left, y, this.leakColor(), 26 + this.maxHit * 12);
        this.fx.shreds(r.left - R.left, r.left + r.width - R.left, y, this.printColor(), 18 + this.maxHit * 4, dir);
        // big packs pop with a spray in the aura's colours (the coins, confetti and petals wait for the card itself)
        if (this.leakAura && this.leakAura.intensity >= 0.5) for (const c of this.leakAura.colors) this.fx.tearSparks(r.left - R.left + r.width * 0.15, r.left - R.left + r.width * 0.85, y, c, Math.round((10 + 30 * this.leakAura.intensity) / this.leakAura.colors.length));
        this.shakeKick = 4 + this.maxHit * 2;
        this.pack.classList.add('is-torn');
        this.head.style.opacity = '0';
        this.popFlash();
        cleanup();
        this.tag.classList.remove('is-on');
        this.setPhase('torn');
        resolve();
      };
      const autoTear = async () => {
        if (auto || finished) return; auto = true; first();
        this.setPhase('tearing'); this.hideHint();
        this.measurePack();
        const t0 = performance.now(), dur = (this.reduced ? 350 : 800) * this.speed();
        while (!finished) {
          const k = (performance.now() - t0) / dur;
          vx = 0.9 * (m.dir || 1); vy = -0.3;
          this.audio.crinkle(1.2);
          this.liftTarget = 0.2;
          if (m.drive(k * k * (3 - 2 * k) * 1.02 + (k >= 1 ? 0.05 : 0.01))) { finish(); break; }
          await new Promise(r => requestAnimationFrame(r));
          if (this.destroyed) return;
          if (k >= 1 && !this.result) { await this.fetchOnce().catch(() => {}); if (!this.result) return; }
        }
      };
      this.tearAuto = autoTear;
      const down = (e: PointerEvent) => {
        if (finished || auto) return;
        const tgt = e.target as HTMLElement;
        if (tgt.closest('.pk-hud')) return;
        if (tgt.closest('.pk-open-btn')) { void autoTear(); return; }
        const r = this.measurePack();
        const inPack = e.clientY > r.top - 40 && e.clientY < r.top + r.height + 20 && e.clientX > r.left - 40 && e.clientX < r.left + r.width + 40;
        if (!inPack) { armed = false; return; }
        armed = true;
        first();
        downAt = performance.now(); moved = 0;
        if (this.reduced) { void autoTear(); return; }
        // a touch held still opens it by itself (there's no hover on a phone to find the strip with)
        clearTimeout(longT);
        if (e.pointerType === 'touch') longT = window.setTimeout(() => { if (armed && moved < 8 && !finished) { m.release(); void autoTear(); } }, LONG_PRESS_MS);
        const inStrip = e.clientY < r.top + r.height * 0.26;
        if (!inStrip) return;
        pointer = e.pointerId;
        lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
        m.begin(e.clientX, r.left, r.width);
        try { this.root.setPointerCapture?.(e.pointerId); } catch { /* synthetic events */ }
        this.setPhase('tearing');
      };
      const move = (e: PointerEvent) => {
        if (finished || m.state !== 'dragging' || e.pointerId !== pointer) return;
        const now = performance.now(), dtt = Math.max(1, now - lastT);
        vx = vx * 0.6 + ((e.clientX - lastX) / dtt) * 0.4; vy = vy * 0.6 + ((e.clientY - lastY) / dtt) * 0.4;
        moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
        lastX = e.clientX; lastY = e.clientY; lastT = now;
        const hadDir = m.dir;
        const before = m.target;
        const committed = m.move(e.clientX);
        if (!hadDir && m.dir) { if (m.dir !== this.chainDir) this.buildChain(m.dir); this.hideHint(); }
        // the pointer above the strip lifts the peel, below it presses it down
        const stripY = this.box.top + this.box.height * (TEAR_Y / PACK_H);
        this.liftTarget = clamp((stripY - e.clientY) / (this.box.height * 0.22), -1, 1);
        if (m.target !== before) this.audio.crinkle(Math.abs(vx) * (m.target < before ? 0.6 : 1));
        if (committed) finish();
      };
      const up = (e: PointerEvent) => {
        if (finished || !armed) return;
        if (pointer !== -1 && e.pointerId !== pointer) return;
        armed = false; pointer = -1; clearTimeout(longT);
        if (auto) return;
        const tap = performance.now() - downAt < 320 && moved < 8;
        if (tap && TAP_OPENS) { m.release(); void autoTear(); return; }
        if (tap) { this.nudgeHint(); if (m.state === 'dragging') { m.release(); this.liftTarget = 0; this.setPhase('idle'); } return; }
        if (m.state === 'dragging') {
          m.release();
          this.liftTarget = 0;
          if (m.progress > 0.05) this.audio.crinkle(0.6);
          this.setPhase('idle');
          setTimeout(() => { if (!finished && m.state === 'sealed') this.root.classList.remove('pk-hint-off'); }, 1400);
        }
      };
      const key = (k: string) => { if (!finished && !auto && [' ', 'Enter', 'ArrowRight'].includes(k)) void autoTear(); };
      this.keyWaiter = key;
      this.on(this.root, 'pointerdown', down as EventListener);
      this.on(this.root, 'pointermove', move as EventListener);
      this.on(this.root, 'pointerup', up as EventListener);
      this.on(this.root, 'pointercancel', up as EventListener);
      this.finishTear = finish;
      const cleanup = () => { clearTimeout(longT); this.finishTear = null; this.keyWaiter = null; this.tearAuto = null; this.root.removeEventListener('pointerdown', down as EventListener); this.root.removeEventListener('pointermove', move as EventListener); this.root.removeEventListener('pointerup', up as EventListener); this.root.removeEventListener('pointercancel', up as EventListener); };
      if (this.opts.autoplay) setTimeout(() => void autoTear(), 1400);
    });
  }
  private tearAuto: (() => Promise<void>) | null = null;
  private leakColor() { return this.leakAura?.colors[0] ?? '#ffffff'; }
  private printColor() { return this.set.art?.colors?.[2] ?? this.set.art?.colors?.[1] ?? '#8fb6ff'; }
  private hideHint() { this.root.classList.add('pk-hint-off'); }
  /** a tap on the pack: show how to open it (the hint pulses, the hand sweeps across once more) */
  private nudgeHint() {
    this.audio.crinkle(0.4);
    this.root.classList.remove('pk-hint-off', 'pk-hint-nudge'); void this.root.offsetWidth;
    this.root.classList.add('pk-hint-pulse', 'pk-hint-nudge');
    this.shakeKick = Math.max(this.shakeKick, 1.5);
  }
  /** the pop when the strip comes off: light bursting out of the mouth, sized by the pack's best card */
  private popFlash() {
    if (this.reduced) return;
    this.pack.style.setProperty('--pop', String(0.35 + this.leakI * 0.65));
    this.pack.classList.remove('is-pop'); void this.pack.offsetWidth; this.pack.classList.add('is-pop');
  }

  // ------------------------------------------------------------------ 3. the stack and the fan
  private async stackOut(res: PackResult) {
    this.setPhase('stack');
    this.hideHint();
    this.audio.droneLevel(0.035, 0.8);
    const cards = res.cards;
    this.views = cards.map(c => makeCard(c, this.imageBase, { setName: res.setName ?? this.set.name, reduced: this.reduced }));
    // first to reveal on top
    this.views.forEach((v, i) => {
      v.el.style.zIndex = String(100 - i);
      v.el.style.setProperty('--i', String(i));
      v.el.classList.add('pk-in-deck');
      this.deck.appendChild(v.el);
    });
    this.pips.innerHTML = '';
    cards.forEach(() => el('i', '', this.pips));
    await Promise.race([Promise.all(this.views.map(v => v.ready)), this.wait(1500)]);
    this.check();
    this.pack.classList.add('is-open');
    this.audio.whoosh(0.5, 0.3);
    this.deck.classList.add('is-rising');
    await this.wait(this.reduced ? 250 : 520);
    // the fan: count what's in the pack (all backs up)
    if (!this.reduced && !this.fast) {
      const n = this.views.length;
      this.views.forEach((v, i) => {
        const k = i - (n - 1) / 2;
        v.el.style.setProperty('--fan-r', `${k * 7}deg`);
        v.el.style.setProperty('--fan-x', `${k * 26}px`);
        v.el.style.setProperty('--fan-y', `${Math.abs(k) * Math.abs(k) * 2.2}px`);
        v.el.style.transitionDelay = `${i * 22}ms`;
      });
      this.deck.classList.add('is-fanned');
      for (let i = 0; i < n; i += 2) setTimeout(() => this.audio.tick(i - 6, 0.08), i * 22);
      await this.wait(760);
      this.deck.classList.remove('is-fanned');
      this.audio.whoosh(0.3, 0.18);
      await this.wait(380);
      this.views.forEach(v => { v.el.style.transitionDelay = ''; });
    }
    this.pack.style.display = 'none';
  }

  // ------------------------------------------------------------------ 4. one card
  private waitAdvance(v: CardView, i: number): Promise<void> {
    return new Promise<void>((resolve) => {
      // the card is yours to hold: grab it and shake it (it chases the pointer on a spring, tilts with its speed, and
      // its aura and sparkles build with the shaking), let go and it springs home; fling it off the side, tap, or
      // press Space / Enter / Right for the next card
      const sh = new CardShake(this.reduced ? 0.3 : 1);
      const R = this.root.getBoundingClientRect(), C = v.el.getBoundingClientRect();
      const home = { x: C.left - R.left + C.width / 2, y: C.top - R.top + C.height / 2 };
      const cw = C.width, ch = C.height;
      let grabbing = false, pointer = -1, sx = 0, sy = 0, ox = 0, oy = 0, downT = 0, moved = 0, gone = false, rafId = 0, downOnCard = false;
      let last = performance.now(), acc = 0, lastEn = -1, lastSpd = -1, lastTr = '';
      const aura = v.aura;
      const keep = v.hit >= HOLD_HIT; // a hit: a tap on it lifts it, it never skips it
      const autoT = this.opts.autoplay ? setTimeout(() => fling(1), v.hit >= 3 ? 2600 : 900) : 0;
      const lastCard = i === this.views.length - 1;
      this.prompt.textContent = this.reduced ? (lastCard ? 'tap to see your pack' : 'tap for the next card')
        : keep ? `swipe, Enter or Next for ${lastCard ? 'your pack' : 'the next card'}`
        : lastCard ? 'tap to see your pack' : 'grab it, shake it, or swipe for the next card';
      this.root.classList.add('pk-prompt-on');
      // hits get a Next button (a tap on the card doesn't skip it)
      let next: HTMLButtonElement | null = null;
      if (keep && !this.reduced) {
        next = el('button', 'pk-btn pk-next', this.root, lastCard ? 'Your pack ›' : 'Next ›') as HTMLButtonElement;
        next.type = 'button';
        next.addEventListener('pointerdown', (e) => e.stopPropagation());
        next.addEventListener('click', (e) => { e.stopPropagation(); fling(1); });
      }
      v.el.style.transition = 'none';
      const frame = (now: number) => {
        rafId = requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        const pose = sh.step(dt);
        if (grabbing) this.audio.shake(pose.speed, pose.energy);
        const moving = grabbing || !sh.resting;
        const tr = moving ? `translate3d(${pose.x.toFixed(1)}px, ${pose.y.toFixed(1)}px, 0) rotate(${pose.rz.toFixed(2)}deg)` : '';
        if (tr !== lastTr) { v.el.style.transform = tr; lastTr = tr; }
        if (moving) {
          v.el.style.setProperty('--rx', `${pose.rx.toFixed(2)}deg`); v.el.style.setProperty('--ry', `${pose.ry.toFixed(2)}deg`);
          v.el.style.setProperty('--mx', clamp(0.5 + pose.ry / 60, 0, 1).toFixed(3)); v.el.style.setProperty('--my', clamp(0.5 - pose.rx / 55, 0, 1).toFixed(3));
        }
        const en = Math.round(pose.energy * 50) / 50, spd = Math.round(pose.speed * 25) / 25;
        if (en !== lastEn) { v.el.style.setProperty('--en', String(en)); lastEn = en; }
        if (spd !== lastSpd) { v.el.style.setProperty('--spd', String(spd)); lastSpd = spd; }
        // sparkles off the card's edge: a trickle at rest for the rarer auras, a spray when shaken
        if (!this.reduced && aura.particles > 0 && !gone) {
          acc += aura.particles * (0.4 + 5 * pose.energy + 1.2 * pose.speed) * dt;
          const n = Math.min(10, Math.floor(acc));
          if (n > 0 && this.fx.count < this.fx.cap - 40) {
            acc -= n;
            this.fx.edgeSparkles(home.x + pose.x, home.y + pose.y, cw, ch, pose.rz * RAD, aura.colors, n, 40 + 200 * pose.energy);
          } else if (n > 0) acc = 0;
        }
      };
      rafId = requestAnimationFrame(frame);
      const fling = (dir: number, speed = 1.4) => {
        if (gone) return; gone = true;
        clearTimeout(autoT); cancelAnimationFrame(rafId);
        cleanup();
        next?.remove();
        this.audio.whoosh(0.28, 0.2);
        v.el.classList.remove('is-shaking', 'is-held');
        v.el.classList.add('is-flung');
        void v.el.offsetWidth;
        v.el.style.transition = 'transform .45s cubic-bezier(.3,.1,.6,1), opacity .45s';
        v.el.style.transform = `translate(${dir * (window.innerWidth * 0.7) + sh.x}px, ${sh.y - 80}px) rotate(${dir * 38 * speed}deg)`;
        v.el.style.opacity = '0';
        this.root.classList.remove('pk-prompt-on');
        this.ribbon.classList.remove('is-on');
        this.addToPile(v);
        setTimeout(resolve, 140);
      };
      const down = (e: PointerEvent) => {
        if ((e.target as HTMLElement).closest('.pk-hud') || grabbing) return;
        grabbing = true; pointer = e.pointerId; sx = e.clientX; sy = e.clientY; downT = performance.now(); moved = 0;
        downOnCard = Math.abs(e.clientX - R.left - (home.x + sh.x)) < cw * 0.62 && Math.abs(e.clientY - R.top - (home.y + sh.y)) < ch * 0.62;
        ox = sh.x; oy = sh.y;
        sh.grab(); sh.drag(ox / sh.amp, oy / sh.amp);
        v.el.classList.add('is-shaking', 'is-held');
        try { this.root.setPointerCapture?.(e.pointerId); } catch { /* synthetic events */ }
      };
      const move = (e: PointerEvent) => {
        if (!grabbing) { if (sh.resting) v.tiltAt(e.clientX, e.clientY); return; }
        if (e.pointerId !== pointer) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
        sh.drag(ox / sh.amp + dx, oy / sh.amp + dy);
      };
      const up = (e: PointerEvent) => {
        if (!grabbing || e.pointerId !== pointer) return;
        grabbing = false; pointer = -1;
        v.el.classList.remove('is-held');
        const tap = performance.now() - downT < 280 && moved < 10;
        // a short press on a hit only lifts it (it's yours to shake): Next, a swipe or Enter moves on
        if (tap && tapAdvances(v.hit, downOnCard, this.reduced)) { fling(1); return; }
        if (tap) { sh.release(); return; }
        const dir = this.reduced ? (Math.abs(sh.x) > cw * 0.3 ? Math.sign(sh.x) : 0) : sh.flingOnRelease(cw);
        if (dir) { fling(dir); return; }
        sh.release();
      };
      const leave = () => { if (!grabbing && sh.resting) v.tiltReset(); };
      if (this.fast || this.jumped) { setTimeout(() => fling(1), 240 * this.speed()); }
      this.keyWaiter = (k) => { if ([' ', 'Enter', 'ArrowRight'].includes(k)) fling(1); };
      this.skipNow = () => fling(1);
      this.root.addEventListener('pointerdown', down); this.root.addEventListener('pointermove', move);
      this.root.addEventListener('pointerup', up); this.root.addEventListener('pointercancel', up); this.root.addEventListener('pointerleave', leave);
      const cleanup = () => {
        this.keyWaiter = null; this.skipNow = null; this.stopCard = null;
        this.root.removeEventListener('pointerdown', down); this.root.removeEventListener('pointermove', move);
        this.root.removeEventListener('pointerup', up); this.root.removeEventListener('pointercancel', up); this.root.removeEventListener('pointerleave', leave);
      };
      this.stopCard = () => { cancelAnimationFrame(rafId); cleanup(); next?.remove(); };
    });
  }
  private skipNow: (() => void) | null = null;
  private stopCard: (() => void) | null = null;
  /** the "grab & shake it" hint was shown in this opening */
  private shakeHinted = false;

  private addToPile(v: CardView) {
    const mini = el('div', `pk-pile__card pk-fx-${v.fx}`, this.pile);
    mini.style.setProperty('--c-a', FX_COLOR[v.fx].a); mini.style.setProperty('--c-b', FX_COLOR[v.fx].b);
    mini.style.setProperty('--r', `${(Math.random() - 0.5) * 16}deg`);
  }

  /** wait for a tap (flip / charged) or a full hold (held) on the face-down card */
  private waitFlipGesture(v: CardView, cls: 'flip' | 'charged' | 'held'): Promise<void> {
    if (this.fast || this.jumped) return this.wait(cls === 'held' ? 500 : 200);
    const hold = (cls === 'held' && !this.reduced) || (this.reduced && revealBy(v.hit, true) === 'hold');
    const holdMs = 950;
    this.prompt.textContent = hold ? 'press and hold to reveal' : 'tap to flip';
    this.root.classList.add('pk-prompt-on');
    return new Promise<void>((resolve) => {
      let t0 = 0, charging = false, rafId = 0, done = false;
      const autoT = this.opts.autoplay ? setTimeout(() => (hold ? start() : finish()), 900) : 0;
      const finish = () => {
        if (done) return; done = true;
        clearTimeout(autoT); cancelAnimationFrame(rafId);
        cleanup();
        this.root.classList.remove('pk-prompt-on', 'pk-charging');
        this.ring.classList.remove('is-on');
        this.audio.chargeStop(true);
        resolve();
      };
      const tick = () => {
        const k = clamp((performance.now() - t0) / holdMs, 0, 1);
        this.ring.style.setProperty('--k', k.toFixed(3));
        this.shakeDeck(k * (2 + v.hit));
        if (k >= 1) { finish(); return; }
        rafId = requestAnimationFrame(tick);
      };
      const start = () => {
        if (done) return;
        if (!hold) { finish(); return; }
        charging = true; t0 = performance.now();
        this.ring.classList.add('is-on'); this.root.classList.add('pk-charging');
        this.audio.chargeStart(v.hit, holdMs / 1000);
        rafId = requestAnimationFrame(tick);
        if (this.opts.autoplay) return;
      };
      const stop = () => {
        if (!charging || done) return;
        charging = false; cancelAnimationFrame(rafId);
        this.ring.classList.remove('is-on'); this.root.classList.remove('pk-charging');
        this.ring.style.setProperty('--k', '0'); this.shakeDeck(0);
        this.audio.chargeStop(false);
      };
      const down = (e: PointerEvent) => { if ((e.target as HTMLElement).closest('.pk-hud')) return; this.audio.unlock(); start(); };
      const up = () => stop();
      this.keyWaiter = (k, isDown) => { if (isDown) start(); };
      const keyup = (e: Event) => { const k = (e as KeyboardEvent).key; if (k === ' ' || k === 'Enter') stop(); };
      this.skipNow = () => finish();
      this.root.addEventListener('pointerdown', down); this.root.addEventListener('pointerup', up); this.root.addEventListener('pointercancel', up);
      this.root.addEventListener('keyup', keyup);
      const cleanup = () => {
        this.keyWaiter = null; this.skipNow = null;
        this.root.removeEventListener('pointerdown', down); this.root.removeEventListener('pointerup', up); this.root.removeEventListener('pointercancel', up);
        this.root.removeEventListener('keyup', keyup);
      };
    });
  }

  /**
   * Shake to reveal (the anticipation, before the flip): a face-down hit is yours to grab and shake. Its back pulses
   * and its aura leaks out round the edges in the tier colour (honest foreshadowing, like the tear light), and the
   * shake energy drives the glow, the sparkles and the rattle. It flips at full energy (a burst into the flip), when
   * you let go after a good shake, or on Enter / Space / Right or the Reveal button (the fallback).
   */
  private waitShakeReveal(v: CardView, i: number): Promise<void> {
    if (this.fast || this.jumped) return this.wait(260);
    return new Promise<void>((resolve) => {
      const sh = new CardShake(1);
      const R = this.root.getBoundingClientRect(), C = v.el.getBoundingClientRect();
      const home = { x: C.left - R.left + C.width / 2, y: C.top - R.top + C.height / 2 };
      const cw = C.width, ch = C.height;
      const aura = v.aura;
      let grabbing = false, pointer = -1, sx = 0, sy = 0, ox = 0, oy = 0, done = false, rafId = 0, acc = 0, lastEn = -1, lastTr = '', shook = false;
      // the charge: the shake energy integrated over time, so a reveal takes about a second of real shaking
      let charge = 0;
      let last = performance.now();
      v.el.classList.add('pk-shake-down');
      v.el.style.transition = 'none';
      this.prompt.textContent = 'grab it and shake it to reveal · Enter to flip';
      this.root.classList.add('pk-prompt-on');
      // the first face-down hit, for a player who hasn't shaken one yet
      let hint: HTMLElement | null = null;
      if (!this.shakeHinted && !hasShaken()) {
        this.shakeHinted = true;
        hint = el('div', 'pk-shake-hint', v.el);
        el('i', 'pk-shake-hint__hand', hint);
        el('b', '', hint, 'shake to reveal!');
      }
      const dropHint = () => { if (hint) { hint.classList.add('is-out'); const h = hint; hint = null; setTimeout(() => h.remove(), 300); } };
      const btn = el('button', 'pk-btn pk-next', this.root, 'Reveal ›') as HTMLButtonElement;
      btn.type = 'button';
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => { e.stopPropagation(); flip(false); });
      const autoT = this.opts.autoplay ? setTimeout(() => flip(false), 900) : 0;
      const frame = (now: number) => {
        rafId = requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        const pose = sh.step(dt);
        charge = shakeCharge(charge, pose.energy, grabbing, dt);
        if (grabbing) this.audio.shake(pose.speed, charge);
        const tr = grabbing || !sh.resting ? `translate3d(${pose.x.toFixed(1)}px, ${pose.y.toFixed(1)}px, 0) rotate(${pose.rz.toFixed(2)}deg)` : '';
        if (tr !== lastTr) { v.el.style.transform = tr; lastTr = tr; }
        const en = Math.round(charge * 50) / 50;
        if (en !== lastEn) { v.el.style.setProperty('--en', String(en)); lastEn = en; }
        if (!shook && charge > 0.5) { shook = true; markShaken(); }
        // sparkles out of the edges, in the tier's colours, building with the shake
        if (!this.reduced && (grabbing ? aura.particles > 0 : v.rv.idleSparks > 0)) {
          const steep = 0.3 + 1.7 * v.rv.power * v.rv.power;
          acc += grabbing ? (aura.particles * 0.3 + 2) * (0.2 + 6 * charge) * steep * dt : v.rv.idleSparks * dt;
          const n = Math.min(8, Math.floor(acc));
          if (n > 0 && this.fx.count < this.fx.cap - 40) { acc -= n; this.fx.edgeSparkles(home.x + pose.x, home.y + pose.y, cw, ch, pose.rz * RAD, aura.colors, n, grabbing ? 40 + 180 * charge : 22); }
          else if (n > 0) acc = 0;
        }
        if (grabbing && shakeFlips(charge, 'frame')) flip(true, pose);
      };
      rafId = requestAnimationFrame(frame);
      const flip = (peak: boolean, pose?: { x: number; y: number; rz: number }) => {
        if (done) return; done = true;
        clearTimeout(autoT); cancelAnimationFrame(rafId); cleanup(); dropHint(); btn.remove();
        if (peak && pose) {
          // the peak: a double ring of sparkles off the edge and a bright tick, straight into the flip
          this.fx.edgeSparkles(home.x + pose.x, home.y + pose.y, cw, ch, pose.rz * RAD, aura.colors, 26 + Math.round(20 * aura.intensity), 280);
          this.fx.edgeSparkles(home.x + pose.x, home.y + pose.y, cw * 1.04, ch * 1.04, pose.rz * RAD, ['#ffffff', ...aura.colors], 18, 440);
          this.audio.tick(12 + v.hit, 0.3);
        }
        v.el.classList.remove('pk-shake-down', 'is-held', 'is-shaking');
        v.el.style.setProperty('--en', '0');
        // back home as it turns over
        v.el.style.transition = 'transform .38s cubic-bezier(.2,1.3,.4,1)';
        v.el.style.transform = '';
        setTimeout(() => { v.el.style.transition = ''; }, 400);
        resolve();
      };
      const down = (e: PointerEvent) => {
        if ((e.target as HTMLElement).closest('.pk-hud') || grabbing || done) return;
        this.audio.unlock();
        grabbing = true; pointer = e.pointerId; sx = e.clientX; sy = e.clientY; ox = sh.x; oy = sh.y;
        dropHint();
        sh.grab(); sh.drag(ox, oy);
        v.el.classList.add('is-shaking', 'is-held');
        try { this.root.setPointerCapture?.(e.pointerId); } catch { /* synthetic events */ }
      };
      const move = (e: PointerEvent) => {
        if (!grabbing || e.pointerId !== pointer) return;
        sh.drag(ox + e.clientX - sx, oy + e.clientY - sy);
      };
      const up = (e: PointerEvent) => {
        if (!grabbing || e.pointerId !== pointer) return;
        grabbing = false; pointer = -1;
        v.el.classList.remove('is-held');
        if (shakeFlips(charge, 'release')) { flip(false); return; }
        sh.release();
      };
      this.keyWaiter = (k) => { if ([' ', 'Enter', 'ArrowRight'].includes(k)) flip(false); };
      this.skipNow = () => flip(false);
      this.root.addEventListener('pointerdown', down); this.root.addEventListener('pointermove', move);
      this.root.addEventListener('pointerup', up); this.root.addEventListener('pointercancel', up);
      const cleanup = () => {
        this.keyWaiter = null; this.skipNow = null; this.stopCard = null;
        this.root.removeEventListener('pointerdown', down); this.root.removeEventListener('pointermove', move);
        this.root.removeEventListener('pointerup', up); this.root.removeEventListener('pointercancel', up);
      };
      this.stopCard = () => { cancelAnimationFrame(rafId); cleanup(); dropHint(); btn.remove(); };
      void i;
    });
  }

  private deckShakeAmp = 0;
  private shakeDeck(a: number) {
    this.deckShakeAmp = this.reduced ? 0 : a;
    if (!this.deckShakeLoop && a > 0) {
      this.deckShakeLoop = true;
      const f = () => {
        if (this.deckShakeAmp <= 0.05 || this.destroyed) { this.deck.style.translate = ''; this.deckShakeLoop = false; return; }
        const t = performance.now() / 1000;
        this.deck.style.translate = `${noise(t * 4) * this.deckShakeAmp}px ${noise(t * 4 + 3) * this.deckShakeAmp}px`;
        requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    }
  }
  private deckShakeLoop = false;

  private async reveal(i: number) {
    this.check();
    const v = this.views[i];
    const last = i === this.views.length - 1;
    const bigLast = last && v.hit >= 3;
    if (bigLast && this.fast) { this.fast = false; } // skipping never hides the big moment
    const cls = revealClass(v.hit, last);
    const col = FX_COLOR[v.fx];
    this.setPhase('reveal', { index: i, card: v.card });
    this.root.style.setProperty('--tier-a', col.a); this.root.style.setProperty('--tier-b', col.b); this.root.style.setProperty('--tier-glow', col.glow);
    [...this.pips.children].forEach((p, k) => p.classList.toggle('is-now', k === i));
    v.el.classList.add('is-top');
    v.el.classList.remove('pk-in-deck');
    const step = i + 2;
    if (cls === 'quick') {
      await this.wait(90);
      v.setDown(false);
      this.audio.tick(step, 0.18);
      this.fx.burst(...this.center(v), 'plain', 0.3);
      this.showRibbon(v, false);
    } else {
      // the tease: the back glows in the tier colour, stronger the bigger the hit
      v.el.classList.add(`pk-tease-${cls}`);
      if (cls !== 'flip') this.root.classList.add('pk-teasing');
      if (cls === 'held' || (v.aura.rays && cls !== 'flip')) { this.rays.classList.add('is-on'); if (cls === 'held') this.shakeDeck(1.5); }
      if (this.reduced) this.prompt.dataset.hint = `${col.name} next`;
      let pulses = 0;
      const pulseT = cls === 'flip' ? 0 : window.setInterval(() => { if (!this.fast) this.audio.pulse(v.hit); pulses++; }, 900);
      if (cls !== 'flip' && !this.fast) this.audio.pulse(v.hit);
      await this.wait(cls === 'flip' ? 120 : 380);
      if (revealBy(v.hit, this.reduced) === 'shake') await this.waitShakeReveal(v, i);
      else {
        // reduced motion: the hit's glow shows (still, no bursts) while it's held open
        const glow = this.reduced && v.rv.tier !== 'calm';
        if (glow) v.el.classList.add('pk-shake-down');
        await this.waitFlipGesture(v, cls as 'flip' | 'charged' | 'held');
        if (glow) v.el.classList.remove('pk-shake-down');
      }
      clearInterval(pulseT); void pulses;
      this.shakeDeck(0);
      // the flip
      const rv = v.rv, big = !this.reduced && !this.fast;
      const slow = big ? rv.slowmoMs : 0;
      const dur = (this.fast ? 180 : cls === 'flip' ? 380 : cls === 'charged' ? 720 : 950) + slow;
      v.el.style.setProperty('--flip', `${dur}ms`);
      v.el.classList.toggle('pk-slowmo', slow > 0);
      if (big && rv.push > 1) { this.deck.style.setProperty('--push', String(rv.push)); this.deck.classList.remove('pk-push'); void this.deck.offsetWidth; this.deck.classList.add('pk-push'); }
      if (this.reduced && rv.tier !== 'calm') v.el.classList.add('pk-soft-glow');
      if (cls !== 'flip' || v.rv.tier !== 'calm') this.doFlash(v.hit);
      v.el.classList.remove(`pk-tease-${cls}`);
      v.setDown(false);
      this.audio.tick(step, 0.2);
      await this.wait(dur * 0.45);
      this.root.classList.remove('pk-teasing');
      this.audio.stinger(v.fx, step, v.card.shiny);
      this.fx.burst(...this.center(v), v.fx, v.hit / 5, v.card.shiny);
      if (big) this.payoff(v);
      if (v.aura.rays && !this.reduced) this.rays.classList.add('is-spin');
      if (v.hit >= 4 && !this.reduced) { this.shakeKick = 3 + v.hit; this.camShake(v.hit); }
      v.el.classList.add('is-revealed');
      this.showRibbon(v, true);
    }
    if (v.card.isNew) { setTimeout(() => { v.el.classList.add('pk-new-in'); this.audio.newBadge(); }, this.fast ? 40 : 260); }
    const pip = this.pips.children[i] as HTMLElement | undefined;
    if (pip) { pip.style.setProperty('--c', col.b); pip.classList.add('is-done'); }
    await this.waitAdvance(v, i);
    this.rays.classList.remove('is-on', 'is-spin');
  }

  private center(v: CardView): [number, number] {
    const r = v.el.getBoundingClientRect(), R = this.root.getBoundingClientRect();
    return [r.left - R.left + r.width / 2, r.top - R.top + r.height / 2];
  }

  /** the reveal's payoff, scaled by tier (revealFx): rings, shards, a ray sweep, the sheen, and for gold / SIR the bloom and glitter */
  private payoff(v: CardView) {
    const rv = v.rv, [x, y] = this.center(v);
    if (rv.sheen) { v.el.classList.remove('is-sheen'); void v.el.offsetWidth; v.el.classList.add('is-sheen'); }
    for (let k = 0; k < rv.rings; k++) {
      const ring = el('div', 'pk-shock', this.stage);
      ring.style.animationDelay = `${k * 140}ms`;
      setTimeout(() => ring.remove(), 1100 + k * 140);
    }
    if (rv.shards) this.fx.shards(x, y, ['#ffffff', ...v.aura.colors], rv.shards, rv.tier === 'top' ? 1100 : 700);
    if (rv.sweep) {
      this.rays.classList.remove('is-sweep', 'is-spin'); void this.rays.offsetWidth; this.rays.classList.add('is-sweep');
      setTimeout(() => { this.rays.classList.remove('is-sweep'); if (v.aura.rays || rv.tier === 'top') this.rays.classList.add('is-spin'); }, 1500);
    }
    if (rv.bloom) {
      const b = el('div', 'pk-bloomflash', this.root);
      setTimeout(() => b.remove(), 1500);
      this.fx.glitterRain(v.aura.colors, 110, rv.flecks);
      this.audio.rarePack();
    }
  }

  private doFlash(hit: number) {
    if (this.reduced) return;
    this.flash.style.setProperty('--a', String(0.25 + hit * 0.13));
    this.flash.classList.remove('is-on'); void this.flash.offsetWidth; this.flash.classList.add('is-on');
  }

  private camShake(hit: number) {
    this.stage.classList.remove('pk-cam-shake'); void this.stage.offsetWidth;
    this.stage.style.setProperty('--cs', `${hit * 1.6}px`);
    this.stage.classList.add('pk-cam-shake');
  }

  private showRibbon(v: CardView, big: boolean) {
    const c = v.card;
    this.ribbon.innerHTML = '';
    el('b', '', this.ribbon, fxLabel(c));
    const sub: string[] = [];
    if (c.finish === 'reverse' && v.fx === 'reverse') sub.push('reverse holo');
    if (c.shiny) sub.push('✦ shiny');
    if (big && c.oneIn && c.oneIn > 1.5) sub.push(`1 in ${Math.round(c.oneIn)} packs`);
    if (sub.length) el('span', '', this.ribbon, sub.join(' · '));
    this.ribbon.classList.toggle('is-big', big);
    this.ribbon.classList.add('is-on');
  }

  // ------------------------------------------------------------------ 5. summary
  private async summary() {
    this.check();
    const res = this.result!;
    this.jumped = true; this.fast = false;
    this.setPhase('summary');
    this.root.classList.remove('pk-prompt-on', 'pk-teasing', 'pk-charging');
    this.ribbon.classList.remove('is-on');
    this.rays.classList.remove('is-on', 'is-spin');
    this.pack.style.display = 'none';
    this.deck.innerHTML = ''; this.pile.innerHTML = '';
    this.skipBtn.style.visibility = 'hidden';
    this.audio.droneLevel(0.03, 1);
    this.audio.summary();
    const cards = res.cards;
    const best = cards.reduce((a, c) => (hitOf(c) > hitOf(a) || (hitOf(c) === hitOf(a) && c.shiny && !a.shiny) ? c : a), cards[cards.length - 1]);
    const sum = el('div', 'pk-summary', this.root);
    const head = el('div', 'pk-summary__head', sum);
    const nNew = cards.filter(c => c.isNew).length;
    el('h2', '', head, res.setName ?? this.set.name);
    el('p', '', head, `${cards.length} cards · ${nNew} new · best: ${best.name} (${fxLabel(best)})`);
    const grid = el('div', 'pk-summary__grid', sum);
    grid.style.setProperty('--n', String(cards.length));
    const views = cards.map((c, i) => {
      const v = makeCard(c, this.imageBase, { setName: res.setName ?? this.set.name, reduced: this.reduced });
      v.setDown(false, true);
      v.el.classList.add('pk-sum-card', 'is-revealed');
      if (c.isNew) v.el.classList.add('pk-new-in');
      if (c === best) v.el.classList.add('is-best');
      v.el.style.animationDelay = `${i * (this.reduced ? 0 : 55)}ms`;
      const slot = el('div', 'pk-summary__slot', grid);
      slot.appendChild(v.el);
      el('div', 'pk-summary__label', slot, fxLabel(c));
      v.el.addEventListener('pointermove', (e) => v.tiltAt(e.clientX, e.clientY));
      v.el.addEventListener('pointerleave', () => v.tiltReset());
      return v;
    });
    void views;
    const bar = el('div', 'pk-summary__bar', sum);
    if (this.opts.onOpenAnother) {
      const again = el('button', 'pk-btn', bar, 'Open another') as HTMLButtonElement; again.type = 'button';
      again.addEventListener('click', () => { this.finish(); this.opts.onOpenAnother?.(); });
    }
    const doneBtn = el('button', 'pk-btn pk-btn--main', bar, 'Done') as HTMLButtonElement; doneBtn.type = 'button';
    doneBtn.addEventListener('click', () => this.finish());
    setTimeout(() => doneBtn.focus({ preventScroll: true }), 300);
    if (hitOf(best) >= 4 && !this.reduced) this.fx.rain(['#ffe07a', '#ff9ad5', '#9ff3ff', '#ffffff', '#b58cff'], 90);
    this.keyWaiter = (k) => { if (k === 'Enter') this.finish(); };
  }

  private finish() {
    if (this.phase === 'done') return;
    this.setPhase('done');
    this.resolveDone(this.result!);
  }

  /** re-skin later (the set's art arrived after the pack did): see applySkin */
  reskin(k: Reskin) { this.applySkin(k); }

  // ------------------------------------------------------------------ skip / destroy
  skip() {
    this.audio.unlock();
    if (this.phase === 'summary' || this.phase === 'done') return;
    if (this.fast) { this.jumpToSummary(); return; }
    this.fast = true;
    this.skipBtn.textContent = 'To the summary';
    if (this.phase === 'idle' || this.phase === 'tearing') void this.tearAuto?.();
    this.wakeAll();
    this.skipNow?.();
  }

  jumpToSummary() {
    if (!this.result || this.phase === 'summary' || this.phase === 'done') { if (!this.result) this.skip(); return; }
    this.jumped = true; this.fast = true;
    this.wakeAll();
    this.skipNow?.();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.wakeAll();
    this.stopCard?.();
    cancelAnimationFrame(this.raf);
    this.listeners.forEach(([t, ty, fn, o]) => t.removeEventListener(ty, fn, o));
    this.fx.destroy();
    this.audio.close();
    this.root.remove();
  }
}

const SVG_SOUND = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
const SVG_MUTED = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
