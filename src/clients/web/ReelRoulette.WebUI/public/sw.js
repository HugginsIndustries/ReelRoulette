/* Minimal installable PWA worker for Chromium (e.g. Android Chrome).
   Offline caching is intentionally out of scope.
   Only document navigations are intercepted. API calls, the event stream, and
   media stay on the browser's network path. Firefox fails EventSource when a
   worker proxies it, and that failure can stall the page. */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") {
    return;
  }

  event.respondWith(fetch(event.request));
});
