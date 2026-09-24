import type {
  OperationalExtent,
  ServiceDefinition,
  ServiceNavigationProfile,
  ServiceNavigationSnapshot,
  ServiceNavigationSource
} from "../types";

const SOURCES = new Set<ServiceNavigationSource>(["verified-query", "declared-service", "verified-render"]);

export interface OperationalScaleRange {
  minScale?: number;
  maxScale?: number;
  serviceIds: string[];
  compatible: boolean;
}

export async function loadServiceNavigationSnapshot(
  url = "./service-navigation.json",
  signal?: AbortSignal
): Promise<ServiceNavigationSnapshot | null> {
  try {
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return parseServiceNavigationSnapshot(value);
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

export function parseServiceNavigationSnapshot(value: unknown): ServiceNavigationSnapshot {
  if (!value || typeof value !== "object") throw new Error("Servis navigasyon özeti geçersiz.");
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1 || !Array.isArray(input.profiles)) {
    throw new Error("Desteklenmeyen servis navigasyon özeti biçimi.");
  }

  const verifiedAt =
    typeof input.verifiedAt === "string" && !Number.isNaN(Date.parse(input.verifiedAt))
      ? input.verifiedAt
      : new Date(0).toISOString();

  const profiles: ServiceNavigationProfile[] = input.profiles.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (!Number.isInteger(record.index) || typeof record.name !== "string" || typeof record.kind !== "string") return [];
    if (!SOURCES.has(record.source as ServiceNavigationSource)) return [];
    const extent = parseExtent(record.extent);
    if (!extent) return [];

    const minScale = parseScale(record.minScale);
    const maxScale = parseScale(record.maxScale);
    const recommendedScale = parseScale(record.recommendedScale);

    return [{
      index: Number(record.index),
      name: record.name,
      kind: record.kind as ServiceNavigationProfile["kind"],
      extent,
      minScale,
      maxScale,
      recommendedScale,
      renderScaleSensitive: record.renderScaleSensitive === true,
      source: record.source as ServiceNavigationSource,
      note: typeof record.note === "string" ? record.note.slice(0, 260) : undefined
    }];
  });

  return {
    schemaVersion: 1,
    verifiedAt,
    source: typeof input.source === "string" ? input.source.slice(0, 160) : "unknown",
    profiles
  };
}

export function applyServiceNavigationSnapshot(
  services: ServiceDefinition[],
  snapshot: ServiceNavigationSnapshot | null
): ServiceDefinition[] {
  if (!snapshot) return services;

  const profiles = new Map(snapshot.profiles.map((profile) => [profile.index, profile]));
  return services.map((service, index) => {
    const profile = profiles.get(index);
    if (!profile || profile.name !== service.displayName || profile.kind !== service.kind) return service;
    return {
      ...service,
      operationalExtent: profile.extent,
      operationalMinScale: profile.minScale,
      operationalMaxScale: profile.maxScale,
      recommendedScale: profile.recommendedScale,
      renderScaleSensitive: profile.renderScaleSensitive,
      navigationSource: profile.source,
      navigationVerifiedAt: snapshot.verifiedAt
    };
  });
}

export function isOperationalScale(service: ServiceDefinition, scale: number | undefined): boolean {
  if (!Number.isFinite(scale) || !scale || scale <= 0) return true;
  if (service.operationalMinScale && scale > service.operationalMinScale) return false;
  if (service.operationalMaxScale && scale < service.operationalMaxScale) return false;
  return true;
}

export function effectiveOperationalScaleRange(
  services: readonly Pick<ServiceDefinition, "id" | "renderScaleSensitive" | "operationalMinScale" | "operationalMaxScale">[]
): OperationalScaleRange {
  const restricted = services.filter(
    (service) => service.renderScaleSensitive && (service.operationalMinScale || service.operationalMaxScale)
  );
  const minScales = restricted
    .map((service) => service.operationalMinScale)
    .filter((value): value is number => Number.isFinite(value) && Boolean(value));
  const maxScales = restricted
    .map((service) => service.operationalMaxScale)
    .filter((value): value is number => Number.isFinite(value) && Boolean(value));
  const minScale = minScales.length ? Math.min(...minScales) : undefined;
  const maxScale = maxScales.length ? Math.max(...maxScales) : undefined;
  return {
    minScale,
    maxScale,
    serviceIds: restricted.map((service) => service.id),
    compatible: !(minScale && maxScale && maxScale > minScale)
  };
}

export function clampScaleToOperationalRange(scale: number, range: OperationalScaleRange): number {
  if (!Number.isFinite(scale) || scale <= 0 || !range.compatible) return scale;
  if (range.minScale && scale > range.minScale) return range.minScale;
  if (range.maxScale && scale < range.maxScale) return range.maxScale;
  return scale;
}

export function operationalScaleLabel(service: ServiceDefinition): string {
  const min = service.operationalMinScale;
  const max = service.operationalMaxScale;
  if (min && max) return `1:${formatScale(min)} – 1:${formatScale(max)}`;
  if (min) return `1:${formatScale(min)} ve daha yakın`;
  if (max) return `1:${formatScale(max)} ve daha uzak`;
  return "Ölçek kısıtı yok";
}

export function operationalScaleRangeLabel(range: OperationalScaleRange): string {
  if (!range.compatible) return "Uyumsuz ölçek aralığı";
  if (range.minScale && range.maxScale) return `1:${formatScale(range.minScale)} – 1:${formatScale(range.maxScale)}`;
  if (range.minScale) return `1:${formatScale(range.minScale)} ve daha yakın`;
  if (range.maxScale) return `1:${formatScale(range.maxScale)} ve daha uzak`;
  return "Zoom kilidi yok";
}

export function navigationSourceLabel(service: ServiceDefinition): string {
  if (service.navigationSource === "verified-render") return "Canlı render + veri kapsamı";
  if (service.navigationSource === "verified-query") return "Canlı veri kapsamı";
  if (service.navigationSource === "declared-service") return "Servis metadata";
  return "Runtime";
}

export function operationalExtentContains(service: ServiceDefinition, longitude: number, latitude: number): boolean {
  const extent = service.operationalExtent;
  if (!extent || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return true;
  return longitude >= extent.xmin && longitude <= extent.xmax && latitude >= extent.ymin && latitude <= extent.ymax;
}

export function operationalExtentCenter(extent: OperationalExtent): { longitude: number; latitude: number } {
  return {
    longitude: (extent.xmin + extent.xmax) / 2,
    latitude: (extent.ymin + extent.ymax) / 2
  };
}

export function recommendedActivationScale(service: ServiceDefinition): number | undefined {
  if (service.recommendedScale) return service.recommendedScale;
  if (service.operationalMinScale && service.operationalMaxScale) {
    return Math.sqrt(service.operationalMinScale * service.operationalMaxScale);
  }
  if (service.operationalMinScale) return Math.max(1, Math.round(service.operationalMinScale * 0.75));
  if (service.operationalMaxScale) return Math.round(service.operationalMaxScale * 1.25);
  return undefined;
}

export function formatScale(scale: number): string {
  return Math.round(scale).toLocaleString("tr-TR");
}

function parseExtent(value: unknown): OperationalExtent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const xmin = Number(record.xmin);
  const ymin = Number(record.ymin);
  const xmax = Number(record.xmax);
  const ymax = Number(record.ymax);
  if (![xmin, ymin, xmax, ymax].every(Number.isFinite)) return undefined;
  if (record.wkid !== 4326 || xmin >= xmax || ymin >= ymax) return undefined;
  if (xmin < -180 || xmax > 180 || ymin < -90 || ymax > 90) return undefined;
  return { xmin, ymin, xmax, ymax, wkid: 4326 };
}

function parseScale(value: unknown): number | undefined {
  if (value === undefined || value === null || value === 0) return undefined;
  const scale = Number(value);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1_000_000_000) return undefined;
  return Math.round(scale);
}
