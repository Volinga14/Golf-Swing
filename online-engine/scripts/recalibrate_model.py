from __future__ import annotations

import json
from swinglab_engine.training.calibration import recalibrate_and_save, estimate_model_error


if __name__ == "__main__":
    result = recalibrate_and_save(min_group_samples=3, include_doubtful=True)
    benchmark = estimate_model_error(result["model"])
    print(json.dumps({"model": result["model"], "benchmark": benchmark}, ensure_ascii=False, indent=2))
