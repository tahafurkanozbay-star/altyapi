import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

// Runtime assets are generated from locked dependencies, never committed.
const root = resolve("public/sdk-assets");
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
const sources = [
  ["@arcgis/core/assets", "core"],
  ["@arcgis/map-components/dist/cdn/assets", "map/assets"],
  ["@arcgis/common-components/dist/cdn/assets", "common/assets"],
  ["@esri/calcite-components/dist/cdn/assets", "calcite/assets"]
] as const;
await Promise.all(sources.map(([source, destination]) =>
  cp(resolve("node_modules", source), resolve(root, destination), { recursive: true })
));
console.log("✓ ArcGIS worker, WASM, ikon ve dil dosyaları yerel SDK sürümüyle hazır.");
