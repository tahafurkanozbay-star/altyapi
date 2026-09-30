import { describe, expect, it } from "vitest";
import { LayerLoadScheduler } from "../src/gis/layerLoadScheduler";
import type { NetworkQualitySnapshot } from "../src/platform/networkQuality";
import type { ServiceDefinition } from "../src/types";

function service(id: string, host: string): ServiceDefinition {
  return {
    id,
    kind: "FeatureServer",
    url: `https://${host}/arcgis/rest/services/${id}/FeatureServer/0`,
    tokenUrl: `https://${host}/arcgis/rest/services/${id}/FeatureServer/0`,
    displayName: id,
    organization: "test",
    owner: "test",
    ustKurumAdi: "test",
    metaveriSahibiKurumAdi: "test",
    cografiVeriKatmanAdi: id,
    servisTuruAdi: "FeatureServer",
    status: "idle",
    visible: false,
    opacity: 1,
    favorite: false,
    availability: "verified",
    access: "public-browser",
    failureCount: 0
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function healthyNetwork(overrides: Partial<NetworkQualitySnapshot> = {}): NetworkQualitySnapshot {
  return {
    online: true,
    saveData: false,
    effectiveType: "4g",
    downlinkMbps: 10,
    rttMs: 50,
    hidden: false,
    ...overrides
  };
}

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("LayerLoadScheduler network admission", () => {
  it("serializes new work on Save-Data even with a high performance profile", async () => {
    const scheduler = new LayerLoadScheduler("high", () => healthyNetwork({ saveData: true }));
    const gate = deferred<string>();
    const order: string[] = [];

    const first = scheduler.schedule(service("first", "a.example"), "interactive", async () => {
      order.push("first");
      return gate.promise;
    }, "cancelled");
    const second = scheduler.schedule(service("second", "b.example"), "interactive", async () => {
      order.push("second");
      return "second";
    }, "cancelled");

    await tick();
    expect(order).toEqual(["first"]);
    expect(scheduler.snapshot()).toMatchObject({ globalLimit: 3, effectiveLimit: 1, active: 1, queued: 1 });

    gate.resolve("first");
    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(order).toEqual(["first", "second"]);
    scheduler.dispose();
  });

  it("retains the full high-profile budget on a healthy connection", () => {
    const scheduler = new LayerLoadScheduler("high", () => healthyNetwork({ downlinkMbps: 25, rttMs: 40 }));

    expect(scheduler.snapshot()).toMatchObject({ globalLimit: 3, effectiveLimit: 3 });
    scheduler.dispose();
  });

  it("holds remote work offline and resumes it immediately when connectivity returns", async () => {
    let network = healthyNetwork({ online: false });
    let notify: () => void = () => undefined;
    let unsubscribed = false;
    const scheduler = new LayerLoadScheduler(
      "high",
      () => network,
      (listener) => {
        notify = listener;
        return () => { unsubscribed = true; };
      }
    );
    const order: string[] = [];

    const result = scheduler.schedule(service("offline", "offline.example"), "interactive", async () => {
      order.push("offline");
      return "loaded";
    }, "cancelled");

    await tick();
    expect(order).toEqual([]);
    expect(scheduler.snapshot()).toMatchObject({ effectiveLimit: 0, active: 0, queued: 1 });

    network = healthyNetwork();
    notify();

    await expect(result).resolves.toBe("loaded");
    expect(order).toEqual(["offline"]);
    expect(scheduler.snapshot()).toMatchObject({ effectiveLimit: 3, queued: 0 });

    scheduler.dispose();
    expect(unsubscribed).toBe(true);
  });

  it("expands queued admission immediately when connection pressure improves", async () => {
    let network = healthyNetwork({ saveData: true });
    let notify: () => void = () => undefined;
    const scheduler = new LayerLoadScheduler(
      "high",
      () => network,
      (listener) => {
        notify = listener;
        return () => undefined;
      }
    );
    const gate = deferred<string>();
    const order: string[] = [];

    const first = scheduler.schedule(service("first", "a.example"), "interactive", async () => {
      order.push("first");
      return gate.promise;
    }, "cancelled");
    const second = scheduler.schedule(service("second", "b.example"), "interactive", async () => {
      order.push("second");
      return "second";
    }, "cancelled");

    await tick();
    expect(order).toEqual(["first"]);

    network = healthyNetwork();
    notify();
    await tick();
    expect(order).toEqual(["first", "second"]);
    await expect(second).resolves.toBe("second");

    gate.resolve("first");
    await expect(first).resolves.toBe("first");
    scheduler.dispose();
  });
});
