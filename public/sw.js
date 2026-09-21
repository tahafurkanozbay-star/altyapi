const SHELL_CACHE = "altyapi-shell-v12";
const DATA_CACHE = "altyapi-data-v12";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./favicon.svg"];
const DATA_FILES = ["./services.json", "./service-health.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)),
      caches.open(DATA_CACHE).then((cache) =>
        Promise.allSettled(DATA_FILES.map((file) => cache.add(file)))
      )
    ])
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("altyapi-") && key !== SHELL_CACHE && key !== DATA_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
    return;
  }
  if (event.data?.type === "CLEAR_DATA_CACHE") {
    event.waitUntil(
      caches.delete(DATA_CACHE).then(() =>
        caches.open(DATA_CACHE).then((cache) =>
          Promise.allSettled(DATA_FILES.map((file) => cache.add(file)))
        )
      )
    );
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith(".map")) return;

  if (url.pathname.endsWith("services.json") || url.pathname.endsWith("service-health.json")) {
    event.respondWith(networkFirstData(request));
    return;
  }

  if (url.pathname.endsWith("health.html")) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (["script", "style", "image", "font", "worker"].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
  }
});

async function networkFirstData(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      const cache = await caches.open(DATA_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request, { cacheName: DATA_CACHE })) ?? Response.error();
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request, { cacheName })) ?? (await caches.match("./index.html", { cacheName: SHELL_CACHE })) ?? Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request, { cacheName });
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(cacheName);
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached ?? Response.error());
  return cached ?? network;
}
