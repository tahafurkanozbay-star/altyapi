import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v50 application integrity", () => {
  it("uses one resilient typed PWA lifecycle owner", async () => {
    const entry = await readFile("src/main.tsx", "utf8");
    const lifecycle = await readFile("src/platform/serviceWorkerLifecycle.ts", "utf8");
    const app = await readFile("src/App.tsx", "utf8");

    expect(entry).toContain("installServiceWorkerLifecycle");
    expect(entry).not.toContain("navigator.serviceWorker.register");
    expect(lifecycle).toContain('updateViaCache: "none"');
    expect(lifecycle).toContain("UPDATE_CHECK_INTERVAL_MS");
    expect(lifecycle).toContain('document.addEventListener("visibilitychange"');
    expect(lifecycle).toContain('window.addEventListener("online"');
    expect(lifecycle).toContain('publishRuntimeEvent("pwa-update-available"');
    expect(lifecycle).toContain('subscribeRuntimeEvent("pwa-apply-update"');
    expect(app).not.toContain("altyapi:update-available");
    expect(app).not.toContain("altyapi:apply-update");
    expect(app).not.toContain("app-update-banner");
  });

  it("contains optional panel failures without dropping the map", async () => {
    const operations = await readFile("src/components/OperationsPanel.tsx", "utf8");
    const boundary = await readFile("src/components/PanelErrorBoundary.tsx", "utf8");

    expect(operations).toContain("PanelErrorBoundary");
    expect(operations).toContain("LazyDataWorkbench");
    expect(boundary).toContain("componentDidCatch");
    expect(boundary).toContain("Harita çalışmaya devam ediyor");
    expect(boundary).toContain("Paneli kapat");
  });

  it("keeps public errors safe and status telemetry truthful", async () => {
    const app = await readFile("src/App.tsx", "utf8");
    const status = await readFile("src/components/StatusBar.tsx", "utf8");
    const incidents = await readFile("src/lib/incidentJournal.ts", "utf8");

    expect(app).toContain("publicErrorMessage");
    expect(app).toContain("Harita verisi şu anda alınamadı");
    expect(status).not.toContain("39.92080° N · 32.85420° E");
    expect(status).toContain('return "—"');
    expect(incidents).toContain('application: "Ankara Kent Rehberi"');
  });

  it("ships bounded accessible notifications and v50 caches", async () => {
    const app = await readFile("src/App.tsx", "utf8");
    const queue = await readFile("src/hooks/useToastQueue.ts", "utf8");
    const toast = await readFile("src/components/ToastStack.tsx", "utf8");
    const entry = await readFile("src/main.tsx", "utf8");
    const worker = await readFile("src/sw/sw.ts", "utf8");
    const generatedWorker = await readFile("public/sw.js", "utf8");
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version: string };

    expect(packageJson.version).toBe("50.0.0");
    expect(app).toContain("useToastQueue");
    expect(queue).toContain("MAX_TOASTS = 4");
    expect(queue).toContain("timers.current.clear()");
    expect(toast).toContain('role={item.tone === "error" ? "alert" : "status"}');
    expect(toast).toContain('aria-label="Bildirimi kapat"');
    expect(entry).toContain('import "./styles/experience-v50.css"');
    expect(worker).toContain("altyapi-shell-v50");
    expect(worker).toContain("altyapi-data-v50");
    expect(generatedWorker).toContain("altyapi-shell-v50");
  });
});