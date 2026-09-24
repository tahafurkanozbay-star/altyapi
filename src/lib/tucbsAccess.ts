import type { ServiceKind } from "../types";

const SESSION_KEY = "altyapi:tucbs-endpoints:session:v1";
const PERSISTENT_KEY = "altyapi:tucbs-endpoints:local:v1";
const TUCBS_HOST = "ucbp-api.tucbs.gov.tr";
const RUNTIME_PREFIX = `https://${TUCBS_HOST}/__runtime__/`;
const MAX_ENDPOINTS = 40;
const MAX_IMPORT_BYTES = 128_000;

export type TucbsEndpointMap = Record<string, string>;

export interface TucbsEndpointVerification {
  key: string;
  ok: boolean;
  latencyMs?: number;
  reason?: string;
}

export interface TucbsVerificationReport {
  total: number;
  verified: number;
  failed: number;
  results: TucbsEndpointVerification[];
}

const knownEndpointKeys = new Map<string, string>([
  ["DOĞALGAZ DAĞITIM İSTASYONU|WMS", "tucbs.dogalgaz-dagitim-istasyonu.wms"],
  ["DOĞALGAZ DAĞITIM İSTASYONU|WFS", "tucbs.dogalgaz-dagitim-istasyonu.wfs"],
  ["DOĞALGAZ DEPOLAMA TESİSİ|WMS", "tucbs.dogalgaz-depolama-tesisi.wms"],
  ["DOĞALGAZ DEPOLAMA TESİSİ|WFS", "tucbs.dogalgaz-depolama-tesisi.wfs"],
  ["DOĞALGAZ HATTI|WMS", "tucbs.dogalgaz-hatti.wms"],
  ["DOĞALGAZ HATTI|WFS", "tucbs.dogalgaz-hatti.wfs"],
  ["DOĞALGAZ SERVİS KUTUSU|WMS", "tucbs.dogalgaz-servis-kutusu.wms"],
  ["DOĞALGAZ SERVİS KUTUSU|WFS", "tucbs.dogalgaz-servis-kutusu.wfs"],
  ["DOĞALGAZ VANA|WMS", "tucbs.dogalgaz-vana.wms"],
  ["DOĞALGAZ VANA|WFS", "tucbs.dogalgaz-vana.wfs"]
]);

export function loadTucbsEndpoints(): TucbsEndpointMap {
  return {
    ...readStoredMap(PERSISTENT_KEY, localStorageSafe()),
    ...readStoredMap(SESSION_KEY, sessionStorageSafe())
  };
}

export function saveTucbsEndpoints(endpoints: TucbsEndpointMap, remember: boolean): void {
  const sanitized = sanitizeEndpointMap(endpoints);
  const serialized = JSON.stringify(sanitized);
  const session = sessionStorageSafe();
  if (session) safeSet(session, SESSION_KEY, serialized);

  const local = localStorageSafe();
  if (!local) return;
  if (remember) safeSet(local, PERSISTENT_KEY, serialized);
  else safeRemove(local, PERSISTENT_KEY);
}

export function clearTucbsEndpoints(): void {
  const session = sessionStorageSafe();
  const local = localStorageSafe();
  if (session) safeRemove(session, SESSION_KEY);
  if (local) safeRemove(local, PERSISTENT_KEY);
}

export function parseTucbsEndpointImport(text: string): TucbsEndpointMap {
  if (!text.trim()) throw new Error("TUCBS servis dosyası boş.");
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
    throw new Error("TUCBS servis dosyası beklenenden büyük.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("TUCBS servis dosyası geçerli JSON değil.");
  }

  const endpoints: TucbsEndpointMap = {};
  if (isRecord(parsed) && isRecord(parsed.endpoints)) {
    for (const [key, value] of Object.entries(parsed.endpoints)) {
      if (typeof value === "string") endpoints[key] = value;
    }
  }

  if (isRecord(parsed) && Array.isArray(parsed.services)) {
    for (const raw of parsed.services) {
      if (!isRecord(raw)) continue;
      const url = typeof raw.tokenUrl === "string" ? raw.tokenUrl : typeof raw.url === "string" ? raw.url : undefined;
      if (!url) continue;

      let endpointKey = typeof raw.endpointKey === "string" ? raw.endpointKey : undefined;
      if (!endpointKey && typeof raw.cografiVeriKatmanAdi === "string" && typeof raw.servisTuruAdi === "string") {
        endpointKey = endpointKeyFor(raw.cografiVeriKatmanAdi, raw.servisTuruAdi as ServiceKind);
      }
      if (endpointKey) endpoints[endpointKey] = url;
    }
  }

  const sanitized = sanitizeEndpointMap(endpoints);
  if (Object.keys(sanitized).length === 0) {
    throw new Error("Dosyada desteklenen TUCBS WMS/WFS servis adresi bulunamadı.");
  }
  return sanitized;
}

/**
 * Verifies imported TUCBS endpoints from the actual browser. This matters for
 * installations restricted by source IP: a GitHub runner cannot prove that an
 * endpoint reachable from the approved citizen/operator network is healthy.
 * Returned diagnostics intentionally never include the signed endpoint URL.
 */
export async function verifyTucbsEndpoints(
  endpoints: TucbsEndpointMap,
  options: { timeoutMs?: number; concurrency?: number } = {}
): Promise<TucbsVerificationReport> {
  const sanitized = sanitizeEndpointMap(endpoints);
  const entries = Object.entries(sanitized);
  const timeoutMs = clampInteger(options.timeoutMs ?? 12_000, 3_000, 30_000);
  const concurrency = clampInteger(options.concurrency ?? 3, 1, 6);

  const results = await mapWithConcurrency(entries, concurrency, async ([key, url]) => {
    const startedAt = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const target = tucbsCapabilitiesUrl(key, url);
      const response = await fetch(target, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "follow",
        signal: controller.signal,
        headers: { Accept: "application/xml,text/xml,*/*" }
      });
      const text = await response.text();
      const latencyMs = Math.round(performance.now() - startedAt);

      if (!response.ok) {
        return { key, ok: false, latencyMs, reason: `HTTP ${response.status}` } satisfies TucbsEndpointVerification;
      }
      if (/ServiceException|ExceptionReport|ExceptionText|ows:Exception/i.test(text)) {
        return { key, ok: false, latencyMs, reason: "OGC servis hata yanıtı döndürdü" } satisfies TucbsEndpointVerification;
      }

      const valid = key.endsWith(".wms")
        ? /WMS_Capabilities|WMT_MS_Capabilities/i.test(text)
        : /WFS_Capabilities/i.test(text);
      return valid
        ? { key, ok: true, latencyMs } satisfies TucbsEndpointVerification
        : { key, ok: false, latencyMs, reason: "Capabilities yanıtı beklenen OGC biçiminde değil" } satisfies TucbsEndpointVerification;
    } catch (error) {
      const latencyMs = Math.round(performance.now() - startedAt);
      const reason = error instanceof DOMException && error.name === "AbortError"
        ? "Zaman aşımı"
        : "Tarayıcıdan ağ erişimi kurulamadı";
      return { key, ok: false, latencyMs, reason } satisfies TucbsEndpointVerification;
    } finally {
      clearTimeout(timer);
    }
  });

  return {
    total: results.length,
    verified: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results
  };
}

export function endpointKeyFor(name: string, kind: ServiceKind | string): string | undefined {
  return knownEndpointKeys.get(`${name.trim().toLocaleUpperCase("tr-TR")}|${String(kind).toUpperCase()}`);
}

export function runtimeTucbsUrl(endpointKey: string): string {
  if (!isTucbsEndpointKey(endpointKey)) throw new Error("Geçersiz TUCBS endpoint anahtarı.");
  return `${RUNTIME_PREFIX}${encodeURIComponent(endpointKey)}`;
}

export function runtimeEndpointKeyFromUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== TUCBS_HOST) return undefined;
    if (!parsed.pathname.startsWith("/__runtime__/")) return undefined;
    const rawKey = decodeURIComponent(parsed.pathname.slice("/__runtime__/".length));
    return isTucbsEndpointKey(rawKey) ? rawKey : undefined;
  } catch {
    return undefined;
  }
}

export function resolveTucbsRuntimeUrl(value: string, endpoints = loadTucbsEndpoints()): string {
  const endpointKey = runtimeEndpointKeyFromUrl(value);
  if (!endpointKey) return value;
  return endpoints[endpointKey] ?? value;
}

export function isUnconfiguredTucbsUrl(value: string): boolean {
  return runtimeEndpointKeyFromUrl(value) !== undefined;
}

export function isDirectTucbsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname.toLowerCase() === TUCBS_HOST && /^\/geoservice\/spatial\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isTucbsEndpointKey(value: string): boolean {
  return /^tucbs\.[a-z0-9-]+\.(?:wms|wfs)$/.test(value);
}

export function sanitizeTucbsUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "https:") throw new Error("TUCBS servis adresi HTTPS olmalıdır.");
  if (parsed.hostname.toLowerCase() !== TUCBS_HOST) {
    throw new Error(`TUCBS servis adresi ${TUCBS_HOST} alanında olmalıdır.`);
  }
  if (!/^\/geoservice\/spatial\//i.test(parsed.pathname)) {
    throw new Error("TUCBS servis adresi beklenen /geoservice/spatial/ yolunda değil.");
  }
  if (parsed.username || parsed.password) throw new Error("TUCBS URL içinde kullanıcı adı/parola bulunamaz.");
  parsed.hash = "";
  return parsed.toString();
}

function tucbsCapabilitiesUrl(key: string, value: string): string {
  const target = new URL(value);
  target.searchParams.set("SERVICE", key.endsWith(".wms") ? "WMS" : "WFS");
  target.searchParams.set("REQUEST", "GetCapabilities");
  target.searchParams.set("VERSION", key.endsWith(".wms") ? "1.3.0" : "2.0.0");
  return target.toString();
}

function sanitizeEndpointMap(value: TucbsEndpointMap): TucbsEndpointMap {
  const output: TucbsEndpointMap = {};
  let count = 0;
  for (const [key, rawUrl] of Object.entries(value)) {
    if (!isTucbsEndpointKey(key) || typeof rawUrl !== "string") continue;
    output[key] = sanitizeTucbsUrl(rawUrl);
    count += 1;
    if (count >= MAX_ENDPOINTS) break;
  }
  return output;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readStoredMap(key: string, storage: Storage | null): TucbsEndpointMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    return sanitizeEndpointMap(Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string")) as TucbsEndpointMap);
  } catch {
    return {};
  }
}

function localStorageSafe(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function sessionStorageSafe(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, key: string, value: string): void {
  try { storage.setItem(key, value); } catch { /* Tarayıcı depolaması kapalı olabilir. */ }
}

function safeRemove(storage: Storage, key: string): void {
  try { storage.removeItem(key); } catch { /* Tarayıcı depolaması kapalı olabilir. */ }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
