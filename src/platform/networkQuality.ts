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
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

export type NetworkQualityChangeListener = () => void;

/**
 * Reads only coarse browser-provided connection hints. Nothing is persisted or
 * transmitted; the snapshot is used locally to avoid overloading constrained
 * links while several GIS layers are opening at once.
 */
export function browserNetworkQuality(): NetworkQualitySnapshot {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const connection = networkInformation(nav);

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
 * Subscribes to coarse browser connectivity/visibility changes so queued GIS
 * work can be reconsidered immediately instead of waiting for another request
 * or an unrelated active load to finish. No connection metadata is stored.
 */
export function subscribeNetworkQualityChanges(listener: NetworkQualityChangeListener): () => void {
  const win = typeof window === "undefined" ? undefined : window;
  const doc = typeof document === "undefined" ? undefined : document;
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const connection = networkInformation(nav);
  const onChange = () => listener();

  win?.addEventListener("online", onChange);
  win?.addEventListener("offline", onChange);
  doc?.addEventListener("visibilitychange", onChange);
  connection?.addEventListener?.("change", onChange);

  return () => {
    win?.removeEventListener("online", onChange);
    win?.removeEventListener("offline", onChange);
    doc?.removeEventListener("visibilitychange", onChange);
    connection?.removeEventListener?.("change", onChange);
  };
}

/**
 * Caps the normal hardware/profile budget with live network pressure. Existing
 * in-flight work is never killed by a changing hint; the cap only controls new
 * admissions. A browser that is explicitly offline admits no new remote loads
 * until an online/network-change event reopens the queue.
 */
export function networkConcurrencyCap(baseLimit: number, quality: NetworkQualitySnapshot): number {
  const safeBase = Math.max(1, Math.floor(baseLimit));
  if (!quality.online) return 0;
  if (safeBase === 1) return 1;
  if (quality.saveData || quality.hidden) return 1;

  const type = quality.effectiveType;
  if (type === "slow-2g" || type === "2g") return 1;
  if ((quality.rttMs ?? 0) >= 1_000) return 1;
  if (quality.downlinkMbps !== undefined && quality.downlinkMbps < 1) return 1;

  if (type === "3g") return Math.min(safeBase, 2);
  if ((quality.rttMs ?? 0) >= 500) return Math.min(safeBase, 2);
  if (quality.downlinkMbps !== undefined && quality.downlinkMbps < 2) return Math.min(safeBase, 2);

  return safeBase;
}

function networkInformation(nav: Navigator | undefined): NetworkInformationLike | undefined {
  if (!nav || !("connection" in nav)) return undefined;
  return (nav as Navigator & { connection?: NetworkInformationLike }).connection;
}

function normalizeEffectiveType(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
