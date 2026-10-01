import { describe, expect, it } from "vitest";
import {
  extractWmsGeographicExtent,
  extractWmsScaleProfile,
  inspectOgcCapabilities
} from "../src/lib/ogcCapabilities";

const WMS = `<?xml version="1.0"?>
<wms:WMS_Capabilities xmlns:wms="http://www.opengis.net/wms" version="1.3.0">
  <wms:Capability><wms:Layer>
    <wms:EX_GeographicBoundingBox>
      <wms:westBoundLongitude>30</wms:westBoundLongitude>
      <wms:eastBoundLongitude>35</wms:eastBoundLongitude>
      <wms:southBoundLatitude>38</wms:southBoundLatitude>
      <wms:northBoundLatitude>42</wms:northBoundLatitude>
    </wms:EX_GeographicBoundingBox>
    <wms:Layer>
      <wms:EX_GeographicBoundingBox>
        <wms:westBoundLongitude>31.6</wms:westBoundLongitude>
        <wms:eastBoundLongitude>33.5</wms:eastBoundLongitude>
        <wms:southBoundLatitude>39</wms:southBoundLatitude>
        <wms:northBoundLatitude>40.6</wms:northBoundLatitude>
      </wms:EX_GeographicBoundingBox>
      <wms:MinScaleDenominator>2500</wms:MinScaleDenominator>
      <wms:MaxScaleDenominator>400000</wms:MaxScaleDenominator>
    </wms:Layer>
  </wms:Layer></wms:Capability>
</wms:WMS_Capabilities>`;

describe("pure OGC capabilities inspection", () => {
  it("extracts version, ArcGIS scale semantics and the most specific WGS84 coverage", () => {
    expect(inspectOgcCapabilities(WMS, "WMS")).toMatchObject({
      valid: true,
      exception: false,
      capabilityVersion: "1.3.0",
      scaleProfile: { minScale: 400000, maxScale: 2500 },
      geographicExtent: { xmin: 31.6, ymin: 39, xmax: 33.5, ymax: 40.6, wkid: 4326 }
    });
  });

  it("accepts a namespaced WFS root without inventing render metadata", () => {
    const result = inspectOgcCapabilities(
      '<wfs:WFS_Capabilities xmlns:wfs="http://www.opengis.net/wfs/2.0" version="2.0.0"></wfs:WFS_Capabilities>',
      "WFS"
    );
    expect(result).toEqual({ valid: true, exception: false, capabilityVersion: "2.0.0" });
  });

  it("marks OGC exception documents invalid even when capability-like text is present", () => {
    const result = inspectOgcCapabilities(
      '<WMS_Capabilities version="1.3.0"><ExceptionReport><ExceptionText>denied</ExceptionText></ExceptionReport></WMS_Capabilities>',
      "WMS"
    );
    expect(result.valid).toBe(false);
    expect(result.exception).toBe(true);
  });

  it("rejects contradictory scales and impossible geographic envelopes", () => {
    expect(extractWmsScaleProfile(
      '<WMS_Capabilities><MinScaleDenominator>500000</MinScaleDenominator><MaxScaleDenominator>1000</MaxScaleDenominator></WMS_Capabilities>'
    )).toBeUndefined();
    expect(extractWmsGeographicExtent(
      '<WMS_Capabilities><EX_GeographicBoundingBox><westBoundLongitude>181</westBoundLongitude><eastBoundLongitude>190</eastBoundLongitude><southBoundLatitude>39</southBoundLatitude><northBoundLatitude>40</northBoundLatitude></EX_GeographicBoundingBox></WMS_Capabilities>'
    )).toBeUndefined();
  });
});
