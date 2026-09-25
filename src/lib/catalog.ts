import type { RawServiceDefinition, ServiceDefinition, ServiceKind } from "../types";
import {
  loadTucbsEndpoints,
  loadTucbsScaleProfiles,
  resolveTucbsRuntimeUrl,
  runtimeEndpointKeyFromUrl,
  saveTucbsScaleProfiles,
  verifyTucbsEndpoints,
  type TucbsEndpointMap,
  type TucbsScaleProfileMap
} from "./tucbsAccess";

const supportedKinds = new Set<ServiceKind>(["WMS", "WFS", "MapServer", "FeatureServer", "SceneServer"]);
const requiredFields = ["ustKurumAdi", "metaveriSahibiKurumAdi", "cografiVeriKatmanAdi", "servisTuruAdi", "tokenUrl"] as const;
const TUCBS_SCALE_PROBE_KEY = "altyapi:tucbs-scale-probe:v18";

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function inferKind(raw: RawServiceDefinition): ServiceKind {
  const declared = raw.servisTuruAdi as ServiceKind;
  if (supportedKinds.has(declared)) return declared;
  const url = raw.tokenUrl.toLowerCase();
  if (url.includes("/featureserver")) return "FeatureServer";
  if (url.includes("/sceneserver")) return "SceneServer";
  if (url.includes("/mapserver")) return "MapServer";
  if (url.includes("/wfs")) return "WFS";
  if (url.includes("/wms")) return "WMS";
  throw new Error(`Desteklenmeyen servis türü: ${raw.servisTuruAdi}`);
}

export function parseServicesDocument(input: unknown): RawServiceDefinition[] {
  if (!input || typeof input !== "object" || !("services" in input)) {
    throw new Error("services.json içinde 'services' dizisi bulunamadı.");
  }
  const services = (input as { services?: unknown }).services;
  if (!Array.isArray(services)) throw new Error("services.json içindeki 'services' bir dizi olmalıdır.");

  return services.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`Servis #${index + 1} nesne olmalıdır.`);
    const record = entry as Record<string, unknown>;
    for (const field of requiredFields) {
      if (typeof record[field] !== "string" || !record[field].trim()) {
        throw new Error(`Servis #${index + 1}: '${field}' eksik veya geçersiz.`);
      }
    }
    return record as unknown as RawServiceDefinition;
  });
}

export function normalizeService(
  raw: RawServiceDefinition,
  index: number,
  tucbsEndpoints = loadTucbsEndpoints(),
  tucbsScaleProfiles: TucbsScaleProfileMap = loadTucbsScaleProfiles()
): ServiceDefinition {
  const kind = inferKind(raw);
  const displayName = raw.cografiVeriKatmanAdi.trim();
  const runtimeKey = runtimeEndpointKeyFromUrl(raw.tokenUrl);
  const normalizedUrl = normalizeHttpUrl(resolveTucbsRuntimeUrl(raw.tokenUrl, tucbsEndpoints));
  const scaleProfile = runtimeKey ? tucbsScaleProfiles[runtimeKey] : undefined;
  const identityTarget = runtimeKey ? `tucbs-runtime:${runtimeKey}` : safeUrlIdentity(normalizedUrl);
  const identity = `${raw.ustKurumAdi.trim()}|${displayName}|${kind}|${identityTarget}|${index}`;
  const prefix = slugify(displayName).slice(0, 48) || "layer";
  return {
    ...raw,
    id: `${prefix}-${kind.toLowerCase()}-${fnv1a(identity)}`,
    kind,
    displayName,
    organization: raw.ustKurumAdi.trim(),
    owner: raw.metaveriSahibiKurumAdi.trim(),
    url: normalizedUrl,
    tokenUrl: normalizedUrl,
    status: "idle",
    visible: false,
    opacity: 1,
    favorite: false,
    availability: "unknown",
    access: "unknown",
    failureCount: 0,
    operationalMinScale: scaleProfile?.minScale,
    operationalMaxScale: scaleProfile?.maxScale,
    recommendedScale: scaleProfile?.recommendedScale,
    renderScaleSensitive: Boolean(scaleProfile?.minScale || scaleProfile?.maxScale),
    navigationVerifiedAt: scaleProfile?.verifiedAt,
    alternateEndpoints: []
  };
}

/**
 * WMS and WFS entries in the catalogue often describe the same real-world
 * dataset through two OGC representations. Keep every catalogue row visible,
 * but give the runtime a safe peer endpoint to use when one representation is
 * temporarily unavailable or rejected by the provider.
 */
export function attachSemanticAlternates(services: ServiceDefinition[]): ServiceDefinition[] {
  const groups = new Map<string, ServiceDefinition[]>();
  for (const service of services) {
    const key = [service.organization, service.owner, service.displayName]
      .map((value) => slugify(value))
      .join("|");
    const bucket = groups.get(key) ?? [];
    bucket.push(service);
    groups.set(key, bucket);
  }

  return services.map((service) => {
    const key = [service.organization, service.owner, service.displayName]
      .map((value) => slugify(value))
      .join("|");
    const peers = groups.get(key) ?? [];
    const alternateEndpoints = peers
      .filter((peer) => peer.id !== service.id && isInterchangeableOgcPair(service.kind, peer.kind))
      .map((peer) => ({ kind: peer.kind, url: peer.url, sourceServiceId: peer.id }));
    return { ...service, alternateEndpoints };
  });
}

export async function loadServiceCatalog(url = "./services.json", signal?: AbortSignal): Promise<ServiceDefinition[]> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Servis kataloğu yüklenemedi (HTTP ${response.status}).`);
  const document: unknown = await response.json();
  const tucbsEndpoints = loadTucbsEndpoints();
  let tucbsScaleProfiles = loadTucbsScaleProfiles();

  // v18 migration: users who already configured approved-IP TUCBS endpoints in
  // v16/v17 should not have to import the same protected JSON again. One
  // client-side capabilities pass learns provider scale declarations, stores
  // only numeric scale metadata, and never persists the signed URL in reports.
  if (shouldProbeTucbsScales(tucbsEndpoints, tucbsScaleProfiles)) {
    try {
      const report = await verifyTucbsEndpoints(tucbsEndpoints, { timeoutMs: 6_000, concurrency: 5 });
      if (report.verified > 0) {
        tucbsScaleProfiles = { ...tucbsScaleProfiles, ...report.scaleProfiles };
        saveTucbsScaleProfiles(tucbsScaleProfiles, true);
        markTucbsScaleProbe(tucbsEndpoints);
      }
    } catch {
      // Scale discovery is an enhancement; catalog loading must remain usable
      // even if the approved network is temporarily unavailable.
    }
  }

  const normalized = parseServicesDocument(document).map((service, index) =>
    normalizeService(service, index, tucbsEndpoints, tucbsScaleProfiles)
  );
  return attachSemanticAlternates(normalized);
}

export function serviceMatches(service: ServiceDefinition, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase("tr-TR");
  if (!needle) return true;
  return [service.displayName, service.organization, service.owner, service.kind]
    .join(" ")
    .toLocaleLowerCase("tr-TR")
    .includes(needle);
}

export function hostLabel(url: string): string {
  const runtimeKey = runtimeEndpointKeyFromUrl(url);
  if (runtimeKey) return "TUCBS · yetkili servis adresi bu tarayıcıda tanımlı değil";
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/[a-zA-Z0-9._~-]{60,}(?=\/|$)/g, "/••••");
    return `${parsed.hostname}${path.length > 62 ? `${path.slice(0, 59)}…` : path}`;
  } catch {
    return "Geçersiz URL";
  }
}

function shouldProbeTucbsScales(endpoints: TucbsEndpointMap, profiles: TucbsScaleProfileMap): boolean {
  const keys = Object.keys(endpoints).filter((key) => key.endsWith(".wms") || key.endsWith(".wfs"));
  if (keys.length === 0 || Object.keys(profiles).length > 0) return false;
  try {
    return localStorage.getItem(TUCBS_SCALE_PROBE_KEY) !== endpointKeyFingerprint(endpoints);
  } catch {
    return true;
  }
}

function markTucbsScaleProbe(endpoints: TucbsEndpointMap): void {
  try {
    localStorage.setItem(TUCBS_SCALE_PROBE_KEY, endpointKeyFingerprint(endpoints));
  } catch {
    // Private browsing/storage restrictions must not break the map.
  }
}

function endpointKeyFingerprint(endpoints: TucbsEndpointMap): string {
  return Object.keys(endpoints).sort().join("|");
}

function isInterchangeableOgcPair(left: ServiceKind, right: ServiceKind): boolean {
  return (left === "WMS" && right === "WFS") || (left === "WFS" && right === "WMS");
}

function normalizeHttpUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Desteklenmeyen servis URL protokolü: ${parsed.protocol}`);
  }
  return parsed.toString();
}

function safeUrlIdentity(value: string): string {
  const parsed = new URL(value);
  return `${parsed.origin}${parsed.pathname}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}
