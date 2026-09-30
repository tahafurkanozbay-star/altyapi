/* AUTO-GENERATED from worker/service-worker.ts. DO NOT EDIT. */
const sw = globalThis;
const SHELL_CACHE = "altyapi-shell-v38";
const DATA_CACHE = "altyapi-data-v38";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./favicon.svg"];
const DATA_FILES = ["./services.json", "./service-health.json", "./service-navigation.json"];
const SHELL_MAX_ENTRIES = 96;
const DATA_MAX_ENTRIES = 16;
const DATA_TIMEOUT_MS = 12000;
const NAVIGATION_TIMEOUT_MS = 9000;
sw.addEventListener("install", (event) => {
    event.waitUntil(Promise.all([
        warmCache(SHELL_CACHE, SHELL),
        warmCache(DATA_CACHE, DATA_FILES)
    ]).then(() => undefined));
});
sw.addEventListener("activate", (event) => {
    const cleanup = caches
        .keys()
        .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("altyapi-") && key !== SHELL_CACHE && key !== DATA_CACHE)
        .map((key) => caches.delete(key))));
    const preload = sw.registration.navigationPreload?.enable?.() ?? Promise.resolve();
    event.waitUntil(Promise.all([cleanup, preload]).then(() => sw.clients.claim()));
});
sw.addEventListener("message", (event) => {
    const message = isWorkerMessage(event.data) ? event.data : undefined;
    if (!message)
        return;
    if (message.type === "SKIP_WAITING") {
        event.waitUntil(sw.skipWaiting());
        return;
    }
    if (message.type === "CLEAR_DATA_CACHE") {
        event.waitUntil(caches.delete(DATA_CACHE).then(async () => {
            await warmCache(DATA_CACHE, DATA_FILES);
        }));
        return;
    }
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("altyapi-")).map((key) => caches.delete(key)))).then(() => undefined));
});
sw.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET")
        return;
    const url = new URL(request.url);
    if (url.origin !== sw.location.origin)
        return;
    if (url.pathname.endsWith(".map"))
        return;
    if (isLiveDataPath(url.pathname)) {
        event.respondWith(networkFirstData(request));
        return;
    }
    if (url.pathname.endsWith("health.html")) {
        event.respondWith(networkFirst(request, SHELL_CACHE));
        return;
    }
    if (request.mode === "navigate" || request.destination === "document") {
        event.respondWith(networkFirst(request, SHELL_CACHE, event.preloadResponse));
        return;
    }
    if (["script", "style", "image", "font", "worker"].includes(request.destination)) {
        event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    }
});
async function warmCache(cacheName, entries) {
    const cache = await caches.open(cacheName);
    await Promise.allSettled(entries.map((entry) => cache.add(entry)));
    await trimCache(cache, cacheName === DATA_CACHE ? DATA_MAX_ENTRIES : SHELL_MAX_ENTRIES);
}
async function networkFirstData(request) {
    try {
        const response = await fetchWithTimeout(request, DATA_TIMEOUT_MS, { cache: "no-store" });
        if (response.ok)
            await putBounded(DATA_CACHE, request, response.clone(), DATA_MAX_ENTRIES);
        return response;
    }
    catch {
        return (await caches.match(request, { cacheName: DATA_CACHE })) ?? Response.error();
    }
}
async function networkFirst(request, cacheName, preloadResponse) {
    try {
        let response;
        if (preloadResponse) {
            try {
                response = await preloadResponse;
            }
            catch {
            }
        }
        response ??= await fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS);
        if (response.ok)
            await putBounded(cacheName, request, response.clone(), SHELL_MAX_ENTRIES);
        return response;
    }
    catch {
        return (await caches.match(request, { cacheName }))
            ?? (await caches.match("./index.html", { cacheName: SHELL_CACHE }))
            ?? Response.error();
    }
}
async function staleWhileRevalidate(request, cacheName) {
    const cached = await caches.match(request, { cacheName });
    const network = fetch(request)
        .then(async (response) => {
        if (response.ok)
            await putBounded(cacheName, request, response.clone(), SHELL_MAX_ENTRIES);
        return response;
    })
        .catch(() => cached ?? Response.error());
    return cached ?? network;
}
async function putBounded(cacheName, request, response, maxEntries) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
    await trimCache(cache, maxEntries);
}
async function trimCache(cache, maxEntries) {
    const keys = await cache.keys();
    const overflow = Math.max(0, keys.length - Math.max(1, maxEntries));
    if (overflow === 0)
        return;
    await Promise.all(keys.slice(0, overflow).map((key) => cache.delete(key)));
}
async function fetchWithTimeout(request, timeoutMs, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(request, { ...init, signal: controller.signal });
    }
    finally {
        clearTimeout(timer);
    }
}
function isLiveDataPath(pathname) {
    return pathname.endsWith("services.json")
        || pathname.endsWith("service-health.json")
        || pathname.endsWith("service-navigation.json");
}
function isWorkerMessage(value) {
    if (!value || typeof value !== "object" || !("type" in value))
        return false;
    const type = value.type;
    return type === "SKIP_WAITING" || type === "CLEAR_DATA_CACHE" || type === "CLEAR_ALL_CACHES";
}
