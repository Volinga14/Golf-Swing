"""Build a simple calibrated latest-model.json from corrected training records.

This does not train a neural network. It creates a calibrated temporal model
from corrected labels, grouped by view/club where available. It is useful as the
first auto-update layer before a learned model.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from statistics import median

PHASES = ["address", "takeaway", "top", "impact", "finish"]


def get_duration(data):
    return data.get("video", {}).get("duration") or data.get("metrics", {}).get("duration") or data.get("duration")


def get_final_times(data):
    return data.get("finalPhaseTimes") or data.get("correctedPhases") or {}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--training-dir", default="online-engine/storage/training")
    parser.add_argument("--out", default="models/latest-model.json")
    args = parser.parse_args()
    groups = defaultdict(lambda: defaultdict(list))
    for path in Path(args.training_dir).glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        duration = get_duration(data)
        times = get_final_times(data)
        if not duration or not times:
            continue
        view = (data.get("video", {}).get("view") or data.get("view") or "unknown").lower()
        club = (data.get("video", {}).get("club") or data.get("club") or "unknown").lower()
        for phase in PHASES:
            if isinstance(times.get(phase), (int, float)):
                groups[(view, club)][phase].append(float(times[phase]) / float(duration))
    model = {"modelVersion": "phase-model-calibrated-local", "reference": {}, "groups": {}}
    for (view, club), phase_data in groups.items():
        model["reference"].setdefault(view, {})[club] = {f"{p}Pct": median(vals) for p, vals in phase_data.items() if vals}
        model["groups"][f"{view}/{club}"] = {p: len(vals) for p, vals in phase_data.items()}
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(model, indent=2), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
