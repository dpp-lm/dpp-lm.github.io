#!/usr/bin/env python3
"""Export the points of the paper's three frontier figures to data/results.json.

Reads analysis/{intrinsic,ambrosia,gsm8k}_points.json of the pool-dpp release (the files written by
analysis/plot_*.py) and keeps exactly the methods and points the plot scripts draw, in drawing order.
Standard library only.
"""
import json
import os
import subprocess
import sys

REPO = "/Users/prada/Documents/neurips_dpp/cr_from_euler/pool-dpp"
ANALYSIS = os.path.join(REPO, "analysis")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "results.json")

# JSON key -> display name, in the legend/drawing order of plot_*.py.
BASELINE = "baseline"   # label = str(float(sT)), as in plot_curve(label_fn=str)
POOLDPP = "pooldpp"     # label = format(T, spec)


def g(spec, v):
    return format(float(v), spec)


# Method metadata shared by the three figures (LINESTYLES and COLORS of plot_*.py).
METHODS = {
    "Ancestral": dict(id="ancestral", name="Ancestral", color="--m-ancestral", dash=[]),
    "k-Means": dict(id="kmeans", name="k-means", color="--m-kmeans", dash=[12, 4]),
    "Naive-DPP": dict(id="naive", name="Naive DPP", color="--m-naive", dash=[12, 4, 2, 4, 2, 4]),
    "PoolDPP-Samp": dict(id="samp", name="PoolDPP-Samp", color="--m-samp", dash=[6, 2, 2, 2]),
    "PoolDPP-MAP": dict(id="map", name="PoolDPP-MAP", color="--m-map", dash=[2, 2]),
}

TASKS = [
    dict(
        id="intrinsic", file="intrinsic_points.json", tab="Open-ended generation", dataset="FineWeb",
        title="Open-ended generation (FineWeb)",
        x=dict(label="Diversity (log-determinant of Gram matrix)", dir="more diverse", meaning="log-determinant of the normalized embedding Gram matrix of the selected set"),
        y=dict(label="Quality (mean log-probability)", dir="higher quality", meaning="mean language-model log-probability of the selected strings"),
        K=10, pool_size=400, y_margin=0.07,
        order=["Ancestral", "k-Means", "PoolDPP-Samp", "PoolDPP-MAP"],
        held={"PoolDPP-Samp": 1.0, "PoolDPP-MAP": 1.0},
        label_spec=lambda t: g(".2g", t) if float(t) < 10 else g("g", t),
        caption=("Quality against diversity for 50 open-ended FineWeb prompts. Each point is a set of K=10 completions "
                 "per prompt (Gemma-2-9B-Instruct, MiniLM-L6 embeddings, pool size N=400), averaged over prompts and over "
                 "10 sampled sets. Bars are 95% "
                 "t-intervals over 10 pools."),
        result='PoolDPP-MAP reaches a higher diversity than k-means with almost no loss of quality, while k-means keeps the highest quality at lower diversity. PoolDPP-Samp does not dominate k-means on these two measures: it samples from the pool distribution, while PoolDPP-MAP maximizes the determinant over the pool.',
    ),
    dict(
        id="ambrosia", file="ambrosia_points.json", tab="Ambiguous text-to-SQL", dataset="Ambrosia",
        title="Ambiguous text-to-SQL (Ambrosia)",
        x=dict(label="Recall: golden query coverage", dir="higher recall", meaning="fraction of annotated golden interpretations matched by the selected queries"),
        y=dict(label="Precision: golden accuracy", dir="higher precision", meaning="fraction of selected queries whose whole execution result equals a golden result"),
        K=3, pool_size=200, y_margin=0.05,
        order=["Ancestral", "k-Means", "PoolDPP-Samp", "PoolDPP-MAP"],
        held={"PoolDPP-Samp": 1.0, "PoolDPP-MAP": 1.5},
        label_spec=lambda t: g(".2g", t),
        caption=("Precision against recall on Ambrosia, where each question has up to 3 valid SQL interpretations. Each "
                 "point is a set of K=3 queries per question (Gemma-2-9B-Instruct, MiniLM-L6 embeddings, pool size N=200). "
                 "Precision counts a query only if its whole execution result matches a golden result. Curves sweep the "
                 "local sampling temperature T' (ancestral sampling, k-means) or the global temperature T (PoolDPP-Samp at "
                 "T' = 1, PoolDPP-MAP at T' = 1.5). Bars are 95% t-intervals over 100 pools."),
        result="PoolDPP-MAP holds the high-recall end of the frontier, above k-means, and PoolDPP-Samp lies above k-means across its sweep. Ancestral sampling at T' of 0.7 or less holds the high-precision, low-recall end.",
    ),
    dict(
        id="gsm8k", file="gsm8k_points.json", tab="Math reasoning", dataset="GSM8K",
        title="Math reasoning (GSM8K)",
        x=dict(label="Diversity (log-determinant of Gram matrix)", dir="more diverse", meaning="log-determinant of the embedding Gram matrix of the selected chains"),
        y=dict(label="Accuracy (pass@K=10)", dir="higher accuracy", meaning="fraction of problems where at least one of the K=10 selected chains is correct"),
        K=10, pool_size=None, y_margin=0.05,
        order=["Ancestral", "Naive-DPP", "k-Means", "PoolDPP-Samp", "PoolDPP-MAP"],
        held={"PoolDPP-Samp": 1.2, "PoolDPP-MAP": 1.2},
        label_spec=lambda t: g(".3g", t),
        caption=("Accuracy against diversity on GSM8K, for 50 questions. Each point is a set of K=10 reasoning chains per "
                 "question (Gemma-2-9B-Instruct, Qwen3-Embedding-0.6B embeddings). Point labels are the local sampling "
                 "temperature T' for ancestral sampling, naive DPP, and k-means, and the global temperature T for "
                 "PoolDPP-Samp and PoolDPP-MAP, which both draw the pool at T' = 1.2. Bars are 95% t-intervals over 100 pools."),
        result='PoolDPP raises diversity past the plotted ancestral settings and gives up at most 0.01 pass@K: 0.915 for both modes against 0.925 for the best ancestral setting. At equal diversity, neither mode has a higher pass@K than ancestral sampling, so the gain is in diversity, not in coverage.',
    ),
]


def main():
    commit = subprocess.check_output(["git", "-C", REPO, "rev-parse", "--short", "HEAD"], text=True).strip()
    tasks, omitted = [], []
    for t in TASKS:
        with open(os.path.join(ANALYSIS, t["file"])) as f:
            src = json.load(f)
        meta = src["_meta"]
        drawn = t["order"]
        for k in src:
            if k != "_meta" and k not in drawn:
                omitted.append((t["id"], k))
        methods, ns = [], set()
        for key in drawn:
            m = dict(METHODS[key])
            pooldpp = key.startswith("PoolDPP")
            m["knob"] = "T" if pooldpp else "T'"
            if pooldpp:
                m["held_local_T"] = t["held"][key]
            pts = []
            for k, v in src[key].items():  # insertion order = sweep order = polyline order
                label = t["label_spec"](k) if pooldpp else str(float(k))
                n = int(v["n"])
                ns.add(n)
                pts.append(dict(knob=float(k), label=label, x=v["x_mean"], y=v["y_mean"],
                                x_ci=v["x_ci"], y_ci=v["y_ci"], n=n))
            m["points"] = pts
            methods.append(m)
        assert len(ns) == 1, (t["id"], ns)
        pools = ns.pop()
        if "n_pools" in meta:
            assert meta["n_pools"] == pools
        assert ("%d pools" % pools) in t["caption"], t["id"]
        tasks.append(dict(id=t["id"], tab=t["tab"], dataset=t["dataset"], title=t["title"],
                          x=t["x"], y=t["y"], K=t["K"], pools=pools, pool_size=t["pool_size"],
                          y_margin=t["y_margin"], caption=t["caption"], result=t["result"],
                          ci="95% t-interval over pools", methods=methods))
    out = dict(tasks=tasks, provenance=dict(
        repo="https://github.com/rycolab/pool-dpp", commit=commit,
        files=["analysis/%s" % t["file"] for t in TASKS],
        plot_scripts=["analysis/plot_%s.py" % t["id"] for t in TASKS]))
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    print("wrote", os.path.normpath(OUT), "commit", commit)
    for o in omitted:
        print("omitted (not drawn by plot script):", o)


if __name__ == "__main__":
    sys.exit(main())
