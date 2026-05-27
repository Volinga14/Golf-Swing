# Swing Lab v1.2 Training Dashboard + Auto Calibration

This patch adds the first real learning loop to the local Python backend.

## What changes

- Reads existing training corrections from `data/db/swinglab.sqlite3`.
- Calculates phase error statistics.
- Generates a calibration model in `data/models/latest-model.json`.
- Applies the calibration model automatically to new analyses.
- Adds a local dashboard at:

```text
http://localhost:8000/dashboard
```

## New endpoints

```text
GET  /dashboard
POST /api/model/recalibrate
GET  /api/model/latest
GET  /api/model/evaluate
GET  /api/training/stats
```

## Recommended workflow

1. Start backend:

```powershell
cd online-engine
.\.venv\Scripts\Activate.ps1
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

2. Open dashboard:

```text
http://localhost:8000/dashboard
```

3. Click **Recalibrate model now**.

4. Upload a new video through the PWA.

5. The new analysis will automatically apply `data/models/latest-model.json`.

## What the calibration means

Error convention:

```text
error = corrected phase time - automatic phase time
```

- Negative error: engine was late, so calibration moves that phase earlier.
- Positive error: engine was early, so calibration moves that phase later.

This is not yet a neural network. It is a conservative phase-bias calibration layer built from your corrected sessions. It is the first step toward a more robust model registry.

## Important

Do not commit generated data to GitHub:

```text
online-engine/data/videos
online-engine/data/captures
online-engine/data/reports
online-engine/data/features
online-engine/data/training
online-engine/data/db
online-engine/data/models/latest-model.json
```

The model and data are local for now. Later we can decide which trained model artifacts should be published.
