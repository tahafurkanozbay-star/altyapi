export const BASEMAP_OPTIONS = [
  ["hybrid", "Hibrit"],
  ["satellite", "Uydu"],
  ["topo-vector", "Topoğrafik"],
  ["streets-vector", "Sokak"],
  ["dark-gray-vector", "Koyu Gri"],
  ["gray-vector", "Açık Gri"]
] as const;

export type BasemapId = typeof BASEMAP_OPTIONS[number][0];

export function supportedBasemapId(value: unknown): BasemapId | undefined {
  const id = typeof value === "string" ? value
    : value && typeof value === "object" ? (value as { id?: unknown }).id
      : undefined;
  return BASEMAP_OPTIONS.find(([candidate]) => candidate === id)?.[0];
}
