import { describe, expect, it } from "vitest";
import { planAtomicLayerActivation } from "../src/gis/layerActivationPlanner";
import type { ServiceDefinition } from "../src/types";

function service(patch: Partial<ServiceDefinition> = {}): ServiceDefinition {
  return {
    id: "candidate",
    displayName: "Test Katmanı",
    organization: "ABB",
    owner: "ABB",
    kind: "FeatureServer",
    url: "https://example.com/FeatureServer/0",
    tokenUrl: "https://example.com/FeatureServer/0",
    status: "idle",
    visible: false,
    opacity: 1,
    favorite: false,
    availability: "unknown",
    access: "unknown",
    failureCount: 0,
    alternateEndpoints: [],
    ustKurumAdi: "ABB",
    metaveriSahibiKurumAdi: "ABB",
    cografiVeriKatmanAdi: "Test Katmanı",
    servisTuruAdi: "FeatureServer",
    ...patch
  } as ServiceDefinition;
}

const sceneExtent = {
  xmin: 3_500_000,
  ymin: 4_700_000,
  xmax: 3_800_000,
  ymax: 5_000_000,
  spatialReference: { wkid: 3857 }
};

describe("atomic layer activation planner", () => {
  it("does nothing when provider coverage intersects and the common scale is already valid", () => {
    const candidate = service({ operationalMinScale: 500_000, operationalMaxScale: 5_000 });
    const providerExtent = {
      xmin: 32.2,
      ymin: 39.3,
      xmax: 33.4,
      ymax: 40.4,
      spatialReference: { wkid: 4326 }
    };

    expect(planAtomicLayerActivation({
      service: candidate,
      activeServices: [],
      currentScale: 100_000,
      cameraLongitude: 32.85,
      cameraLatitude: 39.92,
      viewExtent: sceneExtent,
      providerExtent,
      layerViewVisibleAtCurrentScale: true
    })).toEqual({ moved: false });
  });

  it("combines disjoint provider coverage and an invalid scale into one provider-focused move", () => {
    const candidate = service({ operationalMinScale: 400_000, recommendedScale: 200_000 });
    const providerExtent = {
      xmin: 40,
      ymin: 40,
      xmax: 41,
      ymax: 41,
      spatialReference: { wkid: 4326 }
    };

    const plan = planAtomicLayerActivation({
      service: candidate,
      activeServices: [],
      currentScale: 900_000,
      cameraLongitude: 32.85,
      cameraLatitude: 39.92,
      viewExtent: sceneExtent,
      providerExtent
    });

    expect(plan.moved).toBe(true);
    expect(plan.focus).toBe("provider-extent");
    expect(plan.reason).toBe("outside-extent");
    expect(plan.targetScale).toBeLessThan(400_000);
    expect(plan.fitProviderExtent).toBe(false);
  });

  it("fits a disjoint provider extent when the service declares no scale constraint", () => {
    const candidate = service();
    const plan = planAtomicLayerActivation({
      service: candidate,
      activeServices: [],
      currentScale: 100_000,
      viewExtent: sceneExtent,
      providerExtent: {
        xmin: 40,
        ymin: 40,
        xmax: 41,
        ymax: 41,
        spatialReference: { wkid: 4326 }
      }
    });

    expect(plan).toMatchObject({
      moved: true,
      reason: "outside-extent",
      focus: "provider-extent",
      fitProviderExtent: true
    });
    expect(plan.targetScale).toBeUndefined();
  });

  it("uses operational coverage only when loaded provider overlap is unknown", () => {
    const candidate = service({
      operationalExtent: { xmin: 32, ymin: 39, xmax: 34, ymax: 41, wkid: 4326 },
      operationalMinScale: 500_000,
      recommendedScale: 180_000
    });

    const plan = planAtomicLayerActivation({
      service: candidate,
      activeServices: [],
      currentScale: 100_000,
      cameraLongitude: 20,
      cameraLatitude: 30
    });

    expect(plan).toMatchObject({
      moved: true,
      reason: "outside-extent",
      focus: "operational-center",
      targetScale: 180_000
    });
  });

  it("prefers loaded provider intersection over a broader catalogue-envelope camera test", () => {
    const candidate = service({
      operationalExtent: { xmin: 32, ymin: 39, xmax: 34, ymax: 41, wkid: 4326 }
    });
    const providerExtent = {
      xmin: 32.2,
      ymin: 39.3,
      xmax: 33.4,
      ymax: 40.4,
      spatialReference: { wkid: 4326 }
    };

    expect(planAtomicLayerActivation({
      service: candidate,
      activeServices: [],
      currentScale: 100_000,
      cameraLongitude: 20,
      cameraLatitude: 30,
      viewExtent: sceneExtent,
      providerExtent
    })).toEqual({ moved: false });
  });

  it("uses the common active scale intersection instead of violating an already-open layer", () => {
    const openLayer = service({
      id: "open",
      operationalMinScale: 250_000,
      operationalMaxScale: 20_000
    });
    const candidate = service({
      operationalMinScale: 400_000,
      operationalMaxScale: 5_000,
      recommendedScale: 300_000
    });

    const plan = planAtomicLayerActivation({
      service: candidate,
      activeServices: [openLayer],
      currentScale: 700_000,
      cameraLongitude: 32.85,
      cameraLatitude: 39.92
    });

    expect(plan.reason).toBe("scale-too-far");
    expect(plan.focus).toBe("current-center");
    expect(plan.targetScale).toBeLessThan(250_000);
    expect(plan.targetScale).toBeGreaterThan(20_000);
  });

  it("consumes LayerView scale truth inside the same plan when provider metadata requires a correction", () => {
    const candidate = service({
      operationalMinScale: 500_000,
      operationalMaxScale: 10_000,
      recommendedScale: 120_000
    });

    expect(planAtomicLayerActivation({
      service: candidate,
      activeServices: [],
      currentScale: 200_000,
      cameraLongitude: 32.85,
      cameraLatitude: 39.92,
      layerViewVisibleAtCurrentScale: false
    })).toMatchObject({
      moved: true,
      reason: "layer-view-scale",
      focus: "current-center",
      targetScale: 120_000
    });
  });
});
