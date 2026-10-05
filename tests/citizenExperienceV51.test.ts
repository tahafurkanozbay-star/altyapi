import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else files.push(path);
  }
  return files;
}

describe("v51 responsive citizen workspace", () => {
  it("keeps first-party application, engineering scripts and tests on TypeScript", async () => {
    const files = (await Promise.all([sourceFiles("src"), sourceFiles("scripts"), sourceFiles("tests")])).flat();
    const javascriptSources = files.filter((path) => /\.(?:js|jsx|mjs|cjs)$/i.test(path));
    expect(javascriptSources).toEqual([]);

    const tsconfig = await readFile("tsconfig.app.json", "utf8");
    expect(tsconfig).toContain('"allowJs": false');
    expect(tsconfig).toContain('"strict": true');
    expect(tsconfig).toContain('"noUncheckedIndexedAccess": true');
    expect(tsconfig).toContain('"erasableSyntaxOnly": true');
  });

  it("ships one safe-area aware mobile shell with search and a horizontal tool dock", async () => {
    const [entry, css] = await Promise.all([
      readFile("src/main.tsx", "utf8"),
      readFile("src/styles/experience-v51.css", "utf8")
    ]);

    expect(entry).toContain('import "./styles/experience-v51.css"');
    expect(entry).toContain('dataset.experience = "v51"');
    expect(css).toContain("env(safe-area-inset-top)");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain(".mobile-menu");
    expect(css).toContain("display: grid !important");
    expect(css).toContain(".global-search");
    expect(css).toContain("display: block !important");
    expect(css).toContain("scroll-snap-type: x proximity");
    expect(css).toContain("flex-direction: row !important");
    expect(css).toContain(".tool-mobile-label");
  });

  it("coordinates mobile panel and map-tool ownership instead of allowing overlapping workspaces", async () => {
    const supervisor = await readFile("src/platform/citizenExperienceSupervisor.ts", "utf8");
    expect(supervisor).toContain("hideMobilePanelForTool");
    expect(supervisor).toContain("closeToolForMobilePanel");
    expect(supervisor).toContain("revealingHiddenPanel");
    expect(supervisor).toContain("layersPanelTrigger");
    expect(supervisor).toContain('dataset.experience = "v51"');
    expect(supervisor).toContain('"panelVisibility"');
    expect(supervisor).toContain('"toolVisibility"');
  });

  it("adapts to virtual keyboards, reduced transparency, forced colors and data-saving mode", async () => {
    const [supervisor, css] = await Promise.all([
      readFile("src/platform/citizenExperienceSupervisor.ts", "utf8"),
      readFile("src/styles/experience-v51.css", "utf8")
    ]);

    expect(supervisor).toContain("prefers-reduced-transparency: reduce");
    expect(supervisor).toContain("compactHeight");
    expect(supervisor).toContain("virtualKeyboard");
    expect(supervisor).toContain("saveData");
    expect(css).toContain('data-reduced-transparency="true"');
    expect(css).toContain('data-save-data="true"');
    expect(css).toContain('data-virtual-keyboard="open"');
    expect(css).toContain("forced-colors: active");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("rotates package and both service-worker cache generations together", async () => {
    const [packageText, sourceWorker, generatedWorker] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("src/sw/sw.ts", "utf8"),
      readFile("public/sw.js", "utf8")
    ]);

    expect(JSON.parse(packageText)).toMatchObject({ version: "51.0.0" });
    expect(sourceWorker).toContain('altyapi-shell-v51');
    expect(sourceWorker).toContain('altyapi-data-v51');
    expect(generatedWorker).toContain('altyapi-shell-v51');
    expect(generatedWorker).toContain('altyapi-data-v51');
  });
});
