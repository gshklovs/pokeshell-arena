# pokeshell arena

[![pokeshell arena: real-time Pokémon card battles, then open the packs you win](docs/media/teaser.gif)](https://github.com/gshklovs/pokeshell-arena/releases/latest)

Real-time top-down Pokémon battles with the cards you pulled in [pokeshell](https://github.com/gshklovs/pokeshell).
A separate, optional install: pokeshell itself never depends on it. Or play it on its own: download it, open your
free starter packs, battle.

## Download & play (no terminal)

1. Download the zip for your computer from the latest release (Releases, on the right of this page):
   **Windows** `pokeshell-arena-<version>-windows-x64.zip`, **Mac** `pokeshell-arena-<version>-macos-universal.zip`
   (Apple silicon and Intel).
2. Unzip it. **Windows:** double-click `pokeshell-arena.exe`. **Mac:** drag **pokeshell arena** into Applications and
   open it.
3. The game opens in your browser. You start with **3 free booster packs**: open them, pick a team from the cards you
   pulled, fight the bots. Wins earn tokens, and every 10 tokens make another pack.

The apps aren't code-signed, so the first launch needs one extra click:
- **Windows** shows "Windows protected your PC": click **More info**, then **Run anyway**.
- **Mac** won't open it on a double-click the first time: right-click (Control-click) it, **Open**, then **Open**
  again. On macOS 15 Sequoia and later: double-click once, then **System Settings > Privacy & Security** >
  "pokeshell arena was blocked" > **Open Anyway**.

Opening it again while it runs brings the game back; it closes by itself a couple of minutes after you close the tab.
Your cards and packs are saved in your user folder (`%LOCALAPPDATA%\pokeshell-arena-standalone` on Windows,
`~/Library/Application Support/pokeshell-arena` on a Mac). This standalone arena keeps its own collection: it doesn't
need or touch pokeshell. How it's built and released: [docs/RELEASE.md](docs/RELEASE.md).

With pokeshell installed, the arena reads it (its card data, card art and your collection) through pokeshell's JSON
commands, and records pack pulls won in battle through `pokeshell pack open`.
Design and contracts: [docs/SPEC.md](docs/SPEC.md).

- Move with WASD and aim with the mouse. Hold click / J K L to aim an attack, release to fire (a swap cancels it).
  Dodge with Space, swap with the number keys 1-6 (after a KO you can also click the next card), evolve with F (Tab
  picks between evolutions), or use a gamepad. Esc pauses; Quit match (in the pause menu, Q, or the small HUD button)
  forfeits: a loss, no pack tokens. Mid-fight the HUD never eats a click: every click over the arena is an
  attack. Ten arenas painted from
  real card scenes, with breakable props and type terrain: Water floods, Lightning electrifies the water, Fire burns
  the grass.
- **Team battles** of 3-6 with bench swaps (knock out the whole bot team to win), or a **1v1 quick match**, against bots at four levels
  (easy, normal, hard, expert) that field real cards.
- Every attack is a real card attack with its real energy cost, paid from **one energy meter** that fills over time.
- **Evolve mid-match**: deal damage and take KOs to fill the evolve charge, then turn into a next-stage card you own.
- Real HP, weakness, resistance and retreat cost. Coin flips come from a seeded PRNG.
- The shapes of pokeshell's web binder (pages, pockets, divider tabs, card frames) in the arena's dark navy and gold.
- The sim is deterministic, fixed-tick (60 Hz) and input-driven, so rollback netcode can come later.

## Run it

Needs Node 20+ and Rust (the MSVC toolchain on Windows).

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1     # art if missing, npm ci + build, cargo build --release
scripts\pokearena.cmd                                       # starts arena-host, opens http://127.0.0.1:47615/
scripts\pokearena.cmd status                                # or: stop
```

- **Rust on Windows**: install.ps1 builds with `cargo +stable-x86_64-pc-windows-msvc` whenever that toolchain is
  installed, and installs it (rustup, user-local) when the default is gnu without `dlltool`.
- **The host** (`host/`, `arena-host.exe`) serves `dist/` and the JSON API on port 47615 (a free port if that one is
  taken; the launcher opens whichever it got). It exits by itself a minute after the
  last game tab closes.
- **State** is in `%LOCALAPPDATA%\pokeshell-arena` (`$env:POKEARENA_HOME`): matches and team loadouts. Pack tokens live in pokeshell's own wallet
  (`pokeshell pack tokens`): a win calls `pokeshell pack grant`, opening a pack calls `pokeshell pack open`.
- **You battle with the cards you caught.** Without pokeshell, or with no caught Pokémon, the page explains how to get
  some. Wins earn tokens (1v1 1, team 2, +1 on hard, +2 on expert); every 10 make a pack in pokeshell's wallet
  (`pokeshell pack grant 1`), the rest carries over. Opening a pack opens a random set (pokeshell rolls the set by
  pack price, so a vintage Base Set or Neo Genesis pack is about 1 in 60): the game shows which pack you got, then the
  pack scene (`src/packs`). A "pack odds" panel lists every set's chance.

**Art** is not in git: the battle sprites are the pokemon-colorscripts sprites (Nintendo artwork) and the arena
paintings are generated from card scenes. Until the arena art release ships them (TODO), install.ps1 fills in what's
missing from a pokeshell checkout next to this one (`..\pokeshell`, `$env:POKESHELL_REPO` or `-Pokeshell <path>`):
the sprites are built with `tools\build_sprites.py` from `<pokeshell>\vendor\pokemon-colorscripts` (or
`-Vendor <path>`), and `public\arenas\*\bg.png`, `props.png` are copied from `<pokeshell>\style-lab\arenas\`
(`tools\arenas\README.md`). `-SkipArt` skips it. Without the art the game draws the grid and type-coloured discs.
**Card faces** come from pokeshell's web export (`<pokeshell state>\web\img`); `pokeshell binder --web --noopen`
creates or refreshes it.

## Develop

```powershell
npm run dev          # Vite on :5173; /api is proxied to a running arena-host (pokearena -NoOpen starts one)
npm test             # typecheck + vitest: sim, determinism, evolving, effect ops, kits, arenas, bots, the bot ladder
npm run typecheck
npm run shots        # Playwright screenshots + a fight video into shots\: a temp arena-host with the stand-in pokeshell
                     # (a richer collection with card faces when ..\pokeshell is checked out), nothing left running
cargo test --release --manifest-path host\Cargo.toml   # incl. the standalone wallet, starter packs, tokens, pack-odds parity
powershell -NoProfile -ExecutionPolicy Bypass -File tests\test-host.ps1   # the host end to end, temp dirs only
npm run release:win  # the downloadable Windows build in release\ (docs/RELEASE.md); npm run test:standalone tests it
```

- **Kit checks against real card data**: `$env:POKEARENA_CARDS = '..\pokeshell\packs\pokemon\carddata.json'`, then
  `npm test` also checks every kit's numbers against the real cards, and builds an auto-kit for every card.
- **URL params** drive the page (screenshots, tests):
  `?auto=1&mode=team&me=base1-46,base1-63,base1-58&arena=lapras-lagoon&diff=hard&seed=4` (`foe=` names the bot's cards,
  else the bot rolls good cards for its level). `?deck=random|choose&mode=team&team=<card>,...` presets the loadout.
  Add `&bots=1` to let a bot play you too (a demo: no rewards). `window.__arena` exposes the running match.

| where | what |
|---|---|
| `src/sim/` | the deterministic core: `step(def, state, inputs)`, integer math, the effect registry (`effects/ops/<op>.ts`, one file + test per op) |
| `src/bots/` | the `Bot` contract, `BotDriver` (reaction delay, aim error), `createBot(level)` (easy / normal / hard / expert), the headless ladder |
| `src/game/` | loadout (your cards, saved teams), the two bot-match modes, Random decks and You choose (rolled from `data/bots/roster.json`), the reveal, match loop, result, the way to the pack scene |
| `src/render/`, `src/audio/` | the renderer (game feel is render-only: the sim never sees it), HUD, synthesised sfx |
| `src/packs/` | the pack opening scene |
| `src/input/` | keyboard, mouse (clicks on the team bar swap), gamepad → InputFrame |
| `data/kits/<card id>.json` | per-card kits: shapes and effects over the card's own numbers |
| `public/arenas/<id>/` | the ten arenas (`arena.json`, `props.json`; art is gitignored) |
| `host/` | `arena-host`, Rust: the pokeshell host and the standalone one (`standalone.rs`, `booster.rs`, the embedded data in `assets.rs`) |
| `tools/release/`, `.github/workflows/release.yml` | the downloadable build: the data pak, the packages, the release workflow (docs/RELEASE.md) |
| `scripts/`, `install.ps1` | the `pokearena` launcher and the installer |

## Credits

- **[Emerald Arena](https://github.com/GBurgardt/pokemon-emerald-arena)** by **German Burgardt**
  ([@germanburgardt](https://x.com/germanburgardt), [itch.io](https://germanburgardt.itch.io/emerald-arena)): the
  real-time Pokémon arena this game is inspired by. Move, aim, dodge, break props, and the idea that a Pokémon battle
  can be a top-down action fight. No code from it is used; go play the original.
- **[pokemon-colorscripts](https://gitlab.com/phoneybadger/pokemon-colorscripts)** by phoneybadger: the pixel sprites
  the battle sprites are built from.
- **[Pokémon TCG API](https://pokemontcg.io)**: the card data (HP, attacks, costs, weaknesses, rarities) the kits are
  built over.
- **Sound effects**: CC0 sources, Kenney.nl among them, listed in [docs/SFX_CREDITS.md](docs/SFX_CREDITS.md).
- **[pokeshell](https://github.com/gshklovs/pokeshell)**: the terminal card pulls this arena battles with.
- Design references for the feel of hits and telegraphs: Pokémon Unite, Hades, Smash Bros. (docs/MELEE.md).

## License

MIT for the code, see [LICENSE](LICENSE). It's a fan project, not affiliated with or endorsed by Nintendo, The
Pokémon Company, Game Freak or Creatures; Pokémon names, card names, numbers and art belong to their owners, and the
license grants no rights in them.
