const APP_VERSION = "0.5.5";
const CACHE_NAME = `swing-lab-ai-v${APP_VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./styles/main.css",
  "./src/main.js",
  "./src/video-player.js",
  "./src/overlays.js",
  "./src/storage.js",
  "./src/metrics.js",
  "./src/recommendations.js",
  "./src/video-analysis.js",
  "./src/ball-tracking.js",
  "./src/learning.js",
  "./src/export.js",
  "./assets/swing-guide.svg",
  "./assets/guide-example.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-192.png",
  "./assets/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const request = event.request;
  const accept = request.headers.get("accept") || "";
  const isAppAsset = new URL(request.url).origin === self.location.origin;
  const networkFirst = request.mode === "navigate" || accept.includes("text/html") || request.destination === "script" || request.destination === "style";

  if (networkFirst) {
    event.respondWith(fetchAndCache(request).catch(() => caches.match(request)));
    return;
  }

  if (isAppAsset) {
    event.respondWith(caches.match(request).then((cached) => cached || fetchAndCache(request)));
  }
});

async function fetchAndCache(request) {
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}
