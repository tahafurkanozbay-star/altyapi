import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v53 unified citizen shell", () => {
  it("installs one strict page-wide shell supervisor after keyboard and responsive supervisors", async () => {
    const [entry, contracts] = await Promise.all([
      readFile("src/main.tsx", "utf8"),
      readFile("tsconfig.contracts.json", "utf8")
    ]);

    expect(entry).toContain('import { installCitizenShellSupervisor } from "./platform/citizenShellSupervisor"');
    expect(entry).toContain('import "./styles/experience-v53.css"');
    expect(entry).toContain('dataset.experience = "v53"');
    expect(entry.indexOf("installCitizenKeyboardSupervisor();")).toBeLessThan(entry.indexOf("installCitizenShellSupervisor();"));
    expect(entry.indexOf("installCitizenExperienceSupervisor();")).toBeLessThan(entry.indexOf("installCitizenShellSupervisor();"));
    expect(contracts).toContain("src/platform/citizenShellPolicy.ts");
    expect(contracts).toContain("src/platform/citizenShellSupervisor.ts");
  });

  it("uses a single Escape priority and keeps native dialogs authoritative", async () => {
    const supervisor = await readFile("src/platform/citizenShellSupervisor.ts", "utf8");
    const policy = await readFile("src/platform/citizenShellPolicy.ts", "utf8");

    expect(policy).toContain('if (snapshot.dialogOpen) return "native-dialog"');
    expect(policy).toContain('if (snapshot.detailsOpen) return "close-details"');
    expect(policy).toContain('if (snapshot.toolOpen) return "close-tool"');
    expect(policy).toContain('return "hide-mobile-panel"');
    expect(policy).toContain('return "toggle-panel"');
    expect(policy).toContain('return "exit-focus-mode"');
    expect(supervisor).toContain('event.key !== "Escape"');
    expect(supervisor).toContain('action === "native-dialog"');
    expect(supervisor).toContain("stopImmediatePropagation");
  });

  it("makes the visible mobile panel a bounded modal drawer with backdrop dismissal", async () => {
    const [supervisor, css] = await Promise.all([
      readFile("src/platform/citizenShellSupervisor.ts", "utf8"),
      readFile("src/styles/experience-v53.css", "utf8")
    ]);

    expect(supervisor).toContain('surface.setAttribute("role", "dialog")');
    expect(supervisor).toContain('surface.setAttribute("aria-modal", "true")');
    expect(supervisor).toContain("trapMobilePanelTab");
    expect(supervisor).toContain("FOCUSABLE_SELECTOR");
    expect(supervisor).toContain('event.target !== panelZone');
    expect(css).toContain(".panel-zone.is-mobile-visible::before");
    expect(css).toContain("pointer-events: auto !important");
    expect(css).toContain('[data-v53-modal="true"]');
  });

  it("uses container queries and user preference fallbacks for narrow workspaces", async () => {
    const css = await readFile("src/styles/experience-v53.css", "utf8");
    expect(css).toContain("container-type: inline-size");
    expect(css).toContain("@container workspace-panel (max-width: 350px)");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("prefers-contrast: more");
    expect(css).toContain("forced-colors: active");
    expect(css).toContain('html[data-reduced-transparency="true"]');
    expect(css).toContain('html[data-save-data="true"]');
  });

  it("ships modern mobile/PWA launch metadata without changing Ankara branding", async () => {
    const [index, manifestText] = await Promise.all([
      readFile("index.html", "utf8"),
      readFile("public/manifest.webmanifest", "utf8")
    ]);
    const manifest = JSON.parse(manifestText) as {
      id?: string;
      name?: string;
      start_url?: string;
      launch_handler?: { client_mode?: string };
    };

    expect(index).toContain("interactive-widget=resizes-content");
    expect(index).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(manifest).toMatchObject({
      id: "./",
      name: "Ankara Kent Rehberi",
      start_url: "./",
      launch_handler: { client_mode: "navigate-existing" }
    });
  });

  it("ships v53 application and PWA cache generations together", async () => {
    const [packageText, sourceWorker, generatedWorker] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("src/sw/sw.ts", "utf8"),
      readFile("public/sw.js", "utf8")
    ]);

    expect(JSON.parse(packageText)).toMatchObject({ version: "53.0.0" });
    expect(sourceWorker).toContain('altyapi-shell-v53');
    expect(sourceWorker).toContain('altyapi-data-v53');
    expect(generatedWorker).toContain('altyapi-shell-v53');
    expect(generatedWorker).toContain('altyapi-data-v53');
  });
});
