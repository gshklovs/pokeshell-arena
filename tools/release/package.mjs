// Package a bundled arena-host build (cargo build --release --features bundle) for download (docs/RELEASE.md).
//
//   node tools/release/package.mjs win <arena-host.exe>       release/pokeshell-arena.exe and
//                                                             release/pokeshell-arena-<version>-windows-x64.zip
//   node tools/release/package.mjs mac <universal binary>     release/pokeshell arena.app (Info.plist, the icon) and
//                                                             release/pokeshell-arena-<version>-macos-universal.zip
//
// The zip of the .app is made with `ditto` on macOS (it keeps the executable bit and the bundle's metadata); elsewhere
// the .app folder is only assembled (a zip made on Windows would lose the executable bit). Each zip has a
// "READ ME FIRST.txt" with the first-launch steps for an unsigned app.
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..')
const OUT = join(ROOT, 'release')
const [kind, bin] = process.argv.slice(2)
const die = (m) => { console.error(`package: ${m}`); process.exit(1) }
if (!['win', 'mac'].includes(kind) || !bin) die('usage: package.mjs win|mac <binary>')
if (!existsSync(bin)) die(`no ${bin}`)
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
const mb = (p) => `${(statSync(p).size / 1048576).toFixed(1)} MB`
mkdirSync(OUT, { recursive: true })

function run(cmd, args, cwd = OUT) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' })
  if (r.status !== 0) die(`${cmd} ${args.join(' ')} failed (${r.status ?? r.error?.message})`)
}

const README_WIN = `pokeshell arena ${version} for Windows
=====================================

Real-time Pokemon battles with real booster packs, in your browser. No install, no terminal.

1. Unzip this folder anywhere (Desktop, Documents...). Don't run it from inside the zip.
2. Double-click pokeshell-arena.exe. Your browser opens the game.
   The first time, Windows SmartScreen may say "Windows protected your PC" (the app isn't signed):
   click "More info", then "Run anyway". It only asks once.
3. You start with 3 free packs. Open them, pick your team, fight the bots. Wins earn tokens:
   10 tokens make another pack.

Double-clicking it again while it runs just opens the game again. It closes by itself a couple of minutes
after you close the game's tab. Your cards and packs are saved in %LOCALAPPDATA%\\pokeshell-arena-standalone
(delete that folder to start over).

A fan project, not affiliated with the owners of the characters: card names, numbers and art belong to their owners.
`

const README_MAC = `pokeshell arena ${version} for macOS (Apple silicon and Intel)
==============================================================

Real-time Pokemon battles with real booster packs, in your browser. No install, no terminal.

1. Unzip, then drag "pokeshell arena" into your Applications folder (or anywhere).
2. The first time: the app isn't signed by an identified developer, so macOS won't open it on a double-click.
   Right-click (or Control-click) "pokeshell arena", choose Open, then Open again in the dialog.
   On macOS 15 (Sequoia) and later: double-click it once, then open System Settings > Privacy & Security, scroll
   down to "pokeshell arena was blocked", click "Open Anyway" and confirm.
   It only asks once; after that a double-click opens it.
3. Your browser opens the game. You start with 3 free packs. Open them, pick your team, fight the bots.
   Wins earn tokens: 10 tokens make another pack.

Opening the app again while it runs just opens the game again. It quits by itself a couple of minutes after you close
the game's tab. Your cards and packs are saved in ~/Library/Application Support/pokeshell-arena (delete that folder
to start over).

A fan project, not affiliated with the owners of the characters: card names, numbers and art belong to their owners.
`

if (kind === 'win') {
  const exe = join(OUT, 'pokeshell-arena.exe')
  copyFileSync(bin, exe)
  const stage = join(OUT, 'win')
  rmSync(stage, { recursive: true, force: true })
  const dir = join(stage, 'pokeshell-arena')
  mkdirSync(dir, { recursive: true })
  copyFileSync(exe, join(dir, 'pokeshell-arena.exe'))
  writeFileSync(join(dir, 'READ ME FIRST.txt'), README_WIN.replace(/\n/g, '\r\n'))
  const zip = join(OUT, `pokeshell-arena-${version}-windows-x64.zip`)
  rmSync(zip, { force: true })
  if (process.platform === 'win32') {
    run('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${dir.replace(/'/g, "''")}' -DestinationPath '${zip.replace(/'/g, "''")}' -CompressionLevel Optimal`])
  } else {
    run('zip', ['-r', '-9', zip, 'pokeshell-arena'], stage)
  }
  rmSync(stage, { recursive: true, force: true })
  console.log(`windows: ${exe} (${mb(exe)}), ${zip} (${mb(zip)})`)
} else {
  const app = join(OUT, 'pokeshell arena.app')
  rmSync(app, { recursive: true, force: true })
  const macos = join(app, 'Contents', 'MacOS'), res = join(app, 'Contents', 'Resources')
  mkdirSync(macos, { recursive: true })
  mkdirSync(res, { recursive: true })
  copyFileSync(bin, join(macos, 'pokeshell-arena'))
  chmodSync(join(macos, 'pokeshell-arena'), 0o755)
  copyFileSync(join(ROOT, 'host', 'assets', 'icon.icns'), join(res, 'icon.icns'))
  // LSUIElement: no Dock icon (the game is the browser tab). The launcher starts the host in the background and exits,
  // so opening the app again runs the launcher again, which reuses the running host
  writeFileSync(join(app, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>pokeshell arena</string>
  <key>CFBundleDisplayName</key><string>pokeshell arena</string>
  <key>CFBundleIdentifier</key><string>io.github.pokeshell.arena</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>pokeshell-arena</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSHumanReadableCopyright</key><string>MIT (code). A fan project: card names, numbers and art belong to their owners.</string>
</dict>
</plist>
`)
  writeFileSync(join(OUT, 'READ ME FIRST (mac).txt'), README_MAC)
  if (process.platform === 'darwin') {
    // an ad-hoc signature over the whole bundle (no identity: still "unidentified developer"). Apple silicon runs no
    // unsigned arm64 code, and a bundle whose binary is signed but whose Info.plist isn't sealed reads as "damaged"
    run('codesign', ['--force', '--deep', '--sign', '-', app])
    run('codesign', ['--verify', '--deep', '--strict', app])
    const stage = join(OUT, 'mac')
    rmSync(stage, { recursive: true, force: true })
    mkdirSync(stage, { recursive: true })
    run('ditto', [app, join(stage, 'pokeshell arena.app')])
    copyFileSync(join(OUT, 'READ ME FIRST (mac).txt'), join(stage, 'READ ME FIRST.txt'))
    const zip = join(OUT, `pokeshell-arena-${version}-macos-universal.zip`)
    rmSync(zip, { force: true })
    run('ditto', ['-c', '-k', '--sequesterRsrc', stage, zip])
    rmSync(stage, { recursive: true, force: true })
    console.log(`macos: ${app}, ${zip} (${mb(zip)})`)
  } else {
    console.log(`macos: ${app} assembled (zip it on macOS with ditto: the executable bit must survive)`)
  }
}
