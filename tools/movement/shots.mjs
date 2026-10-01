// Collision-overlay playtest shots of every arena (tools/movement/overlay.html): shots/overlay/<id>.png (full frame)
// and <id>-top.png (the top rows).   node tools/movement/shots.mjs [--out shots/overlay] [--debug 0]
import { mkdirSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d)
const root = resolve(import.meta.dirname, '../..')
const out = resolve(arg('--out', 'shots/overlay'))
const debug = arg('--debug', '1')
mkdirSync(out, { recursive: true })
const ids = readdirSync(resolve(root, 'public/arenas'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
const { createServer } = await import('vite')
const server = await createServer({ root, server: { port: 5198, strictPort: false }, logLevel: 'warn' })
await server.listen()
const base = server.resolvedUrls.local[0]
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.on('pageerror', (e) => console.log('page error:', e.message))
for (const id of ids) {
  await page.goto(`${base}tools/movement/overlay.html?arena=${id}&debug=${debug}`)
  const info = await page.waitForFunction(() => window.ready, null, { timeout: 60000 }).then((h) => h.jsonValue())
  await page.screenshot({ path: `${out}/${id}.png` })
  await page.screenshot({ path: `${out}/${id}-top.png`, clip: { x: 0, y: 0, width: 1920, height: 440 } })
  console.log(id, JSON.stringify(info))
  if (['cresselia-moonlit-sky', 'kyogre-storm-sea', 'lapras-lagoon'].includes(id)) {
    // a flier heading out over the void / the sea
    await page.goto(`${base}tools/movement/overlay.html?arena=${id}&debug=${debug}&flier=1&ticks=${arg('--flier-ticks', '75')}`)
    await page.waitForFunction(() => window.ready, null, { timeout: 60000 })
    await page.screenshot({ path: `${out}/${id}-flier.png` })
  }
}
await browser.close()
await server.close()
