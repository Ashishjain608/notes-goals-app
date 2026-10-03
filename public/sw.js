/**
 * Service worker: network-first for navigation, cache-first for assets.
 * Never touches Dropbox API endpoints; falls back to cached content when offline.
 */

const CACHE = "ng-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", async (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((name) => name !== CACHE ? caches.delete(name) : undefined),
      );
      await clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Ignore non-GET requests and cross-origin requests (including Dropbox API).
  if (
    request.method !== "GET" ||
    !request.url.startsWith(self.location.origin)
  ) {
    return;
  }

  // Navigation requests: network-first.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE);
            cache.put("./", response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match("./");
          return cached || new Response("Offline", { status: 503 });
        }
      })(),
    );
    return;
  }

  // Other same-origin GETs: cache-first.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        return new Response("Offline", { status: 503 });
      }
    })(),
  );
});
