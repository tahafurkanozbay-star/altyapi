import { describe, expect, it } from "vitest";
import { runtimePerformanceScore, type RuntimePerformanceSnapshot } from "../src/lib/runtimePerformance";

function snapshot(overrides: Partial<RuntimePerformanceSnapshot> = {}): RuntimePerformanceSnapshot {
  return {
    navigationMs: 1000,
    domInteractiveMs: 500,
    firstContentfulPaintMs: 800,
    largestContentfulPaintMs: 1800,
    sceneReadyMs: 2800,
    workspaceReadyMs: 4200,
    longTaskCount: 0,
    longTaskTotalMs: 0,
    ...overrides
  };
}

describe("runtime performance score", () => {
  it("keeps a fast startup at full score", () => {
    expect(runtimePerformanceScore(snapshot())).toBe(100);
  });

  it("penalizes slow startup and main-thread blocking", () => {
    const score = runtimePerformanceScore(snapshot({
      firstContentfulPaintMs: 3200,
      largestContentfulPaintMs: 5200,
      sceneReadyMs: 11000,
      workspaceReadyMs: 16000,
      longTaskCount: 12,
      longTaskTotalMs: 1800
    }));
    expect(score).toBe(0);
  });

  it("never escapes the 0-100 range when metrics are missing", () => {
    expect(runtimePerformanceScore({ longTaskCount: 0, longTaskTotalMs: 0 })).toBe(100);
    expect(runtimePerformanceScore({ longTaskCount: 200, longTaskTotalMs: 99999 })).toBe(80);
  });
});
