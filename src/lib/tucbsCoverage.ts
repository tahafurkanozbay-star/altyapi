import type { OperationalExtent } from "../types";
import type { TucbsEndpointMap } from "./tucbsAccess";

const SESSION_KEY = "altyapi:tucbs-coverage:session:v26";
const PERSISTENT_KEY = "altyapi:tucbs-coverage:local:v26";
const MAX_PROFILES = 20;

export type TucbsCoverageProfileSource = "wms-capabilities" | "paired-wms-capabilities";

export interface TucbsCoverageProfile {
  extent: OperationalExtent;
  verifiedAt: string;
  source: TucbsCoverageProfileSource;
}

export type TucbsCoverageProfileMap = Record<string, TucbsCoverageProfile>;

export interface TucbsCoverageDiscoveryReport {
  total: number;
  discovered: number;
  failed: number;
  profiles: TucbsCoverageProfileMap;
}

export function loadTucbsCoverageProfiles(): TucbsCoverageProfileMap {
  return {
    ...readStoredProfiles(PERSISTENT_KEY, localStorageSafe()),
    ...readStoredProfiles(SESSION_KEY, sessionStorageSafe())
  };
}

export function saveTucbsCoverageProfiles(profiles: TucbsCoverageProfileMap, remember: boolean): void {
  const sanitized = sanitizeCoverageProfileMap(profiles);
  const serialized = JSON.stringify(sanitized);
  const session = sessionStorageSafe();
  if (session) safeSet(session, SESSION_KEY, serialized);

  const local = localStorageSafe();
  if (!local) return;
  if (remember) safeSet(local, PERSISTENT_KEY, serialized);
  else safeRemove(local, PERSISTENT_KEY);
}

export function clearTucbsCoverageProfiles(): void {
  const session = sessionStorageSafe();
  const local = localStorageSafe();
  if (session) safeRemove(session, SESSION_KEY);
  if (local) safeRemove(local, PERSISTENT_KEY);
}

/**
 * Reads a conservative WGS84 extent from WMS capabilities. EX_GeographicBoundingBox
 * is preferred because its axis order is unambiguous in WMS 1.3.0. Older
 * LatLonBoundingBox metadata is used only as a fallback. When a document exposes
 * multiple boxes, the smallest valid box is selected as the most specific layer
 * coverage instead of the broader service envelope.
 */
export function extractWmsGeographicExtent(xml: string): OperationalExtent | undefined {
  const exBoxes = [...xml.matchAll(/<EX_GeographicBoundingBox(?:\s[^>]*)?>([\s\S]*?)<\/EX_GeographicBoundingBox>/gi)]
    .map((match) => {
      const block = match[1] ?? "";
      return normalizedExtent(
        tagNumber(block, "westBoundLongitude"),
        tagNumber(block, "southBoundLatitude"),
        tagNumber(block, "eastBoundLongitude"),
        tagNumber(block, "northBoundLatitude")
      );
    })
    .filter((extent): extent is OperationalExtent => Boolean(extent));
  if (exBoxes.length) return smallestExtent(exBoxes);

  const legacyBoxes = [...xml.matchAll(/<LatLonBoundingBox\b([^>]*)\/?\s*>/gi)]
    .map((match) => {
      const attributes = match[1] ?? "";
      return normalizedExtent(
        attributeNumber(attributes, "minx"),
        attributeNumber(attributes, "miny"),
        attributeNumber(attributes, "maxx"),
        attributeNumber(attributes, "maxy")
      );
    })
    .filter((extent): extent is OperationalExtent => Boolean(extent));
  return legacyBoxes.length ? smallestExtent(legacyBoxes) : undefined;
}

export async function discoverTucbsCoverageProfiles(
  endpoints: TucbsEndpointMap,
  options: { timeoutMs?: number; concurrency?: number } = {}
): Promise<TucbsCoverageDiscoveryReport> {
  const entries = Object.entries(endpoints).filter(([key]) => key.endsWith(".wms"));
  const timeoutMs = clampInteger(options.timeoutMs ?? 10_000, 3_000, 30_000);
  const concurrency = clampInteger(options.concurrency ?? 3, 1, 5);

  const rows = await mapWithConcurrency(entries, concurrency, async ([key, rawUrl]) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const target = capabilitiesUrl(rawUrl);
      const response = await fetch(target, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "follow",
        signal: controller.signal,
        headers: { Accept: "application/xml,text/xml,*/*" }
      });
      if (!response.ok) return { key, extent: undefined };
      const text = await response.text();
      if (/ServiceException|ExceptionReport|ExceptionText|ows:Exception/i.test(text)) {
        return { key, extent: undefined };
      }
      if (!/WMS_Capabilities|WMT_MS_Capabilities/i.test(text)) {
        return { key, extent: undefined };
      }
      return { key, extent: extractWmsGeographicExtent(text) };
    } catch {
      return { key, extent: undefined };
    } finally {
      clearTimeout(timer);
    }
  });

  const verifiedAt = new Date().toISOString();
  const profiles: TucbsCoverageProfileMap = {};
  for (const row of rows) {
    if (!row.extent) continue;
    profiles[row.key] = { extent: row.extent, verifiedAt, source: "wms-capabilities" };
    const peerKey = row.key.replace(/\.wms$/, ".wfs");
    if (endpoints[peerKey]) {
      profiles[peerKey] = { extent: row.extent, verifiedAt, source: "paired-wms-capabilities" };
    }
  }

  const sanitized = sanitizeCoverageProfileMap(profiles);
  return {
    total: entries.length,
    discovered: Object.keys(sanitized).filter((key) => key.endsWith(".wms")).length,
    failed: Math.max(0, entries.length - Object.keys(sanitized).filter((key) => key.endsWith(".wms")).length),
    profiles: sanitized
  };
}

export function missingTucbsCoverageKeys(
  endpoints: TucbsEndpointMap,
  profiles: TucbsCoverageProfileMap
): string[] {
  return Object.keys(endpoints)
    .filter((key) => key.endsWith(".wms"))
    .filter((key) => !profiles[key]?.extent);
}

function capabilitiesUrl(value: string): string {
  const target = new URL(value);
  target.searchParams.set("SERVICE", "WMS");
  target.searchParams.set("REQUEST", "GetCapabilities");
  target.searchParams.set("VERSION", "1.3.0");
  return target.toString();
}

function sanitizeCoverageProfileMap(value: TucbsCoverageProfileMap): TucbsCoverageProfileMap {
  const output: TucbsCoverageProfileMap = {};
  let count = 0;
  for (const [key, raw] of Object.entries(value)) {
    if (!/^tucbs\.[a-z0-9-]+\.(?:wms|wfs)$/.test(key) || !raw || typeof raw !== "object") continue;
    const extent = normalizedExtent(
      raw.extent?.xmin,
      raw.extent?.ymin,
      raw.extent?.xmax,
      raw.extent?.ymax
    );
    if (!extent) continue;
    const verifiedAt = typeof raw.verifiedAt === "string" && !Number.isNaN(Date.parse(raw.verifiedAt))
      ? raw.verifiedAt
      : new Date(0).toISOString();
    const source = raw.source === "paired-wms-capabilities" ? "paired-wms-capabilities" : "wms-capabilities";
    output[key] = { extent, verifiedAt, source };
    count += 1;
    if (count >= MAX_PROFILES) break;
  }
  return output;
}

function normalizedExtent(
  xminValue: unknown,
  yminValue: unknown,
  xmaxValue: unknown,
  ymaxValue: unknown
): OperationalExtent | undefined {
  const xmin = finiteNumber(xminValue);
  const ymin = finiteNumber(yminValue);
  const xmax = finiteNumber(xmaxValue);
  const ymax = finiteNumber(ymaxValue);
  if (xmin === undefined || ymin === undefined || xmax === undefined || ymax === undefined) return undefined;
  if (xmin >= xmax || ymin >= ymax) return undefined;
  if (xmin < -180 || xmax > 180 || ymin < -90 || ymax > 90) return undefined;
  return { xmin, ymin, xmax, ymax, wkid: 4326 };
}

function smallestExtent(extents: OperationalExtent[]): OperationalExtent {
  return [...extents].sort((left, right) => extentArea(left) - extentArea(right))[0]!;
}

function extentArea(extent: OperationalExtent): number {
  return (extent.xmax - extent.xmin) * (extent.ymax - extent.ymin);
}

function tagNumber(block: string, tagName: string): number | undefined {
  const pattern = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${tagName}(?:\\s[^>]*)?>([^<]+)</(?:[A-Za-z0-9_-]+:)?${tagName}>`, "i");
  return finiteNumber(block.match(pattern)?.[1]);
}

function attributeNumber(attributes: string, name: string): number | undefined {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i");
  return finiteNumber(attributes.match(pattern)?.[1]);
}

function finiteNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
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

function readStoredProfiles(key: string, storage: Storage | null): TucbsCoverageProfileMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return sanitizeCoverageProfileMap(parsed as TucbsCoverageProfileMap);
  } catch {
    return {};
  }
}

function localStorageSafe(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

function sessionStorageSafe(): Storage | null {
  try { return typeof sessionStorage === "undefined" ? null : sessionStorage; } catch { return null; }
}

function safeSet(storage: Storage, key: string, value: string): void {
  try { storage.setItem(key, value); } catch { /* storage can be blocked */ }
}

function safeRemove(storage: Storage, key: string): void {
  try { storage.removeItem(key); } catch { /* storage can be blocked */ }
}
