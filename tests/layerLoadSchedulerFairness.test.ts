import { describe, expect, it } from "vitest";
import { LayerLoadScheduler, agedPriority } from "../src/gis/layerLoadScheduler";
import type { ServiceDefinition, ServiceKind } from "../src/types";
import type { NetworkQualitySnapshot } from "../src/platform/networkQuality";
import type { ServiceFailureClass } from "../src/lib/serviceRuntime";

type TestLoadResult = {
  ok: boolean;
  superseded?: boolean;
  durationMs?: number;
  failureClass?: ServiceFailureClass;
  error?: string;
};

const CANCELLED: TestLoadResult = { ok: true, superseded: true };
const ONLINE: NetworkQualitySnapshot = {
  online: true,
  saveData: false,
  hidden: false,
  effectiveType: "4g",
  downlinkMbps: 25,
  rttMs: 40
};

function service(
  id: string,
  kind: ServiceKind = "MapServer",
  url = `https://${id}.example/arcgis/rest/services/${id}/MapServer`,
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
  await Promise.resolve();
}

function timeoutFailure(): TestLoadResult {
  return {
    ok: false,
    failureClass: "timeout",
    error: "Servis zaman aşımına uğradı.",
    durationMs: 9_000
  };
}

function success(durationMs = 250): TestLoadResult {
  return { ok: true, durationMs };
}

describe("LayerLoadScheduler v39 fairness", () => {
  it("promotes retry and restore work after bounded waits", () => {
    expect(agedPriority({ priority: 0, enqueuedAt: 0 }, 60_000)).toBe(0);
    expect(agedPriority({ priority: 1, enqueuedAt: 0 }, 14_999)).toBe(1);
    expect(agedPriority({ priority: 1, enqueuedAt: 0 }, 15_000)).toBe(0);
    expect(agedPriority({ priority: 2, enqueuedAt: 0 }, 11_999)).toBe(2);
    expect(agedPriority({ priority: 2, enqueuedAt: 0 }, 12_000)).toBe(1);
    expect(agedPriority({ priority: 2, enqueuedAt: 0 }, 30_000)).toBe(0);
  });

  it("prevents an old restore from starving behind a later interactive request", async () => {
    let now = 0;
    const scheduler = new LayerLoadScheduler("eco", () => ONLINE, () => () => undefined, () => now);
    const gate = deferred<string>();
    const order: string[] = [];

    const blocker = scheduler.schedule(service("blocker"), "interactive", async () => {
      order.push("blocker");
      return gate.promise;
    }, "cancelled");
    const restore = scheduler.schedule(service("restore"), "restore", async () => {
      order.push("restore");
      return "restore";
    }, "cancelled");

    now = 31_000;
    const interactive = scheduler.schedule(service("interactive"), "interactive", async () => {
      order.push("interactive");
      return "interactive";
    }, "cancelled");

    expect(scheduler.snapshot()).toMatchObject({
      queued: 2,
      oldestQueuedMs: 31_000,
      agedQueued: 1
    });

    gate.resolve("done");
    await expect(blocker).resolves.toBe("done");
    await expect(restore).resolves.toBe("restore");
    await expect(interactive).resolves.toBe("interactive");
    expect(order).toEqual(["blocker", "restore", "interactive"]);
    scheduler.dispose();
  });

  it("runs a risky two-unit load alone when live network capacity falls to one", async () => {
    const constrained: NetworkQualitySnapshot = {
      ...ONLINE,
      saveData: true,
      effectiveType: "2g",
      downlinkMbps: 0.5,
      rttMs: 1_200
    };
    const scheduler = new LayerLoadScheduler("balanced", () => constrained, () => () => undefined);
    const risky = service("risky", "MapServer", undefined, { availability: "degraded" });
    const order: string[] = [];

    const pending = scheduler.schedule(risky, "restore", async () => {
      order.push("risky:start");
      return "ok";
    }, "cancelled");

    await expect(pending).resolves.toBe("ok");
    expect(order).toEqual(["risky:start"]);
    expect(scheduler.snapshot()).toMatchObject({ effectiveLimit: 1, queued: 0 });
    scheduler.dispose();
  });

  it("gives the oldest queued sibling ownership of the half-open provider probe", async () => {
    let now = 1_000;
    let wake: () => void = () => undefined;
    const scheduler = new LayerLoadScheduler(
      "eco",
      () => ONLINE,
      (listener) => {
        wake = listener;
        return () => undefined;
      },
      () => now
    );
    const base = "https://probe.example/arcgis/rest/services";
    const fail1 = service("fail-1", "MapServer", `${base}/a/MapServer`);
    const fail2 = service("fail-2", "MapServer", `${base}/b/MapServer`);
    const oldRestore = service("old-restore", "MapServer", `${base}/c/MapServer`);
    const newInteractive = service("new-interactive", "MapServer", `${base}/d/MapServer`);
    const probeGate = deferred<TestLoadResult>();
    const order: string[] = [];

    await scheduler.schedule<TestLoadResult>(fail1, "interactive", async () => timeoutFailure(), CANCELLED);
    await tick();
    await scheduler.schedule<TestLoadResult>(fail2, "interactive", async () => timeoutFailure(), CANCELLED);
    await tick();
    expect(scheduler.snapshot().providerCircuitsOpen).toBe(1);

    const oldPending = scheduler.schedule<TestLoadResult>(oldRestore, "restore", async () => {
      order.push("old:start");
      return probeGate.promise;
    }, CANCELLED);
    const newPending = scheduler.schedule<TestLoadResult>(newInteractive, "interactive", async () => {
      order.push("new:start");
      return success();
    }, CANCELLED);

    now += 4_001;
    wake();
    await tick();
    expect(order).toEqual(["old:start"]);
    expect(scheduler.snapshot().providerHalfOpenProbes).toBe(1);

    probeGate.resolve(success());
    await expect(oldPending).resolves.toMatchObject({ ok: true });
    await expect(newPending).resolves.toMatchObject({ ok: true });
    expect(order).toEqual(["old:start", "new:start"]);
    scheduler.dispose();
  });
});
