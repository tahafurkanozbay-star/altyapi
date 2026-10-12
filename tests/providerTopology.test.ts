import { describe, expect, it } from "vitest";
import {
  isArcGisSharingProxyUrl,
  providerLaneKey,
  providerRouteClass
} from "../src/lib/providerTopology";

describe("provider topology", () => {
  const host = "https://baskentcbs.ankara.bel.tr";

  it("separates ArcGIS Portal sharing proxy traffic from direct REST on the same host", () => {
    const proxy = `${host}/portal/sharing/servers/abc/rest/services/ttt/layer/MapServer/0`;
    const direct = `${host}/server/rest/services/Hosted/layer/FeatureServer/1`;

    expect(providerRouteClass(proxy, "MapServer")).toBe("arcgis-sharing-proxy");
    expect(providerRouteClass(direct, "FeatureServer")).toBe("arcgis-rest");
    expect(providerLaneKey(proxy, "MapServer")).not.toBe(providerLaneKey(direct, "FeatureServer"));
    expect(isArcGisSharingProxyUrl(proxy)).toBe(true);
    expect(isArcGisSharingProxyUrl(direct)).toBe(false);
  });

  it("keeps OGC transports in a coarse origin lane without retaining endpoint paths", () => {
    const first = "https://ucbp-api.tucbs.gov.tr/secret-a";
    const second = "https://ucbp-api.tucbs.gov.tr/secret-b";

    const firstLane = providerLaneKey(first, "WMS");
    const secondLane = providerLaneKey(second, "WFS");

    expect(providerRouteClass(first, "WMS")).toBe("ogc");
    expect(firstLane).toBe(secondLane);
    expect(firstLane).toContain("https://ucbp-api.tucbs.gov.tr|ogc");
    expect(firstLane).not.toContain("secret-a");
  });

  it("falls back to non-sensitive kind lanes for malformed URLs", () => {
    expect(providerLaneKey("://bad", "MapServer")).toBe("kind:MapServer|generic");
    expect(providerRouteClass(undefined, "SceneServer")).toBe("generic");
  });
});
