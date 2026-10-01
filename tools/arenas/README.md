# Arena maps

Ten pregenerated battle arenas, each the place of one real card seen from above. Each one is a painting
generated from that card's own scene with the Pokémon painted out, plus a tile grid authored from the painting.

| id | card | name | the place |
|---|---|---|---|
| `kyogre-storm-sea` | swsh12pt5-36 Kyogre | Tempest Sea | wave-washed rock shelves in a stormy teal sea, two side islands on causeways |
| `magmar-volcano` | neo1-40 Magmar | Cinder Caldera | basalt crater floor crossed by glowing lava rivers (hazard), black rock spires |
| `zarude-jungle` | swsh12pt5-16 Zarude | Deep Jungle Clearing | mossy clearing walled by giant roots and vines, fallen trunks as cover, tall grass |
| `sableye-crystal-cave` | swsh11-70 Sableye | Gem Cavern | violet cave floor, crystal walls, four breakable crystal clusters, dark pools |
| `liepard-night-city` | swsh9-91 Liepard | Midnight Rooftops | night plaza ringed by violet towers, moon emblem, planters, breakable crates |
| `lapras-lagoon` | sm115-17 Lapras | Seafoam Lagoon | pale sand and wadeable shallows in a turquoise lagoon, rock ridges, deep water rim |
| `glastrier-ice-field` | swsh11-51 Glastrier | Crown Tundra Ice Field | open snow, ice-spire clusters and snowy pines, frozen ponds, a breakable spire |
| `cresselia-moonlit-sky` | swsh11-74 Cresselia | Crescent Isle | a floating moonstone island in a starry void, rock outcrops, crystal pillars |
| `herdier-temple` | swsh7-134 Herdier | Stone Stair Temple | a pink sandstone courtyard like a gym floor, stair walls, pillars, breakable lanterns |
| `growlithe-meadow` | base1-28 Growlithe | Kanto Meadow | short grass and dirt paths, round trees, tall-grass patches, a small central pond |

Sets covered: cz (2), lor (3), evs, hf, base, brs, neo1. None from p30: its Lugia (me55-121) is 80 % of the art
window, so too little of the scene is left to build on.

## Files

`public/arenas/<id>/`:

- `arena.json` (tracked): the format below.
- `bg.png` (gitignored), 1920x1080: the painting. Where props were cut out, the floor is painted back under them.
- `props.png` (gitignored) + `props.json` (tracked), optional: the breakable props as an RGBA atlas. Each frame has its
  rect in the atlas (`x y w h`), where it sits in the arena (`at`, top-left px), and the `o` cells it covers (`tiles`).
  The game draws the frame over bg.png until the prop breaks; then only the floor is left.

```
{ "id", "name", "sourceCard": "swsh12pt5-36",
  "size": {"w": 1920, "h": 1080}, "tile": 40,
  "grid": [27 strings of 48 chars],
  "spawns": [{"team": 0, "x": .., "y": ..}, ... 3 per team, team 1 mirrors team 0],
  "ambient": {"tint": "#rrggbb", "particles": "leaves|snow|embers|bubbles|none"} }
```

Grid chars: `.` floor, `#` wall / impassable, `~` water (no walking; shots pass; fliers cross), `_` pit / void (the
same for ground fighters and shots; fliers cross), `"` tall grass (walkable),
`^` hazard (walkable, hurts: lava), `o` breakable prop (blocks until broken), `=` low obstacle (a rock, a bush,
a stump, a ledge: no walking, shots fly over it; fliers cross). Only tall things are `#`: a shot stops on `#` and
`o` alone. `tools/colliders/` renders the grid over the art and audits it (src/sim/colliders.ts). The validator and the spawn picker
treat `. " ^ o` as walkable. The engine may refine these rules in docs/SPEC.md.

## Where the images live

Nothing binary is committed. The card scans and masks are read from the pokeshell checkout
(`<pokeshell>/style-lab/<set>/ref`, `masks`; `$POKESHELL_REPO`, default `../pokeshell` next to this checkout) and never
copied here. The working images go to `<pokeshell>/style-lab/arenas/` (untracked):

```
style-lab/arenas/<id>/card.png       the real card scan (copy)
                      scene.png      its painted-out scene: the reference image the model was given
                      gen-<k>.png    every generation (raw-<k>.png = the model's 1920x1088 original)
                      gen.jsonl      the log: prompt, model, size, token usage per generation
                      bg-full.png    the picked generation, untouched
                      bg.png         the same with the props cut out (= public/arenas/<id>/bg.png)
                      props.png/json the prop atlas
                      tiles.jpg      bg with tile numbers (for picking prototypes and fixes)
                      overlay.jpg    bg + props + grid + spawns, full size
style-lab/arenas/sheets/<id>.jpg     lookbook sheet: card | painted-out scene | arena with grid
style-lab/arenas/sheets/contact.jpg  all ten
```

**Art release:** the arena backgrounds ship through this repo's own art release later, not through pokeshell's
`tools/publish_art.ps1`. Its asset set is `public/arenas/*/bg.png` and `public/arenas/*/props.png` (the files the
.gitignore keeps out). Everything else under `public/arenas/` is tracked.

## Pipeline

Run from `tools/arenas/` with the pokeshell `.venv` Python (Pillow, numpy, scipy, openai).
`OPENAI_API_KEY` must be in the environment; the tools never print or log it.

1. `scene.py` — card scan + mask -> the art window with the Pokémon painted out (pokeshell's `evlib.tex_fill`,
   docs/ART_METHOD.md section 7), plus per-card boxes (stage icon) from `arenas.json`.
2. `gen.py <id> [--extra "..."]` (or `batch.py <id> ...` in parallel) — OpenAI image edit, `gpt-image-2`,
   1920x1088, quality high, the scene as the reference. The prompt is `arenas.json` (`place`, `layout`) + the shared
   `STYLE` and `RULES` in gen.py, so all ten share one look; `--extra` adds a per-attempt note.
3. `pick.py` — `arenas.json` `pick` -> bg.png; writes `prompts.json` (the exact prompts used) and `generations.json`
   (counts and tokens).
4. `grid.py` — the grid: each pixel (1/4 scale) goes to the nearest colour centre (Lab + local texture) of the
   prototype tiles in `segs.json`, a tile takes a class when enough of its pixels do, then the hand fixes in
   `segs.json`, a left-right symmetric merge (the more blocking tile wins), a solid border, sealed pockets filled,
   and 3 spawns per team. With `props: true` the `o` cells are cut out into props.png.
5. `validate.py` — format, border, spawns, flood-fill reachability (no sealed pockets), mirror symmetry, left/right
   walkable balance, path-to-centre balance and floor share. Exit code 1 on any failure.
6. `sheets.py` — the lookbook sheets and overlay.jpg.
7. `gridaudit.py [--fix]` — grid vs art: walls the symmetric merge put on ground the art paints as open ("mirror
   walls": blocking tiles with < 20 % blocking pixels in pixclass.npy), and open tiles that look blocked. `--fix`
   un-blocks the mirror walls that join the main area (never props.json cells), dropping the least clear ones until
   validate.py passes; run it after grid.py. Sheets in shots/grid/ (yellow X = mirror wall left, cyan = un-blocked).

8. `split.py` — interior `#` the art paints as sea becomes `~`, the void around Crescent Isle becomes `_` (fliers
   cross both). Run after grid.py (and gridaudit.py --fix).

validate.py's `corridors` check floods body positions (a circle of BODY_R = the sim's rules.BODY_MAX_PX) so no tile
the grid calls walkable is too narrow for the largest fighter.

Helpers: `tilegrid.py <id>` (tiles.jpg), `peek.py out.jpg [file] [width]` (one image per arena in a grid).

Generation cost for the current set: 14 generations (10 first passes + 4 retries), about 5.3k output image tokens
each; see generations.json.
