from __future__ import annotations

import json
from pathlib import Path
from statistics import mean
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
TRAINING_DIR = ROOT / "data" / "training"
MODEL_DIR = ROOT / "data" / "models"
PHASES = ["address", "takeaway", "top", "impact", "finish"]


def main() -> None:
    records = [json.loads(p.read_text(encoding="utf-8")) for p in TRAINING_DIR.glob("*.training.json")]
    grouped: dict[str, list[dict]] = {}
    for rec in records:
        key = f"{rec.get('view','unknown')}:{rec.get('club','unknown')}"
        grouped.setdefault(key, []).append(rec)

    model = {
        "version": "calibrated-temporal-" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S"),
        "type": "calibrated-temporal-json",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "records": len(records),
        "groups": {},
        "note": "This model stores average phase correction offsets learned from user-corrected swings. The backend can consume it in future detector versions; the PWA can also download it as a lightweight model.",
    }
    for key, items in grouped.items():
        offsets = {}
        for phase in PHASES:
            vals = [float(rec.get("phase_errors", {}).get(phase)) for rec in items if phase in rec.get("phase_errors", {})]
            if vals:
                offsets[phase] = mean(vals)
        model["groups"][key] = {"count": len(items), "mean_phase_offsets_s": offsets}
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    out = MODEL_DIR / "latest-model.json"
    out.write_text(json.dumps(model, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Wrote", out)
    print(json.dumps(model, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
