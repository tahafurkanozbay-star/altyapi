import { describe, expect, it } from "vitest";
import { LayerLoadScheduler, providerCircuitCooldownMs } from "../src/gis/layerLoadScheduler";
import type { ServiceDefinition, ServiceKind } from "../src/types";
import type { NetworkQualitySnapshot } from "../src/platform/networkQuality";

function service(id: string, kind: ServiceKind, url: string): ServiceDefinition {
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
  await Promise.resolve();
}

function controlledScheduler(profile: "eco" | "balanced" | "high" = "eco") {
  let now = 1_000;
  let notify = () => undefined;
  const quality: NetworkQualitySnapshot = {
    online: true,
    saveData: false,
    hidden: false,
    effectiveType: "4g",
    downlinkMbps: 25,
    rttMs: 40
  };
  const scheduler = new LayerLoadScheduler(
    profile,
    () => quality,
    (listener) => {
      notify = listener;
      return () => undefined;
    },
    () => now
  );
  return {
    scheduler,
    advance(ms: number) { now += ms; },
    notify() { notify(); },
    setOnline(value: boolean) { quality.online = value; }
  };
}

const timeoutFailure = () => ({
  ok: false as const,
  failureClass: "timeout" as const,
  error: "Servis zaman aşımına uğradı.",
  durationMs: 9_000
});

const authFailure = () => ({
  ok: false as const,
  failureClass: "authorization" as const,
  error: "403 Forbidden",
  durationMs: 250
});

const success = (durationMs = 250) => ({ ok: true as const, durationMs });

describe("provider-local layer load circuit breaker", () => {
  it("uses bounded exponential cooldowns after repeated transient failures", () => {
    expect(providerCircuitCooldownMs(0)).toBe(0);
    expect(providerCircuitCooldownMs(1)).toBe(0);
    expect(providerCircuitCooldownMs(2)).toBe(4_000);
    expect(providerCircuitCooldownMs(3)).toBe(8_000);
    expect(providerCircuitCooldownMs(4)).toBe(16_000);
    expect(providerCircuitCooldownMs(8)).toBe(24_000);
  });

  it("opens only the failing provider while another provider keeps flowing", async () => {
    const { scheduler } = controlledScheduler("eco");
    const a1 = service("a1", "MapServer", "https://bad.example/arcgis/a/MapServer");
    const a2 = service("a2", "MapServer", "https://bad.example/arcgis/b/MapServer");
    const a3 = service("a3", "MapServer", "https://bad.example/arcgis/c/MapServer");
    const other = service("other", "FeatureServer", "https://good.example/arcgis/other/FeatureServer");
    const order: string[] = [];

    await scheduler.schedule(a1, "interactive", async () => timeoutFailure(), { ok: true, superseded: true });
    await tick();
    await scheduler.schedule(a2, "interactive", async () => timeoutFailure(), { ok: true, superseded: true });
    await tick();
    expect(scheduler.snapshot().providerCircuitsOpen).toBe(1);

    const blocked = scheduler.schedule(a3, "interactive", async () => {
      order.push("bad:start");
      return success();
    }, { ok: true, superseded: true });
    const healthy = scheduler.schedule(other, "interactive", async () => {
      order.push("good:start");
      return success();
    }, { ok: true, superseded: true });

    await expect(healthy).resolves.toMatchObject({ ok: true });
    expect(order).toEqual(["good:start"]);
    scheduler.dispose();
    await expect(blocked).resolves.toMatchObject({ superseded: true });
  });

  it("does not poison sibling layers for authorization failures", async () => {
    const { scheduler } = controlledScheduler("eco");
    const a1 = service("auth-1", "MapServer", "https://secured.example/a/MapServer");
    const a2 = service("auth-2", "MapServer", "https://secured.example/b/MapServer");
    const a3 = service("auth-3", "MapServer", "https://secured.example/c/MapServer");
    const order: string[] = [];

    await scheduler.schedule(a1, "interactive", async () => authFailure(), { ok: true, superseded: true });
    await tick();
    await scheduler.schedule(a2, "interactive", async () => authFailure(), { ok: true, superseded: true });
    await tick();
    expect(scheduler.snapshot().providerCircuitsOpen).toBe(0);

    const third = scheduler.schedule(a3, "interactive", async () => {
      order.push("third:start");
      return success();
    }, { ok: true, superseded: true });
    await expect(third).resolves.toMatchObject({ ok: true });
    expect(order).toEqual(["third:start"]);
    scheduler.dispose();
  });

  it("admits exactly one half-open probe after cooldown and resumes siblings after success", async () => {
    const controlled = controlledScheduler("high");
    const { scheduler } = controlled;
    const a1 = service("probe-fail-1", "MapServer", "https://probe.example/a/MapServer");
    const a2 = service("probe-fail-2", "MapServer", "https://probe.example/b/MapServer");
    const a3 = service("probe-1", "MapServer", "https://probe.example/c/MapServer");
    const a4 = service("probe-2", "MapServer", "https://probe.example/d/MapServer");
    const gate = deferred<ReturnType<typeof success>>();
    const order: string[] = [];

    await scheduler.schedule(a1, "interactive", async () => timeoutFailure(), { ok: true, superseded: true });
    await tick();
    await scheduler.schedule(a2, "interactive", async () => timeoutFailure(), { ok: true, superseded: true });
    await tick();

    const firstProbe = scheduler.schedule(a3, "interactive", async () => {
      order.push("probe-1:start");
      return gate.promise;
    }, { ok: true, superseded: true });
    const secondProbe = scheduler.schedule(a4, "interactive", async () => {
      order.push("probe-2:start");
      return success();
    }, { ok: true, superseded: true });

    controlled.advance(4_001);
    controlled.notify();
    await tick();
    expect(order).toEqual(["probe-1:start"]);
    expect(scheduler.snapshot().providerHalfOpenProbes).toBe(1);

    gate.resolve(success());
    await expect(firstProbe).resolves.toMatchObject({ ok: true });
    await expect(secondProbe).resolves.toMatchObject({ ok: true });
    expect(order).toEqual(["probe-1:start", "probe-2:start"]);
    expect(scheduler.snapshot().providerCircuitsOpen).toBe(0);
    scheduler.dispose();
  });

  it("reduces high-profile same-provider concurrency after a slow successful load", async () => {
    const { scheduler } = controlledScheduler("high");
    const warmup = service("slow-warmup", "MapServer", "https://slow.example/a/MapServer");
    const slowA = service("slow-a", "MapServer", "https://slow.example/b/MapServer");
    const slowB = service("slow-b", "MapServer", "https://slow.example/c/MapServer");
    const other = service("fast-other", "MapServer", "https://fast.example/a/MapServer");
    const slowGate = deferred<ReturnType<typeof success>>();
    const otherGate = deferred<ReturnType<typeof success>>();
    const order: string[] = [];

    await scheduler.schedule(warmup, "interactive", async () => success(8_000), { ok: true, superseded: true });
    await tick();

    const firstSlow = scheduler.schedule(slowA, "interactive", async () => {
      order.push("slow-a:start");
      return slowGate.promise;
    }, { ok: true, superseded: true });
    const secondSlow = scheduler.schedule(slowB, "interactive", async () => {
      order.push("slow-b:start");
      return success();
    }, { ok: true, superseded: true });
    const otherLoad = scheduler.schedule(other, "interactive", async () => {
      order.push("other:start");
      return otherGate.promise;
    }, { ok: true, superseded: true });

    await tick();
    expect(order).toEqual(["slow-a:start", "other:start"]);
    slowGate.resolve(success());
    otherGate.resolve(success());
    await expect(firstSlow).resolves.toMatchObject({ ok: true });
    await expect(otherLoad).resolves.toMatchObject({ ok: true });
    await expect(secondSlow).resolves.toMatchObject({ ok: true });
    expect(order).toEqual(["slow-a:start", "other:start", "slow-b:start"]);
    scheduler.dispose();
  });

  it("does not count explicit user cancellation as provider failure", async () => {
    const { scheduler } = controlledScheduler("eco");
    const current = service("cancel-current", "MapServer", "https://cancel.example/a/MapServer");
    const next = service("cancel-next", "MapServer", "https://cancel.example/b/MapServer");
    const gate = deferred<ReturnType<typeof timeoutFailure>>();
    const order: string[] = [];

    const running = scheduler.schedule(current, "interactive", () => gate.promise, { ok: true, superseded: true });
    await tick();
    expect(scheduler.cancel(current.id)).toBe(true);
    gate.resolve(timeoutFailure());
    await expect(running).resolves.toMatchObject({ ok: false });
    await tick();
    expect(scheduler.snapshot().providerCircuitsOpen).toBe(0);

    const subsequent = scheduler.schedule(next, "interactive", async () => {
      order.push("next:start");
      return success();
    }, { ok: true, superseded: true });
    await expect(subsequent).resolves.toMatchObject({ ok: true });
    expect(order).toEqual(["next:start"]);
    scheduler.dispose();
  });

  it("does not open a provider circuit when the browser itself is offline", async () => {
    const controlled = controlledScheduler("eco");
    const { scheduler } = controlled;
    const first = service("offline-1", "MapServer", "https://offline.example/a/MapServer");
    const second = service("offline-2", "MapServer", "https://offline.example/b/MapServer");

    const p1 = scheduler.schedule(first, "interactive", async () => timeoutFailure(), { ok: true, superseded: true });
    await tick();
    controlled.setOnline(false);
    await expect(p1).resolves.toMatchObject({ ok: false });
    controlled.setOnline(true);
    controlled.notify();
    await scheduler.schedule(second, "interactive", async () => success(), { ok: true, superseded: true });
    expect(scheduler.snapshot().providerCircuitsOpen).toBe(0);
    scheduler.dispose();
  });
});
