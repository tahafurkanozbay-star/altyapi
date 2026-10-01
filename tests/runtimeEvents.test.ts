import { describe, expect, it } from "vitest";
import {
  publishRuntimeEvent,
  runtimeEventSubscriberCount,
  subscribeRuntimeEvent
} from "../src/platform/runtimeEvents";

describe("typed runtime event bus", () => {
  it("delivers typed payloads and detaches idempotently", () => {
    const received: string[] = [];
    const before = runtimeEventSubscriberCount("tucbs-access-required");
    const detach = subscribeRuntimeEvent("tucbs-access-required", (detail) => {
      received.push(`${detail.serviceId}:${detail.kind}`);
    });

    expect(runtimeEventSubscriberCount("tucbs-access-required")).toBe(before + 1);
    publishRuntimeEvent("tucbs-access-required", {
      serviceId: "gas-wms",
      serviceName: "Doğalgaz",
      kind: "WMS"
    });
    expect(received).toEqual(["gas-wms:WMS"]);

    detach();
    detach();
    expect(runtimeEventSubscriberCount("tucbs-access-required")).toBe(before);
  });

  it("isolates event channels", () => {
    let activations = 0;
    const detach = subscribeRuntimeEvent("atomic-layer-activation-complete", () => {
      activations += 1;
    });

    publishRuntimeEvent("layer-render-health", {
      phase: "stable",
      layerId: "svc-demo",
      serviceId: "demo"
    });
    expect(activations).toBe(0);

    publishRuntimeEvent("atomic-layer-activation-complete", { layerId: "svc-demo" });
    expect(activations).toBe(1);
    detach();
  });
});
