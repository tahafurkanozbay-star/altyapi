import type { RawServiceDefinition, ServiceDefinition, ServiceKind } from "../types";
import { asRecord, readArray, readString } from "../platform/runtimeContracts";
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
import {
  discoverTucbsCoverageProfiles,
  loadTucbsCoverageProfiles,
  missingTucbsCoverageKeys,
  saveTucbsCoverageProfiles,
  type TucbsCoverageProfileMap
} from "./tucbsCoverage";

const supportedKinds = new Set<ServiceKind>(["WMS", "WFS", "MapServer", "FeatureServer", "SceneServer"]);
const TUCBS_SCALE_PROBE_KEY = "altyapi:tucbs-scale-probe:v18";
const TUCBS_COVERAGE_PROBE_KEY = "altyapi:tucbs-coverage-probe:v26";

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
  const declared = raw.servisTuruAdi;
  if (supportedKinds.has(declared as ServiceKind)) return declared as ServiceKind;
  const url = raw.tokenUrl.toLowerCase();
  if (url.includes("/featureserver")) return "FeatureServer";
  if (url.includes("/sceneserver")) return "SceneServer";
  if (url.includes("/mapserver")) return "MapServer";
  if (url.includes("/wfs")) return "WFS";
  if (url.includes("/wms")) return "WMS";
  throw new Error(`Desteklenmeyen servis türü: ${raw.servisTuruAdi}`);
}

export function parseServicesDocument(input: unknown): RawServiceDefinition[] {
  const document = asRecord(input);
  if (!document) throw new Error("services.json kök değeri bir nesne olmalıdır.");
  const services = readArray(document, "services");
  if (!services) throw new Error("services.json içinde 'services' dizisi bulunamadı.");

  return services.map((entry, index) => {
    const record = asRecord(entry);
    if (!record) throw new Error(`Servis #${index + 1} nesne olmalıdır.`);

    const ustKurumAdi = requiredString(record, "ustKurumAdi", index);
    const metaveriSahibiKurumAdi = requiredString(record, "metaveriSahibiKurumAdi", index);
    const cografiVeriKatmanAdi = requiredString(record, "cografiVeriKatmanAdi", index);
    const servisTuruAdi = requiredString(record, "servisTuruAdi", index);
    const tokenUrl = requiredString(record, "tokenUrl", index);

    return {
      ustKurumAdi,
      metaveriSahibiKurumAdi,
      cografiVeriKatmanAdi,
      servisTuruAdi,
      tokenUrl
    };
  });
}

export function normalizeService(
  raw: RawServiceDefinition,
  index: number,
  tucbsEndpoints = loadTucbsEndpoints(),
  tucbsScaleProfiles: TucbsScaleProfileMap = loadTucbsScaleProfiles(),
  tucbsCoverageProfiles: TucbsCoverageProfileMap = loadTucbsCoverageProfiles()
): ServiceDefinition {
  const kind = inferKind(raw);
  const displayName = raw.cografiVeriKatmanAdi.trim();
  const runtimeKey = runtimeEndpointKeyFromUrl(raw.tokenUrl);
  const normalizedUrl = normalizeHttpUrl(resolveTucbsRuntimeUrl(raw.tokenUrl, tucbsEndpoints));
  const scaleProfile = runtimeKey ? tucbsScaleProfiles[runtimeKey] : undefined;
  const coverageProfile = runtimeKey ? tucbsCoverageProfiles[runtimeKey] : undefined;
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
    operationalExtent: coverageProfile?.extent,
    operationalMinScale: scaleProfile?.minScale,
    operationalMaxScale: scaleProfile?.maxScale,
    recommendedScale: scaleProfile?.recommendedScale,
    renderScaleSensitive: Boolean(scaleProfile?.minScale || scaleProfile?.maxScale),
    navigationVerifiedAt: newestVerification(scaleProfile?.verifiedAt, coverageProfile?.verifiedAt),
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
  let tucbsCoverageProfiles = loadTucbsCoverageProfiles();

  // Existing approved-IP users should learn provider scale metadata without
  // re-importing their protected JSON. Only numeric scale values are stored.
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

  // v26 migration: learn an unambiguous WGS84 geographic envelope from WMS
  // capabilities and mirror it to the logical WFS peer. This gives TUCBS rows
  // a real operational extent without persisting the protected service URL.
  if (shouldProbeTucbsCoverage(tucbsEndpoints, tucbsCoverageProfiles)) {
    try {
      const report = await discoverTucbsCoverageProfiles(tucbsEndpoints, { timeoutMs: 6_000, concurrency: 5 });
      if (report.discovered > 0) {
        tucbsCoverageProfiles = { ...tucbsCoverageProfiles, ...report.profiles };
        saveTucbsCoverageProfiles(tucbsCoverageProfiles, true);
        markTucbsCoverageProbe(tucbsEndpoints);
      }
    } catch {
      // Coverage discovery is deliberately non-blocking for offline or
      // temporarily unavailable approved-IP sessions.
    }
  }

  const normalized = parseServicesDocument(document).map((service, index) =>
    normalizeService(service, index, tucbsEndpoints, tucbsScaleProfiles, tucbsCoverageProfiles)
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

function shouldProbeTucbsCoverage(endpoints: TucbsEndpointMap, profiles: TucbsCoverageProfileMap): boolean {
  if (missingTucbsCoverageKeys(endpoints, profiles).length === 0) return false;
  try {
    return localStorage.getItem(TUCBS_COVERAGE_PROBE_KEY) !== endpointKeyFingerprint(endpoints);
  } catch {
    return true;
  }
}

function markTucbsCoverageProbe(endpoints: TucbsEndpointMap): void {
  try {
    localStorage.setItem(TUCBS_COVERAGE_PROBE_KEY, endpointKeyFingerprint(endpoints));
  } catch {
    // Storage restrictions must not block the catalogue.
  }
}

function endpointKeyFingerprint(endpoints: TucbsEndpointMap): string {
  return Object.keys(endpoints).sort().join("|");
}

function newestVerification(...values: Array<string | undefined>): string | undefined {
  const valid = values.filter((value): value is string => Boolean(value) && !Number.isNaN(Date.parse(value!)));
  if (!valid.length) return undefined;
  return valid.sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

function requiredString(record: Record<string, unknown>, field: string, index: number): string {
  const value = readString(record, field, { trim: true, nonEmpty: true });
  if (!value) throw new Error(`Servis #${index + 1}: '${field}' eksik veya geçersiz.`);
  return value;
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
