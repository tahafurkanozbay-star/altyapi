import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v51 full-page usability", () => {
  it("ships semantic dismissible notifications and keyboard-focused fatal recovery", async () => {
    const [toast, boundary] = await Promise.all([
      readFile("src/components/ToastStack.tsx", "utf8"),
      readFile("src/components/AppErrorBoundary.tsx", "utf8")
    ]);

    expect(toast).toContain('role={item.tone === "error" ? "alert" : "status"}');
    expect(toast).toContain('className="toast-dismiss"');
    expect(toast).toContain('aria-atomic="true"');
    expect(toast).not.toContain('key={item.id} className={`toast toast-${item.tone}`} onClick');
    expect(boundary).toContain("componentDidUpdate");
    expect(boundary).toContain("fatalRef");
    expect(boundary).toContain('aria-labelledby="fatal-screen-title"');
    expect(boundary).toContain('tabIndex={-1}');
  });

  it("keeps mobile editing fields visible and adapts the shell to input capabilities", async () => {
    const [supervisor, css] = await Promise.all([
      readFile("src/platform/citizenExperienceSupervisor.ts", "utf8"),
      readFile("src/styles/experience-v51.css", "utf8")
    ]);

    expect(supervisor).toContain("EDITING_SELECTOR");
    expect(supervisor).toContain("scrollIntoView");
    expect(supervisor).toContain("shellDensity");
    expect(supervisor).toContain('root.dataset["experience"] = "v51"');
    expect(css).toContain('data-pointer="coarse"');
    expect(css).toContain("min-width: 44px");
    expect(css).toContain('data-virtual-keyboard="open"');
    expect(css).toContain("forced-colors");
    expect(css).toContain(".layer-bulk-undo");
  });

  it("preserves layer explorer context and makes destructive bulk actions reversible", async () => {
    const [explorer, state, contracts] = await Promise.all([
      readFile("src/components/LayerExplorer.tsx", "utf8"),
      readFile("src/lib/layerExplorerState.ts", "utf8"),
      readFile("tsconfig.contracts.json", "utf8")
    ]);

    expect(explorer).toContain("loadLayerExplorerState");
    expect(explorer).toContain("saveLayerExplorerState");
    expect(explorer).toContain("recentlyClosedIds");
    expect(explorer).toContain("restoreRecentlyClosed");
    expect(explorer).toContain("Promise.all(errors.map(retryService))");
    expect(state).toContain("sessionStorage");
    expect(state).toContain("parseLayerExplorerState");
    expect(contracts).toContain("src/lib/layerExplorerState.ts");
    expect(contracts).toContain("src/lib/attributeTable.ts");
    expect(contracts).toContain("src/platform/citizenExperienceSupervisor.ts");
  });

  it("neutralizes spreadsheet formulas and rotates release caches coherently", async () => {
    const [table, packageText, sourceWorker, generatedWorker, entry] = await Promise.all([
      readFile("src/lib/attributeTable.ts", "utf8"),
      readFile("package.json", "utf8"),
      readFile("src/sw/sw.ts", "utf8"),
      readFile("public/sw.js", "utf8"),
      readFile("src/main.tsx", "utf8")
    ]);

    expect(table).toContain("neutralizeSpreadsheetFormula");
    expect(table).toContain('/[=+\\-@]/');
    expect(JSON.parse(packageText)).toMatchObject({ version: "51.0.0" });
    expect(sourceWorker).toContain("altyapi-shell-v51");
    expect(sourceWorker).toContain("altyapi-data-v51");
    expect(generatedWorker).toContain("altyapi-shell-v51");
    expect(generatedWorker).toContain("altyapi-data-v51");
    expect(entry).toContain('import "./styles/experience-v51.css"');
    expect(entry).toContain('dataset.experience = "v51"');
  });
});
