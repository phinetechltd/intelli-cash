const CACHE_NAME = "intellicash-group-pwa-v2";
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/brand/intelli-cash-logo.png",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/icon-maskable-512.png",
  "/pwa/apple-touch-icon.png",
  "/pwa/splash-828x1792.png",
  "/pwa/splash-1125x2436.png",
  "/pwa/splash-1170x2532.png",
  "/pwa/splash-1242x2688.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const nextStatic = url.pathname.startsWith("/_next/static/");
  const cacheFirst =
    url.pathname.startsWith("/pwa/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/manifest.webmanifest";

  if (nextStatic) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (cacheFirst) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  if (request.mode === "navigate" && url.pathname.startsWith("/dashboard")) {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/manifest.webmanifest").then(
          () =>
            new Response(
              "<!doctype html><title>Intelli-Cash</title><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><body style=\"font-family:system-ui;margin:0;display:grid;min-height:100vh;place-items:center;background:#f7faf8;color:#101820\"><main style=\"padding:24px;text-align:center\"><img src=\"/pwa/icon-192.png\" alt=\"\" width=\"96\" height=\"96\"><h1>Intelli-Cash Group Account</h1><p>You are offline. Reconnect to open the latest group workspace.</p></main></body>",
              { headers: { "Content-Type": "text/html; charset=utf-8" } }
            )
        )
      )
    );
  }
});
