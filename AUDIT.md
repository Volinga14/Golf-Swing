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


# v0.9.7 Phase Control Audit

Issue fixed: the background detector/default installer was resetting `currentPhaseId` back to `address` after the user selected or marked another phase. This made it look as if the engine was still controlling the phase workflow.

Changes:
- Added `state.userPhaseControl` to detect manual phase interaction.
- `jumpToPhase()` now locks active phase control to the user unless explicitly called as a system operation.
- `markCurrentPhase()` now auto-advances immediately to the next phase without a delayed timeout that could race against video events.
- `installImmediatePhaseDefaults()` no longer forces `currentPhaseId = 'address'` after user interaction.
- `applyDetectedPhaseTimes()` preserves the active phase and exact user-marked times when auto-detection completes.
- Defaults now fill missing values instead of repeatedly re-controlling the phase workflow.

Static checks completed:
- JavaScript syntax validation for app and engine files.
- Service worker version bumped to avoid old cache.
- Verified automatic detection still runs on hidden analysis video, not visible player.
