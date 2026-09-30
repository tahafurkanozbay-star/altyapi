import { describe, expect, it } from "vitest";
import {
  LayerLoadScheduler,
  globalLimitFor,
  laneLimitFor,
  loadCostFor,
  loadHealthRank
} from "../src/gis/layerLoadScheduler";
import type { ServiceDefinition, ServiceKind } from "../src/types";

function service(
  id: string,
  kind: ServiceKind,
  url: string,
  overrides: Partial<ServiceDefinition> = {}
): ServiceDefinition {
  return {
    id,
    kind,
    url,
    tokenUrl: url,
    displayName: id,
    organization: "test",
    owner: "test",
    ustKurumAdi: "test",
    metaveriSahibiKurumAdi: "test",
    cografiVeriKatmanAdi: id,
    servisTuruAdi: kind,
    status: "idle",
    visible: false,
    opacity: 1,
    favorite: false,
    availability: "verified",
    access: "public-browser",
    failureCount: 0,
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("LayerLoadScheduler", () => {
  it("uses conservative global and health-aware per-lane budgets", () => {
    expect(globalLimitFor("high")).toBe(3);
    expect(globalLimitFor("balanced")).toBe(2);
    expect(globalLimitFor("eco")).toBe(1);
    expect(laneLimitFor("high", { kind: "WMS" })).toBe(1);
    expect(laneLimitFor("high", { kind: "WFS" })).toBe(1);
    expect(laneLimitFor("high", { kind: "MapServer", availability: "verified" })).toBe(2);
    expect(laneLimitFor("high", { kind: "MapServer", availability: "degraded" })).toBe(1);
    expect(laneLimitFor("high", { kind: "MapServer", verificationLatencyMs: 9_000 })).toBe(1);
    expect(laneLimitFor("balanced", { kind: "MapServer" })).toBe(1);
  });

  it("weights fresh degraded/slow/failing loads but does not hard-penalize stale runner evidence", () => {
    expect(loadHealthRank({ kind: "MapServer", availability: "verified" })).toBe(0);
    expect(loadHealthRank({ kind: "MapServer", availability: "degraded" })).toBe(2);
    expect(loadHealthRank({ kind: "MapServer", availability: "degraded", verificationStale: true })).toBe(1);
    expect(loadHealthRank({ kind: "MapServer", availability: "verified", verificationLatencyMs: 8_500 })).toBe(2);
    expect(loadHealthRank({ kind: "MapServer", availability: "verified", failureCount: 2 })).toBe(2);
    expect(loadCostFor("balanced", { kind: "MapServer", availability: "degraded" })).toBe(2);
    expect(loadCostFor("high", { kind: "MapServer", availability: "verified", latencyMs: 4_000 })).toBe(1);
    expect(loadCostFor("eco", { kind: "MapServer", availability: "unavailable" })).toBe(1);
  });

  it("lets interactive work jump ahead of queued restore work", async () => {
    const scheduler = new LayerLoadScheduler("eco");
    const gate = deferred<string>();
    const order: string[] = [];
    const a = service("a", "MapServer", "https://abb.example/arcgis/rest/services/a/MapServer");
    const b = service("b", "MapServer", "https://abb.example/arcgis/rest/services/b/MapServer");
    const c = service("c", "FeatureServer", "https://other.example/arcgis/rest/services/c/FeatureServer");

    const first = scheduler.schedule(a, "restore", async () => {
      order.push("a:start");
      const value = await gate.promise;
      order.push("a:end");
      return value;
    }, "a:cancel");
    const second = scheduler.schedule(b, "restore", async () => {
      order.push("b:start");
      return "b";
    }, "b:cancel");
    const interactive = scheduler.schedule(c, "interactive", async () => {
      order.push("c:start");
      return "c";
    }, "c:cancel");

    await tick();
    expect(order).toEqual(["a:start"]);
    gate.resolve("a");
    await expect(first).resolves.toBe("a");
    await expect(interactive).resolves.toBe("c");
    await expect(second).resolves.toBe("b");
    expect(order).toEqual(["a:start", "a:end", "c:start", "b:start"]);
  });

  it("orders healthy restore work ahead of risky restore work without reordering user actions", async () => {
    const scheduler = new LayerLoadScheduler("eco");
    const gate = deferred<string>();
    const order: string[] = [];
    const blocker = service("blocker", "FeatureServer", "https://one.example/blocker/FeatureServer");
    const risky = service("risky", "MapServer", "https://abb.example/risky/MapServer", {
      availability: "degraded",
      verificationStale: false
    });
    const healthy = service("healthy", "FeatureServer", "https://other.example/healthy/FeatureServer");

    const running = scheduler.schedule(blocker, "interactive", async () => {
      order.push("blocker:start");
      return gate.promise;
    }, "cancelled");
    const riskyRestore = scheduler.schedule(risky, "restore", async () => {
      order.push("risky:start");
      return "risky";
    }, "cancelled");
    const healthyRestore = scheduler.schedule(healthy, "restore", async () => {
      order.push("healthy:start");
      return "healthy";
    }, "cancelled");

    await tick();
    gate.resolve("blocker");
    await expect(running).resolves.toBe("blocker");
    await expect(healthyRestore).resolves.toBe("healthy");
    await expect(riskyRestore).resolves.toBe("risky");
    expect(order).toEqual(["blocker:start", "healthy:start", "risky:start"]);
  });

  it("uses weighted global cost to avoid concurrent risky provider bursts", async () => {
    const scheduler = new LayerLoadScheduler("high");
    const riskyGate = deferred<string>();
    const healthyGate = deferred<string>();
    const order: string[] = [];
    const riskyA = service("risky-a", "MapServer", "https://a.example/a/MapServer", { availability: "degraded" });
    const riskyB = service("risky-b", "MapServer", "https://b.example/b/MapServer", { failureCount: 2 });
    const healthy = service("healthy", "FeatureServer", "https://c.example/c/FeatureServer");

    const first = scheduler.schedule(riskyA, "interactive", async () => {
      order.push("risky-a:start");
      return riskyGate.promise;
    }, "cancelled");
    const secondRisky = scheduler.schedule(riskyB, "restore", async () => {
      order.push("risky-b:start");
      return "risky-b";
    }, "cancelled");
    const healthyJob = scheduler.schedule(healthy, "restore", async () => {
      order.push("healthy:start");
      return healthyGate.promise;
    }, "cancelled");

    await tick();
    expect(order).toEqual(["risky-a:start", "healthy:start"]);
    expect(scheduler.snapshot()).toMatchObject({ active: 2, activeCost: 3, queued: 1, globalLimit: 3 });

    healthyGate.resolve("healthy");
    await expect(healthyJob).resolves.toBe("healthy");
    await tick();
    expect(order).toEqual(["risky-a:start", "healthy:start"]);

    riskyGate.resolve("risky-a");
    await expect(first).resolves.toBe("risky-a");
    await expect(secondRisky).resolves.toBe("risky-b");
    expect(order).toEqual(["risky-a:start", "healthy:start", "risky-b:start"]);
  });

  it("serializes OGC work per host while allowing another host to proceed", async () => {
    const scheduler = new LayerLoadScheduler("high");
    const firstGate = deferred<string>();
    const order: string[] = [];
    const wms = service("wms", "WMS", "https://ogc.example/wms");
    const wfs = service("wfs", "WFS", "https://ogc.example/wfs");
    const other = service("other", "WMS", "https://other.example/wms");

    const first = scheduler.schedule(wms, "restore", async () => {
      order.push("wms:start");
      return firstGate.promise;
    }, "cancelled");
    const sameHost = scheduler.schedule(wfs, "interactive", async () => {
      order.push("wfs:start");
      return "wfs";
    }, "cancelled");
    const otherHost = scheduler.schedule(other, "restore", async () => {
      order.push("other:start");
      return "other";
    }, "cancelled");

    await tick();
    expect(order).toEqual(["wms:start", "other:start"]);
    await expect(otherHost).resolves.toBe("other");
    firstGate.resolve("wms");
    await expect(first).resolves.toBe("wms");
    await expect(sameHost).resolves.toBe("wfs");
    expect(order).toEqual(["wms:start", "other:start", "wfs:start"]);
  });

  it("resolves queued work with its superseded value when cancelled", async () => {
    const scheduler = new LayerLoadScheduler("eco");
    const gate = deferred<string>();
    const running = service("running", "MapServer", "https://one.example/a/MapServer");
    const queued = service("queued", "MapServer", "https://two.example/b/MapServer");

    const first = scheduler.schedule(running, "restore", () => gate.promise, "cancelled-running");
    const pending = scheduler.schedule(queued, "restore", async () => "should-not-run", "superseded");
    await tick();
    expect(scheduler.snapshot()).toMatchObject({ active: 1, activeCost: 1, queued: 1, globalLimit: 1 });
    expect(scheduler.cancel("queued")).toBe(true);
    await expect(pending).resolves.toBe("superseded");
    gate.resolve("done");
    await expect(first).resolves.toBe("done");
  });

  it("disposes queued work without interrupting already-running work", async () => {
    const scheduler = new LayerLoadScheduler("eco");
    const gate = deferred<string>();
    const a = service("a", "MapServer", "https://a.example/a/MapServer");
    const b = service("b", "MapServer", "https://b.example/b/MapServer");

    const running = scheduler.schedule(a, "restore", () => gate.promise, "a:cancelled");
    const queued = scheduler.schedule(b, "restore", async () => "b", "b:cancelled");
    scheduler.dispose();
    await expect(queued).resolves.toBe("b:cancelled");
    gate.resolve("a");
    await expect(running).resolves.toBe("a");
    await expect(scheduler.schedule(b, "interactive", async () => "late", "late:cancelled"))
      .resolves.toBe("late:cancelled");
  });
});
