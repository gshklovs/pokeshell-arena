"""Rewrite rows of an arena.json grid in place by index, keeping the file's formatting:
    python tools/colliders/setgrid.py <id> <col>,<row>=<char> ...     or     python setgrid.py <id> --file grid.txt"""
import json
import sys
from pathlib import Path

p = Path(__file__).resolve().parents[2] / "public" / "arenas" / sys.argv[1] / "arena.json"
lines = p.read_text(encoding="utf-8").split("\n")
start = next(i for i, l in enumerate(lines) if l.strip().startswith('"grid"')) + 1
grid = [json.loads(lines[start + k].strip().rstrip(",")) for k in range(27)]
if sys.argv[2] == "--file":
    grid = Path(sys.argv[3]).read_text().splitlines()[:27]
else:
    for ed in sys.argv[2:]:
        at, ch = ed.split("=")
        x, y = map(int, at.split(","))
        grid[y] = grid[y][:x] + ch + grid[y][x + 1:]
for k in range(27):
    assert len(grid[k]) == 48
    old = lines[start + k]
    lines[start + k] = old[: len(old) - len(old.lstrip())] + json.dumps(grid[k]) + ("," if old.rstrip().endswith(",") else "")
p.write_text("\n".join(lines), encoding="utf-8")
