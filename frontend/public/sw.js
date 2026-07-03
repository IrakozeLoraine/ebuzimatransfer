/*
 * eBuzimaTransfer service worker (hand-written — the project runs rolldown-vite 8,
 * which vite-plugin-pwa does not yet emit a worker for).
 *
 * Strategy:
 *  - App shell (index.html) is network-first so navigations work offline.
 *  - Hashed build assets are cache-first (filenames change per build, so this is safe).
 *  - Google Fonts cache-first; OSM map tiles stale-while-revalidate.
 *  - /api and /ws are never intercepted — live medical data always hits the network.
 *
 */
const CACHE_VERSION = "__SW_VERSION__";
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const ASSET_CACHE = `assets-${CACHE_VERSION}`;
const FONT_CACHE = `fonts-${CACHE_VERSION}`;
const TILE_CACHE = `osm-tiles-${CACHE_VERSION}`;
const KEEP = new Set([SHELL_CACHE, ASSET_CACHE, FONT_CACHE, TILE_CACHE]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(["/", "/index.html"]))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Never intercept API or websocket traffic.
  if (sameOrigin && (url.pathname.startsWith("/api") || url.pathname.startsWith("/ws"))) {
    return;
  }

  // SPA navigations: network-first, fall back to the cached app shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          caches.open(SHELL_CACHE).then((cache) => cache.put("/index.html", response.clone()));
          return response;
        })
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
    );
    return;
  }

  if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    event.respondWith(staleWhileRevalidate(request, TILE_CACHE));
    return;
  }

  // Same-origin static build assets (content-hashed) — cache-first.
  if (sameOrigin) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === "opaque")) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === "opaque")) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || network;
}