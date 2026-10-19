import { describe, expect, it } from "vitest";
import {
  publishRuntimeEvent,
  runtimeEventSubscriberCount,
  subscribeRuntimeEvent
} from "../src/platform/runtimeEvents";

describe("typed runtime event bus", () => {
  it("delivers explicit setup requests and detaches idempotently", () => {
    const received: string[] = [];
    const before = runtimeEventSubscriberCount("tucbs-access-setup-requested");
    const detach = subscribeRuntimeEvent("tucbs-access-setup-requested", () => {
      received.push("setup-requested");
    });

    expect(runtimeEventSubscriberCount("tucbs-access-setup-requested")).toBe(before + 1);
    publishRuntimeEvent("tucbs-access-setup-requested", {});
    expect(received).toEqual(["setup-requested"]);

    detach();
    detach();
    expect(runtimeEventSubscriberCount("tucbs-access-setup-requested")).toBe(before);
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
