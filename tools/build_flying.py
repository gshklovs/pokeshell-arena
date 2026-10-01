"""Build data/flying.json: which species fly (docs/SPEC.md section 3 "Movement traits").

    python tools/build_flying.py [--pokeshell ..\\pokeshell]

Flying is a species fact, not a card fact (the TCG has no Flying type). A species flies when, in the main-series
games (PokeAPI, https://pokeapi.co):
  - one of its types is Flying (GET /api/v2/type/flying: every Pokemon, forms included, with that type), or
  - it can have the ability Levitate (GET /api/v2/ability/levitate), or
  - it is on the curated list below: clear floaters that have neither (Gengar lost Levitate in Gen 7, Eternatus,
    the magnet Pokemon, the floating legendaries and mythicals, ...).
A species PokeAPI only has as forms takes its default form ("tornadus" -> "tornadus-incarnate"); a card-only form
name ("vivillon-poke-ball") takes its base species' answer.

The species checked are every `character` of pokeshell's cards (packs/pokemon/pack.json for the cards in
carddata.json), data/kits and data/bots/roster.json. The output lists the fliers with the reason and every species
checked, so a test can prove coverage. Run with network access; the game never fetches anything.
"""
import datetime
import glob
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://pokeapi.co/api/v2"
CURATED = {
    "gengar": "floats (lost Levitate in Gen 7)",
    "eternatus": "floats",
    "magnemite": "floats (magnetism)", "magneton": "floats (magnetism)", "magnezone": "floats (magnetism)",
    "beldum": "floats", "metang": "floats",
    "mew": "floats", "celebi": "floats", "jirachi": "floats", "uxie": "floats", "mesprit": "floats",
    "azelf": "floats", "deoxys": "floats", "nihilego": "floats", "cosmoem": "floats", "lunala": "flies",
    "dreepy": "floats", "drakloak": "floats", "dragapult": "floats", "hoopa": "floats",
    "solosis": "floats", "duosion": "floats", "reuniclus": "floats",
    "frillish": "floats", "jellicent": "floats",
    "dusclops": "floats", "dusknoir": "floats",
    "necrozma-dawn-wings": "flies (Lunala fusion)",
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pokeshell-arena build_flying.py"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def species_checked(pokeshell):
    names = set()
    pack = pokeshell / "packs" / "pokemon" / "pack.json"
    cdata = pokeshell / "packs" / "pokemon" / "carddata.json"
    if pack.exists() and cdata.exists():
        cards = json.loads(pack.read_text(encoding="utf-8"))["cards"]
        for cid in json.loads(cdata.read_text(encoding="utf-8"))["cards"]:
            if cid in cards and cards[cid].get("character"):
                names.add(cards[cid]["character"])
    else:
        print(f"note: no pokeshell checkout at {pokeshell}: only this repo's species", file=sys.stderr)
    for p in glob.glob(str(ROOT / "data" / "kits" / "*.json")):
        c = json.loads(Path(p).read_text(encoding="utf-8")).get("character")
        if c:
            names.add(c)
    roster = ROOT / "data" / "bots" / "roster.json"
    if roster.exists():
        names |= {c["character"] for c in json.loads(roster.read_text(encoding="utf-8"))["cards"] if c.get("character")}
    return sorted(names)


def main(argv):
    pokeshell = Path(argv[argv.index("--pokeshell") + 1]) if "--pokeshell" in argv else ROOT.parent / "pokeshell"
    names = species_checked(pokeshell.resolve())
    flying_type = {p["pokemon"]["name"] for p in get(f"{API}/type/flying")["pokemon"]}
    levitate = {p["pokemon"]["name"] for p in get(f"{API}/ability/levitate")["pokemon"]}
    order = [p["name"] for p in get(f"{API}/pokemon?limit=5000")["results"]]
    known = set(order)
    species = {p["name"] for p in get(f"{API}/pokemon-species?limit=5000")["results"]}

    def reason(n):
        if n in CURATED:
            return f"curated: {CURATED[n]}"
        if n in flying_type:
            return "Flying type"
        if n in levitate:
            return "Levitate"
        return None

    out, unknown = {}, []
    for n in names:
        r = reason(n)
        if r is None and n not in known:
            # a species whose Pokemon entries are all forms ("tornadus" -> "tornadus-incarnate", the default, first
            # in PokeAPI's order), or a card-only form name ("vivillon-poke-ball" -> the longest known prefix)
            parts = n.split("-")
            base = next((k for k in order if k.startswith(n + "-")), None) if n in species else None
            pre = next(("-".join(parts[:k]) for k in range(len(parts) - 1, 0, -1) if "-".join(parts[:k]) in known | species), None)
            if pre and pre not in known:
                pre = next((k for k in order if k.startswith(pre + "-")), None)
            base = base or pre
            if base is None:
                unknown.append(n)
            else:
                r = reason(base)
                if r:
                    r = f"{r} (as {base})"
        if r:
            out[n] = r
    doc = {
        "version": 1,
        "source": "PokeAPI (pokeapi.co) type/flying and ability/levitate, plus the curated floaters in "
                  "tools/build_flying.py; built by tools/build_flying.py",
        "built": datetime.date.today().isoformat(),
        "flying": dict(sorted(out.items())),
        "species": names,
        "unknown": unknown,
    }
    (ROOT / "data" / "flying.json").write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
    print(f"{len(names)} species checked, {len(out)} fly, {len(unknown)} unknown to PokeAPI: {unknown}")


if __name__ == "__main__":
    main(sys.argv[1:])
