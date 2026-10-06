// The web arena's art, OPT-IN. The art isn't in git and is copyrighted (the battle sprites are pokemon-colorscripts
// art of Nintendo's Pokémon, the arena paintings are generated from card scenes, the card faces are rendered from card
// art; README "Art", docs/RELEASE.md "Notes for a public repository"). Without it the web arena draws type-coloured
// discs, plain arenas and text cards. With ARENA_WEB_ART=1 (e.g. a Vercel environment variable) the web build puts the
// arena's art release (arena-art.pak, the same asset the desktop release is built from) into public/ first:
//   public/sprites/**, public/arenas/<id>/{bg,props}.png, public/pokeshell/img/pokemon/** (card faces)
// all gitignored. Deciding to publish that art on a public website is the owner's call, not the build's default.
//
//   ARENA_WEB_ART=1 node tools/web/art.mjs          download (ARENA_ART_URL, else the arena-art release), check, unpack
//   node tools/web/art.mjs --pak <file.pak>          from a local pak (always runs)
//   node tools/web/art.mjs --dir <unpacked pak>      from an unpacked pak (always runs)
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { unpack } from '../release/pak.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const REL = 'https://github.com/gshklovs/pokeshell-arena/releases/download/arena-art'
const argv = process.argv.slice(2)
const arg = (k) => (argv.includes(k) ? path.resolve(argv[argv.indexOf(k) + 1] ?? '') : null)
const die = (m) => { console.error(`web art: ${m}`); process.exit(1) }

let dir = arg('--dir')
const pakIn = arg('--pak')
if (!dir && !pakIn && process.env.ARENA_WEB_ART !== '1') {
  console.log('web art: off (ARENA_WEB_ART=1 to include the arena art release): the web build draws discs and text cards')
  process.exit(0)
}

const tmp = await mkdtemp(path.join(tmpdir(), 'arena-web-art-'))
try {
  if (!dir) {
    let file = pakIn
    if (!file) {
      const url = process.env.ARENA_ART_URL || `${REL}/arena-art.pak`
      console.log(`web art: downloading ${url}`)
      const r = await fetch(url)
      if (!r.ok) die(`${url}: HTTP ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      const want = process.env.ARENA_ART_SHA256 || (process.env.ARENA_ART_URL ? null : (await (await fetch(`${REL}/arena-art.pak.sha256`)).text()).split(/\s+/)[0])
      const got = createHash('sha256').update(buf).digest('hex')
      if (want && want !== got) die(`sha256 ${got}, expected ${want}`)
      file = path.join(tmp, 'arena-art.pak')
      await writeFile(file, buf)
    }
    dir = path.join(tmp, 'art')
    console.log(`web art: unpacked ${await unpack(file, dir)} files`)
  }
  const copies = [
    [path.join(dir, 'public', 'sprites'), path.join(ROOT, 'public', 'sprites')],
    [path.join(dir, 'public', 'arenas'), path.join(ROOT, 'public', 'arenas')],
    [path.join(dir, 'cards', 'img'), path.join(ROOT, 'public', 'pokeshell', 'img')],
  ]
  for (const [from, to] of copies) {
    if (!existsSync(from)) die(`no ${from} in the art`)
    await mkdir(to, { recursive: true })
    await cp(from, to, { recursive: true })
    console.log(`web art: ${path.relative(ROOT, to)}`)
  }
} finally {
  await rm(tmp, { recursive: true, force: true })
}
