# Swing Lab v0.9.6 Stable Player Audit

## Problem addressed
The v0.9.5 automatic detection was using the visible video element for frame sampling. Because the engine repeatedly seeks through the video, this affected playback, timeline use and manual phase marking.

## Corrections made
- Automatic detection now runs on a hidden background video element, not the visible player.
- The visible player is no longer seeked when automatic detection finishes.
- Manual phase marks are protected: if the user marks a phase while detection is running, the engine will not overwrite that phase when it finishes.
- Detection is single-run per video load, guarded by a run id to avoid old detections modifying a new video.
- Immediate preliminary phase times are still installed so the app is usable before smart detection finishes.
- A small `window.SwingLabAudit.checks()` helper was added for debugging in browser console.

## Static checks performed
- `node --check app.js` OK
- `node --check engine/heuristic-engine.js` OK
- `node --check engine/pose-engine.js` OK
- `node --check engine/swing-engine.js` OK
- `node --check sw.js` OK
- HTML id/reference scan OK; the only missing id is optional legacy `expandSheetBtn`, guarded in code.

## Manual test recommendation
After deploying to GitHub Pages or reinstalling the PWA:
1. Upload a video.
2. Without waiting for the analysis to finish, tap the video and mark Address/Takeaway.
3. Press Play: the visible player should not jump around.
4. When detection finishes, manually marked phases should remain unchanged.
5. Review Top and Impact manually.
