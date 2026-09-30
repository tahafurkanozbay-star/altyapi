const RELEASE = "__ALTYAPI_RELEASE__";
const SHELL_CACHE = "altyapi-shell-v" + RELEASE;
const DATA_CACHE = "altyapi-data-v" + RELEASE;
const RUNTIME_CACHE = "altyapi-runtime-v" + RELEASE;
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./favicon.svg", "./health.html"];
const DATA_FILES = ["./services.json", "./service-health.json", "./service-navigation.json"];
const DATA_NETWORK_TIMEOUT_MS = 4_500;
const NAVIGATION_NETWORK_TIMEOUT_MS = 7_000;
const SENSITIVE_QUERY_KEYS = /^(?:token|access_token|api_?key|apikey|secret|password|pass|signature|sig|auth|authorization)$/i;
const CACHEABLE_DESTINATIONS = new Set<RequestDestination>(["script", "style", "image", "font", "worker"]);
const serviceWorker = self as unknown as ServiceWorkerGlobalScope;

type WorkerCommand =
  | { type: "SKIP_WAITING" }
  | { type: "CLEAR_DATA_CACHE" }
  | { type: "GET_VERSION"; requestId?: string };

serviceWorker.addEventListener("install", (event) => {
  event.waitUntil(precache());
});

serviceWorker.addEventListener("activate", (event) => {
  event.waitUntil(activateRelease());
});

serviceWorker.addEventListener("message", (event) => {
  const command = parseWorkerCommand(event.data);
  if (!command) return;

  if (command.type === "SKIP_WAITING") {
    void serviceWorker.skipWaiting();
    return;
  }

  if (command.type === "CLEAR_DATA_CACHE") {
    event.waitUntil(refreshDataCache());
    return;
  }

  const source = event.source as { postMessage(message: unknown): void } | null;
  const response: { type: "VERSION"; release: string; requestId?: string } = {
    type: "VERSION",
    release: RELEASE
  };
  if (command.requestId !== undefined) response.requestId = command.requestId;
  source?.postMessage(response);
});

serviceWorker.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== serviceWorker.location.origin) return;
  if (url.pathname.endsWith(".map")) return;

  if (isLiveDataPath(url.pathname)) {
    event.respondWith(networkFirstData(request));
    return;
  }

  if (url.pathname.endsWith("health.html")) {
    event.respondWith(networkFirstDocument(request));
    return;
  }

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirstDocument(request, event.preloadResponse));
    return;
  }

  if (CACHEABLE_DESTINATIONS.has(request.destination) && isCacheSafeRequest(request)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function precache(): Promise<void> {
  const [shellCache, dataCache] = await Promise.all([
    caches.open(SHELL_CACHE),
    caches.open(DATA_CACHE)
  ]);

  await shellCache.add("./index.html");
  await Promise.allSettled(SHELL.filter((item) => item !== "./index.html").map((item) => shellCache.add(item)));
  await Promise.allSettled(DATA_FILES.map((item) => dataCache.add(item)));
}

async function activateRelease(): Promise<void> {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith("altyapi-") && key !== SHELL_CACHE && key !== DATA_CACHE && key !== RUNTIME_CACHE)
      .map((key) => caches.delete(key))
  );

  const registration = serviceWorker.registration as ServiceWorkerRegistration & {
    navigationPreload?: { enable(): Promise<void> };
  };
  try {
    await registration.navigationPreload?.enable();
  } catch {
    // Navigation preload is an optimization only.
  }

  await serviceWorker.clients.claim();
}

async function refreshDataCache(): Promise<void> {
  await caches.delete(DATA_CACHE);
  const cache = await caches.open(DATA_CACHE);
  await Promise.allSettled(DATA_FILES.map((item) => cache.add(item)));
}

async function networkFirstData(request: Request): Promise<Response> {
  try {
    const response = await fetchWithTimeout(request, { cache: "no-store", credentials: "same-origin" }, DATA_NETWORK_TIMEOUT_MS);
    if (canStoreResponse(request, response)) await safeCachePut(DATA_CACHE, request, response);
    return response;
  } catch {
    return (await caches.match(request, { cacheName: DATA_CACHE })) ?? Response.error();
  }
}

async function networkFirstDocument(request: Request, preloadResponse?: Promise<unknown>): Promise<Response> {
  try {
    const preloaded = preloadResponse ? await preloadResponse.catch(() => undefined) : undefined;
    const response = preloaded instanceof Response
      ? preloaded
      : await fetchWithTimeout(request, { cache: "no-cache", credentials: "same-origin" }, NAVIGATION_NETWORK_TIMEOUT_MS);
    if (canStoreResponse(request, response)) await safeCachePut(SHELL_CACHE, request, response);
    return response;
  } catch {
    return (
      (await caches.match(request, { cacheName: SHELL_CACHE }))
      ?? (await caches.match("./index.html", { cacheName: SHELL_CACHE }))
      ?? (await caches.match("./health.html", { cacheName: SHELL_CACHE }))
      ?? Response.error()
    );
  }
}

async function staleWhileRevalidate(request: Request): Promise<Response> {
  const cached = await caches.match(request, { cacheName: RUNTIME_CACHE });
  const network = fetch(request, { credentials: "same-origin" })
    .then(async (response) => {
      if (canStoreResponse(request, response)) await safeCachePut(RUNTIME_CACHE, request, response);
      return response;
    })
    .catch(() => cached ?? Response.error());
  return cached ?? network;
}

async function safeCachePut(cacheName: string, request: Request, response: Response): Promise<void> {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch {
    // A cache write must never turn a successful network response into an app failure.
  }
}

async function fetchWithTimeout(request: Request, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Network timeout", "TimeoutError")), timeoutMs);
  try {
    return await fetch(request, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function canStoreResponse(request: Request, response: Response): boolean {
  if (!isCacheSafeRequest(request) || !response.ok || response.type === "opaque") return false;
  const cacheControl = response.headers.get("cache-control") ?? "";
  return !/(?:^|,)\s*(?:no-store|private)(?:\s|,|$)/i.test(cacheControl);
}

function isCacheSafeRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (url.origin !== serviceWorker.location.origin) return false;
  if (request.headers.has("authorization")) return false;
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEYS.test(key)) return false;
  }
  return true;
}

function isLiveDataPath(pathname: string): boolean {
  return pathname.endsWith("services.json")
    || pathname.endsWith("service-health.json")
    || pathname.endsWith("service-navigation.json");
}

function parseWorkerCommand(value: unknown): WorkerCommand | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { type?: unknown; requestId?: unknown };
  if (record.type === "SKIP_WAITING" || record.type === "CLEAR_DATA_CACHE") return { type: record.type };
  if (record.type !== "GET_VERSION") return null;
  return typeof record.requestId === "string"
    ? { type: "GET_VERSION", requestId: record.requestId }
    : { type: "GET_VERSION" };
}
