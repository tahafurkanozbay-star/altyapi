import { describe, expect, it } from "vitest";
import { deriveCitizenReadiness } from "../src/lib/citizenReadiness";
import type { LayerRenderHealthSnapshot } from "../src/lib/layerRenderHealth";
import type { ServiceDefinition } from "../src/types";

function service(id: string, patch: Partial<ServiceDefinition> = {}): ServiceDefinition {
  return {
    id,
    kind: "FeatureServer",
    displayName: id,
    organization: "ABB",
    owner: "ABB",
    ustKurumAdi: "ABB",
    metaveriSahibiKurumAdi: "ABB",
    cografiVeriKatmanAdi: id,
    servisTuruAdi: "FeatureServer",
    tokenUrl: "https://example.invalid/FeatureServer/0",
    url: "https://example.invalid/FeatureServer/0",
    status: "ready",
    visible: true,
    opacity: 1,
    favorite: false,
    availability: "verified",
    access: "public-browser",
    failureCount: 0,
    ...patch
  };
}

describe("citizen readiness", () => {
  it("prioritizes offline state over layer progress", () => {
    const result = deriveCitizenReadiness([service("a", { status: "loading" })], {}, false);
    expect(result.tone).toBe("offline");
    expect(result.label).toBe("Çevrimdışı");
  });

  it("deduplicates load and render failures for the same visible layer", () => {
    const render: LayerRenderHealthSnapshot = {
      a: { state: "failed", updatedAt: 1 }
    };
    const result = deriveCitizenReadiness([service("a", { status: "error" })], render, true);
    expect(result.tone).toBe("warning");
    expect(result.failed).toBe(1);
  });

  it("reports active render preparation without calling it a failure", () => {
    const render: LayerRenderHealthSnapshot = {
      a: { state: "preparing", updatedAt: 1 }
    };
    const result = deriveCitizenReadiness([service("a")], render, true);
    expect(result.tone).toBe("loading");
    expect(result.renderPending).toBe(1);
  });

  it("keeps hidden failures out of the citizen workspace status", () => {
    const render: LayerRenderHealthSnapshot = {
      hidden: { state: "failed", updatedAt: 1 }
    };
    const result = deriveCitizenReadiness([
      service("visible"),
      service("hidden", { visible: false, status: "error" })
    ], render, true);
    expect(result.tone).toBe("ready");
    expect(result.failed).toBe(0);
  });

  it("provides an actionable idle state when no layers are open", () => {
    const result = deriveCitizenReadiness([service("a", { visible: false })], {}, true);
    expect(result.tone).toBe("idle");
    expect(result.label).toBe("Katman seçebilirsiniz");
  });
});
