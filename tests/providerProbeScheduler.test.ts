import { describe, expect, it } from "vitest";
import { mapWithProviderConcurrency } from "../scripts/providerProbeScheduler";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("provider probe scheduler", () => {
  it("serializes one provider lane while independent lanes continue", async () => {
    const firstGate = deferred<void>();
    const started: string[] = [];
    const items = [
      { id: "proxy-a", lane: "abb|proxy", laneLimit: 1 },
      { id: "proxy-b", lane: "abb|proxy", laneLimit: 1 },
      { id: "direct", lane: "abb|direct", laneLimit: 2 }
    ];

    const run = mapWithProviderConcurrency(
      items,
      {
        globalLimit: 3,
        laneFor: (item) => item.lane,
        laneLimitFor: (item) => item.laneLimit
      },
      async (item) => {
        started.push(item.id);
        if (item.id === "proxy-a") await firstGate.promise;
        return item.id;
      }
    );

    await tick();
    expect(started).toEqual(["proxy-a", "direct"]);

    firstGate.resolve();
    await expect(run).resolves.toEqual(["proxy-a", "proxy-b", "direct"]);
    expect(started).toEqual(["proxy-a", "direct", "proxy-b"]);
  });

  it("preserves input result order across concurrent lanes", async () => {
    const result = await mapWithProviderConcurrency(
      ["a", "b", "c"],
      {
        globalLimit: 2,
        laneFor: (item) => item,
        laneLimitFor: () => 1
      },
      async (item, index) => `${index}:${item}`
    );

    expect(result).toEqual(["0:a", "1:b", "2:c"]);
  });
});
