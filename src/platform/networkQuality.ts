export interface NetworkQualitySnapshot {
  online: boolean;
  saveData: boolean;
  effectiveType?: string;
  downlinkMbps?: number;
  rttMs?: number;
  hidden: boolean;
}

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
};

/**
 * Reads only coarse browser-provided connection hints. Nothing is persisted or
 * transmitted; the snapshot is used locally to avoid overloading constrained
 * links while several GIS layers are opening at once.
 */
export function browserNetworkQuality(): NetworkQualitySnapshot {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const connection = nav && "connection" in nav
    ? (nav as Navigator & { connection?: NetworkInformationLike }).connection
    : undefined;

  return {
    online: nav?.onLine ?? true,
    saveData: connection?.saveData === true,
    effectiveType: normalizeEffectiveType(connection?.effectiveType),
    downlinkMbps: finiteNonNegative(connection?.downlink),
    rttMs: finiteNonNegative(connection?.rtt),
    hidden: typeof document !== "undefined" ? document.hidden : false
  };
}

/**
 * Caps the normal hardware/profile budget with live network pressure. Existing
 * in-flight work is never killed by a changing hint; the cap only controls new
 * admissions. This keeps interactions predictable while avoiding request
 * bursts on Save-Data, 2G/3G and very high-latency connections.
 */
export function networkConcurrencyCap(baseLimit: number, quality: NetworkQualitySnapshot): number {
  const safeBase = Math.max(1, Math.floor(baseLimit));
  if (safeBase === 1) return 1;
  if (!quality.online || quality.saveData || quality.hidden) return 1;

  const type = quality.effectiveType;
  if (type === "slow-2g" || type === "2g") return 1;
  if ((quality.rttMs ?? 0) >= 1_000) return 1;
  if (quality.downlinkMbps !== undefined && quality.downlinkMbps < 1) return 1;

  if (type === "3g") return Math.min(safeBase, 2);
  if ((quality.rttMs ?? 0) >= 500) return Math.min(safeBase, 2);
  if (quality.downlinkMbps !== undefined && quality.downlinkMbps < 2) return Math.min(safeBase, 2);

  return safeBase;
}

function normalizeEffectiveType(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
