// Frames and clips of the set roll (docs/PACK_ROLL.md) into shots/pack-roll/, against a running pack demo
// (`npm run packs:demo`). Playwright's Chromium drives /?roll=1 with the stand-in host's delay and forced set.
//   node scripts/roll-shots.mjs [--url http://localhost:5178] [--out pack-roll] [--clips-only] [--only common,vintage,interrupt,slow,reduced,phone,fps]
// Writes <case>-NN.png frames, <case>.webm clips (and <case>.mp4 when ffmpeg is on PATH), a contact sheet per case
// (<case>-sheet.png) and fps.json (frame times while the reel spins, at 1x and 2x DPR).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const BASE = arg('--url', 'http://localhost:5178');
const OUT = path.join(ROOT, 'shots', arg('--out', 'pack-roll'));
const only = (arg('--only', '') || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const clipsOnly = process.argv.includes('--clips-only');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

async function session(browser, name, { viewport = DESKTOP, dpr = 1, reduced = false, video = true } = {}) {
  const vdir = path.join(OUT, `.video-${name}`);
  const ctx = await browser.newContext({
    viewport, deviceScaleFactor: dpr, reducedMotion: reduced ? 'reduce' : 'no-preference',
    ...(video ? { recordVideo: { dir: vdir, size: viewport } } : {}),
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`[${name}] page error:`, e.message));
  return {
    page,
    async close() {
      await ctx.close();
      if (!video) return;
      const f = readdirSync(vdir).find((x) => x.endsWith('.webm'));
      if (f) {
        const webm = path.join(OUT, `${name}.webm`);
        rmSync(webm, { force: true });
        renameSync(path.join(vdir, f), webm);
        if (hasFfmpeg) {
          spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, `${name}.mp4`)]);
          // a contact sheet from the clip itself, 12 frames a second (screenshots are too slow for a 0.8 s roll)
          spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', 'fps=12,scale=420:-1,tile=6x4:padding=3:color=black', '-frames:v', '1', path.join(OUT, `${name}-clip-sheet.png`)]);
        }
      }
      rmSync(vdir, { recursive: true, force: true });
    },
  };
}

/** open the random-pack flow with the reel and wait for the canvas */
async function openRoll(page, q) {
  await page.goto(`${BASE}/?roll=1&go=1&mute=1&${q}`);
  await page.waitForSelector('.pkr-canvas, .pk-scene', { timeout: 15000 });
}

/** frames every `every` ms for `ms`, as <name>-NN.png, then a contact sheet */
async function frames(page, name, ms, every) {
  // --clips-only: no screenshots while recording (each one stalls the page's frames, which the clip then shows)
  if (process.argv.includes('--clips-only')) { await sleep(ms); return []; }
  const files = [];
  const t0 = Date.now();
  for (let i = 0; Date.now() - t0 < ms; i++) {
    const f = path.join(OUT, `${name}-${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: f });
    files.push(f);
    const next = t0 + (i + 1) * every;
    if (next > Date.now()) await sleep(next - Date.now());
  }
  if (hasFfmpeg && files.length > 1) {
    const cols = Math.min(6, files.length), rows = Math.ceil(files.length / cols);
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(OUT, `${name}-%02d.png`), '-vf', `scale=480:-1,tile=${cols}x${rows}:padding=4:color=black`, '-frames:v', '1', path.join(OUT, `${name}-sheet.png`)]);
  }
  return files;
}

function clean(prefix) {
  for (const f of readdirSync(OUT)) if (f.startsWith(prefix + '-') && f.endsWith('.png')) rmSync(path.join(OUT, f));
}

const browser = await chromium.launch({ args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
try {
  if (want('common')) {
    clean('common');
    const s = await session(browser, 'common');
    await openRoll(s.page, 'roll=swsh11&delay=1000&seed=7');
    await frames(s.page, 'common', 2600, 130);
    await sleep(600);
    await s.close();
  }
  if (want('vintage')) {
    clean('vintage');
    const s = await session(browser, 'vintage');
    await openRoll(s.page, 'roll=base1&delay=900&seed=7');
    await frames(s.page, 'vintage', 3400, 130);
    await sleep(600);
    await s.close();
  }
  if (want('interrupt')) {
    clean('interrupt');
    const s = await session(browser, 'interrupt');
    await openRoll(s.page, 'roll=swsh7&delay=700&seed=7');
    await sleep(900);
    if (!clipsOnly) await s.page.screenshot({ path: path.join(OUT, 'interrupt-00.png') });
    // grab the tear strip mid-spin and drag across: the reel resolves at once, the tear follows the pointer
    const box = await s.page.locator('.pk-pack').boundingBox();
    const y = box.y + box.height * 0.13;
    await s.page.mouse.move(box.x + 8, y);
    await s.page.mouse.down();
    if (!clipsOnly) await s.page.screenshot({ path: path.join(OUT, 'interrupt-01.png') });
    for (let i = 1; i <= 12; i++) {
      await s.page.mouse.move(box.x + 8 + (box.width + 30) * (i / 12), y - 6, { steps: 2 });
      if (i % 3 === 0 && !clipsOnly) await s.page.screenshot({ path: path.join(OUT, `interrupt-${String(1 + i / 3).padStart(2, '0')}.png`) });
    }
    await s.page.mouse.up();
    await sleep(900);
    if (!clipsOnly) await s.page.screenshot({ path: path.join(OUT, 'interrupt-06.png') });
    await s.close();
  }
  if (want('slow')) {
    clean('slow');
    const s = await session(browser, 'slow');
    await openRoll(s.page, 'roll=sm115&delay=3200&seed=3');
    await frames(s.page, 'slow', 4600, 400);
    await s.close();
  }
  if (want('reduced')) {
    clean('reduced');
    const s = await session(browser, 'reduced', { reduced: true });
    await openRoll(s.page, 'roll=neo1&delay=1200&seed=3&reduced=1');
    await frames(s.page, 'reduced', 2600, 260);
    await s.close();
  }
  if (want('phone')) {
    clean('phone');
    const s = await session(browser, 'phone', { viewport: PHONE, dpr: 2 });
    await openRoll(s.page, 'roll=base1&delay=800&seed=5');
    await frames(s.page, 'phone', 3200, 200);
    await s.close();
  }
  if (want('fps')) {
    const res = {};
    // the same scene with and without the reel (roll=0): what the reel itself costs on this machine
    for (const [reel, dpr] of [[1, 1], [1, 2], [0, 1], [0, 2]]) {
      const s = await session(browser, `fps${dpr}`, { dpr, video: false });
      await openRoll(s.page, `roll=swsh9&delay=3200&seed=1${reel ? '' : '&reel=0'}`);
      await sleep(450);
      // frame intervals while the reel cruises (the result is 3.2 s away)
      res[`${reel ? 'reel' : 'noReel'}-dpr${dpr}`] = await s.page.evaluate(() => new Promise((done) => {
        const t = []; let last = performance.now();
        const f = (now) => { t.push(now - last); last = now; if (t.length < 120) requestAnimationFrame(f); else done(t); };
        requestAnimationFrame(f);
      })).then(async (t) => ({ t, gpu: await s.page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl'); const d = g && g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'none'; }) })).then(({ t, gpu }) => {
        const s2 = [...t].sort((a, b) => a - b);
        const mean = t.reduce((a, b) => a + b, 0) / t.length;
        return { gpu, frames: t.length, fps: Math.round(10000 / mean) / 10, p95ms: Math.round(s2[Math.floor(t.length * 0.95)] * 10) / 10, over20ms: t.filter((x) => x > 20).length };
      });
      await s.close();
    }
    writeFileSync(path.join(OUT, 'fps.json'), JSON.stringify(res, null, 2));
    console.log('fps', JSON.stringify(res));
  }
} finally {
  await browser.close();
}
console.log(`wrote ${OUT}`);
