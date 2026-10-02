import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("v47 citizen reliability center", () => {
  it("exposes a citizen-friendly status panel without restoring technical operations UI", async () => {
    const rail = await readFile("src/components/ToolRail.tsx", "utf8");
    const panel = await readFile("src/components/OperationsPanel.tsx", "utf8");
    const center = await readFile("src/components/CitizenStatusCenter.tsx", "utf8");

    expect(rail).toContain("Bağlantı durumu");
    expect(rail).not.toContain("Operasyon özeti");
    expect(panel).toContain("LazyCitizenStatusCenter");
    expect(panel).toContain("Bağlantı Durumu");
    expect(center).toContain("BAĞLANTI VE HARİTA DURUMU");
    expect(center).toContain("Güvenli durum raporu indir");
  });

  it("keeps support exports sanitized and incident storms deduplicated", async () => {
    const report = await readFile("src/lib/supportReport.ts", "utf8");
    const incidents = await readFile("src/lib/incidentJournal.ts", "utf8");

    expect(report).toContain("createCitizenSupportReport");
    expect(report).not.toContain("tokenUrl:");
    expect(report).not.toContain("url:");
    expect(incidents).toContain("INCIDENT_DEDUP_WINDOW_MS");
    expect(incidents).toContain("INCIDENT_JOURNAL_EVENT");
    expect(incidents).toContain("isEquivalentRecentIncident");
  });

  it("loads the v47 visual layer after previous citizen experience layers", async () => {
    const entry = await readFile("src/main.tsx", "utf8");
    const css = await readFile("src/styles/experience-v47.css", "utf8");
    expect(entry.indexOf('experience-v47.css')).toBeGreaterThan(entry.indexOf('experience-v45.css'));
    expect(css).toContain(".citizen-status-center");
    expect(css).toContain("forced-colors: active");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
