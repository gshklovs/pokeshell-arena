// The scene's CSS, injected once. Card sizes are in cqi (the card's own width), so a card reads the same big and small.
const CSS = /* css */ `
.pk-scene {
  --cw: 260px; --pw: 280px; --tier-a: #fff; --tier-b: #9aa4b5; --tier-glow: rgba(255,255,255,.6);
  --leak: rgba(215,225,245,.75); --leak-hi: #ffffff; --leak-w: 3px;
  --ff: Fredoka, "Segoe UI", system-ui, -apple-system, sans-serif;
  --ff-pix: Silkscreen, "Cascadia Mono", Consolas, ui-monospace, monospace;
  position: absolute; inset: 0; overflow: hidden; color: #f4f1ff; font-family: var(--ff);
  user-select: none; -webkit-user-select: none; touch-action: none; outline: none; background: #07060d;
  -webkit-tap-highlight-color: transparent;
}
.pk-scene * { box-sizing: border-box; }
.pk-bg {
  position: absolute; inset: -10%;
  background:
    radial-gradient(40% 32% at 50% 56%, color-mix(in oklab, var(--s2) 30%, transparent), transparent 70%),
    radial-gradient(75% 60% at 50% 45%, color-mix(in oklab, var(--s1) 55%, #0a0814), transparent 75%),
    radial-gradient(120% 90% at 50% 40%, color-mix(in oklab, var(--s0) 80%, #05040a), #040308 80%);
  transition: filter .6s, opacity .6s;
}
.pk-bg::after { /* floor light under the pack */
  content: ""; position: absolute; left: 50%; top: 78%; width: 60vmin; height: 10vmin; translate: -50% -50%;
  background: radial-gradient(closest-side, rgba(0,0,0,.55), transparent); filter: blur(6px);
}
.pk-teasing .pk-bg { filter: brightness(.55) saturate(1.2); }
.pk-rays {
  position: absolute; left: 50%; top: 50%; width: 170vmax; height: 170vmax; translate: -50% -50%; opacity: 0; pointer-events: none;
  /* hairline rays (two interleaved sets), sharp at the centre and falling off: crisp at any DPR, not wedges */
  background:
    repeating-conic-gradient(from 0deg, color-mix(in oklab, var(--tier-a) 85%, transparent) 0deg .45deg, transparent .45deg 6deg),
    repeating-conic-gradient(from 3deg, color-mix(in oklab, var(--tier-a) 55%, #fff) 0deg .22deg, transparent .22deg 9deg);
  -webkit-mask: radial-gradient(closest-side, #000 8%, rgba(0,0,0,.5) 30%, transparent 70%); mask: radial-gradient(closest-side, #000 8%, rgba(0,0,0,.5) 30%, transparent 70%);
  transition: opacity .6s; mix-blend-mode: screen;
}
.pk-rays.is-on { opacity: .35; animation: pk-spin 40s linear infinite; }
.pk-rays.is-spin { opacity: .8; animation: pk-spin 14s linear infinite; }
@keyframes pk-spin { to { rotate: 360deg; } }
.pk-particles { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 6; }
.pk-stage { position: absolute; inset: 0; display: grid; grid-template: minmax(0, 1fr) / minmax(0, 1fr); place-items: center; perspective: 1100px; z-index: 2; }
.pk-stage > * { grid-area: 1 / 1; }

/* ---------------------------------------------------------------- the pack */
.pk-pack { position: relative; width: var(--pw); aspect-ratio: 250 / 400; transform-style: preserve-3d; will-change: transform; cursor: grab; --gx: 50%; --gy: 40%; --tear: 0; }
.pk-pack__float { position: absolute; inset: 0; transform-style: preserve-3d; }
.pk-pack__body { position: absolute; inset: 0; }
.pk-pack__body svg { width: 100%; height: 100%; display: block; }
.pk-pack__seal { position: absolute; left: 0; top: 0; width: 100%; pointer-events: none; }
.pk-pack__seal svg { width: 100%; height: 100%; display: block; }
.pk-pack.is-torn .pk-pack__seal, .pk-pack.is-open .pk-pack__seal { display: none; }
.pk-pack__body { filter: drop-shadow(0 26px 30px rgba(0,0,0,.55)) drop-shadow(0 4px 6px rgba(0,0,0,.4)); }

/* the peeling strip: a chain of nested segments (scene.ts buildChain), each a column of the wrapper art */
.pk-pack__flap { position: absolute; left: 0; top: 0; width: 100%; transform-style: preserve-3d; transform: translateZ(4px); will-change: transform; pointer-events: none; }
.pk-seg { position: absolute; top: 0; height: 100%; width: 100%; transform-style: preserve-3d; }
.pk-seg__face, .pk-seg__back { position: absolute; top: 0; bottom: 0; left: -25%; right: -25%; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.pk-seg__face svg { width: 100%; height: 100%; display: block; overflow: hidden; }
.pk-seg__back svg { width: 100%; height: 100%; display: block; transform: scaleX(-1); }
.pk-seg__defs { position: absolute; width: 0; height: 0; overflow: hidden; }
/* the light and shade of each segment: stop above the lowest teeth of the torn edge, so no clip is needed */
.pk-seg__edge { position: absolute; inset: 0; pointer-events: none; visibility: hidden; }
.pk-seg__edge svg { width: 100%; height: 100%; display: block; overflow: visible; }
.pk-seg__spec, .pk-seg__shade { position: absolute; left: 16.67%; right: 16.67%; top: 11%; height: 80%; opacity: 0; pointer-events: none; }
.pk-seg__spec { background: linear-gradient(180deg, rgba(255,255,255,.5), rgba(255,255,255,.95) 55%, rgba(255,255,255,.35)); }
.pk-seg__shade { background: linear-gradient(180deg, rgba(8,6,20,.7), rgba(8,6,20,.55) 80%, rgba(8,6,20,.2)); }
/* the inner lining: what you see when the foil curls over (brushed silver with the crimp's ridges, in the SVG) */
.pk-seg__back { transform: rotateY(180deg); }

/* the torn rim over the body: mouth, foil layers, shadow and the tear line (clipped to the torn part in JS) */
.pk-rim { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.pk-rim__light { fill: var(--leak-hi); opacity: 0; }
.pk-rim__shadow { opacity: 0; }

/* the light leaking out: a plume over the opening, rays for the big ones, a bloom behind the pack */
.pk-pack__glow {
  position: absolute; left: -45%; width: 190%; height: calc(var(--pw) * 1.25); margin-top: calc(var(--pw) * -1.25 * .72);
  transform-origin: 50% 72%; opacity: 0; pointer-events: none; will-change: transform, opacity;
  background:
    radial-gradient(26% 1.4% at 50% 72%, var(--leak-hi), transparent 100%),
    radial-gradient(30% 7% at 50% 72%, color-mix(in oklab, var(--leak) 45%, transparent), transparent 100%);
}
.pk-pack__beams {
  position: absolute; left: -35%; width: 170%; height: calc(var(--pw) * 1.5); transform-origin: 50% 100%; opacity: 0; pointer-events: none;
  will-change: transform, opacity; background: no-repeat center bottom / 100% 100%;
}
.pk-scene[data-phase=tearing] .pk-pack__beams { animation: pk-sway 5s ease-in-out infinite alternate; }
@keyframes pk-sway { from { rotate: -4deg; } to { rotate: 4deg; } }
.pk-leak-prism[data-phase=tearing] .pk-pack__glow { animation: pk-prism-hue 3.2s linear infinite; }
@keyframes pk-prism-hue { to { filter: hue-rotate(360deg); } }
.pk-leak-wrap { position: absolute; inset: 0; pointer-events: none; opacity: 0; }
.pk-leak { position: absolute; overflow: visible; mix-blend-mode: screen; }
.pk-leak-prism .pk-leak { animation: pk-prism-hue 4s linear infinite; }
.pk-pack.is-pop .pk-leak-wrap { animation: pk-leak-pop .8s cubic-bezier(.2,.8,.3,1) both; }
@keyframes pk-leak-pop { 0% { opacity: 1; } 35% { opacity: 1; transform: scale(1.06, 1.25); transform-origin: 50% 15%; } 100% { opacity: 0; } }
.pk-rim__core { opacity: 0; }
.pk-bloom {
  width: calc(var(--pw) * 2.4); aspect-ratio: 1; border-radius: 50%; opacity: 0; pointer-events: none; will-change: transform, opacity;
  background: radial-gradient(closest-side, color-mix(in oklab, var(--leak) 70%, transparent), color-mix(in oklab, var(--leak) 22%, transparent) 55%, transparent);
}
/* the tear head: a crisp glint riding the tear front */
.pk-tearhead {
  position: absolute; left: 0; width: 0; height: 0; opacity: 0; transition: opacity .15s; pointer-events: none; will-change: transform;
}
.pk-tearhead::before, .pk-tearhead::after {
  content: ""; position: absolute; left: 0; top: 0; translate: -50% -50%; border-radius: 50%;
}
.pk-tearhead::before { width: 30px; height: 30px; background: radial-gradient(closest-side, var(--leak-hi), color-mix(in oklab, var(--leak) 60%, transparent) 45%, transparent); }
.pk-tearhead::after { width: 22px; height: 22px; border-radius: 0;
  background: linear-gradient(#fff, #fff) center / 100% 1.5px no-repeat, linear-gradient(#fff, #fff) center / 1.5px 100% no-repeat;
  -webkit-mask: radial-gradient(closest-side, #000 20%, transparent); mask: radial-gradient(closest-side, #000 20%, transparent);
}
.pk-scene[data-phase=tearing] .pk-tearhead::after { animation: pk-glint .5s linear infinite; }
@keyframes pk-glint { to { rotate: 90deg; } }
/* the pop: light bursting out of the mouth when the strip comes off */
.pk-pack.is-pop .pk-pack__glow { animation: pk-pop .7s cubic-bezier(.2,.8,.3,1) both; }
@keyframes pk-pop { 0% { opacity: 1; scale: 1; } 30% { opacity: 1; scale: calc(1 + var(--pop, .5) * .9) calc(1 + var(--pop, .5) * 1.6); } 100% { opacity: 0; scale: 1.2 1.4; } }
.pk-pack__glare {
  position: absolute; inset: 0; pointer-events: none; border-radius: 2%; z-index: 3; mix-blend-mode: overlay;
  background:
    radial-gradient(40% 30% at var(--gx) var(--gy), rgba(255,255,255,.75), transparent 70%),
    linear-gradient(115deg, transparent 30%, rgba(255,255,255,.22) 45%, transparent 55%);
  background-size: 100% 100%, 250% 100%;
  background-position: 0 0, calc(var(--gx) * 1.4) 0;
}
.pk-w-title { font: 800 30px/1 var(--ff); fill: #fff; stroke: rgba(0,0,0,.45); stroke-width: 5px; paint-order: stroke; letter-spacing: .5px; }
.pk-w-series { font: 700 9px/1 var(--ff-pix); fill: rgba(255,255,255,.85); letter-spacing: 2px; }
.pk-w-booster { font: 800 17px/1 var(--ff); fill: #fff; letter-spacing: 6px; stroke: rgba(0,0,0,.35); stroke-width: 3px; paint-order: stroke; }
.pk-w-meta { font: 700 8px/1 var(--ff-pix); fill: rgba(255,255,255,.8); letter-spacing: 1px; }
.pk-hint { position: absolute; left: 4%; right: 4%; height: 0; z-index: 4; pointer-events: none; transition: opacity .3s; }
.pk-hint__line { position: absolute; left: 0; right: 0; top: -1px; border-top: 2px dashed rgba(255,255,255,.75); filter: drop-shadow(0 0 4px rgba(255,255,255,.8)); }
.pk-hint__hand {
  position: absolute; top: -14px; left: 0; width: 26px; height: 26px; border-radius: 50%;
  background: radial-gradient(circle, #fff 30%, rgba(255,255,255,.3) 55%, transparent 70%);
  animation: pk-hand 2.2s cubic-bezier(.5,0,.3,1) infinite;
}
@keyframes pk-hand { 0% { left: 0; opacity: 0; } 15% { opacity: 1; } 80% { opacity: 1; left: calc(100% - 26px); } 100% { opacity: 0; left: calc(100% - 26px); } }
.pk-hint__text {
  position: absolute; left: 50%; top: calc(100% + 26px); translate: -50% 0; white-space: nowrap; pointer-events: none;
  font: 600 15px/1 var(--ff); color: rgba(255,255,255,.8); letter-spacing: .3px; text-shadow: 0 2px 8px rgba(0,0,0,.6);
}
.pk-hint-pulse .pk-hint__line { animation: pk-blink 1.1s ease-in-out infinite; }
.pk-hint-pulse .pk-hint__text { animation: pk-blink 1.1s ease-in-out infinite; }
@keyframes pk-blink { 50% { opacity: .35; } }
.pk-hint-off .pk-hint, .pk-hint-off .pk-hint__text, .pk-pack.is-torn .pk-hint, .pk-pack.is-torn .pk-hint__text, .pk-pack.is-torn .pk-open-btn { opacity: 0; }
.pk-open-btn { position: absolute; left: 50%; top: calc(100% + 18px); translate: -50% 0; white-space: nowrap; }
/* a tap on the pack (TAP_OPENS = false): the hand sweeps again and the dashed line flashes */
.pk-hint-nudge .pk-hint__hand { animation: pk-hand 1.1s cubic-bezier(.5,0,.3,1) 2; }
.pk-hint-nudge .pk-hint__text { color: #fff; }

/* ---------------------------------------------------------------- a random pack: the mystery wrapper, then the roll */
.pk-w-q { font: 800 20px/1 var(--ff); }
.pk-w-bigq { font: 800 118px/1 var(--ff); stroke: rgba(40,44,60,.35); stroke-width: 4px; paint-order: stroke; }
/* the mystery foil: a slow sheen sweeps across it while the host rolls */
.pk-mystery .pk-pack__body::after {
  content: ""; position: absolute; inset: 0; pointer-events: none; mix-blend-mode: overlay;
  background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.75) 48%, rgba(190,230,255,.5) 52%, transparent 65%) no-repeat;
  background-size: 260% 100%; animation: pk-sheen 1.6s ease-in-out infinite;
}
@keyframes pk-sheen { from { background-position: 130% 0; } to { background-position: -30% 0; } }
/* the ribbon on the pack: "rolling a pack…", then "Base Set pack! · 1 in 61" */
.pk-packtag {
  position: absolute; left: 50%; bottom: 4.5%; translate: -50% 0; z-index: 5; pointer-events: none; white-space: nowrap;
  display: flex; align-items: baseline; gap: 10px; padding: 8px 16px 7px; border-radius: 999px; opacity: 0; transform: translateY(6px) scale(.9);
  background: rgba(10,9,20,.72); border: 1px solid rgba(255,255,255,.22); box-shadow: 0 6px 22px rgba(0,0,0,.45); backdrop-filter: blur(6px);
  transition: opacity .25s, transform .35s cubic-bezier(.2,1.5,.4,1);
}
.pk-packtag.is-on { opacity: 1; transform: none; }
.pk-packtag b { font: 700 17px/1 var(--ff); color: #fff; letter-spacing: .2px; }
.pk-packtag span { font: 700 11px/1 var(--ff-pix); letter-spacing: .08em; color: var(--sa); }
.pk-packtag.is-rolling b { font-weight: 600; font-size: 14px; color: rgba(255,255,255,.8); }
.pk-packtag__dots { display: inline-flex; gap: 3px; }
.pk-packtag__dots i { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,.85); animation: pk-dot 1s ease-in-out infinite; }
.pk-packtag__dots i:nth-child(2) { animation-delay: .15s; } .pk-packtag__dots i:nth-child(3) { animation-delay: .3s; }
@keyframes pk-dot { 50% { opacity: .2; transform: translateY(-3px); } }
.pk-packtag.is-pop { animation: pk-tag-pop .55s cubic-bezier(.2,1.6,.4,1); }
@keyframes pk-tag-pop { 0% { transform: scale(.6); } }
.pk-packtag.is-rare { background: linear-gradient(160deg, #3b2a05, #120d02); border-color: #ffd35a; box-shadow: 0 0 0 1px #6b4a0c, 0 0 34px rgba(255,211,90,.55), 0 6px 22px rgba(0,0,0,.45); }
.pk-packtag.is-rare b { color: #ffe07a; text-shadow: 0 2px 0 #7a5208, 0 0 16px rgba(255,211,90,.6); font-size: 19px; }
.pk-packtag.is-rare span { color: #fff4c2; }
.pk-packtag.is-rare.is-pop { animation: pk-tag-slam .8s cubic-bezier(.2,1.6,.4,1); }
@keyframes pk-tag-slam { 0% { transform: scale(2); opacity: 0; } 60% { opacity: 1; } }
/* the re-skin: a foil flash sweeps over the pack as its art changes to the rolled set */
.pk-pack__float::after {
  content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0; z-index: 4;
  background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,.95) 46%, color-mix(in oklab, var(--sa) 70%, #fff) 54%, transparent 80%) no-repeat;
  background-size: 300% 100%;
}
.pk-pack__float.is-reskin::after { animation: pk-reskin .7s ease-out; }
@keyframes pk-reskin { 0% { opacity: 1; background-position: 120% 0; } 70% { opacity: .9; } 100% { opacity: 0; background-position: -20% 0; } }
.pk-pack__float.is-reskin .pk-pack__body { animation: pk-reskin-pop .5s cubic-bezier(.2,1.5,.4,1); }
@keyframes pk-reskin-pop { 0% { filter: brightness(2.2) saturate(.2) drop-shadow(0 26px 30px rgba(0,0,0,.55)); scale: .96; } }
.pk-rays.is-gold { --tier-a: #ffd35a; opacity: .7; animation: pk-spin 14s linear infinite; }
.pk-pack.is-open .pk-pack__body, .pk-pack.is-open .pk-rim, .pk-pack.is-open .pk-pack__glare {
  transform: translateY(75%) rotate(5deg); opacity: 0; transition: transform .75s cubic-bezier(.55,0,.85,.35), opacity .6s .15s;
}
.pk-pack.is-open .pk-pack__glow, .pk-pack.is-open .pk-pack__beams { opacity: 0 !important; transition: opacity .6s; }
.pk-scene[data-phase=reveal] .pk-bloom, .pk-scene[data-phase=summary] .pk-bloom { opacity: 0 !important; transition: opacity .8s; }

/* ---------------------------------------------------------------- the deck and the cards */
.pk-deck { position: relative; width: var(--cw); aspect-ratio: 63 / 88; opacity: 0; pointer-events: none; z-index: 3; }
.pk-deck.is-rising { opacity: 1; animation: pk-rise .6s cubic-bezier(.2,1.3,.4,1) both; }
@keyframes pk-rise { from { transform: translateY(35%) scale(.82); opacity: 0; } to { transform: none; opacity: 1; } }
.pk-card {
  position: absolute; inset: 0; container-type: inline-size; border-radius: 4.6% / 3.3%;
  transition: transform .5s cubic-bezier(.2,1.1,.3,1), opacity .4s; transform-style: preserve-3d;
}
.pk-card.pk-in-deck { transform: translate(calc(var(--i, 0) * -.7px), calc(var(--i, 0) * 1.3px)); }
.pk-deck.is-fanned .pk-card { transform: translate(var(--fan-x), var(--fan-y)) rotate(var(--fan-r)); }
.pk-card__tilt { position: absolute; inset: 0; transform-style: preserve-3d; transform: rotateX(var(--rx)) rotateY(var(--ry)); transition: transform .45s cubic-bezier(.2,.9,.3,1); border-radius: inherit; }
.pk-card.is-tilting .pk-card__tilt { transition: transform .07s linear; }
.pk-card__inner { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform var(--flip, .4s) cubic-bezier(.3,.75,.25,1.12); border-radius: inherit; }
.pk-card.is-down .pk-card__inner { transform: rotateY(180deg); }
.pk-card__front, .pk-card__back { position: absolute; inset: 0; border-radius: inherit; backface-visibility: hidden; -webkit-backface-visibility: hidden; overflow: hidden; }
.pk-card__front { box-shadow: 0 1px 2px rgba(0,0,0,.4), 0 6cqi 14cqi -4cqi rgba(0,0,0,.6); }
.pk-card__back {
  transform: rotateY(180deg);
  background:
    repeating-linear-gradient(60deg, rgba(255,255,255,.035) 0 2px, transparent 2px 9px),
    repeating-linear-gradient(-60deg, rgba(255,255,255,.035) 0 2px, transparent 2px 9px),
    radial-gradient(80% 60% at 50% 42%, #2b3a8f, #121a47 60%, #080b22);
  border: 3.6cqi solid #0b0f2c; box-shadow: inset 0 0 0 1.1cqi #d9a93a, inset 0 0 0 1.6cqi #0b0f2c, 0 1px 2px rgba(0,0,0,.4), 0 6cqi 14cqi -4cqi rgba(0,0,0,.6);
  display: grid; place-items: center;
}
.pk-back__emblem { width: 52%; aspect-ratio: 1; filter: drop-shadow(0 0 4cqi rgba(255,210,90,.35)); }
.pk-back__emblem svg { width: 100%; height: 100%; display: block; }
.pk-back__word { position: absolute; bottom: 10%; font: 700 7cqi/1 var(--ff-pix); color: #e7c460; letter-spacing: .6cqi; text-shadow: 0 0 3cqi rgba(255,200,80,.5); }
.pk-back__pulse, .pk-back__edge { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; opacity: 0; transition: opacity .3s; }
.pk-back__pulse { background: radial-gradient(70% 55% at 50% 45%, var(--glow), transparent 70%); mix-blend-mode: screen; }
.pk-back__edge { box-shadow: inset 0 0 0 1.4cqi var(--c-b), inset 0 0 8cqi 2cqi var(--glow); }
.pk-card.pk-tease-flip .pk-back__edge { opacity: .55; }
.pk-card.pk-tease-charged .pk-back__edge { opacity: 1; }
.pk-card.pk-tease-charged .pk-back__pulse { animation: pk-pulse .9s ease-in-out infinite; }
.pk-card.pk-tease-charged .pk-card__back { animation: pk-glow .9s ease-in-out infinite; }
.pk-card.pk-tease-held .pk-back__edge { opacity: 1; }
.pk-card.pk-tease-held .pk-back__pulse { animation: pk-pulse .6s ease-in-out infinite; }
.pk-card.pk-tease-held .pk-card__back { animation: pk-glow-big .6s ease-in-out infinite; }
.pk-card.pk-tease-held .pk-card__tilt { animation: pk-throb .6s ease-in-out infinite; }
@keyframes pk-pulse { 0%, 100% { opacity: .15; } 50% { opacity: 1; } }
@keyframes pk-glow { 0%, 100% { box-shadow: inset 0 0 0 1.1cqi #d9a93a, 0 0 4cqi 0 var(--glow); } 50% { box-shadow: inset 0 0 0 1.1cqi #fff, 0 0 18cqi 6cqi var(--glow); } }
@keyframes pk-glow-big { 0%, 100% { box-shadow: inset 0 0 0 1.1cqi #fff, 0 0 10cqi 2cqi var(--glow); } 50% { box-shadow: inset 0 0 0 1.4cqi #fff, 0 0 34cqi 14cqi var(--glow); } }
@keyframes pk-throb { 50% { scale: 1.035; } }
.pk-card.is-flung { pointer-events: none; }
.pk-card.is-top { z-index: 200 !important; }

/* ---- the rarity aura (tiers.ts auraOf), behind the card; --en is the shake energy, --spd the card's speed */
/* far enough behind the card that a hard tilt never cuts through it (scaled back up for the perspective) */
.pk-aura { position: absolute; inset: -34% -40%; pointer-events: none; opacity: 0; transition: opacity .6s; transform: translateZ(-190px) scale(1.17); }
.pk-card:not(.is-down) .pk-aura { opacity: min(1, calc(var(--au-i) * (1.05 + var(--en) * .6))); }
.pk-aura__glow, .pk-aura__rays, .pk-aura__prism { position: absolute; inset: 0; border-radius: 50%; }
/* a quiet backdrop now (the light lives in the edge line and the rays): a low, even halo, no blob */
.pk-aura__glow {
  background: radial-gradient(closest-side, var(--au-b) 40%, color-mix(in oklab, var(--au-b) 45%, transparent) 52%, color-mix(in oklab, var(--au-b) 12%, transparent) 66%, transparent 78%);
  opacity: calc(.2 + var(--au-i) * .7); scale: calc(.86 + var(--en) * .28 + var(--spd) * .06);
}
.pk-aura-none .pk-aura__glow { opacity: .25; }
/* hairline rays: two interleaved sets of sub-degree lines, sharp at the card and falling off outwards */
.pk-aura__rays {
  inset: -30%;
  background:
    repeating-conic-gradient(from 0deg, var(--au-a) 0deg .35deg, transparent .35deg 7deg),
    repeating-conic-gradient(from 3.2deg, color-mix(in oklab, var(--au-b) 90%, #fff) 0deg .2deg, transparent .2deg 11deg);
  -webkit-mask: radial-gradient(closest-side, #000 26%, rgba(0,0,0,.55) 42%, rgba(0,0,0,.12) 64%, transparent 80%); mask: radial-gradient(closest-side, #000 26%, rgba(0,0,0,.55) 42%, rgba(0,0,0,.12) 64%, transparent 80%);
  opacity: calc(.55 + var(--en) * .45); animation: pk-spin 24s linear infinite;
}
/* prismatic: a thin chromatic ring (a sheen, not a smear) plus a fainter outer echo */
.pk-aura__prism {
  inset: -6%;
  background: conic-gradient(from 0deg, #ff6fb5, #ffb86b, #fff27a, #7dff9c, #6fd8ff, #9f8bff, #ff6fb5);
  -webkit-mask: radial-gradient(closest-side, transparent 41%, #000 43%, #000 44.5%, transparent 46.5%, rgba(0,0,0,.35) 50%, transparent 58%); mask: radial-gradient(closest-side, transparent 41%, #000 43%, #000 44.5%, transparent 46.5%, rgba(0,0,0,.35) 50%, transparent 58%);
  opacity: calc(.7 + var(--en) * .3); animation: pk-spin 6s linear infinite;
}
/* the edge light: a 1px line in the aura's colour with a tight layered falloff; shake energy brightens it through
   opacity only (re-rasterising the blurred shadows per energy step cost frames) */
.pk-aura__edge {
  position: absolute; inset: 0; border-radius: inherit; pointer-events: none; transform: translateZ(-1px); opacity: 0; transition: opacity .5s;
  box-shadow:
    0 0 0 1px color-mix(in oklab, var(--au-a) 90%, transparent),
    0 0 4px 1px var(--au-a),
    0 0 16px 2px var(--au-b),
    0 0 44px 0 color-mix(in oklab, var(--au-b) 45%, transparent);
}
/* shake to reveal: the face-down hit leaks its aura round the edges (honest: colour and strength from its tier),
   swelling with the shake energy; the back pulses (its tease class) */
.pk-card.is-down.pk-shake-down .pk-aura { opacity: min(1, calc(var(--au-i) * (.3 + var(--en) * 1.1))); }
.pk-card.is-down.pk-shake-down .pk-aura__edge { opacity: min(1, calc(.2 + var(--au-i) * .3 + var(--en) * .9)); }
.pk-card.is-down.pk-shake-down .pk-card__back { filter: brightness(calc(1 + var(--en) * .5)); }
/* ---- v4: before the reveal, escalating steeply by tier (revealFx): calm tiers stay quiet */
/* the wider leak round a face-down hit's edges: layered, crisp-cored, breathing on the top tiers */
.pk-aura__leak {
  position: absolute; inset: 0; border-radius: inherit; pointer-events: none; transform: translateZ(-2px); opacity: 0; transition: opacity .6s;
  box-shadow: 0 0 0 1.5px var(--au-a), 0 0 8px 2px var(--au-a), 0 0 26px 6px var(--au-b), 0 0 64px 12px color-mix(in oklab, var(--au-b) 40%, transparent);
}
.pk-card.is-down.pk-shake-down .pk-aura__leak { opacity: min(1, calc(var(--pw) * .55 + var(--en) * .7)); }
.pk-rv-mid.is-down.pk-shake-down .pk-aura__leak { opacity: min(.8, calc(var(--pw) * .35 + var(--en) * .5)); }
.pk-rv-top.is-down.pk-shake-down .pk-aura__leak {
  animation: pk-breathe 2.4s ease-in-out infinite;
  box-shadow: 0 0 0 2px var(--au-a), 0 0 10px 3px var(--au-a), 0 0 34px 10px var(--au-b), 0 0 90px 26px color-mix(in oklab, var(--au-b) 45%, transparent);
}
@keyframes pk-breathe { 50% { scale: 1.025; filter: brightness(1.35); } }
/* the peek: a crisp fan of rays right behind a face-down top hit (in front of the far aura, behind the card) */
.pk-peek {
  position: absolute; left: -65%; top: -45%; width: 230%; height: 190%; pointer-events: none; opacity: 0; transition: opacity .6s;
  transform: translateZ(-6px);
  background:
    repeating-conic-gradient(from 0deg, var(--au-a) 0deg .7deg, transparent .7deg 6deg),
    repeating-conic-gradient(from 2.6deg, color-mix(in oklab, var(--au-b) 85%, #fff) 0deg .35deg, transparent .35deg 9deg);
  -webkit-mask: radial-gradient(closest-side, #000 22%, rgba(0,0,0,.6) 40%, rgba(0,0,0,.15) 62%, transparent 80%); mask: radial-gradient(closest-side, #000 22%, rgba(0,0,0,.6) 40%, rgba(0,0,0,.15) 62%, transparent 80%);
}
.pk-rv-top.is-down.pk-shake-down .pk-peek { opacity: calc(.55 + var(--en) * .45); animation: pk-spin 30s linear infinite; }
/* rays peeking from behind a face-down top hit */
.pk-rv-top.is-down.pk-shake-down .pk-aura { opacity: min(1, calc(.45 + var(--en) * .55)); }
/* rays peeking from behind: bolder than the revealed card's hairlines, so they read round a face-down card */
.pk-rv-top.is-down.pk-shake-down .pk-aura__rays {
  opacity: calc(.7 + var(--en) * .3);
  background:
    repeating-conic-gradient(from 0deg, var(--au-a) 0deg .9deg, transparent .9deg 7.5deg),
    repeating-conic-gradient(from 3.4deg, color-mix(in oklab, var(--au-b) 90%, #fff) 0deg .4deg, transparent .4deg 11deg);
}
.pk-rv-top.is-down.pk-shake-down .pk-aura__glow { animation: pk-breathe-glow 2.4s ease-in-out infinite; }
@keyframes pk-breathe-glow { 50% { opacity: 1; scale: 1.06; } }
/* a slow floor glow under it, in its colour */
.pk-card__floor {
  position: absolute; left: -35%; right: -35%; top: 97%; height: 22%; pointer-events: none; opacity: 0; transition: opacity .8s;
  background: radial-gradient(closest-side, color-mix(in oklab, var(--au-a) 60%, transparent), color-mix(in oklab, var(--au-b) 45%, transparent) 40%, color-mix(in oklab, var(--au-b) 10%, transparent) 70%, transparent);
  transform: translateZ(-40px);
}
.pk-card.is-down.pk-shake-down .pk-card__floor { opacity: calc(var(--pw) * .5 + var(--en) * .4); }
.pk-rv-top.is-down.pk-shake-down .pk-card__floor { animation: pk-floor 2.4s ease-in-out infinite; }
@keyframes pk-floor { 50% { scale: 1.12 1; filter: brightness(1.3); } }
/* prismatic: a hue sweep across the back */
.pk-back__prism { position: absolute; inset: 0; pointer-events: none; overflow: hidden; border-radius: inherit; opacity: 0; transition: opacity .5s; mix-blend-mode: color-dodge; }
.pk-back__prism::before {
  content: ""; position: absolute; top: -20%; bottom: -20%; left: -60%; width: 60%;
  background: linear-gradient(100deg, transparent, #ff6fb5 25%, #fff27a 40%, #7dff9c 55%, #6fd8ff 70%, #9f8bff 85%, transparent);
  opacity: .55; animation: pk-prism-sweep 2.6s ease-in-out infinite;
}
@keyframes pk-prism-sweep { from { transform: translateX(0) skewX(-12deg); } to { transform: translateX(300%) skewX(-12deg); } }
.pk-card.is-down.pk-shake-down .pk-back__prism { opacity: calc(.55 + var(--en) * .45); }

/* ---- v4: the reveal's payoff */
/* slow-mo for the top tiers: the card hangs edge-on for a beat, then snaps round */
.pk-card.pk-slowmo .pk-card__inner { transition-timing-function: cubic-bezier(.05,.6,.95,.4); }
/* the foil sheen sweeping the revealed face */
.pk-sheen { position: absolute; inset: 0; pointer-events: none; overflow: hidden; border-radius: inherit; z-index: 6; }
.pk-sheen::before {
  content: ""; position: absolute; top: -30%; bottom: -30%; left: -70%; width: 45%; opacity: 0;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,.1) 30%, rgba(255,255,255,.85) 50%, color-mix(in oklab, var(--au-a) 60%, #fff) 56%, rgba(255,255,255,.1) 70%, transparent);
  mix-blend-mode: overlay;
}
.pk-card.is-sheen .pk-sheen::before { animation: pk-sheen-sweep .95s cubic-bezier(.3,.1,.3,1) both; }
@keyframes pk-sheen-sweep { 0% { opacity: 1; transform: translateX(0) skewX(-14deg); } 100% { opacity: .9; transform: translateX(420%) skewX(-14deg); } }
/* shockwave rings: a thin crisp ring with a faint inner halo, racing out */
.pk-shock { width: var(--cw); aspect-ratio: 1; border-radius: 50%; pointer-events: none; z-index: 3; opacity: 0;
  box-shadow: 0 0 0 1.5px var(--tier-a), 0 0 12px 1px var(--tier-a), inset 0 0 18px color-mix(in oklab, var(--tier-b) 60%, transparent);
  animation: pk-shock .85s cubic-bezier(.1,.7,.3,1) both; }
@keyframes pk-shock { 0% { opacity: 1; transform: scale(.35); } 100% { opacity: 0; transform: scale(2.6); } }
/* the camera push-in */
.pk-deck.pk-push { animation: pk-push 1.1s cubic-bezier(.2,.9,.3,1); }
@keyframes pk-push { 35% { scale: var(--push, 1.05); } 100% { scale: 1; } }
/* the light rays sweeping in behind the card */
.pk-rays.is-sweep { opacity: .9; animation: pk-ray-sweep 1.5s cubic-bezier(.2,.8,.3,1) both; }
@keyframes pk-ray-sweep { 0% { opacity: 0; rotate: -35deg; scale: .6; } 30% { opacity: 1; } 100% { opacity: .8; rotate: 12deg; scale: 1; } }
/* gold / SIR: the full-screen bloom */
.pk-bloomflash { position: absolute; inset: 0; z-index: 7; pointer-events: none; opacity: 0;
  background: radial-gradient(closest-side at 50% 46%, rgba(255,255,255,.95), color-mix(in oklab, var(--tier-a) 80%, transparent) 30%, color-mix(in oklab, var(--tier-b) 35%, transparent) 65%, transparent 100%);
  mix-blend-mode: screen; animation: pk-bloom 1.4s cubic-bezier(.2,.8,.3,1) both; }
@keyframes pk-bloom { 0% { opacity: 0; transform: scale(.5); } 15% { opacity: 1; } 100% { opacity: 0; transform: scale(1.6); } }
/* reduced motion: no slow-mo, no bursts; a soft glow instead */
.pk-reduced .pk-card.pk-soft-glow .pk-aura__edge { opacity: 1; }
.pk-reduced .pk-shock, .pk-reduced .pk-bloomflash { display: none; }
.pk-card:not(.is-down) .pk-aura__edge { opacity: min(1, calc(var(--au-i) * 1.2 + var(--en) * .4)); }
.pk-aura-none .pk-aura__edge { display: none; }
.pk-card.pk-sum-card .pk-aura__edge { opacity: calc(var(--au-i) * .6); }
.pk-aura-prismatic .pk-aura__edge { box-shadow: 0 0 0 1px rgba(255,255,255,.9), 0 0 4px 1px #ff9ad5, 0 0 14px 2px #7fdcff, 0 0 36px 0 rgba(191,139,255,.45); animation: pk-prism-hue 3s linear infinite; }
.pk-aura-gold .pk-aura__edge { box-shadow: 0 0 0 1px #fff3c0, 0 0 3px 1px #ffe07a, 0 0 14px 2px rgba(245,197,66,.9), 0 0 40px 2px rgba(255,184,40,.4); }
.pk-card.is-held { cursor: grabbing; }
/* pressed: the card lifts off the table at once (bigger, a deeper shadow) and stays lifted while held */
.pk-card .pk-card__tilt { scale: 1; transition: transform .45s cubic-bezier(.2,.9,.3,1), scale .18s cubic-bezier(.2,1.6,.4,1); }
.pk-card.is-held .pk-card__tilt { scale: 1.07; }
/* the peak of a shake: the edge light flares */
.pk-card.is-peak .pk-aura__edge { animation: pk-peak .55s ease-out; }
@keyframes pk-peak { 0% { opacity: 1; filter: brightness(2.2); } 100% { filter: none; } }
.pk-card.is-peak .pk-aura { animation: pk-peak-aura .55s ease-out; }
@keyframes pk-peak-aura { 30% { opacity: 1; scale: 1.08; } }
/* the one-time hint on the first hit */
.pk-shake-hint {
  position: absolute; left: 50%; top: 58%; translate: -50% 0; z-index: 30; pointer-events: none; display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; border-radius: 999px; background: rgba(10,9,20,.82); border: 1px solid rgba(255,255,255,.3); box-shadow: 0 8px 26px rgba(0,0,0,.5);
  animation: pk-hint-in .4s cubic-bezier(.2,1.6,.4,1) .5s both; transform: translateZ(40px); white-space: nowrap;
}
.pk-shake-hint b { font: 700 17px/1 var(--ff); color: #fff; }
.pk-shake-hint__hand { width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(circle, #fff 34%, rgba(255,255,255,.3) 56%, transparent 70%); animation: pk-wiggle .5s ease-in-out infinite alternate; }
@keyframes pk-wiggle { from { translate: -6px 0; } to { translate: 6px 0; } }
@keyframes pk-hint-in { from { opacity: 0; scale: .6; } }
.pk-shake-hint.is-out { opacity: 0; transition: opacity .25s; }
.pk-next { position: absolute; right: 22px; bottom: 5.5%; z-index: 9; }
.pk-card.is-shaking .pk-card__tilt { transition: none; }
.pk-card.is-shaking .pk-glare { opacity: calc(.35 + var(--spd) * .65 + var(--en) * .3); transition: none; }
.pk-card.is-shaking .pk-foil { filter: brightness(calc(1 + var(--en) * .35)); }
.pk-card.pk-sum-card .pk-aura { inset: -18% -22%; }
.pk-card.pk-sum-card:not(.is-down) .pk-aura { opacity: calc(var(--au-i) * .5); }
.pk-card.pk-sum-card .pk-aura__rays { display: none; }

/* ---- the face */
.pk-face { position: absolute; inset: 0; padding: 3.2cqi; border-radius: inherit; background: linear-gradient(135deg, var(--f0), var(--f1) 25%, var(--f2) 50%, var(--f3) 75%, var(--f4)); }
.pk-face__wash { position: absolute; inset: -12%; background-size: cover; background-position: center; opacity: 0; image-rendering: pixelated; }
.pk-face__panel {
  position: relative; height: 100%; border-radius: 2.4cqi; overflow: hidden; display: flex; flex-direction: column; gap: 1.4cqi; padding: 2.6cqi 3.2cqi 2.4cqi;
  background: radial-gradient(120% 55% at 50% 0%, rgba(255,255,255,.65), transparent 60%),
              linear-gradient(175deg, color-mix(in oklab, var(--tint, #9aa4b0) 22%, #fbf3dc), color-mix(in oklab, var(--tint, #9aa4b0) 40%, #eadfc2));
  color: #221a14;
}
.pk-face__head { display: flex; align-items: baseline; gap: 2cqi; min-width: 0; }
.pk-face__name { flex: 1; min-width: 0; font: 700 8cqi/1.15 var(--ff); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -.1cqi; }
.pk-face__num { flex: none; font: 700 4.4cqi/1 var(--ff-pix); opacity: .75; }
.pk-face__art {
  position: relative; flex: 1; min-height: 0; border-radius: 1cqi; overflow: hidden; display: grid; place-items: center;
  background: radial-gradient(circle at 50% 60%, color-mix(in oklab, var(--tint, #9aa4b0) 30%, #fff) 0%, color-mix(in oklab, var(--tint, #9aa4b0) 65%, #fff) 55%, color-mix(in oklab, var(--tint, #9aa4b0) 80%, #444) 120%);
  box-shadow: 0 0 0 1.2cqi #d9d3c3, 0 0 0 1.7cqi #8c8474, inset 0 0 3cqi rgba(0,0,0,.25); margin: 1.6cqi 1.6cqi .6cqi;
}
.pk-face__img { width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated; display: block; }
.pk-face__art.is-sprite .pk-face__img { object-fit: contain; padding: 8% 10% 4%; filter: drop-shadow(0 1.4cqi 1.2cqi rgba(0,0,0,.35)); }
.pk-face__art.is-missing::after { content: "?"; font: 700 20cqi/1 var(--ff-pix); color: rgba(0,0,0,.25); }
.pk-face__foot { display: flex; justify-content: space-between; align-items: center; gap: 2cqi; font: 700 3.7cqi/1.1 var(--ff-pix); text-transform: uppercase; letter-spacing: .2cqi; }
.pk-face__rar { flex: none; max-width: 62%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pk-face__set { opacity: .6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; }
/* full-bleed tiers: a dark panel washed with the art, the art window wide */
.pk-full .pk-face__wash { opacity: 1; filter: blur(5cqi) saturate(1.5) brightness(.75); }
.pk-full .pk-face__panel { background: rgba(12,10,22,.35); color: #fff; }
.pk-full .pk-face__name { text-shadow: 0 .5cqi 0 rgba(0,0,0,.5); }
.pk-full .pk-face__art { flex: 1; margin: 0 -3.2cqi; border-radius: 0; box-shadow: none; background: transparent; }
.pk-full .pk-face__art.is-sprite { background: radial-gradient(circle at 50% 60%, rgba(255,255,255,.35), transparent 70%); }
.pk-fx-gold.pk-full .pk-face__wash { filter: blur(6cqi) sepia(1) saturate(2.6) hue-rotate(-10deg) brightness(1.05); }
.pk-fx-gold.pk-full .pk-face__panel { background: rgba(120,80,10,.25); color: #3b2508; }
.pk-fx-gold.pk-full .pk-face__name { text-shadow: 0 .5cqi 0 rgba(255,240,190,.6); }
.pk-fx-rainbow.pk-full .pk-face__wash { filter: blur(6cqi) saturate(1.3) brightness(1.05); animation: pk-hue 6s linear infinite; }
@keyframes pk-hue { to { filter: blur(6cqi) saturate(1.3) brightness(1.05) hue-rotate(360deg); } }

/* ---- the foil layers (driven by --mx / --my, the pointer on the card) */
.pk-foil, .pk-glare { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; }
.pk-glare { background: radial-gradient(farthest-corner circle at calc(var(--mx) * 100%) calc(var(--my) * 100%), rgba(255,255,255,.55), rgba(255,255,255,.1) 30%, rgba(0,0,0,.25) 90%); mix-blend-mode: overlay; opacity: 0; transition: opacity .3s; }
.pk-card.is-tilting .pk-glare { opacity: .8; }
.pk-foil--plain { display: none; }
.pk-foil--frame {
  padding: 3.2cqi; opacity: .9; mix-blend-mode: color-dodge;
  background: linear-gradient(calc(110deg + var(--mx) * 60deg), transparent 20%, rgba(255,255,255,.9) 38%, rgba(160,200,255,.7) 46%, transparent 60%) 0 0 / 200% 100%;
  background-position: calc(var(--mx) * 100%) 0;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
}
.pk-foil--reverse { display: none; }
.pk-foil--holo {
  mix-blend-mode: color-dodge; opacity: .5;
  background:
    radial-gradient(circle at calc(var(--mx) * 100%) calc(var(--my) * 100%), rgba(255,255,255,.55), transparent 35%),
    repeating-linear-gradient(115deg, #ff7ad9 0%, #ffe38a 6%, #8affc1 12%, #6fd8ff 18%, #b58cff 24%, #ff7ad9 30%) calc(var(--mx) * 60%) calc(var(--my) * 60%) / 240% 240%;
  -webkit-mask: radial-gradient(rgba(0,0,0,.95) 1px, rgba(0,0,0,.35) 1.4px) 0 0 / 4cqi 4cqi; mask: radial-gradient(rgba(0,0,0,.95) 1px, rgba(0,0,0,.35) 1.4px) 0 0 / 4cqi 4cqi;
}
.pk-foil--full-art {
  mix-blend-mode: color-dodge; opacity: .55;
  background:
    repeating-linear-gradient(45deg, rgba(255,255,255,.18) 0 .5cqi, transparent .5cqi 2.2cqi),
    linear-gradient(calc(120deg + var(--mx) * 40deg), #ff8ad8, #ffe68a 20%, #8dffc6 40%, #7fd6ff 60%, #c49bff 80%, #ff8ad8) calc(var(--mx) * 100%) 0 / 300% 100%;
}
.pk-foil--alt-art {
  mix-blend-mode: soft-light; opacity: .9;
  background: radial-gradient(60% 50% at calc(var(--mx) * 100%) calc(var(--my) * 100%), rgba(255,240,250,.95), transparent 70%),
              linear-gradient(160deg, rgba(255,214,240,.6), rgba(191,240,230,.5), rgba(255,246,214,.6));
  animation: pk-alt 7s ease-in-out infinite alternate;
}
@keyframes pk-alt { to { filter: hue-rotate(40deg); } }
.pk-fx-alt-art .pk-face__img { filter: saturate(1.15) contrast(1.05); }
.pk-foil--rainbow {
  mix-blend-mode: color; opacity: .5;
  background: conic-gradient(from calc(var(--mx) * 360deg) at calc(var(--mx) * 100%) calc(var(--my) * 100%), #ff6fb5, #ffb86b, #fff27a, #7dff9c, #6fd8ff, #9f8bff, #ff6fb5);
  animation: pk-hue-f 5s linear infinite;
}
@keyframes pk-hue-f { to { filter: hue-rotate(360deg); } }
.pk-fx-rainbow .pk-glare { mix-blend-mode: color-dodge; }
.pk-foil--gold {
  mix-blend-mode: overlay; opacity: .85;
  background:
    linear-gradient(calc(100deg + var(--mx) * 50deg), transparent 30%, rgba(255,255,255,.95) 45%, transparent 58%) calc(var(--mx) * 100%) 0 / 250% 100%,
    radial-gradient(rgba(255,250,220,.9) .6px, transparent 1.3px) 0 0 / 3cqi 3cqi,
    linear-gradient(135deg, #fff3b0, #e7b93a 35%, #fffbe0 55%, #b8821a 80%, #f6d66a);
}
.pk-foil--radiant {
  mix-blend-mode: overlay; opacity: .6;
  background: repeating-conic-gradient(from calc(var(--mx) * 90deg) at 50% 45%, rgba(255,255,255,.9) 0deg 2deg, transparent 2deg 9deg);
  -webkit-mask: radial-gradient(circle at 50% 45%, transparent 8%, #000 60%); mask: radial-gradient(circle at 50% 45%, transparent 8%, #000 60%);
}
.pk-fx-radiant .pk-card__front { box-shadow: 0 0 0 .8cqi rgba(255,230,160,.9), 0 0 10cqi 2cqi rgba(255,190,90,.55), 0 6cqi 14cqi -4cqi rgba(0,0,0,.6); }
.pk-foil--shiny {
  mix-blend-mode: color-dodge; opacity: .6;
  background:
    radial-gradient(circle at calc(var(--mx) * 100%) calc(var(--my) * 100%), rgba(255,255,255,.6), transparent 40%),
    repeating-linear-gradient(135deg, rgba(210,200,240,.35) 0 1cqi, rgba(90,80,130,.2) 1cqi 3cqi);
}
.pk-foil--sparkle, .pk-fx-shiny .pk-foil--shiny::after {
  content: ""; mix-blend-mode: screen;
  background:
    radial-gradient(circle, #fff 0 .7cqi, transparent 1.2cqi) 12% 18% / 30% 26%,
    radial-gradient(circle, #fff 0 .5cqi, transparent 1cqi) 70% 64% / 22% 30%,
    radial-gradient(circle, #fffbe0 0 .6cqi, transparent 1.1cqi) 40% 80% / 36% 22%;
  animation: pk-twinkle 1.6s ease-in-out infinite;
}
.pk-fx-shiny .pk-foil--shiny::after { position: absolute; inset: 0; }
@keyframes pk-twinkle { 0%, 100% { opacity: .2; } 50% { opacity: 1; } }
/* foil shows once the card is face up */
.pk-card .pk-foil { transition: opacity .5s; }
.pk-card.is-down .pk-foil { opacity: 0; }

/* ---- stickers */
.pk-new {
  position: absolute; top: 10.5%; right: 3.5%; z-index: 5; width: 22cqi; aspect-ratio: 1; display: grid; place-items: center;
  font: 700 6.2cqi/1 var(--ff-pix); color: #3a1200; letter-spacing: .2cqi;
  background: radial-gradient(circle at 40% 35%, #fff7b0, #ffd23d 55%, #ff9b1f);
  clip-path: polygon(50% 0%, 61% 18%, 82% 10%, 80% 32%, 100% 40%, 86% 56%, 98% 76%, 76% 80%, 70% 100%, 52% 88%, 32% 100%, 26% 80%, 4% 78%, 14% 58%, 0% 40%, 20% 32%, 18% 10%, 39% 18%);
  transform: scale(0) rotate(-30deg); filter: drop-shadow(0 1cqi 1cqi rgba(0,0,0,.4));
}
.pk-card.pk-new-in .pk-new { animation: pk-slap .55s cubic-bezier(.2,1.6,.4,1) forwards; }
@keyframes pk-slap { 0% { transform: scale(2.2) rotate(-40deg); opacity: 0; } 60% { opacity: 1; } 100% { transform: scale(1) rotate(12deg); opacity: 1; } }
.pk-shinytag { position: absolute; left: 50%; bottom: 1.2%; translate: -50% 0; z-index: 5; padding: .8cqi 2.4cqi; border-radius: 99cqi; font: 700 4.2cqi/1 var(--ff-pix); color: #2a2050; background: linear-gradient(90deg, #fff, #e9e1ff, #fff); box-shadow: 0 0 4cqi rgba(255,255,255,.7); opacity: 0; transition: opacity .4s .3s; }
.pk-card:not(.is-down) .pk-shinytag { opacity: 1; }

/* ---------------------------------------------------------------- the HUD, ribbon, prompt, pips, pile, ring, flash */
.pk-hud { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; z-index: 10; pointer-events: none; }
.pk-hud > * { pointer-events: auto; }
.pk-hud__title { /* a paper label with the binder's divider tab (binder shapes in the arena's navy and gold; theme tokens with fallbacks) */
  position: relative; margin-top: 14px; padding: 9px 16px 8px; border-radius: 8px; color: var(--ink, #eef2ff); transform: rotate(-1deg);
  background: var(--paper, #121828); box-shadow: 0 0 0 1px var(--paper-edge, rgba(255,255,255,.12)), 0 8px 20px -8px rgba(0,0,0,.6);
}
.pk-hud__title::before { content: "BOOSTER"; position: absolute; left: 12px; top: -15px; padding: 3px 9px 4px; border-radius: 7px 7px 0 0; font: 700 9px/1 var(--ff-pix); letter-spacing: 1px; color: var(--tab-yellow-ink, #1a1405); background: var(--tab-yellow, #ffd35a); }
.pk-hud__title b { display: block; font: 700 17px/1.1 var(--ff); }
.pk-hud__title span { font: 700 10px/1 var(--ff-pix); color: var(--ink-soft, rgba(238,242,255,.62)); letter-spacing: 1px; text-transform: uppercase; }
.pk-hud__btns { display: flex; gap: 8px; }
.pk-btn { /* the binder's chip buttons */
  font: 600 14px/1 var(--ff); color: var(--ink, #eef2ff); padding: 10px 16px; min-height: 40px; border-radius: 99px; cursor: pointer;
  background: var(--paper, #121828); border: 1px solid var(--chip-line, rgba(255,255,255,.12)); box-shadow: 0 6px 16px -8px rgba(0,0,0,.6);
  transition: background .2s, transform .15s;
}
.pk-btn:hover { background: var(--paper-2, #1a2238); }
.pk-btn:active { transform: scale(.96); }
.pk-btn:focus-visible { outline: 3px solid var(--focus, #78dcff); outline-offset: 2px; }
.pk-btn--icon { width: 40px; padding: 0; display: grid; place-items: center; }
.pk-btn--main { /* a Pokémon-yellow divider tab, like the arena's main buttons */
  background: linear-gradient(180deg, #ffe48a, var(--tab-yellow, #ffd35a)); color: var(--tab-yellow-ink, #1a1405); border-color: transparent; font-weight: 700; padding: 12px 26px;
  border-radius: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,.6), 0 3px 0 #b8901c, 0 10px 22px -10px rgba(0,0,0,.6);
}
.pk-btn--main:hover { background: linear-gradient(180deg, #fff0a8, #ffd62e); }
.pk-ribbon {
  position: absolute; left: 50%; bottom: 11%; translate: -50% 20px; opacity: 0; z-index: 7; text-align: center; pointer-events: none;
  transition: opacity .35s, translate .45s cubic-bezier(.2,1.4,.4,1);
}
.pk-ribbon.is-on { opacity: 1; translate: -50% 0; }
.pk-ribbon b { display: block; font: 700 18px/1.1 var(--ff); text-transform: uppercase; letter-spacing: 2px; color: var(--tier-a); text-shadow: 0 2px 10px rgba(0,0,0,.7); }
.pk-ribbon.is-big b {
  font-size: clamp(22px, 4.4vmin, 34px); letter-spacing: 3px;
  background: linear-gradient(90deg, var(--tier-a), #fff, var(--tier-b), var(--tier-a)); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 12px var(--tier-glow)); animation: pk-shine 2.4s linear infinite;
}
@keyframes pk-shine { to { background-position: 300% 0; } }
.pk-ribbon span { display: block; margin-top: 4px; font: 700 11px/1.2 var(--ff-pix); opacity: .85; letter-spacing: 1px; }
.pk-prompt { position: absolute; left: 50%; bottom: 6.5%; translate: -50% 0; font: 600 14px/1 var(--ff); color: rgba(255,255,255,.7); opacity: 0; transition: opacity .3s; z-index: 7; white-space: nowrap; pointer-events: none; }
.pk-prompt-on .pk-prompt { opacity: 1; animation: pk-blink 1.6s ease-in-out infinite; }
.pk-prompt[data-hint]::before { content: attr(data-hint) " · "; color: var(--tier-a); }
.pk-scene[data-phase=summary] .pk-pips, .pk-scene[data-phase=done] .pk-pips { opacity: 0; }
.pk-pips { position: absolute; left: 50%; bottom: 3%; translate: -50% 0; display: flex; gap: 7px; z-index: 7; }
.pk-pips i { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,.22); transition: transform .3s, background .3s; }
.pk-pips i.is-now { transform: scale(1.5); background: #fff; }
.pk-pips i.is-done { background: var(--c); }
.pk-pile { position: absolute; left: 18px; bottom: 18px; display: flex; z-index: 7; }
.pk-pile__card { width: 22px; height: 31px; margin-right: -12px; border-radius: 3px; rotate: var(--r); background: linear-gradient(135deg, var(--c-a), var(--c-b)); box-shadow: 0 2px 5px rgba(0,0,0,.5); border: 1px solid rgba(255,255,255,.5); animation: pk-pile .35s cubic-bezier(.2,1.5,.4,1) both; }
@keyframes pk-pile { from { transform: translateY(-40px) scale(1.6); opacity: 0; } }
.pk-ring { width: calc(var(--cw) * 1.5); aspect-ratio: 1; pointer-events: none; opacity: 0; transition: opacity .2s; z-index: 4; --k: 0; }
.pk-ring.is-on { opacity: 1; }
.pk-ring svg { width: 100%; height: 100%; rotate: -90deg; overflow: visible; }
.pk-ring circle { fill: none; stroke-width: 2.2; }
.pk-ring__track { stroke: rgba(255,255,255,.14); }
.pk-ring__fill { stroke: var(--tier-a); stroke-linecap: round; stroke-dasharray: 289; stroke-dashoffset: calc(289 * (1 - var(--k))); filter: drop-shadow(0 0 6px var(--tier-glow)); }
.pk-flash { position: absolute; inset: 0; z-index: 8; pointer-events: none; opacity: 0; background: radial-gradient(circle at 50% 48%, #fff, var(--tier-a) 30%, transparent 75%); }
.pk-flash.is-on { animation: pk-flash .7s ease-out; }
@keyframes pk-flash { 0% { opacity: var(--a, .6); } 100% { opacity: 0; } }
.pk-cam-shake { animation: pk-cam .5s cubic-bezier(.3,.7,.4,1); }
@keyframes pk-cam { 10% { translate: var(--cs) calc(var(--cs) * -.6); } 25% { translate: calc(var(--cs) * -.8) calc(var(--cs) * .5); } 40% { translate: calc(var(--cs) * .5) calc(var(--cs) * .4); } 60% { translate: calc(var(--cs) * -.3) calc(var(--cs) * -.2); } 100% { translate: 0 0; } }

/* ---------------------------------------------------------------- summary */
.pk-summary { position: absolute; inset: 0; z-index: 9; display: flex; flex-direction: column; align-items: center; padding: max(64px, 9vh) 16px 20px; gap: 16px; overflow-y: auto; touch-action: pan-y; background: radial-gradient(90% 70% at 50% 40%, rgba(10,8,20,.2), rgba(4,3,8,.75)); animation: pk-fade .5s both; }
@keyframes pk-fade { from { opacity: 0; } }
.pk-summary__head { /* the pulls' page label: paper, like a binder divider sheet */
  text-align: center; padding: 14px 26px 12px; border-radius: 8px; color: var(--ink, #eef2ff);
  background: linear-gradient(160deg, color-mix(in oklab, #ffd35a 8%, var(--paper, #121828)), var(--paper, #121828) 60%);
  box-shadow: 0 0 0 1px var(--paper-edge, rgba(255,255,255,.12)), 0 0 0 8px var(--cover, #161d33), 0 12px 30px -10px rgba(0,0,0,.7);
}
.pk-summary__head h2 { margin: 0; font: 700 clamp(22px, 4vmin, 30px)/1.1 var(--ff); }
.pk-summary__head p { margin: 6px 0 0; font: 600 18px/1.3 var(--ff-hand, Caveat, cursive); color: var(--ink-soft, rgba(238,242,255,.62)); }
.pk-summary__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(clamp(96px, 17vw, 150px), 1fr)); gap: 18px 14px; width: min(100%, 900px); perspective: 900px; }
.pk-summary__slot { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; padding: 8px 8px 6px; border-radius: 6px;
  background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.02)); box-shadow: inset 0 0 0 1px rgba(220,210,255,.16); } /* a clear pocket */
.pk-summary__label { font: 700 9px/1.2 var(--ff-pix); text-transform: uppercase; letter-spacing: .5px; opacity: .7; text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-card.pk-sum-card { position: relative; inset: auto; width: 100%; aspect-ratio: 63 / 88; animation: pk-deal .55s cubic-bezier(.2,1.3,.4,1) both; }
@keyframes pk-deal { from { transform: translateY(40px) scale(.7) rotate(-6deg); opacity: 0; } }
.pk-card.pk-sum-card.is-best .pk-card__front { box-shadow: 0 0 0 .8cqi #fff, 0 0 14cqi 4cqi var(--glow), 0 6cqi 14cqi -4cqi rgba(0,0,0,.6); }
.pk-summary__bar { display: flex; gap: 10px; padding-bottom: 8px; }
.pk-error { position: absolute; left: 50%; top: 50%; translate: -50% -50%; z-index: 12; padding: 22px 24px; border-radius: 22px; color: var(--ink, #eef2ff); background: var(--panel, #151c30); border: 1px solid var(--panel-line, rgba(255,255,255,.12)); box-shadow: 0 30px 80px -20px rgba(0,0,0,.6); text-align: center; max-width: min(90vw, 420px); }
.pk-error b { font: 700 18px/1.2 var(--ff); } .pk-error p { font: 500 14px/1.4 var(--ff); opacity: .8; }

/* ---------------------------------------------------------------- reduced motion: the same information, with fades */
.pk-reduced *, .pk-reduced *::before, .pk-reduced *::after { animation: none !important; }
.pk-reduced .pk-card, .pk-reduced .pk-card__tilt { transition: opacity .25s !important; transform: none !important; }
.pk-reduced .pk-card__inner { transform: none !important; transition: none !important; }
.pk-reduced .pk-card__back { transform: none; opacity: 0; transition: opacity .3s; }
.pk-reduced .pk-card.is-down .pk-card__back { opacity: 1; }
.pk-reduced .pk-card__front { transition: opacity .3s; }
.pk-reduced .pk-card.is-down .pk-card__front { opacity: 0; }
.pk-reduced .pk-card.is-flung { opacity: 0; }
.pk-reduced .pk-new { transform: rotate(12deg); }
.pk-reduced .pk-card:not(.pk-new-in) .pk-new { opacity: 0; }
.pk-reduced .pk-rays, .pk-reduced .pk-flash, .pk-reduced .pk-hint__hand { display: none; }
.pk-reduced .pk-card.pk-tease-charged .pk-back__edge, .pk-reduced .pk-card.pk-tease-held .pk-back__edge { opacity: 1; }
.pk-reduced .pk-card.pk-tease-held .pk-back__pulse { opacity: .6; }
.pk-reduced .pk-pack.is-open .pk-pack__body { transform: none; }
.pk-reduced .pk-aura__rays, .pk-reduced .pk-tearhead, .pk-reduced .pk-pack__beams { display: none; }
.pk-reduced .pk-leak__rays { opacity: .5; }
.pk-reduced .pk-card:not(.is-down) .pk-aura { opacity: calc(var(--au-i) * .8); }
`;

let injected = false;
export function injectStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const s = document.createElement('style');
  s.id = 'pokeshell-packs-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
