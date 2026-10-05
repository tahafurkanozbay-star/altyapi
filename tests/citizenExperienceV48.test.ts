import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v48 product integrity retained by later releases", () => {
  it("keeps the typed progressive install experience while later releases compose platform notices", async () => {
    const entry = await readFile("src/main.tsx", "utf8");
    const statusHost = await readFile("src/components/PlatformStatusHost.tsx", "utf8");
    const install = await readFile("src/components/InstallPromptHost.tsx", "utf8");
    const css = await readFile("src/styles/experience-v48.css", "utf8");

    expect(entry).toContain("PlatformStatusHost");
    expect(statusHost).toContain("InstallPromptHost");
    expect(entry).toContain('import "./styles/experience-v48.css"');
    expect(install).toContain("BeforeInstallPromptEvent");
    expect(install).toContain('window.addEventListener("beforeinstallprompt"');
    expect(install).toContain('(display-mode: standalone)');
    expect(css).toContain(".install-banner");
  });

  it("restores focus around map-tool panels and marks their real triggers", async () => {
    const supervisor = await readFile("src/platform/citizenExperienceSupervisor.ts", "utf8");
    const rail = await readFile("src/components/ToolRail.tsx", "utf8");

    expect(supervisor).toContain('TOOL_PANEL_SELECTOR = ".map-tool-panel"');
    expect(supervisor).toContain('TOOL_TRIGGER_SELECTOR = "button[data-tool-target]"');
    expect(supervisor).toContain("restoreToolFocusOnClose");
    expect(supervisor).toContain('root.dataset["experience"] =');
    expect(rail).toContain("data-tool-target={toolTarget}");
  });

  it("drops stale attribute queries instead of allowing old results to replace a new selection", async () => {
    const workbench = await readFile("src/components/DataWorkbench.tsx", "utf8");

    expect(workbench).toContain("queryGenerationRef");
    expect(workbench).toContain("generation !== queryGenerationRef.current");
    expect(workbench).toContain('aria-busy={busy}');
    expect(workbench).toContain("window.setTimeout(() => URL.revokeObjectURL(url), 0)");
  });

  it("enforces unused-code and file-casing checks in first-party TypeScript projects", async () => {
    const app = await readFile("tsconfig.app.json", "utf8");
    const node = await readFile("tsconfig.node.json", "utf8");

    for (const config of [app, node]) {
      expect(config).toContain('"noUnusedLocals": true');
      expect(config).toContain('"noUnusedParameters": true');
      expect(config).toContain('"forceConsistentCasingInFileNames": true');
    }
  });
});
