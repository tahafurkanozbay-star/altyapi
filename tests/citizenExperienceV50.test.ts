import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v50 citizen experience", () => {
  it("keeps one PWA update owner and removes legacy window update events from App", async () => {
    const [app, host, entry] = await Promise.all([
      readFile("src/App.tsx", "utf8"),
      readFile("src/components/PlatformStatusHost.tsx", "utf8"),
      readFile("src/main.tsx", "utf8")
    ]);

    expect(app).not.toContain("altyapi:update-available");
    expect(app).not.toContain("altyapi:apply-update");
    expect(app).not.toContain("app-update-banner");
    expect(host).toContain('subscribeRuntimeEvent("pwa-update-available"');
    expect(host).toContain('publishRuntimeEvent("pwa-apply-update"');
    expect(entry).toContain('publishRuntimeEvent("pwa-update-available"');
    expect(entry).toContain('subscribeRuntimeEvent("pwa-apply-update"');
  });

  it("surfaces one render-aware citizen readiness model across the shell", async () => {
    const [status, readiness, contracts] = await Promise.all([
      readFile("src/components/StatusBar.tsx", "utf8"),
      readFile("src/lib/citizenReadiness.ts", "utf8"),
      readFile("tsconfig.contracts.json", "utf8")
    ]);

    expect(status).toContain("useSyncExternalStore");
    expect(status).toContain("subscribeLayerRenderHealth");
    expect(status).toContain("deriveCitizenReadiness");
    expect(status).toContain("workspaceReadiness");
    expect(readiness).toContain("Çevrimdışı");
    expect(readiness).toContain("Bazı katmanlar sorunlu");
    expect(readiness).toContain("Katmanlar hazırlanıyor");
    expect(readiness).toContain("Harita hazır");
    expect(contracts).toContain("src/lib/citizenReadiness.ts");
  });

  it("makes skip targets keyboard-focusable and exposes map busy state without duplicate announcements", async () => {
    const app = await readFile("src/App.tsx", "utf8");
    expect(app).toContain('id="kent-rehberi-map"');
    expect(app).toContain('aria-busy={!ready || shellMetrics.loading > 0}');
    expect(app).toContain('id="kent-rehberi-panels"');
    expect(app).toContain('tabIndex={-1}');
    expect(app).toContain('className="workspace-summary" role="group"');
    expect(app).not.toContain('className="workspace-summary" role="status"');
  });

  it("ships responsive, reduced-motion and forced-colors v50 styling", async () => {
    const [entry, css] = await Promise.all([
      readFile("src/main.tsx", "utf8"),
      readFile("src/styles/experience-v50.css", "utf8")
    ]);
    expect(entry).toContain('import "./styles/experience-v50.css"');
    expect(css).toContain(".status-readiness");
    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("forced-colors");
    expect(css).toContain("safe-area-inset-bottom");
  });

  it("keeps application and PWA cache generations coherent across later releases", async () => {
    const [packageText, sourceWorker, generatedWorker] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("src/sw/sw.ts", "utf8"),
      readFile("public/sw.js", "utf8")
    ]);
    const version = (JSON.parse(packageText) as { version: string }).version;
    const major = version.split(".")[0];
    expect(major).toMatch(/^\d+$/);
    expect(sourceWorker).toContain(`altyapi-shell-v${major}`);
    expect(sourceWorker).toContain(`altyapi-data-v${major}`);
    expect(generatedWorker).toContain(`altyapi-shell-v${major}`);
    expect(generatedWorker).toContain(`altyapi-data-v${major}`);
  });
});
