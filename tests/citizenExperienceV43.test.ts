import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry);
    const info = await stat(path);
    if (info.isDirectory()) files.push(...await sourceFiles(path));
    else files.push(path.replaceAll("\\", "/"));
  }
  return files;
}

describe("v43 citizen experience", () => {
  it("keeps first-party runtime, worker and engineering source in TypeScript", async () => {
    const files = [...await sourceFiles("src"), ...await sourceFiles("scripts")];
    const legacySource = files.filter((path) => path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".jsx"));
    expect(legacySource).toEqual([]);
    expect(files).toContain("src/boot.ts");
  });

  it("ships Ankara Kent Rehberi metadata without stale v13 operations branding", async () => {
    const [html, manifest] = await Promise.all([
      readFile("index.html", "utf8"),
      readFile("public/manifest.webmanifest", "utf8")
    ]);

    expect(html).toContain("Ankara Kent Rehberi · 3B Kent Haritası");
    expect(html).toContain('src="/src/boot.ts"');
    expect(html).toContain('href="./ankara-logo.png"');
    expect(html).not.toContain("Başkent 3B CBS v13");
    expect(html).not.toContain("window.__ALTYAPI_BOOT_TIMER__ =");
    expect(manifest).toContain('"name": "Ankara Kent Rehberi"');
    expect(manifest).toContain('"src": "./ankara-logo.png"');
  });

  it("exposes accessible landmarks, offline state and keyboard navigation", async () => {
    const app = await readFile("src/App.tsx", "utf8");
    const rail = await readFile("src/components/ToolRail.tsx", "utf8");

    expect(app).toContain('className="skip-links"');
    expect(app).toContain('id="kent-rehberi-map"');
    expect(app).toContain('role="region"');
    expect(app).toContain('id="kent-rehberi-panels"');
    expect(app).toContain('className="offline-banner"');
    expect(app).toContain('className="workspace-summary"');
    expect(app).toContain('event.key === "?"');
    expect(app).toContain('event.key === "/"');
    expect(rail).toContain('id="kent-rehberi-tools"');
    expect(rail).toContain("aria-keyshortcuts");
  });

  it("keeps layer management understandable and recoverable", async () => {
    const explorer = await readFile("src/components/LayerExplorer.tsx", "utf8");
    expect(explorer).toContain("HARİTA KATMANLARI");
    expect(explorer).toContain("Filtreleri temizle");
    expect(explorer).toContain("Sorunlu katmanları dene");
    expect(explorer).toContain("haritada hazır");
    expect(explorer).not.toContain("CBS OPERASYON KATALOĞU");
    expect(explorer).not.toContain("devre kesici");
  });

  it("lazy-loads the heavy data workbench and documents first-use guidance", async () => {
    const panel = await readFile("src/components/OperationsPanel.tsx", "utf8");
    expect(panel).toContain("lazy(async () =>");
    expect(panel).toContain("<Suspense");
    expect(panel).toContain("Hızlı başlangıç");
    expect(panel).toContain('keyName="/"');
    expect(panel).toContain('keyName="?"');
  });

  it("loads the final responsive accessibility stylesheet and caches the brand asset", async () => {
    const [entry, css, swSource, swBuilt] = await Promise.all([
      readFile("src/main.tsx", "utf8"),
      readFile("src/styles/experience-v43.css", "utf8"),
      readFile("src/sw/sw.ts", "utf8"),
      readFile("public/sw.js", "utf8")
    ]);

    expect(entry).toContain('import "./styles/experience-v43.css"');
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("prefers-contrast: more");
    expect(css).toContain("--v43-touch-target: 44px");
    expect(css).toContain(".skip-links");
    expect(swSource).toContain('altyapi-shell-v43');
    expect(swSource).toContain('"./ankara-logo.png"');
    expect(swBuilt).toContain('altyapi-shell-v43');
    expect(swBuilt).toContain('"./ankara-logo.png"');
  });
});
