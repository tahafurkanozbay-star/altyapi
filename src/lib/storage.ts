import type { AppPreferences, Bookmark, CameraState, PerformanceProfile, ThemeMode } from "../types";

const STORAGE_KEY = "altyapi:preferences:v2";

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
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaults);
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      ...structuredClone(defaults),
      ...parsed,
      layerVisibility: parsed.layerVisibility ?? {},
      layerOpacity: parsed.layerOpacity ?? {},
      favorites: parsed.favorites ?? [],
      bookmarks: parsed.bookmarks ?? []
    };
  } catch {
    return structuredClone(defaults);
  }
}

export function savePreferences(preferences: AppPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

export function updatePreferences(patch: Partial<AppPreferences>): AppPreferences {
  const next = { ...loadPreferences(), ...patch };
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
