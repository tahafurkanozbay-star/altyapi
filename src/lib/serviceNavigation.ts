import type {
  OperationalExtent,
  ServiceDefinition,
  ServiceKind,
  ServiceNavigationProfile,
  ServiceNavigationSnapshot,
  ServiceNavigationSource
} from "../types";
import {
  asRecord,
  readArray,
  readBoolean,
  readEnum,
  readFiniteNumber,
  readIsoDate,
  readString
} from "../platform/runtimeContracts";

const SOURCES = new Set<ServiceNavigationSource>(["verified-query", "declared-service", "verified-render"]);
const SERVICE_KINDS = new Set<ServiceKind>(["WMS", "WFS", "MapServer", "FeatureServer", "SceneServer"]);
const SCALE_BOUNDARY_INSET = 0.015;

export interface ActiveOperationalScaleRange {
  minScale?: number;
  maxScale?: number;
  constrainedServiceIds: string[];
  conflict: boolean;
}

export interface ResolvedOperationalScaleRange extends ActiveOperationalScaleRange {
  fallbackServiceId?: string;
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
  const input = asRecord(value);
  if (!input) throw new Error("Servis navigasyon özeti geçersiz.");
  const profilesInput = readArray(input, "profiles");
  if (input.schemaVersion !== 1 || !profilesInput) {
    throw new Error("Desteklenmeyen servis navigasyon özeti biçimi.");
  }

  const verifiedAt = readIsoDate(input, "verifiedAt") ?? new Date(0).toISOString();
  const profiles: ServiceNavigationProfile[] = profilesInput.flatMap((entry) => {
    const record = asRecord(entry);
    if (!record) return [];

    const index = readFiniteNumber(record, "index", { min: 0, integer: true });
    const name = readString(record, "name", { trim: true, nonEmpty: true, maxLength: 240 });
    const kind = readEnum(record, "kind", SERVICE_KINDS);
    const source = readEnum(record, "source", SOURCES);
    const extent = parseExtent(record.extent);
    if (index === undefined || !name || !kind || !source || !extent) return [];

    return [{
      index,
      name,
      kind,
      extent,
      minScale: parseScale(record.minScale),
      maxScale: parseScale(record.maxScale),
      recommendedScale: parseScale(record.recommendedScale),
      renderScaleSensitive: readBoolean(record, "renderScaleSensitive") === true,
      source,
      note: readString(record, "note", { maxLength: 260 })
    }];
  });

  return {
    schemaVersion: 1,
    verifiedAt,
    source: readString(input, "source", { maxLength: 160 }) ?? "unknown",
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
      operationalMinScale: profile.minScale ?? service.operationalMinScale,
      operationalMaxScale: profile.maxScale ?? service.operationalMaxScale,
      recommendedScale: profile.recommendedScale ?? service.recommendedScale,
      renderScaleSensitive: profile.renderScaleSensitive || service.renderScaleSensitive,
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

export function operationalScaleLabel(service: ServiceDefinition): string {
  const min = service.operationalMinScale;
  const max = service.operationalMaxScale;
  if (min && max) return `1:${formatScale(min)} – 1:${formatScale(max)}`;
  if (min) return `1:${formatScale(min)} ve daha yakın`;
  if (max) return `1:${formatScale(max)} ve daha uzak`;
  return "Ölçek kısıtı yok";
}

export function navigationSourceLabel(service: ServiceDefinition): string {
  if (service.navigationSource === "verified-render") return "Canlı render + veri kapsamı";
  if (service.navigationSource === "verified-query") return "Canlı veri kapsamı";
  if (service.navigationSource === "declared-service") return "Servis metadata";
  return service.navigationVerifiedAt ? "Yetkili istemci servis metadata" : "Runtime";
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
  if (service.recommendedScale) return clampRecommended(service.recommendedScale, service.operationalMinScale, service.operationalMaxScale);
  if (service.operationalMinScale && service.operationalMaxScale) {
    return Math.sqrt(service.operationalMinScale * service.operationalMaxScale);
  }
  if (service.operationalMinScale) return Math.max(1, Math.round(service.operationalMinScale * 0.75));
  if (service.operationalMaxScale) return Math.round(service.operationalMaxScale * 1.25);
  return undefined;
}

export function hasOperationalScaleConstraint(service: ServiceDefinition): boolean {
  return Boolean(service.operationalMinScale || service.operationalMaxScale);
}

export function activeOperationalScaleRange(services: ServiceDefinition[]): ActiveOperationalScaleRange {
  const constrained = services.filter(hasOperationalScaleConstraint);
  const minScales = constrained
    .map((service) => service.operationalMinScale)
    .filter((value): value is number => Number.isFinite(value) && Boolean(value));
  const maxScales = constrained
    .map((service) => service.operationalMaxScale)
    .filter((value): value is number => Number.isFinite(value) && Boolean(value));

  // ArcGIS terminology is intentionally counter-intuitive:
  // minScale is the largest allowed denominator (furthest zoom-out), while
  // maxScale is the smallest allowed denominator (closest zoom-in).
  // The strict intersection therefore uses the smallest minScale and largest maxScale.
  const minScale = minScales.length ? Math.min(...minScales) : undefined;
  const maxScale = maxScales.length ? Math.max(...maxScales) : undefined;

  return {
    minScale,
    maxScale,
    constrainedServiceIds: constrained.map((service) => service.id),
    conflict: Boolean(minScale && maxScale && maxScale > minScale)
  };
}

export function resolveOperationalScaleRange(
  activeServices: ServiceDefinition[],
  candidate?: ServiceDefinition
): ResolvedOperationalScaleRange {
  const ordered = activeServices.filter((service) => service.id !== candidate?.id);
  if (candidate) ordered.push(candidate);

  const range = activeOperationalScaleRange(ordered);
  if (!range.conflict) return range;

  const latest = [...ordered].reverse().find(hasOperationalScaleConstraint);
  if (!latest) return range;
  const fallback = activeOperationalScaleRange([latest]);
  return {
    ...fallback,
    conflict: true,
    constrainedServiceIds: range.constrainedServiceIds,
    fallbackServiceId: latest.id
  };
}

/**
 * Clamps a scale into the active operational intersection. When the user crosses
 * a provider boundary we land slightly inside the valid interval instead of on
 * the exact denominator. This avoids floating-point/view-animation jitter that
 * can leave ArcGIS or an OGC server one fraction outside its declared range.
 */
export function clampScaleToOperationalRange(
  scale: number,
  range: Pick<ActiveOperationalScaleRange, "minScale" | "maxScale">
): number {
  if (!Number.isFinite(scale) || scale <= 0) return scale;

  if (range.minScale && scale > range.minScale) {
    const inset = Math.round(range.minScale * (1 - SCALE_BOUNDARY_INSET));
    return safeInset(inset, range.minScale, range.maxScale);
  }
  if (range.maxScale && scale < range.maxScale) {
    const inset = Math.round(range.maxScale * (1 + SCALE_BOUNDARY_INSET));
    return safeInset(inset, range.minScale, range.maxScale);
  }
  return scale;
}

export function formatScale(scale: number): string {
  return Math.round(scale).toLocaleString("tr-TR");
}

function safeInset(value: number, minScale?: number, maxScale?: number): number {
  if (minScale && maxScale && (value > minScale || value < maxScale)) {
    return Math.round(Math.sqrt(minScale * maxScale));
  }
  if (minScale && value > minScale) return minScale;
  if (maxScale && value < maxScale) return maxScale;
  return Math.max(1, value);
}

function clampRecommended(value: number, minScale?: number, maxScale?: number): number {
  let result = value;
  if (minScale && result > minScale) result = minScale;
  if (maxScale && result < maxScale) result = maxScale;
  return Math.max(1, Math.round(result));
}

function parseExtent(value: unknown): OperationalExtent | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const xmin = readFiniteNumber(record, "xmin");
  const ymin = readFiniteNumber(record, "ymin");
  const xmax = readFiniteNumber(record, "xmax");
  const ymax = readFiniteNumber(record, "ymax");
  if (xmin === undefined || ymin === undefined || xmax === undefined || ymax === undefined) return undefined;
  if (record.wkid !== 4326 || xmin >= xmax || ymin >= ymax) return undefined;
  if (xmin < -180 || xmax > 180 || ymin < -90 || ymax > 90) return undefined;
  return { xmin, ymin, xmax, ymax, wkid: 4326 };
}

function parseScale(value: unknown): number | undefined {
  if (value === undefined || value === null || value === 0) return undefined;
  const scale = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1_000_000_000) return undefined;
  return Math.round(scale);
}
