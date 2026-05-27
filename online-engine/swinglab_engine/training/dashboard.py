from __future__ import annotations

import html
from typing import Any

from .calibration import load_latest_model, summarize_examples, load_training_examples, estimate_model_error
from ..db.sqlite import training_stats


def _fmt(value: Any, digits: int = 3) -> str:
    if value is None:
        return "—"
    try:
        return f"{float(value):.{digits}f}"
    except Exception:
        return html.escape(str(value))


def _phase_rows(stats: dict[str, Any]) -> str:
    rows = []
    phase_stats = stats.get("phase_stats") or {}
    for phase in ["address", "takeaway", "top", "impact", "finish"]:
        s = phase_stats.get(phase) or {}
        rows.append(
            "<tr>"
            f"<td><b>{phase.title()}</b></td>"
            f"<td>{s.get('count', 0)}</td>"
            f"<td>{_fmt(s.get('mean_signed_error_s'))}</td>"
            f"<td>{_fmt(s.get('mean_abs_error_s'))}</td>"
            f"<td>{_fmt(s.get('max_abs_error_s'))}</td>"
            f"<td>{html.escape(str(s.get('tendency', '—')))}</td>"
            "</tr>"
        )
    return "\n".join(rows)


def _benchmark_rows(bench: dict[str, Any]) -> str:
    rows = []
    for phase in ["address", "takeaway", "top", "impact", "finish"]:
        p = (bench.get("phases") or {}).get(phase) or {}
        before = (p.get("before") or {}).get("mean_abs_error_s")
        after = (p.get("after") or {}).get("mean_abs_error_s")
        improvement = p.get("improvement_s")
        rows.append(
            "<tr>"
            f"<td><b>{phase.title()}</b></td>"
            f"<td>{_fmt(before)}</td>"
            f"<td>{_fmt(after)}</td>"
            f"<td>{_fmt(improvement)}</td>"
            "</tr>"
        )
    return "\n".join(rows)


def build_dashboard_html() -> str:
    base_stats = training_stats()
    examples = load_training_examples(include_doubtful=True)
    advanced = summarize_examples(examples)
    model = load_latest_model()
    bench = estimate_model_error(model)
    model_version = model.get("version") if model else "No calibration model yet"
    overall = bench.get("overall") or {}
    html_doc = f"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Swing Lab Training Dashboard</title>
  <style>
    :root {{ font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; background:#f3f4f6; }}
    body {{ margin:0; padding:24px; }}
    .wrap {{ max-width: 1120px; margin: 0 auto; }}
    h1 {{ margin:0 0 6px; font-size: 32px; }}
    .muted {{ color:#6b7280; }}
    .cards {{ display:grid; grid-template-columns: repeat(auto-fit,minmax(190px,1fr)); gap:14px; margin:22px 0; }}
    .card {{ background:white; border-radius:18px; padding:18px; box-shadow:0 8px 28px rgba(15,23,42,.08); }}
    .big {{ font-size:30px; font-weight:800; margin-top:8px; }}
    table {{ width:100%; border-collapse: collapse; background:white; border-radius:16px; overflow:hidden; box-shadow:0 8px 28px rgba(15,23,42,.08); margin:16px 0 28px; }}
    th, td {{ text-align:left; padding:12px 14px; border-bottom:1px solid #e5e7eb; font-size:14px; }}
    th {{ background:#111827; color:white; }}
    button {{ border:0; background:#111827; color:white; padding:12px 16px; border-radius:12px; font-weight:700; cursor:pointer; }}
    button.secondary {{ background:#374151; }}
    pre {{ background:#0b1020; color:#d1d5db; padding:16px; border-radius:16px; overflow:auto; }}
    .ok {{ color:#047857; font-weight:700; }}
    .warn {{ color:#b45309; font-weight:700; }}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Swing Lab Training Dashboard</h1>
    <div class="muted">Local backend dashboard · use this to measure whether the phase engine is improving.</div>

    <div class="cards">
      <div class="card"><div class="muted">Sessions analyzed</div><div class="big">{base_stats.get('sessions', 0)}</div></div>
      <div class="card"><div class="muted">Training corrections</div><div class="big">{base_stats.get('training_corrections', 0)}</div></div>
      <div class="card"><div class="muted">Worst phase</div><div class="big">{html.escape(str(advanced.get('worst_phase') or '—')).title()}</div></div>
      <div class="card"><div class="muted">Active model</div><div style="font-weight:700;margin-top:8px;word-break:break-word;">{html.escape(model_version)}</div></div>
      <div class="card"><div class="muted">Overall MAE before</div><div class="big">{_fmt(overall.get('before_mean_abs_error_s'))}s</div></div>
      <div class="card"><div class="muted">Overall MAE after</div><div class="big">{_fmt(overall.get('after_mean_abs_error_s'))}s</div></div>
    </div>

    <p>
      <button onclick="recalibrate()">Recalibrate model now</button>
      <button class="secondary" onclick="location.reload()">Refresh dashboard</button>
    </p>
    <p id="status" class="muted">Recalibration uses stored corrections and writes <code>data/models/latest-model.json</code>. New analyses will use it automatically.</p>

    <h2>Current engine error by phase</h2>
    <table>
      <thead><tr><th>Phase</th><th>N</th><th>Mean signed error (s)</th><th>Mean abs error (s)</th><th>Max abs error (s)</th><th>Tendency</th></tr></thead>
      <tbody>{_phase_rows(advanced)}</tbody>
    </table>

    <h2>Estimated effect of active calibration model</h2>
    <p class="muted">This is a training-set estimate, not yet a separate holdout benchmark. It is still useful with the first 7–30 swings.</p>
    <table>
      <thead><tr><th>Phase</th><th>Before MAE (s)</th><th>After MAE (s)</th><th>Estimated improvement (s)</th></tr></thead>
      <tbody>{_benchmark_rows(bench)}</tbody>
    </table>

    <h2>Raw latest model</h2>
    <pre>{html.escape(__import__('json').dumps(model or {}, ensure_ascii=False, indent=2))}</pre>
  </div>
  <script>
    async function recalibrate() {{
      const el = document.getElementById('status');
      el.textContent = 'Recalibrating...';
      try {{
        const res = await fetch('/api/model/recalibrate', {{ method: 'POST' }});
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || JSON.stringify(data));
        el.innerHTML = '<span class="ok">Model recalibrated:</span> ' + data.model.version + '. Refreshing...';
        setTimeout(() => location.reload(), 900);
      }} catch (err) {{
        el.innerHTML = '<span class="warn">Recalibration failed:</span> ' + err.message;
      }}
    }}
  </script>
</body>
</html>
"""
    return html_doc
