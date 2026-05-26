from __future__ import annotations

from pathlib import Path
from html import escape

from ..config import settings
from ..core.phases import PHASE_LABELS, PHASES
from ..core.schemas import AnalysisResult


def fmt(v: float | None, suffix: str = "s") -> str:
    if v is None:
        return "—"
    if suffix == ":1":
        return f"{v:.2f}:1"
    return f"{v:.2f}{suffix}"


def build_html_report(result: AnalysisResult) -> Path:
    report_dir = settings.data_dir / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    path = report_dir / f"{result.session_id}.html"
    capture_cards = []
    for phase in PHASES:
        src = result.captures.get(phase)
        if not src:
            continue
        # Report is served from /reports/{session}.html. A relative ../captures path works
        # both through the API and when opening the local HTML file from data/reports.
        rel = f"../captures/{result.session_id}/{phase}.jpg"
        mark = result.phases.get(phase)
        capture_cards.append(f"""
        <div class='capture-card'>
          <img src='{escape(rel)}' alt='{escape(PHASE_LABELS[phase])}' />
          <div class='cap-title'>{escape(PHASE_LABELS[phase])}</div>
          <div class='cap-meta'>{fmt(mark.time if mark else None)} · confidence {(mark.confidence*100 if mark else 0):.0f}%</div>
        </div>""")

    findings = "".join(f"<li>{escape(x)}</li>" for x in result.findings)
    recs = "".join(f"<li>{escape(x)}</li>" for x in result.recommendations)
    drills = "".join(f"<li>{escape(x)}</li>" for x in result.drills)
    warnings = "".join(f"<li>{escape(x)}</li>" for x in result.warnings)
    rows = "".join(
        f"<tr><td>{escape(PHASE_LABELS[p])}</td><td>{fmt(result.phases[p].time if p in result.phases else None)}</td><td>{(result.phases[p].confidence*100 if p in result.phases else 0):.0f}%</td><td>{escape(result.phases[p].source if p in result.phases else '—')}</td></tr>"
        for p in PHASES
    )
    html = f"""<!doctype html>
<html lang='es'>
<head>
  <meta charset='utf-8' />
  <meta name='viewport' content='width=device-width,initial-scale=1' />
  <title>Swing Lab Report {escape(result.session_id)}</title>
  <style>
    body {{ font-family: Inter, Arial, sans-serif; margin: 0; color: #111; background: #f4f4f2; }}
    .page {{ max-width: 980px; margin: 0 auto; padding: 36px 22px; }}
    .hero {{ background: #111; color: white; border-radius: 28px; padding: 32px; }}
    .hero h1 {{ margin: 0; font-size: 38px; letter-spacing: -0.04em; }}
    .score {{ font-size: 54px; font-weight: 900; margin-top: 18px; }}
    .grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 18px 0; }}
    .card {{ background: white; border-radius: 20px; padding: 18px; box-shadow: 0 10px 30px rgba(0,0,0,.06); }}
    .card h3 {{ margin: 0 0 8px; font-size: 14px; color: #666; }}
    .metric {{ font-size: 25px; font-weight: 850; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th,td {{ text-align: left; padding: 10px; border-bottom: 1px solid #ddd; }}
    .captures {{ display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }}
    .capture-card {{ background: white; border-radius: 18px; padding: 10px; }}
    .capture-card img {{ width: 100%; aspect-ratio: 9/16; object-fit: cover; border-radius: 12px; background:#ddd; }}
    .cap-title {{ font-weight: 800; margin-top: 8px; }}
    .cap-meta {{ color: #666; font-size: 12px; }}
    li {{ margin: 7px 0; }}
    @media print {{ body {{ background: white; }} .page {{ padding: 0; }} .hero,.card,.capture-card {{ box-shadow:none; }} }}
    @media (max-width: 760px) {{ .grid {{ grid-template-columns: repeat(2, 1fr); }} .captures {{ grid-template-columns: repeat(2, 1fr); }} }}
  </style>
</head>
<body>
  <div class='page'>
    <section class='hero'>
      <h1>Swing Lab Analysis</h1>
      <p>Session {escape(result.session_id)} · Engine {escape(result.engine_version)} · View {escape(result.view)} · Club {escape(result.club)}</p>
      <div class='score'>{result.metrics.global_score or '—'}<span style='font-size:20px'>/100</span></div>
    </section>
    <section class='grid'>
      <div class='card'><h3>Backswing</h3><div class='metric'>{fmt(result.metrics.backswing)}</div></div>
      <div class='card'><h3>Downswing</h3><div class='metric'>{fmt(result.metrics.downswing)}</div></div>
      <div class='card'><h3>Tempo</h3><div class='metric'>{fmt(result.metrics.tempo, ':1')}</div></div>
      <div class='card'><h3>Pose quality</h3><div class='metric'>{(result.metrics.pose_quality or 0)*100:.0f}%</div></div>
    </section>
    <section class='card'><h2>Executive findings</h2><ul>{findings}</ul></section>
    <section class='card'><h2>Phase sequence</h2><table><thead><tr><th>Phase</th><th>Time</th><th>Confidence</th><th>Source</th></tr></thead><tbody>{rows}</tbody></table></section>
    <section><h2>Key captures</h2><div class='captures'>{''.join(capture_cards)}</div></section>
    <section class='card'><h2>Recommendations</h2><ul>{recs}</ul></section>
    <section class='card'><h2>Suggested drills</h2><ul>{drills}</ul></section>
    <section class='card'><h2>Warnings / Review items</h2><ul>{warnings}</ul></section>
  </div>
</body>
</html>"""
    path.write_text(html, encoding="utf-8")
    return path
