// Shards tools/melee/stats.ts (or --script human: tools/melee/human.ts) over a few processes and merges them
// (docs/MELEE.md):
//   node tools/melee/run.mjs [--jobs 8] [--script stats|human] [its args...]
// Defaults to half the cores (the user's machine keeps the rest). Needs POKEARENA_CARDS or the sibling pokeshell.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { cpus, tmpdir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(2)
let jobs = Math.max(1, Math.floor(cpus().length / 2))
if (argv.includes('--jobs')) { jobs = parseInt(argv[argv.indexOf('--jobs') + 1], 10); argv.splice(argv.indexOf('--jobs'), 2) }
let script = 'tools/melee/stats.ts'
if (argv.includes('--script')) { script = `tools/melee/${argv[argv.indexOf('--script') + 1]}.ts`; argv.splice(argv.indexOf('--script'), 2) }
const dir = mkdtempSync(join(tmpdir(), 'pokearena-melee-'))
const viteNode = join(process.cwd(), 'node_modules', 'vite-node', 'vite-node.mjs')
const run = (args) => new Promise((res, rej) => {
  const p = spawn(process.execPath, [viteNode, script, ...args], { stdio: ['ignore', 'pipe', 'inherit'] })
  let out = ''
  p.stdout.on('data', (d) => { out += d })
  p.on('close', (code) => (code === 0 ? res(out) : rej(new Error(`shard exited ${code}`))))
})
const t0 = Date.now()
const files = Array.from({ length: jobs }, (_, i) => join(dir, `shard-${i}.json`))
await Promise.all(files.map((f, i) => run([...argv, '--shard', `${i}/${jobs}`, '--json', f])))
console.log((await run(['--merge', ...files, ...argv])).trim())
console.log(`\n(${jobs} shards, ${((Date.now() - t0) / 1000).toFixed(0)} s)`)
rmSync(dir, { recursive: true, force: true })
