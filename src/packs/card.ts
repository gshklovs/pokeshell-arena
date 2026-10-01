// One card of the pack: our own back, the face (pokeshell's web-export image in a card chassis), the foil layers of
// its effect family, tilt parallax, and the NEW! sticker.
import type { Fx, PackCard } from './types';
import { FRAME, FX_COLOR, TIER_SYMBOL, auraOf, fxLabel, fxOf, hitOf, revealFx, type Aura, type RevealFx } from './tiers';

const FULL: Fx[] = ['full-art', 'alt-art', 'rainbow', 'gold'];

export interface CardView {
  el: HTMLElement;
  card: PackCard;
  fx: Fx;
  hit: number;
  /** the rarity aura (tiers.ts auraOf) */
  aura: Aura;
  /** how much show it gets before and during its reveal (tiers.ts revealFx) */
  rv: RevealFx;
  ready: Promise<void>;
  setDown(down: boolean, instant?: boolean): void;
  tiltAt(clientX: number, clientY: number): void;
  tiltReset(): void;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** the art's backdrop tint and whether it's a sprite (transparent) or a full scene */
function analyse(img: HTMLImageElement): { tint: string; sprite: boolean } {
  try {
    const w = img.naturalWidth, hh = img.naturalHeight;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
    const g = cv.getContext('2d')!; g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, hh).data;
    let transparent = 0, r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 20) { transparent++; continue; }
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
      if (mx - mn > 50 && mx > 60) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
    }
    const tint = n ? `rgb(${(r / n) | 0},${(gg / n) | 0},${(b / n) | 0})` : '#9aa4b0';
    return { tint, sprite: transparent > (w * hh) * 0.15 };
  } catch { return { tint: '#9aa4b0', sprite: false }; }
}

export function makeCard(card: PackCard, imageBase: string, opts: { setName?: string; reduced: boolean }): CardView {
  const fx = fxOf(card), hit = hitOf(card), col = FX_COLOR[fx];
  const aura = auraOf(card);
  const rv = revealFx(card);
  const el = h('div', `pk-card pk-fx-${fx}${card.shiny ? ' pk-shiny' : ''}${FULL.includes(fx) ? ' pk-full' : ''} pk-aura-${aura.level}${aura.rays ? ' pk-aura-rays' : ''}`);
  el.dataset.fx = fx; el.dataset.hit = String(hit); el.dataset.aura = aura.level;
  el.classList.add(`pk-rv-${rv.tier}`);
  if (rv.flecks) el.classList.add('pk-rv-gold');
  if (rv.prism) el.classList.add('pk-rv-prism');
  const fr = FRAME[fx];
  el.style.cssText = `--c-a:${col.a};--c-b:${col.b};--glow:${col.glow};--f0:${fr[0]};--f1:${fr[1]};--f2:${fr[2]};--f3:${fr[3]};--f4:${fr[4]};--mx:.5;--my:.5;--rx:0deg;--ry:0deg;--au-a:${aura.a};--au-b:${aura.b};--au-i:${aura.intensity};--en:0;--spd:0;--pw:${rv.power}`;
  // the aura sits behind the card: a glow in the tier's colours (prismatic / rayed for the biggest hits)
  const au = h('div', 'pk-aura', el);
  h('div', 'pk-aura__glow', au);
  if (aura.rays || rv.rays) h('div', 'pk-aura__rays', au);
  // face down, a coloured light on the table under the bigger hits
  if (rv.floor) h('div', 'pk-card__floor', el);
  if (aura.prismatic) h('div', 'pk-aura__prism', au);
  // top tiers, face down: light rays peeking out from behind the card
  if (rv.rays) h('div', 'pk-peek', el);
  const tilt = h('div', 'pk-card__tilt', el);
  // the crisp part of the aura: a hairline of light around the card's edge with a tight, layered falloff
  h('div', 'pk-aura__edge', tilt);
  // the wider leak round the edges of a face-down hit (mid and top tiers)
  if (rv.leak) h('div', 'pk-aura__leak', tilt);
  const inner = h('div', 'pk-card__inner', tilt);

  // ---- the back: ours (a terminal prompt emblem on a deep foil), never the official back
  const back = h('div', 'pk-card__back', inner);
  const emblem = h('div', 'pk-back__emblem', back);
  emblem.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="pkbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#ff9d3d"/></linearGradient></defs>
    <circle cx="50" cy="50" r="44" fill="none" stroke="url(#pkbg)" stroke-width="5"/><circle cx="50" cy="50" r="34" fill="#0d1230" stroke="#2b3a8f" stroke-width="2"/>
    <path d="M32 38 L46 50 L32 62" fill="none" stroke="#ffe27a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><rect x="50" y="58" width="20" height="6" rx="2" fill="#ffe27a"/></svg>`;
  h('div', 'pk-back__word', back, 'pokeshell');
  h('div', 'pk-back__pulse', back);
  h('div', 'pk-back__edge', back);
  if (rv.prism) h('div', 'pk-back__prism', back);

  // ---- the face
  const front = h('div', 'pk-card__front', inner);
  const face = h('div', 'pk-face', front);
  const wash = h('div', 'pk-face__wash', face);
  const panel = h('div', 'pk-face__panel', face);
  const head = h('div', 'pk-face__head', panel);
  h('span', 'pk-face__name', head, card.name + (card.shiny ? ' ✦' : ''));
  if (card.number) h('span', 'pk-face__num', head, card.number);
  const art = h('div', 'pk-face__art', panel);
  const img = h('img', 'pk-face__img', art) as HTMLImageElement;
  img.alt = card.name; img.decoding = 'async'; img.draggable = false;
  const foot = h('div', 'pk-face__foot', panel);
  h('span', 'pk-face__rar', foot, `${TIER_SYMBOL[card.tier] ?? '★'} ${fxLabel(card)}`);
  h('span', 'pk-face__set', foot, card.setName ?? opts.setName ?? '');
  if (card.finish === 'reverse' || fx === 'reverse') h('div', 'pk-foil pk-foil--frame', face);
  h('div', `pk-foil pk-foil--${fx}`, front);
  if (card.shiny) h('div', 'pk-foil pk-foil--sparkle', front);
  h('div', 'pk-glare', front);
  if (card.isNew) h('div', 'pk-new', front, 'NEW!');
  if (card.shiny) h('div', 'pk-shinytag', front, '✦ shiny');

  const src = imageBase + card.image;
  const ready = new Promise<void>(resolve => {
    let triedPlain = false;
    img.onload = () => {
      const a = analyse(img);
      el.style.setProperty('--tint', a.tint);
      art.classList.toggle('is-sprite', a.sprite);
      wash.style.backgroundImage = `url("${img.src}")`;
      resolve();
    };
    img.onerror = () => {
      // shiny images exist once the shiny form has been exported: fall back to the regular art
      if (!triedPlain && /-shiny\.png$/.test(src)) { triedPlain = true; img.src = src.replace(/-shiny\.png$/, '.png'); return; }
      art.classList.add('is-missing'); resolve();
    };
    img.src = src;
  });

  let down = true;
  const setDown = (d: boolean, instant = false) => {
    down = d;
    if (instant) { inner.style.transition = 'none'; void inner.offsetWidth; }
    el.classList.toggle('is-down', d);
    if (instant) requestAnimationFrame(() => { inner.style.transition = ''; });
  };
  const tiltAt = (x: number, y: number) => {
    if (opts.reduced) return;
    const r = el.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (x - r.left) / r.width)), py = Math.min(1, Math.max(0, (y - r.top) / r.height));
    el.style.setProperty('--mx', px.toFixed(3)); el.style.setProperty('--my', py.toFixed(3));
    el.style.setProperty('--ry', `${((px - 0.5) * 26).toFixed(2)}deg`); el.style.setProperty('--rx', `${((0.5 - py) * 22).toFixed(2)}deg`);
    el.classList.add('is-tilting');
  };
  const tiltReset = () => {
    el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--mx', '.5'); el.style.setProperty('--my', '.5');
    el.classList.remove('is-tilting');
  };
  setDown(true, true);
  void down;
  // the foil sheen that sweeps the face as it turns over
  h('div', 'pk-sheen', front);
  return { el, card, fx, hit, aura, rv, ready, setDown, tiltAt, tiltReset };
}
