"""Build data/bots/roster.json: the real cards bots build their teams from (docs/SPEC.md section 11).

  python tools/build_bot_roster.py --pokeshell ..\\pokeshell

Reads (read-only) pokeshell's packs/pokemon/carddata.json (the gameplay fields of every card it serves) and
pack.json (each card's character, for the battle sprite). Writes only the numbers the arena uses: HP, types,
subtypes, evolvesFrom, attack names, costs and printed damage, weakness, resistance, retreat. No rules text.

Bots draw from it by difficulty (src/game/botteams.ts), so their teams don't depend on your collection. A card is
kept when at least one attack does printed damage. Evolution lines are kept whole so bots can evolve too.
"""
import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "data" / "bots" / "roster.json"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pokeshell", default=str(HERE.parent.parent / "pokeshell"), help="a pokeshell checkout")
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()
    root = Path(a.pokeshell) / "packs" / "pokemon"
    data = json.loads((root / "carddata.json").read_text(encoding="utf-8"))["cards"]
    pack = json.loads((root / "pack.json").read_text(encoding="utf-8"))
    chars = {cid: c.get("character") for cid, c in pack["cards"].items()}
    names = {cid: c.get("name") for cid, c in pack["cards"].items()}
    out = []
    for cid in sorted(data, key=lambda s: (s.split("-")[0], int("".join(ch for ch in s.split("-")[-1] if ch.isdigit()) or 0), s)):
        c = data[cid]
        if not chars.get(cid):
            continue
        attacks = [{"name": x["name"], "cost": x.get("cost") or [], "damage": x.get("damage") or ""} for x in c.get("attacks") or []]
        if not any(any(ch.isdigit() for ch in x["damage"]) for x in attacks):
            continue
        try:
            hp = int(str(c.get("hp")))
        except ValueError:
            continue
        out.append({
            "id": cid, "name": names.get(cid) or cid, "character": chars[cid], "hp": hp,
            "types": c.get("types") or [], "subtypes": c.get("subtypes") or [], "evolvesFrom": c.get("evolvesFrom"),
            "attacks": attacks, "weaknesses": c.get("weaknesses") or [], "resistances": c.get("resistances") or [],
            "retreatCost": c.get("retreatCost") or [],
        })
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps({"version": 1, "source": "pokeshell packs/pokemon/carddata.json", "cards": out}, ensure_ascii=True, separators=(",", ":"))
    Path(a.out).write_text(body + "\n", encoding="utf-8")
    print(f"{a.out}: {len(out)} cards, {len(body) // 1024} KB")


if __name__ == "__main__":
    main()
