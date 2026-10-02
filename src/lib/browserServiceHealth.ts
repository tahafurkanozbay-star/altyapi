import type { ServiceDefinition } from "../types";
import { subscribeRuntimeEvent } from "../platform/runtimeEvents";
import { isDirectTucbsUrl, isUnconfiguredTucbsUrl } from "./tucbsAccess";

const STORAGE_KEY = "altyapi:browser-service-health:v46";
export const BROWSER_SERVICE_HEALTH_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_STORED_PROFILES = 64;
const MAX_RENDER_READY_MS = 300_000;
const SAFE_SERVICE_ID = /^[a-z0-9][a-z0-9._:-]{0,179}$/i;

export interface BrowserServiceHealthProfile {
  checkedAt: string;
  renderReadyMs?: number;
}

export type BrowserServiceHealthProfileMap = Record<string, BrowserServiceHealthProfile>;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Remembers only anonymous service IDs after ArcGIS has reached a stable
 * LayerView in the real browser. No URL, host, query string, token, credential
 * or provider payload is ever persisted by this store.
 */
export function installBrowserServiceHealthMemory(): () => void {
  if (typeof window === "undefined") return () => undefined;

  return subscribeRuntimeEvent("layer-render-health", (detail) => {
    if (detail.phase !== "stable" || !isSafeServiceId(detail.serviceId)) return;
    const profiles = loadBrowserServiceHealthProfiles();
    profiles[detail.serviceId] = sanitizeProfile({
      checkedAt: new Date().toISOString(),
      renderReadyMs: detail.elapsedMs
    });
    saveBrowserServiceHealthProfiles(profiles);
  });
}

export function loadBrowserServiceHealthProfiles(
  storage: StorageLike | null = safeLocalStorage(),
  now = Date.now()
): BrowserServiceHealthProfileMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    const profiles = sanitizeProfileMap(parsed);
    const fresh = Object.fromEntries(
      Object.entries(profiles).filter(([, profile]) => isBrowserServiceHealthFresh(profile, now))
    );

    // Opportunistic pruning keeps long-lived clients bounded without a timer.
    if (Object.keys(fresh).length !== Object.keys(profiles).length) {
      saveBrowserServiceHealthProfiles(fresh, storage);
    }
    return fresh;
  } catch {
    return {};
  }
}

export function saveBrowserServiceHealthProfiles(
  profiles: BrowserServiceHealthProfileMap,
  storage: StorageLike | null = safeLocalStorage()
): void {
  if (!storage) return;
  try {
    const sanitized = sanitizeProfileMap(profiles);
    const bounded = Object.fromEntries(
      Object.entries(sanitized)
        .sort(([, left], [, right]) => Date.parse(right.checkedAt) - Date.parse(left.checkedAt))
        .slice(0, MAX_STORED_PROFILES)
    );
    storage.setItem(STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    // Storage quota/private mode must never affect map startup or layer loading.
  }
}

export function clearBrowserServiceHealthProfiles(storage: StorageLike | null = safeLocalStorage()): void {
  if (!storage) return;
  try { storage.removeItem(STORAGE_KEY); } catch { /* storage restrictions */ }
}

export function applyBrowserServiceHealth(
  services: ServiceDefinition[],
  profiles: BrowserServiceHealthProfileMap,
  now = Date.now()
): ServiceDefinition[] {
  return services.map((service) => {
    // TUCBS keeps its dedicated approved-IP verification path. A generic stable
    // LayerView must never overwrite protected-endpoint authorization semantics.
    if (isDirectTucbsUrl(service.url) || isUnconfiguredTucbsUrl(service.url) || service.tucbsEndpointKey) {
      return service;
    }

    const profile = profiles[service.id];
    if (!profile || !isBrowserServiceHealthFresh(profile, now)) return service;

    return {
      ...service,
      availability: "verified",
      access: "public-browser",
      browserCompatible: true,
      verificationReason: "Bu katman bu tarayıcıda yakın zamanda stabil olarak çizildi.",
      verifiedAt: profile.checkedAt,
      verificationStale: false
    };
  });
}

export function isBrowserServiceHealthFresh(
  profile: BrowserServiceHealthProfile,
  now = Date.now(),
  maxAgeMs = BROWSER_SERVICE_HEALTH_MAX_AGE_MS
): boolean {
  const checkedAt = Date.parse(profile.checkedAt);
  return Number.isFinite(checkedAt)
    && checkedAt <= now + 5 * 60_000
    && now - checkedAt <= maxAgeMs;
}

export function sanitizeBrowserServiceHealthProfiles(value: unknown): BrowserServiceHealthProfileMap {
  return sanitizeProfileMap(value);
}

function sanitizeProfileMap(value: unknown): BrowserServiceHealthProfileMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: BrowserServiceHealthProfileMap = {};
  for (const [serviceId, rawProfile] of Object.entries(value)) {
    if (!isSafeServiceId(serviceId) || !rawProfile || typeof rawProfile !== "object" || Array.isArray(rawProfile)) continue;
    try {
      output[serviceId] = sanitizeProfile(rawProfile as BrowserServiceHealthProfile);
    } catch {
      // Corrupt browser state is ignored instead of poisoning catalogue startup.
    }
  }
  return output;
}

function sanitizeProfile(profile: BrowserServiceHealthProfile): BrowserServiceHealthProfile {
  if (!profile.checkedAt || Number.isNaN(Date.parse(profile.checkedAt))) {
    throw new Error("Geçersiz tarayıcı servis sağlık zamanı.");
  }
  const renderReadyMs = typeof profile.renderReadyMs === "number" && Number.isFinite(profile.renderReadyMs)
    ? Math.max(0, Math.min(MAX_RENDER_READY_MS, Math.round(profile.renderReadyMs)))
    : undefined;
  return {
    checkedAt: new Date(profile.checkedAt).toISOString(),
    renderReadyMs
  };
}

function isSafeServiceId(value: string): boolean {
  return SAFE_SERVICE_ID.test(value);
}

function safeLocalStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}
