from __future__ import annotations

import argparse
import json
from pathlib import Path

from .core.analyzer import SwingAnalyzer
from .db.sqlite import save_session


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze a golf swing video with Swing Lab backend engine")
    parser.add_argument("video", help="Path to video file")
    parser.add_argument("--view", default="unknown", choices=["dtl", "face_on", "unknown"])
    parser.add_argument("--club", default="unknown", choices=["driver", "iron", "wedge", "putter", "unknown"])
    parser.add_argument("--user-id", default=None)
    parser.add_argument("--no-save-video", action="store_true")
    parser.add_argument("--json", dest="json_path", default=None, help="Optional output JSON path")
    args = parser.parse_args()

    analyzer = SwingAnalyzer()
    result = analyzer.analyze_video(
        Path(args.video),
        view=args.view,
        club=args.club,
        user_id=args.user_id,
        save_video=not args.no_save_video,
    )
    save_session(result)
    payload = result.model_dump(mode="json")
    if args.json_path:
        Path(args.json_path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "session_id": result.session_id,
        "engine_version": result.engine_version,
        "score": result.metrics.global_score,
        "phases": {k: v.time for k, v in result.phases.items()},
        "report_path": result.report_path,
        "warnings": result.warnings,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
