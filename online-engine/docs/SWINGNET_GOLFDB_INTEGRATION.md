# Swing Lab v2.0 — GolfDB/SwingNet Foundation

This backend patch adds an optional specialised event detector based on the public GolfDB/SwingNet baseline.

## Why this matters

The previous v1.x detector was mostly pose/motion + temporal rules. It could improve slowly with bias calibration, but it often selected the wrong active window or a late follow-through event as impact. GolfDB/SwingNet is directly designed for golf swing sequencing and predicts eight golf swing events.

## External sources used as design baseline

- GolfDB / SwingNet: `https://github.com/wmcnally/golfdb`
- GolfDB paper: `https://arxiv.org/abs/1903.06528`
- CaddieSet: `https://github.com/damilab/CaddieSet`
- CaddieSet paper: `https://arxiv.org/abs/2508.20491`

## Important license note

The GolfDB repository is licensed under Creative Commons Attribution-NonCommercial 4.0. Use this only for research/prototyping unless commercial rights are clarified.

## Install optional ML dependencies

From `online-engine`:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-ml.txt
```

## Download/prepare SwingNet

```powershell
python scripts/setup_swingnet.py --download-weights
```

This clones the GolfDB repo to:

```text
online-engine/external/golfdb
```

and attempts to download:

```text
online-engine/external/golfdb/models/swingnet_1800.pth.tar
```

If Google Drive blocks the download, download the pretrained weights manually from the GolfDB README and place the file there.

## Check status

Run backend and open:

```text
http://localhost:8000/api/research/swingnet/status
```

Expected once installed:

```json
{
  "enabled": true,
  "repo_present": true,
  "weights_present": true,
  "torch_available": true
}
```

## How inference works

1. The legacy pose/motion detector runs first only to propose a coarse swing window.
2. SwingNet is run on that clipped window.
3. SwingNet predicts eight GolfDB events:
   - Address
   - Toe-up
   - Mid-backswing
   - Top
   - Mid-downswing
   - Impact
   - Mid-follow-through
   - Finish
4. Swing Lab maps them to the app's five phases:
   - Address -> Address
   - Toe-up -> Takeaway
   - Top -> Top
   - Impact -> Impact
   - Finish -> Finish
5. If SwingNet is not installed or fails sanity checks, the backend falls back to the existing pose/motion detector.

## Export our data to GolfDB-style labels

```powershell
python scripts/export_golfdb_style_dataset.py
```

or via API:

```text
POST /api/research/export-golfdb-dataset
```

This writes:

```text
data/dataset/golfdb_style/labels.jsonl
data/dataset/golfdb_style/labels.csv
```

Currently Swing Lab corrections provide 5 labelled events. The missing GolfDB events are left as null. Later, the app can add an advanced 8-event annotation mode.
