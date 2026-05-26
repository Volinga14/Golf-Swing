from __future__ import annotations

import json
from pathlib import Path
import statistics

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "training"


def main() -> None:
    files = sorted(DATA_DIR.glob("*.training.json"))
    by_phase: dict[str, list[float]] = {}
    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        for phase, err in data.get("phase_errors", {}).items():
            by_phase.setdefault(phase, []).append(abs(float(err)))
    print("Training records:", len(files))
    for phase, errors in by_phase.items():
        print(f"{phase:10s} count={len(errors):3d} mean_abs={statistics.mean(errors):.3f}s median_abs={statistics.median(errors):.3f}s max_abs={max(errors):.3f}s")


if __name__ == "__main__":
    main()
