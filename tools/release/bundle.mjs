// The standalone game data: everything the downloadable arena needs, in one file the host embeds
// (docs/RELEASE.md). After `npm run build`:
//
//   node tools/release/bundle.mjs                 cards and data from a pokeshell checkout (npm run release:data)
//   node tools/release/bundle.mjs --art-pak       the same, and release/arena-art.pak: the build's inputs that aren't in
//                                                 git (the art), for CI (npm run release:art)
//   node tools/release/bundle.mjs --art <dir>     cards and data from an unpacked arena-art.pak instead (CI)
//
// Output:
//   release/bundle/                    the staged tree (what the pak holds), for `arena-host --standalone --data <dir>`
//     game/**                          the built frontend (dist/: the game, sprites, arena art, sfx)
//     cards/img/pokemon/<character>/<card id>[-shiny].png   every served card's face and its shiny form
//     data/pack.json, boosters.json, carddata.json           pokeshell's card and booster data, as they are
//     data/built.json                  the served cards (built art) and the ones with shiny art: the booster model's pools
//     manifest.json                    versions, counts, sizes
//   release/arena-data.pak (+ .sha256) the same tree in one file (tools/release/pak.mjs), what
//                                      `cargo build --features bundle` embeds
//   release/arena-art.pak (+ .sha256)  with --art-pak: public/sprites/**, public/arenas/<id>/{bg,props}.png (the
//                                      gitignored art), cards/img/**, data/*.json
//
// Sources: this checkout's dist/ (npm run build; the art must be in public/ first: install.ps1, or the art pak), and a
// pokeshell checkout ($POKESHELL_REPO, else ../pokeshell) with its built card art (dist/pokemon/*.ans) and binder.exe
// ($POKESHELL_BINDER, else <pokeshell>/binder/target/release). The card faces come from `binder --export-web` run on a
// throwaway state whose pulls.log has one shiny pull of every card with shiny art (the export writes a shiny face only
// once it has been pulled). Nothing outside release/ and a temp dir is written.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { walk, writePak } from './pak.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const PS_ROOT = path.resolve(process.env.POKESHELL_REPO || path.join(ROOT, '..', 'pokeshell'))
const OUT = path.join(ROOT, 'release')
const STAGE = path.join(OUT, 'bundle')
const argv = process.argv.slice(2)
const ART_IN = argv.includes('--art') ? path.resolve(argv[argv.indexOf('--art') + 1] ?? '') : null
const ART_PAK = argv.includes('--art-pak')

function die(msg) { console.error(`bundle: ${msg}`); process.exit(1) }
const mb = (b) => `${(b / 1048576).toFixed(1)} MB`

async function copyTree(src, dst, keep = () => true) {
  let n = 0, bytes = 0
  for (const rel of await walk(src)) {
    if (!keep(rel)) continue
    const to = path.join(dst, rel)
    await mkdir(path.dirname(to), { recursive: true })
    await copyFile(path.join(src, rel), to)
    n++; bytes += (await stat(to)).size
  }
  return { n, bytes }
}

function binderExe() {
  const exe = process.platform === 'win32' ? 'binder.exe' : 'binder'
  const c = [process.env.POKESHELL_BINDER, path.join(PS_ROOT, 'binder', 'target', 'release', exe), path.join(PS_ROOT, 'bin', exe)].filter(Boolean)
  return c.find((p) => existsSync(p)) ?? die(`no binder.exe (build it: cargo build --release in ${path.join(PS_ROOT, 'binder')}, or set POKESHELL_BINDER)`)
}

/** the card data and faces from a pokeshell checkout into `dst` (data/, cards/img/pokemon/) */
async function cardsFromPokeshell(dst) {
  for (const f of ['pack.json', 'boosters.json', 'carddata.json']) {
    if (!existsSync(path.join(PS_ROOT, 'packs', 'pokemon', f))) die(`no ${f} in ${PS_ROOT}/packs/pokemon (set POKESHELL_REPO)`)
  }
  const artDir = path.join(PS_ROOT, 'dist', 'pokemon')
  if (!existsSync(artDir)) die(`no built card art in ${artDir} (pokeshell install / tools/build_realcards.py)`)
  const pack = JSON.parse(await readFile(path.join(PS_ROOT, 'packs', 'pokemon', 'pack.json'), 'utf8'))
  const files = new Set(await readdir(artDir))
  const built = [], shiny = []
  for (const [id, c] of Object.entries(pack.cards ?? {})) {
    if (!files.has(`${c.character}-${id}.ans`)) continue
    built.push(id)
    if (files.has(`${c.character}-${id}-shiny.ans`)) shiny.push(id)
  }
  await mkdir(path.join(dst, 'data'), { recursive: true })
  for (const f of ['pack.json', 'boosters.json', 'carddata.json']) await copyFile(path.join(PS_ROOT, 'packs', 'pokemon', f), path.join(dst, 'data', f))
  await writeFile(path.join(dst, 'data', 'built.json'), JSON.stringify({ pack: 'pokemon', built, shinyArt: shiny }))
  console.log(`cards: ${built.length} served of ${Object.keys(pack.cards ?? {}).length}, ${shiny.length} with shiny art`)

  const tmp = await mkdtemp(path.join(tmpdir(), 'arena-bundle-'))
  try {
    const state = path.join(tmp, 'state'), web = path.join(tmp, 'web')
    await mkdir(state, { recursive: true })
    const lines = shiny.map((id) => ['2026-01-01T00:00:00', 'pokemon', pack.cards[id].character, pack.cards[id].tier, id, '', '1', 'bundle', `card=${id}`].join('\t'))
    await writeFile(path.join(state, 'pulls.log'), lines.join('\r\n') + '\r\n')
    const binder = binderExe()
    console.log(`exporting card faces (${binder} --export-web) ...`)
    const r = spawnSync(binder, ['--export-web', web, '--root', PS_ROOT, '--state', state], { env: { ...process.env, POKESHELL_HOME: state }, encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 26 })
    if (r.status !== 0) die(`binder --export-web failed (${r.status}): ${(r.stderr || r.stdout || r.error?.message || '').slice(-800)}`)
    const want = new Set(built.map((id) => `${pack.cards[id].character}/${id}.png`).concat(shiny.map((id) => `${pack.cards[id].character}/${id}-shiny.png`)))
    const img = await copyTree(path.join(web, 'img', 'pokemon'), path.join(dst, 'cards', 'img', 'pokemon'), (rel) => want.has(rel))
    if (img.n !== want.size) {
      const have = new Set(await walk(path.join(dst, 'cards', 'img', 'pokemon')))
      const miss = [...want].filter((x) => !have.has(x))
      console.warn(`bundle: warning: ${miss.length} card faces missing, e.g. ${miss.slice(0, 5).join(', ')}`)
    }
    console.log(`card faces: ${img.n} images, ${mb(img.bytes)}`)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

async function main() {
  const dist = path.join(ROOT, 'dist')
  if (!existsSync(path.join(dist, 'index.html'))) die('no dist/index.html: npm run build first')
  // the art the game would otherwise draw discs for
  const warn = []
  if (!existsSync(path.join(dist, 'sprites', 'index.json'))) warn.push('dist has no sprites (public/sprites: install.ps1)')
  const arenas = JSON.parse(await readFile(path.join(dist, 'arenas', 'index.json'), 'utf8').catch(() => '{}')).arenas ?? []
  for (const id of arenas) if (!existsSync(path.join(dist, 'arenas', id, 'bg.png'))) warn.push(`dist has no arenas/${id}/bg.png`)
  for (const w of warn) console.warn(`bundle: warning: ${w}`)
  if (warn.length && process.env.BUNDLE_ALLOW_MISSING_ART !== '1') die('art is missing (set BUNDLE_ALLOW_MISSING_ART=1 to bundle anyway)')

  await rm(STAGE, { recursive: true, force: true })
  await mkdir(STAGE, { recursive: true })
  const game = await copyTree(dist, path.join(STAGE, 'game'))
  console.log(`game: ${game.n} files, ${mb(game.bytes)}`)

  if (ART_IN) {
    for (const f of ['data/pack.json', 'data/boosters.json', 'data/carddata.json', 'data/built.json']) if (!existsSync(path.join(ART_IN, f))) die(`no ${f} in ${ART_IN}`)
    await copyTree(path.join(ART_IN, 'data'), path.join(STAGE, 'data'))
    const img = await copyTree(path.join(ART_IN, 'cards'), path.join(STAGE, 'cards'))
    console.log(`cards and data from ${ART_IN}: ${img.n} card faces`)
  } else {
    await cardsFromPokeshell(STAGE)
  }

  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'))
  const gitRev = (cwd) => { const g = spawnSync('git', ['-C', cwd, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }); return g.status === 0 ? g.stdout.trim() : null }
  const built = JSON.parse(await readFile(path.join(STAGE, 'data', 'built.json'), 'utf8'))
  let total = 0
  const files = await walk(STAGE)
  for (const p of files) total += (await stat(path.join(STAGE, p))).size
  const manifest = {
    name: 'pokeshell-arena-data', version: pkg.version, built: new Date().toISOString(), arena: gitRev(ROOT),
    pokeshell: ART_IN ? JSON.parse(await readFile(path.join(ART_IN, 'manifest.json'), 'utf8').catch(() => '{}')).pokeshell ?? null : gitRev(PS_ROOT),
    cards: built.built.length, shinyArt: built.shinyArt.length, files: files.length + 1, bytes: total,
  }
  await writeFile(path.join(STAGE, 'manifest.json'), JSON.stringify(manifest, null, 2))
  const pak = await writePak(STAGE, path.join(OUT, 'arena-data.pak'))
  console.log(`pak: ${path.join(OUT, 'arena-data.pak')} ${mb(pak.size)} (${pak.files} files) sha256 ${pak.sha256}`)

  if (ART_PAK) {
    // the art CI can't get from git: the gitignored public/ art, the card faces and data, as staged above
    const art = path.join(OUT, 'art')
    await rm(art, { recursive: true, force: true })
    await copyTree(path.join(ROOT, 'public', 'sprites'), path.join(art, 'public', 'sprites'))
    await copyTree(path.join(ROOT, 'public', 'arenas'), path.join(art, 'public', 'arenas'), (rel) => /\/(bg|props)\.png$|\.jpg$/.test(rel))
    await copyTree(path.join(STAGE, 'cards'), path.join(art, 'cards'))
    await copyTree(path.join(STAGE, 'data'), path.join(art, 'data'))
    await writeFile(path.join(art, 'manifest.json'), JSON.stringify({ name: 'pokeshell-arena-art', built: manifest.built, arena: manifest.arena, pokeshell: manifest.pokeshell, cards: manifest.cards }, null, 2))
    const a = await writePak(art, path.join(OUT, 'arena-art.pak'))
    await rm(art, { recursive: true, force: true })
    console.log(`art pak: ${path.join(OUT, 'arena-art.pak')} ${mb(a.size)} (${a.files} files) sha256 ${a.sha256}`)
  }
}

main().catch((e) => die(e?.stack ?? String(e)))
