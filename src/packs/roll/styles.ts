// The roll's CSS (docs/PACK_ROLL.md), injected once. Everything moving per frame is in the canvas; this is the
// canvas's place in the scene, hiding the pack under the reel, and the odds slam of a vintage landing.
const CSS = `
.pkr-canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 3; }
.pkr-hidden { opacity: 0 !important; }
.pkr-stamp {
  position: absolute; left: 50%; translate: -50% -50%; z-index: 8; pointer-events: none; text-align: center; white-space: nowrap;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  animation: pkr-slam 1.15s cubic-bezier(.2,1.4,.4,1) both;
}
.pkr-stamp small {
  font: 800 clamp(16px, 5vw, 26px)/1 Fredoka, "Segoe UI", system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase;
  color: #fff4c2; text-shadow: 0 2px 0 #7a5208, 0 0 14px rgba(255,211,90,.7);
}
.pkr-stamp b {
  font: 900 clamp(64px, 22vw, 132px)/.86 Fredoka, "Segoe UI", system-ui, sans-serif; letter-spacing: -.02em;
  background: linear-gradient(180deg, #fffbe6 0%, #ffe07a 38%, #ffb52e 62%, #fff0a8 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  -webkit-text-stroke: 2px #6b4506; filter: drop-shadow(0 4px 0 #4a2f03) drop-shadow(0 0 22px rgba(255,200,70,.75));
}
.pkr-stamp span {
  margin-top: 6px; padding: 6px 14px 5px; border-radius: 999px; font: 700 clamp(10px, 2.8vw, 13px)/1 "Cascadia Mono", Consolas, ui-monospace, monospace;
  letter-spacing: .14em; text-transform: uppercase; color: #fff4c2; background: rgba(40,26,2,.82); border: 1px solid #ffd35a;
  box-shadow: 0 0 24px rgba(255,211,90,.45);
}
@keyframes pkr-slam {
  0% { opacity: 0; scale: 1.7; }
  14% { opacity: 1; scale: .93; }
  22% { scale: 1.03; }
  30% { scale: 1; }
  78% { opacity: 1; scale: 1; }
  100% { opacity: 0; scale: 1.06; }
}
.pkr-stamp.is-reduced { animation: pkr-fade 1.15s ease both; }
@keyframes pkr-fade { 0% { opacity: 0; } 12% { opacity: 1; } 78% { opacity: 1; } 100% { opacity: 0; } }
`;

let injected = false;
export function injectRollStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const s = document.createElement('style');
  s.dataset.pk = 'roll';
  s.textContent = CSS;
  document.head.appendChild(s);
}
