// Runs the balance tournament in parallel shards and merges them:
//   node tools/kits/run.mjs [--jobs 6] [tournament args...]
// Each shard is `vite-node tools/kits/tournament.ts --shard i/n --json <tmp>`; the merged report goes to stdout.
// Needs POKEARENA_CARDS (or the sibling pokeshell checkout), like the tournament.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir, cpus } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(2)
let jobs = Math.max(1, Math.min(8, cpus().length - 1))
if (argv.includes('--jobs')) { jobs = parseInt(argv[argv.indexOf('--jobs') + 1], 10); argv.splice(argv.indexOf('--jobs'), 2) }
// --save <file>: keep the merged rows (JSON) for later queries
let save = null
if (argv.includes('--save')) { save = argv[argv.indexOf('--save') + 1]; argv.splice(argv.indexOf('--save'), 2) }
const dir = mkdtempSync(join(tmpdir(), 'pokearena-tournament-'))
// vite-node's own entry, run by this node (no shell: regex args like "a|b" pass through untouched)
const viteNode = join(process.cwd(), 'node_modules', 'vite-node', 'vite-node.mjs')
const run = (args) => new Promise((res, rej) => {
  const p = spawn(process.execPath, [viteNode, 'tools/kits/tournament.ts', ...args], { stdio: ['ignore', 'pipe', 'inherit'] })
  let out = ''
  p.stdout.on('data', (d) => { out += d })
  p.on('close', (code) => (code === 0 ? res(out) : rej(new Error(`shard exited ${code}`))))
})
const t0 = Date.now()
const files = Array.from({ length: jobs }, (_, i) => join(dir, `shard-${i}.json`))
await Promise.all(files.map((f, i) => run([...argv, '--shard', `${i}/${jobs}`, '--json', f])))
const keep = argv.filter((a, i) => a === '--mixed' || a === '--level' || a === '--top' || argv[i - 1] === '--level' || argv[i - 1] === '--top')
const merged = await run(['--merge', ...files, ...keep, ...(save ? ['--out', save] : [])])
console.log(merged.trim())
console.log(`\n(${jobs} shards, ${((Date.now() - t0) / 1000).toFixed(0)} s)`)
rmSync(dir, { recursive: true, force: true })
