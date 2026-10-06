// The web arena's game data (data/pokeshell/): pokeshell's pack.json, boosters.json and carddata.json, and built.json
// (the cards pokeshell serves, the ones with shiny art: the booster model's pools). The web build rolls its packs from
// these in the browser (src/web/). They are text data from pokeshell's public repository (card names, numbers,
// rarities, the pokemontcg.io gameplay fields); no art.
//
//   node tools/web/sync-data.mjs --art <dir>   from an unpacked arena-art.pak (its data/: what the desktop release uses)
//   node tools/web/sync-data.mjs               from a pokeshell checkout ($POKESHELL_REPO, else ../pokeshell) with its
//                                              built card art (dist/pokemon/*.ans decides what's served)
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = path.join(ROOT, 'data', 'pokeshell')
const argv = process.argv.slice(2)
const ART = argv.includes('--art') ? path.resolve(argv[argv.indexOf('--art') + 1] ?? '') : null
const die = (m) => { console.error(`sync-data: ${m}`); process.exit(1) }

await mkdir(OUT, { recursive: true })
if (ART) {
  for (const f of ['pack.json', 'boosters.json', 'carddata.json', 'built.json']) {
    const src = path.join(ART, 'data', f)
    if (!existsSync(src)) die(`no ${src}`)
    await copyFile(src, path.join(OUT, f))
  }
} else {
  const ps = path.resolve(process.env.POKESHELL_REPO || path.join(ROOT, '..', 'pokeshell'))
  for (const f of ['pack.json', 'boosters.json', 'carddata.json']) {
    const src = path.join(ps, 'packs', 'pokemon', f)
    if (!existsSync(src)) die(`no ${src} (set POKESHELL_REPO)`)
    await copyFile(src, path.join(OUT, f))
  }
  const art = path.join(ps, 'dist', 'pokemon')
  if (!existsSync(art)) die(`no built card art in ${art} (it decides which cards are served): use --art <unpacked arena-art.pak>`)
  const pack = JSON.parse(await readFile(path.join(OUT, 'pack.json'), 'utf8'))
  const files = new Set(await readdir(art))
  const built = [], shinyArt = []
  for (const [id, c] of Object.entries(pack.cards ?? {})) {
    if (!files.has(`${c.character}-${id}.ans`)) continue
    built.push(id)
    if (files.has(`${c.character}-${id}-shiny.ans`)) shinyArt.push(id)
  }
  await writeFile(path.join(OUT, 'built.json'), JSON.stringify({ pack: 'pokemon', built, shinyArt }))
}
const built = JSON.parse(await readFile(path.join(OUT, 'built.json'), 'utf8'))
console.log(`data/pokeshell: ${built.built.length} served cards, ${built.shinyArt.length} with shiny art`)
