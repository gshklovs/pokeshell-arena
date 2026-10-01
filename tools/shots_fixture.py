"""A richer stand-in collection for `npm run shots` (never the live pokeshell state).

  python tools/shots_fixture.py --pokeshell ..\\pokeshell --out <temp dir>

Writes, all under --out:
  collection.json   the shape of `pokeshell collection --json` for a set of real cards (with evolution lines), read
                    from the pokeshell checkout's packs/pokemon/carddata.json + pack.json (read-only)
  home/web/img/...  their card faces, rendered by pokeshell's own `binder.exe --export-web` from a pulls.log written
                    into a temp state (so the host serves them at /pokeshell/img/, as with a real web export)
The fake pokeshell (tests/fixtures/fake-pokeshell) serves collection.json when FAKE_POKESHELL_COLLECTION points at it.
binder.exe: $POKESHELL_BINDER, else the checkout's binder/target/release, else an installed pokeshell module's bin.
Standard library only. Without binder.exe the faces are skipped and the game shows sprites.
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def binder_exe(ps: Path):
    """pokeshell's binder.exe (read only: it renders into the temp dirs given to it)"""
    exe = "binder.exe" if os.name == "nt" else "binder"
    cands = [os.environ.get("POKESHELL_BINDER"), ps / "binder" / "target" / "release" / exe, ps / "bin" / exe]
    for d in filter(None, os.environ.get("PSModulePath", "").split(os.pathsep)):
        mod = Path(d) / "pokeshell"
        if mod.is_dir():
            cands += [v / "bin" / exe for v in sorted(mod.iterdir(), reverse=True)]
    return next((Path(c) for c in cands if c and Path(c).is_file()), None)

CARDS = [
    "base1-46", "base1-24", "base1-4",      # Charmander -> Charmeleon -> Charizard
    "base1-63", "base1-42",                 # Squirtle -> Wartortle
    "base1-58", "base1-14",                 # Pikachu -> Raichu
    "base1-44", "base1-30",                 # Bulbasaur -> Ivysaur
    "swsh7-7", "swsh7-8",                   # Leafeon V -> Leafeon VMAX
    "base1-10", "base1-65", "base1-60", "base1-26", "base1-43", "base1-68",
]
SHINY = {"base1-63"}


def pull_time(i):
    """card i's pull time: a fixed shuffle of the list (7 is coprime with its length), so "last pulled" differs from the list order"""
    return f"2026-09-29T10:{(i * 7) % len(CARDS):02d}:00"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pokeshell", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    ps = Path(a.pokeshell)
    out = Path(a.out)
    home = out / "home"
    state = out / "binder-state"
    for d in (home, state):
        d.mkdir(parents=True, exist_ok=True)
    data = json.loads((ps / "packs/pokemon/carddata.json").read_text(encoding="utf-8"))["cards"]
    pack = json.loads((ps / "packs/pokemon/pack.json").read_text(encoding="utf-8"))["cards"]

    # a pulls.log for the binder's export: time, pack, character, tier, art (card id), skin, shiny, flags
    lines = []
    for i, cid in enumerate(CARDS):
        p = pack[cid]
        lines.append(f"2026-09-29T10:{i:02d}:00\tpokemon\t{p['character']}\t{p['tier']}\t{cid}\t\t{1 if cid in SHINY else 0}\t")
    (state / "pulls.log").write_text("\n".join(lines) + "\n", encoding="utf-8")
    faces = False
    binder = binder_exe(ps)
    try:
        if not binder:
            raise FileNotFoundError("no pokeshell binder.exe (cargo build --release in pokeshell\\binder, or set POKESHELL_BINDER)")
        # --only: just these cards' faces (and their shiny ones), not the whole pack
        subprocess.run([str(binder), "--export-web", str(home / "web"), "--root", str(ps), "--state", str(state), "--only", ",".join(CARDS)],
                       check=True, capture_output=True, timeout=300, env={**os.environ, "POKESHELL_HOME": str(state)})
        faces = True
    except Exception as e:  # noqa: BLE001 - faces are optional
        print(f"shots fixture: no card faces ({e})", file=sys.stderr)

    cards = []
    for i, cid in enumerate(CARDS):
        p, d = pack[cid], data[cid]
        img = f"pokemon/{p['character']}/{cid}.png"
        img_s = f"pokemon/{p['character']}/{cid}-shiny.png"
        has = faces and (home / "web/img" / img).exists()
        has_s = faces and (home / "web/img" / img_s).exists()
        cards.append({
            "card": cid, "pack": "pokemon", "character": p["character"], "name": p["name"], "set": cid.split("-")[0],
            "number": p.get("number"), "rarity": p.get("rarity"), "tier": p["tier"], "caught": True, "count": 1,
            "firstCaught": pull_time(i), "lastCaught": pull_time(i),
            "shiny": cid in SHINY, "art": {"img": img if has else None, "imgShiny": img_s if has_s else None},
            "data": {k: d.get(k) for k in ("supertype", "hp", "types", "subtypes", "evolvesFrom", "abilities", "attacks", "weaknesses", "resistances", "retreatCost", "rules")},
        })
    body = {"api": 1, "version": "shots-fixture", "state": str(home), "pack": None,
            "counts": {"caught": len(cards), "seen": 0, "pulls": len(cards), "shiny": len(SHINY)}, "cards": cards}
    (out / "collection.json").write_text(json.dumps(body, ensure_ascii=True), encoding="utf-8")
    print(f"shots fixture: {len(cards)} cards, faces {'yes' if faces else 'no'} -> {out}")


if __name__ == "__main__":
    main()
