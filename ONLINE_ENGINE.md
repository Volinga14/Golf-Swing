# Swing Lab v1.0 Online Engine Pipeline

This package includes the PWA and a first backend for the online engine.

## Architecture implemented

1. **PWA**
   - Loads video.
   - Tries the online engine when configured.
   - Falls back to local engine when online is unavailable.
   - Lets users correct phases manually.
   - Generates client report and training record.
   - Can submit training data + original video to the backend.

2. **Online Engine** (`online-engine/`)
   - FastAPI server.
   - Accepts video uploads at `/api/analyze`.
   - Uses OpenCV motion profile and optional MediaPipe Pose.
   - Returns phases, metrics, captures, diagnostics and confidence.
   - Saves analysis JSON.
   - Accepts corrections at `/api/training/submit`.

3. **Training / benchmark** (`training/`)
   - `evaluate_engine.py` reports phase error from corrected sessions.
   - `build_latest_model.py` creates a calibrated `models/latest-model.json` from collected labels.

## Local backend test

```bash
cd online-engine
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8787 --reload
```

Open the PWA, press **Motor**, and set:

```text
http://localhost:8787
```

For mobile, deploy/expose the backend over HTTPS and set that URL in **Motor**.

## Important production note

The PWA cannot magically run a private online engine until the backend is deployed somewhere reachable by the phone. This package includes the working backend code and the PWA client integration.
