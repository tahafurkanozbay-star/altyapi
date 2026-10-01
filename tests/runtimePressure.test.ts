import { describe, expect, it } from "vitest";
import { classifyRuntimePressure } from "../src/platform/runtimePressure";

describe("runtime pressure", () => {
  it("keeps an idle main thread normal", () => {
    expect(classifyRuntimePressure([], 5_000)).toMatchObject({
      level: "normal",
      longTaskCount: 0,
      blockingTimeMs: 0
    });
  });

  it("classifies repeated long tasks as busy", () => {
    const snapshot = classifyRuntimePressure([
      { startTime: 4_100, duration: 90 },
      { startTime: 4_500, duration: 90 }
    ], 5_000);
    expect(snapshot.level).toBe("busy");
    expect(snapshot.longTaskCount).toBe(2);
  });

  it("classifies a severe long task as critical", () => {
    const snapshot = classifyRuntimePressure([
      { startTime: 4_500, duration: 300 }
    ], 5_000);
    expect(snapshot.level).toBe("critical");
    expect(snapshot.maxLongTaskMs).toBe(300);
  });

  it("drops stale samples outside the rolling window", () => {
    const snapshot = classifyRuntimePressure([
      { startTime: 100, duration: 600 },
      { startTime: 9_900, duration: 60 }
    ], 10_000);
    expect(snapshot.level).toBe("normal");
    expect(snapshot.longTaskCount).toBe(1);
  });
});
