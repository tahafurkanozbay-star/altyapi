import { describe, expect, it } from "vitest";
import { LayerLoadScheduler, agedPriority } from "../src/gis/layerLoadScheduler";
import type { ServiceDefinition } from "../src/types";
import type { NetworkQualitySnapshot } from "../src/platform/networkQuality";

function service(id: string, url: string): ServiceDefinition {
  return {
    id,
    kind: "MapServer",
    url,
    tokenUrl: url,
    displayName: id,
    organization: "test",
    owner: "test",
    ustKurumAdi: "test",
    metaveriSahibiKurumAdi: "test",
    cografiVeriKatmanAdi: id,
    servisTuruAdi: "MapServer",
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

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

const ONLINE: NetworkQualitySnapshot = {
  online: true,
  saveData: false,
  hidden: false
};

describe("LayerLoadScheduler aging", () => {
  it("promotes retry and restore work after bounded waits", () => {
    expect(agedPriority({ priority: 0, enqueuedAt: 0 }, 60_000)).toBe(0);
    expect(agedPriority({ priority: 1, enqueuedAt: 0 }, 14_999)).toBe(1);
    expect(agedPriority({ priority: 1, enqueuedAt: 0 }, 15_000)).toBe(0);
    expect(agedPriority({ priority: 2, enqueuedAt: 0 }, 11_999)).toBe(2);
    expect(agedPriority({ priority: 2, enqueuedAt: 0 }, 12_000)).toBe(1);
    expect(agedPriority({ priority: 2, enqueuedAt: 0 }, 30_000)).toBe(0);
  });

  it("lets an old restore job run before a newer interactive job once starvation threshold is reached", async () => {
    let now = 0;
    const scheduler = new LayerLoadScheduler("eco", () => ONLINE, () => () => undefined, () => now);
    const blockerGate = deferred<string>();
    const order: string[] = [];

    const blocker = scheduler.schedule(
      service("blocker", "https://one.example/blocker/MapServer"),
      "interactive",
      async () => {
        order.push("blocker");
        return blockerGate.promise;
      },
      "cancelled"
    );
    const restore = scheduler.schedule(
      service("restore", "https://two.example/restore/MapServer"),
      "restore",
      async () => {
        order.push("restore");
        return "restore";
      },
      "cancelled"
    );

    now = 31_000;
    const interactive = scheduler.schedule(
      service("interactive", "https://three.example/interactive/MapServer"),
      "interactive",
      async () => {
        order.push("interactive");
        return "interactive";
      },
      "cancelled"
    );

    await tick();
    expect(order).toEqual(["blocker"]);
    blockerGate.resolve("done");
    await expect(blocker).resolves.toBe("done");
    await expect(restore).resolves.toBe("restore");
    await expect(interactive).resolves.toBe("interactive");
    expect(order).toEqual(["blocker", "restore", "interactive"]);
  });

  it("reports offline admission pauses and wakes queued work from the network subscription", async () => {
    let now = 10_000;
    let network: NetworkQualitySnapshot = { ...ONLINE, online: false };
    let wake: (() => void) | undefined;
    const scheduler = new LayerLoadScheduler(
      "balanced",
      () => network,
      (listener) => {
        wake = listener;
        return () => { wake = undefined; };
      },
      () => now
    );
    const order: string[] = [];
    const pending = scheduler.schedule(
      service("queued", "https://one.example/queued/MapServer"),
      "interactive",
      async () => {
        order.push("started");
        return "ok";
      },
      "cancelled"
    );

    now = 12_500;
    expect(scheduler.diagnostics()).toMatchObject({
      active: 0,
      queued: 1,
      effectiveLimit: 0,
      pausedByNetwork: true,
      oldestQueuedMs: 2_500
    });
    expect(order).toEqual([]);

    network = ONLINE;
    wake?.();
    await expect(pending).resolves.toBe("ok");
    expect(order).toEqual(["started"]);
    expect(scheduler.diagnostics()).toMatchObject({ queued: 0, pausedByNetwork: false });
  });
});
