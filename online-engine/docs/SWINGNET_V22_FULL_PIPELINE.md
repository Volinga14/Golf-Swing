# Swing Lab Backend v2.2 — SwingNet Full Pipeline

This patch keeps the current PWA unchanged and upgrades the backend event detector.

## Why v2.2 exists

The first SwingNet integration proved that GolfDB/SwingNet can run locally, but it was still being used in a relatively basic way. GolfDB-style inference works best when the model receives a single, centred swing clip. Mobile videos vary a lot: different duration, framing, distance to player, waggles, preparation movements and follow-through duration.

v2.2 improves the pipeline before and after SwingNet:

1. Motion-based candidate windows for long videos.
2. Multiple clip proposals around the likely downswing/impact area.
3. Multiple crop variants:
   - full letterbox frame,
   - motion crop around golfer/club movement,
   - central wide crop,
   - central square crop when useful.
4. Ordered 8-event GolfDB decoding with soft golf temporal priors.
5. DTL-specific candidate scoring using backswing / downswing / follow-through timing.
6. Dashboard status for SwingNet runtime.

## Internal events

The backend keeps the full GolfDB event sequence internally:

- address
- toe_up
- mid_backswing
- top
- mid_downswing
- impact
- mid_follow_through
- finish

The PWA still receives the current 5 phases:

- address
- takeaway = toe_up
- top
- impact
- finish

## How to apply

Stop backend, unzip this patch over the repository root, then restart:

```powershell
cd online-engine
.\.venv\Scripts\Activate.ps1
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Check:

```text
http://localhost:8000/api/research/swingnet/status
http://localhost:8000/dashboard
```

## What to test

Use known DTL videos that already have manual corrections. For each one:

1. Analyze from the PWA.
2. Confirm the result says SwingNet/GolfDB is active.
3. Compare Address / Takeaway / Top / Impact / Finish.
4. Correct phases.
5. Send training data.

After 5–10 new corrections, use the dashboard to inspect MAE. The most important number is Impact MAE.

## Current limitation

This is still using the public SwingNet pretrained baseline, not a fine-tuned Swing Lab model. The next major improvement should be:

- export corrected sessions to GolfDB-style labels,
- mark 8 events for a subset of videos,
- fine-tune SwingNet or train a smaller SwingLab event model.
