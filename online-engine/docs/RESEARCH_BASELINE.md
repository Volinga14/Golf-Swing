# Research baseline for future Swing Lab engine improvements

## GolfDB / SwingNet

Primary use: swing event detection.

What it gives us:
- Public dataset concept: 1,400 HD golf swing videos.
- Labels: event frames, bounding boxes, player info, sex, club, view type.
- Model: SwingNet, a lightweight CNN + recurrent network for swing sequencing.
- Events: 8 standard golf swing events.
- Practical note: original test script expects a video clipped/cropped to a single swing.

How Swing Lab uses it:
- Adopt GolfDB event schema internally.
- Use SwingNet as optional specialised event detector.
- Keep pose/motion detector as fallback.
- Convert our corrected sessions into GolfDB-style labels for fine-tuning later.

## CaddieSet

Primary use: later technical analysis and ball-result relationships.

What it gives us:
- Dataset with 1,757 shots.
- DTL and Face-On views.
- Ball flight estimates.
- Joint information and domain-knowledge metrics.

How Swing Lab should use it later:
- Define professional report metrics.
- Add pose-based metrics at key events.
- Relate swing metrics to ball outcome once ball tracking/launch info exists.

## Recommended development path

1. Validate SwingNet baseline on our videos.
2. Compare SwingNet vs current fallback on the same corrected sessions.
3. Improve clipping/cropping before fine-tuning.
4. Add 8-event annotation mode to the PWA.
5. Fine-tune SwingNet on GolfDB + Swing Lab corrections.
6. Add CaddieSet-style metrics to the client report.
