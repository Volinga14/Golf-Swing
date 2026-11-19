// Swing Lab PWA configuration for GLAB neural backend.
// In the app, press "Motor" and paste ONLY the backend base URL:
//   http://localhost:8000
//   https://xxxxx.trycloudflare.com
// Never paste /api/health or /api/analyze.
window.SWING_LAB_CONFIG = {
  APP_VERSION: 'v1.2.1-glab-neural-client-inline-fix',
  ONLINE_ENGINE_URL: '',
  USE_ONLINE_ENGINE: true,
  SUBMIT_TRAINING_BY_DEFAULT: false,
  LOCAL_FALLBACK: true,
  GLAB_DEFAULT_NUM_FRAMES: 48,
  GLAB_DEFAULT_IMAGE_SIZE: 144,
  GLAB_USE_MOTION_WINDOW: true
};
