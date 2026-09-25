import { describe, expect, it } from "vitest";
import { serviceAttemptCandidates, serviceCandidateForAttempt } from "../src/lib/serviceFailover";
import type { ServiceDefinition } from "../src/types";

function service(): ServiceDefinition {
  return {
    ustKurumAdi: "ENERJİ VE TABİİ KAYNAKLAR BAKANLIĞI",
    metaveriSahibiKurumAdi: "EPDK",
    cografiVeriKatmanAdi: "DOĞALGAZ HATTI",
    servisTuruAdi: "WMS",
    tokenUrl: "https://example.test/gas/wms",
    id: "gas-wms",
    kind: "WMS",
    displayName: "DOĞALGAZ HATTI",
    organization: "ENERJİ VE TABİİ KAYNAKLAR BAKANLIĞI",
    owner: "EPDK",
    url: "https://example.test/gas/wms",
    status: "idle",
    visible: false,
    opacity: 1,
    favorite: false,
    availability: "unknown",
    access: "unknown",
    failureCount: 0,
    alternateEndpoints: [{
      kind: "WFS",
      url: "https://example.test/gas/wfs",
      sourceServiceId: "gas-wfs"
    }]
  };
}

describe("semantic service failover", () => {
  it("keeps logical identity while exposing equivalent OGC transports", () => {
    const candidates = serviceAttemptCandidates(service());
    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.kind)).toEqual(["WMS", "WFS"]);
    expect(candidates.every((candidate) => candidate.id === "gas-wms")).toBe(true);
  });

  it("rotates primary and alternate transports deterministically across fresh retries", () => {
    const input = service();
    expect(serviceCandidateForAttempt(input, 1).kind).toBe("WMS");
    expect(serviceCandidateForAttempt(input, 2).kind).toBe("WFS");
    expect(serviceCandidateForAttempt(input, 3).kind).toBe("WMS");
  });
});
