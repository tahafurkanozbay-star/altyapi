import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v47 citizen experience guarantees retained by later releases", () => {
  it("keeps the desktop header structurally aligned with its five visible content groups", async () => {
    const css = await readFile("src/styles/experience-v47.css", "utf8");
    expect(css).toContain("grid-template-columns: minmax(270px, 360px) auto auto minmax(260px, 1fr) auto");
    expect(css).toContain("@media (max-width: 1280px) and (min-width: 761px)");
    expect(css).toContain("@media (max-width: 1020px) and (min-width: 761px)");
    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain("grid-template-columns: auto minmax(0, 1fr) auto");
  });

  it("mirrors OS and device accessibility preferences into the citizen shell", async () => {
    const supervisor = await readFile("src/platform/citizenExperienceSupervisor.ts", "utf8");
    const css = await readFile("src/styles/experience-v47.css", "utf8");

    expect(supervisor).toContain("prefers-reduced-motion: reduce");
    expect(supervisor).toContain("prefers-contrast: more");
    expect(supervisor).toContain("forced-colors: active");
    expect(supervisor).toContain("display-mode: standalone");
    expect(supervisor).toContain('root.dataset["experience"] =');
    expect(supervisor).toContain("event.composedPath()");
    expect(css).toContain('html[data-reduced-motion="true"]');
    expect(css).toContain('html[data-input-modality="keyboard"]');
    expect(css).toContain('html[data-display-mode="standalone"]');
  });

  it("keeps one-shot tool actions out of toggle semantics and makes panel close focusable on mobile", async () => {
    const rail = await readFile("src/components/ToolRail.tsx", "utf8");
    const panel = await readFile("src/components/OperationsPanel.tsx", "utf8");

    expect(rail).toContain("const isToggle = active !== undefined");
    expect(rail).toContain("aria-pressed={isToggle ? active : undefined}");
    expect(rail).not.toContain('aria-current={active ? "page" : undefined}');
    expect(panel).toContain("mobile-panel-close");
    expect(panel).toContain("data-panel-close");
  });

  it("requires an explicit confirmation before deleting a saved workspace view", async () => {
    const panel = await readFile("src/components/OperationsPanel.tsx", "utf8");
    expect(panel).toContain("confirmDelete");
    expect(panel).toContain("bookmark-delete-confirm");
    expect(panel).toContain("Silme işlemini onaylayın veya vazgeçin.");
  });
});
