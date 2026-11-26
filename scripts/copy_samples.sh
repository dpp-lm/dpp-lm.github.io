#!/bin/sh
# Copies the T' = 1.0 pools and the Qwen3-Embedding-0.6B Gram matrices of five prompts from the demo repo.
set -e
here="$(cd "$(dirname "$0")/.." && pwd)"
src="${1:-$here/../dpp-lm-demo/data/cache}"
dst="$here/data/samples"
mkdir -p "$dst"
for s in gift city firstdate dinner story; do
  cp "$src/${s}_T1.0.json" "$dst/${s}.json"
  cp "$src/${s}_T1.0.qwen3-emb.G.bin" "$dst/${s}.G.bin"
done
python3 - "$dst" <<'PY'
import json, sys
d = sys.argv[1]
out = []
for s in ["gift", "city", "firstdate", "dinner", "story"]:
    p = json.load(open(f"{d}/{s}.json"))
    out.append({"id": s, "prompt": p["prompt"], "pool": f"{s}.json", "gram": f"{s}.G.bin",
                "model": p["modelName"], "N": p["N"], "Tprime": p["Tprime"],
                "embedder": "Qwen/Qwen3-Embedding-0.6B"})
json.dump(out, open(f"{d}/index.json", "w"), indent=1)
PY
