const CACHE_PREFIX = `swing-lab-pwa:${new URL(self.registration.scope).pathname}:`;
const CACHE_NAME = CACHE_PREFIX + 'v49-20261114-r3';
const APP_SHELL = [
  './',
  './index.html',
  './video-scrubber.js?v=49-20261114-r3',
  './analysis-jobs.js?v=49-20261114-r3',
  './segment-picker.js?v=49-20261114-r3',
  './agent-review.js?v=49-20261114-r3',
  './agent-sampling.js?v=49-20261114-r3',
  './agent-review.css?v=49-20261114-r3',
  './agent-prompt.txt',
  './practice-illustrations.js?v=49-20261114-r3',
  './practice.js?v=49-20261114-r3',
  './practice-ui.js?v=49-20261114-r3',
  './product.css?v=49-20261114-r3',
  './coaching-report.js?v=49-20261114-r3',
  './native-agent.js?v=49-20261114-r3',
  './video-tools.js?v=49-20261114-r3',
  './local-engine.js?v=49-20261114-r3',
  './references.js?v=49-20261114-r3',
  './learning.js?v=49-20261114-r3',
  './lab/core.js',
  './lab/hybrid-core.js',
  './lab/audio-cues.js',
  './lab/motion.js?v=49-20261114-r3',
  './lab/candidate-worker.js?v=49-20261114-r3',
  './lab/models/model.json',
  './lab/models/encoder.onnx',
  './lab/models/temporal.onnx',
  './lab/vendor/ort.wasm.min.js',
  './lab/vendor/ort-wasm-simd-threaded.mjs',
  './lab/vendor/runtime.json',
  ...Array.from({length:6},(_,i)=>'./lab/vendor/ort-runtime.gz.'+i),
  './dashboard.html',
  './styles.css?v=49-20261114-r3',
  './session-store.js?v=49-20261114-r3',
  './app.js?v=49-20261114-r3',
  './ui.css?v=49-20261114-r3',
  './assets/wordmark.svg',
  './assets/new-analysis-club.svg',
  './assets/golf-ball.svg',
  './assets/icons.svg',
  './manifest.webmanifest',
  './assets/logo.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/field-bg-correct.webp',
  './assets/golfer.png',
  './assets/metrics.png',
  './assets/analysis-thumb.webp',
  './assets/contours.svg'
];
const SHELL_URLS = new Set(APP_SHELL.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  const navigation = request.mode === 'navigate';
  const key = navigation ? url.origin + url.pathname : url.href;
  // API responses, videos and unrelated applications never enter this cache.
  if (!SHELL_URLS.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (!navigation) {
      const cached = await cache.match(key);
      if (cached) return cached;
    }
    try {
      const response = await fetch(request);
      if (response.ok) event.waitUntil(cache.put(key, response.clone()).catch(() => {}));
      return response;
    } catch (error) {
      const cached = await cache.match(key);
      if (cached) return cached;
      throw error;
    }
  })());
});
