import { readFile, writeFile, rm } from "node:fs/promises";

async function replaceInFile(path, before, after) {
  const content = await readFile(path, "utf8");
  if (!content.includes(before)) throw new Error(`${path}: expected patch anchor not found`);
  await writeFile(path, content.replace(before, after), "utf8");
}

await replaceInFile(
  "src/App.tsx",
  `import {\n  applyServiceNavigationSnapshot,\n  formatScale,\n  loadServiceNavigationSnapshot\n} from "./lib/serviceNavigation";`,
  `import {\n  applyServiceNavigationSnapshot,\n  formatScale,\n  loadServiceNavigationSnapshot\n} from "./lib/serviceNavigation";\nimport { applyServiceZoomSnapshot, loadServiceZoomSnapshot } from "./lib/serviceZoom";`
);

await replaceInFile("src/App.tsx", `const APP_VERSION = "13.0.0";`, `const APP_VERSION = "14.0.0";`);

await replaceInFile(
  "src/App.tsx",
  `        const [catalog, healthSnapshot, navigationSnapshot] = await Promise.all([\n          loadServiceCatalog("./services.json", controller.signal),\n          loadServiceHealthSnapshot("./service-health.json", controller.signal),\n          loadServiceNavigationSnapshot("./service-navigation.json", controller.signal)\n        ]);`,
  `        const [catalog, healthSnapshot, navigationSnapshot, zoomSnapshot] = await Promise.all([\n          loadServiceCatalog("./services.json", controller.signal),\n          loadServiceHealthSnapshot("./service-health.json", controller.signal),\n          loadServiceNavigationSnapshot("./service-navigation.json", controller.signal),\n          loadServiceZoomSnapshot("./service-zoom.json", controller.signal)\n        ]);`
);

await replaceInFile(
  "src/App.tsx",
  `        const healthCatalog = applyServiceHealthSnapshot(catalog, healthSnapshot);\n        const enrichedCatalog = applyServiceNavigationSnapshot(healthCatalog, navigationSnapshot);`,
  `        const healthCatalog = applyServiceHealthSnapshot(catalog, healthSnapshot);\n        const navigationCatalog = applyServiceNavigationSnapshot(healthCatalog, navigationSnapshot);\n        const enrichedCatalog = applyServiceZoomSnapshot(navigationCatalog, zoomSnapshot);`
);

await replaceInFile(
  "src/components/LayerExplorer.tsx",
  `import {\n  formatScale,\n  isOperationalScale,\n  navigationSourceLabel,\n  operationalScaleLabel\n} from "../lib/serviceNavigation";`,
  `import {\n  formatScale,\n  isOperationalScale,\n  navigationSourceLabel,\n  operationalScaleLabel\n} from "../lib/serviceNavigation";\nimport { currentZoomFromScale, isOperationalZoom, zoomAuditSourceLabel, zoomRangeLabel } from "../lib/serviceZoom";`
);

await replaceInFile(
  "src/components/LayerExplorer.tsx",
  `                        <div><dt>Çalışma ölçeği</dt><dd>{operationalScaleLabel(service)}</dd></div>\n                        <div><dt>Önerilen açılış ölçeği</dt>`,
  `                        <div><dt>Çalışma ölçeği</dt><dd>{operationalScaleLabel(service)}</dd></div>\n                        <div><dt>Doğrulanmış zoom aralığı</dt><dd>{zoomRangeLabel(service)}</dd></div>\n                        <div><dt>Zoom doğrulama kaynağı</dt><dd>{zoomAuditSourceLabel(service)}</dd></div>\n                        <div><dt>Zoom doğrulama zamanı</dt><dd>{service.zoomVerifiedAt ? new Date(service.zoomVerifiedAt).toLocaleString("tr-TR") : "—"}</dd></div>\n                        <div><dt>Zoom doğrulama notu</dt><dd>{service.zoomAuditNote ?? "—"}</dd></div>\n                        <div><dt>Önerilen açılış ölçeği</dt>`
);

await replaceInFile(
  "src/components/LayerExplorer.tsx",
  `function statusLabel(service: ServiceDefinition, currentScale?: number): string {`,
  `function statusLabel(service: ServiceDefinition, currentScale?: number): string {\n  const currentZoom = currentZoomFromScale(currentScale);\n  if (!isOperationalZoom(service, currentZoom)) {\n    if (service.operationalMinZoom !== undefined && currentZoom !== undefined && currentZoom < service.operationalMinZoom) return \`Yaklaşın · zoom ≥ \${service.operationalMinZoom}\`;\n    if (service.operationalMaxZoom !== undefined && currentZoom !== undefined && currentZoom > service.operationalMaxZoom) return \`Uzaklaşın · zoom ≤ \${service.operationalMaxZoom}\`;\n  }`
);

await replaceInFile(
  "index.html",
  `Başkent 3B CBS v13`,
  `Başkent 3B CBS v14`
);
await replaceInFile(
  "index.html",
  `<title>Başkent 3B CBS v13 · Runtime Reliability</title>`,
  `<title>Başkent 3B CBS v14 · Verified Zoom Policy</title>`
).catch(() => {});

const readme = await readFile("README.md", "utf8");
let updatedReadme = readme
  .replace(/# Başkent 3B CBS · .* v13/, "# Başkent 3B CBS · Verified Zoom Policy v14")
  .replace(/Current application version: \*\*13\.0\.0\*\*/, "Current application version: **14.0.0**");
if (!updatedReadme.includes("## v14: Verified Zoom Policy")) {
  updatedReadme = updatedReadme.replace(/\n## /, `\n## v14: Verified Zoom Policy\n\n- 20 katalog servisi zoom/ölçek davranışı açısından tek tek doğrulandı.\n- MapServer katmanları zoom 5–22 arasında gerçek PNG piksel testiyle tarandı.\n- İÇME SUYU ELEMAN zoom 8–22, İÇME SUYU BORU zoom 9–22 ile sınırlandırıldı.\n- UYGULAMA İMAR PLANI için servis metadata hard aralığı zoom 8–19 uygulandı.\n- Yağmur/pis su MapServer katmanlarında doğrulanmış zoom 5–22 uygulanır.\n- FeatureServer / SceneServer katmanlarında hard zoom limiti uydurulmaz.\n- EPDK/UCBP WMS/WFS servisleri HTTP 500 verdiği için zoom sınırı uydurulmadan “doğrulanamadı” olarak tutulur.\n- Runtime ArcGIS minScale/maxScale değerlerini bu sanitizasyonlu service-zoom.json snapshot'ından alır.\n\n## `);
}
await writeFile("README.md", updatedReadme, "utf8");

await rm("scripts/apply-service-zoom-integration.mjs", { force: true });
await rm(".github/workflows/apply-service-zoom-integration.yml", { force: true });
