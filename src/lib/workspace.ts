import { sanitizePreferences } from "./storage";
import type { CameraState, WorkspaceSnapshot } from "../types";

export function createWorkspaceSnapshot(input: {
  applicationVersion: string;
  camera: CameraState;
  basemap: string;
  layerVisibility: Record<string, boolean>;
  layerOpacity: Record<string, number>;
  favorites: string[];
  bookmarks: WorkspaceSnapshot["bookmarks"];
}): WorkspaceSnapshot {
  const preferences = sanitizePreferences({
    basemap: input.basemap,
    theme: "light",
    performance: "auto",
    layerVisibility: input.layerVisibility,
    layerOpacity: input.layerOpacity,
    favorites: input.favorites,
    camera: input.camera,
    bookmarks: input.bookmarks
  });

  return {
    schemaVersion: 1,
    application: "Başkent 3B CBS",
    applicationVersion: input.applicationVersion,
    exportedAt: new Date().toISOString(),
    camera: preferences.camera ?? input.camera,
    basemap: preferences.basemap,
    layerVisibility: preferences.layerVisibility,
    layerOpacity: preferences.layerOpacity,
    favorites: preferences.favorites,
    bookmarks: preferences.bookmarks
  };
}

export function parseWorkspaceSnapshot(value: unknown, allowedServiceIds: ReadonlySet<string>): WorkspaceSnapshot {
  if (!value || typeof value !== "object") throw new Error("Geçersiz çalışma alanı dosyası.");
  const input = value as Partial<WorkspaceSnapshot>;
  if (input.schemaVersion !== 1 || input.application !== "Başkent 3B CBS") {
    throw new Error("Desteklenmeyen çalışma alanı biçimi.");
  }

  const preferences = sanitizePreferences({
    basemap: input.basemap,
    theme: "light",
    performance: "auto",
    layerVisibility: filterBooleanRecord(input.layerVisibility, allowedServiceIds),
    layerOpacity: filterNumberRecord(input.layerOpacity, allowedServiceIds),
    favorites: Array.isArray(input.favorites) ? input.favorites.filter((id): id is string => typeof id === "string" && allowedServiceIds.has(id)) : [],
    camera: input.camera,
    bookmarks: input.bookmarks
  });

  if (!preferences.camera) throw new Error("Çalışma alanında geçerli kamera bilgisi bulunamadı.");

  return {
    schemaVersion: 1,
    application: "Başkent 3B CBS",
    applicationVersion: typeof input.applicationVersion === "string" ? input.applicationVersion.slice(0, 40) : "unknown",
    exportedAt: typeof input.exportedAt === "string" && !Number.isNaN(Date.parse(input.exportedAt))
      ? input.exportedAt
      : new Date().toISOString(),
    camera: preferences.camera,
    basemap: preferences.basemap,
    layerVisibility: preferences.layerVisibility,
    layerOpacity: preferences.layerOpacity,
    favorites: preferences.favorites,
    bookmarks: preferences.bookmarks
  };
}

export function workspaceSnapshotToJson(snapshot: WorkspaceSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

function filterBooleanRecord(value: unknown, allowed: ReadonlySet<string>): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, entry]) => allowed.has(key) && typeof entry === "boolean")
  );
}

function filterNumberRecord(value: unknown, allowed: ReadonlySet<string>): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(key) || typeof entry !== "number" || !Number.isFinite(entry)) continue;
    output[key] = Math.min(1, Math.max(0, entry));
  }
  return output;
}
