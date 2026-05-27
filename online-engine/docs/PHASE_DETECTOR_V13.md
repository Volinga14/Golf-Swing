# Swing Lab Backend v1.3 – DTL Phase Detector

## Purpose

The previous detector was useful for collecting data, but it often detected phases late, especially Top, Impact and Finish. v1.3 changes the method from "motion window + timing ratios" to a DTL-focused pose-first detector.

## Detection logic

1. Build motion profile over the full video.
2. Select a compact active window rather than treating the whole video as the swing.
3. Extract MediaPipe pose landmarks at higher sampling frequency.
4. Detect Top first using:
   - hand height,
   - shoulder turn proxy,
   - low speed around change of direction,
   - evidence of future downswing speed.
5. Detect Address and Takeaway before Top.
6. Detect Impact after Top as the earliest strong downswing event where hands return near Address.
7. Detect Finish as the first stable follow-through zone.

## Calibration logic

The calibration model now stores:

- robust phase bias by phase,
- group bias by view/club,
- temporal DTL template from corrected swings:
  - backswing duration,
  - takeaway/backwing ratio,
  - downswing duration,
  - downswing/backwing ratio,
  - follow-through duration.

This lets the system improve faster while reducing the effect of obvious outliers.

## Recommended use

For now focus on DTL videos only. Keep correcting phases and submitting training. After every 5–10 corrections, open `/dashboard` and press **Recalibrate model now**.
