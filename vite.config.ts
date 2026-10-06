import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProxyOptions } from 'vite'
import { defineConfig } from 'vitest/config'

// `npm run dev` proxies /api and /pokeshell to a running arena-host: POKEARENA_HOST, else the port in the arena
// state's host.json (pokearena -NoOpen starts one), else the default 47615.
function hostUrl(): string {
  if (process.env.POKEARENA_HOST) return process.env.POKEARENA_HOST
  const state = process.env.POKEARENA_HOME ?? join(process.env.LOCALAPPDATA ?? '.', 'pokeshell-arena')
  const hj = join(state, 'host.json')
  try {
    if (existsSync(hj)) return `http://127.0.0.1:${JSON.parse(readFileSync(hj, 'utf8')).port}`
  } catch { /* fall through */ }
  return 'http://127.0.0.1:47615'
}

const host = hostUrl()

// `vite build --mode web` (npm run build:web, the Vercel site): no host, the arena runs in the browser (src/web/,
// VITE_ARENA_BACKEND from .env.web). Card faces only when the art is in public/pokeshell/img (tools/web/art.mjs, opt-in).
const faces = existsSync(join(import.meta.dirname, 'public', 'pokeshell', 'img', 'pokemon'))

export default defineConfig(({ mode }) => {
  // the host checks Host/Origin, so the proxy rewrites them to the host's own origin; the web build has no host
  const proxy: Record<string, ProxyOptions> = mode === 'web' ? {} : {
    '/api': { target: host, changeOrigin: true, headers: { origin: host } },
    '/pokeshell': { target: host, changeOrigin: true },
  }
  return {
    base: './',
    define: { 'import.meta.env.VITE_ARENA_FACES': JSON.stringify(faces ? '1' : '0') },
    server: { proxy },
    preview: { proxy },
    build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 800 },
    test: {
      include: ['src/**/*.test.ts'],
      environment: 'node',
    },
  }
})
