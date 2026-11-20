/* global self, caches */
const PREFIX = "asha-setu-shell-";
const REVISION = "source";
const ASSETS = ["/", "/manifest.json", "/icon.svg"];
const CACHE = PREFIX + REVISION;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map((path) => new Request(path, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function fetchNavigation(request, pathname) {
  try {
    return await fetch(request, { cache: "no-store" });
  } catch (error) {
    const cache = await caches.open(CACHE);
    const offlinePath = pathname === "/index.html" ? "/" : pathname;
    const cached = await cache.match(offlinePath);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetchNavigation(request, url.pathname));
  } else if (ASSETS.includes(url.pathname) && url.pathname !== "/") {
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(url.pathname)) ?? fetch(request)));
  }
});
