import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v49 platform usability", () => {
  it("routes platform lifecycle and recovery through the typed runtime event bus", async () => {
    const entry = await readFile("src/main.tsx", "utf8");
    const events = await readFile("src/platform/runtimeEvents.ts", "utf8");
    const host = await readFile("src/components/PlatformStatusHost.tsx", "utf8");

    expect(events).toContain('"app-runtime-fault"');
    expect(events).toContain('"pwa-update-available"');
    expect(events).toContain('"pwa-apply-update"');
    expect(entry).toContain('publishRuntimeEvent("app-runtime-fault"');
    expect(entry).toContain('publishRuntimeEvent("pwa-update-available"');
    expect(entry).toContain('subscribeRuntimeEvent("pwa-apply-update"');
    expect(entry).not.toContain('new Event("altyapi:update-available")');
    expect(entry).not.toContain('new Event("altyapi:apply-update")');
    expect(host).toContain('subscribeRuntimeEvent("app-runtime-fault"');
    expect(host).toContain("InstallPromptHost");
  });

  it("keeps platform notices readable without stacking fixed banners on the same corner", async () => {
    const css = await readFile("src/styles/experience-v49.css", "utf8");
    const entry = await readFile("src/main.tsx", "utf8");

    expect(entry).toContain('import "./styles/experience-v49.css"');
    expect(css).toContain(".platform-status-stack");
    expect(css).toContain(".platform-status-stack .install-banner");
    expect(css).toContain("position: static !important");
    expect(css).toContain(".offline-banner");
    expect(css).toContain("top: calc(126px + var(--v43-safe-top, 0px))");
  });

  it("uses stricter TypeScript optional and index semantics in every first-party execution world", async () => {
    const configs = await Promise.all([
      readFile("tsconfig.app.json", "utf8"),
      readFile("tsconfig.node.json", "utf8"),
      readFile("tsconfig.worker.json", "utf8"),
      readFile("tsconfig.sw.json", "utf8")
    ]);

    for (const config of configs) {
      expect(config).toContain('"exactOptionalPropertyTypes": true');
      expect(config).toContain('"noPropertyAccessFromIndexSignature": true');
      expect(config).toContain('"strict": true');
    }
  });

  it("removes the unreachable technical command-palette source from the citizen bundle", async () => {
    const components = await readdir("src/components");
    const app = await readFile("src/App.tsx", "utf8");
    const rail = await readFile("src/components/ToolRail.tsx", "utf8");

    expect(components).not.toContain("CommandPalette.tsx");
    expect(app).not.toContain("CommandPalette");
    expect(rail).not.toContain("Komut paleti");
  });

  it("does not expose raw production render errors on the fatal recovery surface", async () => {
    const boundary = await readFile("src/components/AppErrorBoundary.tsx", "utf8");

    expect(boundary).toContain("import.meta.env.DEV");
    expect(boundary).toContain("Kent Rehberi beklenmeyen bir hatayla durdu");
    expect(boundary).toContain("Tercihleri sıfırla");
    expect(boundary).toContain('className="fatal-actions"');
  });
});
