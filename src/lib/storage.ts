import type { AppPreferences, Bookmark, CameraState, PerformanceProfile, ThemeMode } from "../types";

export const STORAGE_KEY = "altyapi:preferences:v3";
const LEGACY_STORAGE_KEY = "altyapi:preferences:v2";
const MAX_BOOKMARKS = 40;
const MAX_LAYER_KEYS = 500;

const defaults: AppPreferences = {
  basemap: "hybrid",
  theme: "dark",
  performance: "auto",
  layerVisibility: {},
  layerOpacity: {},
  favorites: [],
  bookmarks: []
};

export function loadPreferences(): AppPreferences {
  const raw = safeGet(STORAGE_KEY) ?? safeGet(LEGACY_STORAGE_KEY);
  if (!raw) return cloneDefaults();
  try {
    const parsed: unknown = JSON.parse(raw);
    const sanitized = sanitizePreferences(parsed);
    if (!safeGet(STORAGE_KEY)) safeSet(STORAGE_KEY, JSON.stringify(sanitized));
    return sanitized;
  } catch {
    return cloneDefaults();
  }
}

export function sanitizePreferences(value: unknown): AppPreferences {
  if (!value || typeof value !== "object") return cloneDefaults();
  const input = value as Record<string, unknown>;
  const result = cloneDefaults();

  if (typeof input.basemap === "string" && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(input.basemap)) result.basemap = input.basemap;
  if (input.theme === "dark" || input.theme === "light" || input.theme === "system") result.theme = input.theme;
  if (input.performance === "auto" || input.performance === "high" || input.performance === "balanced" || input.performance === "eco") result.performance = input.performance;

  result.layerVisibility = sanitizeBooleanRecord(input.layerVisibility);
  result.layerOpacity = sanitizeOpacityRecord(input.layerOpacity);
  result.favorites = sanitizeIdList(input.favorites);
  result.bookmarks = sanitizeBookmarks(input.bookmarks);

  const camera = sanitizeCamera(input.camera);
  if (camera) result.camera = camera;
  return result;
}

export function savePreferences(preferences: AppPreferences): void {
  const sanitized = sanitizePreferences(preferences);
  safeSet(STORAGE_KEY, JSON.stringify(sanitized));
}

export function updatePreferences(patch: Partial<AppPreferences>): AppPreferences {
  const next = sanitizePreferences({ ...loadPreferences(), ...patch });
  savePreferences(next);
  return next;
}

export function saveCamera(camera: CameraState): void {
  updatePreferences({ camera });
}

export function saveTheme(theme: ThemeMode): void {
  updatePreferences({ theme });
}

export function savePerformance(performance: PerformanceProfile | "auto"): void {
  updatePreferences({ performance });
}

export function saveBookmarks(bookmarks: Bookmark[]): void {
  updatePreferences({ bookmarks });
}

export function clearPreferences(): void {
  safeRemove(STORAGE_KEY);
  safeRemove(LEGACY_STORAGE_KEY);
}

function cloneDefaults(): AppPreferences {
  return {
    ...defaults,
    layerVisibility: {},
    layerOpacity: {},
    favorites: [],
    bookmarks: []
  };
}

function sanitizeBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, boolean> = {};
  let count = 0;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!isSafeId(key) || typeof entry !== "boolean") continue;
    output[key] = entry;
    count += 1;
    if (count >= MAX_LAYER_KEYS) break;
  }
  return output;
}

function sanitizeOpacityRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, number> = {};
  let count = 0;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!isSafeId(key) || typeof entry !== "number" || !Number.isFinite(entry)) continue;
    output[key] = Math.min(1, Math.max(0, entry));
    count += 1;
    if (count >= MAX_LAYER_KEYS) break;
  }
  return output;
}

function sanitizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !isSafeId(entry)) continue;
    ids.add(entry);
    if (ids.size >= MAX_LAYER_KEYS) break;
  }
  return [...ids];
}

function sanitizeBookmarks(value: unknown): Bookmark[] {
  if (!Array.isArray(value)) return [];
  const output: Bookmark[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const camera = sanitizeCamera(item.camera);
    if (!camera || typeof item.id !== "string" || !isSafeId(item.id) || typeof item.name !== "string" || typeof item.createdAt !== "string") continue;
    const name = item.name.trim().slice(0, 120);
    if (!name || Number.isNaN(Date.parse(item.createdAt))) continue;
    output.push({
      id: item.id,
      name,
      camera,
      layerIds: sanitizeIdList(item.layerIds).slice(0, 100),
      createdAt: item.createdAt
    });
    if (output.length >= MAX_BOOKMARKS) break;
  }
  return output;
}

function sanitizeCamera(value: unknown): CameraState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const camera = value as Record<string, unknown>;
  const longitude = finiteNumber(camera.longitude);
  const latitude = finiteNumber(camera.latitude);
  const z = finiteNumber(camera.z);
  const heading = finiteNumber(camera.heading);
  const tilt = finiteNumber(camera.tilt);
  if (longitude === undefined || latitude === undefined || z === undefined || heading === undefined || tilt === undefined) return undefined;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90 || z < -1000 || z > 10_000_000 || heading < -360 || heading > 360 || tilt < 0 || tilt > 180) return undefined;
  return { longitude, latitude, z, heading, tilt };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isSafeId(value: string): boolean {
  return value.length > 0 && value.length <= 160 && /^[a-z0-9_-]+$/i.test(value);
}

function safeGet(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    // Uygulama depolama kapalı olsa da çalışmaya devam eder.
  }
}

function safeRemove(key: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    // Depolama erişimi tarayıcı politikasıyla engellenmiş olabilir.
  }
}
