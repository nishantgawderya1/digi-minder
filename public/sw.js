/* The production build replaces this marker so each release can be updated. */
const CACHE_NAME = "warrantly-public-v1-__WARRANTLY_BUILD_ID__";
const CACHE_PREFIX = "warrantly-public-";
const PREVIOUS_RELEASES = 2;
const MAX_ASSETS = 96;
const PUBLIC_FILES = [
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

// Deliberately exclude HTML, API/server functions, uploads, signed URLs and
// third-party services. Only fingerprinted build assets and public PWA files
// belong in this cache. No bill, account or authentication response is saved.
function isPublicAsset(url) {
  if (url.origin !== self.location.origin || url.search) return false;
  return (
    PUBLIC_FILES.includes(url.pathname) ||
    /^\/assets\/[^/]+-[\w-]{8,}\.(?:js|css|woff2?|png|jpe?g|webp|svg|ico)$/.test(
      url.pathname,
    )
  );
}

function canStore(response) {
  return (
    response.ok &&
    response.type !== "opaque" &&
    !response.redirected &&
    !/\b(?:private|no-store)\b/i.test(
      response.headers.get("Cache-Control") || "",
    ) &&
    !/text\/html/i.test(response.headers.get("Content-Type") || "")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        PUBLIC_FILES.map(async (path) => {
          const response = await fetch(path, {
            credentials: "omit",
            cache: "reload",
          });
          if (
            !response.ok ||
            response.redirected ||
            /\b(?:private|no-store)\b/i.test(
              response.headers.get("Cache-Control") || "",
            ) ||
            (path !== "/offline.html" && !canStore(response))
          ) {
            throw new Error("A required offline resource is unavailable.");
          }
          await cache.put(path, response);
        }),
      );
    })(),
  );
  // Updates wait until the user chooses to reload, protecting work in progress.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      // Keep recent releases for another open tab's lazy-loaded modules.
      // CacheStorage lists caches in creation order. Each release is capped
      // separately; only fingerprinted static assets can use this fallback.
      const previous = names.filter(
        (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
      );
      await Promise.all(
        previous
          .slice(0, Math.max(0, previous.length - PREVIOUS_RELEASES))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (
    request.mode === "navigate" &&
    !/^\/(?:api(?:\/|$)|_)/.test(url.pathname)
  ) {
    // Never cache a page: it may contain private data or authentication state.
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (
          (await cache.match("/offline.html")) ||
          new Response("You're offline. Reconnect and try again.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  if (!isPublicAsset(url)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      if (url.pathname.startsWith("/assets/")) {
        const previous = (await caches.keys())
          .filter(
            (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
          )
          .reverse();
        for (const name of previous) {
          const olderCache = await caches.open(name);
          const olderAsset = await olderCache.match(request);
          if (olderAsset) return olderAsset;
        }
      }
      const response = await fetch(request);
      // /offline.html is precached deliberately; no other HTML can enter cache.
      if (canStore(response)) {
        const write = (async () => {
          await cache.put(request, response.clone());
          const keys = await cache.keys();
          const assets = keys.filter(
            (key) => !PUBLIC_FILES.includes(new URL(key.url).pathname),
          );
          await Promise.all(
            assets
              .slice(0, Math.max(0, assets.length - MAX_ASSETS))
              .map((key) => cache.delete(key)),
          );
        })();
        event.waitUntil(write.catch(() => {}));
      }
      return response;
    })(),
  );
});
