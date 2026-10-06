# The web arena (Vercel)

pokeshell arena as a static website: open the page and play. No download, no host, no pokeshell, no PowerShell.
It is the standalone arena (docs/RELEASE.md) with the host's job done in the browser.

## How it works

- **`npm run build:web`** builds the site into `dist/` (`vite build --mode web`; `.env.web` sets
  `VITE_ARENA_BACKEND=browser`). The page calls the same `/api/*` routes as always (`src/game/api.ts`), but in the
  web build they never reach the network: `src/web/backend.ts` answers them in the browser, the way the standalone host
  does (`host/src/standalone.rs`, `main.rs`, `state.rs`). The desktop and pokeshell builds are unchanged
  (`npm run build` doesn't include `src/web/` or its data).
- **A new visitor** gets **3 starter packs**, once per browser: the welcome card, "Open a pack", then the pulled cards
  are the roster. Wins earn tokens toward more packs (1v1 1, team 2, +1 hard, +2 expert; 10 make a pack), the same
  rules as the desktop arena.
- **Real boosters**: `src/web/booster.ts` is a port of `host/src/booster.rs` (pokeshell's booster model: slots,
  outcome weights, set choice by pack price, shiny roll, reveal order). `src/web/booster.test.ts` checks it against
  the odds pokeshell printed for the same data (`host/tests/fixtures/pokeshell/odds.json`), like `parity.rs`.
  Packs are rolled with `crypto.getRandomValues`.
- **State** is one JSON document in `localStorage` under `pokearena.web.v1` (`src/web/store.ts`): the wallet (balance,
  the starter record, recent lines), every caught card (count, shiny count, first and last caught), the progress toward
  the next pack, the latest 500 results (what makes a result count once) and saved teams. Settings (volume, loadout
  choices) keep their own keys as before. A private window that refuses storage plays from memory for that visit.
  Clearing the site's data starts over (with new starter packs). It's per browser: nothing syncs between devices.
- **Game data**: `data/pokeshell/` holds pokeshell's `pack.json`, `boosters.json`, `carddata.json` and `built.json`
  (the served cards): text data from pokeshell's public repository, loaded as lazy chunks.
  `node tools/web/sync-data.mjs --art <unpacked arena-art.pak>` (or with a pokeshell checkout next to this one)
  refreshes it.

## The art (opt-in)

The art is **not** in git and **not** in the default web build: the battle sprites are pokemon-colorscripts art of
Nintendo's Pokémon, the arena paintings are generated from card scenes, the card faces are rendered from card art
(README "Art", docs/RELEASE.md "Notes for a public repository"). Without it the web arena draws type-coloured discs,
plain grid arenas and text cards, and is fully playable.

With **`ARENA_WEB_ART=1`** in the build's environment, `tools/web/art.mjs` downloads the arena's art release
(`arena-art.pak`, the asset the desktop release is built from), checks its sha256 and unpacks the sprites, arena
paintings and card faces into `public/` (gitignored) before the build. The site is then about 68 MB instead of 3 MB.
Publishing that art on a public website is the owner's decision; the default is off. `.vercelignore` keeps a local
checkout's art out of a CLI upload, so the only way the art gets in is that variable.

Locally, from an art pak you already have: `node tools/web/art.mjs --pak <arena-art.pak>` or `--dir <unpacked>`.

## Deploy on Vercel

`vercel.json` sets it up: `npm ci`, `npm run build:web`, output `dist/`, long caching for `assets/`. There is no SPA
rewrite on purpose: the game has one page (it uses query parameters, not routes), and a missing sprite must stay a
404 so the game falls back to its disc instead of getting `index.html`.

**From GitHub (recommended):** push the branch (or merge it to `main`), then on vercel.com: Add New > Project > import
`gshklovs/pokeshell-arena`. Vercel reads `vercel.json` (framework Vite, build `npm run build:web`, output `dist`);
leave the root directory as is. Optionally add the environment variable `ARENA_WEB_ART=1` for the art. Deploy. Every
push then deploys (pull requests get preview URLs).

**With the CLI:** `npm i -g vercel`, `vercel login`, then in this folder `vercel` (links the project and makes a
preview deployment), and `vercel --prod` for production. `vercel env add ARENA_WEB_ART` turns the art on.

## Test

```sh
npm test                    # includes src/web/: the booster parity and the backend's rules
npm run build:web
node tests/web-smoke.mjs    # serves dist/ (vite preview) and plays it as a new visitor in headless Chromium
node tests/web-smoke.mjs https://<deployment>.vercel.app/   # the same against a deployment
npm run dev:web             # Vite dev server in web mode
```

The smoke test: empty storage, the welcome and its 3 starter packs, a pack opened through the scene, the loadout with
the pulled cards and the wallet, a battle from the Battle button won (its tokens on the result screen), a reload that
keeps everything, no page errors. Screenshots in `shots/web/`.
