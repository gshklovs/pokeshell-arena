"""Step 3: the chosen generation becomes the arena background.

arenas.json "pick" names the gen-<k>.png; it is copied to style-lab/arenas/<id>/bg.png and bg-full.png (the
untouched original; grid.py may cut props out of bg.png) and to public/arenas/<id>/bg.png (gitignored; shipped
later by this repo's own art release). The exact prompt, model and size of every picked generation are written
to tools/arenas/prompts.json (tracked), and the whole generation log is summed into tools/arenas/generations.json.

    python tools/arenas/pick.py [arena id ...]
"""
import json
import shutil
import sys

from common import HERE, PUBLIC, arenas, work

table = arenas()
prompts_path = HERE / "prompts.json"
prompts = json.loads(prompts_path.read_text(encoding="utf-8-sig")) if prompts_path.exists() else {}
gens = {}
for aid in sys.argv[1:] or table:
    d = work(aid)
    k = table[aid]["pick"]
    shutil.copyfile(d / f"gen-{k}.png", d / "bg.png")
    shutil.copyfile(d / f"gen-{k}.png", d / "bg-full.png")
    (PUBLIC / aid).mkdir(parents=True, exist_ok=True)
    shutil.copyfile(d / "bg.png", PUBLIC / aid / "bg.png")
    log = [json.loads(line) for line in (d / "gen.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    rec = next(r for r in log if r["k"] == k)
    prompts[aid] = {"card": table[aid]["card"], "gen": k, "model": rec["model"], "size": rec["size"],
                    "quality": rec["quality"], "reference": "style-lab/arenas/<id>/scene.png (scene.py)",
                    "prompt": rec["prompt"]}
    gens[aid] = {"generations": len(log), "picked": k,
                 "output_tokens": sum((r.get("usage") or {}).get("output_tokens", 0) for r in log),
                 "input_tokens": sum((r.get("usage") or {}).get("input_tokens", 0) for r in log)}
    print(f"{aid}: gen-{k} of {len(log)} -> bg.png")
prompts_path.write_text(json.dumps(prompts, indent=1) + "\n", encoding="utf-8")
if not sys.argv[1:]:
    tot = {"arenas": gens, "total_generations": sum(g["generations"] for g in gens.values()),
           "total_output_tokens": sum(g["output_tokens"] for g in gens.values()),
           "total_input_tokens": sum(g["input_tokens"] for g in gens.values())}
    (HERE / "generations.json").write_text(json.dumps(tot, indent=1) + "\n", encoding="utf-8")
    print(f"{tot['total_generations']} generations, {tot['total_output_tokens']} output tokens")
