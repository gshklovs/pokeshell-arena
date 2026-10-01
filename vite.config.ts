import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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

export default defineConfig({
  base: './',
  server: {
    // the host checks Host/Origin, so the proxy rewrites them to the host's own origin
    proxy: {
      '/api': { target: host, changeOrigin: true, headers: { origin: host } },
      '/pokeshell': { target: host, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 800 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
