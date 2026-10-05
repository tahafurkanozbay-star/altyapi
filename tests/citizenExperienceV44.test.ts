import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v44 citizen experience hardening", () => {
  it("installs one typed viewport and focus supervisor", async () => {
    const [entry, supervisor, shellCss] = await Promise.all([
      readFile("src/main.tsx", "utf8"),
      readFile("src/platform/citizenExperienceSupervisor.ts", "utf8"),
      readFile("src/styles/citizen-shell.css", "utf8")
    ]);

    expect(entry).toContain('installCitizenExperienceSupervisor');
    expect(shellCss).toContain('@import "./experience-v44.css"');
    expect(supervisor).toContain("window.visualViewport");
    expect(supervisor).toContain("panel.inert = !isVisible");
    expect(supervisor).toContain('panel.setAttribute("aria-hidden", "true")');
    expect(supervisor).toContain('aria-expanded');
    expect(supervisor).toContain('focus({ preventScroll: true })');
    expect(supervisor).toContain('data-panel-target');
    expect(supervisor).toContain('saveData');
    expect(supervisor).toContain('effectiveType');
  });

  it("keeps the mobile tool dock understandable without relying on icons alone", async () => {
    const rail = await readFile("src/components/ToolRail.tsx", "utf8");
    const css = await readFile("src/styles/experience-v44.css", "utf8");

    expect(rail).toContain('role="group"');
    expect(rail).toContain('data-panel-target={panelTarget}');
    expect(rail).toContain('aria-controls={panelTarget ? "kent-rehberi-panels" : undefined}');
    expect(rail).toContain('className="tool-mobile-label"');
    expect(css).toContain(".tool-mobile-label");
    expect(css).toContain('html[data-virtual-keyboard="open"] .tool-rail');
    expect(css).toContain("--v44-keyboard-inset");
  });

  it("adds modern rendering and accessibility guardrails", async () => {
    const css = await readFile("src/styles/experience-v44.css", "utf8");

    expect(css).toContain("content-visibility: auto");
    expect(css).toContain("contain-intrinsic-size");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("@container (max-width: 350px)");
    expect(css).toContain('html[data-save-data="true"]');
    expect(css).toContain('html[data-page-visibility="hidden"]');
  });

  it("keeps the v44 accessibility generation while allowing newer coherent releases", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
    const swSource = await readFile("src/sw/sw.ts", "utf8");
    const swOutput = await readFile("public/sw.js", "utf8");
    const major = Number(packageJson.version.split(".")[0]);

    expect(major).toBeGreaterThanOrEqual(44);
    expect(swSource).toContain(`altyapi-shell-v${major}`);
    expect(swSource).toContain(`altyapi-data-v${major}`);
    expect(swOutput).toContain(`altyapi-shell-v${major}`);
    expect(swOutput).toContain(`altyapi-data-v${major}`);
  });
});
