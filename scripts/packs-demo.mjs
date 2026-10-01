// The pack-opening demo server: `npm run packs:demo` (then open http://localhost:5178/).
//   /                    packs-demo.html
//   /src/...             the TypeScript, served by Vite in middleware mode (the arena's own stack, with HMR)
//   /pokeshell/*.json    pack.json + boosters.json from the pokeshell checkout, and built.json (the cards with built art)
//   /export/img/*        card images: pokeshell's own web export (`binder.exe --export-web`), made once into .cache/
//   /api/open?set=       live mode: the real `pokeshell pack open <set> --json --free --export`, with a throwaway
//                        POKESHELL_HOME in .cache/demo-state (never your real pokeshell state)
//   /live/img/*          that state's web export
// Env: POKESHELL_ROOT (the pokeshell checkout; default ../pokeshell), POKESHELL_BINDER (binder.exe; default the
// checkout's binder/target/release, else the installed module's bin\), POKESHELL_PYTHON (live mode only), PORT (5178).
// The mock demo needs no Python.
import { createServer } from 'node:http';
import { readFile, stat, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PS_ROOT = path.resolve(process.env.POKESHELL_ROOT || path.join(ROOT, '..', 'pokeshell'));
const CACHE = path.join(ROOT, '.cache');
const EXPORT = path.join(CACHE, 'pokeshell-web');
const DEMO_STATE = path.join(CACHE, 'demo-state');
const PORT = Number(process.env.PORT || 5178);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };

function python() {
  const c = [process.env.POKESHELL_PYTHON, path.join(PS_ROOT, '.venv', 'Scripts', 'python.exe'), path.join(PS_ROOT, '.venv', 'bin', 'python')].filter(Boolean);
  return c.find(p => existsSync(p)) || 'python';
}

function run(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env }, windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => (err += d));
    p.on('error', reject);
    p.on('close', code => resolve({ code, out, err }));
  });
}

/** pokeshell's binder.exe: $POKESHELL_BINDER, the checkout's release build, or an installed module's bin\ */
async function binderExe() {
  const exe = process.platform === 'win32' ? 'binder.exe' : 'binder';
  const c = [process.env.POKESHELL_BINDER, path.join(PS_ROOT, 'binder', 'target', 'release', exe), path.join(PS_ROOT, 'bin', exe)];
  for (const dir of (process.env.PSModulePath || '').split(path.delimiter).filter(Boolean)) {
    const mod = path.join(dir, 'pokeshell');
    const vers = await readdir(mod).catch(() => []);
    for (const v of vers.sort().reverse()) c.push(path.join(mod, v, 'bin', exe));
  }
  const hit = c.filter(Boolean).find(p => existsSync(p));
  if (!hit) throw new Error(`no pokeshell binder.exe found (build it: cargo build --release in ${path.join(PS_ROOT, 'binder')}, or set POKESHELL_BINDER)`);
  return hit;
}

async function ensureExport() {
  // made once per pokeshell checkout and pack.json (a new set landing, or POKESHELL_ROOT moving, redoes it)
  const stampFile = path.join(CACHE, 'pokeshell-web.stamp');
  const stamp = `${PS_ROOT}|${(await stat(path.join(PS_ROOT, 'packs', 'pokemon', 'pack.json'))).mtimeMs}`;
  if (existsSync(path.join(EXPORT, 'data.json')) && existsSync(stampFile) && (await readFile(stampFile, 'utf8')) === stamp) return;
  const binder = await binderExe();
  console.log(`exporting card images from ${PS_ROOT} (${binder} --export-web, once) ...`);
  // an empty throwaway state: the export renders every card's face and records nothing
  const state = path.join(CACHE, 'empty-state');
  await mkdir(state, { recursive: true });
  const r = await run(binder, ['--export-web', EXPORT, '--root', PS_ROOT, '--state', state], { POKESHELL_HOME: state });
  if (r.code) throw new Error(`binder --export-web failed (${r.code}): ${(r.err || r.out).slice(-600)}`);
  console.log((r.out.trim() || r.err.trim()).split('\n').pop());
  await writeFile(stampFile, stamp);
}

async function builtCards() {
  const pack = JSON.parse(await readFile(path.join(PS_ROOT, 'packs', 'pokemon', 'pack.json'), 'utf8'));
  const files = new Set(await readdir(path.join(PS_ROOT, 'dist', 'pokemon')).catch(() => []));
  return Object.entries(pack.cards).filter(([id, c]) => files.has(`${c.character}-${id}.ans`)).map(([id]) => id);
}

async function sendFile(res, file) {
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
}

const json = (res, code, body) => { res.writeHead(code, { 'content-type': TYPES['.json'], 'cache-control': 'no-cache' }); res.end(JSON.stringify(body)); };

/**
 * A stand-in for the arena host's random pack (POST /api/pack/open {random: true}, GET /api/sets): the set is rolled
 * by its sealed pack's price like `pokeshell pack open random` (chance ~ price^-priceExponent), the pack by the mock
 * booster roll (src/packs/mock.ts, real cards only). Nothing is recorded. GET /api/demo?delay=1200&roll=base1&fail=402&setsDelay=4000
 * sets the host's delay, forces the rolled set, or makes the next opens fail with that status.
 */
const standIn = {
  delay: 1200, roll: '', fail: 0, setsDelay: 0, tokens: 99, data: null,
  configure(q) {
    if (q.has('delay')) this.delay = Math.max(0, Number(q.get('delay')) || 0);
    if (q.has('roll')) this.roll = q.get('roll') || '';
    if (q.has('fail')) this.fail = Number(q.get('fail')) || 0;
    return { delay: this.delay, roll: this.roll, fail: this.fail };
  },
  async load() {
    if (this.data) return this.data;
    const mock = await vite.ssrLoadModule('/src/packs/mock.ts');
    const pack = JSON.parse(await readFile(path.join(PS_ROOT, 'packs', 'pokemon', 'pack.json'), 'utf8'));
    const boosters = JSON.parse(await readFile(path.join(PS_ROOT, 'packs', 'pokemon', 'boosters.json'), 'utf8'));
    const d = { pack, boosters, built: new Set(await builtCards()) };
    const exp = Number(boosters.priceExponent) || 1;
    const sets = mock.mockSets(d).filter(s => s.cards > 0);
    const w = sets.map(s => Math.pow(Number(boosters.sets.find(b => b.id === s.id)?.price) || 20, -exp));
    const tot = w.reduce((a, b) => a + b, 0);
    sets.forEach((s, i) => { s.chance = w[i] / tot; s.oneIn = tot / w[i]; s.openable = true; });
    this.data = { mock, d, sets };
    return this.data;
  },
  // the real host's /api/sets runs pokeshell pack sets: ~4 s cold (?setsDelay=4000 to play that)
  async sets() { const { sets } = await this.load(); await new Promise(r => setTimeout(r, this.setsDelay)); return { sets, tokens: this.tokens }; },
  async open() {
    const { mock, d, sets } = await this.load();
    await new Promise(r => setTimeout(r, this.delay));
    if (this.fail) return [this.fail, { error: this.fail === 402 ? 'no_tokens' : 'failed', message: this.fail === 402 ? 'no pack tokens' : `stand-in failure ${this.fail}` }];
    let s = sets.find(x => x.id === this.roll);
    if (!s) { let r = Math.random(); s = sets[sets.length - 1]; for (const x of sets) { r -= x.chance; if (r < 0) { s = x; break; } } }
    const res = mock.rollPack(d, s.id);
    // a shiny face exists only where the export drew one
    for (const c of res.cards) if (c.shiny && !existsSync(path.join(EXPORT, c.image))) { c.shiny = false; c.image = c.image.replace('-shiny', ''); }
    return [200, { ...res, random: true, setChance: s.chance, setOneIn: s.oneIn, tokens: this.tokens, imageBase: '/pokeshell/' }];
  },
};

const inside = (base, rel) => { const f = path.resolve(base, '.' + path.sep + rel); return f.startsWith(base + path.sep) ? f : null; };
let opening = Promise.resolve();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/' || p === '/packs-demo.html') {
      const html = await vite.transformIndexHtml('/packs-demo.html', await readFile(path.join(ROOT, 'packs-demo.html'), 'utf8'));
      res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' });
      return res.end(html);
    }
    if (p === '/pokeshell/pack.json') return sendFile(res, path.join(PS_ROOT, 'packs', 'pokemon', 'pack.json'));
    if (p === '/pokeshell/boosters.json') return sendFile(res, path.join(PS_ROOT, 'packs', 'pokemon', 'boosters.json'));
    if (p === '/pokeshell/built.json') { res.writeHead(200, { 'content-type': TYPES['.json'] }); return res.end(JSON.stringify(await builtCards())); }
    if (p.startsWith('/export/')) { const f = inside(EXPORT, p.slice(8)); return f ? sendFile(res, f) : (res.writeHead(403), res.end()); }
    if (p.startsWith('/live/')) { const f = inside(path.join(DEMO_STATE, 'web'), p.slice(6)); return f ? sendFile(res, f) : (res.writeHead(403), res.end()); }
    if (p === '/api/open') {
      const set = url.searchParams.get('set') || '';
      if (!/^[a-z0-9]+$/i.test(set)) { res.writeHead(400); return res.end('{"error":"bad set"}'); }
      const job = opening.then(() => run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(PS_ROOT, 'scripts', 'pokeshell.ps1'), 'pack', 'open', set, '--json', '--free', '--export'],
        { POKESHELL_HOME: DEMO_STATE, POKESHELL_REAL_WT: 'off', POKESHELL_PYTHON: python() }));
      opening = job.catch(() => {});
      const r = await job;
      res.writeHead(r.code ? 500 : 200, { 'content-type': TYPES['.json'] });
      return res.end(r.out.trim() || JSON.stringify({ error: r.err.slice(-400) || `exit ${r.code}` }));
    }
    // the stand-in arena host for ?random=1 (the game's own openRandomPack, src/game/packs.ts)
    if (p.startsWith('/pokeshell/img/')) { const f = inside(path.join(EXPORT, 'img'), p.slice(15)); return f ? sendFile(res, f) : (res.writeHead(403), res.end()); }
    if (p === '/api/demo') return json(res, 200, standIn.configure(url.searchParams));
    if (p === '/api/sets') return json(res, 200, await standIn.sets());
    if (p === '/api/wallet') return json(res, 200, { tokens: standIn.tokens });
    if (p === '/api/pack/open' && req.method === 'POST') { const [code, body] = await standIn.open(); return json(res, code, body); }
    return vite.middlewares(req, res, () => { res.writeHead(404); res.end('not found'); });
  } catch (e) {
    res.writeHead(500); res.end(String(e && e.stack || e));
  }
});

const vite = await createVite({ root: ROOT, configFile: false, server: { middlewareMode: true, hmr: { port: PORT + 1 }, watch: { ignored: ['**/.cache/**', '**/host/target/**'] } }, appType: 'custom' });
await mkdir(DEMO_STATE, { recursive: true });
await ensureExport();
server.listen(PORT, '127.0.0.1', () => console.log(`pack-opening demo: http://localhost:${PORT}/   (pokeshell: ${PS_ROOT})`));
