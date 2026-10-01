// The pak format (host/src/assets.rs): "PKARENA1" (8 bytes), the index's length (u64 little-endian), the index (UTF-8
// JSON {"version":1,"files":{"<path>":[offset,length],...}}, offsets from the end of the index), then the files' bytes.
// Used for the game data the host embeds (arena-data.pak) and for the art CI builds it from (arena-art.pak).
//   node tools/release/pak.mjs unpack <file.pak> <dir>     extract every file
//   node tools/release/pak.mjs list <file.pak>             list them with sizes
import { createHash } from 'node:crypto'
import { mkdir, open, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MAGIC = Buffer.from('PKARENA1', 'ascii')

export async function walk(dir, base = dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) await walk(p, base, out)
    else if (e.isFile()) out.push(path.relative(base, p).split(path.sep).join('/'))
  }
  return out
}

/** every file under `dir` (sorted) into `file`; writes `<file>.sha256` too. Returns { size, sha256, files } */
export async function writePak(dir, file) {
  const all = (await walk(dir)).sort()
  const index = { version: 1, files: {} }
  let off = 0
  for (const p of all) { const n = (await stat(path.join(dir, p))).size; index.files[p] = [off, n]; off += n }
  const head = Buffer.from(JSON.stringify(index), 'utf8')
  const len = Buffer.alloc(8); len.writeBigUInt64LE(BigInt(head.length))
  const fh = await open(file, 'w')
  const hash = createHash('sha256')
  try {
    for (const b of [MAGIC, len, head]) { await fh.write(b); hash.update(b) }
    for (const p of all) { const b = await readFile(path.join(dir, p)); await fh.write(b); hash.update(b) }
  } finally { await fh.close() }
  const sha256 = hash.digest('hex')
  await writeFile(file + '.sha256', `${sha256}  ${path.basename(file)}\n`)
  return { size: (await stat(file)).size, sha256, files: all.length }
}

export async function readPak(file) {
  const b = await readFile(file)
  if (b.length < 16 || !b.subarray(0, 8).equals(MAGIC)) throw new Error(`${file}: not a pak`)
  const n = Number(b.readBigUInt64LE(8))
  const index = JSON.parse(b.subarray(16, 16 + n).toString('utf8'))
  const base = 16 + n
  return { bytes: b, files: Object.entries(index.files).map(([p, [o, len]]) => ({ path: p, start: base + o, len })) }
}

export async function unpack(file, dir) {
  const { bytes, files } = await readPak(file)
  for (const f of files) {
    if (f.path.split('/').some((x) => x === '..' || x === '') || path.isAbsolute(f.path)) throw new Error(`${file}: bad path ${f.path}`)
    const to = path.join(dir, ...f.path.split('/'))
    await mkdir(path.dirname(to), { recursive: true })
    await writeFile(to, bytes.subarray(f.start, f.start + f.len))
  }
  return files.length
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, file, dir] = process.argv.slice(2)
  if (cmd === 'unpack' && file && dir) console.log(`unpacked ${await unpack(file, dir)} files from ${file} into ${dir}`)
  else if (cmd === 'list' && file) for (const f of (await readPak(file)).files) console.log(`${String(f.len).padStart(10)}  ${f.path}`)
  else { console.error('usage: pak.mjs unpack <file.pak> <dir> | list <file.pak>'); process.exit(2) }
}
