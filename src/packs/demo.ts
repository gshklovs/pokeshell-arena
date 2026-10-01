// The standalone demo (packs-demo.html): choose a set, open a pack. Mock mode rolls real cards from pokeshell's
// pack.json + boosters.json; ?live=1 calls the real `pokeshell pack open --json --free` through the demo server
// (with a throwaway POKESHELL_HOME, never your real one).
//   ?set=swsh7  open that set at once      ?force=gold  a pack whose best card is that fx (mock)
//   ?seed=7     a reproducible mock pack   ?auto=1      play the whole opening by itself
//   ?reduced=1  reduced motion             ?live=1      the real pokeshell command
import { openPackScene, wrapperSVG, type Fx, type PackResult, type SetInfo } from './index';
import { createMockFetchPack, loadMockData, mockSets } from './mock';

const q = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
const live = q.get('live') === '1';

async function main() {
  const data = await loadMockData('/pokeshell/');
  const sets = mockSets(data).filter(s => s.cards > 0);
  const open = (set: SetInfo) => {
    app.innerHTML = '';
    const stage = document.createElement('div');
    stage.className = 'demo-stage';
    app.appendChild(stage);
    const fetchPack = live
      ? async (): Promise<PackResult> => {
          const r = await fetch(`/api/open?set=${encodeURIComponent(set.id)}`);
          const j = await r.json();
          if (!r.ok || j.error) throw new Error(j.error || `pokeshell exited ${r.status}`);
          return j;
        }
      : createMockFetchPack(data, set.id, { seed: q.has('seed') ? Number(q.get('seed')) : undefined, force: (q.get('force') as Fx) || undefined });
    const scene = openPackScene(stage, {
      set, fetchPack, imageBase: live ? '/live/' : '/export/',
      autoplay: q.get('auto') === '1',
      reducedMotion: q.get('reduced') === '1' ? true : undefined,
      sound: q.get('mute') !== '1',
      onOpenAnother: () => { scene.destroy(); open(set); },
      onPhase: (p, d) => { document.body.dataset.phase = p; document.body.dataset.index = String(d?.index ?? ''); },
    });
    (window as unknown as { __scene: unknown }).__scene = scene;
    scene.done.then(() => { scene.destroy(); picker(); }).catch(() => { /* error box shown in the scene */ });
  };
  const picker = () => {
    document.body.dataset.phase = 'picker';
    app.innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'demo-picker';
    wrap.innerHTML = `<header><h1>Open a pack</h1><p>Real boosters of the sets pokeshell serves: real slots, published odds, real cards.${live ? ' <b>live: pokeshell pack open</b>' : ' (demo: nothing is recorded)'}</p></header>`;
    const grid = document.createElement('div'); grid.className = 'demo-grid';
    for (const s of sets) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'demo-set';
      b.innerHTML = `<div class="demo-set__pack">${wrapperSVG(s, s.hero ? '/export/' + s.hero : '', s.packSize ?? 10)}</div><b>${s.name}</b><span>${s.series ?? ''} · ${s.cards} cards</span>`;
      b.addEventListener('click', () => open(s));
      grid.appendChild(b);
    }
    wrap.appendChild(grid);
    app.appendChild(wrap);
  };
  if (q.get('random') === '1' || q.has('roll')) { randomMode(); return; }
  const want = q.get('set');
  const s = want ? sets.find(x => x.id === want || x.name.toLowerCase().includes(want.toLowerCase())) : undefined;
  if (s) open(s); else picker();
}

/**
 * ?random=1 or ?roll=1: the game's own random-pack flow (src/game/packs.ts openRandomPack) against the demo server's
 * stand-in host (/api/pack/open with ?delay=, /api/sets): the mystery pack opens at once, the set roll's reel spins
 * over it (docs/PACK_ROLL.md) and lands on the rolled set, which the pack re-skins to.
 *   ?delay=1200  the host's delay (ms)       ?roll=base1  force the rolled set (any roll= other than 1 / 0)
 *   ?fail=402    make the open fail          ?roll=0 or ?reel=0  no reel (the plain mystery pack)
 *   ?seed=7      a fixed reel strip          ?go=1  open at once (no picker)   ?reduced=1 / ?auto=1
 */
function randomMode() {
  const cfg = new URLSearchParams();
  for (const k of ['delay', 'fail', 'setsDelay']) if (q.has(k)) cfg.set(k, q.get(k)!);
  const rolls = q.getAll('roll');
  cfg.set('roll', rolls.find((v) => v !== '1' && v !== '0') ?? '');
  const reel = !rolls.includes('0') && q.get('reel') !== '0';
  const ropts = {
    roll: reel, seed: q.has('seed') ? Number(q.get('seed')) : undefined,
    reducedMotion: q.get('reduced') === '1' ? true : undefined, autoplay: q.get('auto') === '1',
  };
  const ready = fetch(`/api/demo?${cfg}`).catch(() => null);
  const game = import('../game/packs'); // loaded before the click, like the game has it
  const picker = () => {
    document.body.dataset.phase = 'picker';
    app.innerHTML = `<div class="demo-picker"><header><h1>Random pack</h1><p>The arena's flow: a token opens a random pack, rolled by pack price (a stand-in host, nothing recorded).</p></header>
      <p style="text-align:center"><button type="button" id="demo-random" class="demo-go">Open a pack</button></p><p id="demo-msg" style="text-align:center"></p></div>`;
    const b = document.getElementById('demo-random')!;
    b.addEventListener('click', async () => {
      await ready;
      const { openRandomPack } = await game;
      app.innerHTML = '';
      const stage = document.createElement('div');
      stage.className = 'demo-stage';
      app.appendChild(stage);
      try {
        const r = await openRandomPack(stage, undefined, ropts);
        if (r.again) return b.click();
        picker();
      } catch (e) {
        picker();
        const err = e as { status?: number; message?: string };
        document.getElementById('demo-msg')!.textContent = `No pack this time: ${err.status ?? ''} ${err.message ?? ''}`;
      }
    });
  };
  picker();
  if (q.get('go') === '1') void ready.then(() => document.getElementById('demo-random')?.click());
}

main().catch(e => { app.textContent = `demo failed: ${e instanceof Error ? e.message : e}`; });
