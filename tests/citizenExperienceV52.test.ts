import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v52 accessible interaction contract", () => {
  it("installs the typed keyboard supervisor before the responsive experience supervisor", async () => {
    const [entry, contracts] = await Promise.all([
      readFile("src/main.tsx", "utf8"),
      readFile("tsconfig.contracts.json", "utf8")
    ]);

    expect(entry).toContain('import { installCitizenKeyboardSupervisor } from "./platform/citizenKeyboardSupervisor"');
    expect(entry).toContain('import "./styles/experience-v52.css"');
    expect(entry.indexOf("installCitizenKeyboardSupervisor();")).toBeLessThan(
      entry.indexOf("installCitizenExperienceSupervisor();")
    );
    expect(contracts).toContain("src/platform/citizenKeyboardSupervisor.ts");
  });

  it("retires bare character shortcuts and exposes explicit modifier commands", async () => {
    const [guard, supervisor, rail, help] = await Promise.all([
      readFile("src/lib/globalShortcutGuard.ts", "utf8"),
      readFile("src/platform/citizenKeyboardSupervisor.ts", "utf8"),
      readFile("src/components/ToolRail.tsx", "utf8"),
      readFile("src/components/OperationsPanel.tsx", "utf8")
    ]);

    expect(guard).toContain("resolveCitizenShortcut");
    expect(guard).toContain('key === "k"');
    expect(guard).toContain('return "fullscreen"');
    expect(supervisor).toContain("LEGACY_SINGLE_KEYS");
    expect(supervisor).toContain("stopImmediatePropagation");
    expect(rail).toContain('shortcut="Alt+L"');
    expect(rail).toContain('shortcut="Alt+D"');
    expect(rail).toContain('shortcut="Alt+H"');
    expect(rail).toContain('shortcut="Control+/"');
    expect(help).toContain("Ctrl/⌘ + K");
    expect(help).toContain("çıplak tek-harf kısayolları kaldırıldı");
  });

  it("supports arrow, Home and End navigation across the tool dock", async () => {
    const [supervisor, rail] = await Promise.all([
      readFile("src/platform/citizenKeyboardSupervisor.ts", "utf8"),
      readFile("src/components/ToolRail.tsx", "utf8")
    ]);

    for (const key of ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"]) {
      expect(supervisor).toContain(`event.key === "${key}"`);
    }
    expect(supervisor).toContain("scrollIntoView");
    expect(rail).toContain('id="tool-rail-keyboard-hint"');
    expect(rail).toContain('aria-describedby="tool-rail-keyboard-hint"');
  });

  it("uses dedicated dismiss controls and assertive error announcements for toasts", async () => {
    const toast = await readFile("src/components/ToastStack.tsx", "utf8");
    expect(toast).toContain('role={item.tone === "error" ? "alert" : "status"}');
    expect(toast).toContain('aria-live={item.tone === "error" ? "assertive" : "polite"}');
    expect(toast).toContain('className="toast-dismiss"');
    expect(toast).toContain('aria-label="Bildirimi kapat"');
    expect(toast).not.toContain('className={`toast toast-${item.tone}`} onClick');
  });

  it("keeps visible focus, forced colors and reduced-motion behavior authoritative", async () => {
    const css = await readFile("src/styles/experience-v52.css", "utf8");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("#kent-rehberi-map:focus-visible");
    expect(css).toContain("forced-colors: active");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".toast-dismiss");
  });

  it("keeps package and service-worker cache generations coherent across later releases", async () => {
    const [packageText, sourceWorker, generatedWorker] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("src/sw/sw.ts", "utf8"),
      readFile("public/sw.js", "utf8")
    ]);

    const packageJson = JSON.parse(packageText) as { version: string };
    const major = packageJson.version.split(".")[0];
    expect(major).toMatch(/^\d+$/);
    expect(sourceWorker).toContain(`altyapi-shell-v${major}`);
    expect(sourceWorker).toContain(`altyapi-data-v${major}`);
    expect(generatedWorker).toContain(`altyapi-shell-v${major}`);
    expect(generatedWorker).toContain(`altyapi-data-v${major}`);
  });
});
