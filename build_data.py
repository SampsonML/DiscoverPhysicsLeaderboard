#!/usr/bin/env python3
"""
Build data/results.json from the model-results .txt summaries.

Inputs:
  model-results/averaged/summary_per_model.txt
  model-results/per_world/summary.txt
  data/worlds.json

Output:
  data/results.json

Normalization:
  - Provider prefixes are stripped: a model id like `together/openai/gpt-oss-120b`
    becomes `gpt-oss-120b` (last segment after the final '/').
  - The benchmark's `coulomb_easy` world is renamed to `coulomb` to match the
    public-facing world id in data/worlds.json.
  - Per-world rows for worlds not listed in data/worlds.json (the private,
    held-out worlds) are dropped: only public worlds appear in per_world.
    The pooled per-model stats still cover all 22 worlds.

Run from the repo root:  python build_data.py
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
AVG_FILE = REPO_ROOT / "model-results" / "averaged" / "summary_per_model.txt"
PER_WORLD_FILE = REPO_ROOT / "model-results" / "per_world" / "summary.txt"
WORLDS_FILE = REPO_ROOT / "data" / "worlds.json"
OUT_FILE = REPO_ROOT / "data" / "results.json"

WORLD_RENAMES = {"coulomb_easy": "coulomb"}

# A non-negative number with optional fractional and scientific parts.
NUM = r"[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?"

# Per-model summary row. Columns:
#   model n_trials passed/total expl_mean ± expl_se mse_mean +up/-down
#   k1/11 k2/11 k3/11 k4/11 k5/11 E1±s1% E2±s2% E3±s3% E4±s4% E5±s5%
# The minus sign in `+up/-down` is U+2212 in the source; allow ASCII '-' too.
AVG_RE = re.compile(
    rf"^(?P<model>\S+)\s+"
    rf"(?P<n_trials>\d+)\s+"
    rf"(?P<passed>\d+)/(?P<passed_total>\d+)\s+"
    rf"(?P<expl_mean>{NUM})\s*±\s*(?P<expl_se>{NUM})\s+"
    rf"(?P<mse_mean>{NUM})\s*\+(?P<mse_up>{NUM})/[−-](?P<mse_down>{NUM})\s+"
    rf"(?P<k1>\d+)/(?P<k1d>\d+)\s+(?P<k2>\d+)/(?P<k2d>\d+)\s+(?P<k3>\d+)/(?P<k3d>\d+)\s+"
    rf"(?P<k4>\d+)/(?P<k4d>\d+)\s+(?P<k5>\d+)/(?P<k5d>\d+)\s+"
    rf"(?P<E1m>{NUM})±(?P<E1s>{NUM})%\s+"
    rf"(?P<E2m>{NUM})±(?P<E2s>{NUM})%\s+"
    rf"(?P<E3m>{NUM})±(?P<E3s>{NUM})%\s+"
    rf"(?P<E4m>{NUM})±(?P<E4s>{NUM})%\s+"
    rf"(?P<E5m>{NUM})±(?P<E5s>{NUM})%\s*$"
)

# Per-world row. n=1 rows omit the SE on expl and the +up/-down on err.
# A geom_pos_err of "n/a" means no successful runs (typically when all
# trials for that (model, world) failed); it's preserved as null.
PER_WORLD_RE = re.compile(
    rf"^(?P<model>\S+)\s+"
    rf"(?P<world>\S+)\s+"
    rf"(?P<n>\d+)\s+"
    rf"(?P<expl_mean>{NUM})(?:\s*±\s*(?P<expl_se>{NUM}))?\s+"
    rf"(?:(?P<err_mean>{NUM})(?:\s*\+(?P<err_up>{NUM})/[−-](?P<err_down>{NUM}))?|n/a)\s*$"
)


def normalize_model(raw: str) -> str:
    return raw.rsplit("/", 1)[-1]


def normalize_world(raw: str) -> str:
    return WORLD_RENAMES.get(raw, raw)


def parse_avg(path: Path) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        m = AVG_RE.match(line)
        if not m:
            continue
        d = m.groupdict()
        model = normalize_model(d["model"])
        out[model] = {
            "n_trials": int(d["n_trials"]),
            "passed": int(d["passed"]),
            "passed_total": int(d["passed_total"]),
            "explanation_score": {
                "mean": float(d["expl_mean"]),
                "se": float(d["expl_se"]),
            },
            "normalized_mse": {
                "mean": float(d["mse_mean"]),
                "up": float(d["mse_up"]),
                "down": float(d["mse_down"]),
            },
            "pass_at_k": {
                str(k): {
                    "mean": float(d[f"E{k}m"]),
                    "se": float(d[f"E{k}s"]),
                    "raw": f"{d[f'k{k}']}/{d[f'k{k}d']}",
                }
                for k in (1, 2, 3, 4, 5)
            },
        }
    return out


def parse_per_world(path: Path) -> dict[str, dict[str, dict]]:
    out: dict[str, dict[str, dict]] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        m = PER_WORLD_RE.match(line)
        if not m:
            continue
        d = m.groupdict()
        model = normalize_model(d["model"])
        world = normalize_world(d["world"])
        out.setdefault(model, {})[world] = {
            "n": int(d["n"]),
            "explanation_score": {
                "mean": float(d["expl_mean"]),
                "se": float(d["expl_se"]) if d["expl_se"] else None,
            },
            "geom_pos_err": {
                "mean": float(d["err_mean"]) if d["err_mean"] else None,
                "up": float(d["err_up"]) if d["err_up"] else None,
                "down": float(d["err_down"]) if d["err_down"] else None,
            },
        }
    return out


def main() -> int:
    worlds_doc = json.loads(WORLDS_FILE.read_text(encoding="utf-8"))
    world_ids = [w["id"] for w in worlds_doc["worlds"]]

    avg = parse_avg(AVG_FILE)
    per_world = parse_per_world(PER_WORLD_FILE)

    if not avg:
        print(f"error: parsed 0 rows from {AVG_FILE}", file=sys.stderr)
        return 1
    if not per_world:
        print(f"error: parsed 0 rows from {PER_WORLD_FILE}", file=sys.stderr)
        return 1

    results = []
    for model, agg in avg.items():
        pw = per_world.get(model, {})
        private = sorted(w for w in pw if w not in world_ids)
        if private:
            print(f"note: {model}: ignoring private worlds {private}", file=sys.stderr)
            pw = {w: v for w, v in pw.items() if w in world_ids}
        missing = [w for w in world_ids if w not in pw]
        if missing:
            print(f"warning: {model} missing worlds {missing}", file=sys.stderr)
        results.append({"model": model, **agg, "per_world": pw})

    results.sort(key=lambda r: r["pass_at_k"]["5"]["mean"], reverse=True)

    doc = {
        "metadata": {
            "benchmark_version": "new_production_16",
            "last_updated": date.today().isoformat(),
            "num_worlds": len(world_ids),
            "num_seeds": 5,
            "default_rounds_budget": 16,
            "worlds": world_ids,
        },
        "results": results,
    }

    OUT_FILE.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT_FILE} ({len(results)} models)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
