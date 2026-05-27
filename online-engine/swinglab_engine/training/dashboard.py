from __future__ import annotations

import html
import json
from typing import Any

from .calibration import load_latest_model, summarize_examples, load_training_examples, estimate_model_error
from ..db.sqlite import training_stats
from ..core.phases import PHASES


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
    for phase in PHASES:
        s = phase_stats.get(phase) or {}
        rows.append(
            "<tr>"
            f"<td><b>{phase.title()}</b></td>"
            f"<td>{s.get('count', 0)}</td>"
            f"<td>{s.get('used_count', s.get('count', 0))}</td>"
            f"<td>{s.get('outliers_removed', 0)}</td>"
            f"<td>{_fmt(s.get('mean_signed_error_s'))}</td>"
            f"<td>{_fmt(s.get('robust_mean_signed_error_s'))}</td>"
            f"<td>{_fmt(s.get('mean_abs_error_s'))}</td>"
            f"<td>{_fmt(s.get('robust_mean_abs_error_s'))}</td>"
            f"<td>{_fmt(s.get('max_abs_error_s'))}</td>"
            f"<td>{html.escape(str(s.get('tendency', '—')))}</td>"
            "</tr>"
        )
    return "\n".join(rows)


def _benchmark_rows(bench: dict[str, Any]) -> str:
    rows = []
    for phase in PHASES:
        p = (bench.get("phases") or {}).get(phase) or {}
        before = (p.get("before") or {}).get("mean_abs_error_s")
        after = (p.get("after") or {}).get("mean_abs_error_s")
        improvement = p.get("improvement_s")
        css = "ok" if improvement is not None and improvement > 0 else "warn" if improvement is not None and improvement < 0 else ""
        rows.append(
            "<tr>"
            f"<td><b>{phase.title()}</b></td>"
            f"<td>{_fmt(before)}</td>"
            f"<td>{_fmt(after)}</td>"
            f"<td class='{css}'>{_fmt(improvement)}</td>"
            "</tr>"
        )
    return "\n".join(rows)


def _template_cards(template: dict[str, Any]) -> str:
    if not template:
        return "<p class='muted'>No temporal template yet.</p>"
    keys = [
        ("backswing_s_median", "Backswing median"),
        ("takeaway_of_backswing_ratio_median", "Takeaway / backswing"),
        ("downswing_s_median", "Downswing median"),
        ("downswing_to_backswing_ratio_median", "Downswing / backswing"),
        ("followthrough_s_median", "Follow-through median"),
        ("swing_span_s_median", "Swing span median"),
    ]
    cards = []
    for key, label in keys:
        val = template.get(key)
        cards.append(f"<div class='mini'><div class='muted'>{html.escape(label)}</div><b>{_fmt(val)}</b></div>")
    return "<div class='mini-grid'>" + "".join(cards) + "</div>"


def _session_rows(examples) -> str:
    rows = []
    for ex in examples[-40:]:
        phase_bits = []
        worst_phase = None
        worst_val = -1.0
        for phase in PHASES:
            err = ex.errors.get(phase)
            if err is None:
                continue
            abs_err = abs(err)
            if abs_err > worst_val:
                worst_val = abs_err
                worst_phase = phase
            cls = "bad" if abs_err >= 1.0 else "warn" if abs_err >= 0.35 else "ok"
            phase_bits.append(f"<span class='{cls}'>{phase}:{err:+.2f}s</span>")
        rows.append(
            "<tr>"
            f"<td><code>{html.escape(ex.session_id)}</code></td>"
            f"<td>{html.escape(ex.view)} / {html.escape(ex.club)}</td>"
            f"<td>{html.escape(ex.quality)}</td>"
            f"<td>{html.escape(str(worst_phase or '—'))}</td>"
            f"<td>{_fmt(worst_val)}</td>"
            f"<td>{' · '.join(phase_bits)}</td>"
            "</tr>"
        )
    return "\n".join(rows) or "<tr><td colspan='6'>No training examples yet.</td></tr>"


def build_dashboard_html() -> str:
    base_stats = training_stats()
    examples = load_training_examples(include_doubtful=True, latest_per_session=True)
    advanced = summarize_examples(examples)
    model = load_latest_model()
    bench = estimate_model_error(model)
    model_version = model.get("version") if model else "No calibration model yet"
    overall = bench.get("overall") or {}
    template = ((model or {}).get("temporal_templates") or {}).get("global") or advanced.get("duration_template") or {}
    raw_model = json.dumps(model or {}, ensure_ascii=False, indent=2)

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
    .wrap {{ max-width: 1280px; margin: 0 auto; }}
    h1 {{ margin:0 0 6px; font-size: 32px; }}
    h2 {{ margin-top: 30px; }}
    .muted {{ color:#6b7280; }}
    .cards {{ display:grid; grid-template-columns: repeat(auto-fit,minmax(190px,1fr)); gap:14px; margin:22px 0; }}
    .card {{ background:white; border-radius:18px; padding:18px; box-shadow:0 8px 28px rgba(15,23,42,.08); }}
    .big {{ font-size:30px; font-weight:800; margin-top:8px; }}
    .mini-grid {{ display:grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin: 14px 0 24px; }}
    .mini {{ background:white; border-radius:14px; padding:14px; box-shadow:0 6px 20px rgba(15,23,42,.06); }}
    table {{ width:100%; border-collapse: collapse; background:white; border-radius:16px; overflow:hidden; box-shadow:0 8px 28px rgba(15,23,42,.08); margin:16px 0 28px; }}
    th, td {{ text-align:left; padding:11px 12px; border-bottom:1px solid #e5e7eb; font-size:13px; vertical-align:top; }}
    th {{ background:#111827; color:white; }}
    button {{ border:0; background:#111827; color:white; padding:12px 16px; border-radius:12px; font-weight:700; cursor:pointer; }}
    button.secondary {{ background:#374151; }}
    pre {{ background:#0b1020; color:#d1d5db; padding:16px; border-radius:16px; overflow:auto; max-height: 460px; }}
    .ok {{ color:#047857; font-weight:700; }}
    .warn {{ color:#b45309; font-weight:700; }}
    .bad {{ color:#b91c1c; font-weight:700; }}
    code {{ font-size: 12px; }}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Swing Lab Training Dashboard</h1>
    <div class="muted">Local backend dashboard · v1.3 DTL phase detector · use this to measure whether the engine is improving.</div>

    <div class="cards">
      <div class="card"><div class="muted">Sessions analyzed</div><div class="big">{base_stats.get('sessions', 0)}</div></div>
      <div class="card"><div class="muted">Raw training corrections</div><div class="big">{base_stats.get('training_corrections', 0)}</div></div>
      <div class="card"><div class="muted">Usable latest examples</div><div class="big">{len(examples)}</div></div>
      <div class="card"><div class="muted">Worst phase</div><div class="big">{html.escape(str(advanced.get('worst_phase') or '—')).title()}</div></div>
      <div class="card"><div class="muted">Active model</div><div style="font-weight:700;margin-top:8px;word-break:break-word;">{html.escape(model_version)}</div></div>
      <div class="card"><div class="muted">Overall MAE before</div><div class="big">{_fmt(overall.get('before_mean_abs_error_s'))}s</div></div>
      <div class="card"><div class="muted">Overall MAE after</div><div class="big">{_fmt(overall.get('after_mean_abs_error_s'))}s</div></div>
      <div class="card"><div class="muted">Estimated improvement</div><div class="big">{_fmt(overall.get('improvement_s'))}s</div></div>
    </div>

    <p>
      <button onclick="recalibrate()">Recalibrate model now</button>
      <button class="secondary" onclick="location.reload()">Refresh dashboard</button>
    </p>
    <p id="status" class="muted">Recalibration uses stored corrections and writes <code>data/models/latest-model.json</code>. New analyses will use it automatically.</p>

    <h2>Current engine error by phase</h2>
    <table>
      <thead><tr><th>Phase</th><th>N</th><th>Used</th><th>Outliers</th><th>Mean signed</th><th>Robust signed</th><th>MAE</th><th>Robust MAE</th><th>Max abs</th><th>Tendency</th></tr></thead>
      <tbody>{_phase_rows(advanced)}</tbody>
    </table>

    <h2>Estimated effect of active calibration model</h2>
    <p class="muted">Training-set estimate. Useful now, but we will later add a holdout benchmark.</p>
    <table>
      <thead><tr><th>Phase</th><th>Before MAE (s)</th><th>After MAE (s)</th><th>Estimated improvement (s)</th></tr></thead>
      <tbody>{_benchmark_rows(bench)}</tbody>
    </table>

    <h2>DTL temporal template learned from corrections</h2>
    {_template_cards(template)}

    <h2>Recent training examples and worst errors</h2>
    <table>
      <thead><tr><th>Session</th><th>View / Club</th><th>Quality</th><th>Worst phase</th><th>Worst abs</th><th>Errors</th></tr></thead>
      <tbody>{_session_rows(examples)}</tbody>
    </table>

    <h2>Raw latest model</h2>
    <pre>{html.escape(raw_model)}</pre>
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
