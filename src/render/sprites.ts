// Battle sprites (docs/SPEC.md section 12): /sprites/<character>[-shiny].png (the colorscripts sprites, built by
// tools/build_sprites.py, shipped in the arena art release), else a type-coloured disc drawn by the renderer.
const cache = new Map<string, HTMLImageElement | null>()
const pending = new Map<string, Promise<HTMLImageElement | null>>()

function load(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = url
  })
}

/** candidates for a character: the exact name, then the base species (e.g. "leafeon-v" -> "leafeon") */
function names(character: string): string[] {
  const out = [character]
  const base = character.replace(/-(v|vmax|vstar|gx|ex|v-union|radiant|galarian|hisuian|alolan)$/, '')
  if (base !== character) out.push(base)
  return out
}

export function sprite(character: string, shiny = false): HTMLImageElement | null {
  const key = `${character}${shiny ? '-shiny' : ''}`
  if (cache.has(key)) return cache.get(key)!
  if (!pending.has(key)) {
    const p = (async () => {
      for (const n of names(character)) {
        const img = (shiny ? await load(`${import.meta.env.BASE_URL}sprites/${n}-shiny.png`) : null) ?? (await load(`${import.meta.env.BASE_URL}sprites/${n}.png`))
        if (img) return img
      }
      return null
    })()
    pending.set(key, p)
    p.then((img) => cache.set(key, img))
  }
  return null
}

/** preload a list, resolved when all are settled */
export async function preload(chars: { character: string; shiny?: boolean }[]): Promise<void> {
  for (const c of chars) sprite(c.character, c.shiny)
  await Promise.all([...pending.values()])
}

export const TYPE_COLOR: Record<string, string> = {
  Grass: '#5dbb4f', Fire: '#f0643c', Water: '#4aa3f0', Lightning: '#f7d038', Psychic: '#b36ee0',
  Fighting: '#d0803e', Darkness: '#6a5f8e', Metal: '#9fb0bd', Fairy: '#f08cc8', Dragon: '#c9a13a', Colorless: '#e8e4d8',
}

const tints = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>()
/** the sprite's silhouette in one solid colour (hit flash, outline, afterimages), cached per image and colour */
export function tintOf(img: HTMLImageElement, color: string): HTMLCanvasElement {
  let m = tints.get(img)
  if (!m) { m = new Map(); tints.set(img, m) }
  let c = m.get(color)
  if (c) return c
  c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const g = c.getContext('2d')!
  g.drawImage(img, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, c.width, c.height)
  m.set(color, c)
  return c
}

export function whiteOf(img: HTMLImageElement): HTMLCanvasElement {
  return tintOf(img, '#ffffff')
}

/** the sprite's opaque bounds, so a scaled-up sprite stands on its feet rather than on its transparent padding */
const bounds = new WeakMap<HTMLImageElement, { x: number; y: number; w: number; h: number }>()
export function boundsOf(img: HTMLImageElement): { x: number; y: number; w: number; h: number } {
  let b = bounds.get(img)
  if (b) return b
  b = { x: 0, y: 0, w: img.width, h: img.height }
  try {
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    }
    if (x1 >= 0) b = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
  } catch { /* a tainted canvas: use the whole image */ }
  bounds.set(img, b)
  return b
}

/** hex colour -> rgba() string */
export function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
