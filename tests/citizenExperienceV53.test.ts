import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { CITIZEN_SHORTCUTS, MAP_TOOL_METADATA, shortcutFor } from "../src/platform/citizenActions";
import { resolveCitizenShortcut, type AppShortcutKeyEvent } from "../src/lib/globalShortcutGuard";

describe("v54 unified citizen experience", () => {
  it("installs one stable citizen-shell stylesheet entry point and v54 shell generation", async () => {
    const [entry, shellCss] = await Promise.all([
      readFile("src/main.tsx", "utf8"),
      readFile("src/styles/citizen-shell.css", "utf8")
    ]);

    expect(entry).toContain('import "./styles/citizen-shell.css"');
    expect(entry).not.toContain('import "./styles/experience-v53.css"');
    expect(entry).toContain('dataset.experience = "v54"');
    expect(shellCss).toContain('@import "./experience-v43.css"');
    expect(shellCss).toContain('@import "./experience-v53.css"');
    expect(shellCss.indexOf('experience-v43.css')).toBeLessThan(shellCss.indexOf('experience-v53.css'));
    expect(shellCss).toContain('html[data-experience="v54"]');
  });

  it("keeps one typed shortcut registry for runtime matching, visible help and aria metadata", async () => {
    const [rail, help, guard] = await Promise.all([
      readFile("src/components/ToolRail.tsx", "utf8"),
      readFile("src/components/OperationsPanel.tsx", "utf8"),
      readFile("src/lib/globalShortcutGuard.ts", "utf8")
    ]);

    expect(CITIZEN_SHORTCUTS).toHaveLength(7);
    expect(new Set(CITIZEN_SHORTCUTS.map((item) => item.command)).size).toBe(CITIZEN_SHORTCUTS.length);
    expect(Object.keys(MAP_TOOL_METADATA)).toHaveLength(8);
    expect(shortcutFor("search").ariaKeyShortcuts).toContain("Control+K");
    expect(shortcutFor("search").ariaKeyShortcuts).toContain("Meta+K");
    expect(rail).toContain("shortcutFor(\"layers\")");
    expect(help).toContain("CITIZEN_SHORTCUTS.map");
    expect(guard).toContain("CITIZEN_SHORTCUTS.find");
  });

  it("matches modifier shortcuts while refusing interactive targets and character-only legacy keys", () => {
    const event = (patch: Partial<AppShortcutKeyEvent>): AppShortcutKeyEvent => ({
      key: "k",
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      repeat: false,
      isComposing: false,
      defaultPrevented: false,
      ...patch
    });

    expect(resolveCitizenShortcut(event({}), false)).toBe("search");
    expect(resolveCitizenShortcut(event({ ctrlKey: false, metaKey: true }), false)).toBe("search");
    expect(resolveCitizenShortcut(event({ ctrlKey: false, key: "l" }), false)).toBeNull();
    expect(resolveCitizenShortcut(event({}), true)).toBeNull();
    expect(resolveCitizenShortcut(event({ repeat: true }), false)).toBeNull();
  });

  it("makes the visible mobile panel a real modal interaction with inert background and focus restoration", async () => {
    const [supervisor, css] = await Promise.all([
      readFile("src/platform/citizenShellSupervisor.ts", "utf8"),
      readFile("src/styles/citizen-shell.css", "utf8")
    ]);

    expect(supervisor).toContain('surface.setAttribute("role", "dialog")');
    expect(supervisor).toContain('surface.setAttribute("aria-modal", "true")');
    expect(supervisor).toContain("setMobileModalBackgroundInert(true)");
    expect(supervisor).toContain('element.dataset["v54Inert"] = "true"');
    expect(supervisor).toContain("focusBeforeModal");
    expect(supervisor).toContain("preferred.focus({ preventScroll: true })");
    expect(supervisor).toContain("trapMobilePanelTab");
    expect(css).toContain('[data-v54-inert="true"]');
    expect(css).toContain("--citizen-touch-target: 44px");
  });

  it("keeps one Escape priority and native dialogs authoritative", async () => {
    const [supervisor, policy] = await Promise.all([
      readFile("src/platform/citizenShellSupervisor.ts", "utf8"),
      readFile("src/platform/citizenShellPolicy.ts", "utf8")
    ]);

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

  it("keeps modern accessibility fallbacks in the unified shell", async () => {
    const css = await readFile("src/styles/citizen-shell.css", "utf8");
    expect(css).toContain("focus-visible");
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("forced-colors: active");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("overscroll-behavior: contain");
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

  it("ships v54 application and PWA cache generations together", async () => {
    const [packageText, sourceWorker, generatedWorker] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("src/sw/sw.ts", "utf8"),
      readFile("public/sw.js", "utf8")
    ]);

    expect(JSON.parse(packageText)).toMatchObject({ version: "54.0.0" });
    expect(sourceWorker).toContain('altyapi-shell-v54');
    expect(sourceWorker).toContain('altyapi-data-v54');
    expect(generatedWorker).toContain('altyapi-shell-v54');
    expect(generatedWorker).toContain('altyapi-data-v54');
  });
});
