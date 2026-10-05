import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { CITIZEN_SHORTCUTS, shortcutFor } from "../src/platform/citizenActions";

describe("v52 accessible interaction contract", () => {
  it("keeps the typed keyboard supervisor before the responsive experience supervisor", async () => {
    const [entry, contracts, shellCss] = await Promise.all([
      readFile("src/main.tsx", "utf8"),
      readFile("tsconfig.contracts.json", "utf8"),
      readFile("src/styles/citizen-shell.css", "utf8")
    ]);

    expect(entry).toContain('import { installCitizenKeyboardSupervisor } from "./platform/citizenKeyboardSupervisor"');
    expect(shellCss).toContain('@import "./experience-v52.css"');
    expect(entry.indexOf("installCitizenKeyboardSupervisor();")).toBeLessThan(
      entry.indexOf("installCitizenExperienceSupervisor();")
    );
    expect(contracts).toContain("src/platform/citizenKeyboardSupervisor.ts");
    expect(contracts).toContain("src/platform/citizenActions.ts");
  });

  it("retires bare character shortcuts and exposes explicit modifier commands through one registry", async () => {
    const [guard, supervisor, rail, help] = await Promise.all([
      readFile("src/lib/globalShortcutGuard.ts", "utf8"),
      readFile("src/platform/citizenKeyboardSupervisor.ts", "utf8"),
      readFile("src/components/ToolRail.tsx", "utf8"),
      readFile("src/components/OperationsPanel.tsx", "utf8")
    ]);

    expect(guard).toContain("resolveCitizenShortcut");
    expect(guard).toContain("CITIZEN_SHORTCUTS.find");
    expect(supervisor).toContain("LEGACY_SINGLE_KEYS");
    expect(supervisor).toContain("stopImmediatePropagation");
    expect(CITIZEN_SHORTCUTS.map((item) => item.command)).toEqual([
      "layers", "data", "home", "focus-mode", "search", "help", "fullscreen"
    ]);
    expect(shortcutFor("layers").ariaKeyShortcuts).toBe("Alt+L");
    expect(shortcutFor("data").ariaKeyShortcuts).toBe("Alt+D");
    expect(shortcutFor("home").ariaKeyShortcuts).toBe("Alt+H");
    expect(shortcutFor("help").ariaKeyShortcuts).toContain("Control+/");
    expect(rail).toContain("shortcutFor(\"layers\")");
    expect(help).toContain("CITIZEN_SHORTCUTS.map");
    expect(help).toContain("Çıplak tek-harf kısayolları kullanılmaz");
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
    const [legacyCss, shellCss] = await Promise.all([
      readFile("src/styles/experience-v52.css", "utf8"),
      readFile("src/styles/citizen-shell.css", "utf8")
    ]);
    expect(legacyCss).toContain(":focus-visible");
    expect(legacyCss).toContain("#kent-rehberi-map:focus-visible");
    expect(legacyCss).toContain("forced-colors: active");
    expect(legacyCss).toContain("prefers-reduced-motion: reduce");
    expect(legacyCss).toContain(".toast-dismiss");
    expect(shellCss).toContain("focus-visible");
    expect(shellCss).toContain("forced-colors: active");
    expect(shellCss).toContain("prefers-reduced-motion: reduce");
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
