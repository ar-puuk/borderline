const CACHE_NAME = "borderline-v3";

const APP_SHELL = [
  "./",
  "./index.html",
  "./favicon.svg",
  "./manifest.json",
  "./css/styles.css",
  "./js/audio.js",
  "./js/game.js",
  "./js/geometry.js",
  "./js/main.js",
  "./js/mapData.js",
  "./js/renderer.js",
  "./js/stats.js",
  "./js/storage.js",
  "./js/theme.js",
  "./vendor/d3-geo.min.js",
  "./vendor/topojson-client.min.js",
  "./vendor/fonts/SpaceGrotesk.woff2",
  "./vendor/fonts/SpaceMono-Regular.woff2",
  "./vendor/fonts/SpaceMono-Bold.woff2",
  "./data/states-albers-10m.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
