// Loading arenas (docs/SPEC.md section 8): arena.json (+ props.json) and their images from /arenas/<id>/.
import { parseArena, validateArena } from '../sim/arena'
import type { ArenaDef, ArenaFile, PropFrame } from '../sim/types'

export { validateArena }

export interface LoadedArena {
  def: ArenaDef
  bg: HTMLImageElement | null
  props: HTMLImageElement | null
  frames: PropFrame[]
}

const base = () => `${import.meta.env.BASE_URL}arenas/`

export async function arenaIndex(): Promise<string[]> {
  const r = await fetch(`${base()}index.json`)
  if (!r.ok) throw new Error(`arenas/index.json: ${r.status}`)
  const j = await r.json()
  return j.arenas as string[]
}

function image(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = url
  })
}

export async function loadArenaFile(id: string): Promise<ArenaFile> {
  const r = await fetch(`${base()}${id}/arena.json`)
  if (!r.ok) throw new Error(`arena ${id}: ${r.status}`)
  const f = (await r.json()) as ArenaFile
  // only arenas with breakable props ('o' cells) ship a props.json
  const pr = f.grid?.some(row => row.includes('o')) ? await fetch(`${base()}${id}/props.json`).catch(() => null) : null
  if (pr && pr.ok && (pr.headers.get('content-type') ?? '').includes('json')) {
    try { f.propFrames = (await pr.json()).frames } catch { /* no props.json */ }
  }
  return f
}

export async function loadArena(id: string): Promise<LoadedArena> {
  const f = await loadArenaFile(id)
  const { warnings } = validateArena(f)
  if (warnings.length) console.warn(`arena ${id}:`, warnings)
  const def = parseArena(f)
  const [bg, props] = await Promise.all([image(`${base()}${id}/bg.png`), f.propFrames ? image(`${base()}${id}/props.png`) : Promise.resolve(null)])
  return { def, bg, props, frames: f.propFrames ?? [] }
}
