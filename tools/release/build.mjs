// The downloadable arena, built locally (docs/RELEASE.md):  npm run release:win   (or: node tools/release/build.mjs mac)
//   1. npm run build                     the game (dist/), with the art already in public/ (install.ps1)
//   2. tools/release/bundle.mjs          release/arena-data.pak: the game, card data and card faces
//   3. cargo build --features bundle     the host with the pak embedded (MSVC on Windows when rustup has it)
//   4. tools/release/package.mjs         release/pokeshell-arena.exe + the zip (win), or the .app (mac: a universal
//                                        binary from both architectures, zipped with ditto)
// --skip-data reuses release/arena-data.pak (and dist/) as they are.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..')
const kind = process.argv[2] ?? (process.platform === 'darwin' ? 'mac' : 'win')
const skipData = process.argv.includes('--skip-data')
const win = process.platform === 'win32'

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`)
  // npm is npm.cmd on Windows: a batch file runs through the shell, given as one command line
  const r = win && cmd === 'npm'
    ? spawnSync(`npm ${args.join(' ')}`, { cwd: ROOT, stdio: 'inherit', shell: true, ...opts })
    : spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts })
  if (r.status !== 0) { console.error(`build: ${cmd} failed (${r.status ?? r.error?.message})`); process.exit(1) }
}

/** `+stable-x86_64-pc-windows-msvc` when rustup has it on Windows (a gnu default needs MinGW's dlltool) */
function toolchain() {
  if (!win) return []
  const r = spawnSync('rustup', ['toolchain', 'list'], { encoding: 'utf8' })
  return r.status === 0 && r.stdout.includes('stable-x86_64-pc-windows-msvc') ? ['+stable-x86_64-pc-windows-msvc'] : []
}

if (!skipData) {
  run('npm', ['run', 'build'])
  run('node', ['tools/release/bundle.mjs'])
} else if (!existsSync(join(ROOT, 'release', 'arena-data.pak'))) {
  console.error('build: --skip-data, but there is no release/arena-data.pak'); process.exit(1)
}
const cargo = (target) => {
  const args = [...toolchain(), 'build', '--release', '--features', 'bundle', '--manifest-path', 'host/Cargo.toml', '--target-dir', 'host/target/bundle']
  if (target) args.push('--target', target)
  run('cargo', args)
}
if (kind === 'win') {
  cargo()
  run('node', ['tools/release/package.mjs', 'win', join('host', 'target', 'bundle', 'release', win ? 'arena-host.exe' : 'arena-host')])
} else {
  // a universal binary: both architectures, joined with lipo (macOS only)
  for (const t of ['aarch64-apple-darwin', 'x86_64-apple-darwin']) cargo(t)
  const uni = join(ROOT, 'host', 'target', 'bundle', 'arena-host-universal')
  run('lipo', ['-create', '-output', uni, ...['aarch64-apple-darwin', 'x86_64-apple-darwin'].map((t) => join(ROOT, 'host', 'target', 'bundle', t, 'release', 'arena-host'))])
  run('node', ['tools/release/package.mjs', 'mac', uni])
}
