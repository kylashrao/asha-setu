/* global self, caches */
const PREFIX = "asha-setu-shell-";
const REVISION = "source";
const ASSETS = ["/", "/manifest.json", "/icon.svg"];
const CACHE = PREFIX + REVISION;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(
    ASSETS.map((path) => new Request(path, { cache: "reload" })),
  )));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match("/")) ?? fetch(request)));
  } else if (ASSETS.includes(url.pathname) && url.pathname !== "/") {
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(url.pathname)) ?? fetch(request)));
  }
});
