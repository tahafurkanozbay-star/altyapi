import type {
  ServiceDefinition,
  ServiceZoomProfile,
  ServiceZoomSnapshot,
  ServiceZoomSource,
  ServiceZoomStatus
} from "../types";

const STATUSES = new Set<ServiceZoomStatus>([
  "verified-range",
  "declared-range",
  "no-hard-limit",
  "unavailable",
  "metadata-only"
]);
const SOURCES = new Set<ServiceZoomSource>(["multi-zoom-render", "service-metadata", "capabilities", "metadata"]);
export const WEB_MERCATOR_SCALE_AT_ZOOM_0 = 591657527.591555;

export async function loadServiceZoomSnapshot(
  url = "./service-zoom.json",
  signal?: AbortSignal
): Promise<ServiceZoomSnapshot | null> {
  try {
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return parseServiceZoomSnapshot(value);
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

export function parseServiceZoomSnapshot(value: unknown): ServiceZoomSnapshot {
  if (!value || typeof value !== "object") throw new Error("Servis zoom özeti geçersiz.");
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1 || !Array.isArray(input.profiles)) {
    throw new Error("Desteklenmeyen servis zoom özeti biçimi.");
  }

  const verifiedAt = typeof input.verifiedAt === "string" && !Number.isNaN(Date.parse(input.verifiedAt))
    ? input.verifiedAt
    : new Date(0).toISOString();

  const profiles: ServiceZoomProfile[] = input.profiles.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (!Number.isInteger(record.index) || typeof record.name !== "string" || typeof record.kind !== "string") return [];
    if (!STATUSES.has(record.status as ServiceZoomStatus) || !SOURCES.has(record.source as ServiceZoomSource)) return [];

    const minZoom = parseZoom(record.minZoom);
    const maxZoom = parseZoom(record.maxZoom);
    const testedMinZoom = parseZoom(record.testedMinZoom);
    const testedMaxZoom = parseZoom(record.testedMaxZoom);
    const declaredMinScale = parseScale(record.declaredMinScale);
    const declaredMaxScale = parseScale(record.declaredMaxScale);

    if (minZoom !== undefined && maxZoom !== undefined && minZoom > maxZoom) return [];

    return [{
      index: Number(record.index),
      name: record.name,
      kind: record.kind as ServiceZoomProfile["kind"],
      status: record.status as ServiceZoomStatus,
      source: record.source as ServiceZoomSource,
      minZoom,
      maxZoom,
      testedMinZoom,
      testedMaxZoom,
      declaredMinScale,
      declaredMaxScale,
      note: typeof record.note === "string" ? record.note.slice(0, 260) : undefined
    }];
  });

  return {
    schemaVersion: 1,
    verifiedAt,
    scaleModel: typeof input.scaleModel === "string" ? input.scaleModel.slice(0, 180) : "WebMercator standard LOD",
    profiles
  };
}

export function applyServiceZoomSnapshot(
  services: ServiceDefinition[],
  snapshot: ServiceZoomSnapshot | null
): ServiceDefinition[] {
  if (!snapshot) return services;
  const profiles = new Map(snapshot.profiles.map((profile) => [profile.index, profile]));
  return services.map((service, index) => {
    const profile = profiles.get(index);
    if (!profile || profile.name !== service.displayName || profile.kind !== service.kind) return service;

    const auditedMinScale = profile.minZoom !== undefined ? Math.round(scaleForZoom(profile.minZoom)) : undefined;
    const auditedMaxScale = profile.maxZoom !== undefined ? Math.round(scaleForZoom(profile.maxZoom)) : undefined;

    return {
      ...service,
      operationalMinZoom: profile.minZoom,
      operationalMaxZoom: profile.maxZoom,
      zoomAuditStatus: profile.status,
      zoomAuditSource: profile.source,
      zoomVerifiedAt: snapshot.verifiedAt,
      zoomAuditNote: profile.note,
      operationalMinScale: auditedMinScale ?? service.operationalMinScale,
      operationalMaxScale: auditedMaxScale ?? service.operationalMaxScale,
      renderScaleSensitive: service.renderScaleSensitive || profile.status === "verified-range" || profile.status === "declared-range"
    };
  });
}

export function scaleForZoom(zoom: number): number {
  return WEB_MERCATOR_SCALE_AT_ZOOM_0 / 2 ** zoom;
}

export function zoomForScale(scale: number): number {
  return Math.log2(WEB_MERCATOR_SCALE_AT_ZOOM_0 / scale);
}

export function zoomRangeLabel(service: ServiceDefinition): string {
  const min = service.operationalMinZoom;
  const max = service.operationalMaxZoom;
  if (min !== undefined && max !== undefined) return `Zoom ${formatZoom(min)}–${formatZoom(max)}`;
  if (min !== undefined) return `Zoom ${formatZoom(min)} ve üzeri`;
  if (max !== undefined) return `Zoom ${formatZoom(max)} ve altı`;
  if (service.zoomAuditStatus === "no-hard-limit") return "Hard zoom sınırı yok";
  if (service.zoomAuditStatus === "unavailable") return "Zoom aralığı doğrulanamadı";
  return "Zoom sınırı yok";
}

export function isOperationalZoom(service: ServiceDefinition, zoom: number | undefined): boolean {
  if (!Number.isFinite(zoom)) return true;
  if (service.operationalMinZoom !== undefined && zoom! < service.operationalMinZoom) return false;
  if (service.operationalMaxZoom !== undefined && zoom! > service.operationalMaxZoom) return false;
  return true;
}

export function currentZoomFromScale(scale: number | undefined): number | undefined {
  if (!Number.isFinite(scale) || !scale || scale <= 0) return undefined;
  return zoomForScale(scale);
}

export function zoomAuditSourceLabel(service: ServiceDefinition): string {
  if (service.zoomAuditSource === "multi-zoom-render") return "Canlı çoklu zoom PNG render testi";
  if (service.zoomAuditSource === "service-metadata") return "Servis metadata";
  if (service.zoomAuditSource === "capabilities") return "OGC GetCapabilities";
  if (service.zoomAuditSource === "metadata") return "Metadata erişim testi";
  return "Doğrulama yok";
}

function parseZoom(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const zoom = Number(value);
  if (!Number.isFinite(zoom) || zoom < 0 || zoom > 30) return undefined;
  return Math.round(zoom * 100) / 100;
}

function parseScale(value: unknown): number | undefined {
  if (value === undefined || value === null || value === 0) return undefined;
  const scale = Number(value);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1_000_000_000) return undefined;
  return Math.round(scale);
}

function formatZoom(zoom: number): string {
  return Number.isInteger(zoom) ? String(zoom) : zoom.toFixed(2).replace(/\.00$/, "");
}
