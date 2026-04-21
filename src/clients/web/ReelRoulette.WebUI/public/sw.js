/* Minimal installable PWA worker for Chromium (e.g. Android Chrome): network-only fetch.
   Offline caching is intentionally out of scope. */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
