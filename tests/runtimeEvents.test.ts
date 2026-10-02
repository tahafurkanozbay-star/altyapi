import { describe, expect, it, vi } from "vitest";
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

  it("keeps delivering when one subscriber throws", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const received: string[] = [];
    const detachBroken = subscribeRuntimeEvent("pwa-update-available", () => {
      throw new Error("consumer failed");
    });
    const detachHealthy = subscribeRuntimeEvent("pwa-update-available", (detail) => {
      received.push(detail.source);
    });

    expect(() => publishRuntimeEvent("pwa-update-available", { source: "installed" })).not.toThrow();
    expect(received).toEqual(["installed"]);
    expect(errorSpy).toHaveBeenCalledOnce();

    detachBroken();
    detachHealthy();
    errorSpy.mockRestore();
  });
});