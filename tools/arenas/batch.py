"""run gen.py for several arenas in parallel: batch.py <id> [<id> ...] [-- extra gen.py args]"""
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

args = sys.argv[1:]
extra = args[args.index("--") + 1:] if "--" in args else []
ids = args[:args.index("--")] if "--" in args else args
gen = str(Path(__file__).with_name("gen.py"))


def run(aid):
    r = subprocess.run([sys.executable, gen, aid, *extra], capture_output=True, text=True, cwd=Path(gen).parent)
    return aid, r.returncode, (r.stdout + r.stderr).strip().splitlines()[-1:] or [""]


with ThreadPoolExecutor(len(ids)) as ex:
    for aid, rc, out in ex.map(run, ids):
        print(aid, rc, out[0][:300])
