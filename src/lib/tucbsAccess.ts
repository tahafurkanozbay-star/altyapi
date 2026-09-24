import type { ServiceKind } from "../types";

const SESSION_KEY = "altyapi:tucbs-endpoints:session:v1";
const PERSISTENT_KEY = "altyapi:tucbs-endpoints:local:v1";
const TUCBS_HOST = "ucbp-api.tucbs.gov.tr";
const MAX_ENDPOINTS = 40;
const MAX_IMPORT_BYTES = 128_000;

export type TucbsEndpointMap = Record<string, string>;

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

export function endpointKeyFor(name: string, kind: ServiceKind | string): string | undefined {
  return knownEndpointKeys.get(`${name.trim().toLocaleUpperCase("tr-TR")}|${String(kind).toUpperCase()}`);
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
