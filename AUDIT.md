# Swing Lab Hybrid v1.1.1 - Connection Fix Audit

## Problem detected

The PWA was sometimes configured with a full endpoint URL such as `/api/health` instead of the engine base URL. The frontend then appended `/api/health` and `/api/analyze`, causing invalid backend requests such as:

- `GET /api/health/api/health`
- `POST /api/health/api/analyze`

The Motor button was also only visible after video load, making setup inconvenient before uploading a mobile video.

## Fixes applied

- Added Motor configuration button to the start screen before video upload.
- Status is synchronized between the start-screen Motor button and the in-video HUD button.
- Engine URL is sanitized client-side. If the user pastes `/api/health`, `/api/analyze`, `/api/model/latest`, `/api/training/submit`, `/api/training/stats`, or `/api`, the app stores only the base URL.
- Backend version updated to `0.1.3`.
- Added temporary backend compatibility aliases for malformed URLs during transition.
- Service worker cache version updated to force refresh.

## Correct Cloudflare URL format

Use this format in the app:

```text
https://xxxx.trycloudflare.com
```

Do not use:

```text
https://xxxx.trycloudflare.com/api/health
```

The app now corrects this automatically, but the base URL is still the preferred input.

## Verification performed

- JavaScript syntax check passed.
- Python backend syntax compile passed.
- ZIP generated without `.venv`, generated videos, reports, captures, or database files.
