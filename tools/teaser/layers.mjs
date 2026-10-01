// The teaser's motion-graphics layers (tools/teaser/README.md): the brand, the taglines, the captions and the end card's
// lines, drawn in the game's own fonts and tokens (src/theme.css: Silkscreen, Fredoka, Caveat; the navy desk and the
// gold) by headless Chromium, each element saved as a transparent PNG for tools/teaser/compose.py to animate.
//   node tools/teaser/layers.mjs [--out shots/teaser/layers]
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d)
const root = resolve(import.meta.dirname, '../..')
const out = resolve(arg('--out', join(root, 'shots/teaser/layers')))
mkdirSync(out, { recursive: true })
const theme = readFileSync(join(root, 'src/theme.css'), 'utf8')

// [file, html]: every layer at the master's scale (1920x1080)
const caption = (t, cls = '') => `<div class="cap ${cls}">${t}</div>`
const LAYERS = [
  ['ball', '<div style="padding: 4px 4px 14px"><span class="ball"></span></div>'],
  ['wordmark', '<h1 class="wm">pokeshell <span>arena</span></h1>'],
  ['tagline', '<p class="tag">real-time Pokémon card battles</p>'],
  ['tagline2', '<p class="tag2">win tokens <b>→</b> open real packs</p>'],
  ['cap-aim', caption('aim')],
  ['cap-fire', caption('fire!')],
  ['cap-dodge', caption('dodge')],
  ['cap-ko', caption('KO!', 'red')],
  ['cap-evolve', caption('evolve')],
  ['cap-swap', caption('swap')],
  ['cap-melee', caption('hit hard')],
  ['cap-packs', caption('open packs', 'gold')],
  ['cap-rare', caption('pull the rare', 'gold')],
  ['end-dl', '<div class="dl"><span class="pill">Download for Windows &amp; Mac</span></div>'],
  ['end-url', '<p class="url">github.com/gshklovs/pokeshell-arena</p>'],
  ['end-free', '<p class="free">free · 3 starter packs inside</p>'],
]

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  await page.setContent(`<!doctype html><html><head>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Fredoka:wght@400;500;600;700&family=Silkscreen:wght@400;700&display=swap" rel="stylesheet">
  <style>${theme}
    html, body { margin: 0; background: transparent; }
    #s > * { position: absolute; left: 40px; top: 40px; margin: 0; }
    .ball { width: 150px; height: 150px; border-radius: 50%; position: relative; border: 12px solid #2b2231; display: block; box-sizing: border-box;
      background: linear-gradient(#e3350d 0 45%, #2b2231 45% 55%, #fbf8f1 55%); box-shadow: 0 8px 0 rgba(0,0,0,.35); }
    .ball::after { content: ''; position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px; border-radius: 50%; background: #fbf8f1; border: 10px solid #2b2231; box-sizing: border-box; }
    .wm { font: 700 120px/1 var(--ff-pix); letter-spacing: 3px; text-transform: uppercase; color: var(--ink); white-space: nowrap; padding: 10px 14px;
      text-shadow: 0 6px 0 #05070d, 0 0 40px rgba(120, 160, 255, .25); }
    .wm span { color: var(--accent); }
    .tag { font: 700 84px/1.1 var(--ff-hand); color: var(--ink); padding: 6px 12px; text-shadow: 0 3px 0 #05070d; white-space: nowrap; }
    .tag2 { font: 600 54px/1.1 var(--ff-round); color: var(--ink-soft); padding: 6px 12px; white-space: nowrap; }
    .tag2 b { color: var(--accent); }
    .cap { font: 700 136px/1 var(--ff-pix); text-transform: uppercase; color: #fff; padding: 8px 18px 14px; white-space: nowrap; letter-spacing: 2px;
      -webkit-text-stroke: 0; text-shadow: 0 7px 0 #05070d, 5px 0 0 #05070d, -5px 0 0 #05070d, 0 -5px 0 #05070d, 4px 4px 0 #05070d, -4px 4px 0 #05070d, 4px -4px 0 #05070d, -4px -4px 0 #05070d; }
    .cap.gold { color: var(--accent); } .cap.red { color: #ff5a4a; }
    .dl { padding: 12px; } .pill { display: inline-block; font: 700 58px/1 var(--ff-round); color: var(--tab-yellow-ink); padding: 26px 54px 28px; border-radius: 30px;
      background: linear-gradient(180deg, color-mix(in oklab, var(--tab-yellow) 80%, #fff), var(--tab-yellow));
      box-shadow: inset 0 2px 0 rgba(255,255,255,.6), 0 9px 0 color-mix(in oklab, var(--tab-yellow) 55%, #000), 0 24px 40px -14px rgba(0,0,0,.7); }
    .url { font: 700 52px/1 var(--ff-pix); color: var(--ink); padding: 8px 12px; white-space: nowrap; }
    .free { font: 700 50px/1 var(--ff-hand); color: var(--ink-soft); padding: 6px 12px; white-space: nowrap; }
  </style></head><body><div id="s"></div></body></html>`)
  await page.evaluate(() => document.fonts.ready)
  for (const [name, html] of LAYERS) {
    await page.evaluate((h) => { document.getElementById('s').innerHTML = h }, html)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(80)
    const el = await page.$('#s > *')
    await el.screenshot({ path: join(out, `${name}.png`), omitBackground: true })
  }
  console.log(`layers: ${LAYERS.length} in ${out}`)
} finally {
  await browser.close()
}
